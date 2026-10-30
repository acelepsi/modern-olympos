import {validateStudentInput} from './student-accounts.js';
import {validateSchool} from './school-data.js';
const UPPER='ABCDEFGHJKLMNPQRSTUVWXYZ',LOWER='abcdefghijkmnopqrstuvwxyz',DIGITS='23456789',SYMBOLS='!-_=+',ALPHABET=UPPER+LOWER+DIGITS+SYMBOLS;
function randomIndex(length,crypto){
 if(!crypto?.getRandomValues)throw Error('Secure random generation is unavailable. Use a supported HTTPS browser.');
 const limit=256-(256%length),byte=new Uint8Array(1);do{crypto.getRandomValues(byte)}while(byte[0]>=limit);return byte[0]%length;
}
export function generatePassword(crypto=globalThis.crypto){
 const chars=[UPPER,LOWER,DIGITS,SYMBOLS].map(set=>set[randomIndex(set.length,crypto)]);
 while(chars.length<16)chars.push(ALPHABET[randomIndex(ALPHABET.length,crypto)]);
 for(let i=chars.length-1;i>0;i--){const j=randomIndex(i+1,crypto);[chars[i],chars[j]]=[chars[j],chars[i]]}return chars.join('');
}
export function generateLoginCode(crypto=globalThis.crypto){
 if(!crypto?.getRandomValues)throw Error('Secure random generation is unavailable.');
 const bytes=crypto.getRandomValues(new Uint8Array(8));return 'oly-'+Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
}
function failure(error){
 const code=error?.code;
 if(code==='auth/email-already-in-use')return {state:'exists',message:'Code already exists. Existing account unchanged; excluded from this sheet.'};
 if(code==='auth/weak-password')return {state:'failed',message:'Password rejected. Regenerate before retrying.'};
 if(code==='permission-denied')return {state:'review',message:'Creation not confirmed. Ask the owner to check this code before retrying.'};
 // Never repeat SDK messages: they may contain account identifiers or submitted input.
 return {state:'review',message:'Creation not confirmed. Check this code with the owner; do not recreate blindly.'};
}
export function createStudentBatch(school,api){
 const metadata=validateSchool(school);if(!metadata.active||!school.id)throw Error('Choose an active partner school.');
 let rows=[],busy=false,generation=0,acknowledged=false;
 const current=g=>g===generation&&api.current();
 const notify=()=>api.changed?.();
 const batch={school:{...metadata,id:school.id},
  get busy(){return busy},
  get rows(){return rows.map(({name,code,state,message,password})=>({name,code,state,message,generated:!!password}))},
  get needsWarning(){return rows.some(row=>row.state==='review')||(!acknowledged&&rows.some(row=>row.state==='success'))},
  add(count,crypto){if(busy||!Number.isInteger(count)||count<1||rows.length+count>30)throw Error('A batch can contain 1–30 students.');for(let i=0;i<count;i++)rows.push({name:'',code:generateLoginCode(crypto),password:'',state:'ready',message:'Enter an alias, then generate passwords.'});acknowledged=false;notify()},
  edit(index,field,value){const row=rows[index];if(busy||!row||!['ready','failed'].includes(row.state)||!['name','code'].includes(field))return;row[field]=value;row.state='ready';row.message='Ready for validation.';notify()},
  generate(crypto){if(busy)return;for(const row of rows)if(['ready','failed'].includes(row.state)){row.password=generatePassword(crypto);row.state='ready';row.message='Password generated securely.'}notify()},
  credentials(){return rows.filter(row=>row.state==='success').map(({name,code,password})=>({name,code,password}))},
  acknowledge(){if(!busy){acknowledged=true;notify()}},
  clear(){generation++;for(const row of rows){row.password='';row.name='';row.code=''}rows=[];acknowledged=false;notify()},
  async create(){
   if(busy||!api.current())return;
   const candidates=rows.filter(row=>['ready','failed'].includes(row.state));if(!candidates.length)throw Error('No unattempted students. Existing and unconfirmed accounts are never recreated.');
   const codes=rows.map(row=>row.code.trim().toLowerCase());if(new Set(codes).size!==codes.length)throw Error('Duplicate login codes in this batch. Edit them before creating any accounts.');
   for(const row of candidates)validateStudentInput({name:row.name,code:row.code,password:row.password,schoolId:school.id});
   busy=true;const g=generation;notify();
   try{
    for(const row of candidates){
     if(!current(g))return;
     const latest=await api.school(school.id);if(!current(g))return;
     if(!latest||latest.active!==true||latest.name!==metadata.name||latest.countryCode!==metadata.countryCode)throw Error('School changed or became inactive. Clear this batch and reselect the school before creating more accounts.');
     row.state='pending';row.message='Creating access…';notify();
     const input={name:row.name.trim(),code:row.code.trim().toLowerCase(),password:row.password,schoolId:school.id};
     try{
      const student=await api.provision(input,()=>current(g));if(!current(g))return;
      row.name=input.name;row.code=input.code;row.state='success';row.message='Created. Included in this school’s current login sheet.';acknowledged=false;try{api.created?.(student)}catch{row.message='Created. Save credentials before reloading the account list.'}
     }catch(error){if(!current(g))return;const result=failure(error);row.state=result.state;row.message=result.message}
     finally{input.password=''}
     if(current(g))notify();
    }
   }finally{busy=false;if(current(g))notify()}
  }
 };return batch;
}
