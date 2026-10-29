const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
test('landing uses only local, documented original still artwork without background requests or motion',()=>{
 const html=read('index.html');assert.doesNotMatch(html,/picsum|unsplash|https?:\/\//i);assert.equal((html.match(/class="hero-slide /g)||[]).length,1);assert.match(html,/mythological-entrance\.svg/);assert.match(read('mythological-entrance.svg'),/<title>Original museum entrance/);assert.ok(Buffer.byteLength(read('mythological-entrance.svg'))<6000);assert.match(read('PACKAGE_B.md'),/CC0 1\.0/);
 const source=read('landing.js');for(const reduce of [false,true]){let intervals=0;vm.runInNewContext(source,{document:{querySelectorAll:()=>[{}]},window:{matchMedia:()=>({matches:reduce})},setInterval:()=>{intervals++}});assert.equal(intervals,0)}
});
test('all administrator controls and warning hooks remain in the organized visible workspace',()=>{
 const html=read('admin.html');for(const id of ['login-form','email','password','switch-account','dashboard','logout','student-account-form','student-code','student-name','student-password','account-rows','new-trial','trial-form','trial-id','trial-title','trial-charge','trial-portrait-url','trial-status','trial-select','activate-trial','student-rows','refresh-roles','refresh-submissions','review-list','refresh-votes','vote-count','publish-verdict','load-reasoning','reasoning-review-list','reasoning-review-status','status'])assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 for(const id of ['manage-trials','manage-students','manage-roles','manage-review','manage-verdict']){assert.match(html,new RegExp('href="#'+id+'" data-workspace-link'));assert.match(html,new RegExp('id="'+id+'" class="workspace-group" tabindex="-1"'))}
 assert.match(html,/Closed — permanent/);assert.match(html,/Final tally publication is permanent/);assert.match(html,/<section id="dashboard" hidden>/);
});
test('workspace anchor navigation exposes active location and restores keyboard focus without hiding tools',()=>{
 const links=['#manage-trials','#manage-review'].map(hash=>({hash,attributes:{},setAttribute(k,v){this.attributes[k]=v},removeAttribute(k){delete this.attributes[k]}}));let focused,handler;
 const doc={querySelectorAll:()=>links,getElementById:id=>({focus:()=>{focused=id}})},view={location:{hash:''},addEventListener:(_,fn)=>{handler=fn}},c={};vm.createContext(c);vm.runInContext(read('admin-workspace.js').replace(/^export /gm,''),c);c.setupWorkspaceNavigation(doc,view);assert.equal(links[0].attributes['aria-current'],'location');view.location.hash='#manage-review';handler();assert.equal(links[1].attributes['aria-current'],'location');assert.equal(links[0].attributes['aria-current'],undefined);assert.equal(focused,'manage-review');
});
test('native print uses the public archive only and has no extra reads',()=>{
 const source=read('archive.js'),handler=source.slice(source.indexOf("$('print-case-file').addEventListener"),source.indexOf("$('archive-refresh').addEventListener"));assert.match(handler,/window\.print\(\)/);assert.doesNotMatch(handler,/getDocs|collection|students|votes|reasoningReviews/);
 const css=read('archive-print.css');assert.match(css,/@media print/);assert.match(css,/break-inside:avoid-page/);assert.match(css,/\[hidden\]\{display:none!important/);assert.match(css,/aria-busy=true/);assert.match(css,/\.site-header/);assert.match(css,/background:#fff!important/);assert.match(read('archive.html'),/id="print-case-file"[^>]*disabled/);
});
test('polish assets are included in the build and remain dependency free',()=>{
 const {PUBLIC_FILES}=require('../scripts/prepare-site.cjs');for(const name of ['mythological-entrance.svg','admin-workspace.js','admin-workspace.css','archive-print.css'])assert.ok(PUBLIC_FILES.includes(name));assert.doesNotMatch(read('admin-workspace.js'),/firebase|fetch\(|onSnapshot|setDoc|updateDoc/);
});
