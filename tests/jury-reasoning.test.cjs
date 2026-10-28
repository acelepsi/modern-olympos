const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const c={};vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(__dirname,'..','jury-reasoning.js'),'utf8').replace(/^export /gm,''),c);
const tally={guilty:2,notGuilty:1},trial={status:'closed',verdictSummary:tally};
const snap=data=>({exists:()=>data!==null,data:()=>data});
const original={choice:'guilty',reason:'I found the argument convincing.',castAt:'private-time',authorUid:'private-student'};
function harness(extra={}){
 const writes=[],data={trial,ballot:original,review:null};
 const api={current:()=>true,identifiers:['private-student','Private Alias'],newId:()=> 'ABCDEFGHIJKLMNOPQRST',trial:'trial',ballot:'ballot',review:'review',publicCopy:id=>'public/'+id,
 run:async callback=>callback({get:async ref=>snap(data[ref]),set:(ref,payload)=>writes.push({ref,payload:JSON.parse(JSON.stringify(payload))}),delete:ref=>writes.push({ref,deleted:true})}),...extra};
 return {api,writes,data};
}
for(const state of [{status:'verdict',verdictSummary:tally},{status:'trial',verdictSummary:tally},{status:'closed'},{status:'closed',verdictSummary:{guilty:0,notGuilty:0}}])test('reasoning stays private without permanent closure and positive final tally '+JSON.stringify(state),async()=>{
 const h=harness();h.data.trial=state;await assert.rejects(c.reviewReasoning(true,'A reviewed anonymous explanation.',h.api),/close the trial/);assert.equal(h.writes.length,0);
});
test('approved copies whitelist choice/reason and omit identity/timestamps',async()=>{
 const h=harness();await c.reviewReasoning(true,'A reviewed anonymous explanation.',h.api);
 assert.deepEqual(h.writes[0],{ref:'public/ABCDEFGHIJKLMNOPQRST',payload:{choice:'guilty',reason:'A reviewed anonymous explanation.'}});
 assert.deepEqual(h.writes[1].payload,{state:'approved',publicId:'ABCDEFGHIJKLMNOPQRST'});
 assert.ok(h.writes.every(write=>write.ref!=='ballot'&&write.ref!=='trial'));assert.equal(original.castAt,'private-time');
});
for(const text of ['Contact me at learner@example.invalid','My code is STUDENT-001 and this is my view.','I am private-student and I chose this.','I am Private Alias and I chose this.','short'])test('identifying or invalid reviewed text is blocked '+text.slice(0,35),async()=>{
 const h=harness();await assert.rejects(c.reviewReasoning(true,text,h.api));assert.equal(h.writes.length,0);
});
test('exclusion never publishes raw or edited reasoning',async()=>{
 const h=harness();await c.reviewReasoning(false,'Identifying private content',h.api);assert.equal(h.writes.length,1);assert.equal(h.writes[0].ref,'review');assert.equal(h.writes[0].payload.state,'excluded');
});
test('withdrawing an approved copy removes only the public copy and retains its private reference',async()=>{
 const h=harness();h.data.review={state:'approved',publicId:'ZYXWVUTSRQPONMLKJIHG'};await c.reviewReasoning(false,'',h.api);
 assert.deepEqual(h.writes[0],{ref:'public/ZYXWVUTSRQPONMLKJIHG',deleted:true});assert.equal(h.writes[1].payload.publicId,'ZYXWVUTSRQPONMLKJIHG');
});
test('retrying approval reuses the trial-private mapping rather than publishing another copy',async()=>{
 const h=harness();h.data.review={state:'approved',publicId:'ZYXWVUTSRQPONMLKJIHG'};await c.reviewReasoning(true,'A newly reviewed redacted explanation.',h.api);assert.equal(h.writes[0].ref,'public/ZYXWVUTSRQPONMLKJIHG');
});
test('context changes during reads cancel all writes',async()=>{
 let checks=0;const h=harness({current:()=>++checks===1});await assert.rejects(c.reviewReasoning(true,'A reviewed anonymous explanation.',h.api),/changed/);assert.equal(h.writes.length,0);
});
test('publication failure propagates rather than reporting success',async()=>{
 const h=harness({run:async()=>{throw Error('Synthetic commit failure')}});await assert.rejects(c.reviewReasoning(true,'A reviewed anonymous explanation.',h.api),/commit failure/);
});
test('racing first approval rereads the winning private reference once without weakening permissions',async()=>{
 const h=harness();let attempts=0;
 h.api.run=async callback=>{
  attempts++;const result=await callback({get:async ref=>snap(h.data[ref]),set:(ref,payload)=>h.writes.push({ref,payload}),delete(){}});
  if(attempts===1){h.writes.length=0;h.data.review={state:'approved',publicId:'ZYXWVUTSRQPONMLKJIHG'};const error=Error('Stale first reference');error.code='permission-denied';throw error}
  return result;
 };
 await c.reviewReasoning(true,'A reviewed anonymous explanation.',h.api);assert.equal(attempts,2);assert.equal(h.writes[0].ref,'public/ZYXWVUTSRQPONMLKJIHG');
});
