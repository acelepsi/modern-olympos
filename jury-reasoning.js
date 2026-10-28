// Public copies contain only approved text and the immutable ballot choice.
export function reasoningReleased(trial) {
  const tally=trial?.verdictSummary;
  return trial?.status==='closed'&&!!tally&&Number.isSafeInteger(tally.guilty)&&Number.isSafeInteger(tally.notGuilty)&&tally.guilty>=0&&tally.notGuilty>=0&&tally.guilty+tally.notGuilty>0;
}
export function anonymousReasoning(ballot,text,identifiers=[]) {
  if(!['guilty','not-guilty'].includes(ballot?.choice))throw Error('This ballot has an invalid choice.');
  const reason=typeof text==='string'?text.trim():'';
  if(reason.length<15||reason.length>2000)throw Error('Reviewed reasoning must contain 15–2000 characters.');
  if(reason.includes('@')||/\b(?:student|pupil)-[a-z0-9-]+\b/i.test(reason))throw Error('Remove email addresses, handles and student codes before publication.');
  if(identifiers.some(value=>typeof value==='string'&&value.length>=3&&reason.toLowerCase().includes(value.toLowerCase())))throw Error('Remove account identifiers or student aliases before publication.');
  return {choice:ballot.choice,reason};
}
export async function reviewReasoning(approved,text,api) {
  const generatedId=api.newId();
  for(let attempt=0;attempt<2;attempt++){
   let newReference=false;
   try{await api.run(async transaction=>{
    if(!api.current())throw Error('Trial or administrator changed. Reload the review panel.');
    const trial=await transaction.get(api.trial),ballot=await transaction.get(api.ballot),review=await transaction.get(api.review);
    if(!api.current())throw Error('Trial or administrator changed. Reload the review panel.');
    if(!trial.exists()||!reasoningReleased(trial.data()))throw Error('Permanently close the trial and publish a valid final tally first.');
    if(!ballot.exists())throw Error('Private ballot is unavailable.');
    newReference=!review.exists();
    const publicId=review.exists()?review.data().publicId:generatedId;
    if(!/^[A-Za-z0-9]{20}$/.test(publicId))throw Error('Invalid review reference. Ask the project owner to check this review record.');
    if(approved)transaction.set(api.publicCopy(publicId),anonymousReasoning(ballot.data(),text,api.identifiers));
    else if(review.exists()&&review.data().state==='approved')transaction.delete(api.publicCopy(publicId));
    transaction.set(api.review,{state:approved?'approved':'excluded',publicId});
   });return;
   }catch(error){
    // A racing first approval may be rejected by the immutable-reference rule
    // before the SDK reports a version conflict. Reread once; never relax the rule.
    if(attempt===0&&newReference&&error.code==='permission-denied'&&api.current())continue;
    throw error;
   }
  }
}
