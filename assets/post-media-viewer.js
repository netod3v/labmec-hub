import { prefersReducedMotion } from './hub-preferences.js';
import { onValue, set, remove, onAuthStateChanged } from './lab-api.js';
import { renderPostAttachments } from './post-attachments.js';
import { initializeMediaZoom } from './media-zoom.js';

const isPhoto = file => /^[a-f0-9]{32}$/.test(file.id) && ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.mime_type);
const isVideo = file => /^[a-f0-9]{32}$/.test(file.id) && ['video/mp4', 'video/webm'].includes(file.mime_type);
const isPdf = file => /^[a-f0-9]{32}$/.test(file.id) && file.mime_type === 'application/pdf';
const isMedia = file => isPhoto(file) || isVideo(file) || isPdf(file);
const fileUrl = (id, inline = false) => (window.LABIOMEC_CONFIG?.apiBase || '/api') + '/files/' + encodeURIComponent(id) + (inline ? '?inline=1' : '');
const sizeLabel = size => size < 1048576 ? Math.ceil(size / 1024) + ' KB' : (size / 1048576).toFixed(1) + ' MB';
const sortedEntries = value => Object.entries(value || {}).filter(([, item]) => item && typeof item === 'object').sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0));

export function initializePostMediaViewer({ findPost, getPost, getPosts = () => [], preferredFile = () => null, pathForPost, currentProfile, person, openProfile }) {
  let activeDialog = null;
  let accountId;
  onAuthStateChanged(null, user => {
    if (accountId !== user?.uid) activeDialog?.close();
    accountId = user?.uid;
  });
  document.addEventListener('click', event => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.('a[data-post-media-file]');
    let post;
    if (link) post = findPost(link.dataset.postMediaFile, link.dataset.postMediaPost);
    else {
      if (event.target.closest?.('a,button,input,textarea,select,label,summary,details,video,audio,[data-action],[contenteditable],.post-comments,.post-views-panel')) return;
      if (window.getSelection()?.toString().trim()) return;
      const card = event.target.closest?.('.post[data-post-id]');
      if (card) post = getPost(card.dataset.postId, card.dataset.postSector);
    }
    if (!post) return;
    event.preventDefault();
    activeDialog?.close();
    show(post, link?.dataset.postMediaFile);
  });
  document.addEventListener('hub:open-post', event => {
    const post = getPost(event.detail?.id, event.detail?.sector);
    if (post) { activeDialog?.close(); show(post); }
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.isComposing || !event.target.matches?.('.post[data-post-id]')) return;
    const post = getPost(event.target.dataset.postId, event.target.dataset.postSector);
    if (post) { event.preventDefault(); activeDialog?.close(); show(post); }
  });

  function show(original, selectedId) {
    selectedId = selectedId || preferredFile(original);
    const owner = currentProfile()?.uid;
    let path = pathForPost(original);
    let post = original, files = (post.attachments || []).filter(isMedia);
    let index = Math.max(0, files.findIndex(file => file.id === selectedId));
    let replyTo = null, sending = false;
    let unsubscribe = () => {}, subscriptionVersion = 0, postAnimation = null;
    const drafts = new Map();
    const dialog = document.createElement('dialog'); dialog.className = 'post-media-viewer';
    dialog.setAttribute('aria-label', 'Publicação e comentários');
    dialog.innerHTML = `
      <div class="media-viewer-stage">
        <div class="media-viewer-toolbar"><button type="button" data-close aria-label="Fechar visualizador">×</button><button type="button" data-loop aria-label="Repetir v&#237;deo" aria-pressed="false" title="Ativar loop" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m17 2 4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14-1v3a2 2 0 0 1-2 2H3"/></svg><span>Loop</span></button><a data-download download><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg><span></span></a></div>
        <div class="media-viewer-canvas"><img class="media-viewer-image" alt="" draggable="false"><video class="media-viewer-video" controls playsinline preload="metadata" hidden></video><iframe class="media-viewer-pdf" title="PDF da publicação" hidden></iframe></div>
        <nav class="media-viewer-post-navigation" aria-label="Navegar entre publicações"><button type="button" data-previous-post title="Publicação anterior" aria-label="Publicação anterior"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg></button><span data-post-position aria-live="polite"></span><button type="button" data-next-post title="Próxima publicação" aria-label="Próxima publicação"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button></nav>
        <article class="media-viewer-text-content" hidden><span>Publicação no mural</span><h2></h2><p></p><div class="media-viewer-other-attachments"></div></article>
        <div class="media-viewer-bottom"><div class="media-viewer-zoom" role="group" aria-label="Zoom da mídia"><button type="button" data-zoom-out title="Diminuir" aria-label="Diminuir zoom"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6M7 10h6"/></svg></button><button type="button" data-zoom-reset title="Voltar ao tamanho inicial" aria-label="Restaurar zoom">100%</button><button type="button" data-zoom-in title="Aumentar" aria-label="Aumentar zoom"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6M7 10h6M10 7v6"/></svg></button></div><div class="media-viewer-navigation"><button type="button" data-previous aria-label="Mídia anterior">‹</button><span data-position></span><button type="button" data-next aria-label="Próxima mídia">›</button></div></div>
      </div>
      <section class="media-viewer-discussion" aria-label="Conversa da publicação">
        <div class="media-viewer-post"><button type="button" class="media-viewer-author"></button><p class="media-viewer-caption"></p><button type="button" class="media-viewer-like"></button></div>
        <h2 class="media-viewer-comments-title">Comentários</h2>
        <div class="media-viewer-comments" tabindex="0" aria-label="Comentários e respostas"></div>
        <form class="media-viewer-composer">
          <div class="media-viewer-reply-context" hidden><span></span><button type="button" data-cancel-reply aria-label="Cancelar resposta">×</button></div>
          <div class="media-viewer-compose-box"><label class="media-viewer-input-label">Participar da conversa<textarea rows="2" maxlength="10000" placeholder="Compartilhe uma ideia…" required></textarea></label>
          <div class="media-viewer-composer-actions"><button type="button" data-newline title="Quebrar linha" aria-label="Quebrar linha"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 5v6a4 4 0 0 1-4 4H4m5-5-5 5 5 5"/></svg></button><button type="submit"><span>Enviar</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20V4m-6 6 6-6 6 6"/></svg></button></div></div>
          <p class="media-viewer-status" role="status" aria-live="polite"></p>
        </form>
      </section>`;
    const mobileViewer=matchMedia('(max-width:720px)');
    const reactions=document.createElement('div');reactions.className='media-viewer-reactions';
    reactions.innerHTML='<button type="button" data-mobile-like aria-label="Curtir publicação" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-9-5.4-9-12a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6.6-9 12-9 12Z"/></svg></button><button type="button" data-open-comments aria-label="Abrir comentários" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v12H9l-5 4V4Z"/><path d="M8 8h8M8 12h5"/></svg></button>';
    dialog.querySelector('.media-viewer-stage').append(reactions);
    const sheet=dialog.querySelector('.media-viewer-discussion');
    const sheetClose=document.createElement('button');sheetClose.type='button';sheetClose.className='media-viewer-comments-close';sheetClose.textContent='×';sheetClose.setAttribute('aria-label','Fechar comentários');sheet.prepend(sheetClose);
    const sheetBackdrop=document.createElement('button');sheetBackdrop.type='button';sheetBackdrop.className='media-viewer-comments-backdrop';sheetBackdrop.setAttribute('aria-label','Fechar comentários');dialog.append(sheetBackdrop);
    let sheetVersion=0,sheetAnimation=null;
    async function setComments(open,restore=false){
      const version=++sheetVersion;sheetAnimation?.cancel();
      if(!mobileViewer.matches){dialog.classList.remove('comments-open');sheet.inert=false;dialog.querySelector('.media-viewer-stage').inert=false;return;}
      if(!open&&dialog.classList.contains('comments-open')&&!prefersReducedMotion()){
        sheetAnimation=sheet.animate([{transform:'translateY(0)',opacity:1},{transform:'translateY(24px)',opacity:0}],{duration:180,easing:'ease'});
        try{await sheetAnimation.finished;}catch{return;}
        if(version!==sheetVersion)return;
      }
      dialog.classList.toggle('comments-open',open);sheet.inert=!open;
      dialog.querySelector('.media-viewer-stage').inert=open;
      reactions.querySelector('[data-open-comments]').setAttribute('aria-expanded',String(open));
      if(open)sheetClose.focus({preventScroll:true});else if(restore)reactions.querySelector('[data-open-comments]').focus({preventScroll:true});
    }
    const syncComments=()=>setComments(false);mobileViewer.addEventListener('change',syncComments);
    reactions.querySelector('[data-open-comments]').onclick=()=>setComments(true);
    sheetClose.onclick=sheetBackdrop.onclick=()=>setComments(false,true);
    dialog.addEventListener('cancel',event=>{if(mobileViewer.matches&&dialog.classList.contains('comments-open')){event.preventDefault();setComments(false,true);}});
    const image = dialog.querySelector('.media-viewer-image');
    const video = dialog.querySelector('.media-viewer-video');
    const canvas = dialog.querySelector('.media-viewer-canvas');
    const pdf = dialog.querySelector('.media-viewer-pdf');
    const stage = dialog.querySelector('.media-viewer-stage');
    const mediaZoom = initializeMediaZoom({ viewport: canvas, controls: dialog.querySelector('.media-viewer-zoom'), wheelRequiresModifier:true });
    const loop = dialog.querySelector('[data-loop]');
    loop.onclick = () => {
      video.loop = !video.loop;
      loop.setAttribute('aria-pressed', String(video.loop));
      loop.title = video.loop ? 'Desativar loop' : 'Ativar loop';
      loop.querySelector('span').textContent = video.loop ? 'Loop ativo' : 'Loop';
    };
    const discussion = dialog.querySelector('.media-viewer-comments');
    const status = dialog.querySelector('.media-viewer-status');
    const form = dialog.querySelector('form');
    const input = form.querySelector('textarea');
    const submit = form.querySelector('[type=submit]');
    submit.setAttribute('aria-label','Enviar comentário');
    const context = dialog.querySelector('.media-viewer-reply-context');
    const like = dialog.querySelector('.media-viewer-like');
    const refreshSendState = () => { submit.disabled = sending || !input.value.trim(); renderPostNavigation(); };
    input.addEventListener('input', refreshSendState);
    refreshSendState();
    function identity() {
      const profile = currentProfile();
      if (!profile?.uid || !profile.name || profile.isBanned || profile.uid !== owner) throw new Error('Entre com seu perfil para interagir.');
      return profile;
    }
    function avatar(info) {
      const node = document.createElement('span'); node.className = 'avatar avatar-sm';
      if (info.photo) { const img = document.createElement('img'); img.src = info.photo; img.alt = ''; node.append(img); }
      else node.textContent = Array.from(info.name || '?')[0].toLocaleUpperCase('pt-BR');
      return node;
    }
    function selectPhoto() {
      const file = files[index];
      const videoSelected = !!file && isVideo(file);
      const pdfSelected = !!file && isPdf(file);
      let hint=dialog.querySelector('.media-viewer-navigation-hint');
      if(!hint){hint=document.createElement('span');hint.className='media-viewer-navigation-hint';dialog.querySelector('.media-viewer-bottom').append(hint);}
      hint.textContent=pdfSelected?'Role dentro do PDF para ler · Use ↑ ↓ para trocar de publicação':file?'Role para trocar de publicação · Arraste para mover com zoom · Ctrl + roda para zoom':'Use ↑ ↓ para trocar de publicação';
      canvas.hidden = !file;
      mediaZoom.reset(file && !pdfSelected ? (videoSelected ? video : image) : null);
      const textContent = dialog.querySelector('.media-viewer-text-content');
      dialog.classList.toggle('is-text-post', !file);
      image.hidden = !file || videoSelected || pdfSelected;
      video.hidden = !videoSelected;
      pdf.hidden = !pdfSelected;
      if(!pdfSelected) pdf.removeAttribute('src');
      dialog.classList.toggle('is-pdf-post',pdfSelected);
      loop.hidden = !videoSelected;
      textContent.hidden = !!file;
      if (!videoSelected || video.getAttribute('src') !== fileUrl(file.id, true)) {
        video.pause(); video.removeAttribute('src'); video.load();
      }
      const download = dialog.querySelector('[data-download]'); download.hidden = !file;
      dialog.querySelector('[data-previous]').hidden = files.length < 2;
      dialog.querySelector('[data-next]').hidden = files.length < 2;
      dialog.querySelector('.media-viewer-navigation').hidden = files.length < 2;
      if (!file) {
        image.removeAttribute('src');
        textContent.querySelector('h2').textContent = person(post.uid, post.author).name;
        textContent.querySelector('p').textContent = post.text || (post.poll ? 'Publicação com enquete' : 'Publicação no mural');
        const attachments = textContent.querySelector('.media-viewer-other-attachments');
        const content = renderPostAttachments(post);
        if (attachments.innerHTML !== content) attachments.innerHTML = content;
        dialog.querySelector('[data-position]').textContent = '';
        return;
      }
      if(pdfSelected){
        image.removeAttribute('src');
        if(pdf.getAttribute('src')!==fileUrl(file.id,true))pdf.src=fileUrl(file.id,true);
        pdf.title=file.name || 'PDF da publicação';
      } else if (videoSelected) {
        image.removeAttribute('src');
        if (video.getAttribute('src') !== fileUrl(file.id, true)) video.src = fileUrl(file.id, true);
        video.setAttribute('aria-label', file.name || 'Vídeo da publicação');
      } else {
        image.src = fileUrl(file.id, true); image.alt = file.name || 'Foto da publicação';
      }
      download.href = fileUrl(file.id);
      download.setAttribute('aria-label', (pdfSelected ? 'Baixar PDF, ' : videoSelected ? 'Baixar vídeo, ' : 'Baixar foto, ') + sizeLabel(file.size || 0));
      download.querySelector('span').textContent = sizeLabel(file.size || 0);
      dialog.querySelector('[data-position]').textContent = files.length > 1 ? `${index + 1} de ${files.length}` : '';
      dialog.querySelector('[data-previous]').hidden = files.length < 2;
      dialog.querySelector('[data-next]').hidden = files.length < 2;
    }
    function setReply(target, focus = true) {
      replyTo = target; context.hidden = !target;
      context.querySelector('span').textContent = target ? 'Respondendo a ' + target.name : '';
      input.placeholder = target ? 'Escreva uma resposta…' : 'Compartilhe uma ideia…';
      if (target && focus) input.focus({ preventScroll: true });
    }
    function renderComments() {
      const scroll = discussion.scrollTop;
      discussion.replaceChildren();
      let count = 0;
      function add(items, parent, basePath, depth = 0) {
        for (const [id, item] of sortedEntries(items)) {
          count++;
          const itemPath = basePath + '/' + id;
          const info = person(item.uid, item.author);
          const row = document.createElement('article'); row.className = 'media-viewer-comment';
          const head = document.createElement('div'); head.className = 'media-viewer-comment-head';
          const name = document.createElement('strong'); name.textContent = info.name;
          head.append(avatar(info), name);
          const text = document.createElement('p'); text.textContent = item.text || '';
          const actions = document.createElement('div'); actions.className = 'media-viewer-comment-actions';
          const date = document.createElement('span'); date.textContent = item.ts ? new Date(Number(item.ts)).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }) : '';
          const reply = document.createElement('button'); reply.type = 'button'; reply.textContent = 'Responder';
          reply.onclick = () => setReply({ path: itemPath + '/replies', name: info.name });
          const heart = document.createElement('button'); heart.type = 'button';
          const liked = !!item.likes?.[currentProfile()?.uid];
          heart.textContent = (liked ? '♥ ' : '♡ ') + Object.keys(item.likes || {}).length;
          heart.setAttribute('aria-label', (liked ? 'Descurtir' : 'Curtir') + ' comentário'); heart.setAttribute('aria-pressed', String(liked));
          heart.onclick = async () => {
            heart.disabled = true;
            try { const user = identity(); const target = itemPath + '/likes/' + user.uid; await (liked ? remove(target) : set(target, { ts: Date.now() })); }
            catch (error) { status.textContent = error.message; }
            finally { heart.disabled = false; }
          };
          actions.append(date, reply, heart); row.append(head, text, actions); parent.append(row);
          if (item.replies && depth < 12) {
            const children = document.createElement('div'); children.className = 'media-viewer-comment-children'; row.append(children);
            add(item.replies, children, itemPath + '/replies', depth + 1);
          }
        }
      }
      add(post.comments, discussion, path + '/comments');
      if (!count) {
        const empty = document.createElement('div'); empty.className = 'media-viewer-empty';
        const icon = document.createElement('span'); icon.className = 'media-viewer-empty-icon';
        icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v12H9l-5 4V4M8 8h8M8 12h5"/></svg>';
        const title = document.createElement('strong'); title.textContent = 'A conversa começa por você';
        const hint = document.createElement('p'); hint.textContent = 'Compartilhe uma ideia ou faça uma pergunta sobre esta publicação.';
        empty.append(icon, title, hint); discussion.append(empty);
      }
      const heading = dialog.querySelector('.media-viewer-comments-title');
      const label = document.createElement('span'); label.textContent = 'Comentários';
      const badge = document.createElement('span'); badge.className = 'media-viewer-comment-count'; badge.textContent = count;
      heading.replaceChildren(label, badge);
      discussion.scrollTop = scroll;
      const author = dialog.querySelector('.media-viewer-author'); author.replaceChildren();
      const info = person(post.uid, post.author); const name = document.createElement('strong'); name.textContent = info.name;
      const authorCopy = document.createElement('span'); authorCopy.className = 'media-viewer-author-copy';
      const date = document.createElement('small'); date.textContent = post.ts ? new Date(Number(post.ts)).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' }) + ' · Mural' : 'Publicação no mural';
      authorCopy.append(name, date); author.append(avatar(info), authorCopy); author.title = 'Ver perfil de ' + info.name;
      author.onclick = () => { dialog.close(); if (post.uid) openProfile(post.uid, info.name); };
      dialog.querySelector('.media-viewer-caption').textContent = post.text || '';
      const liked = !!post.likes?.[currentProfile()?.uid];
      like.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-9-5.4-9-12a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6.6-9 12-9 12Z"/></svg>';
      const likes = Object.keys(post.likes || {}).length;
      const likeLabel = document.createElement('span'); likeLabel.textContent = likes ? `${likes} ${likes === 1 ? 'curtida' : 'curtidas'}` : 'Seja o primeiro a curtir'; like.append(likeLabel);
      like.setAttribute('aria-pressed', String(liked));
      const mobileLike=reactions.querySelector('[data-mobile-like]');mobileLike.setAttribute('aria-pressed',String(liked));mobileLike.setAttribute('aria-label',(liked?'Descurtir':'Curtir')+' publicação · '+likes+' curtidas');
      reactions.querySelector('[data-open-comments]').setAttribute('aria-label','Abrir comentários · '+count+' comentários');
    }
    reactions.querySelector('[data-mobile-like]').onclick=()=>like.click();
    like.onclick = async () => {
      like.disabled = true;
      reactions.querySelector('[data-mobile-like]').disabled=true;
      try { const user = identity(); const target = path + '/likes/' + user.uid; await (post.likes?.[user.uid] ? remove(target) : set(target, { ts: Date.now() })); }
      catch (error) { status.textContent = error.message; if(mobileViewer.matches)await setComments(true); }
      finally { like.disabled = false; reactions.querySelector('[data-mobile-like]').disabled=false; }
    };
    form.onsubmit = async event => {
      event.preventDefault(); const text = input.value.trim();
      if (!text || sending) return;
      try {
        const user = identity(); sending = true; submit.disabled = true; input.disabled = true;
        status.textContent = 'Enviando…';
        await set((replyTo?.path || path + '/comments') + '/' + crypto.randomUUID(), { uid: user.uid, author: user.name, text, ts: Date.now() });
        input.value = ''; setReply(null); status.textContent = '';
      } catch (error) { status.textContent = error.message || 'Não foi possível enviar. Tente novamente.'; }
      finally { sending = false; input.disabled = false; refreshSendState(); }
    };
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); form.requestSubmit(); }
    });
    dialog.querySelector('[data-newline]').onclick = () => { input.setRangeText('\n', input.selectionStart, input.selectionEnd, 'end'); input.focus({ preventScroll: true }); refreshSendState(); };
    dialog.querySelector('[data-cancel-reply]').onclick = () => setReply(null);
    dialog.querySelector('[data-close]').onclick = () => dialog.close();
    function orderedPosts(){
      const list = getPosts();
      return list.some(item=>pathForPost(item)===path) ? list : [post,...list];
    }
    function renderPostNavigation(){
      // Read only public callbacks here: this also runs while the composer initializes.
      const list = orderedPosts();
      const position = list.findIndex(item=>pathForPost(item)===path);
      const count = Math.max(1,list.length);
      dialog.querySelector('[data-previous-post]').disabled = sending || position<=0;
      dialog.querySelector('[data-next-post]').disabled = sending || position<0 || position>=list.length-1;
      dialog.querySelector('[data-post-position]').textContent = `${Math.max(0,position)+1} / ${count}`;
    }
    function watchPost(){
      unsubscribe(); const version=++subscriptionVersion;
      unsubscribe=onValue(path,snapshot=>{
        if(!dialog.open || version!==subscriptionVersion)return;
        if(!snapshot.exists()){dialog.close();return;}
        const selected=files[index]?.id;
        post={...snapshot.val(),id:post.id,_sector:post._sector};
        files=(post.attachments || []).filter(isMedia);
        index=Math.max(0,files.findIndex(file=>file.id===selected));
        renderComments(); renderPostNavigation();
        if(!files.length || files[index]?.id!==selected)selectPhoto();
      },error=>{if(version===subscriptionVersion)status.textContent=error.message;});
    }
    function navigatePost(direction){
      if(sending)return;
      setComments(false);
      const list=orderedPosts(), position=list.findIndex(item=>pathForPost(item)===path);
      const next=list[position+direction]; if(!next)return;
      drafts.set(path,{text:input.value,replyTo});
      post=next; path=pathForPost(post); files=(post.attachments || []).filter(isMedia); index=Math.max(0,files.findIndex(file=>file.id===preferredFile(post)));
      const draft=drafts.get(path);
      input.value=draft?.text || ''; setReply(draft?.replyTo || null,false);
      status.textContent=''; discussion.scrollTop=0;
      selectPhoto(); renderComments(); refreshSendState(); watchPost();
      postAnimation?.cancel();
      if(!prefersReducedMotion()){
        postAnimation=canvas.animate([{opacity:.3,transform:`translateY(${direction*14}px)`},{opacity:1,transform:'translateY(0)'}],{duration:220,easing:'ease-out'});
      }
    }
    dialog.querySelector('[data-previous-post]').onclick=()=>navigatePost(-1);
    dialog.querySelector('[data-next-post]').onclick=()=>navigatePost(1);
    let wheelAmount=0, wheelAt=0, wheelLockedUntil=0;
    stage.addEventListener('wheel',event=>{
      if(event.defaultPrevented || event.ctrlKey || event.metaKey || !event.deltaY || Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
      if(event.target.closest('button,a,input,textarea,select,iframe,.media-viewer-bottom'))return;
      const text=event.target.closest('.media-viewer-text-content');
      if(text && text.scrollHeight>text.clientHeight)return;
      event.preventDefault();
      const now=performance.now(); if(now<wheelLockedUntil)return;
      const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?stage.clientHeight:1);
      if(now-wheelAt>200 || Math.sign(delta)!==Math.sign(wheelAmount))wheelAmount=0;
      wheelAt=now; wheelAmount+=delta;
      if(Math.abs(wheelAmount)>=60){navigatePost(wheelAmount>0?1:-1);wheelAmount=0;wheelLockedUntil=now+700;}
    },{passive:false});
    const navigate = direction => { if (!files.length) return; index = (index + direction + files.length) % files.length; selectPhoto(); };
    dialog.querySelector('[data-previous]').onclick = () => navigate(-1);
    dialog.querySelector('[data-next]').onclick = () => navigate(1);
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') event.stopPropagation();
      if (event.target.matches('textarea,input,select,video,iframe') || event.target.closest('.media-viewer-discussion')) return;
      if(event.key==='ArrowUp' || event.key==='ArrowDown'){event.preventDefault();navigatePost(event.key==='ArrowUp'?-1:1);}
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); navigate(event.key === 'ArrowLeft' ? -1 : 1); }
    });
    image.onerror = () => { if (!image.hidden) status.textContent = 'Não foi possível carregar a foto. Tente baixar o arquivo.'; };
    video.onerror = () => { if (!video.hidden) status.textContent = 'Não foi possível carregar o vídeo. Tente baixar o arquivo.'; };
    document.body.append(dialog); activeDialog = dialog; dialog.showModal(); setComments(false); selectPhoto(); renderComments(); renderPostNavigation(); watchPost();
    dialog.addEventListener('close', () => { ++sheetVersion;sheetAnimation?.cancel();mobileViewer.removeEventListener('change',syncComments);++subscriptionVersion; postAnimation?.cancel(); mediaZoom.destroy(); pdf.removeAttribute('src'); video.pause(); video.removeAttribute('src'); video.load(); unsubscribe(); dialog.remove(); if (activeDialog === dialog) activeDialog = null; }, { once: true });
  }
}
