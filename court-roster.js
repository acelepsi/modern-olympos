import {groupRoster,ROSTER_ROLES} from './roster-data.js';
import {COUNTRIES} from './school-data.js';
export function setupCourtRoster(api){
 const $=id=>document.getElementById(id),dialog=$('court-roster'),button=$('view-court-roster');let trial=null,generation=0,stop=null,opener=null;
 const el=(tag,text)=>{const node=document.createElement(tag);node.textContent=text;return node};
 function clear(text){$('roster-groups').replaceChildren();$('roster-feedback').textContent=text;$('roster-feedback').setAttribute('aria-busy','false')}
 function close(){generation++;stop?.();stop=null;clear('Open the roster to load approved members.');if(dialog.open)dialog.close();opener?.focus()}
 function load(){generation++;stop?.();stop=null;clear(trial?'Loading approved court roster…':'No active trial.');if(!trial||!dialog.open)return;
  const request=generation,id=trial;$('roster-feedback').setAttribute('aria-busy','true');
  stop=api.subscribe(id,snapshot=>{
   if(request!==generation||id!==trial||!dialog.open)return;
   if(snapshot.metadata?.fromCache!==false||snapshot.metadata?.hasPendingWrites!==false){clear('Waiting for a confirmed public roster…');return}
   try{const groups=groupRoster(snapshot.docs);$('roster-groups').replaceChildren();let total=0;
    for(const [role,title] of Object.entries(ROSTER_ROLES)){const section=el('section',''),heading=el('h3',`${title} (${groups[role].length})`),list=el('ul','');for(const member of groups[role]){total++;const item=el('li',''),alias=el('strong',member.alias),school=el('span',member.schoolName||'School not provided');if(member.countryCode){const flag=document.createElement('img');flag.src=COUNTRIES[member.countryCode].flag;flag.alt='Flag of '+COUNTRIES[member.countryCode].name;flag.width=24;flag.height=16;school.prepend(flag)}item.append(alias,school);list.append(item)}if(!groups[role].length)list.append(el('li','No approved members.'));section.append(heading,list);$('roster-groups').append(section)}
    $('roster-feedback').textContent=total?'Only students with separate approval for this trial are listed. Counts reflect this public roster, not full trial participation.':'No students have been approved for this trial’s public roster.';$('roster-feedback').setAttribute('aria-busy','false');
   }catch{clear('Unable to display the public roster. Retry or ask your teacher.')}
  },()=>{if(request===generation&&id===trial)clear('Unable to load the public roster. Retry to reconnect.')});
 }
 button.addEventListener('click',()=>{opener=document.activeElement;dialog.showModal();load();$('close-court-roster').focus()});
 $('close-court-roster').addEventListener('click',close);$('roster-retry').addEventListener('click',load);
 dialog.addEventListener('cancel',event=>{event.preventDefault();close()});dialog.addEventListener('close',()=>{if(dialog.open)return;generation++;stop?.();stop=null;clear('Open the roster to load approved members.');opener?.focus()});
 dialog.addEventListener('keydown',event=>{if(event.key!=='Tab')return;const buttons=[...dialog.querySelectorAll('button')].filter(node=>!node.disabled),first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}});
 return {select(id){const next=id||null;if(next===trial)return;trial=next;load()}};
}
