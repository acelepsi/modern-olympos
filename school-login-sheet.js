import {COUNTRIES} from './school-data.js';
// Native browser printing supplies Unicode typography and automatic A4 pagination.
// Password text exists in this isolated print DOM only until afterprint/clear/logout.
export function renderSchoolLoginSheet(host,school,credentials,loginUrl){
 host.replaceChildren();const country=COUNTRIES[school.countryCode];if(!country||!credentials.length)throw Error('No successful credentials to print.');
 const el=(tag,text)=>{const item=document.createElement(tag);item.textContent=text;return item};
 const title=el('h1','MODERN OLYMPOS — STUDENT LOGIN CREDENTIALS'),heading=el('h2',school.name),flag=document.createElement('img');flag.src=country.flag;flag.alt='Flag of '+country.name;flag.width=42;flag.height=28;
 const countryLine=el('p','');countryLine.append(flag,el('span',country.name));
 const instructions=el('p','Open the student login URL below. Choose Student sign in, enter your login code and initial password, and sign in. Codes are case insensitive; passwords must be entered exactly. Keep this sheet private and give each student only their own credentials.');
 const url=el('p','Student login URL: '+loginUrl),warning=el('p','Confidential — Initial passwords cannot be retrieved later. Keep downloaded or printed copies secure.');
 const table=el('table',''),head=el('thead',''),headRow=el('tr','');for(const text of ['Student display alias','Login code','Initial password']){const cell=el('th',text);cell.scope='col';headRow.append(cell)}head.append(headRow);const body=el('tbody','');
 for(const row of credentials){const tr=el('tr','');for(const text of [row.name,row.code.toUpperCase(),row.password])tr.append(el('td',text));body.append(tr)}table.append(head,body);host.append(title,heading,countryLine,instructions,url,warning,table);
}
