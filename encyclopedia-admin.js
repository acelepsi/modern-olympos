import {ENTRY_LIMITS,validateEntry} from './encyclopedia-data.js';
// Receives the existing administrator client; never initializes a second Auth session.
export function setupEncyclopediaAdmin(api){
 const $=id=>document.getElementById(id),fields=[...Object.keys(ENTRY_LIMITS),'status'];
 let revision=0,selection=0,authorized=false,entries=[],selected=null,newId=null;
 const pending=new Set();
 const message=value=>{$('entry-feedback').textContent=value};
 const context=()=>({revision,selection,uid:api.auth.currentUser?.uid,id:selected||newId});
 const current=c=>authorized&&c.revision===revision&&c.uid===api.auth.currentUser?.uid;
 const same=c=>current(c)&&c.selection===selection&&c.id===(selected||newId);
 function controls(){const busy=pending.has(selected||newId);$('entry-editor').disabled=!authorized||busy;$('entry-delete').disabled=!authorized||!selected||busy;$('entry-refresh').disabled=!authorized}
 function options(){const value=selected||'';$('entry-select').replaceChildren();const first=document.createElement('option');first.value='';first.textContent='New entry';$('entry-select').append(first);for(const entry of [...entries].sort((a,b)=>a.name.localeCompare(b.name))){const option=document.createElement('option');option.value=entry.id;option.textContent=`${entry.name} · ${entry.tradition} (${entry.status})`;$('entry-select').append(option)}$('entry-select').value=value}
 function edit(id){selection++;selected=entries.some(entry=>entry.id===id)?id:null;newId=null;const entry=entries.find(item=>item.id===selected);for(const key of fields)$('entry-'+key).value=entry?.[key]||(key==='status'?'draft':'');$('entry-select').value=selected||'';message('');controls()}
 async function refresh(c=context()){
  $('entry-refresh').disabled=true;
  try{const result=await api.getDocsFromServer(api.collection(api.db,'encyclopedia'));if(!current(c))return;entries=result.docs.map(item=>({id:item.id,...item.data()}));options();if(c.selection===selection)edit(selected);message('Entries loaded. Drafts are private; published entries are public.')}
  catch(error){if(current(c))message('Cannot load entries: '+(error.code||error.message))}
  finally{if(current(c))controls()}
 }
 api.onAuthStateChanged(api.auth,async user=>{
  const request=++revision;authorized=false;entries=[];selected=null;newId=null;selection++;$('entry-select').replaceChildren();for(const key of fields)$('entry-'+key).value=key==='status'?'draft':'';controls();message(user?'Checking encyclopedia access…':'');
  if(!user)return;
  try{
   const profile=await api.getDocFromServer(api.doc(api.db,'students',user.uid));if(request!==revision||api.auth.currentUser?.uid!==user.uid)return;
   if(!profile.exists()||profile.data().active!==true||profile.data().accountType!=='teacher'){message('Encyclopedia editing requires the designated administrator.');return}
   // Unfiltered list is administrator-only in rules, even for another teacher account.
   const result=await api.getDocsFromServer(api.collection(api.db,'encyclopedia'));if(request!==revision||api.auth.currentUser?.uid!==user.uid)return;
   authorized=true;entries=result.docs.map(item=>({id:item.id,...item.data()}));options();edit(null);message('Encyclopedia access verified. Create an entry or select one to edit.');
  }catch(error){if(request===revision)message('Encyclopedia access unavailable: '+(error.code||error.message))}
 });
 $('entry-select').addEventListener('change',()=>edit($('entry-select').value));$('entry-new').addEventListener('click',()=>{if(authorized)edit(null)});$('entry-refresh').addEventListener('click',()=>{if(authorized)return refresh()});
 $('entry-form').addEventListener('submit',async event=>{
  event.preventDefault();if(!authorized)return;
  let data;try{data=validateEntry(Object.fromEntries(fields.map(key=>[key,$('entry-'+key).value])))}catch(error){message(error.message);return}
  if(!selected&&!newId)newId=api.doc(api.collection(api.db,'encyclopedia')).id;
  const c=context();if(pending.has(c.id))return;pending.add(c.id);controls();message('Saving entry…');
  try{
   if(data.relatedTrialId){const trial=await api.getDocFromServer(api.doc(api.db,'trials',data.relatedTrialId));if(!same(c))return;if(!trial.exists())throw Error('Related trial ID does not exist.')}
   if(!same(c))return;await api.setDoc(api.doc(api.db,'encyclopedia',c.id),data);
   if(!current(c))return;entries=entries.filter(entry=>entry.id!==c.id).concat({id:c.id,...data});
   if(same(c)){selected=c.id;newId=null;options();message(data.status==='published'?'Entry published.':'Private draft saved.')}else options();
  }catch(error){if(same(c))message('Save not confirmed: '+(error.code||error.message)+'. Reload entries to verify before retrying.')}
  finally{pending.delete(c.id);if(current(c))controls()}
 });
 $('entry-delete').addEventListener('click',async()=>{
  if(!authorized||!selected||pending.has(selected))return;const c=context();
  if(!confirm('Permanently delete this encyclopedia entry? This cannot be undone. Cancel and set Draft instead to unpublish without deleting.')||!same(c))return;
  pending.add(c.id);controls();message('Deleting entry…');
  try{await api.deleteDoc(api.doc(api.db,'encyclopedia',c.id));if(!current(c))return;entries=entries.filter(entry=>entry.id!==c.id);const wasSelected=same(c);if(wasSelected)edit(null);options();if(wasSelected)message('Entry deleted. Existing trials are unchanged.')}
  catch(error){if(same(c))message('Delete not confirmed: '+(error.code||error.message)+'. Reload entries to verify.')}
  finally{pending.delete(c.id);if(current(c))controls()}
 });
 controls();
}
