import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import {getAuth,initializeAuth,inMemoryPersistence,connectAuthEmulator} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import {getFirestore,connectFirestoreEmulator,collection,query,where,getDocsFromServer} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import {initializeFirebaseClient} from './firebase-client.js';
const {db}=initializeFirebaseClient({initializeApp,getAuth,initializeAuth,inMemoryPersistence,connectAuthEmulator,getFirestore,connectFirestoreEmulator});
const $=id=>document.getElementById(id);
let archiveRequest=0;
function node(tag,text){const item=document.createElement(tag);if(text!==undefined)item.textContent=text;return item}
function renderArgument(container,data){
 const article=node('article');article.className='argument-card';
 article.append(node('p',data.authorName||'Student'),node('p',data.text||''));
 if(data.evidenceUrl){try{const url=new URL(data.evidenceUrl);if(['http:','https:'].includes(url.protocol)){const link=node('a','Evidence source');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';article.append(link)}}catch{}}
 container.append(article);
}
function renderTally(summary){
 const valid=summary&&Number.isSafeInteger(summary.guilty)&&Number.isSafeInteger(summary.notGuilty)&&summary.guilty>=0&&summary.notGuilty>=0&&summary.guilty+summary.notGuilty>0;
 $('archive-verdict').textContent=valid?`Published final jury tally — Guilty: ${summary.guilty}; Not Guilty: ${summary.notGuilty}. Total votes: ${summary.guilty+summary.notGuilty}.`:'Voting is permanently closed. A valid final jury tally has not yet been published.';
}
async function loadArchive(){
 const request=++archiveRequest,current=()=>request===archiveRequest;
 $('archive-list').replaceChildren();$('archive-detail').hidden=true;$('archive-status').textContent='Loading completed trials…';$('archive-status').setAttribute('aria-busy','true');$('archive-refresh').disabled=true;
 try{
  const snapshot=await getDocsFromServer(query(collection(db,'trials'),where('status','==','closed')));if(!current())return;
  const trials=snapshot.docs.map(item=>({id:item.id,...item.data()})).filter(item=>item.status==='closed').sort((a,b)=>String(a.title||a.id).localeCompare(String(b.title||b.id)));
  for(const trial of trials){const item=node('li'),link=node('a',trial.title||trial.id);link.href='archive.html?trial='+encodeURIComponent(trial.id);item.append(link);$('archive-list').append(item)}
  if(!trials.length){$('archive-status').textContent='No completed trials yet. Visit the active court to follow the current case.';return}
  const selected=new URLSearchParams(location.search).get('trial');
  if(!selected){$('archive-status').textContent=`${trials.length} completed trial(s). Choose a case to read its published arguments and final tally.`;return}
  const trial=trials.find(item=>item.id===selected);
  if(!trial){$('archive-status').textContent='That completed trial is unavailable. Choose one of the listed cases.';return}
  $('archive-title').textContent=trial.title||trial.id;$('archive-info').textContent=typeof trial.charge==='string'?trial.charge:'';
  $('archive-status').textContent='Loading published arguments…';
  const submissions=await getDocsFromServer(query(collection(db,'trials',trial.id,'submissions'),where('status','==','published')));if(!current())return;
  const feeds={prosecution:$('archive-prosecution'),defense:$('archive-defense')};for(const feed of Object.values(feeds))feed.replaceChildren();
  for(const item of submissions.docs){const post=item.data();if(post.status==='published'&&feeds[post.section])renderArgument(feeds[post.section],post)}
  for(const feed of Object.values(feeds))if(!feed.children.length)feed.textContent='No published arguments for this side.';
  renderTally(trial.verdictSummary);$('archive-detail').hidden=false;
  $('archive-status').textContent='Completed trial. Only published arguments and the final tally are shown; individual ballots remain private.';
 }catch(error){if(current())$('archive-status').textContent='Unable to load the archive. Check your connection and try again. '+(error.code||error.message)}
 finally{if(current()){$('archive-refresh').disabled=false;$('archive-status').setAttribute('aria-busy','false')}}
}
$('archive-refresh').addEventListener('click',loadArchive);
loadArchive();
