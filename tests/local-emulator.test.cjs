// Real SDK integration, strictly local demo emulators. Not part of network-free unit tests.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const appSdk = require('firebase/app');
const authSdk = require('firebase/auth');
const storeSdk = require('firebase/firestore');
const { seedLocal } = require('../scripts/seed-local.cjs');
const { PROJECT } = require('../scripts/local-settings.cjs');
const clients = new Map(), apps = [];
let accounts;
before(async () => {
  accounts = await seedLocal();
  const source = fs.readFileSync(path.join(__dirname, '..', 'firebase-client.js'), 'utf8').replace('export function', 'function');
  for (const account of accounts) {
    const context = { location: { hostname: '127.0.0.1', protocol: 'http:' }, __OLYMPOS_LOCAL_TEST__: true,
      sdk: { ...appSdk, ...authSdk, ...storeSdk, initializeApp: config => appSdk.initializeApp(config, account.role) } };
    vm.createContext(context); vm.runInContext(source, context);
    const client = vm.runInContext('initializeFirebaseClient(sdk)', context); apps.push(client.app);
    assert.equal(client.app.options.projectId, PROJECT);
    await authSdk.signInWithEmailAndPassword(client.auth, account.email, account.password);
    clients.set(account.role, client);
  }
});
after(async () => { await Promise.all(apps.map(app => appSdk.deleteApp(app))); });
const ref = (role, key) => storeSdk.doc(clients.get(role).db, key);
const account = role => accounts.find(a => a.role === role);
test('real synthetic administrator can list accounts and manage a trial under substituted local rules', async () => {
  const rows = await storeSdk.getDocs(storeSdk.collection(clients.get('admin').db, 'students')); assert.equal(rows.size, 5);
  await storeSdk.setDoc(ref('admin', 'trials/created-in-browser-test'), { title: 'Synthetic additional case', status: 'trial' });
  await storeSdk.updateDoc(ref('admin', 'trials/created-in-browser-test'), { title: 'Updated synthetic case' });
});
test('real student login can read own draft but observer cannot', async () => {
  const key = 'trials/local-preparation/submissions/private-prosecutor';
  assert.equal((await storeSdk.getDoc(ref('prosecutor', key))).data().status, 'draft');
  await assert.rejects(storeSdk.getDoc(ref('observer', key)), error => error.code === 'permission-denied');
});
test('real defender login sees the seeded pending submission and observer reads published content', async () => {
  assert.equal((await storeSdk.getDoc(ref('defender', 'trials/local-preparation/submissions/private-defender'))).data().status, 'pending');
  const published = await storeSdk.getDocs(storeSdk.query(storeSdk.collection(clients.get('observer').db, 'trials/local-preparation/submissions'), storeSdk.where('status', '==', 'published')));
  assert.equal(published.size, 2);
});
test('real juror can vote once while observer cannot vote', async () => {
  const ballot = { choice: 'guilty', reason: 'Synthetic browser integration reasoning.', castAt: storeSdk.serverTimestamp() };
  const key = `trials/local-voting/votes/${account('juror').uid}`;
  await storeSdk.setDoc(ref('juror', key), ballot);
  await assert.rejects(storeSdk.setDoc(ref('juror', key), ballot), error => error.code === 'permission-denied');
  await assert.rejects(storeSdk.setDoc(ref('observer', `trials/local-voting/votes/${account('observer').uid}`), ballot), error => error.code === 'permission-denied');
});
test('seeded empty trial rejects zero-vote publication and closed trial rejects reopening', async () => {
  await assert.rejects(storeSdk.updateDoc(ref('admin', 'trials/local-empty'), { verdictSummary: { guilty: 0, notGuilty: 0 } }), error => error.code === 'permission-denied');
  await assert.rejects(storeSdk.updateDoc(ref('admin', 'trials/local-closed'), { status: 'verdict' }), error => error.code === 'permission-denied');
});
test('administrator can provision student access and pause participation without altering the teacher account',async()=>{
 const teacher=clients.get('admin'),uid=teacher.auth.currentUser.uid;
 const app=appSdk.initializeApp({projectId:PROJECT,apiKey:'demo-only-not-a-real-api-key'},'student-provision-integration');
 const auth=authSdk.initializeAuth(app,{persistence:authSdk.inMemoryPersistence});authSdk.connectAuthEmulator(auth,'http://127.0.0.1:9099');
 try{
  const created=await authSdk.createUserWithEmailAndPassword(auth,'extra-student@students.demo-modern-olympos.invalid','SyntheticPassword123!');
  await storeSdk.setDoc(storeSdk.doc(teacher.db,'students',created.user.uid),{displayName:'New Alias',active:true,accountType:'student'});
  assert.equal(teacher.auth.currentUser.uid,uid);
  await storeSdk.updateDoc(storeSdk.doc(teacher.db,'students',created.user.uid),{active:false});
  assert.equal((await storeSdk.getDoc(storeSdk.doc(teacher.db,'students',created.user.uid))).data().active,false);
 }finally{await appSdk.deleteApp(app)}
});
test('real administrator can publish and withdraw an anonymous copy without exposing private ballot identities',async()=>{
 const {reviewReasoning}=await import(require('node:url').pathToFileURL(path.join(__dirname,'..','jury-reasoning.js')).href);
 const admin=clients.get('admin'),jurorId=account('juror').uid;let publicId=storeSdk.doc(storeSdk.collection(admin.db,'trials/local-published/publicReasoning')).id;
 const trialRef=ref('admin','trials/local-published'),ballotRef=ref('admin',`trials/local-published/votes/${jurorId}`);
 const originalVote=(await storeSdk.getDoc(ballotRef)).data(),originalTally=(await storeSdk.getDoc(trialRef)).data().verdictSummary;
 const api={current:()=>true,identifiers:accounts.map(a=>a.uid),newId:()=>publicId,trial:trialRef,ballot:ballotRef,review:ref('admin',`trials/local-published/reasoningReviews/${jurorId}`),publicCopy:id=>ref('admin',`trials/local-published/publicReasoning/${id}`),run:callback=>storeSdk.runTransaction(admin.db,callback)};
 try{await Promise.all([reviewReasoning(true,'An approved anonymous explanation for the public archive.',api),reviewReasoning(true,'An approved anonymous explanation for the public archive.',{...api,newId:()=>storeSdk.doc(storeSdk.collection(admin.db,'trials/local-published/publicReasoning')).id})]);}catch(error){error.message='Concurrent approval: '+error.message;throw error}
 publicId=(await storeSdk.getDoc(api.review)).data().publicId;assert.equal((await storeSdk.getDocs(storeSdk.collection(admin.db,'trials/local-published/publicReasoning'))).size,1);
 const anonymousApp=appSdk.initializeApp({projectId:PROJECT,apiKey:'demo-only-not-a-real-api-key'},'anonymous-reasoning-reader');apps.push(anonymousApp);
 const anonymousDb=storeSdk.getFirestore(anonymousApp);storeSdk.connectFirestoreEmulator(anonymousDb,'127.0.0.1',8080);
 const result=await storeSdk.getDoc(storeSdk.doc(anonymousDb,`trials/local-published/publicReasoning/${publicId}`));assert.deepEqual(Object.keys(result.data()).sort(),['choice','reason']);
 await assert.rejects(storeSdk.getDoc(storeSdk.doc(anonymousDb,`trials/local-published/votes/${jurorId}`)),error=>error.code==='permission-denied');
 await assert.rejects(storeSdk.getDoc(storeSdk.doc(anonymousDb,`trials/local-published/reasoningReviews/${jurorId}`)),error=>error.code==='permission-denied');
 try{await reviewReasoning(false,'',api);}catch(error){error.message='Withdrawal: '+error.message;throw error}assert.equal((await storeSdk.getDoc(storeSdk.doc(anonymousDb,`trials/local-published/publicReasoning/${publicId}`))).exists(),false);
 assert.deepEqual((await storeSdk.getDoc(ballotRef)).data(),originalVote);assert.deepEqual((await storeSdk.getDoc(trialRef)).data().verdictSummary,originalTally);
});

test('real trial charge and chronological published feed preserve historical evidence under local rules',async()=>{
 const {chronologicalSubmissions,validEvidence}=await import(require('node:url').pathToFileURL(path.join(__dirname,'..','case-content.js')).href);
 const key='trials/local-preparation';await storeSdk.updateDoc(ref('admin',key),{charge:'Synthetic case description'});
 assert.equal((await storeSdk.getDoc(ref('observer',key))).data().charge,'Synthetic case description');
 await assert.rejects(storeSdk.updateDoc(ref('observer',key),{charge:'Unauthorized'}),error=>error.code==='permission-denied');
 const privateKey=key+'/submissions/private-prosecutor';const original=(await storeSdk.getDoc(ref('prosecutor',privateKey))).data();
 await assert.rejects(storeSdk.updateDoc(ref('prosecutor',privateKey),{evidenceUrl:'http://example.org/new'}),error=>error.code==='permission-denied');
 const evidenceUrl='https://example.org/source';assert.equal(validEvidence(evidenceUrl),true);
 await storeSdk.updateDoc(ref('prosecutor',privateKey),{text:'Updated synthetic argument',evidenceUrl,status:'pending',feedback:''});
 await storeSdk.updateDoc(ref('admin',privateKey),{status:'published',feedback:''});
 const snapshot=await storeSdk.getDocs(storeSdk.query(storeSdk.collection(clients.get('observer').db,key+'/submissions'),storeSdk.where('status','==','published')));
 const ordered=chronologicalSubmissions(snapshot.docs);for(let i=1;i<ordered.length;i++)assert.ok(ordered[i-1].createdAt.toMillis()<=ordered[i].createdAt.toMillis());
 const saved=(await storeSdk.getDoc(ref('prosecutor',privateKey))).data();assert.equal(saved.createdAt.toMillis(),original.createdAt.toMillis());assert.equal(saved.evidenceUrl,evidenceUrl);
});

test('real shared administrator client manages encyclopedia while public and students remain read-only',async()=>{
 const {validateEntry}=await import(require('node:url').pathToFileURL(path.join(__dirname,'..','encyclopedia-data.js')).href);
 const entry=validateEntry({name:'Synthetic Character',tradition:'A synthetic tradition',introduction:'A teacher-written introduction.',biography:'Synthetic biography.',actions:'Synthetic actions.',perspectives:'Synthetic alternative perspectives.',sources:'Teacher-written synthetic citation.',portraitUrl:'',relatedTrialId:'local-closed',status:'draft'});
 const key='encyclopedia/integration-character';await storeSdk.setDoc(ref('admin',key),entry);await assert.rejects(storeSdk.getDoc(ref('observer',key)),error=>error.code==='permission-denied');
 await storeSdk.updateDoc(ref('admin',key),{status:'published'});assert.equal((await storeSdk.getDoc(ref('observer',key))).data().name,'Synthetic Character');
 const published=await storeSdk.getDocs(storeSdk.query(storeSdk.collection(clients.get('observer').db,'encyclopedia'),storeSdk.where('status','==','published')));assert.equal(published.size,1);
 await assert.rejects(storeSdk.updateDoc(ref('observer',key),{name:'Tampered'}),error=>error.code==='permission-denied');await assert.rejects(storeSdk.deleteDoc(ref('observer',key)),error=>error.code==='permission-denied');
 await storeSdk.updateDoc(ref('admin',key),{status:'draft'});await assert.rejects(storeSdk.getDoc(ref('observer',key)),error=>error.code==='permission-denied');await storeSdk.deleteDoc(ref('admin',key));
});

test('real school publication is opt-in; token transaction cannot re-enable a withdrawn permission',async()=>{
 const {saveSchoolAffiliation,enableSchoolPermission,reserveSchoolPermission}=await import(require('node:url').pathToFileURL(path.join(__dirname,'..','school-data.js')).href);
 const admin=clients.get('admin'),student=account('prosecutor').uid,school='integration-school';await storeSdk.setDoc(ref('admin','schools/'+school),{name:'Synthetic School',countryCode:'GR',active:true});
 const api={current:()=>true,read:parts=>storeSdk.getDocFromServer(ref('admin',parts.join('/'))),newToken:()=> 'ABCDEFGHIJKLMNOPQRST',assign:(uid,data,expected)=>reserveSchoolPermission(uid,data,expected,{current:()=>true,profileRef:uid=>ref('admin','students/'+uid),run:callback=>storeSdk.runTransaction(admin.db,callback)}),trials:async()=>[{id:'local-preparation'}],submissions:async(trial,uid)=>{const result=await storeSdk.getDocs(storeSdk.query(storeSdk.collection(admin.db,'trials/'+trial+'/submissions'),storeSdk.where('authorUid','==',uid)));return result.docs.map(item=>({id:item.id,...item.data()}))},copy:(trial,id,data)=>storeSdk.setDoc(ref('admin',`trials/${trial}/attributions/${id}`),data),enable:(uid,schoolId,token,schoolData)=>enableSchoolPermission(uid,schoolId,token,schoolData,{current:()=>true,profileRef:uid=>ref('admin','students/'+uid),schoolRef:id=>ref('admin','schools/'+id),run:callback=>storeSdk.runTransaction(admin.db,callback)})};
 await saveSchoolAffiliation(student,school,false,api);assert.equal((await storeSdk.getDoc(ref('admin','students/'+student))).data().publicSchool,false);
 const result=await saveSchoolAffiliation(student,school,true,api);assert.ok(result.count>=1);const copyPath='trials/local-preparation/attributions/published-prosecutor';const copy=await storeSdk.getDoc(ref('observer',copyPath));assert.deepEqual(Object.keys(copy.data()).sort(),['countryCode','schoolName']);
 let deny;const revoked=new Promise(resolve=>{deny=resolve});const unsubscribe=storeSdk.onSnapshot(ref('observer',copyPath),{includeMetadataChanges:true},()=>{},error=>deny(error));
 await storeSdk.updateDoc(ref('admin','students/'+student),{publicSchool:false,schoolConsentVersion:'ZYXWVUTSRQPONMLKJIHG'});
 const freshApp=appSdk.initializeApp({projectId:PROJECT,apiKey:'demo-only-not-a-real-api-key'},'fresh-school-public-reader');apps.push(freshApp);const freshDb=storeSdk.getFirestore(freshApp);storeSdk.connectFirestoreEmulator(freshDb,'127.0.0.1',8080);
 await assert.rejects(storeSdk.getDocFromServer(storeSdk.doc(freshDb,copyPath)),error=>error.code==='permission-denied');
 const error=await Promise.race([revoked,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Revocation listener timed out')),7000);timer.unref()})]);assert.equal(error.code,'permission-denied');unsubscribe();await assert.rejects(storeSdk.getDocFromServer(ref('observer',copyPath)),error=>error.code==='permission-denied');
 const originalEnable=api.enable;api.enable=async(...args)=>{await storeSdk.updateDoc(ref('admin','students/'+student),{publicSchool:false,schoolConsentVersion:'ZYXWVUTSRQPONMLKJIHG'});return originalEnable(...args)};await assert.rejects(saveSchoolAffiliation(student,school,true,api),/Affiliation changed/);assert.equal((await storeSdk.getDoc(ref('admin','students/'+student))).data().publicSchool,false);
 await assert.rejects(storeSdk.getDoc(ref('observer','students/'+student)),error=>error.code==='permission-denied');
});
