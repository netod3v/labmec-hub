const NOTICE_KEY = 'labiomec_cookie_notice';
const NOTICE_VERSION = '2026-10-19';
const NOTICE_DURATION = 180 * 24 * 60 * 60 * 1000;

const POLICIES = {
  privacy: {
    title: 'Política de Privacidade',
    introduction: 'Como os dados são usados nesta versão do LABIOMEC Hub.',
    sections: [
      ['Exclusão de acesso ao hub', 'Quando a administração exclui uma pessoa do hub, o perfil público e a senha são removidos e as sessões são invalidadas. O e-mail fica reservado para impedir novo cadastro com o mesmo endereço. Uma referência interna da conta é mantida para preservar arquivos e o histórico das contribuições. Essa ação não equivale à exclusão de todos os dados enviados pela pessoa.'],
      ['Dados usados no hub', 'O hub utiliza seu e-mail para acesso à conta; nome, foto, biografia e unidades para o perfil; e os conteúdos que você envia, como publicações, comentários, metas, demandas, arquivos e mensagens. Informações de sessão, presença e leitura ajudam a proteger o acesso e organizar a comunicação.'],
      ['Conquistas', 'Publicações, comentários, respostas e curtidas no mural, inclusive nas unidades, podem gerar emblemas de participação. Em Editar perfil, você escolhe quais conquistas exibir aos integrantes e pode ocultar todas. Você continua vendo suas conquistas e o progresso detalhado, que não são enviados aos outros perfis quando ocultos. O registro interno guarda identificadores resumidos de atividades, sem copiar o texto dos conteúdos, e preserva as conquistas após a exclusão da publicação ou comentário.'],
      ['Para que usamos esses dados', 'Os dados permitem identificar integrantes, organizar o trabalho do laboratório, compartilhar materiais com o público escolhido e entregar mensagens. A senha é armazenada no servidor como um resumo criptográfico, não em texto simples.'],
      ['Quem pode acessar', 'Perfis e conteúdos marcados para todos ficam disponíveis aos integrantes autenticados do hub. Conteúdos de uma unidade respeitam as permissões dessa unidade e da administração. Na biblioteca, arquivos privados ficam disponíveis ao proprietário e à administração. Mensagens diretas são acessíveis pela interface apenas aos participantes; notas privadas e demandas pessoais, à própria conta.'],
      ['Dados no navegador', 'O navegador pode guardar preferências de tema e visualização, identificações de contas usadas neste dispositivo, avisos de leitura e uma cópia local de notas. Buscas recentes ficam na sessão da aba. Esses registros não substituem os dados salvos no servidor. Em um dispositivo compartilhado, saia da conta e use a opção de esquecer contas salvas quando necessário.'],
      ['Serviços externos', 'As fontes da interface são carregadas pelo Google Fonts, que recebe a conexão feita pelo navegador. Links institucionais, redes sociais e salas de chamada abrem serviços externos, sujeitos às próprias políticas. Esta versão do hub não integra ferramentas de publicidade ou análise de audiência.'],
      ['Conservação e solicitações', 'Conteúdos permanecem no hub enquanto forem mantidos pela conta ou pela administração, conforme o funcionamento de cada área. Arquivar uma demanda não equivale a apagá-la. Para solicitar informações, correção ou exclusão de dados, entre em contato com a administração do laboratório pelo canal de suporte disponibilizado no hub. As solicitações devem considerar também a autoria e os dados de outros participantes.'],
    ],
  },
  terms: {
    title: 'Termos de Uso',
    introduction: 'Orientações para colaborar e compartilhar materiais no laboratório.',
    sections: [
      ['Finalidade e acesso', 'O LABIOMEC Hub é um ambiente de colaboração da equipe para comunicação, organização de atividades e materiais de pesquisa. O acesso depende de uma conta autorizada. Cada integrante pode selecionar suas unidades no próprio perfil, passando a acessar os conteúdos compartilhados com essas equipes. As funções administrativas são atribuídas pela administração.'],
      ['Cuidados com a conta', 'Use informações corretas de identificação e mantenha suas credenciais sob seu controle. Saia ao terminar em um dispositivo compartilhado e avise a administração se identificar acesso indevido ou problemas na conta.'],
      ['Convivência e materiais', 'Respeite os demais integrantes e compartilhe somente conteúdos que você tem autorização para disponibilizar. Evite informações pessoais desnecessárias de terceiros e siga as orientações do laboratório para materiais confidenciais e de pesquisa.'],
      ['Visibilidade e responsabilidade', 'Confira quem pode acessar antes de publicar ou enviar arquivos. O destinatário pode baixar ou conservar materiais que recebeu. A biblioteca e os anexos enviados separadamente no mural são independentes: excluir uma cópia não exclui a outra.'],
      ['Organização do trabalho', 'Metas, demandas, histórico e comentários apoiam a organização da equipe. Combine com os responsáveis os prazos e procedimentos aplicáveis. O hub não substitui os procedimentos oficiais da instituição nem os registros de pesquisa exigidos pela equipe.'],
      ['Administração e suporte', 'A administração gerencia contas, unidades e permissões e pode atuar sobre conteúdos conforme as funções disponíveis no hub. Problemas de acesso, dúvidas e pedidos relativos aos seus dados devem ser encaminhados ao suporte ou à administração do laboratório.'],
    ],
  },
  cookies: {
    title: 'Política de Cookies',
    introduction: 'O que fica no navegador e por que isso ajuda o hub a funcionar.',
    sections: [
      ['O que são cookies?', 'Cookies são pequenos registros que o navegador envia de volta ao site. No hub, o cookie de sessão permite reconhecer seu acesso e proteger operações, como enviar uma mensagem. Ele não guarda sua senha.'],
      ['Cookie necessário de sessão', 'O cookie próprio labiomec_session mantém as informações de autenticação e proteção da sessão. O acesso autenticado é configurado para 12 horas, com renovação durante o uso. Bloquear esse cookie pode impedir o login e outras operações. Ele não é utilizado pelo hub para publicidade.'],
      ['Preferências e outros registros locais', 'Tema, organização do painel, visualizações, contas recentes, avisos de leitura e cópias de notas podem ser armazenados localmente no dispositivo. Permanecem até serem substituídos, removidos pela função correspondente ou apagados nas configurações do navegador. As buscas recentes usam armazenamento da sessão e normalmente são apagadas ao fechar a aba.'],
      ['Aviso de cookies', 'Ao clicar em Entendi, você apenas confirma a leitura deste aviso. Essa escolha é lembrada neste navegador por até 180 dias ou até seus dados locais serem apagados. Não é uma autorização para publicidade, nem altera a visibilidade dos seus conteúdos. O cookie necessário não é apresentado como uma opção que possa ser recusada sem afetar o acesso.'],
      ['Publicidade e serviços externos', 'Esta versão não instala ferramentas de anúncios ou medição de audiência. As fontes são fornecidas pelo Google Fonts. Serviços acessados por links externos podem adotar práticas próprias, que não são controladas por este aviso.'],
      ['Como consultar e remover', 'Consulte esta política a qualquer momento pelo rodapé. Você pode remover cookies e dados locais nas configurações do navegador; isso pode encerrar o login, apagar preferências e remover cópias locais de notas. Limpar o navegador não apaga, por si só, os conteúdos já enviados ao servidor.'],
    ],
  },
};

export function initializeSitePolicies() {
  const banner = document.getElementById('cookie-notice');
  const accept = document.getElementById('cookie-notice-understood');
  const dialog = document.createElement('dialog');
  dialog.className = 'site-policy-dialog';
  dialog.setAttribute('aria-labelledby', 'site-policy-title');
  dialog.innerHTML = '<div class="site-policy-heading"><div><span>LABIOMEC HUB</span><h2 id="site-policy-title"></h2></div><button type="button" data-policy-close aria-label="Fechar documento">×</button></div><nav class="site-policy-tabs" aria-label="Documentos do hub"></nav><div class="site-policy-content" tabindex="0"></div><div class="site-policy-foot"><span>Atualizado em 20 de outubro de 2026</span><button type="button" class="btn" data-policy-close>Fechar</button></div>';
  document.body.append(dialog);
  const tabs = dialog.querySelector('.site-policy-tabs');
  for (const [key, policy] of Object.entries(POLICIES)) {
    const tab = document.createElement('button'); tab.type = 'button';
    tab.dataset.policy = key; tab.textContent = policy.title;
    tabs.append(tab);
  }
  let previousFocus = null;
  let policyMotion=null,policyClosing=false;
  function cleanupPolicy(){
    policyMotion?.cancel();policyMotion=null;policyClosing=false;dialog.removeAttribute('data-closing');
    document.body.classList.remove('site-policy-open');
    const target=previousFocus;previousFocus=null;if(target?.isConnected)target.focus({preventScroll:true});
  }
  function finishPolicyClose(){dialog.close();cleanupPolicy();}
  function animatePolicy(opening){
    const computed=policyMotion?getComputedStyle(dialog):null;
    const from=computed?{opacity:computed.opacity,transform:computed.transform}:opening?{opacity:0,transform:'translateY(14px) scale(.98)'}:{opacity:1,transform:'translateY(0) scale(1)'};
    policyMotion?.cancel();policyMotion=null;
    if(typeof dialog.animate!=='function'||matchMedia('(prefers-reduced-motion: reduce)').matches){if(!opening)finishPolicyClose();return;}
    const motion=dialog.animate([from,opening?{opacity:1,transform:'translateY(0) scale(1)'}:{opacity:0,transform:'translateY(10px) scale(.98)'}],{duration:opening?220:160,easing:opening?'cubic-bezier(.2,.8,.2,1)':'ease-in',fill:'forwards'});
    policyMotion=motion;
    motion.finished.then(()=>{if(policyMotion!==motion)return;policyMotion=null;if(!opening)finishPolicyClose();motion.cancel();}).catch(()=>{});
  }
  function closePolicy(){
    if(!dialog.open||policyClosing)return;
    policyClosing=true;dialog.setAttribute('data-closing','');animatePolicy(false);
  }
  function showPolicy(key) {
    const policy = POLICIES[key];
    if (!policy) return;
    dialog.querySelector('h2').textContent = policy.title;
    tabs.querySelectorAll('button').forEach(tab => tab.setAttribute('aria-pressed', String(tab.dataset.policy === key)));
    const content = dialog.querySelector('.site-policy-content');
    content.replaceChildren();
    const intro = document.createElement('p'); intro.className = 'site-policy-intro'; intro.textContent = policy.introduction;
    content.append(intro);
    for (const [title, text] of policy.sections) {
      const section = document.createElement('section');
      const heading = document.createElement('h3'); heading.textContent = title;
      const paragraph = document.createElement('p'); paragraph.textContent = text;
      section.append(heading, paragraph); content.append(section);
    }
    const reopening=policyClosing;
    policyClosing=false;dialog.removeAttribute('data-closing');
    if (!dialog.open) {
      previousFocus = document.activeElement;
      document.body.classList.add('site-policy-open');
      dialog.showModal();
      animatePolicy(true);
    }else if(reopening)animatePolicy(true);
    content.scrollTop = 0;
  }
  document.addEventListener('click', event => {
    const link = event.target.closest?.('[data-policy]');
    if (!link || !Object.hasOwn(POLICIES, link.dataset.policy)) return;
    event.preventDefault(); showPolicy(link.dataset.policy);
  });
  dialog.querySelectorAll('[data-policy-close]').forEach(button => button.onclick = closePolicy);
  dialog.addEventListener('cancel',event=>{event.preventDefault();closePolicy();});
  dialog.addEventListener('keydown', event => { if (event.key === 'Escape') event.stopPropagation(); });
  dialog.addEventListener('close', () => {
    if(dialog.open)return;
    cleanupPolicy();
  });
  function noticeWasRead() {
    try {
      const saved = JSON.parse(localStorage.getItem(NOTICE_KEY));
      return saved?.version === NOTICE_VERSION && Number(saved.expiresAt) > Date.now();
    } catch { return false; }
  }
  let noticeMotion=null;
  function setNoticeVisible(visible, animate=false) {
    if(noticeMotion){noticeMotion.cancel();noticeMotion=null;}
    if(!visible&&animate&&!banner.hidden&&typeof banner.animate==='function'&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
      accept.disabled=true;
      const motion=banner.animate([
        {opacity:1,transform:'translateX(-50%) translateY(0) scale(1)'},
        {opacity:0,transform:'translateX(-50%) translateY(18px) scale(.98)'}
      ],{duration:220,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});
      noticeMotion=motion;
      motion.finished.then(()=>{if(noticeMotion!==motion)return;noticeMotion=null;banner.hidden=true;document.body.classList.remove('cookie-notice-open');motion.cancel();accept.disabled=false;}).catch(()=>{});
      return;
    }
    accept.disabled=false;
    banner.hidden = !visible;
    document.body.classList.toggle('cookie-notice-open', visible);
  }
  accept.onclick = () => {
    try {
      localStorage.setItem(NOTICE_KEY, JSON.stringify({ version: NOTICE_VERSION, readAt: Date.now(), expiresAt: Date.now() + NOTICE_DURATION }));
    } catch { /* A confirmação funciona nesta página mesmo sem armazenamento disponível. */ }
    setNoticeVisible(false,true);
  };
  window.addEventListener('storage', event => {
    if (event.key === NOTICE_KEY || event.key === null) setNoticeVisible(!noticeWasRead());
  });
  const resize = new ResizeObserver(() => {
    if (!banner.hidden) document.documentElement.style.setProperty('--cookie-notice-height', `${banner.offsetHeight}px`);
  });
  resize.observe(banner);
  setNoticeVisible(!noticeWasRead());
}
