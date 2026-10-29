const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),c={URL};vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(root,'case-content.js'),'utf8').replace(/^export /gm,''),c);
test('sorting is nonmutating, stable for ties and robust to missing/malformed timestamps',()=>{
 const stamp=n=>({toMillis:()=>n}),posts=[{text:'unknown'},{text:'late',createdAt:stamp(30)},{text:'early',createdAt:stamp(10)},{text:'tie',createdAt:stamp(10)},{text:'nan',createdAt:stamp(NaN)},{text:'bad',createdAt:{toMillis:()=>{throw Error('bad')}}},{text:'string',createdAt:'yesterday'},{text:'infinite',createdAt:stamp(Infinity)}],docs=posts.map(post=>({data:()=>post}));
 const ordered=c.chronologicalSubmissions(docs);assert.deepEqual(Array.from(ordered,p=>p.text),['early','tie','late','unknown','nan','bad','string','infinite']);assert.equal(docs[0].data(),posts[0]);assert.equal(posts[1].createdAt.toMillis(),30);
});
for(const value of ['', 'Description', 'x'.repeat(2000)])test('valid optional charge '+value.length,()=>assert.equal(c.caseCharge(value),value));
for(const value of [null,42,{},'x'.repeat(2001)])test('invalid charge '+typeof value,()=>assert.throws(()=>c.caseCharge(value)));
for(const value of ['https://example.org/source','HTTPS://example.org/source',''])test('new valid evidence '+value,()=>assert.equal(c.validEvidence(value),true));
for(const value of ['http://example.org/source','https://','https://bad host/a','https://user:pass@example.org/a','javascript:alert(1)','https://example.org/'+ 'x'.repeat(1000)])test('reject new evidence '+value.slice(0,40),()=>assert.equal(c.validEvidence(value),false));
test('unchanged HTTP source is retained; changed HTTP source is rejected',()=>{assert.equal(c.validEvidence('http://example.org/a','http://example.org/a'),true);assert.equal(c.validEvidence('http://example.org/b','http://example.org/a'),false)});
test('all browser Firebase modules match the installed test SDK version',()=>{
 const version=require('../package.json').devDependencies.firebase;let count=0;
 for(const name of ['app.js','admin.js','archive.js','encyclopedia.js'])for(const match of fs.readFileSync(path.join(root,name),'utf8').matchAll(/www\.gstatic\.com\/firebasejs\/([^/]+)\//g)){assert.equal(match[1],version);count++}
 assert.equal(count,12);assert.equal(require('../node_modules/firebase/package.json').version,version);
});
