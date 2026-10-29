const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
function element(){return {children:[],textContent:'',attributes:{},replaceChildren(...items){this.children=items;this.textContent=''},setAttribute(k,v){this.attributes[k]=v}}}
let requests=0;const context={URL,document:{createElement:()=>{const item=element();Object.defineProperty(item,'src',{get(){return this.source},set(value){requests++;this.source=value}});return item}}};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'portraits.js'),'utf8').replace(/^export /gm,''),context);
for(const value of [undefined,null,'','   '])test('legacy Ω fallback '+String(value),()=>{const host=element(),before=requests;context.renderPortrait(host,value);assert.equal(host.textContent,'Ω');assert.equal(host.children.length,0);assert.equal(requests,before)});
for(const value of ['http://example.org/a.jpg','javascript:alert(1)','data:image/png;base64,abc','//example.org/a.jpg','not a URL','https://user:password@example.org/a.jpg',123,'https://example.org/'+ 'a'.repeat(2000)])test('invalid portrait makes no image request '+String(value).slice(0,50),()=>{const host=element(),before=requests;assert.throws(()=>context.portraitUrl(value));context.renderPortrait(host,value);assert.equal(host.textContent,'Ω');assert.equal(requests,before)});
test('valid HTTPS image normalizes URL, suppresses referrer and falls back on error',()=>{const host=element();context.renderPortrait(host,' HTTPS://images.example/athena.jpg ','Athena portrait');const image=host.children[0];assert.equal(image.src,'https://images.example/athena.jpg');assert.equal(image.alt,'Athena portrait');assert.equal(image.referrerPolicy,'no-referrer');image.onerror();assert.equal(host.textContent,'Ω');assert.equal(host.children.length,0)});
test('old image error cannot replace the next trial portrait',()=>{const host=element();context.renderPortrait(host,'https://example.org/old.jpg');const old=host.children[0];context.renderPortrait(host,'https://example.org/new.jpg');old.onerror();assert.equal(host.children[0].src,'https://example.org/new.jpg')});
test('styles preserve active dimensions, image cover and mobile divider behavior',()=>{const css=fs.readFileSync(path.join(root,'style.css'),'utf8'),court=fs.readFileSync(path.join(root,'court.html'),'utf8');assert.match(css,/\.dossier \.mugshot\s*\{[^}]*width: 136px;[^}]*height: 136px;/);assert.match(css,/\.dossier \.mugshot > img,[\s\S]*?object-fit:cover;object-position:center/);assert.match(css,/grid-template-columns: 1fr 12px 1fr/);assert.match(css,/@media \(max-width: 860px\)[\s\S]*?\.divider \{ display: none; \}/);assert.doesNotMatch(court,/Burgundy Seal|Indigo Seal/);assert.match(court,/>Prosecution<\/h2>/);assert.match(court,/>Defense<\/h2>/)});

test('portrait frames constrain desktop/mobile and archive images without changing the fallback helper',()=>{
 const css=fs.readFileSync(path.join(root,'style.css'),'utf8');
 assert.match(css,/\.dossier \.mugshot\s*\{[^}]*min-width: 136px;[^}]*max-height: 136px;[^}]*position: relative;[^}]*overflow: hidden;/);
 assert.match(css,/position:absolute;inset:0;display:block;width:100%;height:100%/);
 assert.match(css,/@media\(max-width:600px\)\{\s*\.dossier \.mugshot\{width:96px;height:96px/);
 assert.match(css,/\.archive-thumbnail\.trial-portrait\{width:48px;height:48px/);
 assert.match(css,/\.archive-character-portrait\.trial-portrait\{width:76px;height:76px/);
 assert.match(fs.readFileSync(path.join(root,'court.html'),'utf8'),/style\.css\?v=package-b-1/);assert.match(fs.readFileSync(path.join(root,'archive.html'),'utf8'),/style\.css\?v=package-b-1/);
});
