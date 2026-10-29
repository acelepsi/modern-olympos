const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8'),source=file=>read(file).replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];\n/gm,'').replace(/^export /gm,'');
const entry=(extra={})=>({name:'Synthetic Figure',tradition:'Synthetic Tradition',introduction:'Teacher-written introduction.',biography:'Teacher biography.',actions:'Teacher actions.',perspectives:'Teacher perspectives.',sources:'Teacher citation.',portraitUrl:'',relatedTrialId:'',status:'published',...extra});
const snapshot=data=>({exists:()=>!!data,data:()=>data});
function harness(file){
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',value:'',hidden:false,disabled:false,children:[],attributes:{},handlers:{},setAttribute(k,v){this.attributes[k]=v},getAttribute(k){return this.attributes[k]},append(...items){this.children.push(...items)},replaceChildren(...items){this.children=items;this.textContent=''},addEventListener(k,v){this.handlers[k]=v}});return nodes.get(id)};
 const calls=[],writes=[],callbacks=[],auth={currentUser:null};let count=0;
 const c={URL,URLSearchParams,Map,Set,console,location:{search:''},document:{getElementById:get,createElement:tag=>get('node-'+tag+'-'+ ++count)},initializeFirebaseClient:()=>({db:{}}),initializeApp(){},getAuth(){},initializeAuth(){},inMemoryPersistence:{},connectAuthEmulator(){},getFirestore(){},connectFirestoreEmulator(){},confirm:()=>true,
 collection:(_, ...args)=>args,doc:(...args)=>args.length===1?{id:'random-entry-ID'}:args.slice(1),query:(...args)=>args,where:(...args)=>args,
 getDocsFromServer:async ref=>{calls.push(ref);return {docs:[{id:'synthetic',data:()=>entry()}]}},getDocFromServer:async()=>snapshot({active:true,accountType:'teacher'}),setDoc:async(...args)=>writes.push(['set',...args]),deleteDoc:async(...args)=>writes.push(['delete',...args]),onAuthStateChanged:(_,callback)=>callbacks.push(user=>{auth.currentUser=user;return callback(user)})};
 vm.createContext(c);vm.runInContext(source('portraits.js'),c);vm.runInContext(source('encyclopedia-data.js'),c);vm.runInContext(source(file),c);
 if(file==='encyclopedia-admin.js'){c.api={auth,db:{},...Object.fromEntries(['collection','doc','getDocsFromServer','getDocFromServer','setDoc','deleteDoc','onAuthStateChanged'].map(key=>[key,(...args)=>c[key](...args)]))};c.setupEncyclopediaAdmin(c.api)}
 return {c,get,calls,writes,callbacks,auth,run:code=>vm.runInContext(code,c)};
}
const pure=harness('encyclopedia-admin.js');
test('entry validation allows teacher-defined traditions, trims text and copies only known fields',()=>{
 const result=pure.c.validateEntry(entry({name:'  Figure  ',tradition:'A future tradition',studentUid:'must never be copied'}));assert.equal(result.name,'Figure');assert.equal(result.tradition,'A future tradition');assert.equal('studentUid' in result,false);
});
for(const extra of [{name:''},{tradition:42},{introduction:'x'.repeat(501)},{biography:'x'.repeat(8001)},{status:'unknown'},{portraitUrl:'http://example.org/a.jpg'},{portraitUrl:'https://user:pass@example.org/a.jpg'},{relatedTrialId:'../private'}])test('invalid entry fails before save '+Object.keys(extra)[0],()=>assert.throws(()=>pure.c.validateEntry(entry(extra))));
test('drafts can be unfinished but published text requires teacher content and sources',()=>{assert.throws(()=>pure.c.validateEntry(entry({sources:''})));assert.equal(pure.c.validateEntry(entry({sources:'',biography:'',status:'draft'})).status,'draft')});
test('search is accent insensitive and filters traditions without a fixed list',()=>{
 const data=[entry({name:'Médusa',tradition:'Greek'}),entry({name:'Loki',tradition:'Norse'}),entry({name:'Another',tradition:'Teacher-defined tradition'})];assert.equal(pure.c.filterEntries(data,'medu','Greek')[0].name,'Médusa');assert.equal(pure.c.filterEntries(data,'missing').length,0);assert.ok(Array.from(pure.c.entryTraditions(data)).includes('Teacher-defined tradition'));
});
for(const [trial,active,href] of [[{title:'Case',status:'closed'},'other','archive.html?trial=case-a'],[{title:'Case',status:'verdict'},'case-a','court.html'],[{title:'Case',status:'trial'},'other',null],[null,'case-a',null],[{status:'trial'},undefined,null]])test('related trial navigation '+JSON.stringify([trial,active]),()=>assert.equal(pure.c.relatedTrialLink('case-a',trial,active).href,href));
test('public page requests only published entries; filtering causes no more reads',async()=>{
 const h=harness('encyclopedia.js');await h.run('loadEncyclopedia()');assert.equal(h.get('encyclopedia-list').children.length,1);assert.ok(h.calls.every(call=>JSON.stringify(call).includes('["status","==","published"]')));const count=h.calls.length;h.get('character-search').value='missing';h.get('character-search').handlers.input();assert.equal(h.calls.length,count);assert.equal(h.get('encyclopedia-list').children.length,0);assert.match(h.get('encyclopedia-results').textContent,/No published/);
});
test('detail renders all teacher sections safely as text and a draft URL is unavailable',async()=>{
 const h=harness('encyclopedia.js');h.c.location.search='?character=synthetic';h.c.getDocsFromServer=async()=>({docs:[{id:'synthetic',data:()=>entry({name:'<img onerror=alert(1)>',biography:'<script>PRIVATE</script>'})},{id:'draft',data:()=>entry({status:'draft'})}]});await h.run('loadEncyclopedia()');const serialized=JSON.stringify(h.get('encyclopedia-detail').children);assert.match(serialized,/<img onerror/);assert.match(serialized,/Different interpretations/);assert.match(serialized,/Sources and further reading/);assert.equal(h.get('encyclopedia-detail').children[1].children[1].textContent,'<script>PRIVATE</script>');
 h.c.location.search='?character=draft';h.run('renderEncyclopedia()');assert.match(h.get('encyclopedia-detail').children[0].textContent,/unavailable/);
});
test('failed public load clears previous content and offers retry',async()=>{
 const h=harness('encyclopedia.js');await h.run('loadEncyclopedia()');h.c.getDocsFromServer=async()=>{throw Error('Offline')};await h.run('loadEncyclopedia()');assert.equal(h.get('encyclopedia-list').children.length,0);assert.match(h.get('encyclopedia-status').textContent,/could not be loaded/);assert.equal(h.get('encyclopedia-refresh').disabled,false);
});
test('a delayed old public load cannot replace a newer selection',async()=>{
 const h=harness('encyclopedia.js');await h.run('loadEncyclopedia()');let resolve;h.c.getDocsFromServer=()=>new Promise(done=>{resolve=done});const old=h.run('loadEncyclopedia()');h.c.getDocsFromServer=async()=>({docs:[]});await h.run('loadEncyclopedia()');resolve({docs:[{id:'stale',data:()=>entry()}]});await old;assert.equal(h.get('encyclopedia-list').children.length,0);
});
test('administrator unfiltered authorization check prevents another teacher from editing',async()=>{
 const h=harness('encyclopedia-admin.js');h.c.getDocsFromServer=async()=>{throw {code:'permission-denied'}};await h.callbacks[0]({uid:'other-teacher'});assert.equal(h.get('entry-editor').disabled,true);assert.match(h.get('entry-feedback').textContent,/unavailable/);await h.get('entry-form').handlers.submit({preventDefault(){}});assert.equal(h.writes.length,0);
});
async function admin(){const h=harness('encyclopedia-admin.js');await h.callbacks[0]({uid:'admin'});return h}
function fill(h,data=entry()){for(const [key,value] of Object.entries(data))h.get('entry-'+key).value=value}
test('administrator saves a full draft/published entry without a preview or trial write',async()=>{
 const h=await admin();fill(h);await h.get('entry-form').handlers.submit({preventDefault(){}});assert.equal(h.writes.length,1);assert.deepEqual(Array.from(h.writes[0][1]),['encyclopedia','random-entry-ID']);assert.equal(h.writes[0][2].status,'published');assert.match(h.get('entry-feedback').textContent,/published/);
});
test('invalid portrait/unknown related trial cannot save',async()=>{
 const h=await admin();fill(h,entry({portraitUrl:'http://example.org/a.jpg'}));await h.get('entry-form').handlers.submit({preventDefault(){}});assert.equal(h.writes.length,0);fill(h,entry({relatedTrialId:'missing'}));h.c.getDocFromServer=async()=>snapshot(null);await h.get('entry-form').handlers.submit({preventDefault(){}});assert.equal(h.writes.length,0);assert.match(h.get('entry-feedback').textContent,/does not exist/);
});
test('deletion requires explicit confirmation, cancellation does nothing, confirmed delete is encyclopedia-only',async()=>{
 const h=await admin();h.get('entry-select').value='synthetic';h.get('entry-select').handlers.change();h.c.confirm=()=>false;await h.get('entry-delete').handlers.click();assert.equal(h.writes.length,0);h.c.confirm=()=>true;await h.get('entry-delete').handlers.click();assert.equal(h.writes[0][0],'delete');assert.deepEqual(Array.from(h.writes[0][1]),['encyclopedia','synthetic']);
});
test('pending save blocks duplicates and stale account completion cannot repopulate private drafts',async()=>{
 const h=await admin();fill(h);let resolve,writes=0;h.c.setDoc=()=>{writes++;return new Promise(done=>{resolve=done})};const pending=h.get('entry-form').handlers.submit({preventDefault(){}});await h.get('entry-form').handlers.submit({preventDefault(){}});assert.equal(writes,1);await h.callbacks[0](null);resolve();await pending;assert.equal(h.get('entry-name').value,'');assert.equal(h.get('entry-editor').disabled,true);assert.equal(h.get('entry-select').children.length,0);
});
test('late authorization and failed save never claim success or reveal old drafts',async()=>{
 const h=harness('encyclopedia-admin.js');let resolve;h.c.getDocFromServer=()=>new Promise(done=>{resolve=done});const old=h.callbacks[0]({uid:'old'});await h.callbacks[0](null);resolve(snapshot({active:true,accountType:'teacher'}));await old;assert.equal(h.get('entry-editor').disabled,true);
 const next=await admin();fill(next);next.c.setDoc=async()=>{throw {code:'unavailable'}};await next.get('entry-form').handlers.submit({preventDefault(){}});assert.match(next.get('entry-feedback').textContent,/not confirmed/);assert.equal(next.get('entry-name').value,'Synthetic Figure');
});
test('guide preserves classroom privacy and new page ships without generated biographies',()=>{
 const guide=read('how-it-works.html');for(const text of ['Classroom roles','How a trial progresses','Before you post','Do not include identifying details.','Closure and published votes cannot be undone.'])assert.ok(guide.includes(text));assert.match(read('who-is-who.html'),/id="encyclopedia-list"/);assert.doesNotMatch(read('who-is-who.html'),/Prometheus was|Medusa was/);
});

test('related trial reads are deduplicated per load and never repeat during filtering',async()=>{
 const h=harness('encyclopedia.js');await h.run('loadEncyclopedia()');let reads=0;h.c.getDocsFromServer=async()=>({docs:[{id:'a',data:()=>entry({relatedTrialId:'case-a'})},{id:'b',data:()=>entry({name:'Second',relatedTrialId:'case-a'})}]});h.c.getDocFromServer=async ref=>{reads++;return snapshot(ref[0]==='settings'?{trialId:'case-a'}:{status:'trial',title:'Current'})};await h.run('loadEncyclopedia()');assert.equal(reads,2);h.get('character-search').value='Second';h.get('character-search').handlers.input();assert.equal(reads,2);
});
test('pending deletion cannot clear a newer selected entry or repeat the delete',async()=>{
 const h=await admin();h.c.getDocsFromServer=async()=>({docs:[{id:'a',data:()=>entry({name:'A'})},{id:'b',data:()=>entry({name:'B'})}]});await h.get('entry-refresh').handlers.click();h.get('entry-select').value='a';h.get('entry-select').handlers.change();let resolve,deletes=0;h.c.deleteDoc=()=>{deletes++;return new Promise(done=>{resolve=done})};const old=h.get('entry-delete').handlers.click();await h.get('entry-delete').handlers.click();assert.equal(deletes,1);h.get('entry-select').value='b';h.get('entry-select').handlers.change();resolve();await old;assert.equal(h.get('entry-name').value,'B');assert.equal(h.get('entry-select').value,'b');assert.equal(h.get('entry-feedback').textContent,'');
});
test('retry after unconfirmed new-entry write reuses its generated ID',async()=>{
 const h=await admin(),ids=[];fill(h);h.c.setDoc=async ref=>{ids.push(ref[1]);throw {code:'unavailable'}};for(let i=0;i<2;i++)await h.get('entry-form').handlers.submit({preventDefault(){}});assert.deepEqual(ids,['random-entry-ID','random-entry-ID']);
});
