import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import {getFirestore,collection,doc,getDoc,getDocs,setDoc,updateDoc,onSnapshot} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
const config={apiKey:'AIzaSyDQnvkuRP09s7ws-vZ9JC9Z8pJCkt5FYXI',authDomain:'modern-olympia.firebaseapp.com',projectId:'modern-olympia',storageBucket:'modern-olympia.firebasestorage.app',messagingSenderId:'69798855365',appId:'1:69798855365:web:9a5339ccbf5bd2cc5026ac'};
const app=initializeApp(config),auth=getAuth(app),db=getFirestore(app);
const $=id=>document.getElementById(id),status=(s)=>{$('status').textContent=s};
const roles=['unassigned','prosecutor','defender','juror'];
let students=[],trials=[],activeTrialId=null;
let authRevision=0, selectionRevision=0, selectedTrialId=null, adminAuthorized=false;
let savingTrial=false;
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
 $('trial-id').value=trial?.id||'';$('trial-title').value=trial?.title||'';$('trial-status').value=trial?.status||'trial';
}
// All selection changes, including successful saves, refresh the same dependent panels.
async function selectTrial(id){
 selectedTrialId=trials.some(t=>t.id===id)?id:null;
 $('trial-select').value=selectedTrialId||'';selectionRevision++;savingTrial=false;
 $('trial-form').querySelector('button').disabled=false;
 $('activate-trial').disabled=!selectedTrialId||!adminAuthorized;
 syncTrialEditor();status('');
 return Promise.all([renderStudents(),loadReviewQueue(),refreshVotes()]);
}
$('trial-select').addEventListener('change',()=>selectTrial($('trial-select').value));
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
 adminAuthorized=false;selectedTrialId=null;selectionRevision++;students=[];trials=[];savingTrial=false;
 for(const name of Object.keys(panels)){panels[name].request++;panels[name].ready=false;panelNode(name).replaceChildren();panelNode(name).setAttribute('aria-busy','false')}
 for(const id of ['student-rows','trial-select'])$(id).replaceChildren();
 $('trial-select').value='';$('identity').textContent='';
 for(const id of ['trial-id','trial-title','password'])$(id).value='';
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
  adminAuthorized=true;$('identity').textContent='Signed in as '+(profile.data().displayName||user.email);
  $('dashboard').hidden=false;$('login-panel').hidden=true;$('switch-account').hidden=true;
  const pending=renderTrials(),context=selectionContext(),results=await pending;
  if(sameSelection(context))status(results.every(Boolean)?'Administrator access verified.':selectedTrialId?'Administrator access verified. Some panels could not be loaded.':'Administrator access verified. Create a trial to begin.');
 }catch(err){if(currentAdmin(revision,uid))status('Access denied or data could not be loaded: '+err.code)}
});
$('trial-form').addEventListener('submit',async e=>{
 e.preventDefault();const context=selectionContext();if(!sameSelection(context)||savingTrial)return;
 const id=$('trial-id').value.trim(),title=$('trial-title').value.trim(),statusValue=$('trial-status').value;
 if(!/^[a-z0-9-]+$/.test(id)||!title)return status('Invalid trial ID or title');
 const btn=$('trial-form').querySelector('button');savingTrial=true;btn.disabled=true;
 try{
  const ref=doc(db,'trials',id),existing=await getDoc(ref);if(!sameSelection(context))return;
  if(existing.exists())await updateDoc(ref,{title,status:statusValue});else await setDoc(ref,{title,status:statusValue});
  if(!currentAdmin(context.auth,context.uid)||!adminAuthorized)return;
  trials=trials.filter(t=>t.id!==id).concat({id,title,status:statusValue});
  // A completed write may update the option list, but must not steal a newer selection.
  if(!sameSelection(context)){renderTrialOptions(selectedTrialId);$('trial-select').value=selectedTrialId||'';return}
  const pending=renderTrials(id),savedContext=selectionContext();
  const results=await pending;
  if(sameSelection(savedContext))status(results.every(Boolean)?'Trial saved. All trial panels refreshed.':'Trial saved. Some panels could not be loaded; retry the affected panel.');
 }catch(err){if(sameSelection(context))status('Unable to save trial: '+err.code)}
 finally{if(sameSelection(context)){savingTrial=false;btn.disabled=false}}
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
   if(post.evidenceUrl){const link=document.createElement('a');link.href=post.evidenceUrl;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Evidence link';wrap.append(link)}
   const feedback=document.createElement('input');feedback.placeholder='Feedback for return (required)';feedback.maxLength=1000;feedback.style.width='min(95%, 500px)';wrap.append(feedback);
   const buttons=[];
   for(const [label,next] of [['Approve','published'],['Return for revision','returned']]){
    const btn=document.createElement('button');btn.textContent=label;buttons.push(btn);
    btn.onclick=async()=>{
     if(!currentPanel(context,'review',request)||!panels.review.ready||btn.disabled)return;
     const message=next==='returned'?feedback.value.trim():'';
     if(next==='returned'&&!message)return status('Enter feedback before returning.');
     buttons.forEach(b=>b.disabled=true);
     try{await updateDoc(doc(db,'trials',context.trialId,'submissions',post.id),{status:next,feedback:message});if(currentPanel(context,'review',request)){status(`Submission ${next} for ${context.trialId}`);await loadReviewQueue()}}
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
  const votes=await getDocs(collection(db,'trials',context.trialId,'votes'));
  if(!currentPanel(context,'votes',request))return false;
  $('vote-count').textContent=`${votes.size} ballot(s) recorded for ${context.trialId}. Individual reasons are private to the administrator.`;
  finishPanel('votes',context,request,true);return true;
 }catch(err){if(currentPanel(context,'votes',request)){panelNode('votes').textContent=`Cannot read votes for ${context.trialId}: ${err.code||err.message}`;finishPanel('votes',context,request,false)}return false}
}
$('refresh-votes').addEventListener('click',refreshVotes);
$('publish-verdict').addEventListener('click',async()=>{
 const context=selectionContext(),request=panels.votes.request,btn=$('publish-verdict');
 const current=()=>currentPanel(context,'votes',request)&&panels.votes.ready;
 if(!current()||btn.disabled)return;btn.disabled=true;$('refresh-votes').disabled=true;
 try{
  const ref=doc(db,'trials',context.trialId),trial=await getDoc(ref);if(!current())return;
  if(!trial.exists()||trial.data().status!=='closed')throw Error('First change trial status to Closed and save the trial.');
  if(trial.data().verdictSummary)throw Error('Results already published.');
  const ballots=await getDocs(collection(db,'trials',context.trialId,'votes'));if(!current())return;
  const guilty=ballots.docs.filter(x=>x.data().choice==='guilty').length,notGuilty=ballots.docs.filter(x=>x.data().choice==='not-guilty').length;
  if(!confirm(`Publish final result for ${context.trialId}? Guilty: ${guilty}, Not Guilty: ${notGuilty}.`)||!current())return;
  await updateDoc(ref,{verdictSummary:{guilty,notGuilty}});if(!current())return;
  status(`Final tally published for ${context.trialId}.`);await refreshVotes();
 }catch(err){if(current())status('Cannot publish verdict: '+(err.code||err.message))}
 finally{if(current()){btn.disabled=false;$('refresh-votes').disabled=false}}
});
