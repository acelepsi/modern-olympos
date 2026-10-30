import {createStudentBatch} from './student-batch.js';
import {COUNTRIES} from './school-data.js';
import {renderSchoolLoginSheet} from './school-login-sheet.js';
export function setupStudentBatchAdmin(api){
 const $=id=>document.getElementById(id);let revision=0,authorized=false,schools=[],batch=null,operation=false,printed=false;
 const message=text=>{$('batch-feedback').textContent=text};
 const current=(r=revision,uid=api.auth.currentUser?.uid)=>authorized&&r===revision&&uid===api.auth.currentUser?.uid;
 function clearPrint(){document.body.classList.remove('login-sheet-print');$('school-login-sheet').replaceChildren();printed=false}
 function controls(){const busy=operation||!!batch?.busy,hasRows=!!batch?.rows.length,editable=!!batch?.rows.some(row=>['ready','failed'].includes(row.state));
  $('batch-school').disabled=!authorized||busy||hasRows;$('batch-refresh').disabled=!authorized||busy||hasRows;
  $('batch-add').disabled=!authorized||busy||!$('batch-school').value;$('batch-generate').disabled=!authorized||busy||!editable;
  $('batch-create').disabled=!authorized||busy||!editable;$('batch-print').disabled=!authorized||busy||!batch?.credentials().length;
  $('batch-clear').disabled=!authorized||busy||!hasRows;$('batch-saved').disabled=!authorized||busy||!printed;
  $('batch-count').disabled=!authorized||busy;
 }
 function render(){
  const list=$('batch-rows');list.replaceChildren();for(const [index,row] of (batch?.rows||[]).entries()){
   const tr=document.createElement('tr');for(const [field,label] of [['name','Student alias'],['code','Login code']]){
    const td=document.createElement('td'),input=document.createElement('input');input.value=row[field];input.maxLength=field==='name'?100:24;input.setAttribute('aria-label',label+' '+(index+1));input.autocomplete='off';input.disabled=operation||batch.busy||!['ready','failed'].includes(row.state);
    input.addEventListener('input',()=>{batch.edit(index,field,input.value)});td.append(input);tr.append(td);
   }
   const password=document.createElement('td');password.textContent=row.generated?'Generated (temporary memory only)':'Not generated';const status=document.createElement('td');status.textContent=row.message;status.setAttribute('role','status');tr.append(password,status);list.append(tr);
  }controls();
 }
 // Editing must not rebuild the focused input on every keypress.
 function changed(){if(batch?.busy)render();else controls()}
 function clear(){batch?.clear();batch=null;clearPrint();render()}
 async function reload(){const r=revision,uid=api.auth.currentUser?.uid;if(!current(r,uid)||operation||batch?.rows.length)return;operation=true;controls();try{
  const result=await api.getDocsFromServer(api.collection(api.db,'schools'));if(!current(r,uid))return;
  schools=result.docs.map(item=>({id:item.id,...item.data()})).filter(school=>school.active===true&&Object.hasOwn(COUNTRIES,school.countryCode));const select=$('batch-school'),before=select.value;select.replaceChildren();const first=document.createElement('option');first.value='';first.textContent='Select an active partner school';select.append(first);for(const school of schools){const option=document.createElement('option');option.value=school.id;option.textContent=school.name+' · '+COUNTRIES[school.countryCode].name;select.append(option)}select.value=schools.some(s=>s.id===before)?before:'';message('Select a private partner school. Public school publication and student attribution permissions are separate.');
 }catch{if(current(r,uid))message('Cannot load active private schools. Refresh and verify administrator access.')}finally{if(r===revision){operation=false;if(current(r,uid))controls()}}}
 api.onAuthStateChanged(api.auth,async user=>{
  const r=++revision;authorized=false;operation=false;clear();schools=[];$('batch-school').replaceChildren();message('');controls();if(!user)return;
  try{const profile=await api.getDocFromServer(api.doc(api.db,'students',user.uid));if(r!==revision||api.auth.currentUser?.uid!==user.uid)return;if(!profile.exists()||profile.data().accountType!=='teacher'||profile.data().active!==true)return;
   await api.getDocsFromServer(api.collection(api.db,'schools'));if(r!==revision||api.auth.currentUser?.uid!==user.uid)return;authorized=true;await reload();
  }catch{if(r===revision)message('School account management requires the designated administrator.')}
 });
 $('batch-refresh').addEventListener('click',reload);
 $('batch-school').addEventListener('change',()=>{if(batch?.rows.length){$('batch-school').value=batch.school.id;message('Clear the current credential batch before changing schools.');return}clear();controls()});
 $('batch-add').addEventListener('click',()=>{if(!current()||operation||batch?.busy)return;try{
  if(!batch){const school=schools.find(s=>s.id===$('batch-school').value);if(!school)throw Error('Choose an active school.');const r=revision,uid=api.auth.currentUser.uid;
   batch=createStudentBatch(school,{current:()=>current(r,uid),changed,school:async id=>{const result=await api.getDocFromServer(api.doc(api.db,'schools',id));return result.exists()?result.data():null},provision:api.provision,created:api.created});
  }clearPrint();batch.add(Number($('batch-count').value));render();message('Enter aliases and review the generated login codes. Then generate passwords. Maximum 30 rows per batch.');
 }catch(error){message(error.message)}});
 $('batch-generate').addEventListener('click',()=>{if(!current()||!batch||operation||batch.busy)return;try{clearPrint();batch.generate();render();message('Secure passwords generated in temporary memory. They cannot be retrieved after clearing or leaving this page.')}catch{message('Secure password generation unavailable. Use a supported HTTPS browser.')}});
 $('batch-create').addEventListener('click',async()=>{if(!current()||!batch||operation||batch.busy)return;const r=revision,uid=api.auth.currentUser.uid,before=batch;clearPrint();operation=true;controls();message('Creating accounts sequentially. Keep this page open.');try{await before.create();if(current(r,uid)&&batch===before)message('Batch processed. Check each result. Only confirmed new accounts appear in the school login sheet; existing and unconfirmed accounts are excluded.')}catch{if(current(r,uid)&&batch===before)message('Batch stopped. Check aliases, unique codes and generated passwords, and verify the school is still active. Successful accounts are retained; do not recreate unconfirmed accounts.')}finally{if(r===revision){operation=false;if(current(r,uid)){render();controls()}}}});
 $('batch-print').addEventListener('click',()=>{if(!current()||operation||!batch||batch.busy||!batch.credentials().length)return;try{clearPrint();renderSchoolLoginSheet($('school-login-sheet'),batch.school,batch.credentials(),new URL('court.html',location.href).href);document.body.classList.add('login-sheet-print');printed=true;window.print();message('Choose Save as PDF or print in the browser dialog. This page cannot detect a completed save. Confirm below only after saving/distributing credentials.')}catch{clearPrint();message('Could not open the print dialog. Credentials remain in memory; retry before leaving.')}controls()});
 $('batch-saved').addEventListener('click',()=>{if(!current()||!batch||!printed)return;batch.acknowledge();message('Credentials marked saved/distributed. Keep the PDF private. Clear the temporary batch when finished.')});
 $('batch-clear').addEventListener('click',()=>{if(!current()||operation||batch?.busy)return;if(batch?.rows.length&&!confirm('Discard this temporary credential batch? Initial passwords cannot be retrieved later. Save or distribute successful credentials first.'))return;clear();message('Temporary credentials cleared. Accounts and school assignments are unchanged.')});
 window.addEventListener('beforeunload',event=>{if(batch?.needsWarning||operation){event.preventDefault();event.returnValue=''}});
 window.addEventListener('afterprint',()=>{document.body.classList.remove('login-sheet-print');$('school-login-sheet').replaceChildren()});
 controls();return {reload};
}
