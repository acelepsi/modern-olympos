// Shared client-side presentation and optional metadata validation.
export function chronologicalSubmissions(docs) {
  const time = post => {
    try {
      const value = post.createdAt?.toMillis?.();
      return typeof value === 'number' && Number.isFinite(value) ? value : Infinity;
    } catch { return Infinity; }
  };
  // Unknown dates follow known dates. Equal/unknown dates retain snapshot order.
  return docs.map(item => ({post:item.data()})).sort((a,b) => {
    const left=time(a.post),right=time(b.post);
    return left===right ? 0 : left<right ? -1 : 1;
  }).map(entry=>entry.post);
}
export function caseCharge(value) {
  if (typeof value !== 'string' || value.length > 2000) throw Error('Charge / Case Description must be text of at most 2000 characters.');
  return value.trim();
}
export function validEvidence(value, previous) {
  if (typeof value !== 'string' || value.length > 1000) return false;
  if (!value) return true;
  // Grandfather an unchanged historical HTTP source; new/changed links require HTTPS.
  const legacy = value === previous;
  if (!(legacy ? /^https?:\/\//i : /^https:\/\//i).test(value)) return false;
  if (!/^https?:\/\/([A-Za-z0-9][A-Za-z0-9.-]*|\[[0-9A-Fa-f:]+\])(:[0-9]{1,5})?([/?#][^\s]*)?$/i.test(value)) return false;
  try { const url=new URL(value); return !url.username && !url.password && !!url.hostname; } catch { return false; }
}
