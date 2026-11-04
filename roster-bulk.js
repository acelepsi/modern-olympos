import {ROSTER_ROLES,validRosterMember} from './roster-data.js';
export function planRosterBulk(rows,approve){
 const plan={eligible:[],already:0,skipped:0,counts:{prosecutor:0,defender:0,juror:0}};
 for(const row of rows){
  if(row.unknown||row.pending){plan.skipped++;continue}
  if(row.approved===approve){plan.already++;continue}
  const student=row.student,school=row.school;
  const review={alias:student.displayName,role:row.savedRole,schoolName:student.schoolId?school?.name:'',countryCode:student.schoolId?school?.countryCode:''};
  if(approve&&(student.accountType!=='student'||student.active!==true||row.role!==row.savedRole||!Object.hasOwn(ROSTER_ROLES,row.savedRole)||(student.schoolId&&(!school||school.active!==true))||!validRosterMember(review))){plan.skipped++;continue}
  plan.eligible.push({...row,review});if(Object.hasOwn(plan.counts,row.savedRole))plan.counts[row.savedRole]++;
 }
 return plan;
}
export async function runRosterBulk(plan,approve,api){
 const result={changed:0,already:plan.already,skipped:plan.skipped,failed:0,remaining:plan.eligible.length,stopped:false};
 for(const row of plan.eligible){
  if(!api.current()){result.stopped=true;break}
  try{const outcome=await api.write(row,approve);if(outcome==='already')result.already++;else result.changed++;if(api.current())api.saved(row,approve)}
  catch{result.failed++;if(api.current())api.failed(row)}
  result.remaining--;
 }
 if(!api.current())result.stopped=true;return result;
}
export function createRosterBulkConfirmation(){
 const $=id=>document.getElementById(id),dialog=$('roster-bulk-dialog');let pending=null,opener=null;
 function finish(answer){if(!pending)return;const resolve=pending;pending=null;dialog.close();$('roster-bulk-permission').checked=false;$('roster-bulk-confirm').disabled=true;opener?.focus();resolve(answer)}
 $('roster-bulk-cancel').addEventListener('click',()=>finish(false));dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false)});
 $('roster-bulk-permission').addEventListener('change',()=>{$('roster-bulk-confirm').disabled=!$('roster-bulk-permission-row').hidden&&!$('roster-bulk-permission').checked});
 $('roster-bulk-confirm').addEventListener('click',()=>{if(!$('roster-bulk-confirm').disabled)finish(true)});
 dialog.addEventListener('keydown',event=>{if(event.key!=='Tab')return;const controls=[...dialog.querySelectorAll('button,input')].filter(node=>!node.disabled&&node.getClientRects().length),first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}});
 return {cancel:()=>finish(false),ask({trial,plan,approve}){finish(false);opener=document.activeElement;$('roster-bulk-title').textContent=approve?'Approve Visible Students':'Withdraw Visible Approvals';$('roster-bulk-summary').textContent=`Trial: ${trial}. Eligible students: ${plan.eligible.length}. Prosecution: ${plan.counts.prosecutor}; Defense: ${plan.counts.defender}; Jury: ${plan.counts.juror}.`;$('roster-bulk-explanation').textContent=approve?'Aliases, saved roles, school names and countries will become publicly visible for this trial. Jury membership can allow inference in small groups. This confirmation is not student consent. If permission is missing for anyone in this eligible set, cancel and use individual approval instead.':'Remove the visible approved students from this trial’s public roster. Assignments, accounts, arguments, ballots and totals are unchanged. Already-read information cannot be recalled.';$('roster-bulk-permission-row').hidden=!approve;$('roster-bulk-permission').checked=false;$('roster-bulk-confirm').disabled=approve;return new Promise(resolve=>{pending=resolve;dialog.showModal();$('roster-bulk-cancel').focus()})}};
}
