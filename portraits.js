// Shared by the court and public archive. Parsing a URL never fetches the image.
export function portraitUrl(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') throw Error('Character Portrait URL must be an HTTPS image URL.');
  const input=value.trim();if(!input)return '';
  if(input.length>2000)throw Error('Character Portrait URL must be at most 2000 characters.');
  let url;try{url=new URL(input)}catch{throw Error('Enter a complete HTTPS Character Portrait URL.');}
  if(url.protocol!=='https:'||!url.hostname||url.username||url.password)throw Error('Character Portrait URL must use HTTPS without embedded credentials.');
  const normalized=url.href;if(normalized.length>2000)throw Error('Character Portrait URL must be at most 2000 characters.');
  return normalized;
}
export function renderPortrait(container,value,label='Mythological character') {
  container.replaceChildren();container.textContent='Ω';
  container.setAttribute('role','img');container.setAttribute('aria-label',label);
  let source;try{source=portraitUrl(value)}catch{return}
  if(!source)return;
  const image=document.createElement('img');image.alt=label;image.referrerPolicy='no-referrer';image.loading='lazy';image.decoding='async';
  image.onerror=()=>{
    // A late failure from an old trial must not remove its replacement portrait.
    if(container.children[0]!==image)return;
    container.replaceChildren();container.textContent='Ω';
  };
  image.src=source;container.replaceChildren(image);
}
