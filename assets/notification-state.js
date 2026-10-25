// Stable UI identifiers, not authentication/security hashes.
export function notificationKey(item) {
  const source = item.post || item.item || {};
  const identity = item.notificationId ? JSON.stringify([item.kind,item.notificationId]) : JSON.stringify([item.kind, source._sector || '', source.id || '', item.otherUid || item.person?.uid || '', ['dm','post-like'].includes(item.kind) ? item.ts : '']);
  let a = 2166136261, b = 3335557771;
  for (let i=0;i<identity.length;i++) { a=Math.imul(a^identity.charCodeAt(i),16777619); b=Math.imul(b^identity.charCodeAt(i),2246822519); }
  return 'n'+[a,b].map(value=>(value>>>0).toString(16).padStart(8,'0')).join('');
}
export function notificationPage(items, records, page, legacySeenAt = 0, pageSize = 10) {
  const visible = items.map(item=>({...item, key:notificationKey(item)})).filter(item=>!records[item.key]?.deleted).map(item=>({...item, read:records[item.key]?.read === true || item.ts <= legacySeenAt}));
  const pages = Math.max(1,Math.ceil(visible.length/pageSize));
  const current = Math.max(1,Math.min(page,pages));
  return {items:visible.slice((current-1)*pageSize,current*pageSize), page:current, pages, total:visible.length, unread:visible.filter(item=>!item.read).length};
}
