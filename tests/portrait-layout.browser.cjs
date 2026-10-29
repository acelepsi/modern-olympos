// Optional real-browser regression: node tests/portrait-layout.browser.cjs
// Uses installed Chromium/Chrome (or CHROME_BIN). No packages, Firebase or remote images.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');const {pathToFileURL}=require('node:url');
const root=path.join(__dirname,'..');
const chrome=[process.env.CHROME_BIN,'/usr/lib/chromium/chromium','chromium','google-chrome','google-chrome-stable'].filter(Boolean).find(bin=>spawnSync(bin,['--version'],{encoding:'utf8'}).status===0);
if(!chrome)throw Error('Install Chrome/Chromium or set CHROME_BIN to run this optional layout test.');
const dataAsset=name=>'data:image/svg+xml,'+encodeURIComponent(fs.readFileSync(path.join(root,name),'utf8'));
const css=fs.readFileSync(path.join(root,'style.css'),'utf8').replace(/url\('([^']+\.svg)'\)/g,(_,name)=>'url("'+dataAsset(name)+'")');
const helper=fs.readFileSync(path.join(root,'portraits.js'),'utf8').replace(/^export /gm,'');
const reasoningHelper=fs.readFileSync(path.join(root,'jury-reasoning.js'),'utf8').replace(/^export /gm,'');
const caseHelper=fs.readFileSync(path.join(root,'case-content.js'),'utf8').replace(/^export /gm,'');
const courtHelper=fs.readFileSync(path.join(root,'court-ui.js'),'utf8').replace(/^export /gm,'');
const appSource=fs.readFileSync(path.join(root,'app.js'),'utf8');
const submissionRenderer=appSource.slice(appSource.indexOf('function renderMine(){'),appSource.indexOf('function refreshSubmissionListeners(){'));
const archiveSource=fs.readFileSync(path.join(root,'archive.js'),'utf8');
const archiveRenderers="const $=id=>document.getElementById(id);\n"+archiveSource.slice(archiveSource.indexOf('function node('),archiveSource.indexOf('async function loadArchive('));
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
   const sorted=chronologicalSubmissions([{data:()=>({text:'unknown'})},{data:()=>({text:'later',createdAt:{toMillis:()=>20}})},{data:()=>({text:'earlier',createdAt:{toMillis:()=>10}})}]);
   check(sorted.map(post=>post.text).join(',')==='earlier,later,unknown','chronological order with undated arguments last');
   check(validEvidence('https://example.org/source')&&!validEvidence('http://example.org/source')&&validEvidence('http://example.org/old','http://example.org/old'),'HTTPS evidence and historical HTTP compatibility');

   let frames;
   if(page==='court'){
    document.getElementById('defendant-name').textContent='Medusa — synthetic layout test';
    document.getElementById('defendant-charge').textContent='A synthetic charge / case description with clear spacing.';
    const tabs=setupCourtTabs();setupCourtCounters();renderTrialProgress('verdict');
    check(document.getElementById('phase-trial').dataset.state==='completed'&&document.getElementById('phase-verdict').getAttribute('aria-current')==='step'&&document.getElementById('phase-closed').dataset.state==='upcoming','phase states and current-step semantics');
    const pp=document.getElementById('prosecution-panel'),dp=document.getElementById('defense-panel');
    check(innerWidth<=860?(!pp.hidden&&dp.hidden):(!pp.hidden&&!dp.hidden),'responsive side visibility');
    if(innerWidth<=860){
      document.getElementById('prosecution-tab').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
      check(pp.hidden&&!dp.hidden&&document.activeElement.id==='defense-tab','mobile ArrowRight selects and focuses defense');
      document.getElementById('defense-tab').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true}));check(!pp.hidden&&dp.hidden,'mobile Home returns to prosecution');
    }else check(dp.getBoundingClientRect().left>pp.getBoundingClientRect().left,'desktop keeps two argument columns');
    document.getElementById('prosecution-composer').hidden=false;
    document.getElementById('prosecution-argument').value='A draft argument.';document.getElementById('prosecution-argument').dispatchEvent(new Event('input'));
    check(document.getElementById('prosecution-count').textContent==='17 / 5000 characters','argument counter updates on input');
    document.getElementById('jury-vote-form').hidden=false;const justification=document.getElementById('vote-justification');justification.value='short';justification.dispatchEvent(new Event('input'));
    check(document.getElementById('justification-count').dataset.state==='short','jury minimum counter is visible');
    const auth={currentUser:{uid:'synthetic-student'}},currentProfile={active:true,accountType:'student'},courtTabs=tabs;
    const mySubmissions=['pending','returned','published'].map(status=>({section:'prosecution',status,text:'A synthetic argument.',feedback:status==='returned'?'Please explain your evidence.':''}));
    ${submissionRenderer}
    renderMine();check(document.querySelectorAll('.submission-badge').length===3&&document.querySelector('.returned-feedback').textContent.includes('Please explain'),'submission badges and returned feedback render');
    check(document.getElementById('returned-count').textContent==='1 returned for revision','returned attention count');
    const dialog=document.getElementById('vote-confirmation'),controller=createVoteConfirmation(dialog),cast=document.getElementById('cast-vote');
    const completeReason='A complete synthetic explanation.\\nA second paragraph. '+ 'Evidence and reasoning. '.repeat(70);
    cast.focus();let pending=controller.ask('Not Guilty',completeReason);
    check(dialog.matches(':modal')&&dialog.querySelector('[data-confirm-reason]').textContent===completeReason,'native modal shows complete reasoning safely');
    check(document.activeElement===dialog.querySelector('[data-confirm-cancel]'),'confirmation defaults to Cancel');
    dialog.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));check(document.activeElement===dialog.querySelector('[data-confirm-submit]'),'Shift+Tab stays in dialog');
    dialog.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));check(document.activeElement===dialog.querySelector('[data-confirm-cancel]'),'Tab stays in dialog');
    const bounds=dialog.getBoundingClientRect();check(bounds.left>=0&&bounds.right<=innerWidth&&bounds.height<=innerHeight,'long ballot review fits viewport and scrolls');
    dialog.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));check(await pending===false&&!dialog.open&&document.activeElement===cast,'Escape cancels and restores focus');
    check(dialog.querySelector('[data-confirm-reason]').textContent==='','dismissal erases private dialog text');
    pending=controller.ask('Guilty','An approved synthetic explanation.');dialog.querySelector('[data-confirm-submit]').click();check(await pending===true,'only explicit final action approves review');
    const rgb=color=>(color.match(/[0-9.]+/g)||[]).map(Number),luminance=color=>{const values=rgb(color).slice(0,3).map(value=>{value/=255;return value<=.04045?value/12.92:((value+.055)/1.055)**2.4});return .2126*values[0]+.7152*values[1]+.0722*values[2]};
    for(const text of document.querySelectorAll('.trial-progress li,.submission-badge,.returned-feedback,.character-count')){
      let backdrop=text;while(backdrop&&getComputedStyle(backdrop).backgroundColor==='rgba(0, 0, 0, 0)')backdrop=backdrop.parentElement;
      const fg=luminance(getComputedStyle(text).color),bg=luminance(getComputedStyle(backdrop).backgroundColor);check((Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05)>=4.5,'courtroom feedback text contrast at least 4.5:1');
    }
    document.getElementById('dossier').scrollIntoView();
    check(document.documentElement.scrollWidth<=innerWidth,'courtroom fits viewport without horizontal scrolling');
    check(document.getElementById('dossier').contains(document.querySelector('.trial-progress'))&&document.querySelectorAll('.trial-progress').length===1,'one compact stepper belongs to the dossier');
    const emblem=document.querySelector('.site-emblem');await new Promise(done=>{if(emblem.complete)done();else{emblem.onload=done;emblem.onerror=done}});check(emblem.naturalWidth>0&&emblem.getBoundingClientRect().width<=48,'original shared emblem loads at navigation size');
    for(const width of [320,375,768,1024,1280]){
      const phone=document.createElement('iframe');phone.style.cssText='position:fixed;left:-10000px;width:'+width+'px;height:1200px;border:0';document.body.append(phone);
      const phoneDoc=phone.contentDocument;phoneDoc.open();phoneDoc.write('<!doctype html><html><head><style>'+document.querySelector('style').textContent+'</style></head><body>'+document.querySelector('.site-header').outerHTML+document.getElementById('dossier').outerHTML+'</body></html>');phoneDoc.close();
      check(phone.contentWindow.innerWidth===width,'true '+width+'px viewport');
      const title=phoneDoc.getElementById('defendant-name'),portrait=phoneDoc.getElementById('mugshot'),progress=phoneDoc.querySelector('.trial-progress'),dossier=phoneDoc.getElementById('dossier');
      for(const long of [false,true]){
        title.textContent=long?'Prometheus and the Assembly of Mythological Witnesses — '+ 'Averylongunbrokenmythologicalname'.repeat(5):'Medusa';
        check(phoneDoc.documentElement.scrollWidth<=width,'header fits '+width+'px with '+(long?'long':'short')+' title');
        const db=dossier.getBoundingClientRect(),pb=progress.getBoundingClientRect(),tb=title.getBoundingClientRect(),mb=portrait.getBoundingClientRect();
        check(pb.left>=db.left&&pb.right<=db.right&&pb.top>=db.top&&pb.bottom<=db.bottom,'stepper remains inside dossier '+width);
        check(width>1100?pb.left>=tb.right:pb.top>=tb.bottom,'stepper uses right desktop / secondary responsive placement '+width);
        for(const step of phoneDoc.querySelectorAll('.trial-progress li')){const box=step.getBoundingClientRect(),label=step.lastElementChild.getBoundingClientRect();check(label.left>=box.left-.1&&label.right<=box.right+.1,'phase label stays inside compact step at '+width)}
        check(mb.right<=tb.left&&mb.bottom<=db.bottom,'portrait stays separate from long title '+width);
      }
      portrait.textContent='Ω';check(portrait.getBoundingClientRect().width===(width<=600?104:width<=1100?128:152),'missing portrait retains responsive frame '+width);
      const frameStyle=phone.contentWindow.getComputedStyle(portrait,'::after');check(frameStyle.pointerEvents==='none'&&frameStyle.backgroundImage.includes('data:image/svg+xml'),'local ornamental frame stays decorative '+width);
      const titleColor=phone.contentWindow.getComputedStyle(title).color,chargeColor=phone.contentWindow.getComputedStyle(phoneDoc.getElementById('defendant-charge')).color;
      // Bound text against a deliberately brighter surface than the dark architecture overlay.
      const limit=luminance('rgb(70, 65, 55)');for(const color of [titleColor,chargeColor])check((luminance(color)+.05)/(limit+.05)>=4.5,'dossier text contrast against conservative background bound '+width);
      const before=phone.contentWindow.getComputedStyle(dossier,'::before');check(before.backgroundImage.includes('linear-gradient')&&before.backgroundImage.includes('data:image/svg+xml'),'local architecture uses a dark gradient overlay '+width);
      phone.remove();
    }
    frames=[document.getElementById('mugshot')];
   }else{
    document.getElementById('archive-detail').hidden=false;
    document.getElementById('archive-title').textContent='Medusa — synthetic archive test';
    renderArgument(document.getElementById('archive-prosecution'),{authorName:'Prosecution Alias',text:'A published argument.\\n\\nA second paragraph.'});
    renderArgument(document.getElementById('archive-defense'),{authorName:'Defense Alias',text:'A published defense with readable contrast.'});
    renderTally({guilty:2,notGuilty:1});
    renderReasoningCards([{id:'ABCDEFGHIJKLMNOPQRST',data:()=>({choice:'guilty',reason:'A reviewed anonymous explanation for guilt.'})},{id:'ZYXWVUTSRQPONMLKJIHG',data:()=>({choice:'not-guilty',reason:'A reviewed anonymous explanation for acquittal.'})}]);
    const rgb=color=>(color.match(/[0-9.]+/g)||[]).map(Number);
    const luminance=color=>{const values=rgb(color).slice(0,3).map(value=>{value/=255;return value<=.04045?value/12.92:((value+.055)/1.055)**2.4});return .2126*values[0]+.7152*values[1]+.0722*values[2]};
    for(const text of document.querySelectorAll('.archive-argument-text,.archive-alias,.reasoning-text,.reasoning-choice,.archive-total span,.archive-total strong')){
     let backdrop=text;while(backdrop&&getComputedStyle(backdrop).backgroundColor==='rgba(0, 0, 0, 0)')backdrop=backdrop.parentElement;
     const fg=luminance(getComputedStyle(text).color),bg=luminance(getComputedStyle(backdrop).backgroundColor);
     check((Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05)>=4.5,'archive text contrast at least 4.5:1');
    }
    const paragraphStyle=getComputedStyle(document.querySelector('.archive-argument-text'));check(paragraphStyle.whiteSpace==='pre-wrap'&&parseFloat(paragraphStyle.lineHeight)>=1.5*parseFloat(paragraphStyle.fontSize),'argument paragraphs preserve line breaks and readable spacing');
    const prosecution=document.querySelector('.archive-side-prosecution').getBoundingClientRect(),defense=document.querySelector('.archive-side-defense').getBoundingClientRect();
    check(innerWidth<=720?defense.top>=prosecution.bottom:defense.left>=prosecution.right,'arguments stack on narrow screens and form desktop columns');
    const caseFile=document.querySelector('.archive-page').getBoundingClientRect();check(caseFile.right<=innerWidth&&caseFile.left>=0,'case file fits viewport');

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
    const expected=page==='court'?(innerWidth<=600?104:innerWidth<=1100?128:152):(frame.classList.contains('archive-thumbnail')?48:76);
    const expectedHeight=page==='court'?(innerWidth<=600?96:innerWidth<=1100?116:136):expected;
    check(Math.abs(box.width-expected)<0.1&&Math.abs(box.height-expectedHeight)<0.1,'fixed frame '+expected+'px');
    check(picture.left>=box.left-0.1&&picture.top>=box.top-0.1&&picture.right<=box.right+0.1&&picture.bottom<=box.bottom+0.1,'image stays inside frame');
    check(style.position==='absolute'&&style.objectFit===(page==='court'?'contain':'cover')&&style.objectPosition==='50% 50%','centered cover resists generic image positioning');
    check(box.width===before.width&&box.height===before.height,'no load size shift');
    const header=document.querySelector('.site-header').getBoundingClientRect();check(box.top>=header.bottom,'frame remains below navigation');
    img.onerror();check(frame.textContent==='Ω'&&!frame.querySelector('img'),'image failure restores Ω');
    const after=frame.getBoundingClientRect();check(after.width===box.width&&after.height===box.height,'fallback preserves frame size');
    renderPortrait(frame,null);check(frame.textContent==='Ω','missing portrait retains Ω');
   }
   return {page,width:innerWidth,checks};
  })().then(report=>{const output=document.createElement('pre');output.id='layout-report';output.textContent=encodeURIComponent(JSON.stringify(report));document.body.append(output)}).catch(error=>{const output=document.createElement('pre');output.id='layout-report';output.textContent=encodeURIComponent(JSON.stringify({error:error.message}));document.body.append(output)});
  `;
  new Function(script); // Catch fixture syntax errors before launching Chrome.
  // Real page markup/styles, but remove application scripts so no Firebase service is touched.
  let html=fs.readFileSync(path.join(root,page+'.html'),'utf8').replace(/src="olympos-emblem.svg"/g,()=>"src=\""+dataAsset('olympos-emblem.svg')+"\"").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  const csp=`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:">`;
  html=html.replace('<head>','<head>'+csp).replace(/<link[^>]*href="style\.css[^\"]*"[^>]*>/,()=>'<style>'+css+'</style>');
  // A low-specificity conflicting rule must not float the portrait over the page.
  html=html.replace('</head>','<style>img{position:fixed;top:0;left:0;width:4096px;height:6144px;max-width:none;object-fit:fill}</style></head>');
  html=html.replace('</body>',()=>'<script>'+helper+'\n'+caseHelper+'\n'+(page==='court'?courtHelper:'')+'\n'+(page==='archive'?reasoningHelper+'\n'+archiveRenderers:'')+'\n'+script+'</script></body>');
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
