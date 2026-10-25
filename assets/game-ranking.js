const labels = {Quiz:'quiz', 'Memória':'memory', 'Campo minado':'mines', Termo:'word', PPT:'rps', Sudoku:'sudoku'};
const validGames = new Set(Object.values(labels));

export function initializeGameRanking({request, getUid, arena, heading}) {
  let activeRound = null, version = 0;
  const saving = new Set();

  function ensureRound(round) {
    if (round.account !== getUid()) return Promise.reject(new Error('Entre novamente na sua conta.'));
    if (round.token) return Promise.resolve(round.token);
    if (!round.promise) {
      round.promise = request('/games/rounds', {method:'POST', body:JSON.stringify({game:round.game})})
        .then(result => {
          if (round.account !== getUid()) throw new Error('A conta mudou durante a partida.');
          round.token = result.token;
          return result.token;
        }).catch(error => { round.promise = null; throw error; });
    }
    return round.promise;
  }

  function start(game) {
    version++;
    activeRound = validGames.has(game) && getUid() ? {game, account:getUid(), token:null, promise:null, awarded:false} : null;
    if (activeRound) ensureRound(activeRound).catch(() => {});
  }

  function score(label, points) {
    const round = activeRound;
    if (!round || round.account !== getUid() || round.game !== labels[label] || round.awarded) return;
    round.awarded = true;
    const status = document.createElement('p');status.className='game-save-status';status.setAttribute('role','status');arena.append(status);
    async function save() {
      if (round.account !== getUid()) return;
      status.replaceChildren(document.createTextNode('Salvando pontos no ranking…'));
      try {
        const token = await ensureRound(round);
        if (round.account !== getUid()) return;
        await request('/games/scores', {method:'POST', body:JSON.stringify({token, points})});
        if (round.account === getUid() && status.isConnected) status.textContent='Pontos salvos no ranking semanal.';
      } catch (error) {
        if (round.account !== getUid() || !status.isConnected) return;
        status.textContent='Não foi possível salvar os pontos. '+error.message+' ';
        const retry=document.createElement('button');retry.type='button';retry.className='btn';retry.textContent='Tentar novamente';
        retry.onclick=event=>{event.stopPropagation();track(save());};status.append(retry);
      }
    }
    track(save());
  }

  function track(promise) {
    saving.add(promise);promise.finally(()=>saving.delete(promise));
  }

  async function render() {
    const generation=++version, account=getUid();
    arena.innerHTML=heading('🏆','Ranking semanal','Compartilhado no Hub');
    const content=document.createElement('div');content.setAttribute('role','status');content.textContent='Carregando ranking…';arena.append(content);
    try {
      await Promise.allSettled([...saving]);
      if(generation!==version || account!==getUid())return;
      const result=await request('/games/ranking');
      if(generation!==version || account!==getUid())return;
      content.replaceChildren();
      const range=document.createElement('p');range.className='game-ranking-period';
      const date=value=>value.split('-').reverse().join('/');
      range.textContent=`${date(result.week)} a ${date(result.end)} · Segunda a domingo, horário de Brasília.`;content.append(range);
      if(!result.rows.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='Nenhuma pontuação nesta semana. Jogue para entrar no ranking!';content.append(empty);return;}
      const list=document.createElement('div');list.className='ranking-list';
      for(const item of result.rows){
        const row=document.createElement('div');row.className='ranking-row';
        if(item.uid===account)row.classList.add('is-current');
        const position=document.createElement('strong');position.textContent=item.position+'º';
        const name=document.createElement('span');name.textContent=item.name+(item.uid===account?' (você)':'');
        const total=document.createElement('span');total.className='game-score';total.textContent=item.total+' pts';
        row.append(position,name,total);list.append(row);
      }
      content.append(list);
      const refresh=document.createElement('button');refresh.type='button';refresh.className='btn';refresh.textContent='Atualizar ranking';refresh.onclick=()=>render();content.append(refresh);
    } catch(error) {
      if(generation!==version || account!==getUid())return;
      content.textContent='Não foi possível carregar o ranking. ';
      const retry=document.createElement('button');retry.type='button';retry.className='btn';retry.textContent='Tentar novamente';retry.onclick=()=>render();content.append(retry);
    }
  }

  return {start, score, render, clear(){version++;activeRound=null;saving.clear();}};
}
