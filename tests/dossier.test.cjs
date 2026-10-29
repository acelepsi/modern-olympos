const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
for(const name of ['olympos-emblem.svg','portrait-frame.svg','courtroom-architecture.svg'])test('original local artwork is small and self-contained: '+name,()=>{
 const svg=read(name);assert.match(svg,/<svg[^>]*viewBox=/);assert.match(svg,/<title>/);assert.ok(Buffer.byteLength(svg)<6000);assert.doesNotMatch(svg,/<(?:script|foreignObject|image)\b|onload=|https?:\/\/(?!www\.w3\.org\/2000\/svg)/i);for(const match of svg.matchAll(/href="([^"]+)"/g))assert.ok(match[1].startsWith('#'));
 assert.ok(require('../scripts/prepare-site.cjs').PUBLIC_FILES.includes(name));assert.match(read('VISUAL_ASSETS.md'),/CC0 1\.0 Universal/);
});
for(const name of ['index.html','court.html','archive.html','who-is-who.html'])test('shared emblem replaces only site branding: '+name,()=>{
 const html=read(name);assert.match(html,/<img class="site-emblem[^>]*src="olympos-emblem\.svg"[^>]*width="\d+" height="\d+" alt="" aria-hidden="true"/);assert.doesNotMatch(html,/<div class="seal-mini/);
 if(name==='court.html')assert.match(html,/id="mugshot"[^>]*>Ω<\/div>/);
 if(name==='archive.html')assert.match(html,/id="archive-portrait"[^>]*>Ω<\/div>/);
});
test('stepper is part of the dossier and preserves every existing functional hook',()=>{
 const html=read('court.html'),header=html.slice(html.indexOf('<header class="dossier"'),html.indexOf('</header>',html.indexOf('<header class="dossier"')));
 assert.equal((html.match(/class="trial-progress"/g)||[]).length,1);assert.match(header,/class="trial-progress"/);for(const id of ['phase-trial','phase-verdict','phase-closed','trial-phase-status','mugshot','defendant-name','defendant-charge'])assert.ok(header.includes(`id="${id}"`));assert.match(header,/aria-label="Trial progress"/);
});
test('architectural artwork is court-only and portraits use a noncropping inset',()=>{
 const css=read('style.css');assert.match(css,/\.dossier::before\{[^}]*linear-gradient[^}]*courtroom-architecture\.svg/);assert.match(css,/\.dossier \.mugshot>img\{[^}]*object-fit:contain/);assert.match(css,/\.dossier \.mugshot::after\{[^}]*pointer-events:none[^}]*portrait-frame\.svg/);assert.match(css,/\.dossier \.trial-progress small\{[^}]*clip:/);assert.match(css,/@media\(max-width:1100px\)/);assert.match(css,/@media\(max-width:600px\)/);
});
