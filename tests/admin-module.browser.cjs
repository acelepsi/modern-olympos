// Loads the real administrator ES module graph; only Firebase boundaries are synthetic.
// Import specifiers/bindings remain intact, so missing imports fail at runtime.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
const chrome=[process.env.CHROME_BIN,'/usr/lib/chromium/chromium','chromium','google-chrome','google-chrome-stable'].filter(Boolean).find(bin=>spawnSync(bin,['--version'],{encoding:'utf8'}).status===0);
assert.ok(chrome,'Install Chrome or set CHROME_BIN.');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'olympos-admin-module-')),errors=[];
const sdk=`
const records=new Map([
 ['students/synthetic-admin',{displayName:'Synthetic Teacher',accountType:'teacher',active:true}],
 ['students/synthetic-student',{displayName:'Synthetic Alias',accountType:'student',active:true}],
 ['schools/existing-school',{name:'Existing School',countryCode:'TR',active:true}],
 ['trials/synthetic-trial',{title:'Synthetic Trial',status:'trial'}]
]);
window.syntheticWrites=[];window.syntheticReads=[];window.syntheticDeletes=[];window.syntheticFail=[];window.syntheticSet=(key,data)=>data===null?records.delete(key):records.set(key,data);const callbacks=[];let sequence=0;
const auth={currentUser:{uid:'synthetic-admin'}},db={};
export function initializeFirebaseClient(){return {app:{},auth,db}}
export function initializeApp(){return {}}
export async function deleteApp(){}
export function getAuth(){return auth}
export function initializeAuth(){return auth}
export const inMemoryPersistence={};
export function connectAuthEmulator(){}
export function getFirestore(){return db}
export function connectFirestoreEmulator(){}
export function onAuthStateChanged(_,callback){callbacks.push(callback);queueMicrotask(()=>callback(auth.currentUser));return()=>{}}
export async function signOut(){auth.currentUser=null;await Promise.all(callbacks.map(callback=>callback(null)))}
export async function signInWithEmailAndPassword(){throw Error('Account creation/login outside this synthetic test')}
export async function createUserWithEmailAndPassword(){throw Error('Student accounts must not change')}
export async function deleteUser(){throw Error('Student accounts must not change')}
export function collection(_, ...parts){return {path:parts.join('/')}}
export function doc(base,...parts){return parts.length?{path:parts.join('/'),id:parts.at(-1)}:{path:base.path+'/school'+(++sequence),id:'school'+sequence}}
export function where(...args){return args}
export function query(base,...filters){return {...base,filters}}
function snapshot(ref){return {id:ref.id,exists:()=>records.has(ref.path),data:()=>records.get(ref.path),metadata:{fromCache:false,hasPendingWrites:false}}}
export async function getDoc(ref){return snapshot(ref)}
export const getDocFromServer=getDoc;
export async function getDocs(ref){window.syntheticReads.push(ref.path);if(window.syntheticFail.includes(ref.path))throw Error('Synthetic unavailable');const prefix=ref.path+'/';const docs=[...records.keys()].filter(key=>key.startsWith(prefix)&&!key.slice(prefix.length).includes('/')).filter(key=>(ref.filters||[]).every(([field,op,value])=>op==='=='&&records.get(key)[field]===value)).map(key=>snapshot({path:key,id:key.split('/').at(-1)}));return {metadata:{fromCache:false,hasPendingWrites:false},docs,size:docs.length}}
export const getDocsFromServer=getDocs;
export async function setDoc(ref,data){window.syntheticWrites.push({path:ref.path,data});records.set(ref.path,data)}
export async function updateDoc(ref,data){await setDoc(ref,{...records.get(ref.path),...data})}
export async function deleteDoc(ref){window.syntheticDeletes.push(ref.path);records.delete(ref.path)}
export function onSnapshot(ref,next){queueMicrotask(()=>next(snapshot(ref)));return()=>{}}
export async function runTransaction(_,callback){return callback({get:getDoc,set:setDoc,update:updateDoc,delete:deleteDoc})}
export class Timestamp{toMillis(){return 0}}
`;
const allowed=new Set(['admin.html','index.html','mock-sdk.js',...fs.readdirSync(root).filter(name=>/\.(js|css|svg)$/.test(name))]);
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname.slice(1)||'admin.html';
 if(!allowed.has(name)){res.writeHead(404);return res.end()}
 let body=name==='mock-sdk.js'?sdk:read(name);
 // Keep the fixture offline without expected font-policy console errors.
 if(name.endsWith('.css'))body=body.replace(/@import\s+url\([^;]+;/g,'');
 if(name==='admin.html'||name==='index.html'){
  const imports=Object.fromEntries(['app','auth','firestore'].map(part=>['https://www.gstatic.com/firebasejs/13.1.0/firebase-'+part+'.js','/mock-sdk.js']));
  imports['/firebase-client.js']='/mock-sdk.js';
  body=body.replace('<head>','<head><link rel="icon" href="data:,"><script type="importmap">'+JSON.stringify({imports})+'</script>');
 }
 res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':'text/html');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'");
 res.end(body);
});
const browser=spawn(chrome,['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--remote-debugging-pipe',`--user-data-dir=${path.join(tmp,'profile')}`],{stdio:['ignore','ignore','pipe','pipe','pipe']});
let serial=0,buffer='',session,checks=0,stderr='';const pending=new Map();browser.stderr.on('data',data=>{stderr=(stderr+data).slice(-3000)});
browser.stdio[4].on('data',data=>{buffer+=data;let end;while((end=buffer.indexOf('\0'))>=0){const message=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);if(message.method==='Runtime.exceptionThrown')errors.push(JSON.stringify(message.params.exceptionDetails));if(message.method==='Runtime.consoleAPICalled'&&message.params.type==='error')errors.push(JSON.stringify(message.params.args));if(message.method==='Log.entryAdded'&&message.params.entry.level==='error')errors.push(message.params.entry.text);if(pending.has(message.id)){const item=pending.get(message.id);pending.delete(message.id);clearTimeout(item.timer);message.error?item.reject(Error(JSON.stringify(message.error))):item.resolve(message.result)}}});
function send(method,params={},target=session){return new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('Chrome timeout: '+method+' '+stderr))},20000);pending.set(id,{resolve,reject,timer});browser.stdio[3].write(JSON.stringify({id,method,params,...target?{sessionId:target}:{}})+'\0')})}
async function evaluate(expression){const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value}
function check(ok,label){assert.ok(ok,label);checks++}
async function navigate(url){await send('Page.navigate',{url});for(let i=0;i<80;i++){try{if(await evaluate(`location.href===${JSON.stringify(url)}&&document.readyState==='complete'`))return}catch{}await new Promise(resolve=>setTimeout(resolve,25))}throw Error('Fixture load timeout')}

async function waitFor(expression,label){for(let i=0;i<100;i++){if(errors.length)throw Error(errors.join('\n'));if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,30))}throw Error('Timed out: '+label)}
(async()=>{
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const target=await send('Target.createTarget',{url:'about:blank'},null);session=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true},null)).sessionId;
  await send('Page.enable');await send('Runtime.enable');await send('Log.enable');
  await navigate(`http://127.0.0.1:${server.address().port}/admin.html`);
  await waitFor("document.getElementById('school-feedback').textContent.includes('Directory loaded')&&!document.getElementById('dashboard').hidden",'full administrator initialization');
  check(errors.length===0,'no JavaScript initialization or console errors');
  check(await evaluate("document.getElementById('trial-select').value==='synthetic-trial'&&document.getElementById('account-rows').textContent.includes('Synthetic Alias')&&document.getElementById('vote-count').textContent.includes('0 ballot(s)')&&document.getElementById('roles-status').textContent.includes('synthetic-trial')&&document.getElementById('review-list').textContent.includes('No pending submissions')&&!document.getElementById('entry-editor').disabled"),'existing trial, student and encyclopedia initialization');
  for(const country of ['TR','RO','GR']){
   await evaluate("document.getElementById('school-select').value='existing-school';document.getElementById('school-select').dispatchEvent(new Event('change'));document.getElementById('school-new').click()");
   check(await evaluate("!document.getElementById('school-editor').disabled&&document.getElementById('school-name').value===''&&document.getElementById('school-select').value===''"),'Add school actually resets/enables editor '+country);
   await evaluate(`document.getElementById('school-name').value='Synthetic ${country} School';document.getElementById('school-country').value='${country}';document.getElementById('school-form').requestSubmit()`);
   await waitFor(`document.getElementById('school-select').textContent.includes('Synthetic ${country} School')`,'school saved '+country);
   check(await evaluate(`['school-select','student-school','affiliation-school'].every(id=>document.getElementById(id).textContent.includes('Synthetic ${country} School'))`),'saved school available in directory and assignment dropdowns '+country);
  }
  check(await evaluate("window.syntheticWrites.length===3&&window.syntheticWrites.every(write=>write.path.startsWith('schools/'))&&document.getElementById('school-feedback').textContent.includes('School saved')"),'only synthetic school records written');
  // Exercise query/where in the real controller, not merely their import bindings.
  await evaluate("document.getElementById('school-name').value='Updated Synthetic School';document.getElementById('school-form').requestSubmit()");
  await waitFor("document.getElementById('student-school').textContent.includes('Updated Synthetic School')",'existing-school query path');
  check(await evaluate("!window.syntheticWrites.some(write=>write.path.startsWith('publicSchools/'))"),'saving private schools never publishes automatically');
  await evaluate("window.confirm=()=>false;document.getElementById('school-publish').click()");
  check(await evaluate("!window.syntheticWrites.some(write=>write.path.startsWith('publicSchools/'))"),'cancelled school publication writes nothing');
  await evaluate("window.confirm=()=>true;document.getElementById('school-publish').click()");
  await waitFor("document.getElementById('school-public-status').textContent.startsWith('Published')",'explicit school publication');
  check(await evaluate("Object.keys(window.syntheticWrites.find(write=>write.path.startsWith('publicSchools/')).data).sort().join(',')==='countryCode,name'"),'public school copy contains no student metadata');
  await evaluate("document.getElementById('school-name').value='Renamed Published School';document.getElementById('school-country').value='RO';document.getElementById('school-form').requestSubmit()");
  await waitFor("window.syntheticWrites.some(write=>write.path.startsWith('publicSchools/')&&write.data.name==='Renamed Published School'&&write.data.countryCode==='RO')",'published rename/country synchronization');
  await evaluate("document.getElementById('school-active').checked=false;document.getElementById('school-form').requestSubmit()");
  await waitFor("window.syntheticDeletes.some(key=>key.startsWith('publicSchools/'))&&!document.getElementById('school-public-status').textContent.startsWith('Published')",'deactivation removes public copy');
  check(await evaluate("document.getElementById('school-publish').disabled"),'inactive school cannot be published');
  await evaluate("document.getElementById('logout').click()");
  await waitFor("document.getElementById('dashboard').hidden&&document.getElementById('school-editor').disabled",'existing sign out');
  check(await evaluate("document.getElementById('school-name').value===''&&document.getElementById('student-school').options.length===0"),'sign out clears private school editor');
  check(errors.length===0,'no unexpected JavaScript console errors throughout school management');
  await navigate(`http://127.0.0.1:${server.address().port}/index.html`);
  await waitFor("document.getElementById('international-schools').textContent==='0'&&document.getElementById('international-trials').textContent==='1'",'empty approved directory and actual trial count');
  check(await evaluate("document.querySelectorAll('.international-country').length===0&&document.getElementById('international-directory-status').textContent.includes('after administrator approval')"),'empty directory remains compact and truthful');
  await evaluate("window.syntheticSet('publicSchools/tr-a',{name:'Synthetic Türkiye School A',countryCode:'TR'});window.syntheticSet('publicSchools/tr-b',{name:'Synthetic Türkiye School B',countryCode:'TR'});window.syntheticSet('publicSchools/ro',{name:'Synthetic Romania School',countryCode:'RO'});window.syntheticSet('publicSchools/gr',{name:'Synthetic Greece School',countryCode:'GR'});window.syntheticSet('trials/voting',{title:'Voting case',status:'verdict'});window.syntheticSet('trials/closed',{title:'Closed case',status:'closed'});document.getElementById('international-refresh').click()");
  await waitFor("document.getElementById('international-schools').textContent==='4'&&document.getElementById('international-trials').textContent==='3'",'counts derive from public records');
  check(await evaluate("document.getElementById('international-countries').textContent==='3'&&document.querySelectorAll('.international-country').length===3&&document.querySelectorAll('.international-country li').length===4"),'all approved schools grouped under their actual countries');
  check(await evaluate("window.syntheticReads.every(key=>['publicSchools','trials'].includes(key))&&!document.querySelector('.international-court').textContent.includes('Synthetic Alias')"),'homepage never reads private profiles/directory or student metadata');
  await waitFor("[...document.querySelectorAll('.international-country img')].every(img=>img.complete&&img.naturalWidth>0)",'local flags');
  check(await evaluate("[...document.querySelectorAll('.international-country img')].every(img=>img.getAttribute('src').startsWith('flag-')&&img.alt.startsWith('Flag of '))"),'local flags have accessible alternative text');
  for(const width of [320,375,768,1024,1280]){
   await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
   check(await evaluate("document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('.international-country')].every(el=>el.getBoundingClientRect().right<=innerWidth)"),'international council fits '+width+'px');
   check(await evaluate("(()=>{const cards=[...document.querySelectorAll('.international-country')].map(el=>el.getBoundingClientRect());return innerWidth>800?cards.every(box=>Math.abs(box.top-cards[0].top)<1):cards.every((box,i)=>!i||box.top>=cards[i-1].bottom)})()"),'country card desktop/mobile arrangement '+width+'px');
  }
  check(await evaluate(`(()=>{const lum=c=>{const v=c.match(/[0-9.]+/g).slice(0,3).map(n=>{n=Number(n)/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4});return .2126*v[0]+.7152*v[1]+.0722*v[2]};return [...document.querySelectorAll('.international-court h2,.international-country h3,.international-country li,.international-note,.international-statistics dt,.international-statistics dd')].every(el=>{let bg=el;while(bg&&getComputedStyle(bg).backgroundColor==='rgba(0, 0, 0, 0)')bg=bg.parentElement;const a=lum(getComputedStyle(el).color),b=lum(getComputedStyle(bg).backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5})})()`),'international text meets 4.5:1 contrast');
  await evaluate("document.getElementById('international-refresh').focus()");check(await evaluate("document.activeElement.id==='international-refresh'&&getComputedStyle(document.activeElement).outlineStyle!=='none'"),'refresh supports keyboard focus');
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});check(await evaluate("getComputedStyle(document.querySelector('.international-country')).animationName==='none'"),'international cards respect reduced motion');
  await evaluate("window.syntheticSet('publicSchools/tr-a',null);window.syntheticSet('publicSchools/tr-b',null);window.syntheticSet('publicSchools/gr',null);window.syntheticSet('publicSchools/ro',{name:'Renamed Romanian Partner',countryCode:'RO'});document.getElementById('international-refresh').click()");
  await waitFor("document.getElementById('international-schools').textContent==='1'",'one-country directory refresh');
  check(await evaluate("document.querySelectorAll('.international-country').length===1&&document.getElementById('international-countries').textContent==='1'&&document.querySelector('.international-country li').textContent==='Renamed Romanian Partner'"),'renames/removals and one-country empty states');
  await evaluate("window.syntheticFail=['publicSchools'];document.getElementById('international-refresh').click()");await waitFor("document.getElementById('international-directory-status').textContent.includes('unavailable')",'directory failure');check(await evaluate("document.getElementById('international-schools').textContent==='—'&&document.querySelectorAll('.international-country').length===0&&document.getElementById('international-trials').textContent==='3'"),'failed directory clears stale school data while trials remain accurate');
  await evaluate("window.syntheticFail=['trials'];document.getElementById('international-refresh').click()");await waitFor("document.getElementById('international-trial-status').textContent.includes('unavailable')",'trial failure');check(await evaluate("document.getElementById('international-trials').textContent==='—'&&document.getElementById('international-schools').textContent==='1'"),'trial failure does not fabricate a count or hide approved partners');
  check(errors.length===0,'no unexpected browser errors in administrator or public homepage');
  console.log(`PASS administrator module: ${checks} real Chrome administrator initialization/school publication/homepage checks`);
 }finally{server.closeAllConnections();server.close();browser.kill('SIGTERM');for(const item of pending.values())clearTimeout(item.timer);setTimeout(()=>fs.rmSync(tmp,{recursive:true,force:true,maxRetries:3,retryDelay:100}),300).unref()}
})().catch(error=>{console.error(error);process.exitCode=1});
