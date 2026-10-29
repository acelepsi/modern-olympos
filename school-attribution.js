import {COUNTRIES} from './school-data.js';
// Only public argument cards call this renderer. It never reads profiles, ballots or reasoning.
export function createSchoolAttribution(api){
 const stops=new Set();let generation=0;
 return {
  clear(){generation++;for(const item of stops){item.stop();item.clear()}stops.clear()},
  render(container,trialId,submissionId){
   if(!trialId||!submissionId)return;
   const current=generation,host=document.createElement('span');host.className='school-attribution';host.hidden=true;container.append(host);
   const clear=()=>{host.replaceChildren();host.hidden=true};
   const stop=api.onSnapshot(api.doc(api.db,'trials',trialId,'attributions',submissionId),{includeMetadataChanges:true},snapshot=>{
    if(current!==generation)return;clear();if(snapshot.metadata?.fromCache!==false||snapshot.metadata?.hasPendingWrites!==false||!snapshot.exists())return;
    const data=snapshot.data();if(!data||Object.keys(data).length!==2||typeof data.schoolName!=='string'||!data.schoolName.trim()||data.schoolName.length>160||!Object.hasOwn(COUNTRIES,data.countryCode))return;
    const country=COUNTRIES[data.countryCode],flag=document.createElement('img'),name=document.createElement('span');flag.className='country-flag';flag.src=country.flag;flag.alt='Country: '+country.name;flag.width=21;flag.height=14;name.textContent=data.schoolName;host.append(flag,name);host.hidden=false;
   },()=>{if(current===generation)clear()});stops.add({stop,clear});
  }
 };
}
