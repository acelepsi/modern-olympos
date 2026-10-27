// =================================================================
// MODERN OLYMPOS — app.js (public-first, modal-login)
// =================================================================
// Key change from v1: NOTHING here blocks page render. The Trial
// Room markup is visible immediately to any visitor. Firebase Auth
// is only ever touched when someone actually submits the login
// modal — there is no more silent signInAnonymously() on load.
//
// If a visitor previously logged in on this browser, Firebase Auth
// persists that anonymous identity across reloads on its own, so
// onAuthStateChanged() below will still pick them back up and
// restore their signed-in UI automatically — no action needed from
// us to make that happen.
// =================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, initializeAuth, inMemoryPersistence, connectAuthEmulator,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, connectFirestoreEmulator,
  doc,
  getDoc,
  onSnapshot,
  collection, addDoc, updateDoc, setDoc, query, where, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import { initializeFirebaseClient } from './firebase-client.js';
const { app, auth, db, accountDomain } = initializeFirebaseClient({
  initializeApp, getAuth, initializeAuth, inMemoryPersistence, connectAuthEmulator,
  getFirestore, connectFirestoreEmulator
});

// -----------------------------------------------------------------
// DOM references
// -----------------------------------------------------------------
const el = {
  loginBtn: document.getElementById("login-btn"),
  sessionChip: document.getElementById("session-chip"),
  sessionName: document.getElementById("session-name"),
  sessionRoleTag: document.getElementById("session-role-tag"),
  logoutBtn: document.getElementById("logout-btn"),

  overlay: document.getElementById("login-overlay"),
  modalClose: document.getElementById("modal-close"),
  loginForm: document.getElementById("login-form"),
  codeInput: document.getElementById("access-code"),
  passwordInput: document.getElementById("student-password"),
  enterBtn: document.getElementById("enter-btn"),
  loginStatus: document.getElementById("login-status"),

  prosecutionComposer: document.getElementById("prosecution-composer"),
  prosecutionLocked: document.getElementById("prosecution-locked"),
  defenseComposer: document.getElementById("defense-composer"),
  defenseLocked: document.getElementById("defense-locked"),

  juryVoteForm: document.getElementById("jury-vote-form"),
  voteChoiceButtons: document.querySelectorAll("[data-choice]"),
  voteJustification: document.getElementById("vote-justification"),
};

// -----------------------------------------------------------------
// Modal open/close — including the inline "Log in" links buried in
// the locked-notice text under each composer.
// -----------------------------------------------------------------
function openModal() {
  el.overlay.hidden = false;
  el.codeInput.value = "";
  setLoginStatus("", "");
  el.codeInput.focus();
}

function closeModal() {
  el.overlay.hidden = true;
}

el.loginBtn.addEventListener("click", openModal);
el.modalClose.addEventListener("click", closeModal);
el.overlay.addEventListener("click", (e) => {
  if (e.target === el.overlay) closeModal(); // click outside the card
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !el.overlay.hidden) closeModal();
});
// Note: the header Login button is now the ONLY login entry point —
// the columns no longer contain their own inline login affordance.

function setLoginStatus(message, state) {
  el.loginStatus.textContent = message;
  el.loginStatus.dataset.state = state || "";
}

// Permanent student credentials. These are *virtual* Firebase Auth emails,
// not actual email inboxes. Accounts are provisioned by a teacher in Firebase
// Authentication. Passwords never enter Firestore.
const ACCOUNT_DOMAIN = accountDomain;
let activeTrialId = null;
let unsubscribeActiveTrial = null;
let unsubscribeTrial = null;
let unsubscribeProfile = null;
let unsubscribeAssignment = null;
let currentProfile = null;
let currentAssignment = null;
let authRevision = 0;
let sessionUid;
let contextGeneration = 0;
let trialRevision = 0;

function captureContext() {
  return { generation: contextGeneration, uid: auth.currentUser?.uid, trialId: activeTrialId };
}
function isCurrentContext(context) {
  return context.generation === contextGeneration && context.uid === auth.currentUser?.uid && context.trialId === activeTrialId;
}
// A new generation also rejects completions after switching away and back.
function clearPrivateContext() {
  contextGeneration++;
  voteRevision++;
  ballotWriteInFlight = false;
  alreadyVoted = false;
  checkingVote = false;
  ballotLookupFailed = false;
  ballotError = '';
  selectedChoice = null;
  for (const side of ['prosecution', 'defense']) {
    const form = document.getElementById(side + '-composer');
    form.reset();
    delete form.dataset.editId;
    form.querySelectorAll('button').forEach(button => { button.disabled = false; });
    document.getElementById(side + '-feedback').textContent = '';
  }
  el.passwordInput.value = '';
  setLoginStatus('', '');
  el.voteJustification.value = '';
  el.voteChoiceButtons.forEach(button => {
    button.classList.remove('selected');
    button.setAttribute('aria-pressed', 'false');
  });
  document.getElementById('jury-selection-status').textContent = 'No verdict selected.';
  voteStatus.textContent = '';
  retryBallot.hidden = true;
  if (stopMine) stopMine();
  stopMine = null;
  mySubmissions = [];
  document.getElementById('my-submissions').hidden = true;
  document.getElementById('my-submissions-list').replaceChildren();
}

function codeToEmail(code) {
  const clean = code.trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,24}$/.test(clean)) {
    throw new Error("Use 4–24 letters, numbers or hyphens for your student code.");
  }
  return `${clean.toLowerCase()}@${ACCOUNT_DOMAIN}`;
}

el.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  el.enterBtn.disabled = true;
  setLoginStatus("Signing in…", "pending");
  try {
    const email = codeToEmail(el.codeInput.value);
    await signInWithEmailAndPassword(auth, email, el.passwordInput.value);
    el.passwordInput.value = "";
    setLoginStatus("Signed in. Loading your trial assignment…", "ok");
    setTimeout(closeModal, 500);
  } catch (err) {
    console.error("Sign-in failed:", err.code || err.message);
    setLoginStatus(err.message?.startsWith("Use 4") ? err.message :
      "Code or password incorrect, or the account has not been created.", "error");
  } finally {
    el.enterBtn.disabled = false;
  }
});

el.logoutBtn.addEventListener("click", async () => {
  try { await signOut(auth); }
  catch (err) { console.error("Sign-out failed", err); }
});

function stopListeners() {
  if (unsubscribeProfile) unsubscribeProfile();
  if (unsubscribeAssignment) unsubscribeAssignment();
  unsubscribeProfile = null;
  unsubscribeAssignment = null;
}

onAuthStateChanged(auth, (user) => {
  authRevision++;
  const revision = authRevision;
  stopListeners();
  if (sessionUid !== user?.uid) {
    sessionUid = user?.uid;
    clearPrivateContext();
  }
  currentProfile = null;
  currentAssignment = null;
  applySession(null);
  if (!user) return;
  unsubscribeProfile = onSnapshot(doc(db, "students", user.uid), snap => {
    if (revision !== authRevision) return;
    currentProfile = snap.exists() ? snap.data() : null;
    renderIdentity();
  }, err => { if (revision !== authRevision) return; console.error("Student profile access:", err); applySession(null); });
  // The active trial is resolved independently below. It may change while signed in.
  subscribeAssignmentForActiveTrial(user, revision);

});

function subscribeAssignmentForActiveTrial(user, revision) {
  if (unsubscribeAssignment) unsubscribeAssignment();
  unsubscribeAssignment = null;
  currentAssignment = null;
  alreadyVoted = false;
  ballotError = "";
  ballotLookupFailed = false;
  checkingVote = true;
  renderIdentity();
  if (!user || !activeTrialId) return;
  const context = captureContext();
  unsubscribeAssignment = onSnapshot(
    doc(db, "trials", activeTrialId, "assignments", user.uid),
    snap => {
      if (revision !== authRevision || !isCurrentContext(context)) return;
      currentAssignment = snap.exists() ? snap.data() : null;
      renderIdentity();
      refreshMyVote();
    },
    err => { if (revision !== authRevision || !isCurrentContext(context)) return; console.error("Trial assignment access:", err); currentAssignment = null; renderIdentity(); }
  );
}

// A public pointer selects the current case for every visitor, even before login.
unsubscribeActiveTrial = onSnapshot(doc(db, "settings", "currentTrial"), snap => {
  const nextId = snap.exists() ? snap.data().trialId : null;
  if (nextId === activeTrialId) return;
  clearPrivateContext();
  const revision = ++trialRevision;
  currentTrial.verdictSummary = null;
  renderPublicVerdict();
  activeTrialId = nextId || null;
  if (unsubscribeTrial) unsubscribeTrial();
  unsubscribeTrial = null;
  const title = document.getElementById("defendant-name");
  const charge = document.getElementById("defendant-charge");
  if (title) title.textContent = activeTrialId ? "Loading trial…" : "No active trial";
  if (charge) charge.textContent = "";
  setTrialStatus("closed");
  if (activeTrialId) {
    unsubscribeTrial = onSnapshot(doc(db, "trials", activeTrialId), trialSnap => {
      if (revision !== trialRevision) return;
      if (!trialSnap.exists()) {
        if (title) title.textContent = "Trial unavailable";
        setTrialStatus("closed");
        return;
      }
      const data = trialSnap.data();
      currentTrial.verdictSummary = data.verdictSummary || null;
      renderPublicVerdict();
      if (title) title.textContent = data.title || activeTrialId;
      if (charge) charge.textContent = data.charge || "";
      setTrialStatus(data.status || "closed");
      refreshMyVote();
    }, err => { if (revision === trialRevision) console.error("Active trial access:", err); });
  }
  subscribeAssignmentForActiveTrial(auth.currentUser, authRevision);
}, err => console.error("Active trial settings access:", err));

function renderIdentity() {
  if (!currentProfile || currentProfile.active !== true) {
    applySession(null);
    return;
  }
  const role = currentAssignment?.role || "unassigned";
  applySession({ name: currentProfile.displayName || "Student", role });
}

// -----------------------------------------------------------------
// applySession(session | null): the single source of truth for all
// role-conditional UI on the page — header chip, composers, jury
// voting form.
// -----------------------------------------------------------------
function applySession(session) {
  if (session) {
    el.loginBtn.hidden = true;
    el.sessionChip.hidden = false;
    el.sessionName.textContent = session.name;
    el.sessionRoleTag.textContent = session.role;
    el.sessionRoleTag.dataset.role = session.role;
  } else {
    el.loginBtn.hidden = false;
    el.sessionChip.hidden = true;
  }

  applyComposerVisibility(session);
  applyJuryVisibility(session);
}

// Static text only — the header Login button is the single login
// entry point, so these notices never contain a control of their own.
const PROSECUTION_LOCKED_TEXT = "Only Prosecutors may post here. Log in from the header to participate.";
const DEFENSE_LOCKED_TEXT = "Only Lawyers may post here. Log in from the header to participate.";

function applyComposerVisibility(session) {
  const role = currentTrial.status === "trial" ? (session?.role ?? null) : null;

  // Prosecution column: visible ONLY for a signed-in prosecutor.
  const isProsecutor = role === "prosecutor";
  el.prosecutionComposer.hidden = !isProsecutor;
  el.prosecutionLocked.hidden = isProsecutor;
  el.prosecutionLocked.textContent = PROSECUTION_LOCKED_TEXT;

  // Defense column: visible ONLY for a signed-in lawyer.
  const isLawyer = role === "defender";
  el.defenseComposer.hidden = !isLawyer;
  el.defenseLocked.hidden = isLawyer;
  el.defenseLocked.textContent = DEFENSE_LOCKED_TEXT;
}

// -----------------------------------------------------------------
// currentTrial: local cache of the active trial's phase, so the
// jury-vote gating below has something to check against. This is a
// stand-in until the live `trials/{id}` onSnapshot listener (see
// TODO block at the bottom of this file) replaces it — at that
// point, setTrialStatus() is the function the listener should call
// on every update instead of this hardcoded default.
// -----------------------------------------------------------------
let currentTrial = { status: "trial" };

function setTrialStatus(status) {
  currentTrial.status = status;
  applyJuryVisibility(lastKnownSession);
  applyComposerVisibility(lastKnownSession);
  renderPublicVerdict();
  const pill = document.getElementById("status-pill");
  if (pill) { pill.textContent = status; pill.dataset.status = status; }
  // TODO: also drive #status-pill text/data-status, composer
  // enable/disable by phase, and the results tally once 'closed'.
}

let lastKnownSession = null;

let voteRevision = 0;
let alreadyVoted = false;
let checkingVote = false;
let ballotError = '';
let ballotLookupFailed = false;
let ballotWriteInFlight = false;
const voteStatus = document.getElementById('jury-vote-status');
const retryBallot = document.getElementById('retry-ballot');
retryBallot.addEventListener('click', refreshMyVote);
function renderPublicVerdict() {
  const tally = document.getElementById('results-tally');
  const summary = currentTrial.verdictSummary;
  const show = currentTrial.status === 'closed' && summary && Number.isInteger(summary.guilty) && Number.isInteger(summary.notGuilty);
  tally.hidden = !show;
  if(show){
    document.getElementById('tally-prosecution').textContent = summary.guilty;
    document.getElementById('tally-defense').textContent = summary.notGuilty;
  }
}
function applyJuryVisibility(session) {
  lastKnownSession = session;
  const canVote = !!(session && session.role === 'juror' && activeTrialId && currentTrial.status === 'verdict' && !alreadyVoted && !checkingVote && !ballotLookupFailed);
  el.juryVoteForm.hidden = !canVote;
  retryBallot.hidden = !(session?.role === 'juror' && ballotLookupFailed && !checkingVote && currentTrial.status === 'verdict');
  if (voteStatus) voteStatus.textContent = currentTrial.status === 'closed' ? 'Voting closed.' :
    ballotError && session?.role === 'juror' ? ballotError :
    alreadyVoted && session?.role === 'juror' ? 'Your final vote was recorded. Thank you.' :
    checkingVote && session?.role === 'juror' ? 'Checking your ballot…' :
    currentTrial.status === 'verdict' && session?.role !== 'juror' ? 'Voting is open for assigned jurors only.' : '';
}
async function refreshMyVote() {
  // Snapshot-driven refreshes must not unlock an unacknowledged write.
  if (ballotWriteInFlight) return;
  const context = captureContext();
  const rev = ++voteRevision;
  alreadyVoted = false;
  ballotError = '';
  ballotLookupFailed = false;
  const user = auth.currentUser;
  if(!user || !activeTrialId || currentAssignment?.role !== 'juror'){
    checkingVote=false;applyJuryVisibility(lastKnownSession);return;
  }
  checkingVote=true;applyJuryVisibility(lastKnownSession);
  try{
    const snap=await getDoc(doc(db,'trials',context.trialId,'votes',context.uid));
    if(rev!==voteRevision || !isCurrentContext(context))return;
    alreadyVoted=snap.exists();
  }catch(err){if(rev!==voteRevision || !isCurrentContext(context))return;ballotLookupFailed=true;ballotError='Cannot verify ballot: '+(err.code||err.message)+'. Retry the ballot check.';}
  if(rev===voteRevision && isCurrentContext(context)){checkingVote=false;applyJuryVisibility(lastKnownSession);}
}
// -----------------------------------------------------------------
// Jury selection and immutable ballot submission.
// -----------------------------------------------------------------
let selectedChoice = null;
el.voteChoiceButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    selectedChoice = btn.dataset.choice;
    el.voteChoiceButtons.forEach((b) => {
      b.classList.toggle("selected", b === btn);
      b.setAttribute("aria-pressed", String(b === btn));
    });
    document.getElementById("jury-selection-status").textContent = "Selected verdict: " + btn.textContent + ".";
  });
});

el.juryVoteForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const reason=el.voteJustification.value.trim();
  const user=auth.currentUser;
  if(!selectedChoice || !['guilty','not-guilty'].includes(selectedChoice))return alert('Select Guilty or Not Guilty.');
  if(reason.length<15 || reason.length>2000)return alert('Write a reason between 15 and 2000 characters.');
  if(!user || !activeTrialId || currentTrial.status!=='verdict' || currentAssignment?.role!=='juror' || alreadyVoted || checkingVote || ballotLookupFailed)return;
  if(!confirm('Your final vote cannot be changed. Submit now?'))return;
  const context=captureContext();
  voteRevision++;
  ballotWriteInFlight=true;
  ballotError='';
  checkingVote=true;applyJuryVisibility(lastKnownSession);
  try{
    await setDoc(doc(db,'trials',context.trialId,'votes',context.uid),{choice:selectedChoice,reason,castAt:serverTimestamp()});
    if(!isCurrentContext(context))return;
    alreadyVoted=true;el.voteJustification.value='';selectedChoice=null;
    el.voteChoiceButtons.forEach(b=>{b.classList.remove('selected');b.setAttribute('aria-pressed','false')});
    document.getElementById('jury-selection-status').textContent='No verdict selected.';
    voteStatus.textContent='Your final vote was recorded.';
  }catch(err){if(!isCurrentContext(context))return;ballotError='Vote failed: '+(err.code||err.message)+'. Your vote has not been confirmed. Retry or reload to check your ballot.';}
  finally{if(isCurrentContext(context)){ballotWriteInFlight=false;checkingVote=false;applyJuryVisibility(lastKnownSession);}}
});

// -----------------------------------------------------------------
// TODO (next step, same as before):
//   - onSnapshot(doc(db, "trials", currentTrialId)) to populate the
//     dossier bar + status pill, and call setTrialStatus(newStatus)
//     on every update so jury-vote gating (and eventually composer
//     phase-gating, results tally) react live instead of using the
//     hardcoded currentTrial default above.
//   - onSnapshot(query(collection(db, "arguments"), where(...)))
//     for each column's feed — public, so no auth needed to read.
//   - onSnapshot(query(collection(db, "verdicts"), where(...))) to
//     compute and render the live/public results tally.
//   - Wire composer <form> submits to addDoc(...).
// -----------------------------------------------------------------

// v5: case-scoped, moderated submissions.
let stopPublished = null, stopMine = null;
let mySubmissions = [];
function submissionCollection() { return collection(db, 'trials', activeTrialId, 'submissions'); }
function renderPost(container, data) {
  const article=document.createElement('article');article.className='argument-card';
  const meta=document.createElement('div');meta.className='meta';
  const author=document.createElement('span');author.className='author';author.textContent=data.authorName||'Student';meta.append(author);
  const text=document.createElement('div');text.className='text';text.textContent=data.text||'';
  article.append(meta,text);
  if(data.evidenceUrl){try{const u=new URL(data.evidenceUrl);if(['https:','http:'].includes(u.protocol)){const a=document.createElement('a');a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Evidence link';article.append(a)}}catch{}}
  container.append(article);
}
function renderMine(){
 const panel=document.getElementById('my-submissions'),list=document.getElementById('my-submissions-list');
 if(!panel||!list)return;
 const allowed=auth.currentUser&&currentProfile?.active===true&&currentProfile?.accountType==='student';
 panel.hidden=!allowed;list.replaceChildren();if(!allowed)return;
 if(!mySubmissions.length){list.textContent='No submissions for this trial yet.';return;}
 for(const post of mySubmissions){
  const wrap=document.createElement('div');wrap.className='my-submission';
  const title=document.createElement('strong');title.textContent=`${post.section} · ${post.status}`;
  const para=document.createElement('p');para.textContent=post.text;wrap.append(title,para);
  if(post.feedback){const feedback=document.createElement('p');feedback.textContent='Teacher feedback: '+post.feedback;wrap.append(feedback)}
  if(['draft','returned'].includes(post.status)){
   const edit=document.createElement('button');edit.type='button';edit.textContent='Edit';edit.onclick=()=>{
    const form=document.getElementById(post.section+'-composer');if(form.hidden){alert('Your current role or the trial phase does not allow editing this submission.');return}
    form.dataset.editId=post.id;form.querySelector('textarea').value=post.text;form.querySelector('input[type=url]').value=post.evidenceUrl||'';
    form.scrollIntoView({behavior:'smooth'});
   };wrap.append(edit);
  }
  list.append(wrap);
 }
}
function refreshSubmissionListeners(){
 if(stopPublished)stopPublished();if(stopMine)stopMine();stopPublished=stopMine=null;mySubmissions=[];renderMine();
 for(const side of ['prosecution','defense'])document.getElementById(side+'-feed').replaceChildren();
 if(!activeTrialId)return;
 const trialAtSubscribe=activeTrialId;
 stopPublished=onSnapshot(query(submissionCollection(),where('status','==','published')),snap=>{
  if(trialAtSubscribe!==activeTrialId)return;
  const feeds={prosecution:document.getElementById('prosecution-feed'),defense:document.getElementById('defense-feed')};
  for(const feed of Object.values(feeds))feed.replaceChildren();
  for(const item of snap.docs){const post=item.data();if(feeds[post.section])renderPost(feeds[post.section],post)}
  for(const feed of Object.values(feeds))if(!feed.children.length)feed.textContent='No approved submissions yet.';
 },err=>console.error('Published submissions:',err));
 const user=auth.currentUser;
 if(user&&currentProfile?.active===true&&currentProfile?.accountType==='student'){
  stopMine=onSnapshot(query(submissionCollection(),where('authorUid','==',user.uid)),snap=>{
   if(trialAtSubscribe!==activeTrialId||auth.currentUser?.uid!==user.uid)return;
   mySubmissions=snap.docs.map(x=>({id:x.id,...x.data()}));renderMine();
  },err=>console.error('My submissions:',err));
 }
}
for(const side of ['prosecution','defense']){
 const form=document.getElementById(side+'-composer');
 const feedback=document.getElementById(side+'-feedback');
 const save=async status=>{
  const user=auth.currentUser;
  const context=captureContext();
  if(!user||!activeTrialId||currentTrial.status!=='trial'||currentProfile?.active!==true||currentProfile?.accountType!=='student'||currentAssignment?.role!==(side==='prosecution'?'prosecutor':'defender')){feedback.textContent='You cannot submit in this trial or role.';return}
  const body=form.querySelector('textarea').value.trim(),link=form.querySelector('input[type=url]').value.trim();
  if(!body||body.length>5000){feedback.textContent='Please enter between 1 and 5000 characters.';return}
  if(link&&(!/^https?:\/\//i.test(link)||link.length>1000)){feedback.textContent='Evidence must be an http(s) URL under 1000 characters.';return}
  const buttons=[...form.querySelectorAll('button')];buttons.forEach(x=>x.disabled=true);
  try{
   const editId=form.dataset.editId;
   if(editId){const existing=mySubmissions.find(x=>x.id===editId);if(!existing||!['draft','returned'].includes(existing.status)||existing.section!==side)throw Error('This draft can no longer be edited.');
    await updateDoc(doc(db,'trials',context.trialId,'submissions',editId),{text:body,evidenceUrl:link,status,feedback:''});
   }else{
    await addDoc(collection(db,'trials',context.trialId,'submissions'),{trialId:context.trialId,authorUid:user.uid,authorName:currentProfile.displayName||'Student',section:side,text:body,evidenceUrl:link,status,feedback:'',createdAt:serverTimestamp()});
   }
   if(!isCurrentContext(context))return;
   form.reset();delete form.dataset.editId;feedback.textContent=status==='draft'?'Draft saved privately.':'Sent to administrator for approval.';
  }catch(err){if(!isCurrentContext(context))return;feedback.textContent='Save failed: '+(err.code||err.message);console.error(err)}finally{if(isCurrentContext(context))buttons.forEach(x=>x.disabled=false)}
 };
 form.addEventListener('submit',e=>{e.preventDefault();save('pending')});
 form.querySelector('[data-action=draft]').addEventListener('click',()=>save('draft'));
}
// Reconnect when the active case, signed-in user or profile changes.
onSnapshot(doc(db,'settings','currentTrial'),()=>queueMicrotask(refreshSubmissionListeners));
onAuthStateChanged(auth,()=>queueMicrotask(refreshSubmissionListeners));
// Profile may arrive after auth, so observe it separately.
const previousRenderIdentity=renderIdentity;
renderIdentity=function(){previousRenderIdentity();refreshSubmissionListeners();};
