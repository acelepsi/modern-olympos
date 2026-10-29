// In-page navigation only. Every teacher tool stays visible and uses existing handlers.
export function setupWorkspaceNavigation(doc=document,view=window){
 const links=[...doc.querySelectorAll('[data-workspace-link]')];
 const select=hash=>{
  const match=links.find(link=>link.hash===hash)||links[0];
  for(const link of links){if(link===match)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current')}
 };
 select(view.location.hash);
 view.addEventListener('hashchange',()=>{
  select(view.location.hash);
  const target=links.find(link=>link.hash===view.location.hash);
  if(target)doc.getElementById(target.hash.slice(1)).focus({preventScroll:true});
 });
}
if(typeof document!=='undefined')setupWorkspaceNavigation();
