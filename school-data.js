export const COUNTRIES=Object.freeze({TR:{name:'Türkiye',flag:'flag-tr.svg'},RO:{name:'Romania',flag:'flag-ro.svg'},GR:{name:'Greece',flag:'flag-gr.svg'}});
export function validateSchool(input){
 if(typeof input.name!=='string'||!input.name.trim()||input.name.length>160)throw Error('School name must be 1–160 characters.');
 if(!Object.hasOwn(COUNTRIES,input.countryCode)||typeof input.active!=='boolean')throw Error('Choose Türkiye, Romania or Greece and an active status.');
 return {name:input.name.trim(),countryCode:input.countryCode,active:input.active};
}
export function validSchoolId(id){return typeof id==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(id)}
export async function publishArgumentSchool(trialId,submission,api){
 if(submission.status!=='published'||!['prosecution','defense'].includes(submission.section))return false;
 const profile=await api.read(['students',submission.authorUid]);if(!api.current())throw Error('Administrator context changed.');
 if(!profile.exists()||profile.data().accountType!=='student'||profile.data().publicSchool!==true||!profile.data().schoolId)return false;
 const school=await api.read(['schools',profile.data().schoolId]);if(!api.current())throw Error('Administrator context changed.');
 if(!school.exists()||school.data().active!==true)return false;
 const data=validateSchool(school.data());await api.copy(trialId,submission.id,{schoolName:data.name,countryCode:data.countryCode});return true;
}
export async function saveSchoolAffiliation(uid,schoolId,publish,api){
 if(schoolId&&!validSchoolId(schoolId))throw Error('Choose a valid school.');
 if(publish&&!schoolId)throw Error('Choose a school before enabling public display.');
 const profile=await api.read(['students',uid]);if(!api.current())throw Error('Administrator context changed.');
 if(!profile.exists()||profile.data().accountType!=='student')throw Error('Choose an existing student account.');
 let school;
 if(schoolId){const snapshot=await api.read(['schools',schoolId]);if(!api.current())throw Error('Administrator context changed.');if(!snapshot.exists())throw Error('School no longer exists.');school=validateSchool(snapshot.data());if(!school.active&&(publish||profile.data().schoolId!==schoolId))throw Error('Inactive schools cannot receive new assignments or public display.');}
 const token=api.newToken();
 // Revocation is the first acknowledged write. Later failures leave visibility off.
 await api.assign(uid,{schoolId,publicSchool:false,schoolConsentVersion:token},publish?{schoolId:profile.data().schoolId||'',publicSchool:profile.data().publicSchool===true,schoolConsentVersion:profile.data().schoolConsentVersion||''}:null);
 if(!api.current())throw Error('Context changed; affiliation remains private.');
 const trials=await api.trials();let count=0;
 for(const trial of trials){
  if(!api.current())throw Error('Context changed; affiliation remains private.');
  const posts=await api.submissions(trial.id,uid);
  for(const post of posts){
   if(post.status!=='published'||!['prosecution','defense'].includes(post.section))continue;
   if(!api.current())throw Error('Context changed; affiliation remains private.');
   await api.removeCopy(trial.id,post.id);
   if(!api.current())throw Error('Context changed; affiliation remains private.');
   if(publish){await api.copy(trial.id,post.id,{schoolName:school.name,countryCode:school.countryCode});count++;}
  }
 }
 if(!publish)return {published:false,count:0};
 if(!api.current())throw Error('Context changed; affiliation remains private.');
 // The real transaction checks a private operation token so an old publish cannot undo withdrawal.
 await api.enable(uid,schoolId,token,school);
 return {published:true,count};
}
export async function enableSchoolPermission(uid,schoolId,token,school,api){
 return api.run(async transaction=>{
  const profileRef=api.profileRef(uid),schoolRef=api.schoolRef(schoolId),profile=await transaction.get(profileRef),latest=await transaction.get(schoolRef);
  if(!api.current()||!profile.exists()||profile.data().schoolId!==schoolId||profile.data().schoolConsentVersion!==token||profile.data().publicSchool!==false||!latest.exists()||latest.data().active!==true||latest.data().name!==school.name||latest.data().countryCode!==school.countryCode)throw Error('Affiliation changed; public display was not enabled.');
  transaction.update(profileRef,{publicSchool:true});
 });
}

export async function reserveSchoolPermission(uid,data,expected,api){
 return api.run(async transaction=>{
  const ref=api.profileRef(uid),profile=await transaction.get(ref);
  if(!api.current()||!profile.exists()||profile.data().accountType!=='student')throw Error('Student or administrator context changed.');
  if(expected&&((profile.data().schoolConsentVersion||'')!==expected.schoolConsentVersion||(profile.data().schoolId||'')!==expected.schoolId||(profile.data().publicSchool===true)!==expected.publicSchool))throw Error('Affiliation changed before publication; reload before enabling public display.');
  transaction.update(ref,data);
 });
}

export async function purgeSchoolCopies(uid,api){
 const trials=await api.trials();
 for(const trial of trials){
  if(!api.current())throw Error('Administrator context changed.');
  for(const post of await api.submissions(trial.id,uid)){
   if(post.status==='published'&&['prosecution','defense'].includes(post.section)){
    if(!api.current())throw Error('Administrator context changed.');
    await api.removeCopy(trial.id,post.id);
   }
  }
 }
}
