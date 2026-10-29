const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8'),strip=f=>read(f).replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
const c={};vm.createContext(c);for(const file of ['school-data.js','school-directory.js','international-court.js'])vm.runInContext(strip(file),c);
const school={name:'Synthetic School',countryCode:'TR',active:true},snap=data=>({exists:()=>!!data,data:()=>data});
function directory(initial){let current=true;const records=new Map(Object.entries(initial)),writes=[];return {records,writes,stop:()=>{current=false},current:()=>current,schoolRef:id=>'schools/'+id,publicRef:id=>'publicSchools/'+id,run:fn=>fn({get:async ref=>snap(records.get(ref)),set:(ref,data)=>{writes.push(['set',ref,data]);records.set(ref,data)},delete:ref=>{writes.push(['delete',ref]);records.delete(ref)}})}}
test('private school saves never automatically publish existing or new schools',async()=>{
 const a=directory({'schools/a':school});await c.saveDirectorySchool('a',{...school,name:'Renamed'},a);await c.saveDirectorySchool('b',school,a);assert.deepEqual([...a.records.keys()],['schools/a','schools/b']);
});
test('explicit publication copies exactly name/country; removal preserves private school and student records',async()=>{
 const a=directory({'schools/a':school,'students/private-student':{schoolId:'a',publicSchool:false}});await c.publishDirectorySchool('a',school,true,a);assert.deepEqual(Object.keys(a.records.get('publicSchools/a')).sort(),['countryCode','name']);await c.publishDirectorySchool('a',school,false,a);assert.equal(a.records.has('publicSchools/a'),false);assert.equal(a.records.get('students/private-student').publicSchool,false);assert.equal(a.records.get('schools/a').name,school.name);
});
test('published school rename/country edit synchronizes, deactivation removes, reactivation does not republish',async()=>{
 const a=directory({'schools/a':school,'publicSchools/a':{name:school.name,countryCode:'TR'}});await c.saveDirectorySchool('a',{...school,name:'New Name',countryCode:'GR'},a);assert.equal(a.records.get('publicSchools/a').name,'New Name');assert.equal(a.records.get('publicSchools/a').countryCode,'GR');await c.saveDirectorySchool('a',{...school,active:false},a);assert.equal(a.records.has('publicSchools/a'),false);await c.saveDirectorySchool('a',school,a);assert.equal(a.records.has('publicSchools/a'),false);
});
test('inactive, stale, missing and changed-session publication fail without writes',async()=>{
 for(const data of [null,{...school,active:false},{...school,name:'Changed'}]){const a=directory(data?{'schools/a':data}:{});await assert.rejects(c.publishDirectorySchool('a',school,true,a));assert.equal(a.writes.length,0)}
 const a=directory({'schools/a':school});a.stop();await assert.rejects(c.publishDirectorySchool('a',school,true,a),/session changed/);await assert.rejects(c.saveDirectorySchool('a',school,a),/session changed/);assert.equal(a.writes.length,0);
});
const docs=names=>names.map(([name,countryCode])=>({data:()=>({name,countryCode})}));
test('country and school counts come only from approved public documents and retain all names',()=>{
 const summary=c.summarizePublicSchools(docs([['Z School','TR'],['A School','TR'],['Greek School','GR']]));assert.equal(summary.schools,3);assert.equal(summary.countries,2);assert.equal(summary.groups.TR.join(','),'A School,Z School');assert.equal(summary.groups.RO.length,0);assert.equal(c.summarizePublicSchools([]).countries,0);
});
for(const bad of [{name:'',countryCode:'TR'},{name:'x',countryCode:'US'},{name:'x',countryCode:'TR',studentId:'private'},{name:'x',countryCode:'__proto__'},{name:'x'.repeat(161),countryCode:'GR'}])test('malformed public projection fails closed '+JSON.stringify(bad).slice(0,45),()=>assert.throws(()=>c.summarizePublicSchools([{data:()=>bad}])));
function publicUI(){let counter=0;const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,{children:[],textContent:'',handlers:{},append(...items){this.children.push(...items)},replaceChildren(){this.children=[]},addEventListener(k,fn){this.handlers[k]=fn}});return nodes.get(id)};const ctx={document:{getElementById:get,createElement:tag=>get(tag+ ++counter)}};vm.createContext(ctx);for(const file of ['school-data.js','international-court.js'])vm.runInContext(strip(file),ctx);return {ctx,get}}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('empty directory shows truthful zeros without empty country cards; public trial count includes all phases',async()=>{
 const h=publicUI();h.ctx.setupInternationalCourt({schools:async()=>({docs:[]}),trials:async()=>({docs:[{},{},{}]})});await tick();assert.equal(h.get('international-schools').textContent,0);assert.equal(h.get('international-cards').children.length,0);assert.equal(h.get('international-trials').textContent,3);assert.match(h.get('international-directory-status').textContent,/after administrator approval/);
});
test('independent load failures show unavailable rather than invented zeros and refresh can recover',async()=>{
 const h=publicUI();let fail=true;const view=h.ctx.setupInternationalCourt({schools:async()=>{if(fail)throw Error();return {docs:docs([['School','RO']])}},trials:async()=>{throw Error()}});await tick();assert.equal(h.get('international-schools').textContent,'—');assert.equal(h.get('international-trials').textContent,'—');assert.match(h.get('international-directory-status').textContent,/unavailable/);fail=false;await view.load();assert.equal(h.get('international-schools').textContent,1);assert.equal(h.get('international-trials').textContent,'—');assert.equal(h.get('international-cards').children.length,1);
});
test('late public reads cannot replace a newer refresh',async()=>{
 const h=publicUI();let release,calls=0;const view=h.ctx.setupInternationalCourt({schools:()=>++calls===1?new Promise(resolve=>{release=resolve}):Promise.resolve({docs:[]}),trials:async()=>({docs:[]})});await view.load();release({docs:docs([['Outdated School','TR']])});await tick();assert.equal(h.get('international-schools').textContent,0);assert.equal(h.get('international-cards').children.length,0);
});
test('homepage reads exactly the public projection and trials through the isolated shared initializer',()=>{
 const text=read('international-client.js');assert.match(text,/initializeFirebaseClient/);assert.deepEqual([...text.matchAll(/collection\(db,'([^']+)'\)/g)].map(x=>x[1]),['publicSchools','trials']);assert.doesNotMatch(text,/students|votes|assignments|reasoningReviews|attributions/);const {PUBLIC_FILES}=require('../scripts/prepare-site.cjs');for(const file of ['school-directory.js','international-court.js','international-client.js'])assert.ok(PUBLIC_FILES.includes(file));
});
