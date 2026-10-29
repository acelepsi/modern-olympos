// Real Chrome via its built-in DevTools pipe: no packages, Firebase or external assets.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
const root=path.join(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
const chrome=[process.env.CHROME_BIN,'/usr/lib/chromium/chromium','chromium','google-chrome','google-chrome-stable'].filter(Boolean).find(bin=>spawnSync(bin,['--version'],{encoding:'utf8'}).status===0);
assert.ok(chrome,'Install Chrome or set CHROME_BIN.');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'olympos-polish-')),asset=name=>'data:image/svg+xml,'+encodeURIComponent(read(name));
const css=read('style.css').replace(/url\('([^']+\.svg)'\)/g,(_,name)=>'url("'+asset(name)+'")');
function fixture(page){
 let html=read(page+'.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/src="olympos-emblem.svg"/g,()=>`src="${asset('olympos-emblem.svg')}"`).replace(/url\('mythological-entrance.svg'\)/g,()=>`url(&quot;${asset('mythological-entrance.svg')}&quot;)`);
 html=html.replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:">');
 html=html.replace(/<link[^>]*href="([^"?]+)(?:\?[^\"]*)?"[^>]*>/g,(_,name)=>'<style'+(name==='archive-print.css'?' media="print"':'')+'>'+(name==='style.css'?css:read(name))+'</style>');
 let script='';
 if(page==='admin')script=read('admin-workspace.js').replace(/^export /gm,'')+`;document.getElementById('dashboard').hidden=false;document.getElementById('login-panel').hidden=true;document.getElementById('account-rows').innerHTML='<tr><td>Synthetic Public Alias</td><td>Active</td><td><button>Pause</button></td></tr>';document.getElementById('student-rows').innerHTML='<tr><td>Synthetic Alias</td><td><select><option>Prosecutor</option></select></td><td><button>Save role</button></td></tr>';`;
 if(page==='archive'){
  const source=read('archive.js'),renderers=source.slice(source.indexOf('function node('),source.indexOf('async function loadArchive('));
  script=read('jury-reasoning.js').replace(/^export /gm,'')+"\nconst $=id=>document.getElementById(id);\n"+renderers+`;document.getElementById('archive-page').setAttribute('aria-busy','false');document.getElementById('archive-detail').hidden=false;document.getElementById('archive-browser').hidden=true;document.getElementById('archive-title').textContent='Prometheus — a synthetic educational case file';document.getElementById('archive-info').textContent='A public synthetic charge.';renderTally({guilty:2,notGuilty:1});renderArgument(document.getElementById('archive-prosecution'),{authorName:'Public Prosecution Alias',text:'A published argument.\\n\\nA second paragraph.'});renderArgument(document.getElementById('archive-defense'),{authorName:'Public Defense Alias',text:'A published defense.'});renderReasoningCards([{id:'ABCDEFGHIJKLMNOPQRST',data:()=>({choice:'guilty',reason:'Approved anonymous reasoning for the public case file.'})}]);`;
 }
 html=html.replace('</body>',()=>'<script>'+script+'</script></body>');const file=path.join(tmp,page+'.html');fs.writeFileSync(file,html);return pathToFileURL(file).href;
}
const browser=spawn(chrome,['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--remote-debugging-pipe',`--user-data-dir=${path.join(tmp,'profile')}`],{stdio:['ignore','ignore','pipe','pipe','pipe']});
let serial=0,buffer='',session,checks=0,stderr='';const pending=new Map();browser.stderr.on('data',data=>{stderr=(stderr+data).slice(-3000)});
browser.stdio[4].on('data',data=>{buffer+=data;let end;while((end=buffer.indexOf('\0'))>=0){const message=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);if(pending.has(message.id)){const item=pending.get(message.id);pending.delete(message.id);clearTimeout(item.timer);message.error?item.reject(Error(JSON.stringify(message.error))):item.resolve(message.result)}}});
function send(method,params={},target=session){return new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('Chrome timeout: '+method+' '+stderr))},20000);pending.set(id,{resolve,reject,timer});browser.stdio[3].write(JSON.stringify({id,method,params,...target?{sessionId:target}:{}})+'\0')})}
async function evaluate(expression){const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value}
function check(ok,label){assert.ok(ok,label);checks++}
async function navigate(url){await send('Page.navigate',{url});for(let i=0;i<80;i++){try{if(await evaluate(`location.href===${JSON.stringify(url)}&&document.readyState==='complete'`))return}catch{}await new Promise(resolve=>setTimeout(resolve,25))}throw Error('Fixture load timeout')}
(async()=>{
 try{
  const target=await send('Target.createTarget',{url:'about:blank'},null);session=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true},null)).sessionId;await send('Page.enable');
  for(const page of ['index','admin','archive']){
   await navigate(fixture(page));
   for(const width of [320,375,768,1024,1280]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
    check(await evaluate('document.documentElement.scrollWidth<=innerWidth'),page+' fits '+width+'px');
    if(page==='index'){
     check(await evaluate("getComputedStyle(document.querySelector('.hero-slide')).backgroundImage.includes('data:image/svg+xml')"),'local landing artwork '+width);
     check(await evaluate("document.querySelector('.hero-title').getBoundingClientRect().right<=innerWidth"),'landing title '+width);
    }
    if(page==='admin'){
     check(await evaluate("['trial-form','student-account-form','refresh-roles','refresh-submissions','refresh-votes','publish-verdict','load-reasoning'].every(id=>document.getElementById(id).getClientRects().length>0)"),'all administrator tools visible '+width);
     check(await evaluate("[...document.querySelectorAll('input,textarea,select')].every(node=>{const box=node.getBoundingClientRect();return !!node.closest('.table-scroll')||box.right<=innerWidth})"),'forms fit '+width);
     await evaluate("document.querySelector('[href=\"#manage-review\"]').click()");
     await new Promise(resolve=>setTimeout(resolve,30));check(await evaluate("document.querySelector('[href=\"#manage-review\"]').getAttribute('aria-current')==='location'&&document.activeElement.id==='manage-review'"),'anchor focus/active section '+width);
     await evaluate("location.hash='' ");
    }
   }
   await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
   check(await evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches"),'reduced-motion media '+page);
   if(page==='index')check(await evaluate("getComputedStyle(document.querySelector('.hero-slide')).transitionDuration==='0s'"),'landing reduced motion has no transition');
   if(page==='archive'){
    await send('Emulation.setEmulatedMedia',{media:'print'});
    check(await evaluate("getComputedStyle(document.querySelector('.site-header')).display==='none'&&getComputedStyle(document.getElementById('print-case-file')).display==='none'"),'print hides navigation and buttons');
    check(await evaluate("getComputedStyle(document.querySelector('.print-case-brand')).display==='flex'"),'print includes one branded case header');
    check(await evaluate("getComputedStyle(document.querySelector('.archive-page')).backgroundColor==='rgb(255, 255, 255)'&&getComputedStyle(document.querySelector('.archive-argument-text')).color==='rgb(23, 23, 23)'"),'print uses light pages and dark text');
    check(await evaluate("getComputedStyle(document.querySelector('.argument-card')).breakInside==='avoid-page'&&getComputedStyle(document.querySelector('.archive-columns')).display==='block'"),'print page breaks and linear arguments');
    check(await evaluate("document.getElementById('archive-title').textContent.includes('Prometheus')&&document.querySelector('.archive-alias').textContent==='Public Prosecution Alias'&&document.querySelector('.reasoning-card h3').textContent==='Juror #1'&&document.getElementById('archive-outcome').textContent.includes('Guilty')"),'print uses public case content and anonymous reasoning');
    await evaluate("document.getElementById('archive-detail').hidden=true");check(await evaluate("getComputedStyle(document.getElementById('archive-detail')).display==='none'"),'hidden cases cannot leak into print');await evaluate("document.getElementById('archive-detail').hidden=false;document.getElementById('archive-page').setAttribute('aria-busy','true')");check(await evaluate("getComputedStyle(document.getElementById('archive-detail')).display==='none'"),'incomplete refresh suppresses print detail');await evaluate("document.getElementById('archive-page').setAttribute('aria-busy','false')");
    const pdf=await send('Page.printToPDF',{printBackground:false,preferCSSPageSize:true});const bytes=Buffer.from(pdf.data,'base64');check(bytes.subarray(0,5).toString()==='%PDF-'&&bytes.length>5000,'native Chrome print produces a public case-file PDF');
   }
   await send('Emulation.setEmulatedMedia',{media:'screen',features:[]});
   if(process.env.VISUAL_OUTPUT){fs.mkdirSync(process.env.VISUAL_OUTPUT,{recursive:true});const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(process.env.VISUAL_OUTPUT,page+'.png'),Buffer.from(shot.data,'base64'))}
  }
  console.log(`PASS platform polish: ${checks} real Chrome layout/navigation/reduced-motion/print checks`);
 }finally{browser.kill('SIGTERM');for(const item of pending.values())clearTimeout(item.timer);setTimeout(()=>fs.rmSync(tmp,{recursive:true,force:true,maxRetries:3,retryDelay:100}),300).unref()}
})().catch(error=>{console.error(error);process.exitCode=1});
