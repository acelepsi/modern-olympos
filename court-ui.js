// Courtroom presentation only: no Firebase access or authorization decisions.
export function renderTrialProgress(status) {
  const phases=['trial','verdict','closed'],current=phases.indexOf(status);
  for(const [index,phase] of phases.entries()){
    const step=document.getElementById('phase-'+phase),state=current<0?'upcoming':index<current?'completed':index===current?'active':'upcoming';
    step.dataset.state=state;
    step.querySelector('[data-phase-state]').textContent=state==='active'?'Current':state==='completed'?'Completed':'Upcoming';
    if(state==='active')step.setAttribute('aria-current','step');else step.removeAttribute('aria-current');
  }
  document.getElementById('trial-phase-status').textContent=current<0?'Trial phase unavailable.':'Current phase: '+['Arguments','Verdict','Closed'][current]+'.';
}
export function updateCourtCounters(){
  for(const [fieldId,countId,max,min] of [['prosecution-argument','prosecution-count',5000,1],['defense-argument','defense-count',5000,1],['vote-justification','justification-count',2000,15]]){
    const field=document.getElementById(fieldId),counter=document.getElementById(countId),count=field.value.length,remaining=Math.max(0,min-field.value.trim().length);
    counter.textContent=`${count} / ${max} characters`+(min===15&&remaining?` · At least ${remaining} more nonblank ${remaining===1?'character':'characters'} needed.`:'');
    counter.dataset.state=count>max?'over':remaining?'short':'ready';
  }
}
export function setupCourtCounters(){
  for(const id of ['prosecution-argument','defense-argument','vote-justification'])document.getElementById(id).addEventListener('input',updateCourtCounters);
  updateCourtCounters();
}
export function setupCourtTabs(media=window.matchMedia('(max-width: 860px)')){
  const names=['prosecution','defense'],tabs=names.map(name=>document.getElementById(name+'-tab')),panels=names.map(name=>document.getElementById(name+'-panel'));
  let selected=0;
  function render(){
    document.getElementById('court-tabs').hidden=!media.matches;
    tabs.forEach((tab,index)=>{tab.setAttribute('aria-selected',String(index===selected));tab.tabIndex=index===selected?0:-1});
    panels.forEach((panel,index)=>{
      panel.hidden=media.matches&&index!==selected;
      if(media.matches){panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',names[index]+'-tab');panel.tabIndex=0}
      else{panel.removeAttribute('role');panel.removeAttribute('aria-labelledby');panel.removeAttribute('tabindex')}
    });
  }
  function select(name,focus=false){selected=names.indexOf(name);if(selected<0)selected=0;render();if(focus&&media.matches)tabs[selected].focus()}
  tabs.forEach((tab,index)=>{
    tab.addEventListener('click',()=>select(names[index]));
    tab.addEventListener('keydown',event=>{
      let next=index;
      if(event.key==='ArrowRight')next=(index+1)%2;else if(event.key==='ArrowLeft')next=(index+1)%2;else if(event.key==='Home')next=0;else if(event.key==='End')next=1;else return;
      event.preventDefault();select(names[next],true);
    });
  });
  media.addEventListener('change',()=>{
    // Do not leave keyboard focus inside a newly hidden panel or tab bar.
    const focused=document.activeElement,panelIndex=panels.findIndex(panel=>panel.contains(focused));
    if(media.matches&&panelIndex>=0)selected=panelIndex;
    const wasTab=tabs.includes(focused);render();if(!media.matches&&wasTab)panels[selected].querySelector('h2').focus();
  });
  render();return {select};
}
export function createVoteConfirmation(dialog){
  let pending=null;
  const choice=dialog.querySelector('[data-confirm-choice]'),reason=dialog.querySelector('[data-confirm-reason]'),cancel=dialog.querySelector('[data-confirm-cancel]'),submit=dialog.querySelector('[data-confirm-submit]');
  function finish(approved){
    if(!pending)return;
    const {resolve,previous}=pending;pending=null;
    if(dialog.open)dialog.close();
    choice.textContent='';reason.textContent='';submit.disabled=false;
    // Native dialog handles containment; restore focus only to a visible target.
    if(previous?.isConnected&&previous.getClientRects().length)previous.focus();
    resolve(approved);
  }
  cancel.addEventListener('click',()=>finish(false));
  submit.addEventListener('click',()=>{submit.disabled=true;finish(true)});
  dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false)});
  dialog.addEventListener('close',()=>{if(!dialog.open)finish(false)});
  dialog.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();finish(false)}
    if(event.key==='Tab'){
      // Keep the two actions in a predictable focus loop, including Shift+Tab.
      const target=event.shiftKey?cancel:submit;
      if(document.activeElement===(event.shiftKey?cancel:submit)){event.preventDefault();(event.shiftKey?submit:cancel).focus()}
      else if(document.activeElement!==cancel&&document.activeElement!==submit){event.preventDefault();target.focus()}
    }
  });
  return {
    ask(verdict,justification){
      if(pending)return Promise.resolve(false);
      // A missing dialog API fails closed rather than submitting without review.
      if(typeof dialog.showModal!=='function'){document.getElementById('jury-vote-status').textContent='Ballot review is unavailable in this browser. Use an up-to-date browser to submit your final vote.';return Promise.resolve(false);}
      return new Promise(resolve=>{
        pending={resolve,previous:document.activeElement};choice.textContent=verdict;reason.textContent=justification;
        try{dialog.showModal();cancel.focus()}catch{document.getElementById('jury-vote-status').textContent='Unable to open ballot review. Cancel other dialogs and try again.';finish(false)}
      });
    },cancel:()=>finish(false)
  };
}
