// Offline real Chrome: actual court markup, CSS and roster ES modules, synthetic snapshots.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');const {spawn,spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..'),read=name=>fs.readFileSync(path.join(process.env.HERO_BASELINE_DIR&&['style.css','court.html'].includes(name)?process.env.HERO_BASELINE_DIR:root,name),'utf8'),errors=[];
const chrome=[process.env.CHROME_BIN,'/usr/lib/chromium/chromium','chromium','google-chrome','google-chrome-stable'].filter(Boolean).find(bin=>spawnSync(bin,['--version'],{encoding:'utf8'}).status===0);assert.ok(chrome,'Install Chrome or set CHROME_BIN.');const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'olympos-roster-'));
const allowed=new Set(['court.html',...fs.readdirSync(root).filter(file=>/\.(js|css|svg)$/.test(file))]);
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1)||'court.html';if(!allowed.has(name)){res.writeHead(404);return res.end()}
 let body=read(name);if(name.endsWith('.css'))body=body.replace(/@import\s+url\([^)]*\);/g,'');if(name==='court.html')body=body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace('<head>','<head><link rel="icon" href="data:,">').replace('</body>',`<script type="module">import {setupCourtRoster} from './court-roster.js';window.rosterSubscriptions=[];window.roster=setupCourtRoster({subscribe:(trial,next,error)=>{const item={trial,next,error};window.rosterSubscriptions.push(item);return()=>{item.stopped=true}}});window.emitRoster=(data,metadata={fromCache:false,hasPendingWrites:false})=>window.rosterSubscriptions.at(-1).next({docs:data.map(member=>({data:()=>member})),metadata});window.roster.select('trial-a');</script></body>`);
 res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':'text/html');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'");res.end(body);
});
const browser=spawn(chrome,['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--remote-debugging-pipe',`--user-data-dir=${path.join(tmp,'profile')}`],{stdio:['ignore','ignore','pipe','pipe','pipe']});
let serial=0,buffer='',session,checks=0,stderr='';const pending=new Map();browser.stderr.on('data',data=>{stderr=(stderr+data).slice(-3000)});
browser.stdio[4].on('data',data=>{buffer+=data;let end;while((end=buffer.indexOf('\0'))>=0){const message=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);if(message.method==='Runtime.exceptionThrown')errors.push(JSON.stringify(message.params.exceptionDetails));if(message.method==='Runtime.consoleAPICalled'&&message.params.type==='error')errors.push(JSON.stringify(message.params.args));if(message.method==='Log.entryAdded'&&message.params.entry.level==='error')errors.push(message.params.entry.text);if(pending.has(message.id)){const item=pending.get(message.id);pending.delete(message.id);clearTimeout(item.timer);message.error?item.reject(Error(JSON.stringify(message.error))):item.resolve(message.result)}}});
function send(method,params={},target=session){return new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('Chrome timeout: '+method+' '+stderr))},20000);pending.set(id,{resolve,reject,timer});browser.stdio[3].write(JSON.stringify({id,method,params,...target?{sessionId:target}:{}})+'\0')})}
async function evaluate(expression){const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value}
function check(ok,label){assert.ok(ok,label);checks++}
async function navigate(url){await send('Page.navigate',{url});for(let i=0;i<80;i++){try{if(await evaluate(`location.href===${JSON.stringify(url)}&&document.readyState==='complete'`))return}catch{}await new Promise(resolve=>setTimeout(resolve,25))}throw Error('Fixture load timeout')}



const baseline=!!process.env.HERO_BASELINE_DIR,metrics=[];
const caseText='This synthetic case asks the court to consider responsibility, intent and the evidence presented by both sides. Each claim should be supported by a clear argument.\n\nThe prosecution and defense will offer different interpretations. Jurors should compare their reasoning carefully before reaching a final decision.';
async function inspect(){return evaluate(`(()=>{const box=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}},d=document.getElementById('dossier'),c=document.getElementById('defendant-charge');return {pageWidth:document.documentElement.clientWidth,dossier:box('dossier'),title:box('defendant-name'),portrait:box('mugshot'),charge:box('defendant-charge'),progress:(()=>{const r=document.querySelector('.trial-progress').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}})(),handle:box('view-court-roster'),argumentTop:document.getElementById('prosecution-panel').getBoundingClientRect().top,roomLeft:document.querySelector('.trial-room').getBoundingClientRect().left,scrollWidth:document.documentElement.scrollWidth,text:c.textContent,textHeight:c.clientHeight,textScroll:c.scrollHeight,measure:parseFloat(getComputedStyle(c).maxWidth),headingAlign:getComputedStyle(document.querySelector('.defendant-info')).textAlign}})()`)}
function overlap(a,b){return a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y}
(async()=>{try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const target=await send('Target.createTarget',{url:'about:blank'},null);session=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true},null)).sessionId;await send('Page.enable');await send('Runtime.enable');await send('Log.enable');await navigate(`http://127.0.0.1:${server.address().port}/court.html`);
 for(let i=0;i<100&&!await evaluate('!!window.roster');i++)await new Promise(resolve=>setTimeout(resolve,20));
 for(const width of [375,768,1024,1440,1920]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
  await evaluate(`window.scrollTo(0,0);document.getElementById('defendant-name').textContent='Medusa — A Case Before the Court';document.getElementById('defendant-charge').textContent=${JSON.stringify(caseText)}`);
  const m=await inspect();metrics.push({width,...m});
  check(m.scrollWidth<=width,'no horizontal overflow '+width);check(m.text===caseText&&m.textScroll<=m.textHeight+1,'complete text and paragraph breaks '+width);
  if(!baseline){
   check(m.roomLeft===0&&m.dossier.x===0,'no courtroom gutter '+width);
   check(m.headingAlign==='center'&&m.title.bottom<=Math.min(m.portrait.y,m.charge.y),'full heading above portrait/narrative '+width);
   check(Math.abs((m.title.x+m.title.right)/2-m.pageWidth/2)<=1,'heading centered in viewport '+width);
   check(m.progress.y>=Math.max(m.portrait.bottom,m.charge.bottom)&&Math.abs((m.progress.x+m.progress.right)/2-m.pageWidth/2)<=1,'centered progress below case '+width);
   check(!overlap(m.handle,m.title)&&!overlap(m.handle,m.portrait)&&!overlap(m.handle,m.charge)&&!overlap(m.handle,m.progress),'handle clear of dossier content '+width);
   check(m.handle.x===0&&m.handle.width>=44&&m.handle.height>=44,'edge handle remains an accessible touch target '+width);
   check(m.argumentTop<=1000,'normal case reaches argument sections within first viewport '+width);
   if(width>600){check(m.portrait.right<=m.charge.x,'portrait and narrative side by side '+width);check(m.charge.width<=m.measure+1,'narrative limited to 78-character measure '+width)}
   else check(m.portrait.bottom<=m.charge.y&&Math.abs((m.portrait.x+m.portrait.right)/2-m.pageWidth/2)<=1,'mobile portrait/narrative stack centered '+width);
  }
  if(process.env.HERO_SCREENSHOT_DIR){fs.mkdirSync(process.env.HERO_SCREENSHOT_DIR,{recursive:true});const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(process.env.HERO_SCREENSHOT_DIR,`dossier-${width}.png`),Buffer.from(shot.data,'base64'))}
  // Long future content must grow the hero naturally, never hide or clip words.
  const long=caseText.repeat(5);await evaluate(`document.getElementById('defendant-charge').textContent=${JSON.stringify(long)};document.getElementById('defendant-name').textContent='Medusa and the Mythological Assembly — '+'AnUnbrokenMythologicalName'.repeat(6)`);const longer=await inspect();check(longer.scrollWidth<=width&&longer.text===long&&longer.textScroll<=longer.textHeight+1,'long title/description have no clipping '+width);check(longer.dossier.height>m.dossier.height,'long descriptions expand rather than clip '+width);
  if(!baseline){
   // Revealed forms are synthetic; scrolling them into view must not put them under a fixed handle.
   await evaluate("document.getElementById('prosecution-composer').hidden=false;document.getElementById('jury-vote-form').hidden=false;document.getElementById('prosecution-composer').scrollIntoView()");
   check(await evaluate("(()=>{const h=document.getElementById('view-court-roster').getBoundingClientRect();return [...document.querySelectorAll('.composer input,.composer textarea,.composer button,#jury-vote-form textarea,#jury-vote-form button')].filter(el=>el.getClientRects().length).every(el=>{const r=el.getBoundingClientRect();return h.right<=r.left||h.left>=r.right||h.bottom<=r.top||h.top>=r.bottom})})()"),'handle never covers interactive forms while scrolling '+width);
   await evaluate("document.getElementById('prosecution-composer').hidden=true;document.getElementById('jury-vote-form').hidden=true;window.scrollTo(0,0)");
  }
 }
 if(process.env.HERO_SCREENSHOT_DIR)fs.writeFileSync(path.join(process.env.HERO_SCREENSHOT_DIR,'metrics.json'),JSON.stringify(metrics,null,2));
 check(errors.length===0,'no unexpected browser initialization errors');console.log(`PASS ${baseline?'baseline screenshots':'final dossier'}: ${checks} real Chrome layout checks`);
 }finally{server.closeAllConnections();server.close();browser.kill('SIGTERM');for(const item of pending.values())clearTimeout(item.timer);setTimeout(()=>fs.rmSync(tmp,{recursive:true,force:true,maxRetries:3,retryDelay:100}),300).unref()}
})().catch(error=>{console.error(error);process.exitCode=1});
