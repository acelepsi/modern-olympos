import {portraitUrl} from './portraits.js';
export const ENTRY_LIMITS=Object.freeze({name:100,tradition:80,introduction:500,biography:8000,actions:8000,perspectives:8000,portraitUrl:2000,sources:4000,relatedTrialId:80});
export function validateEntry(input){
 const entry={};
 for(const [key,max] of Object.entries(ENTRY_LIMITS)){
  if(typeof input[key]!=='string'||input[key].length>max)throw Error(`${key} must be text of at most ${max} characters.`);
  entry[key]=input[key].trim();
 }
 if(!entry.name||!entry.tradition||!entry.introduction)throw Error('Name, tradition and short introduction are required.');
 if(!['draft','published'].includes(input.status))throw Error('Choose Draft or Published.');
 entry.status=input.status;entry.portraitUrl=portraitUrl(entry.portraitUrl);
 if(entry.relatedTrialId&&!/^[a-z0-9-]{1,80}$/.test(entry.relatedTrialId))throw Error('Related trial ID must use lowercase letters, numbers and hyphens (maximum 80).');
 if(entry.status==='published'&&['biography','actions','perspectives','sources'].some(key=>!entry[key]))throw Error('Before publication, provide biography, key actions, perspectives and sources.');
 return entry;
}
export function normalizeSearch(value){return String(value).normalize('NFKD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase().trim()}
export function filterEntries(entries,name='',tradition=''){
 const needle=normalizeSearch(name),group=normalizeSearch(tradition);
 return entries.filter(entry=>normalizeSearch(entry.name).includes(needle)&&(!group||normalizeSearch(entry.tradition)===group)).sort((a,b)=>a.name.localeCompare(b.name));
}
export function entryTraditions(entries){const groups=new Map();for(const entry of entries)if(!groups.has(normalizeSearch(entry.tradition)))groups.set(normalizeSearch(entry.tradition),entry.tradition);return [...groups.values()].sort((a,b)=>a.localeCompare(b))}
export function relatedTrialLink(id,trial,activeId){
 if(!id)return null;
 if(!trial)return {label:'Related trial unavailable',href:null};
 if(trial.status==='closed')return {label:'Completed trial: '+(trial.title||id),href:'archive.html?trial='+encodeURIComponent(id)};
 if(activeId===undefined)return {label:'Related trial: '+(trial.title||id)+' (active courtroom not verified)',href:null};
 if(id===activeId&&['trial','verdict'].includes(trial.status))return {label:'Active trial: '+(trial.title||id),href:'court.html'};
 return {label:'Related case (not the active courtroom): '+(trial.title||id),href:null};
}
