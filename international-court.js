import {COUNTRIES} from './school-data.js';
// This public controller receives only the two public queries; never private profiles.
export function summarizePublicSchools(docs){
 const groups=Object.fromEntries(Object.keys(COUNTRIES).map(code=>[code,[]]));
 for(const item of docs){
  const data=item.data();
  if(!data||Object.keys(data).length!==2||typeof data.name!=='string'||!data.name.trim()||data.name.length>160||!Object.hasOwn(groups,data.countryCode))throw Error('Invalid public directory.');
  groups[data.countryCode].push(data.name);
 }
 for(const names of Object.values(groups))names.sort((a,b)=>a.localeCompare(b));
 return {groups,schools:docs.length,countries:Object.values(groups).filter(names=>names.length).length};
}
export function setupInternationalCourt(api){
 const $=id=>document.getElementById(id);let generation=0;
 const node=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;return el};
 function renderSchools(snapshot){
  const summary=summarizePublicSchools(snapshot.docs);
  $('international-countries').textContent=summary.countries;$('international-schools').textContent=summary.schools;
  const cards=$('international-cards');cards.replaceChildren();
  for(const [code,names] of Object.entries(summary.groups)){
   if(!names.length)continue;
   const country=COUNTRIES[code],card=node('article','');card.className='international-country';
   const heading=node('h3',''),flag=document.createElement('img');flag.src=country.flag;flag.alt='Flag of '+country.name;flag.width=48;flag.height=32;
   heading.append(flag,node('span',country.name));const list=node('ul','');for(const name of names)list.append(node('li',name));card.append(heading,list);cards.append(card);
  }
  $('international-directory-status').textContent=summary.schools?'Countries and schools reflect active partners approved for this public directory.':'Partner school information will appear here after administrator approval.';
 }
 async function load(){
  const request=++generation,button=$('international-refresh');button.disabled=true;
  for(const id of ['international-countries','international-schools','international-trials'])$(id).textContent='—';
  $('international-cards').replaceChildren();$('international-directory-status').textContent='Loading the approved partner directory…';$('international-trial-status').textContent='Loading public trial total…';
  await Promise.all([
   (async()=>{try{const result=await api.schools();if(request===generation)renderSchools(result)}catch{if(request===generation){$('international-cards').replaceChildren();$('international-directory-status').textContent='Partner school information is temporarily unavailable.'}}})(),
   (async()=>{try{const result=await api.trials();if(request===generation){$('international-trials').textContent=result.docs.length;$('international-trial-status').textContent='Trials counts all publicly readable cases, including preparation, voting and closed cases.'}}catch{if(request===generation)$('international-trial-status').textContent='Public trial total is temporarily unavailable.'}})()
  ]);
  if(request===generation)button.disabled=false;
 }
 $('international-refresh').addEventListener('click',load);load();return {load};
}
