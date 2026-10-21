import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import {getFirestore,collection,doc,getDoc,getDocs,setDoc,updateDoc,onSnapshot} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
const config={apiKey:'AIzaSyDQnvkuRP09s7ws-vZ9JC9Z8pJCkt5FYXI',authDomain:'modern-olympia.firebaseapp.com',projectId:'modern-olympia',storageBucket:'modern-olympia.firebasestorage.app',messagingSenderId:'69798855365',appId:'1:69798855365:web:9a5339ccbf5bd2cc5026ac'};
const app=initializeApp(config),auth=getAuth(app),db=getFirestore(app);
const $=id=>document.getElementById(id),status=(s)=>{$('status').textContent=s};
const roles=['unassigned','prosecutor','defender','juror'];
let students=[],trials=[],activeTrialId=null;
let authRevision=0;
function currentAdmin(revision,uid){return revision===authRevision && auth.currentUser?.uid===uid}
onSnapshot(doc(db,'settings','currentTrial'), snap=>{
 activeTrialId=snap.exists()?snap.data().trialId:null;
 const label=$('active-trial-label');
 if(label)label.textContent=activeTrialId?`Active: ${activeTrialId}`:'No active trial selected';
},err=>status('Cannot read active trial: '+err.code));
$('activate-trial').addEventListener('click',async()=>{
 const id=$('trial-select').value;
 if(!id)return status('Create or select a trial first.');
 if(!confirm(`Make ${id} the active trial for all students?`))return;
 const btn=$('activate-trial');btn.disabled=true;
 try{await setDoc(doc(db,'settings','currentTrial'),{trialId:id});status(`Active trial changed to ${id}.`)}
 catch(err){status('Cannot activate trial: '+err.code)}finally{btn.disabled=false}
});
$('login-form').addEventListener('submit',async e=>{e.preventDefault();try{await signInWithEmailAndPassword(auth,$('email').value,$('password').value);$('password').value='';}catch(err){status('Sign-in failed: '+err.code)}});
async function logout(){
 try{await signOut(auth)}catch(err){status('Sign-out failed: '+(err.code||err.message))}
}
$('logout').addEventListener('click',logout);
$('switch-account').addEventListener('click',logout);
onAuthStateChanged(auth,async user=>{
 const revision=++authRevision,uid=user?.uid;
 students=[];trials=[];
 for(const id of ['student-rows','review-list','trial-select'])$(id).replaceChildren();
 for(const id of ['identity','vote-count'])$(id).textContent='';
 for(const id of ['trial-id','trial-title','password'])$(id).value='';
 status('');
 $('dashboard').hidden=true;$('login-panel').hidden=!!user;
 $('switch-account').hidden=!user;
 if(!user){status('');return}
 try{const p=await getDoc(doc(db,'students',user.uid));if(!currentAdmin(revision,uid))return;if(!p.exists()||p.data().active!==true||p.data().accountType!=='teacher'){status('This account is not authorized as administrator.');return}
 // The Firestore rules are the real authorization boundary, not this UI check.
 const [ss,tt]=await Promise.all([getDocs(collection(db,'students')),getDocs(collection(db,'trials'))]);
 if(!currentAdmin(revision,uid))return;
 students=ss.docs.filter(x=>x.data().accountType==='student').map(x=>({id:x.id,...x.data()}));trials=tt.docs.map(x=>({id:x.id,...x.data()}));
 $('identity').textContent='Signed in as '+(p.data().displayName||user.email);$('dashboard').hidden=false;$('login-panel').hidden=true;$('switch-account').hidden=true;renderTrials();await renderStudents();if(currentAdmin(revision,uid))status('Administrator access verified.');
 }catch(err){if(currentAdmin(revision,uid))status('Access denied or data could not be loaded: '+err.code)}
});
function renderTrials(){
 const select=$('trial-select'),previous=select.value;
 select.replaceChildren();
 for(const t of trials){const o=document.createElement('option');o.value=t.id;o.textContent=`${t.title||t.id} (${t.id})`;select.append(o)}
 if(trials.some(t=>t.id===previous))select.value=previous;
 syncTrialEditor();
}
function syncTrialEditor(){
 const trial=trials.find(t=>t.id===$('trial-select').value);
 if(!trial)return;
 $('trial-id').value=trial.id;
 $('trial-title').value=trial.title||'';
 $('trial-status').value=trial.status||'trial';
}
$('trial-select').addEventListener('change',()=>{syncTrialEditor();renderStudents()});
$('trial-form').addEventListener('submit',async e=>{e.preventDefault();const id=$('trial-id').value.trim(),title=$('trial-title').value.trim(),statusValue=$('trial-status').value;if(!/^[a-z0-9-]+$/.test(id)||!title)return status('Invalid trial ID or title');try{const ref=doc(db,'trials',id),existing=await getDoc(ref);if(existing.exists())await updateDoc(ref,{title,status:statusValue});else await setDoc(ref,{title,status:statusValue});const item={id,title,status:statusValue};trials=trials.filter(t=>t.id!==id).concat(item);renderTrials();$('trial-select').value=id;syncTrialEditor();await renderStudents();status('Trial saved. Student roles were reloaded from Firestore.')}catch(err){status('Unable to save trial: '+err.code)}});
async function renderStudents(){const revision=authRevision,uid=auth.currentUser?.uid;const trialId=$('trial-select').value,tbody=$('student-rows');tbody.replaceChildren();if(!trialId)return;let assigned={};try{const rows=await getDocs(collection(db,'trials',trialId,'assignments'));if(!currentAdmin(revision,uid))return;assigned=Object.fromEntries(rows.docs.map(x=>[x.id,x.data().role]));}catch(err){if(currentAdmin(revision,uid))status('Cannot read assignments: '+err.code);return}
for(const student of students){const tr=document.createElement('tr'),name=document.createElement('td'),roleCell=document.createElement('td'),action=document.createElement('td'),select=document.createElement('select'),btn=document.createElement('button');name.textContent=student.displayName||student.id;for(const role of roles){const o=document.createElement('option');o.value=role;o.textContent=role;select.append(o)}select.value=roles.includes(assigned[student.id])?assigned[student.id]:'unassigned';btn.textContent='Save role';select.addEventListener('change',()=>{btn.textContent='Save role *'});btn.addEventListener('click',async()=>{btn.disabled=true;try{await setDoc(doc(db,'trials',trialId,'assignments',student.id),{role:select.value});btn.textContent='Saved';status(`Saved ${name.textContent}: ${select.value} for ${trialId}`)}catch(err){status('Unable to save role: '+err.code)}finally{btn.disabled=false}});roleCell.append(select);action.append(btn);tr.append(name,roleCell,action);tbody.append(tr)}}

// v5 approval queue: only the administrator may list and moderate submissions.
async function loadReviewQueue(){
 const revision=authRevision,uid=auth.currentUser?.uid;
 const list=$('review-list');list.replaceChildren();const trialId=$('trial-select').value;
 if(!$('dashboard').hidden&&trialId){
  try{const snap=await getDocs(collection(db,'trials',trialId,'submissions'));
   if(!currentAdmin(revision,uid))return;
   const pending=snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.status==='pending');
   if(!pending.length){list.textContent='No pending submissions for this trial.';return}
   for(const post of pending){
    const wrap=document.createElement('div');wrap.className='panel';
    const h=document.createElement('h3');h.textContent=`${post.authorName||post.authorUid} — ${post.section}`;
    const body=document.createElement('p');body.textContent=post.text;wrap.append(h,body);
    if(post.evidenceUrl){const a=document.createElement('a');a.href=post.evidenceUrl;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Evidence link';wrap.append(a)}
    const feedback=document.createElement('input');feedback.placeholder='Feedback for return (required)';feedback.maxLength=1000;feedback.style.width='min(95%, 500px)';wrap.append(feedback);
    for(const [label,next] of [['Approve','published'],['Return for revision','returned']]){
     const btn=document.createElement('button');btn.textContent=label;btn.onclick=async()=>{
      if(next==='returned'&&!feedback.value.trim())return status('Enter feedback before returning.');
      btn.disabled=true;
      try{await updateDoc(doc(db,'trials',trialId,'submissions',post.id),{status:next,feedback:next==='returned'?feedback.value.trim():''});status('Submission '+next);await loadReviewQueue()}
      catch(err){status('Moderation failed: '+(err.code||err.message));btn.disabled=false}
     };wrap.append(btn);
    }
    list.append(wrap);
   }
  }catch(err){if(currentAdmin(revision,uid))status('Cannot load submissions: '+(err.code||err.message))}
 }
}
$('refresh-submissions').addEventListener('click',loadReviewQueue);
$('trial-select').addEventListener('change',loadReviewQueue);
onAuthStateChanged(auth,user=>{const revision=authRevision;if(user)setTimeout(()=>{if(currentAdmin(revision,user.uid))loadReviewQueue()},800);else $('review-list').replaceChildren()});

// v7: private juror ballots; only admin can list votes. Publish totals after closing.
async function refreshVotes(){
 const revision=authRevision,uid=auth.currentUser?.uid;
 const trialId=$('trial-select').value;
 if(!trialId || $('dashboard').hidden)return;
 try{
  const votes=await getDocs(collection(db,'trials',trialId,'votes'));
  if(!currentAdmin(revision,uid))return;
  $('vote-count').textContent=`${votes.size} ballot(s) recorded for ${trialId}. Individual reasons are private to the administrator.`;
 }catch(err){if(currentAdmin(revision,uid))status('Cannot read votes: '+(err.code||err.message));}
}
$('refresh-votes').addEventListener('click',refreshVotes);
$('trial-select').addEventListener('change',refreshVotes);
$('publish-verdict').addEventListener('click',async()=>{
 const id=$('trial-select').value;if(!id)return;
 const ref=doc(db,'trials',id),btn=$('publish-verdict');btn.disabled=true;
 try{
  const trial=await getDoc(ref);
  if(!trial.exists() || trial.data().status!=='closed')throw Error('First change trial status to Closed and save the trial.');
  if(trial.data().verdictSummary)throw Error('Results already published.');
  const ballots=await getDocs(collection(db,'trials',id,'votes'));
  const guilty=ballots.docs.filter(x=>x.data().choice==='guilty').length;
  const notGuilty=ballots.docs.filter(x=>x.data().choice==='not-guilty').length;
  if(!confirm(`Publish final result for ${id}? Guilty: ${guilty}, Not Guilty: ${notGuilty}.`))return;
  await updateDoc(ref,{verdictSummary:{guilty,notGuilty}});
  status('Final tally published.');await refreshVotes();
 }catch(err){status('Cannot publish verdict: '+(err.code||err.message))}finally{btn.disabled=false}
});
