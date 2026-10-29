import {createSchoolAttribution} from './school-attribution.js';
import {renderTrialProgress,updateCourtCounters,setupCourtCounters,setupCourtTabs,createVoteConfirmation} from './court-ui.js';
import {chronologicalSubmissions,validEvidence} from './case-content.js';
// =================================================================
// MODERN OLYMPOS — app.js (public-first, modal-login)
// =================================================================
// Public content is visible before login. Student code/password sign-in uses
// Firebase Authentication; persisted sessions are restored by onAuthStateChanged.
// No anonymous account is created on page load.

import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import {
  getAuth, initializeAuth, inMemoryPersistence, connectAuthEmulator,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {
  getFirestore, connectFirestoreEmulator,
  doc,
  getDoc,
  onSnapshot,
  collection, addDoc, updateDoc, setDoc, query, where, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

import { initializeFirebaseClient } from './firebase-client.js';
import { renderPortrait } from './portraits.js';
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
// Student login modal.
// -----------------------------------------------------------------
const courtTabs=setupCourtTabs();
setupCourtCounters();
const voteConfirmation=createVoteConfirmation(document.getElementById('vote-confirmation'));
let pendingVoteReview=null;

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
  voteConfirmation.cancel();
  pendingVoteReview=null;
  document.getElementById('cast-vote').disabled=false;
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
  updateCourtCounters();
  document.getElementById('returned-count').hidden=true;
  document.getElementById('returned-count').textContent='';
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
  mineContext = null;
  mineRevision++;
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
  catch (err) { document.getElementById("account-status").textContent="Unable to sign out. Check your connection and try again."; }
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
  refreshSubmissionListeners();
  document.getElementById("account-status").textContent=user?"Loading your account…":"";
  if (!user) return;
  unsubscribeProfile = onSnapshot(doc(db, "students", user.uid), snap => {
    if (revision !== authRevision) return;
    currentProfile = snap.exists() ? snap.data() : null;
    renderIdentity();
    refreshSubmissionListeners();
  }, err => { if (revision !== authRevision) return; currentProfile=null;clearPrivateContext();applySession(null);refreshSubmissionListeners();document.getElementById("account-status").textContent="Unable to read your student access. Try signing out and signing in again, or ask your teacher."; });
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
    err => { if (revision !== authRevision || !isCurrentContext(context)) return; currentAssignment = null; renderIdentity();document.getElementById("account-status").textContent="Unable to load your role. Ask the teacher or reload to retry."; }
  );
}

// A public pointer selects the current case for every visitor, even before login.
unsubscribeActiveTrial = onSnapshot(doc(db, "settings", "currentTrial"), snap => {
  const nextId = snap.exists() ? snap.data().trialId : null;
  document.getElementById("court-status").textContent=nextId?"":"No active trial yet. Your teacher will activate a case.";
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
  if (charge) {charge.textContent = "";charge.hidden=true;}
  renderPortrait(document.getElementById("mugshot"),null);
  setTrialStatus("closed",false);
  if (activeTrialId) {
    unsubscribeTrial = onSnapshot(doc(db, "trials", activeTrialId), trialSnap => {
      if (revision !== trialRevision) return;
      if (!trialSnap.exists()) {
        if (title) title.textContent = "Trial unavailable";
        renderPortrait(document.getElementById("mugshot"),null);
        currentTrial.verdictSummary=null;setTrialStatus("closed",false);
        document.getElementById("court-status").textContent="The selected trial is unavailable. Please ask your teacher.";
        return;
      }
      const data = trialSnap.data();
      currentTrial.verdictSummary = data.verdictSummary || null;
      renderPublicVerdict();
      if (title) title.textContent = data.title || activeTrialId;
      renderPortrait(document.getElementById("mugshot"),data.portraitUrl,`Portrait for ${data.title||activeTrialId}`);
      if (charge) {charge.textContent = typeof data.charge==='string'?data.charge:"";charge.hidden=!charge.textContent;}
      setTrialStatus(data.status || "closed",['trial','verdict','closed'].includes(data.status));
      refreshMyVote();
    }, err => { if (revision !== trialRevision)return;clearPrivateContext();renderPortrait(document.getElementById("mugshot"),null);currentTrial.verdictSummary=null;setTrialStatus("closed",false);document.getElementById("court-status").textContent="Unable to load this trial. Reload to retry."; });
  }
  subscribeAssignmentForActiveTrial(auth.currentUser, authRevision);
  refreshSubmissionListeners();
}, err => {clearPrivateContext();trialRevision++;if(unsubscribeTrial)unsubscribeTrial();renderPortrait(document.getElementById("mugshot"),null);activeTrialId=null;currentTrial.verdictSummary=null;setTrialStatus("closed",false);refreshSubmissionListeners();document.getElementById("court-status").textContent="Unable to load the active trial. Reload to retry.";});

function renderIdentity() {
  document.getElementById("account-status").textContent=!auth.currentUser?"":!currentProfile?"Student access is not available. Ask your teacher or sign out to switch accounts.":currentProfile.active!==true?"Participation is paused. You may read public content; ask your teacher to resume access.":"";
  if (!currentProfile || currentProfile.active !== true) {
    applySession(null);
    return;
  }
  const role = currentProfile.accountType === "student" ? (currentAssignment?.role || "unassigned") : "unassigned";
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
    el.loginBtn.hidden = !!auth.currentUser;
    el.sessionChip.hidden = !auth.currentUser;
    el.sessionName.textContent=auth.currentUser?(currentProfile?.displayName||"Signed-in account"):"";
    el.sessionRoleTag.textContent=auth.currentUser?"Access unavailable":"";
  }

  applyComposerVisibility(session);
  applyJuryVisibility(session);
}

// Static text only — the header Login button is the single login
// entry point, so these notices never contain a control of their own.
const PROSECUTION_LOCKED_TEXT = "Only Prosecutors may post here. Log in from the header to participate.";
const DEFENSE_LOCKED_TEXT = "Only defense representatives may post here. Log in from the header to participate.";

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
// cache updated by the live trials/{id} listener. Unknown or unavailable
// trials stay closed until their phase has been loaded.
// -----------------------------------------------------------------
let currentTrial = { status: "trial" };

function setTrialStatus(status,known=true) {
  renderTrialProgress(known?status:null);
  if(status!=='verdict')voteConfirmation.cancel();
  currentTrial.status = status;
  applyJuryVisibility(lastKnownSession);
  applyComposerVisibility(lastKnownSession);
  renderPublicVerdict();
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
  if(session?.role!=='juror'||alreadyVoted)voteConfirmation.cancel();
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
  if(pendingVoteReview||ballotWriteInFlight)return;
  const reason=el.voteJustification.value.trim(),choice=selectedChoice;
  if(!['guilty','not-guilty'].includes(choice)){voteStatus.textContent='Select Guilty or Not Guilty.';return}
  if(reason.length<15 || reason.length>2000){voteStatus.textContent='Write a reason between 15 and 2000 characters.';el.voteJustification.focus();return}
  const context=captureContext();
  const eligible=()=>isCurrentContext(context)&&auth.currentUser&&activeTrialId&&currentTrial.status==='verdict'&&currentProfile?.active===true&&currentProfile?.accountType==='student'&&currentAssignment?.role==='juror'&&!alreadyVoted&&!checkingVote&&!ballotLookupFailed;
  if(!eligible())return;
  const review={context};pendingVoteReview=review;
  document.getElementById('cast-vote').disabled=true;
  let approved=false;
  try{approved=await voteConfirmation.ask(choice==='guilty'?'Guilty':'Not Guilty',reason)}
  finally{if(pendingVoteReview===review){pendingVoteReview=null;document.getElementById('cast-vote').disabled=false}}
  if(!approved||!eligible())return;
  voteRevision++;
  ballotWriteInFlight=true;
  ballotError='';
  checkingVote=true;applyJuryVisibility(lastKnownSession);
  try{
    await setDoc(doc(db,'trials',context.trialId,'votes',context.uid),{choice,reason,castAt:serverTimestamp()});
    if(!isCurrentContext(context))return;
    alreadyVoted=true;el.voteJustification.value='';selectedChoice=null;updateCourtCounters();
    el.voteChoiceButtons.forEach(b=>{b.classList.remove('selected');b.setAttribute('aria-pressed','false')});
    document.getElementById('jury-selection-status').textContent='No verdict selected.';
    voteStatus.textContent='Your final vote was recorded.';
  }catch(err){if(!isCurrentContext(context))return;ballotError='Vote failed: '+(err.code||err.message)+'. Your vote has not been confirmed. Retry or reload to check your ballot.';}
  finally{if(isCurrentContext(context)){ballotWriteInFlight=false;checkingVote=false;applyJuryVisibility(lastKnownSession);}}
});

// -----------------------------------------------------------------
// v5: case-scoped, moderated submissions.
let stopPublished = null, stopMine = null, publishedRevision = 0, mineRevision = 0;
let publishedTrial = null, mineContext = null;
const argumentSchools=createSchoolAttribution({db,doc,onSnapshot});
const pendingSubmissionSaves=new Set();
let mySubmissions = [];
function renderPost(container, data) {
  const article=document.createElement('article');article.className='argument-card';
  const meta=document.createElement('div');meta.className='meta';
  const author=document.createElement('span');author.className='author';author.textContent=data.authorName||'Student';meta.append(author);
  const text=document.createElement('div');text.className='text';text.textContent=data.text||'';
  article.append(meta,text);
  if(data.evidenceUrl){try{const u=new URL(data.evidenceUrl);if(['https:','http:'].includes(u.protocol)){const a=document.createElement('a');a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Evidence link';article.append(a)}}catch{}}
  argumentSchools.render(meta,activeTrialId,data.id);
  container.append(article);
}
function renderMine(){
 const panel=document.getElementById('my-submissions'),list=document.getElementById('my-submissions-list');
 if(!panel||!list)return;
 const allowed=auth.currentUser&&currentProfile?.active===true&&currentProfile?.accountType==='student';
 panel.hidden=!allowed;list.replaceChildren();
 const returned=document.getElementById('returned-count'),count=allowed?mySubmissions.filter(post=>post.status==='returned').length:0;returned.hidden=!count;returned.textContent=count?`${count} returned for revision`:'';
 if(!allowed)return;
 if(!mySubmissions.length){list.textContent='No submissions for this trial yet.';return;}
 for(const post of mySubmissions){
  const wrap=document.createElement('div');wrap.className='my-submission';
  const title=document.createElement('strong');title.textContent=post.section==='defense'?'Defense':'Prosecution';
  const badge=document.createElement('span');badge.className='submission-badge';badge.dataset.status=['draft','pending','returned','published'].includes(post.status)?post.status:'unknown';badge.textContent=({draft:'Private draft',pending:'Pending review',returned:'Returned for revision',published:'Published'})[post.status]||'Status unavailable';
  const para=document.createElement('p');para.textContent=post.text;wrap.append(title,badge,para);
  if(post.feedback){const feedback=document.createElement('p');feedback.className=post.status==='returned'?'teacher-feedback returned-feedback':'teacher-feedback';feedback.textContent='Teacher feedback: '+post.feedback;wrap.append(feedback)}
  if(['draft','returned'].includes(post.status)){
   const edit=document.createElement('button');edit.type='button';edit.textContent='Edit';edit.onclick=()=>{
    const form=document.getElementById(post.section+'-composer');if(form.hidden){document.getElementById('account-status').textContent='Your current role or the trial phase does not allow editing this submission.';return}
    form.dataset.editId=post.id;form.querySelector('textarea').value=post.text;form.querySelector('input[type=url]').value=post.evidenceUrl||'';
    updateCourtCounters();courtTabs.select(post.section);
    form.scrollIntoView({behavior:'smooth'});form.querySelector('textarea').focus();
   };wrap.append(edit);
  }
  list.append(wrap);
 }
}
function refreshSubmissionListeners(){
 const trial=activeTrialId;
 // Public access depends only on the trial, not identity or role rendering.
 if(publishedTrial!==trial){
  publishedTrial=trial;const request=++publishedRevision;
  if(stopPublished)stopPublished();stopPublished=null;argumentSchools.clear();
  for(const side of ['prosecution','defense'])document.getElementById(side+'-feed').replaceChildren();
  if(trial)stopPublished=onSnapshot(query(collection(db,'trials',trial,'submissions'),where('status','==','published')),snap=>{
   if(request!==publishedRevision||trial!==activeTrialId)return;
   const feeds={prosecution:document.getElementById('prosecution-feed'),defense:document.getElementById('defense-feed')};
   argumentSchools.clear();for(const feed of Object.values(feeds))feed.replaceChildren();
   for(const post of chronologicalSubmissions(snap.docs,true))if(feeds[post.section])renderPost(feeds[post.section],post);
   for(const feed of Object.values(feeds))if(!feed.children.length)feed.textContent='No approved submissions yet.';
  },err=>{if(request!==publishedRevision||trial!==activeTrialId)return;for(const side of ['prosecution','defense'])document.getElementById(side+'-feed').textContent='Unable to load published arguments. Reload to retry.';});
 }
 const uid=auth.currentUser?.uid;
 const key=trial&&uid&&currentProfile?.active===true&&currentProfile?.accountType==='student'?JSON.stringify([trial,uid]):null;
 if(key===mineContext)return;
 mineContext=key;const request=++mineRevision;
 if(stopMine)stopMine();stopMine=null;mySubmissions=[];renderMine();
 if(key)stopMine=onSnapshot(query(collection(db,'trials',trial,'submissions'),where('authorUid','==',uid)),snap=>{
  if(request!==mineRevision||trial!==activeTrialId||auth.currentUser?.uid!==uid)return;
  mySubmissions=snap.docs.map(x=>({id:x.id,...x.data()}));renderMine();
 },err=>{if(request!==mineRevision||trial!==activeTrialId||auth.currentUser?.uid!==uid)return;mySubmissions=[];renderMine();document.getElementById('my-submissions-list').textContent='Unable to load your submissions. Reload to retry.';});
}
for(const side of ['prosecution','defense']){
 const form=document.getElementById(side+'-composer');
 const feedback=document.getElementById(side+'-feedback');
 const save=async status=>{
  const user=auth.currentUser;
  const context=captureContext(),saveKey=context.generation+':'+side;
  if(pendingSubmissionSaves.has(saveKey))return;
  if(!user||!activeTrialId||currentTrial.status!=='trial'||currentProfile?.active!==true||currentProfile?.accountType!=='student'||currentAssignment?.role!==(side==='prosecution'?'prosecutor':'defender')){feedback.textContent='You cannot submit in this trial or role.';return}
  const body=form.querySelector('textarea').value.trim(),link=form.querySelector('input[type=url]').value.trim();
  if(!body||body.length>5000){feedback.textContent='Please enter between 1 and 5000 characters.';return}
  const original=form.dataset.editId?mySubmissions.find(post=>post.id===form.dataset.editId):null;
  if(!validEvidence(link,original?.evidenceUrl)){feedback.textContent='New or changed evidence must be a valid HTTPS URL of at most 1000 characters.';return}
  pendingSubmissionSaves.add(saveKey);
  const buttons=[...form.querySelectorAll('button')];buttons.forEach(x=>x.disabled=true);
  try{
   const editId=form.dataset.editId;
   if(editId){const existing=mySubmissions.find(x=>x.id===editId);if(!existing||!['draft','returned'].includes(existing.status)||existing.section!==side)throw Error('This draft can no longer be edited.');
    await updateDoc(doc(db,'trials',context.trialId,'submissions',editId),{text:body,evidenceUrl:link,status,feedback:''});
   }else{
    await addDoc(collection(db,'trials',context.trialId,'submissions'),{trialId:context.trialId,authorUid:user.uid,authorName:currentProfile.displayName||'Student',section:side,text:body,evidenceUrl:link,status,feedback:'',createdAt:serverTimestamp()});
   }
   if(!isCurrentContext(context))return;
   form.reset();updateCourtCounters();delete form.dataset.editId;feedback.textContent=status==='draft'?'Draft saved privately.':'Sent to administrator for approval.';
  }catch(err){if(!isCurrentContext(context))return;feedback.textContent='Save failed: '+(err.code||err.message);console.error(err)}finally{pendingSubmissionSaves.delete(saveKey);if(isCurrentContext(context))buttons.forEach(x=>x.disabled=false)}
 };
 form.addEventListener('submit',e=>{e.preventDefault();return save('pending')});
 form.querySelector('[data-action=draft]').addEventListener('click',()=>save('draft'));
}
