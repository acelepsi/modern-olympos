export const ROSTER_ROLES={prosecutor:'Prosecution',defender:'Defense',juror:'Jury'};
export function validRosterMember(data){
 return !!data&&Object.keys(data).sort().join(',')==='alias,countryCode,role,schoolName'&&typeof data.alias==='string'&&!!data.alias.trim()&&data.alias.length<=100&&Object.hasOwn(ROSTER_ROLES,data.role)&&typeof data.schoolName==='string'&&data.schoolName.length<=160&&((data.countryCode===''&&data.schoolName==='')||(['TR','RO','GR'].includes(data.countryCode)&&!!data.schoolName.trim()));
}
export function groupRoster(docs){
 const groups={prosecutor:[],defender:[],juror:[]};for(const doc of docs){const data=doc.data();if(!validRosterMember(data))throw Error('Invalid public roster.');groups[data.role].push(data)}for(const members of Object.values(groups))members.sort((a,b)=>a.alias.localeCompare(b.alias));return groups;
}
async function member(tx,trial,uid,role,api){
 const profile=await tx.get(api.ref('students',uid));if(!profile.exists()||profile.data().accountType!=='student'||profile.data().active!==true)return null;
 const data=profile.data();let schoolName='',countryCode='';if(data.schoolId){const school=await tx.get(api.ref('schools',data.schoolId));if(!school.exists()||school.data().active!==true)return null;schoolName=school.data().name;countryCode=school.data().countryCode}
 const result={alias:data.displayName,role,schoolName,countryCode};return validRosterMember(result)?result:null;
}
export async function setRosterApproval(trial,uid,approve,api){
 const candidate=api.newId();return api.run(async tx=>{
  const permissionRef=api.ref('trials',trial,'rosterPermissions',uid),permission=await tx.get(permissionRef),id=permission.exists()?permission.data().publicId:candidate;
  const publicRef=api.ref('trials',trial,'publicRoster',id);
  if(api.skipResolved&&((permission.exists()&&permission.data().approved===true)===approve)){if(!api.current())throw Error('Context changed.');return 'already'}
  if(!approve){if(!api.current())throw Error('Context changed.');if(permission.exists()){tx.set(permissionRef,{publicId:id,approved:false});tx.delete(publicRef)}return false}
  const assignment=await tx.get(api.ref('trials',trial,'assignments',uid)),role=assignment.exists()?assignment.data().role:'unassigned';
  const data=Object.hasOwn(ROSTER_ROLES,role)?await member(tx,trial,uid,role,api):null;if(api.review&&data&&Object.keys(api.review).some(key=>api.review[key]!==data[key]))throw Error('Roster details changed; refresh before approval.');if(!data)throw Error('Only active assigned students with an active school (or no school) can be published.');if(!api.current())throw Error('Context changed.');
  tx.set(api.ref('trials',trial,'rosterSources',id),{uid});tx.set(permissionRef,{publicId:id,approved:true});tx.set(publicRef,data);return true;
 });
}
export async function saveRoleWithRoster(trial,uid,role,api){
 return api.run(async tx=>{
  const permissionRef=api.ref('trials',trial,'rosterPermissions',uid),permission=await tx.get(permissionRef);
  const approved=permission.exists()&&permission.data().approved===true;
  const data=approved&&Object.hasOwn(ROSTER_ROLES,role)?await member(tx,trial,uid,role,api):null;
  if(!api.current())throw Error('Context changed.');tx.set(api.ref('trials',trial,'assignments',uid),{role});
  if(approved){const id=permission.data().publicId,ref=api.ref('trials',trial,'publicRoster',id);if(data)tx.set(ref,data);else{tx.set(permissionRef,{publicId:id,approved:false});tx.delete(ref)}}return approved&&!!data;
 });
}
export async function revokeStudentRosters(uid,api){
 const trials=await api.trials();for(const trial of trials){if(!api.current())throw Error('Context changed.');await setRosterApproval(trial.id,uid,false,api)}
}
export function filterRoleStudents(students,schoolId,search){
 const needle=search.trim().toLocaleLowerCase();return students.filter(student=>(!schoolId||(schoolId==='__none__'?!student.schoolId:student.schoolId===schoolId))&&(student.displayName||'').toLocaleLowerCase().includes(needle)).sort((a,b)=>(a.displayName||'').localeCompare(b.displayName||''));
}
