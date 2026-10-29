import {setupSchoolAdmin} from './school-admin.js';
import {setupEncyclopediaAdmin} from './encyclopedia-admin.js';
import {caseCharge} from './case-content.js';
import {initializeApp,deleteApp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {getAuth,createUserWithEmailAndPassword,deleteUser,initializeAuth,inMemoryPersistence,connectAuthEmulator,onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {getFirestore,connectFirestoreEmulator,collection,doc,query,where,getDoc,getDocs,setDoc,updateDoc,onSnapshot,getDocFromServer,getDocsFromServer,runTransaction,Timestamp,deleteDoc} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import {initializeFirebaseClient} from './firebase-client.js';
import {provisionStudent} from './student-accounts.js';
import {portraitUrl} from './portraits.js';
import {reasoningReleased,reviewReasoning} from './jury-reasoning.js';
const {app,auth,db}=initializeFirebaseClient({initializeApp,getAuth,initializeAuth,inMemoryPersistence,connectAuthEmulator,getFirestore,connectFirestoreEmulator});
const $=id=>document.getElementById(id),status=(s)=>{$('status').textContent=s};
const roles=['unassigned','prosecutor','defender','juror'];
let students=[],trials=[],activeTrialId=null;
let authRevision=0, selectionRevision=0, selectedTrialId=null, adminAuthorized=false;
let savingTrial=false;
let reasoningRequest=0;
let creatingStudent=false, studentRequest=0, provisionSequence=0;
// Keep writes locked across trial reselection until the original operation settles.
const pendingTrialSaves=new Set();
const panels={roles:{request:0,ready:false},review:{request:0,ready:false},votes:{request:0,ready:false}};
function currentAdmin(revision,uid){return revision===authRevision && auth.currentUser?.uid===uid}
function selectionContext(){return {auth:authRevision,uid:auth.currentUser?.uid,selection:selectionRevision,trialId:selectedTrialId}}
function sameSelection(context){
 return adminAuthorized && currentAdmin(context.auth,context.uid) && context.selection===selectionRevision &&
  context.trialId===selectedTrialId && $('trial-select').value===(context.trialId||'');
}
// Request numbers reject older refreshes even when the same trial is reselected.
function currentPanel(context,name,request){return sameSelection(context) && panels[name].request===request}
function panelNode(name){return $(name==='roles'?'roles-status':name==='review'?'review-list':'vote-count')}
function startPanel(name){
 const context=selectionContext(),panel=panels[name],request=++panel.request;
 panel.ready=false;
 if(name==='roles')$('student-rows').replaceChildren();
 const node=panelNode(name);node.replaceChildren();
 const valid=sameSelection(context) && !!context.trialId;
 node.textContent=valid?`Loading ${name==='roles'?'student roles':name==='review'?'submissions':'ballots'} for ${context.trialId}…`:'Select a trial to load this panel.';
 node.setAttribute('aria-busy',String(valid));
 if(name==='roles')$('refresh-roles').disabled=valid||!context.trialId;
 if(name==='review')$('refresh-submissions').disabled=valid||!context.trialId;
 if(name==='votes'){$('refresh-votes').disabled=valid||!context.trialId;$('publish-verdict').disabled=true}
 return {context,request,valid};
}
function finishPanel(name,context,request,ready){
 if(!currentPanel(context,name,request))return;
 panels[name].ready=ready;panelNode(name).setAttribute('aria-busy','false');
 if(name==='roles')$('refresh-roles').disabled=false;
 if(name==='review')$('refresh-submissions').disabled=false;
 if(name==='votes'){$('refresh-votes').disabled=false;$('publish-verdict').disabled=!ready}
}
function renderTrialOptions(preferred){
 const select=$('trial-select');select.replaceChildren();
 for(const trial of trials){const option=document.createElement('option');option.value=trial.id;option.textContent=`${trial.title||trial.id} (${trial.id})`;select.append(option)}
 select.value=trials.some(t=>t.id===preferred)?preferred:(trials[0]?.id||'');
}
function renderTrials(preferred=selectedTrialId){renderTrialOptions(preferred);return selectTrial($('trial-select').value)}
function syncTrialEditor(){
 const trial=trials.find(t=>t.id===selectedTrialId);
 $('trial-id').readOnly=!!trial;$('trial-id').value=trial?.id||'';$('trial-title').value=trial?.title||'';$('trial-status').value=trial?.status||'trial';$('trial-portrait-url').value=trial?.portraitUrl||'';$('trial-charge').value=typeof trial?.charge==='string'?trial.charge:'';
}
// All selection changes, including successful saves, refresh the same dependent panels.
async function selectTrial(id){
 selectedTrialId=trials.some(t=>t.id===id)?id:null;
 $('trial-select').value=selectedTrialId||'';selectionRevision++;savingTrial=false;
 $('trial-form').querySelector('button').disabled=pendingTrialSaves.has(selectedTrialId);
 $('activate-trial').disabled=!selectedTrialId||!adminAuthorized;
 resetReasoningPanel();syncTrialEditor();status('');
 return Promise.all([renderStudents(),loadReviewQueue(),refreshVotes()]);
}
$('trial-select').addEventListener('change',()=>selectTrial($('trial-select').value));
$('new-trial').addEventListener('click',()=>{if(!adminAuthorized)return;const pending=selectTrial(null);$('trial-id').focus();status('Enter a new permanent trial ID and title, then save. Existing trials are unchanged.');return pending;});
onSnapshot(doc(db,'settings','currentTrial'),snap=>{
 activeTrialId=snap.exists()?snap.data().trialId:null;
 $('active-trial-label').textContent=activeTrialId?`Active: ${activeTrialId}`:'No active trial selected';
},err=>status('Cannot read active trial: '+err.code));
$('activate-trial').addEventListener('click',async()=>{
 const context=selectionContext();if(!sameSelection(context)||!context.trialId)return;
 if(!confirm(`Make ${context.trialId} the active trial for all students?`)||!sameSelection(context))return;
 const btn=$('activate-trial');btn.disabled=true;
 try{await setDoc(doc(db,'settings','currentTrial'),{trialId:context.trialId});if(sameSelection(context))status(`Active trial changed to ${context.trialId}.`)}
 catch(err){if(sameSelection(context))status('Cannot activate trial: '+err.code)}
 finally{if(sameSelection(context))btn.disabled=false}
});
$('login-form').addEventListener('submit',async e=>{e.preventDefault();try{await signInWithEmailAndPassword(auth,$('email').value,$('password').value);$('password').value='';}catch(err){status('Sign-in failed: '+err.code)}});
async function logout(){try{await signOut(auth)}catch(err){status('Sign-out failed: '+(err.code||err.message))}}
$('logout').addEventListener('click',logout);$('switch-account').addEventListener('click',logout);
onAuthStateChanged(auth,async user=>{
 const revision=++authRevision,uid=user?.uid;
 adminAuthorized=false;selectedTrialId=null;selectionRevision++;students=[];trials=[];savingTrial=false;resetReasoningPanel();
 for(const name of Object.keys(panels)){panels[name].request++;panels[name].ready=false;panelNode(name).replaceChildren();panelNode(name).setAttribute('aria-busy','false')}
 studentRequest++;$('account-rows').replaceChildren();$('student-account-status').textContent='';
 for(const id of ['student-code','student-name','student-password'])$(id).value='';
 for(const id of ['student-rows','trial-select'])$(id).replaceChildren();
 $('trial-select').value='';$('identity').textContent='';
 for(const id of ['trial-id','trial-title','trial-portrait-url','trial-charge','password'])$(id).value='';
 for(const id of ['activate-trial','refresh-roles','refresh-submissions','refresh-votes','publish-verdict'])$(id).disabled=true;
 $('trial-form').querySelector('button').disabled=false;
 status('');$('dashboard').hidden=true;$('login-panel').hidden=!!user;$('switch-account').hidden=!user;
 if(!user)return;
 try{
  const profile=await getDoc(doc(db,'students',user.uid));if(!currentAdmin(revision,uid))return;
  if(!profile.exists()||profile.data().active!==true||profile.data().accountType!=='teacher'){status('This account is not authorized as administrator.');return}
  const [ss,tt]=await Promise.all([getDocs(collection(db,'students')),getDocs(collection(db,'trials'))]);
  if(!currentAdmin(revision,uid))return;
  students=ss.docs.filter(x=>x.data().accountType==='student').map(x=>({id:x.id,...x.data()}));trials=tt.docs.map(x=>({id:x.id,...x.data()}));
  adminAuthorized=true;renderAccounts();$('identity').textContent='Signed in as '+(profile.data().displayName||user.email);
  $('dashboard').hidden=false;$('login-panel').hidden=true;$('switch-account').hidden=true;
  const pending=renderTrials(),context=selectionContext(),results=await pending;
  if(sameSelection(context))status(results.every(Boolean)?'Administrator access verified.':selectedTrialId?'Administrator access verified. Some panels could not be loaded.':'Administrator access verified. Create a trial to begin.');
 }catch(err){if(currentAdmin(revision,uid))status('Access denied or data could not be loaded: '+err.code)}
});
$('trial-form').addEventListener('submit',async e=>{
 e.preventDefault();const context=selectionContext();if(!sameSelection(context)||savingTrial)return;
 const id=$('trial-id').value.trim(),title=$('trial-title').value.trim(),statusValue=$('trial-status').value;
 if(!/^[a-z0-9-]{1,80}$/.test(id)||!title)return status('Invalid trial ID or title');
 let portrait,charge;try{portrait=portraitUrl($('trial-portrait-url').value);charge=caseCharge($('trial-charge').value)}catch(error){return status(error.message)}
 if(pendingTrialSaves.has(id))return;
 const btn=$('trial-form').querySelector('button');pendingTrialSaves.add(id);savingTrial=true;btn.disabled=true;
 try{
  const ref=doc(db,'trials',id),existing=await getDocFromServer(ref);if(!sameSelection(context))return;
  requireServerSnapshot(existing);
  if(existing.exists()){
   const phase=existing.data().status;
   if(phase==='closed'&&statusValue!=='closed')throw Error('Closed trials cannot be reopened. Create a new trial for another voting round.');
   if(phase==='verdict'&&statusValue==='trial')throw Error('Voting has opened; the argument phase cannot be reopened.');
   if(!sameSelection(context))return;
  }
  if(statusValue==='closed'&&(!existing.exists()||existing.data().status!=='closed')&&!confirm(`Permanently close trial ${id}? This action is irreversible: the trial cannot be reopened. No further jury votes will be accepted after closure. Unsent ballots will not count. Check turnout and finish submission review first. Select OK to permanently close the trial, or Cancel to leave it unchanged.`)){if(sameSelection(context))status('Closure cancelled. Trial was not changed.');return}
  if(!sameSelection(context))return;
  const changes={title,status:statusValue};
  if(charge||(existing.exists()&&'charge' in existing.data()))changes.charge=charge;
  if(portrait||(existing.exists()&&'portraitUrl' in existing.data()))changes.portraitUrl=portrait;
  if(existing.exists())await updateDoc(ref,changes);else await setDoc(ref,changes);
  if(!currentAdmin(context.auth,context.uid)||!adminAuthorized)return;
  trials=trials.filter(t=>t.id!==id).concat({...(existing.exists()?existing.data():{}),id,...changes});
  // A completed write may update the option list, but must not steal a newer selection.
  if(!sameSelection(context)){renderTrialOptions(selectedTrialId);$('trial-select').value=selectedTrialId||'';return}
  const pending=renderTrials(id),savedContext=selectionContext();
  const results=await pending;
  if(sameSelection(savedContext))status(results.every(Boolean)?'Trial saved. All trial panels refreshed.':'Trial saved. Some panels could not be loaded; retry the affected panel.');
 }catch(err){if(sameSelection(context))status('Unable to save trial: '+(err.code||err.message))}
 finally{pendingTrialSaves.delete(id);if(sameSelection(context))savingTrial=false;if(adminAuthorized&&!savingTrial)btn.disabled=pendingTrialSaves.has(selectedTrialId)}
});
async function renderStudents(){
 const {context,request,valid}=startPanel('roles');if(!valid)return false;
 try{
  const rows=await getDocs(collection(db,'trials',context.trialId,'assignments'));
  if(!currentPanel(context,'roles',request))return false;
  const assigned=Object.fromEntries(rows.docs.map(x=>[x.id,x.data().role]));
  for(const student of students){
   const tr=document.createElement('tr'),name=document.createElement('td'),roleCell=document.createElement('td'),action=document.createElement('td'),select=document.createElement('select'),btn=document.createElement('button');
   name.textContent=student.displayName||student.id;
   for(const role of roles){const option=document.createElement('option');option.value=role;option.textContent=role;select.append(option)}
   select.setAttribute('aria-label',`Role for ${student.displayName||student.id}`);
   select.value=roles.includes(assigned[student.id])?assigned[student.id]:'unassigned';btn.textContent='Save role';
   select.addEventListener('change',()=>{btn.textContent='Save role *'});
   btn.addEventListener('click',async()=>{
    if(!currentPanel(context,'roles',request)||!panels.roles.ready||btn.disabled)return;
    const role=select.value;btn.disabled=true;select.disabled=true;
    try{await setDoc(doc(db,'trials',context.trialId,'assignments',student.id),{role});if(currentPanel(context,'roles',request)){btn.textContent='Saved';status(`Saved ${name.textContent}: ${role} for ${context.trialId}`)}}
    catch(err){if(currentPanel(context,'roles',request))status('Unable to save role: '+err.code)}
    finally{if(currentPanel(context,'roles',request)){btn.disabled=false;select.disabled=false}}
   });
   roleCell.append(select);action.append(btn);tr.append(name,roleCell,action);$('student-rows').append(tr);
  }
  panelNode('roles').textContent=`Student roles for ${context.trialId}${students.length?'':': no students provisioned.'}`;
  finishPanel('roles',context,request,true);return true;
 }catch(err){if(currentPanel(context,'roles',request)){panelNode('roles').textContent=`Cannot read assignments for ${context.trialId}: ${err.code||err.message}. Use Refresh student roles to retry.`;finishPanel('roles',context,request,false)}return false}
}
$('refresh-roles').addEventListener('click',renderStudents);
async function loadReviewQueue(){
 const {context,request,valid}=startPanel('review');if(!valid)return false;
 try{
  const snap=await getDocs(collection(db,'trials',context.trialId,'submissions'));
  if(!currentPanel(context,'review',request))return false;
  const list=$('review-list');list.replaceChildren();
  const pending=snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.status==='pending');
  const label=document.createElement('p');label.textContent=pending.length?`Pending submissions for ${context.trialId}`:`No pending submissions for ${context.trialId}.`;list.append(label);
  for(const post of pending){
   const wrap=document.createElement('div');wrap.className='panel';
   const heading=document.createElement('h3');heading.textContent=`${post.authorName||post.authorUid} — ${post.section}`;
   const body=document.createElement('p');body.textContent=post.text;wrap.append(heading,body);
   if(post.evidenceUrl){try{const url=new URL(post.evidenceUrl);if(['http:','https:'].includes(url.protocol)){const link=document.createElement('a');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Evidence link';wrap.append(link)}}catch{}}
   const feedback=document.createElement('input');feedback.placeholder='Feedback for return (required)';feedback.maxLength=1000;feedback.style.width='min(95%, 500px)';wrap.append(feedback);
   const buttons=[];
   for(const [label,next] of [['Approve','published'],['Return for revision','returned']]){
    const btn=document.createElement('button');btn.textContent=label;buttons.push(btn);
    btn.onclick=async()=>{
     if(!currentPanel(context,'review',request)||!panels.review.ready||btn.disabled)return;
     const message=next==='returned'?feedback.value.trim():'';
     if(next==='returned'&&!message)return status('Enter feedback before returning.');
     buttons.forEach(b=>b.disabled=true);
     try{await updateDoc(doc(db,'trials',context.trialId,'submissions',post.id),{status:next,feedback:message});let schoolWarning='';
      if(next==='published'&&currentPanel(context,'review',request)){try{await schoolManager.publish(context.trialId,{...post,status:'published'})}catch{schoolWarning=' Optional school label could not be synced; the argument itself was approved.'}}
      if(currentPanel(context,'review',request)){status(`Submission ${next} for ${context.trialId}`+schoolWarning);await loadReviewQueue()}}
     catch(err){if(currentPanel(context,'review',request)){status('Moderation failed: '+(err.code||err.message));buttons.forEach(b=>b.disabled=false)}}
    };wrap.append(btn);
   }
   list.append(wrap);
  }
  finishPanel('review',context,request,true);return true;
 }catch(err){if(currentPanel(context,'review',request)){panelNode('review').textContent=`Cannot load submissions for ${context.trialId}: ${err.code||err.message}`;finishPanel('review',context,request,false)}return false}
}
$('refresh-submissions').addEventListener('click',loadReviewQueue);
async function refreshVotes(){
 const {context,request,valid}=startPanel('votes');if(!valid)return false;
 try{
  const votes=await getDocsFromServer(collection(db,'trials',context.trialId,'votes'));
  if(!currentPanel(context,'votes',request))return false;
  requireServerSnapshot(votes);
  $('vote-count').textContent=`${votes.size} ballot(s) recorded for ${context.trialId}. Individual reasons are private to the administrator.`;
  finishPanel('votes',context,request,true);return true;
 }catch(err){if(currentPanel(context,'votes',request)){panelNode('votes').textContent=`Cannot read votes for ${context.trialId}: ${err.code||err.message}`;finishPanel('votes',context,request,false)}return false}
}
$('refresh-votes').addEventListener('click',refreshVotes);
// Server reads fail closed instead of accepting an offline/local-pending view.
function requireServerSnapshot(snapshot){
 if(snapshot.metadata?.fromCache!==false||snapshot.metadata?.hasPendingWrites!==false)throw Error('A confirmed server snapshot is required. Reconnect and retry.');
}
function requireClosedUnpublished(trial){
 requireServerSnapshot(trial);
 if(!trial.exists()||trial.data().status!=='closed')throw Error('First close and save the trial. Publication requires permanent closure.');
 if('verdictSummary' in trial.data()){
  const summary=trial.data().verdictSummary;
  if(!summary||!Number.isSafeInteger(summary.guilty)||!Number.isSafeInteger(summary.notGuilty)||summary.guilty<0||summary.notGuilty<0)throw Error('A malformed legacy summary field exists. Request an owner review; it cannot be replaced here.');
  const error=Error(`Results already published: Guilty ${summary.guilty}, Not Guilty ${summary.notGuilty}. Existing totals cannot be replaced.`);
  error.code='already-published';throw error;
 }
}
function ballotSummary(snapshot){
 requireServerSnapshot(snapshot);
 if(!Array.isArray(snapshot.docs)||snapshot.size!==snapshot.docs.length)throw Error('The ballot collection is inconsistent. No totals were submitted.');
 if(!snapshot.size)throw Error('No ballots were recorded. An empty jury cannot publish a verdict.');
 let guilty=0,notGuilty=0;
 for(const item of snapshot.docs){
  const data=item.data();
  if(!data||Object.keys(data).length!==3||!['guilty','not-guilty'].includes(data.choice)||
   typeof data.reason!=='string'||data.reason.trim().length<15||data.reason.length>2000||
   !(data.castAt instanceof Timestamp)||!Number.isFinite(data.castAt.toMillis()))throw Error(`Malformed ballot record ${item.id}. Review imported data before publishing.`);
  if(data.choice==='guilty')guilty++;else notGuilty++;
 }
 return {guilty,notGuilty};
}
$('publish-verdict').addEventListener('click',async()=>{
 const context=selectionContext(),request=panels.votes.request,btn=$('publish-verdict');
 const current=()=>currentPanel(context,'votes',request)&&panels.votes.ready;
 if(!current()||btn.disabled)return;btn.disabled=true;$('refresh-votes').disabled=true;
 status(`Checking closed trial and server ballots for ${context.trialId}…`);
 try{
  const ref=doc(db,'trials',context.trialId),trial=await getDocFromServer(ref);if(!current())return;
  requireClosedUnpublished(trial);
  const ballots=await getDocsFromServer(collection(db,'trials',context.trialId,'votes'));if(!current())return;
  const summary=ballotSummary(ballots);
  if(!confirm(`Publish final counts for ${context.trialId}? Guilty: ${summary.guilty}, Not Guilty: ${summary.notGuilty}. Recorded ballots: ${ballots.size}. Not all assigned jurors may have voted; no quorum or deadline policy is enforced. Counts cannot be changed.`)){if(current())status('Publication cancelled. No totals were submitted.');return}
  if(!current())return;
  // Rules make closed trials terminal and ballots immutable. The collection stays
  // stable while this transaction checks for another administrator's publication.
  // This does NOT prove the aggregate to rules; administrator-supplied totals remain trusted.
  await runTransaction(db,async transaction=>{
   if(!current())throw Error('Trial selection changed; publication cancelled.');
   const latest=await transaction.get(ref);
   if(!current())throw Error('Trial selection changed; publication cancelled.');
   requireClosedUnpublished(latest);
   transaction.update(ref,{verdictSummary:summary});
  });
  if(!current())return;
  status(`Final tally published for ${context.trialId}. Guilty: ${summary.guilty}, Not Guilty: ${summary.notGuilty}. No quorum check was performed.`);
  const refreshed=await refreshVotes();
  if(sameSelection(context)&&!refreshed)status(`Final tally published for ${context.trialId}; ballot count refresh failed. The totals were saved.`);
 }catch(err){if(current())status(err.code==='already-published'?`Previously published totals for ${context.trialId}: ${err.message}`:`Publication not confirmed for ${context.trialId}: ${err.code||err.message}. Reconnect and retry this check to verify saved results.`)}
 finally{if(current()){btn.disabled=false;$('refresh-votes').disabled=false}}
});

function renderAccounts(){
 const revision=authRevision,uid=auth.currentUser?.uid,request=++studentRequest;
 const current=()=>adminAuthorized&&currentAdmin(revision,uid)&&request===studentRequest;
 const list=$('account-rows');list.replaceChildren();
 for(const student of students){
  const row=document.createElement('tr'),name=document.createElement('td'),access=document.createElement('td'),action=document.createElement('td'),button=document.createElement('button');
  name.textContent=student.displayName||student.id;access.textContent=student.active===true?'Can participate':'Participation paused';
  button.type='button';button.textContent=student.active===true?'Pause participation':'Resume participation';
  button.addEventListener('click',async()=>{
   if(!current()||button.disabled)return;
   const active=student.active!==true;button.disabled=true;
   try{
    await updateDoc(doc(db,'students',student.id),{active});if(!current())return;
    student.active=active;renderAccounts();$('student-account-status').textContent=`${name.textContent}: participation ${active?'enabled':'paused'}.`;
   }catch(error){if(current()){$('student-account-status').textContent='Unable to change access: '+(error.code||error.message);button.disabled=false}}
  });
  action.append(button);row.append(name,access,action);list.append(row);
 }
 if(!students.length)$('student-account-status').textContent='No student accounts yet. Create one below.';
}
$('student-account-form').addEventListener('submit',async event=>{
 event.preventDefault();if(!adminAuthorized||creatingStudent)return;
 const revision=authRevision,uid=auth.currentUser?.uid,current=()=>adminAuthorized&&currentAdmin(revision,uid);
 const button=$('create-student');creatingStudent=true;button.disabled=true;
 const input={code:$('student-code').value,name:$('student-name').value,password:$('student-password').value,schoolId:$('student-school').value};
 $('student-password').value='';$('student-account-status').textContent='Creating student access…';
 try{
  input.schoolId=schoolManager.creationSchool();
  const student=await provisionStudent(input,{
   current,
   open:()=>initializeFirebaseClient({initializeApp,getAuth,initializeAuth,inMemoryPersistence,connectAuthEmulator,getFirestore,connectFirestoreEmulator},{name:'student-provision-'+(++provisionSequence),isolatedAuth:true}),
   create:createUserWithEmailAndPassword,remove:deleteUser,close:session=>deleteApp(session.app),
   save:(id,profile)=>setDoc(doc(db,'students',id),profile),read:id=>getDocFromServer(doc(db,'students',id))
  });
  if(!current())return;
  students.push(student);renderAccounts();schoolManager.reload();await renderStudents();if(!current())return;
  $('student-code').value='';$('student-name').value='';$('student-school').value='';
  $('student-account-status').textContent=`Student created. Code: ${student.code.toUpperCase()}. Give the code and chosen password privately to the student, then assign a trial role.`;
 }catch(error){if(current()){const messages={'auth/email-already-in-use':'That student code already exists. Use a different code; the existing account was not changed.','auth/weak-password':'Choose a stronger student password and try again.','auth/network-request-failed':'Check your connection and try again.','permission-denied':'Student access could not be saved. Ask the project owner to verify the prepared administrator rules.'};$('student-account-status').textContent='Unable to create student: '+(messages[error.code]||error.message||error.code)}}
 finally{creatingStudent=false;button.disabled=false}
});

function resetReasoningPanel(){
 reasoningRequest++;$('reasoning-review-list').replaceChildren();$('reasoning-review-status').textContent='Load private reasoning after permanent closure and final tally publication. Nothing is published automatically.';
 $('reasoning-review-status').setAttribute('aria-busy','false');$('load-reasoning').disabled=!adminAuthorized||!selectedTrialId;
}
async function loadReasoningReview(){
 const context=selectionContext(),request=++reasoningRequest,current=()=>sameSelection(context)&&request===reasoningRequest;
 if(!sameSelection(context)||!context.trialId)return;
 const list=$('reasoning-review-list'),feedback=$('reasoning-review-status'),button=$('load-reasoning');
 list.replaceChildren();button.disabled=true;feedback.textContent='Loading private jury reasoning…';feedback.setAttribute('aria-busy','true');
 try{
  const trial=await getDocFromServer(doc(db,'trials',context.trialId));if(!current())return;requireServerSnapshot(trial);
  if(!trial.exists()||!reasoningReleased(trial.data()))throw Error('Permanently close this trial and publish its final tally before reviewing reasoning for public release.');
  const [ballots,reviews,copies]=await Promise.all(['votes','reasoningReviews','publicReasoning'].map(name=>getDocsFromServer(collection(db,'trials',context.trialId,name))));
  if(!current())return;for(const snapshot of [ballots,reviews,copies])requireServerSnapshot(snapshot);
  const states=Object.fromEntries(reviews.docs.map(item=>[item.id,item.data()])),published=Object.fromEntries(copies.docs.map(item=>[item.id,item.data()]));
  for(const [index,ballot] of ballots.docs.entries()){
   const data=ballot.data(),state=states[ballot.id],copy=state&&published[state.publicId];
   const card=document.createElement('section');card.className='panel';
   const heading=document.createElement('h3');heading.textContent=`Private review ${index+1} — ${data.choice==='guilty'?'Guilty':data.choice==='not-guilty'?'Not Guilty':'Invalid choice'}`;
   const original=document.createElement('p');original.textContent='Original private reasoning: '+(data.reason||'');
   const label=document.createElement('label');label.textContent='Public copy (remove identifying details)';
   const text=document.createElement('textarea');text.value=copy?.reason||data.reason||'';text.maxLength=2000;text.setAttribute('aria-label',`Reviewed anonymous reasoning ${index+1}`);text.style.width='min(100%, 650px)';text.style.minHeight='100px';label.append(text);
   const checked=document.createElement('input');checked.type='checkbox';const consent=document.createElement('label');consent.append(checked);const description=document.createElement('span');description.textContent=' I checked this copy for names, codes, contact details and other identifying information, and have permission to share it anonymously.';consent.append(description);
   const result=document.createElement('p');result.setAttribute('role','status');result.textContent=state?.state==='approved'?'Anonymous copy currently published.':state?.state==='excluded'?'Excluded from public reasoning.':'Not reviewed; private only.';
   const approve=document.createElement('button'),exclude=document.createElement('button');approve.textContent=copy?'Approve updated anonymous copy':'Approve and publish anonymous copy';exclude.textContent=copy?'Withdraw public copy':'Exclude from publication';approve.type=exclude.type='button';
   let pending=false;
   const act=async approved=>{
    if(!current()||pending)return;
    if(approved&&checked.checked!==true){result.textContent='Confirm the anonymity review before publishing.';return}
    if(approved&&!confirm(`Publish this reviewed anonymous copy for ${context.trialId}? Its choice and edited reasoning will be public. No ballot or final tally will change.`))return;
    if(!current())return;
    pending=true;approve.disabled=exclude.disabled=true;result.textContent=approved?'Publishing reviewed copy…':'Saving exclusion…';
    try{
     await reviewReasoning(approved,text.value,{
      current,identifiers:[ballot.id,...students.flatMap(student=>[student.id,student.displayName])],
      newId:()=>doc(collection(db,'trials',context.trialId,'publicReasoning')).id,
      trial:doc(db,'trials',context.trialId),ballot:doc(db,'trials',context.trialId,'votes',ballot.id),review:doc(db,'trials',context.trialId,'reasoningReviews',ballot.id),
      publicCopy:id=>doc(db,'trials',context.trialId,'publicReasoning',id),run:callback=>runTransaction(db,callback)
     });
     if(!current())return;status(`Anonymous reasoning ${approved?'published':'excluded'} for ${context.trialId}. The ballot and tally are unchanged.`);await loadReasoningReview();
    }catch(error){if(current()){result.textContent='Review action not confirmed: '+(error.code||error.message)+'. Reload the review panel to verify saved state.';pending=false;approve.disabled=exclude.disabled=false}}
   };
   approve.addEventListener('click',()=>act(true));exclude.addEventListener('click',()=>act(false));
   card.append(heading,original,label,consent,approve,exclude,result);list.append(card);
  }
  feedback.textContent=ballots.docs.length?'Review each copy individually. Public labels are trial-specific and do not match this private list order. Excluded copies do not affect turnout or totals.':'No private ballots were found.';
 }catch(error){if(current())feedback.textContent='Unable to load private reasoning: '+(error.code||error.message)}
 finally{if(current()){button.disabled=false;feedback.setAttribute('aria-busy','false')}}
}
$('load-reasoning').addEventListener('click',loadReasoningReview);

setupEncyclopediaAdmin({auth,db,onAuthStateChanged,collection,doc,getDocFromServer,getDocsFromServer,setDoc,deleteDoc});

const schoolManager=setupSchoolAdmin({auth,db,onAuthStateChanged,collection,doc,query,where,getDocFromServer,getDocsFromServer,setDoc,updateDoc,deleteDoc,runTransaction});
