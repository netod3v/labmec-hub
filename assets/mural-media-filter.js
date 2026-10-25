export function attachmentMatchesType(file, type) {
  const mime = String(file?.mime_type || '').toLowerCase();
  if(type==='pdf') return mime==='application/pdf';
  if(type==='gif') return mime==='image/gif';
  if(type==='image') return mime.startsWith('image/') && mime!=='image/gif';
  if(type==='video') return mime.startsWith('video/');
  return true;
}
export function postMatchesMediaType(post, type) {
  const files = Array.isArray(post.attachments) ? post.attachments : [];
  if(type==='text') return files.length===0;
  if(!type) return true;
  return files.some(file=>attachmentMatchesType(file,type));
}
