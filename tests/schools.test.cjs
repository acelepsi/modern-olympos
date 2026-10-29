const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8'),source=file=>read(file).replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];\n/gm,'').replace(/^export /gm,'');
const c={};vm.createContext(c);vm.runInContext(source('school-data.js'),c);
const school={name:'Synthetic School',countryCode:'RO',active:true},snapshot=data=>({exists:()=>!!data,data:()=>data});
for(const countryCode of ['TR','RO','GR'])test('school and flag mapping '+countryCode,()=>{assert.equal(c.validateSchool({...school,countryCode}).countryCode,countryCode);const data=vm.runInContext(`COUNTRIES.${countryCode}`,c);assert.match(read(data.flag),/<svg/);assert.ok(data.name)});
for(const fields of [{name:''},{name:'x'.repeat(161)},{countryCode:'US'},{countryCode:'__proto__'},{active:'yes'}])test('invalid school '+JSON.stringify(fields).slice(0,40),()=>assert.throws(()=>c.validateSchool({...school,...fields})));
function api(extra={}){const writes=[];return {writes,current:()=>true,newToken:()=> 'ABCDEFGHIJKLMNOPQRST',read:async parts=>snapshot(parts[0]==='students'?{accountType:'student',schoolId:'school-a'}:school),assign:async(uid,data)=>writes.push(['profile',uid,data]),trials:async()=>[{id:'case-a'}],submissions:async()=>[{id:'pub',status:'published',section:'prosecution'},{id:'draft',status:'draft',section:'defense'},{id:'jury',status:'published',section:'jury'}],removeCopy:async(...args)=>writes.push(['remove',...args]),copy:async(...args)=>writes.push(['copy',...args]),enable:async(...args)=>writes.push(['enable',...args]),...extra}}
test('private assignment is optional and never prepares public labels by default',async()=>{
 const a=api();await c.saveSchoolAffiliation('private-uid','',false,a);assert.equal(a.writes[0][2].publicSchool,false);assert.ok(a.writes.every(item=>!['copy','enable'].includes(item[0])));
});
test('public consent is disabled first, copies only published arguments with no identifiers, then enables last',async()=>{
 const a=api();const result=await c.saveSchoolAffiliation('private-uid','school-a',true,a);assert.equal(result.count,1);assert.deepEqual(a.writes.map(item=>item[0]),['profile','remove','copy','enable']);assert.equal(a.writes[0][2].publicSchool,false);assert.deepEqual(Object.keys(a.writes[2][3]).sort(),['countryCode','schoolName']);assert.doesNotMatch(JSON.stringify(a.writes[2]),/private-uid|schoolId|token/);
});
test('partial copy failure or stale context never enables public consent',async()=>{
 const a=api({copy:async()=>{throw Error('Denied')}});await assert.rejects(c.saveSchoolAffiliation('uid','school-a',true,a),/Denied/);assert.equal(a.writes[0][2].publicSchool,false);assert.ok(a.writes.every(item=>item[0]!=='enable'));
 let active=true;const b=api({current:()=>active,copy:async()=>{active=false}});await assert.rejects(c.saveSchoolAffiliation('uid','school-a',true,b),/Context changed/);assert.ok(b.writes.every(item=>item[0]!=='enable'));
});
test('inactive school cannot be assigned or published; existing inactive assignment can stay private',async()=>{
 const a=api({read:async parts=>snapshot(parts[0]==='students'?{accountType:'student',schoolId:'school-a'}:{...school,active:false})});await assert.rejects(c.saveSchoolAffiliation('uid','school-a',true,a),/Inactive/);await c.saveSchoolAffiliation('uid','school-a',false,a);await assert.rejects(c.saveSchoolAffiliation('uid','school-b',false,a),/Inactive/);
});
test('real activation helper checks the private consent operation token and latest directory data',async()=>{
 let profile={schoolId:'school-a',publicSchool:false,schoolConsentVersion:'new-token'},latest=school,writes=0;
 const a={current:()=>true,profileRef:()=> 'profile',schoolRef:()=> 'school',run:callback=>callback({get:async ref=>snapshot(ref==='profile'?profile:latest),update:()=>{writes++}})};
 await assert.rejects(c.enableSchoolPermission('uid','school-a','old-token',school,a),/Affiliation changed/);assert.equal(writes,0);profile.schoolConsentVersion='old-token';await c.enableSchoolPermission('uid','school-a','old-token',school,a);assert.equal(writes,1);latest={...school,countryCode:'TR'};await assert.rejects(c.enableSchoolPermission('uid','school-a','old-token',school,a),/Affiliation changed/);
});
test('future moderation copies only explicitly consented public arguments, never jury records',async()=>{
 const a=api({read:async parts=>snapshot(parts[0]==='students'?{accountType:'student',publicSchool:true,schoolId:'school-a'}:school)});assert.equal(await c.publishArgumentSchool('case-a',{id:'vote',status:'published',section:'jury',authorUid:'uid'},a),false);await c.publishArgumentSchool('case-a',{id:'arg',status:'published',section:'defense',authorUid:'uid'},a);assert.equal(a.writes.length,1);assert.deepEqual(Object.keys(a.writes[0][3]).sort(),['countryCode','schoolName']);
});
function host(){return {children:[],hidden:false,textContent:'',append(...items){this.children.push(...items)},replaceChildren(...items){this.children=items;this.textContent=''}}}
test('public renderer uses submission IDs, rejects extra/cached metadata, clears on revocation and releases old listeners',()=>{
 const refs=[],handlers=[],context={document:{createElement:()=>host()}};vm.createContext(context);vm.runInContext(source('school-data.js'),context);vm.runInContext(source('school-attribution.js'),context);let stopped=0;
 const view=context.createSchoolAttribution({db:{},doc:(_, ...parts)=>{refs.push(parts);return parts},onSnapshot:(ref,options,next,error)=>{assert.equal(options.includeMetadataChanges,true);handlers.push({next,error});return ()=>{stopped++}}}),container=host();view.render(container,'case-a','public-submission');assert.deepEqual(refs[0],['trials','case-a','attributions','public-submission']);const node=container.children[0],send=(data,fromCache=false)=>handlers[0].next({exists:()=>true,data:()=>data,metadata:{fromCache,hasPendingWrites:false}});
 send({schoolName:'A school',countryCode:'TR'},true);assert.equal(node.hidden,true);send({schoolName:'A school',countryCode:'TR',studentUid:'secret'});assert.equal(node.hidden,true);send({schoolName:'A school',countryCode:'TR'});assert.equal(node.hidden,false);assert.equal(node.children[0].src,'flag-tr.svg');assert.equal(node.children[0].alt,'Country: Türkiye');handlers[0].error({code:'permission-denied'});assert.equal(node.hidden,true);assert.equal(node.children.length,0);view.clear();assert.equal(stopped,1);send({schoolName:'Old',countryCode:'RO'});assert.equal(node.hidden,true);
});
test('jury reasoning renderer and ballot schemas never import or call school attribution',()=>{
 const archive=read('archive.js'),jury=archive.slice(archive.indexOf('function renderReasoningCards'),archive.indexOf('async function loadPublicReasoning'));assert.doesNotMatch(jury,/school|flag|attribution/i);assert.doesNotMatch(read('jury-reasoning.js'),/school|flag|attribution/i);assert.match(read('SCHOOL_AFFILIATIONS.md'),/authorUid/);
});
test('new account creation remains isolated and its optional school defaults to private',async()=>{
 const context={};vm.createContext(context);vm.runInContext(source('student-accounts.js'),context);let profile;
 const base={current:()=>true,open:()=>({auth:{},accountDomain:'synthetic.invalid'}),create:async()=>({user:{uid:'new-student'}}),save:async(_,data)=>{profile=data},read:async()=>snapshot(null),remove:async()=>{},close:async()=>{}};
 await context.provisionStudent({code:'PUPIL-1',name:'Alias',password:'SyntheticPassword123!',schoolId:'school-a'},base);assert.equal(profile.schoolId,'school-a');assert.equal(profile.publicSchool,false);assert.equal(profile.accountType,'student');assert.equal(profile.active,true);assert.equal('schoolConsentVersion' in profile,false);
 await context.provisionStudent({code:'PUPIL-2',name:'Alias',password:'SyntheticPassword123!'},base);assert.equal('schoolId' in profile,false);
});

function manager(){
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,disabled:false,textContent:'',children:[],handlers:{},replaceChildren(){this.children=[]},append(...items){this.children.push(...items)},addEventListener(k,v){this.handlers[k]=v}});return nodes.get(id)};
 let next=0;const ctx={document:{getElementById:get,createElement:()=>get('created-'+ ++next)},confirm:()=>true},auth={currentUser:null},callbacks=[],writes=[];vm.createContext(ctx);vm.runInContext(source('school-data.js'),ctx);vm.runInContext(source('school-directory.js'),ctx);vm.runInContext(source('school-admin.js'),ctx);
 const api={auth,db:{},onAuthStateChanged:(_,fn)=>callbacks.push(user=>{auth.currentUser=user;return fn(user)}),doc:(...args)=>args.length===1?{id:'ABCDEFGHIJKLMNOPQRST'}:args.slice(1),collection:(_, ...args)=>args,query:(...args)=>args,where:(...args)=>args,getDocFromServer:async()=>snapshot({accountType:'teacher',active:true}),getDocsFromServer:async ref=>({docs:ref[0]==='publicSchools'?[]:ref[0]==='schools'?[{id:'school-a',data:()=>school}]:[{id:'private-student',data:()=>({displayName:'Alias',accountType:'student',active:true})}]}),setDoc:async(...args)=>writes.push(args),updateDoc:async()=>{},runTransaction:async(_,fn)=>{const pending=[];const result=await fn({get:async()=>snapshot(null),set:(...args)=>pending.push(api.setDoc(...args)),delete:()=>{}});await Promise.all(pending);return result}};
 // Delegation keeps test changes observable without replacing the real controller.
 const bridge=Object.fromEntries(Object.entries(api).map(([key,value])=>[key,typeof value==='function'?(...args)=>api[key](...args):value]));ctx.setupSchoolAdmin(bridge);return {ctx,get,api,callbacks,writes};
}
test('school manager denies another teacher when the private-directory query is rejected',async()=>{
 const h=manager();h.api.getDocsFromServer=async()=>{throw {code:'permission-denied'}};await h.callbacks[0]({uid:'other-teacher'});assert.equal(h.get('school-editor').disabled,true);await h.get('school-form').handlers.submit({preventDefault(){}});assert.equal(h.writes.length,0);
});
test('school manager pending save prevents duplicate writes and does not restore private data after sign-out',async()=>{
 const h=manager();await h.callbacks[0]({uid:'teacher'});h.get('school-name').value='New school';h.get('school-country').value='GR';h.get('school-active').checked=true;let resolve,calls=0;h.api.setDoc=()=>{calls++;return new Promise(done=>{resolve=done})};const pending=h.get('school-form').handlers.submit({preventDefault(){}});await h.get('school-form').handlers.submit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);await h.callbacks[0](null);resolve();await pending;assert.equal(h.get('school-name').value,'');assert.equal(h.get('school-select').children.length,0);assert.equal(h.get('school-editor').disabled,true);assert.equal(h.get('affiliation-public').checked,false);
});
test('old school authorization cannot enable controls after account switching',async()=>{
 const h=manager();let resolve;h.api.getDocFromServer=()=>new Promise(done=>{resolve=done});const old=h.callbacks[0]({uid:'teacher'});await h.callbacks[0](null);resolve(snapshot({accountType:'teacher',active:true}));await old;assert.equal(h.get('school-editor').disabled,true);assert.equal(h.get('student-school').children.length,0);
});

test('failed withdrawal is visibly unconfirmed rather than claiming visibility is disabled',async()=>{
 const h=manager();await h.callbacks[0]({uid:'teacher'});h.get('affiliation-student').value='private-student';h.get('affiliation-student').handlers.change();h.get('affiliation-school').value='school-a';h.get('affiliation-public').checked=false;h.api.getDocFromServer=async ref=>snapshot(ref[0]==='schools'?school:{accountType:'student',schoolId:'school-a',publicSchool:true});h.api.runTransaction=async()=>{throw {code:'unavailable'}};
 await h.get('affiliation-form').handlers.submit({preventDefault(){}});assert.equal(h.get('affiliation-public').indeterminate,true);assert.match(h.get('school-feedback').textContent,/do not assume withdrawal succeeded/);assert.doesNotMatch(h.get('school-feedback').textContent,/Public school display is disabled/);
});

test('publication reservation cannot overwrite a withdrawal that happened during its preflight',async()=>{
 let profile={accountType:'student',schoolId:'school-a',publicSchool:false,schoolConsentVersion:'withdrawal-token'},writes=0;
 const a={current:()=>true,profileRef:()=> 'profile',run:callback=>callback({get:async()=>snapshot(profile),update:(_,data)=>{writes++;profile={...profile,...data}}})};
 const expected={schoolId:'school-a',publicSchool:true,schoolConsentVersion:'old-token'};
 await assert.rejects(c.reserveSchoolPermission('uid',{publicSchool:false,schoolConsentVersion:'stale-publish-token'},expected,a),/before publication/);assert.equal(writes,0);assert.equal(profile.schoolConsentVersion,'withdrawal-token');
 await c.reserveSchoolPermission('uid',{publicSchool:false,schoolConsentVersion:'new-withdrawal-token'},null,a);assert.equal(writes,1);assert.equal(profile.publicSchool,false);
});

test('homepage publication requires explicit confirmation and rejects unsaved school edits',async()=>{
 const h=manager();await h.callbacks[0]({uid:'teacher'});h.get('school-select').value='school-a';h.get('school-select').handlers.change();let calls=0;h.api.runTransaction=async()=>{calls++};h.ctx.confirm=()=>false;await h.get('school-publish').handlers.click();assert.equal(calls,0);h.ctx.confirm=()=>true;h.get('school-name').value='Unsaved';await h.get('school-publish').handlers.click();assert.equal(calls,0);assert.match(h.get('school-feedback').textContent,/Save your school edits/);
});
test('pending homepage publication blocks duplicate actions and cannot restore UI after sign-out',async()=>{
 const h=manager();await h.callbacks[0]({uid:'teacher'});h.get('school-select').value='school-a';h.get('school-select').handlers.change();let release,calls=0;h.api.runTransaction=()=>{calls++;return new Promise(resolve=>{release=resolve})};const pending=h.get('school-publish').handlers.click();await h.get('school-publish').handlers.click();assert.equal(calls,1);assert.equal(h.get('school-publish').disabled,true);await h.callbacks[0](null);release(true);await pending;assert.equal(h.get('school-public-status').textContent,'Save a school, then explicitly publish its name and country on the homepage.');assert.equal(h.get('school-publish').disabled,true);
});
test('failed homepage publication is unconfirmed and requires refresh before retry',async()=>{
 const h=manager();await h.callbacks[0]({uid:'teacher'});h.get('school-select').value='school-a';h.get('school-select').handlers.change();h.api.runTransaction=async()=>{throw {code:'unavailable'}};await h.get('school-publish').handlers.click();assert.match(h.get('school-feedback').textContent,/not confirmed.*Refresh to verify/);assert.equal(h.get('school-publish').disabled,true);assert.equal(h.get('schools-refresh').disabled,false);assert.match(h.get('school-public-status').textContent,/unconfirmed/);
});
