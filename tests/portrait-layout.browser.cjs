// Optional real-browser regression: node tests/portrait-layout.browser.cjs
// Uses installed Chromium/Chrome (or CHROME_BIN). No packages, Firebase or remote images.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');const {pathToFileURL}=require('node:url');
const root=path.join(__dirname,'..');
const chrome=[process.env.CHROME_BIN,'/usr/lib/chromium/chromium','chromium','google-chrome','google-chrome-stable'].filter(Boolean).find(bin=>spawnSync(bin,['--version'],{encoding:'utf8'}).status===0);
if(!chrome)throw Error('Install Chrome/Chromium or set CHROME_BIN to run this optional layout test.');
const css=fs.readFileSync(path.join(root,'style.css'),'utf8');
const helper=fs.readFileSync(path.join(root,'portraits.js'),'utf8').replace(/^export /gm,'');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'olympos-portrait-layout-'));
try{
 for(const page of ['court','archive'])for(const narrow of [false,true]){
  const script=`
  (async()=>{
   const checks=[];function check(ok,message){if(!ok)throw Error(message);checks.push(message)}
   const source=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
   // Redirect the validated synthetic HTTPS source to an in-memory oversized image.
   const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="4096" height="6144"><rect width="4096" height="6144" fill="seagreen"/></svg>');
   Object.defineProperty(HTMLImageElement.prototype,'src',{...source,set(){this.loading="eager";source.set.call(this,image)}});
   const page=${JSON.stringify(page)};
   let frames;
   if(page==='court'){
    document.getElementById('defendant-name').textContent='Medusa — synthetic layout test';
    frames=[document.getElementById('mugshot')];
   }else{
    document.getElementById('archive-detail').hidden=false;
    document.getElementById('archive-title').textContent='Medusa — synthetic archive test';
    const thumbnail=document.createElement('span');thumbnail.className='trial-portrait archive-thumbnail';
    const link=document.createElement('a');link.append(thumbnail,document.createTextNode('Medusa'));
    const item=document.createElement('li');item.append(link);document.getElementById('archive-list').append(item);
    frames=[thumbnail,document.getElementById('archive-portrait')];
   }
   for(const frame of frames){
    const before=frame.getBoundingClientRect();
    renderPortrait(frame,'https://synthetic.invalid/medusa.svg','Synthetic Medusa portrait');
    const img=frame.firstElementChild;await new Promise(done=>setTimeout(done,100));check(img.complete&&img.naturalWidth===4096,'oversized synthetic image loaded');
    const box=frame.getBoundingClientRect(),picture=img.getBoundingClientRect(),style=getComputedStyle(img);
    const expected=page==='court'?(innerWidth<=600?72:90):(frame.classList.contains('archive-thumbnail')?48:76);
    check(Math.abs(box.width-expected)<0.1&&Math.abs(box.height-expected)<0.1,'fixed frame '+expected+'px');
    check(picture.left>=box.left-0.1&&picture.top>=box.top-0.1&&picture.right<=box.right+0.1&&picture.bottom<=box.bottom+0.1,'image stays inside frame');
    check(style.position==='absolute'&&style.objectFit==='cover'&&style.objectPosition==='50% 50%','centered cover resists generic image positioning');
    check(box.width===before.width&&box.height===before.height,'no load size shift');
    const header=document.querySelector('.site-header').getBoundingClientRect();check(box.top>=header.bottom,'frame remains below navigation');
    img.onerror();check(frame.textContent==='Ω'&&!frame.querySelector('img'),'image failure restores Ω');
    const after=frame.getBoundingClientRect();check(after.width===box.width&&after.height===box.height,'fallback preserves frame size');
    renderPortrait(frame,null);check(frame.textContent==='Ω','missing portrait retains Ω');
   }
   return {page,width:innerWidth,checks};
  })().then(report=>{const output=document.createElement('pre');output.id='layout-report';output.textContent=encodeURIComponent(JSON.stringify(report));document.body.append(output)}).catch(error=>{const output=document.createElement('pre');output.id='layout-report';output.textContent=encodeURIComponent(JSON.stringify({error:error.message}));document.body.append(output)});
  `;
  // Real page markup/styles, but remove application scripts so no Firebase service is touched.
  let html=fs.readFileSync(path.join(root,page+'.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  const csp=`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:">`;
  html=html.replace('<head>','<head>'+csp).replace(/<link[^>]*href="style\.css[^\"]*"[^>]*>/,()=>'<style>'+css+'</style>');
  // A low-specificity conflicting rule must not float the portrait over the page.
  html=html.replace('</head>','<style>img{position:fixed;top:0;left:0;width:4096px;height:6144px;max-width:none;object-fit:fill}</style></head>');
  html=html.replace('</body>','<script>'+helper+'\n'+script+'</script></body>');
  const file=path.join(temporary,`${page}-${narrow}.html`);fs.writeFileSync(file,html);
  const args=['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run',`--user-data-dir=${path.join(temporary,page+'-'+narrow+'-profile')}`,'--dump-dom','--virtual-time-budget=3000',`--window-size=${narrow?'390,1000':'1280,1000'}`,pathToFileURL(file).href];
  const cache=path.join(temporary,'cache');fs.mkdirSync(cache,{recursive:true});
  const result=spawnSync(chrome,args,{encoding:'utf8',timeout:30000,maxBuffer:5*1024*1024,env:{...process.env,XDG_CACHE_HOME:cache}});
  assert.equal(result.status,0,result.error?.message||result.stderr.slice(-1000));
  const match=result.stdout.match(/<pre id="layout-report">([^<]*)<\/pre>/);assert.ok(match,'Browser fixture did not complete: '+result.stdout.slice(-1200)+' '+result.stderr.slice(-500));
  const report=JSON.parse(decodeURIComponent(match[1]));assert.ok(!report.error,`${page}/${narrow}: ${report.error}`);
  console.log(`PASS ${page} at ${report.width}px: ${report.checks.length} layout/fallback checks`);
 }
}finally{fs.rmSync(temporary,{recursive:true,force:true})}
