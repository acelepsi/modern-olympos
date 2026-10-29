import {initializeApp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {getAuth,initializeAuth,inMemoryPersistence,connectAuthEmulator} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {getFirestore,connectFirestoreEmulator,collection,query,where,getDocsFromServer,doc,getDocFromServer} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import {initializeFirebaseClient} from './firebase-client.js';
import {validateEntry,filterEntries,entryTraditions,relatedTrialLink} from './encyclopedia-data.js';
import {renderPortrait} from './portraits.js';
const {db}=initializeFirebaseClient({initializeApp,getAuth,initializeAuth,inMemoryPersistence,connectAuthEmulator,getFirestore,connectFirestoreEmulator});
const $=id=>document.getElementById(id);
let entries=[],related=new Map(),generation=0;
function text(tag,value,className){const node=document.createElement(tag);node.textContent=value;if(className)node.className=className;return node}
function trialNode(entry){const info=related.get(entry.relatedTrialId);if(!info)return null;const node=text(info.href?'a':'p',info.label,'encyclopedia-related');if(info.href)node.href=info.href;return node}
export function renderEncyclopedia(){
 const list=$('encyclopedia-list'),detail=$('encyclopedia-detail');list.replaceChildren();detail.replaceChildren();
 const selected=new URLSearchParams(location.search).get('character');$('encyclopedia-browser').hidden=!!selected;$('encyclopedia-back').hidden=!selected;detail.hidden=!selected;
 if(selected){
  const entry=entries.find(item=>item.id===selected);if(!entry){detail.append(text('p','That published character entry is unavailable. Return to the encyclopedia to choose another.'));return}
  const head=document.createElement('header');head.className='encyclopedia-detail-header';const portrait=document.createElement('div');portrait.className='trial-portrait encyclopedia-portrait';renderPortrait(portrait,entry.portraitUrl,`Portrait of ${entry.name}`);
  const title=document.createElement('div');title.append(text('p',entry.tradition,'encyclopedia-tradition'),text('h2',entry.name),text('p',entry.introduction));head.append(portrait,title);detail.append(head);
  for(const [key,label] of [['biography','Biography'],['actions','Key actions and events'],['perspectives','Different interpretations and perspectives'],['sources','Sources and further reading']]){const section=document.createElement('section');section.append(text('h3',label),text('p',entry[key],'encyclopedia-prose'));detail.append(section)}
  const trial=trialNode(entry);if(trial)detail.append(trial);return;
 }
 const matches=filterEntries(entries,$('character-search').value,$('tradition-filter').value);
 $('encyclopedia-results').textContent=matches.length?`${matches.length} published character(s).`:'No published characters match these filters.';
 for(const entry of matches){
  const card=document.createElement('article');card.className='encyclopedia-card';const portrait=document.createElement('div');portrait.className='trial-portrait encyclopedia-portrait';renderPortrait(portrait,entry.portraitUrl,`Portrait of ${entry.name}`);
  const link=text('a','Read complete entry for '+entry.name);link.href='who-is-who.html?character='+encodeURIComponent(entry.id);
  card.append(portrait,text('p',entry.tradition,'encyclopedia-tradition'),text('h2',entry.name),text('p',entry.introduction,'encyclopedia-prose'),link);const trial=trialNode(entry);if(trial)card.append(trial);list.append(card);
 }
}
export async function loadEncyclopedia(){
 const request=++generation;entries=[];related=new Map();$('encyclopedia-list').replaceChildren();$('encyclopedia-detail').replaceChildren();$('encyclopedia-status').textContent='Loading published characters…';$('encyclopedia-page').setAttribute('aria-busy','true');$('encyclopedia-refresh').disabled=true;
 try{
  const snapshot=await getDocsFromServer(query(collection(db,'encyclopedia'),where('status','==','published')));if(request!==generation)return;
  entries=snapshot.docs.flatMap(item=>{try{const entry=validateEntry(item.data());return entry.status==='published'?[{id:item.id,...entry}]:[]}catch{return []}});
  const previous=$('tradition-filter').value;$('tradition-filter').replaceChildren();const all=text('option','All traditions');all.value='';$('tradition-filter').append(all);for(const tradition of entryTraditions(entries)){const option=text('option',tradition);option.value=tradition;$('tradition-filter').append(option)}$('tradition-filter').value=entryTraditions(entries).includes(previous)?previous:'';
  renderEncyclopedia();$('encyclopedia-status').textContent=entries.length?'Teacher-published research entries. Sources and perspectives are supplied by the teacher.':'No character entries have been published yet. The classroom guide remains available in How It Works.';
  const ids=[...new Set(entries.map(item=>item.relatedTrialId).filter(Boolean))];
  if(ids.length){
   const active=await getDocFromServer(doc(db,'settings','currentTrial')).catch(()=>null);if(request!==generation)return;const activeId=active?(active.exists()?active.data().trialId:null):undefined;
   const pairs=await Promise.all(ids.map(async id=>{try{const trial=await getDocFromServer(doc(db,'trials',id));return [id,relatedTrialLink(id,trial.exists()?trial.data():null,activeId)]}catch{return [id,{label:'Related trial could not be loaded. Refresh to retry.',href:null}]}}));if(request!==generation)return;
   related=new Map(pairs);renderEncyclopedia();
  }
 }catch{if(request===generation)$('encyclopedia-status').textContent='Published entries could not be loaded. Check your connection and refresh to retry.'}
 finally{if(request===generation){$('encyclopedia-page').setAttribute('aria-busy','false');$('encyclopedia-refresh').disabled=false}}
}
$('character-search').addEventListener('input',renderEncyclopedia);$('tradition-filter').addEventListener('change',renderEncyclopedia);$('encyclopedia-refresh').addEventListener('click',loadEncyclopedia);loadEncyclopedia();
