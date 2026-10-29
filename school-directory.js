import {validateSchool} from './school-data.js';
// Only school metadata is projected. Existing student attribution consent is separate.
export function publicSchoolData(school){
 const data=validateSchool(school);
 if(!data.active)throw Error('Inactive schools cannot be published.');
 return {name:data.name,countryCode:data.countryCode};
}
export async function saveDirectorySchool(id,input,api){
 const data=validateSchool(input);
 return api.run(async tx=>{
  const copy=await tx.get(api.publicRef(id));
  if(!api.current())throw Error('Administrator session changed.');
  tx.set(api.schoolRef(id),data);
  // Presence of a copy records the explicit prior publication decision.
  if(copy.exists()){
   if(data.active)tx.set(api.publicRef(id),publicSchoolData(data));
   else tx.delete(api.publicRef(id));
  }
  return copy.exists()&&data.active;
 });
}
export async function publishDirectorySchool(id,expected,publish,api){
 return api.run(async tx=>{
  const source=await tx.get(api.schoolRef(id));
  if(!api.current())throw Error('Administrator session changed.');
  if(!publish){tx.delete(api.publicRef(id));return false}
  if(!source.exists())throw Error('School no longer exists. Refresh the directory.');
  const data=source.data();
  if(data.name!==expected.name||data.countryCode!==expected.countryCode||data.active!==expected.active)throw Error('School changed. Refresh and review before publishing.');
  tx.set(api.publicRef(id),publicSchoolData(data));return true;
 });
}
