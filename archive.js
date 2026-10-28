import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import {getAuth,initializeAuth,inMemoryPersistence,connectAuthEmulator} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import {getFirestore,connectFirestoreEmulator,collection,query,where,getDocsFromServer} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import {initializeFirebaseClient} from './firebase-client.js';
import {renderPortrait} from './portraits.js';
import {reasoningReleased} from './jury-reasoning.js';
const {db}=initializeFirebaseClient({initializeApp,getAuth,initializeAuth,inMemoryPersistence,connectAuthEmulator,getFirestore,connectFirestoreEmulator});
const $=id=>document.getElementById(id);
let archiveRequest=0;
function node(tag,text){const item=document.createElement(tag);if(text!==undefined)item.textContent=text;return item}
function renderArgument(container,data){
 const article=node('article');article.className='argument-card';
 const alias=node('h4',data.authorName||'Student');alias.className='archive-alias';
 const text=node('p',data.text||'');text.className='archive-argument-text';article.append(alias,text);
 if(data.evidenceUrl){try{const url=new URL(data.evidenceUrl);if(['http:','https:'].includes(url.protocol)){const link=node('a','Evidence source');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';article.append(link)}}catch{}}
 container.append(article);
}
function renderTally(summary){
 const container=$('archive-verdict');container.replaceChildren();
 if(!reasoningReleased({status:'closed',verdictSummary:summary})){container.textContent='Voting is permanently closed. A valid final jury tally has not yet been published.';return}
 for(const [label,count,kind] of [['Guilty',summary.guilty,'guilty'],['Not Guilty',summary.notGuilty,'not-guilty'],['Total votes',summary.guilty+summary.notGuilty,'total']]){
  const block=node('div');block.className='archive-total '+kind;block.append(node('span',label),node('strong',String(count)));container.append(block);
 }
}
function renderReasoningCards(docs){
 const list=$('archive-reasoning');list.replaceChildren();
 const copies=docs.filter(item=>{
  const data=item.data();return data&&Object.keys(data).length===2&&['guilty','not-guilty'].includes(data.choice)&&typeof data.reason==='string'&&data.reason.trim().length>=15&&data.reason.length<=2000;
 }).sort((a,b)=>a.id.localeCompare(b.id));
 for(const [index,item] of copies.entries()){
  const data=item.data(),card=node('article');card.className='reasoning-card '+data.choice;
  const heading=node('h3',`Juror #${index+1}`),choice=node('p',data.choice==='guilty'?'Guilty':'Not Guilty');choice.className='reasoning-choice';
  const text=node('p',data.reason);text.className='reasoning-text';card.append(heading,choice,text);list.append(card);
 }
 if(!copies.length)list.textContent='No jury justifications have been approved for public viewing.';
}
async function loadPublicReasoning(trial,current){
 const list=$('archive-reasoning');list.replaceChildren();
 if(!reasoningReleased(trial)){list.textContent='Reasoning may be published only after the final jury tally has been published.';return}
 list.textContent='Loading approved anonymous reasoning…';
 try{
  const snapshot=await getDocsFromServer(collection(db,'trials',trial.id,'publicReasoning'));if(!current())return;
  renderReasoningCards(snapshot.docs);
 }catch{if(current())list.textContent='Approved jury reasoning could not be loaded. Refresh the archive to retry.'}
}
async function loadArchive(){
 const request=++archiveRequest,current=()=>request===archiveRequest;
 $('archive-list').replaceChildren();$('archive-detail').hidden=true;$('archive-browser').hidden=false;$('archive-back').hidden=true;$('archive-status').textContent='Loading completed trials…';$('archive-status').setAttribute('aria-busy','true');$('archive-refresh').disabled=true;
 try{
  const snapshot=await getDocsFromServer(query(collection(db,'trials'),where('status','==','closed')));if(!current())return;
  const trials=snapshot.docs.map(item=>({id:item.id,...item.data()})).filter(item=>item.status==='closed').sort((a,b)=>String(a.title||a.id).localeCompare(String(b.title||b.id)));
  for(const trial of trials){const item=node('li'),link=node('a'),portrait=node('span');portrait.className='trial-portrait archive-thumbnail';renderPortrait(portrait,trial.portraitUrl,`Portrait for ${trial.title||trial.id}`);link.append(portrait,node('span',trial.title||trial.id));link.href='archive.html?trial='+encodeURIComponent(trial.id);item.append(link);$('archive-list').append(item)}
  if(!trials.length){$('archive-status').textContent='No completed trials yet. Visit the active court to follow the current case.';return}
  const selected=new URLSearchParams(location.search).get('trial');
  if(!selected){$('archive-status').textContent=`${trials.length} completed trial(s). Choose a case to read its published arguments and final tally.`;return}
  const trial=trials.find(item=>item.id===selected);
  if(!trial){$('archive-status').textContent='That completed trial is unavailable. Choose one of the listed cases.';return}
  $('archive-browser').hidden=true;$('archive-back').hidden=false;
  renderPortrait($('archive-portrait'),trial.portraitUrl,`Portrait for ${trial.title||trial.id}`);$('archive-title').textContent=trial.title||trial.id;$('archive-info').textContent=typeof trial.charge==='string'?trial.charge:'';
  $('archive-status').textContent='Loading published arguments…';
  const submissions=await getDocsFromServer(query(collection(db,'trials',trial.id,'submissions'),where('status','==','published')));if(!current())return;
  const feeds={prosecution:$('archive-prosecution'),defense:$('archive-defense')};for(const feed of Object.values(feeds))feed.replaceChildren();
  for(const item of submissions.docs){const post=item.data();if(post.status==='published'&&feeds[post.section])renderArgument(feeds[post.section],post)}
  for(const feed of Object.values(feeds))if(!feed.children.length)feed.textContent='No published arguments for this side.';
  renderTally(trial.verdictSummary);$('archive-detail').hidden=false;await loadPublicReasoning(trial,current);if(!current())return;
  $('archive-status').textContent='Completed trial. Published arguments and teacher-approved anonymous reasoning are shown. Original ballots and identities remain private.';
 }catch(error){if(current())$('archive-status').textContent='Unable to load the archive. Check your connection and try again. '+(error.code||error.message)}
 finally{if(current()){$('archive-refresh').disabled=false;$('archive-status').setAttribute('aria-busy','false')}}
}
$('archive-refresh').addEventListener('click',loadArchive);
loadArchive();
