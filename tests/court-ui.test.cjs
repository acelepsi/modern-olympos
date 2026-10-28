const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function harness(){
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,element(id));return nodes.get(id)};
 const document={getElementById:get,activeElement:null};
 function element(id){const fields=new Map();return {id,value:'',textContent:'',dataset:{},attributes:{},hidden:false,open:false,isConnected:true,handlers:{},children:[],
  setAttribute(k,v){this.attributes[k]=v},removeAttribute(k){delete this.attributes[k]},getClientRects(){return this.hidden?[]:[{}]},
  addEventListener(k,fn){(this.handlers[k]??=[]).push(fn)},emit(k,extra={}){for(const fn of this.handlers[k]||[])fn({preventDefault(){},...extra})},
  focus(){document.activeElement=this},querySelector(selector){if(!fields.has(selector))fields.set(selector,element(selector));return fields.get(selector)},
  contains(node){return node===this||this.children.includes(node)},showModal(){this.open=true},close(){this.open=false;this.emit('close')}
 }}
 const c={document,window:{matchMedia:()=>media},Promise};const media={matches:true,addEventListener(k,fn){this.change=fn}};vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(__dirname,'..','court-ui.js'),'utf8').replace(/^export /gm,''),c);
 return {c,get,document,media};
}
for(const [status,states] of [['trial',['active','upcoming','upcoming']],['verdict',['completed','active','upcoming']],['closed',['completed','completed','active']],['unknown',['upcoming','upcoming','upcoming']]])test('phase renders accessible state '+status,()=>{
 const h=harness();h.c.renderTrialProgress(status);['trial','verdict','closed'].forEach((phase,i)=>{const node=h.get('phase-'+phase);assert.equal(node.dataset.state,states[i]);assert.equal(node.attributes['aria-current'],states[i]==='active'?'step':undefined);assert.ok(node.querySelector('[data-phase-state]').textContent)});
 h.c.renderTrialProgress(null);assert.match(h.get('trial-phase-status').textContent,/unavailable/);assert.equal(h.get('phase-closed').attributes['aria-current'],undefined);
});
test('character counters reflect raw length and trimmed jury minimum, including programmatic edits/reset',()=>{
 const h=harness();h.c.setupCourtCounters();h.get('prosecution-argument').value='x'.repeat(5000);h.get('prosecution-argument').emit('input');assert.equal(h.get('prosecution-count').textContent,'5000 / 5000 characters');
 h.get('defense-argument').value='An existing draft';h.c.updateCourtCounters();assert.match(h.get('defense-count').textContent,/17 \/ 5000/);
 h.get('vote-justification').value='              ';h.get('vote-justification').emit('input');assert.match(h.get('justification-count').textContent,/15 more/);assert.equal(h.get('justification-count').dataset.state,'short');
 h.get('vote-justification').value='A valid reason.';h.get('vote-justification').emit('input');assert.equal(h.get('justification-count').dataset.state,'ready');assert.doesNotMatch(h.get('justification-count').textContent,/needed/);
 h.get('vote-justification').value='x'.repeat(2001);h.c.updateCourtCounters();assert.equal(h.get('justification-count').dataset.state,'over');
 h.get('vote-justification').value='';h.c.updateCourtCounters();assert.match(h.get('justification-count').textContent,/0 \/ 2000/);
});
test('mobile tabs expose one accessible panel with roving keyboard focus and desktop exposes both',()=>{
 const h=harness(),tabs=h.c.setupCourtTabs(h.media),prosecution=h.get('prosecution-panel'),defense=h.get('defense-panel');
 assert.equal(prosecution.hidden,false);assert.equal(defense.hidden,true);assert.equal(prosecution.attributes.role,'tabpanel');assert.equal(h.get('prosecution-tab').tabIndex,0);
 h.get('prosecution-tab').emit('keydown',{key:'ArrowRight'});assert.equal(prosecution.hidden,true);assert.equal(defense.hidden,false);assert.equal(h.document.activeElement,h.get('defense-tab'));assert.equal(h.get('defense-tab').attributes['aria-selected'],'true');
 h.get('defense-tab').emit('keydown',{key:'Home'});assert.equal(defense.hidden,true);h.get('prosecution-tab').emit('keydown',{key:'End'});assert.equal(defense.hidden,false);
 h.get('defense-tab').emit('keydown',{key:'ArrowLeft'});assert.equal(prosecution.hidden,false);
 tabs.select('defense');h.media.matches=false;h.media.change();assert.equal(prosecution.hidden,false);assert.equal(defense.hidden,false);assert.equal(prosecution.attributes.role,undefined);assert.equal(h.get('court-tabs').hidden,true);
 h.media.matches=true;h.media.change();assert.equal(prosecution.hidden,true);assert.equal(defense.hidden,false);
});
test('breakpoint changes preserve focus inside its panel and move focus out of hidden tab bar',()=>{
 const h=harness();h.media.matches=false;h.c.setupCourtTabs(h.media);const panel=h.get('defense-panel'),field=h.get('field');panel.children.push(field);field.focus();h.media.matches=true;h.media.change();assert.equal(panel.hidden,false);assert.equal(h.get('prosecution-panel').hidden,true);
 h.get('defense-tab').focus();h.media.matches=false;h.media.change();assert.equal(h.document.activeElement,panel.querySelector('h2'));
});
for(const ending of ['cancel','escape','cancel-event','context','external-close'])test('vote dialog '+ending+' resolves false and erases private review',async()=>{
 const h=harness(),dialog=h.get('dialog'),controller=h.c.createVoteConfirmation(dialog),previous=h.get('cast');previous.focus();const pending=controller.ask('Not Guilty','A complete private explanation.');
 assert.equal(dialog.open,true);assert.equal(dialog.querySelector('[data-confirm-choice]').textContent,'Not Guilty');assert.equal(dialog.querySelector('[data-confirm-reason]').textContent,'A complete private explanation.');assert.equal(h.document.activeElement,dialog.querySelector('[data-confirm-cancel]'));
 if(ending==='cancel')dialog.querySelector('[data-confirm-cancel]').emit('click');else if(ending==='escape')dialog.emit('keydown',{key:'Escape'});else if(ending==='cancel-event')dialog.emit('cancel');else if(ending==='context')controller.cancel();else dialog.close();
 assert.equal(await pending,false);assert.equal(dialog.open,false);assert.equal(dialog.querySelector('[data-confirm-reason]').textContent,'');assert.equal(h.document.activeElement,previous);
});
test('vote dialog confirms only by its explicit action, prevents overlapping requests and traps Tab',async()=>{
 const h=harness(),dialog=h.get('dialog'),controller=h.c.createVoteConfirmation(dialog);const pending=controller.ask('Guilty','The complete justification.');assert.equal(await controller.ask('Not Guilty','Another reason.'),false);
 const cancel=dialog.querySelector('[data-confirm-cancel]'),submit=dialog.querySelector('[data-confirm-submit]');cancel.focus();dialog.emit('keydown',{key:'Tab',shiftKey:true});assert.equal(h.document.activeElement,submit);dialog.emit('keydown',{key:'Tab'});assert.equal(h.document.activeElement,cancel);
 submit.emit('click');submit.emit('click');assert.equal(await pending,true);assert.equal(dialog.querySelector('[data-confirm-choice]').textContent,'');
});
test('missing or failed dialog support fails closed',async()=>{
 const h=harness(),dialog=h.get('dialog');dialog.showModal=undefined;assert.equal(await h.c.createVoteConfirmation(dialog).ask('Guilty','Reason'),false);
 const other=h.get('other');other.showModal=()=>{throw Error('Unsupported')};assert.equal(await h.c.createVoteConfirmation(other).ask('Guilty','Private reason'),false);assert.equal(other.querySelector('[data-confirm-reason]').textContent,'');
});
test('counter limits and jury minimum match the existing rules',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','court.html'),'utf8'),rules=fs.readFileSync(path.join(__dirname,'..','firestore.rules'),'utf8');assert.match(html,/id="vote-justification" aria-describedby="justification-count"/);assert.match(rules,/reason\.trim\(\)\.size\(\) >= 15/);assert.match(rules,/reason\.size\(\) <= 2000/);assert.match(rules,/text\.size\(\) <= 5000/);
});
