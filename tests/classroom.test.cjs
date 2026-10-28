const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const accounts={};vm.createContext(accounts);vm.runInContext(fs.readFileSync(path.join(root,'student-accounts.js'),'utf8').replace(/^export /gm,''),accounts);
function api(extra={}){return {current:()=>true,open:()=>({auth:{},accountDomain:'students.demo.invalid'}),create:async()=>({user:{uid:'new'}}),save:async()=>{},read:async()=>({exists:()=>false}),remove:async()=>{},close:async()=>{},...extra}}
const input={code:'PUPIL-001',name:'Alias',password:'SyntheticPassword123!'};
for(const invalid of [{code:'x'},{name:' '},{password:'short'}])test('student creation rejects invalid '+Object.keys(invalid)[0]+' before opening Auth',async()=>{
 let opened=false;await assert.rejects(accounts.provisionStudent({...input,...invalid},api({open:()=>{opened=true}})));assert.equal(opened,false);
});
test('failed profile write removes only the newly created Auth account and reports failure',async()=>{
 let removed,closed=false;await assert.rejects(accounts.provisionStudent(input,api({save:async()=>{throw Error('Denied')},remove:async user=>{removed=user.uid},close:async()=>{closed=true}})),/Denied/);
 assert.equal(removed,'new');assert.equal(closed,true);
});
test('lost profile acknowledgement is confirmed from the server without deleting valid access',async()=>{
 let removed=false;const created=await accounts.provisionStudent(input,api({save:async()=>{throw Error('Lost acknowledgement')},read:async()=>({exists:()=>true,data:()=>({displayName:'Alias',accountType:'student',active:true})}),remove:async()=>{removed=true}}));
 assert.equal(created.id,'new');assert.equal(removed,false);
});
test('unconfirmed partial creation gives a recovery message without reporting success',async()=>{
 await assert.rejects(accounts.provisionStudent(input,api({save:async()=>{throw Error('Offline')},read:async()=>{throw Error('Offline')}})),/could not be confirmed.*UID new/);
});
function element(){return {textContent:'',children:[],hidden:false,disabled:false,attributes:{},handlers:{},append(...items){this.children.push(...items)},replaceChildren(...items){this.children=items;this.textContent=''},setAttribute(k,v){this.attributes[k]=v},addEventListener(k,v){this.handlers[k]=v}}}
function archive(search='?trial=closed-case'){
 const nodes=new Map(),calls=[];const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)};
 const context={document:{getElementById:get,createElement:element},initializeFirebaseClient:()=>({db:{}}),initializeApp(){},getAuth(){},initializeAuth(){},inMemoryPersistence:{},connectAuthEmulator(){},getFirestore(){},connectFirestoreEmulator(){},URL,URLSearchParams,location:{search},
 collection:(_, ...args)=>args,where:(...args)=>args,query:(...args)=>args,
 getDocsFromServer:async query=>{calls.push(query);return query[0].length===1?{docs:[{id:'active-case',data:()=>({status:'trial',title:'Active'})},{id:'closed-case',data:()=>({status:'closed',title:'Loki',verdictSummary:{guilty:2,notGuilty:1}})}]}:{docs:[
 {data:()=>({status:'published',section:'prosecution',authorName:'Alias',text:'Approved prosecution'})},
 {data:()=>({status:'published',section:'defense',text:'Approved defense',evidenceUrl:'javascript:alert(1)'})},
 {data:()=>({status:'draft',section:'prosecution',text:'PRIVATE DRAFT'})},
 {data:()=>({status:'pending',section:'defense',text:'PRIVATE PENDING'})}
 ]}},console};
 vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'case-content.js'),'utf8').replace(/^export /gm,''),context);vm.runInContext(fs.readFileSync(path.join(root,'jury-reasoning.js'),'utf8').replace(/^export /gm,''),context);vm.runInContext(fs.readFileSync(path.join(root,'portraits.js'),'utf8').replace(/^export /gm,''),context);vm.runInContext(fs.readFileSync(path.join(root,'archive.js'),'utf8').replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];\n/gm,''),context);
 return {context,get,calls,run:code=>vm.runInContext(code,context)};
}
test('archive renders closed trials, published arguments and valid tally without querying private votes or profiles',async()=>{
 const h=archive();await h.run('loadArchive()');
 assert.equal(h.get('archive-list').children.length,1);assert.equal(h.get('archive-title').textContent,'Loki');assert.equal(h.get('archive-detail').hidden,false);
 assert.equal(h.get('archive-verdict').children[0].children[1].textContent,'2');assert.equal(h.get('archive-verdict').children[1].children[1].textContent,'1');
 const content=JSON.stringify([...['archive-prosecution','archive-defense'].map(id=>h.get(id).children)]);
 assert.match(content,/Approved prosecution/);assert.match(content,/Approved defense/);assert.doesNotMatch(content,/PRIVATE|javascript:/);
 assert.ok(h.calls.every(call=>!JSON.stringify(call).match(/votes|students|assignments/)));
 assert.ok(h.calls.some(call=>JSON.stringify(call).includes('["status","==","published"]')));
});
test('archive does not expose an active trial through a crafted URL',async()=>{
 const h=archive('?trial=active-case');await h.run('loadArchive()');assert.equal(h.get('archive-detail').hidden,true);assert.match(h.get('archive-status').textContent,/unavailable/);
 assert.ok(h.calls.every(call=>call[0].length===1));
});
test('archive failed reads show retry feedback and hide previous content',async()=>{
 const h=archive();await h.run('loadArchive()');h.context.getDocsFromServer=async()=>{throw Error('Offline')};await h.run('loadArchive()');
 assert.equal(h.get('archive-detail').hidden,true);assert.match(h.get('archive-status').textContent,/Unable to load/);assert.equal(h.get('archive-refresh').disabled,false);
});
test('unpublished and legacy zero tallies are not presented as final verdicts',()=>{
 const h=archive('');for(const summary of [null,{guilty:0,notGuilty:0},{guilty:-1,notGuilty:1}]){h.context.summary=summary;h.run('renderTally(summary)');assert.match(h.get('archive-verdict').textContent,/not yet been published/)}
});
test('archive delayed earlier refresh cannot overwrite a newer result',async()=>{
 const h=archive('');await h.run('loadArchive()');let resolve;
 h.context.getDocsFromServer=()=>new Promise(done=>{resolve=done});const first=h.run('loadArchive()');
 h.context.getDocsFromServer=async()=>({docs:[]});await h.run('loadArchive()');resolve({docs:[{id:'old',data:()=>({status:'closed'})}]});await first;
 assert.equal(h.get('archive-list').children.length,0);assert.match(h.get('archive-status').textContent,/No completed trials/);
});
test('launch preparation exposes only public assets and substitutes rules without modifying the source',async()=>{
 const {PUBLIC_FILES,prepareSite}=require('../scripts/prepare-site.cjs');const {prepareLaunch,verifyLaunch,rulesForAdmin}=require('../scripts/prepare-launch.cjs');
 const temp=await fsp.mkdtemp(path.join(os.tmpdir(),'olympos-launch-'));
 try{
  for(const file of [...PUBLIC_FILES,'firestore.rules'])await fsp.copyFile(path.join(root,file),path.join(temp,file));
  const original=await fsp.readFile(path.join(temp,'firestore.rules'),'utf8');
  await prepareLaunch('TeacherAuthUid123456789',temp);await verifyLaunch(temp);
  assert.deepEqual((await fsp.readdir(path.join(temp,'dist'))).sort(),[...PUBLIC_FILES].sort());
  assert.equal(await fsp.readFile(path.join(temp,'firestore.rules'),'utf8'),original);
  assert.ok(!PUBLIC_FILES.some(file=>/rules|local|seed|test|json|md/i.test(file)));
  for(const uid of ['REPLACE_WITH_ADMIN_UID','PASTE_TEACHER_UID_HERE','YOUR_TEACHER_UID','synthetic-admin',"bad' UID",''])assert.throws(()=>rulesForAdmin(original,uid));
  await fsp.writeFile(path.join(temp,'.launch','firestore.rules'),'stale rules');await assert.rejects(verifyLaunch(temp));
  await fsp.writeFile(path.join(temp,'dist','private.json'),'private');await assert.rejects(prepareSite(temp),/Unexpected file/);
 }finally{await fsp.rm(temp,{recursive:true,force:true})}
});
test('an existing Auth code is never overwritten or deleted when creation is rejected',async()=>{
 let saved=false,removed=false;
 await assert.rejects(accounts.provisionStudent(input,api({create:async()=>{throw Error('Code already exists')},save:async()=>{saved=true},remove:async()=>{removed=true}})),/already exists/);
 assert.equal(saved,false);assert.equal(removed,false);
});
test('archive renders optional portraits in thumbnails/detail and retains legacy Ω',async()=>{
 const h=archive();await h.run('loadArchive()');assert.equal(h.get('archive-portrait').textContent,'Ω');
 h.context.getDocsFromServer=async query=>query[0].length===1?{docs:[{id:'closed-case',data:()=>({title:'Athena',status:'closed',portraitUrl:'https://images.example/athena.jpg'})}]}:{docs:[]};
 await h.run('loadArchive()');
 assert.equal(h.get('archive-portrait').children[0].src,'https://images.example/athena.jpg');
 const thumbnail=h.get('archive-list').children[0].children[0].children[0];assert.equal(thumbnail.children[0].src,'https://images.example/athena.jpg');
 thumbnail.children[0].onerror();assert.equal(thumbnail.textContent,'Ω');assert.equal(h.get('archive-detail').hidden,false);
});
test('public reasoning displays only choice/text with anonymous trial labels and no metadata',()=>{
 const h=archive('');h.context.docs=[{id:'RandomPublicCopyAAAAA',data:()=>({choice:'guilty',reason:'A sufficiently detailed approved reason.'})},{id:'RandomPublicCopyBBBBB',data:()=>({choice:'not-guilty',reason:'A second sufficiently detailed reason.'})},{id:'bad',data:()=>({choice:'guilty',reason:'Must not render private identifiers.',authorUid:'PRIVATE-UID',castAt:'PRIVATE-TIME'})}];
 h.run('renderReasoningCards(docs)');const list=h.get('archive-reasoning');assert.equal(list.children.length,2);assert.equal(list.children[0].children[0].textContent,'Juror #1');assert.equal(list.children[1].children[0].textContent,'Juror #2');assert.equal(list.children[1].children[1].textContent,'Not Guilty');assert.doesNotMatch(JSON.stringify(list.children),/PRIVATE|RandomPublicCopy/);
});
test('legacy finished trial has an honest empty state without automatically copying historical ballots',async()=>{
 const h=archive();h.context.getDocsFromServer=async ref=>{h.calls.push(ref);return {docs:[]}};await h.run("loadPublicReasoning({id:'old-case',status:'closed',verdictSummary:{guilty:1,notGuilty:0}},()=>true)");
 assert.match(h.get('archive-reasoning').textContent,/No jury justifications/);assert.ok(h.calls.every(call=>!JSON.stringify(call).match(/votes|students|reasoningReviews/)));
});
test('closed trial without final tally never requests public reasoning',async()=>{
 const h=archive('');await h.run('loadArchive()');let reads=0;h.context.getDocsFromServer=async()=>{reads++;return {docs:[]}};await h.run("loadPublicReasoning({id:'old-case',status:'closed'},()=>true)");assert.equal(reads,0);assert.match(h.get('archive-reasoning').textContent,/after the final jury tally/);
});
test('reasoning read failures do not expose private fallbacks or hide approved arguments',async()=>{
 const h=archive('');await h.run('loadArchive()');h.context.getDocsFromServer=async()=>{throw Error('permission-denied')};await h.run("loadPublicReasoning({id:'old-case',status:'closed',verdictSummary:{guilty:1,notGuilty:0}},()=>true)");assert.match(h.get('archive-reasoning').textContent,/could not be loaded/);
});
test('case view hides duplicate archive overview and exposes a return link',async()=>{
 const h=archive();await h.run('loadArchive()');assert.equal(h.get('archive-browser').hidden,true);assert.equal(h.get('archive-back').hidden,false);
});

test('archive orders published arguments independently by createdAt and safely displays optional charge',async()=>{
 const h=archive();await h.run('loadArchive()');
 h.context.getDocsFromServer=async query=>query[0].length===1?{docs:[{id:'closed-case',data:()=>({status:'closed',title:'Case',charge:'Case description',verdictSummary:{guilty:1,notGuilty:0}})}]}:query[0][2]==='submissions'?{docs:[
 ...[['late','prosecution',30],['unknown','prosecution',null],['defense-late','defense',40],['early','prosecution',10],['defense-early','defense',5]].map(([text,section,time])=>({data:()=>({status:'published',text,section,createdAt:time===null?null:{toMillis:()=>time}})}))
 ]}:{docs:[]};
 await h.run('loadArchive()');assert.equal(h.get('archive-info').textContent,'Case description');assert.equal(h.get('archive-info').hidden,false);
 assert.deepEqual(h.get('archive-prosecution').children.map(item=>item.children[1].textContent),['early','late','unknown']);assert.deepEqual(h.get('archive-defense').children.map(item=>item.children[1].textContent),['defense-early','defense-late']);
});
test('legacy archive omits an absent charge instead of rendering a placeholder',async()=>{
 const h=archive();await h.run('loadArchive()');assert.equal(h.get('archive-info').hidden,true);
});
