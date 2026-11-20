/* =========================================================
 * UI_TABS — ホーム・団員・育成・記録の4タブ（スクロールしない階層型の固定画面）
 *
 *   上部：共通ステータス（資金・評判・団員数・演奏会の段階）
 *   見出し：左上に戻るボタン／いまの階層
 *   中央：その階層の内容だけを表示（多いものはカテゴリー分け・ページ分割）
 *   下部：操作ボタン・ページ送り ＋ 既存の5タブメニュー
 *
 *   各タブの階層はタブごとに保持し、別タブへ移動して戻っても同じ画面から再開する。
 *   ゲームの処理はすべて既存の logic.js の関数を呼ぶだけで、計算・データ構造は変えない。
 *   ※ 演奏会タブ（ui3d.js）には一切関与しない。
 * ========================================================= */

/* ---------- 画面の階層（タブごとのスタック） ---------- */
const TAB_ROOT = { home: 'hRoot', members: 'mRoot', train: 'tRoot', records: 'rRoot' };
function tstack(tab = UI.tab) {
  UI.tnav = UI.tnav || {};
  if (!UI.tnav[tab] || !UI.tnav[tab].length) UI.tnav[tab] = [{ s: TAB_ROOT[tab] }];
  return UI.tnav[tab];
}
const ttop = (tab = UI.tab) => { const st = tstack(tab); return st[st.length - 1]; };
function tpush(scr, tab = UI.tab) { tstack(tab).push(scr); }
function tpop(tab = UI.tab) { const st = tstack(tab); if (st.length > 1) st.pop(); }
function tset(patch) { Object.assign(ttop(), patch); }
// 別タブの特定の画面へ移動（ホームのお知らせ・団員詳細の「育成する」など）
function tjump(tab, path) { UI.tnav = UI.tnav || {}; UI.tnav[tab] = [{ s: TAB_ROOT[tab] }, ...path]; UI.tab = tab; }

/* ---------- 画面サイズ（ページ分割の件数を決める） ---------- */
let SAFE = null;
function safeInsets() {
  if (SAFE) return SAFE;
  try {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
    document.body.appendChild(d);
    const cs = getComputedStyle(d); SAFE = { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 };
    d.remove();
  } catch (e) { SAFE = { top: 0, bottom: 0 }; }
  return SAFE;
}
const TV = { sbar: 58, head: 50, foot: 64, nav: 65, pad: 24 };
function tvBodyH(hasFoot = true) {
  const s = safeInsets();
  return (window.innerHeight || 780) - s.top - s.bottom - TV.sbar - TV.head - TV.nav - (hasFoot ? TV.foot : 0) - TV.pad;
}
// 1ページの行数：本文の高さから、その画面固有の上部要素（extra）を引いて行の高さで割る
function tvPer(rowH, extra = 0, hasFoot = true) { return Math.max(1, Math.floor((tvBodyH(hasFoot) - extra + 8) / (rowH + 8))); }
function tvPage(list, page, per) {
  const pages = Math.max(1, Math.ceil(list.length / per)), p = clamp(page || 0, 0, pages - 1);
  return { items: list.slice(p * per, p * per + per), page: p, pages, total: list.length };
}
const tvPager = pg => pg.pages > 1 ? `<div class="tpager"><button data-act="tpage" data-d="-1" ${pg.page <= 0 ? 'disabled' : ''} aria-label="前のページ">‹ 前へ</button><span>${pg.page + 1} / ${pg.pages}</span><button data-act="tpage" data-d="1" ${pg.page >= pg.pages - 1 ? 'disabled' : ''} aria-label="次のページ">次へ ›</button></div>` : '';
const tvTabs = (list, cur) => `<div class="tsub">${list.map(([id, n]) => `<button class="${cur === id ? 'on' : ''}" data-act="tsub" data-v="${id}">${n}</button>`).join('')}</div>`;
const tvRow = (act, attrs, main, sub, right = '', cls = '') => `<button class="trow ${cls}" data-act="${act}" ${attrs}><span class="tr-m"><span class="tr-t">${main}</span>${sub ? `<span class="tr-s">${sub}</span>` : ''}</span>${right}<span class="chev">›</span></button>`;
const tvGo = (v, extra = '') => `data-v="${v}" ${extra}`;
const kv = (k, v, cls = '') => `<div class="tkv"><span>${k}</span><span class="${cls}">${v}</span></div>`;
const spark = m => `<span class="spark" aria-hidden="true">${ABILITIES.map(a => `<i style="height:${Math.max(2, m.abilities[a.id] / 100 * 22)}px"></i>`).join('')}</span>`;

/* ---------- 共通レイアウト ---------- */
function renderTabsUI(c) {
  const scr = ttop();
  const def = TSCREENS[scr.s] || TSCREENS[TAB_ROOT[UI.tab]];
  const out = def(c, scr);
  const canBack = tstack().length > 1;
  const sh = UI.showing && c.result;
  const funds = sh ? STATE.funds - c.result.settlement.net : STATE.funds, rep = sh ? c.result.repBefore : STATE.reputation;
  const phase = sh ? '本番' : phaseName(c.phase);
  return `<div class="tv">
    <header class="sbar">
      <div class="sb-name">${esc(STATE.orchestraName)}</div>
      <div class="sb-stats">
        <span class="sb-c wide"><small>資金</small><b class="${funds < 0 ? 'neg' : ''}">${yen(funds)}</b></span>
        <span class="sb-c"><small>評判</small><b>${Math.round(rep)}</b></span>
        <span class="sb-c"><small>団員</small><b>${STATE.members.length}<i>名</i></b></span>
        <span class="sb-c"><small>第${c.number}回</small><b>${phase}</b></span>
      </div>
    </header>
    <div class="thead">${canBack ? '<button class="tback" data-act="tback" aria-label="戻る">‹ 戻る</button>' : '<span class="tback ph"></span>'}
      <div class="ttitle">${out.parent ? `<small>${out.parent}</small>` : ''}<b>${out.title}</b></div>${out.badge || ''}</div>
    <div class="tbody ${out.foot ? '' : 'nofoot'}">${out.body}</div>
    ${out.foot ? `<div class="tfoot">${out.foot}</div>` : ''}
  </div>`;
}

/* ---------- 補助 ---------- */
const GROUPS = [
  { id: 'str', name: '弦楽器', secs: ['hs', 'ls'] },
  { id: 'ww', name: '木管楽器', secs: ['ww'] },
  { id: 'br', name: '金管楽器', secs: ['br'] },
  { id: 'pc', name: '打楽器', secs: ['pc'] },
];
const groupInsts = g => GROUPS.find(x => x.id === g).secs.flatMap(s => SEC[s].insts);
const groupMembers = g => STATE.members.filter(m => groupInsts(g).includes(m.inst));
const sortMembers = ms => ms.slice().sort((a, b) => (isPrincipal(b) - isPrincipal(a)) || (memberAvg(b) - memberAvg(a)));
const condById = id => (STATE.conductors || []).find(x => x.id === id);
function pastConcerts() { return STATE.concertOrder.map(id => STATE.concertPrograms[id]).filter(x => x.result).reverse(); }
const ledgerSum = l => l.reduce((s, x) => s + x.amount, 0);

/* ---------- お知らせ（現在の状況から自動生成） ---------- */
function notices(c) {
  const out = [];
  const add = (level, text, tab, path) => out.push({ level, text, tab, path });
  if (c.phase === 'setup') {
    const st = setupStatus(c);
    if (!c.started) add('go', `${c.title}の準備を始めましょう`, 'concert');
    else { const left = [!st.song && '選曲', !st.hall && '会場の予約', !st.conductor && '指揮者の選択'].filter(Boolean); add(left.length ? 'go' : 'ok', left.length ? `準備が残っています：${left.join('・')}` : '準備が整いました。練習期間へ進めます', 'concert'); }
  }
  if (c.phase === 'practice') add('go', `練習期間です（${c.practiceDone}/${CONFIG.practiceCount}回 完了）`, 'concert');
  if (c.phase === 'prep') add('go', `本番の準備ができています（成功確率 ${Math.round(successInfo(c).prob * 100)}%）`, 'concert');
  if (c.phase === 'result') add('ok', `${c.title}の結果が出ています（評価 ${c.result.rank}）`, 'concert');
  if (c.songId) { const sh = shortageOf(findSong(c.songId)); if (sh.items.length) add('warn', `今回の曲で編成が不足：${sh.items.map(i => `${INST[i.inst].abbr} ${i.lack}名`).join('、')}`, 'members', [{ s: 'recruit' }, { s: 'recMembers' }]); }
  if (STATE.funds < 50000) add('warn', `資金が少なくなっています（${yen(STATE.funds)}）`, 'home', [{ s: 'hFinance' }]);
  const open = STATE.recruit.candidates.filter(x => !STATE.recruit.hired.includes(x.id)).length;
  if (open) add('info', `団員の募集候補が${open}名います`, 'members', [{ s: 'recruit' }, { s: 'recMembers' }]);
  const oc = STATE.recruit.candidates.filter(x => x.original && !STATE.recruit.hired.includes(x.id));
  if (oc.length) add('info', `注目の候補：${oc.map(x => x.name).join('、')}（オリジナル）`, 'members', [{ s: 'recruit' }, { s: 'recMembers' }]);
  if (STATE.conductors.length < CONFIG.conductor.maxHired) add('info', `指揮者候補が${STATE.conductorMarket.candidates.filter(x => !STATE.conductorMarket.hired.includes(x.id)).length}名います（契約 ${STATE.conductors.length}/${CONFIG.conductor.maxHired}名）`, 'members', [{ s: 'recruit' }, { s: 'recConds' }]);
  if (c.phase !== 'result' && c.phase !== 'done' && !c.trainingLog.length) add('info', '今回の演奏会ではまだ育成をしていません', 'train');
  const last = pastConcerts()[0];
  if (last && last !== c) add('ok', `前回：${last.title} 評価 ${last.result.rank}・収支 ${yenS(last.result.settlement.net)}`, 'records', [{ s: 'rConcerts' }, { s: 'rConcert', id: last.id }]);
  return out;
}
const NOTE_ICON = { go: '▶', warn: '！', info: 'ｉ', ok: '✓' };

/* ---------- 各画面 ---------- */
const TSCREENS = {
  /* ===== ホーム ===== */
  hRoot(c) {
    const [t, b] = nextActionText(c);
    const last = pastConcerts()[0], cd = activeConductor(), song = c.songId && findSong(c.songId);
    const ranks = {}; STATE.members.forEach(m => { const r = memberRank(m); ranks[r] = (ranks[r] || 0) + 1; });
    const nts = notices(c);
    const tile = (v, label, val, sub, cls = '') => `<button class="ttile ${cls}" data-act="tgo" ${tvGo(v)}><span class="tt-l">${label}</span><b>${val}</b><span class="tt-s">${sub}</span></button>`;
    return {
      title: 'ホーム',
      body: `<div class="tnext"><div class="tn-l">次にやること</div><div class="tn-t">${esc(c.title)}・${phaseName(c.phase)}</div><div class="tn-s">${t}</div>
          <button class="tbtn pri" data-act="tab" data-tab="concert">${b}</button></div>
        <div class="tgrid">
          ${tile('hFinance', '財務', yen(STATE.funds), last ? `前回 ${yenS(last.result.settlement.net)}` : 'まだ本番なし', STATE.funds < 50000 ? 'warn' : '')}
          ${tile('hOrch', '楽団の状況', `${STATE.members.length}名`, `平均能力 ${Math.round(mean(STATE.members.map(memberAvg)))}・評判 ${Math.round(STATE.reputation)}`)}
          ${tile('hPlan', '演奏会の予定', song ? esc(song.title) : '曲目未定', `${phaseName(c.phase)}${c.phase === 'practice' ? ` ${c.practiceDone}/${CONFIG.practiceCount}` : ''}`)}
          ${tile('hNotice', 'お知らせ', `${nts.length}件`, nts[0] ? esc(nts[0].text) : 'なし', nts.some(n => n.level === 'warn') ? 'warn' : '')}
          ${tile('hRecent', '最近の演奏会', last ? `評価 ${last.result.rank}` : '—', last ? esc(last.title) : 'まだ開催していません')}
          ${tile('hCond', '担当指揮者', cd ? esc(cd.name) : '—', cd ? `${traitOf(cd).name}・契約 ${STATE.conductors.length}/${CONFIG.conductor.maxHired}` : '')}
        </div>`,
    };
  },
  hFinance(c) {
    const past = pastConcerts(), net = past.reduce((s, x) => s + x.result.settlement.net, 0);
    const recruit = ledgerSum(STATE.ledger), cur = ledgerSum(c.ledger), fee = conductorFee(activeConductor());
    return {
      parent: 'ホーム', title: '財務状況',
      body: `<div class="tbig"><small>現在の資金</small><b class="${STATE.funds < 0 ? 'neg' : ''}">${yen(STATE.funds)}</b></div>
        ${kv('前回の本番収支', past[0] ? yenS(past[0].result.settlement.net) : '—', past[0] && past[0].result.settlement.net < 0 ? 'neg' : 'pos')}
        ${kv('本番収支の通算', `${yenS(net)}（${past.length}回）`, net < 0 ? 'neg' : 'pos')}
        ${kv('今回の演奏会の収支', yenS(cur), cur < 0 ? 'neg' : 'pos')}
        ${kv('募集・契約の支出累計', yenS(recruit), recruit < 0 ? 'neg' : '')}
        ${kv('本番ごとの運営費', `${yen(operatingCost())}（団員${STATE.members.length}名）`)}
        ${kv('指揮者の出演料', fee ? `${yen(fee)}/回` : '無償（常任）')}`,
      foot: `<button class="tbtn" data-act="tjump" data-tab="records" data-path="rFinance">財務記録を見る</button>`,
    };
  },
  hOrch(c) {
    const ranks = {}; STATE.members.forEach(m => { const r = memberRank(m); ranks[r] = (ranks[r] || 0) + 1; });
    return {
      parent: 'ホーム', title: '楽団の状況',
      body: `<div class="tranks">${['S', 'A', 'B', 'C', 'D', 'E'].map(r => `<span>${badge(r)}<b>${ranks[r] || 0}</b></span>`).join('')}</div>
        ${SECTIONS.map(s => { const ms = membersOfSection(s.id), v = mean(ms.map(memberAvg)); return `<div class="stat"><span>${s.name}<small class="muted"> ${ms.length}名</small></span>${bar(v)}<span class="v">${Math.round(v)}</span></div>`; }).join('')}
        <div class="tnote">数値はセクション団員の平均能力。首席 ${Object.keys(STATE.principals || {}).length}名・評判 ${Math.round(STATE.reputation)}/100</div>`,
      foot: `<button class="tbtn" data-act="tab" data-tab="members">団員タブへ</button><button class="tbtn" data-act="tab" data-tab="train">育成タブへ</button>`,
    };
  },
  hPlan(c) {
    const song = c.songId && findSong(c.songId), hall = c.hallId && findHall(c.hallId), cd = activeConductor();
    const prob = (c.phase === 'practice' || c.phase === 'prep') ? `${Math.round(successInfo(c).prob * 100)}%` : '—';
    return {
      parent: 'ホーム', title: '演奏会の予定',
      body: `<div class="tbig"><small>${esc(c.title)}</small><b>${phaseName(c.phase)}</b></div>
        ${kv('曲目', song ? `${esc(song.title)}<br><small class="muted">${esc(song.composer)}・${difficultyLabel(song.difficulty)}・約${song.duration}分</small>` : '未定')}
        ${kv('会場', hall ? `${esc(hall.name)}（${hall.capacity.toLocaleString()}席）` : '未予約')}
        ${kv('指揮者', cd ? `${esc(cd.name)}（${traitOf(cd).name}）` : '未定')}
        ${kv('練習', `${c.practiceDone} / ${CONFIG.practiceCount}回`)}
        ${kv('現在の成功確率', prob)}`,
      foot: `<button class="tbtn pri" data-act="tab" data-tab="concert">演奏会タブへ</button>`,
    };
  },
  hNotice(c, scr) {
    const nts = notices(c), pg = tvPage(nts, scr.page, tvPer(58));
    return {
      parent: 'ホーム', title: 'お知らせ', badge: `<span class="tbadge">${nts.length}件</span>`,
      body: pg.items.map((n, i) => `<button class="trow note ${n.level}" data-act="tnote" data-i="${pg.page * tvPer(58) + i}"><span class="ni">${NOTE_ICON[n.level]}</span><span class="tr-m"><span class="tr-t wrap">${esc(n.text)}</span></span><span class="chev">›</span></button>`).join('') || '<div class="tempty">お知らせはありません</div>',
      foot: tvPager(pg),
    };
  },
  hRecent(c, scr) {
    const list = pastConcerts(), pg = tvPage(list, scr.page, tvPer(58));
    return {
      parent: 'ホーム', title: '最近の演奏会',
      body: pg.items.map(x => tvRow('tjump', `data-tab="records" data-path="rConcerts,rConcert" data-id="${x.id}"`, esc(x.title), esc(findSong(x.songId).title), `${badge(x.result.rank)}<span class="tr-r ${x.result.settlement.net < 0 ? 'neg' : 'pos'}">${yenS(x.result.settlement.net)}</span>`)).join('') || '<div class="tempty">まだ演奏会は開催されていません</div>',
      foot: tvPager(pg),
    };
  },
  hCond(c) {
    const cd = activeConductor();
    return {
      parent: 'ホーム', title: '担当指揮者',
      body: cd ? `<div class="tbig"><small>${traitOf(cd).name}</small><b>${esc(cd.name)}</b></div>${CONDUCTOR_ABILITIES.map(a => stat(a.name, cd.abilities[a.id], cd.potential[a.id], 'wine')).join('')}<div class="tnote">${esc(traitOf(cd).desc)}</div>` : '<div class="tempty">指揮者がいません</div>',
      foot: cd ? `<button class="tbtn" data-act="tjump" data-tab="members" data-path="mConds,mCond" data-id="${cd.id}">指揮者の管理へ</button>` : '',
    };
  },

  /* ===== 団員 ===== */
  mRoot(c) {
    const g = id => { const ms = groupMembers(id); return `<button class="tcat" data-act="tgo" ${tvGo('mGroup', `data-g="${id}"`)}><b>${GROUPS.find(x => x.id === id).name}</b><span>${ms.length}名・平均 ${Math.round(mean(ms.map(memberAvg)) || 0)}</span></button>`; };
    const open = STATE.recruit.candidates.filter(x => !STATE.recruit.hired.includes(x.id)).length;
    return {
      title: '団員',
      body: `<div class="tlabel">所属メンバー</div>
        <div class="tgrid">${g('str')}${g('ww')}${g('br')}${g('pc')}</div>
        <button class="tcat wide" data-act="tgo" ${tvGo('mConds')}><b>指揮者</b><span>契約 ${STATE.conductors.length}/${CONFIG.conductor.maxHired}名・担当 ${esc(activeConductor()?.name || '—')}</span></button>
        <div class="tlabel">人材募集</div>
        <button class="trecruit" data-act="tgo" ${tvGo('recruit')}><b>人材募集</b><span>団員候補 ${open}名・指揮者候補 ${STATE.conductorMarket.candidates.filter(x => !STATE.conductorMarket.hired.includes(x.id)).length}名</span></button>`,
    };
  },
  mGroup(c, scr) {
    const have = countByInst();
    return {
      parent: '団員', title: GROUPS.find(x => x.id === scr.g).name,
      body: `<div class="tnote">楽器を選んでください</div>` + groupInsts(scr.g).map(i => { const p = principalOf(i); return tvRow('tgo', tvGo('mInst', `data-inst="${i}"`), `${INST_NAME[i]} <small class="muted">${INST[i].abbr}</small>`, `首席：${p ? esc(p.name) : 'なし'}`, `<span class="tr-r">${have[i]}<small>/${INST[i].cap}名</small></span>`); }).join(''),
    };
  },
  mInst(c, scr) {
    const ms = sortMembers(STATE.members.filter(m => m.inst === scr.inst)), pg = tvPage(ms, scr.page, tvPer(56, innerWidth < 400 ? 44 : 26));
    return {
      parent: GROUPS.find(g => groupInsts(g.id).includes(scr.inst)).name, title: INST_NAME[scr.inst], badge: `<span class="tbadge">${ms.length}/${INST[scr.inst].cap}名</span>`,
      body: `<div class="tnote">右の小さなグラフは 技術・音感・リズム・音色・強弱・表現・協調</div>` + (pg.items.map(m => `<button class="trow" data-act="tgo" ${tvGo('mMember', `data-id="${m.id}"`)}>${badge(memberRank(m))}<span class="tr-m"><span class="tr-t">${esc(m.name)}${isPrincipal(m) ? ' <span class="tag gold">首席</span>' : ''}${m.original ? ' <span class="oc">★</span>' : ''}</span><span class="tr-s">平均 ${Math.round(memberAvg(m))}・潜在 ${Math.round(memberPotAvg(m))}</span></span>${spark(m)}<span class="chev">›</span></button>`).join('') || '<div class="tempty">在籍している団員はいません</div>'),
      foot: (tvPager(pg) || `<button class="tbtn" data-act="tjump" data-tab="members" data-path="recruit,recMembers">団員を募集する</button>`) + (ms.length > 1 ? `<button class="tbtn" data-act="tPrinPick" data-inst="${scr.inst}">首席を選ぶ</button>` : ''),
    };
  },
  // 首席の任命：同じ楽器の団員から、能力に関係なく誰でも選べる
  mPrincipal(c, scr) {
    const ms = sortMembers(STATE.members.filter(m => m.inst === scr.inst)), cur = principalOf(scr.inst), pg = tvPage(ms, scr.page, tvPer(56, innerWidth < 400 ? 44 : 26));
    return {
      parent: INST_NAME[scr.inst], title: '首席を選ぶ', badge: `<span class="tbadge">現在：${cur ? esc(cur.name) : 'なし'}</span>`,
      body: `<div class="tnote">任命したい団員を選んでください。能力に関係なく誰でも首席にできます（前の首席は通常団員に戻ります）。</div>` +
        pg.items.map(m => `<button class="trow ${isPrincipal(m) ? 'sel' : ''}" data-act="tPrincipal" data-id="${m.id}" data-inst="${scr.inst}" ${isPrincipal(m) ? 'disabled' : ''}>${badge(memberRank(m))}<span class="tr-m"><span class="tr-t">${esc(m.name)}${isPrincipal(m) ? ' <span class="tag gold">首席</span>' : ''}</span><span class="tr-s">平均 ${Math.round(memberAvg(m))}・協調 ${m.abilities.coop}・表現 ${m.abilities.expr}</span></span><span class="tr-r">${isPrincipal(m) ? '任命中' : '任命'}</span></button>`).join(''),
      foot: tvPager(pg) || '',
    };
  },
  mMember(c, scr) {
    const m = memberById(scr.id);
    if (!m) return { parent: '団員', title: '団員', body: '<div class="tempty">この団員は在籍していません</div>' };
    const tab = scr.tab || 'abil', g = c.growth[m.id] || {};
    const body = tab === 'abil'
      ? `<div class="tmhead">${badge(memberRank(m))}<b>${esc(m.name)}</b><span class="muted">${INST[m.inst].abbr}</span></div>
         ${ABILITIES.map(a => stat(a.name + (g[a.id] ? ` <span class="delta">+${g[a.id]}</span>` : ''), m.abilities[a.id], m.potential[a.id])).join('')}
         <div class="tnote">明るい部分が現在値、淡い部分が潜在能力（育成の上限）。平均 ${round1(memberAvg(m))}／潜在 ${round1(memberPotAvg(m))}</div>`
      : `${kv('楽器', `${INST_NAME[m.inst]}（${SEC[INST[m.inst].section].name}セクション）`)}
         ${kv('在籍', m.joined ? `第${m.joined}回の頃から` : '創設メンバー')}
         ${kv('楽器のグレード', CONFIG.instrumentGrades[m.instrumentGrade || 0].name)}
         ${kv('首席', isPrincipal(m) ? `<span class="tag gold">${INST[m.inst].abbr} 首席奏者</span>` : `現在の首席：${esc(principalOf(m.inst)?.name || 'なし')}`)}
         ${m.profile ? `<div class="tnote">${esc(m.profile)}</div>` : ''}`;
    return {
      parent: INST_NAME[m.inst], title: esc(m.name),
      body: tvTabs([['abil', '能力'], ['info', 'プロフィール・管理']], tab) + body,
      foot: tab === 'abil' ? `<button class="tbtn pri" data-act="tTrainMember" data-id="${m.id}">この団員を育成</button>`
        : `${isPrincipal(m) ? '' : `<button class="tbtn" data-act="tPrincipal" data-id="${m.id}">首席に任命</button>`}<button class="tbtn" data-act="tgo" ${tvGo('mDismiss', `data-id="${m.id}"`)}>退団させる</button>`,
    };
  },
  mDismiss(c, scr) {
    const m = memberById(scr.id);
    const why = m && dismissBlockReason(m);
    if (why) return {
      parent: esc(m.name), title: '退団の確認',
      body: `<div class="tconfirm"><b>${esc(m.name)}</b> は ${INST_NAME[m.inst]} の<span class="tag gold">首席</span>です。</div><div class="treason">${esc(why)}</div>`,
      foot: `<button class="tbtn" data-act="tback">戻る</button><button class="tbtn pri" data-act="tPrinPick" data-inst="${m.inst}">首席を選び直す</button>`,
    };
    return {
      parent: m ? esc(m.name) : '', title: '退団の確認',
      body: m ? `<div class="tconfirm"><b>${esc(m.name)}</b>（${INST[m.inst].abbr}）を退団させますか？<br>元に戻せません。${isPrincipal(m) ? '<br>この楽器の団員は1名だけのため、首席奏者のまま退団します。' : ''}</div>` : '<div class="tempty">対象がいません</div>',
      foot: m ? `<button class="tbtn" data-act="tback">やめる</button><button class="tbtn pri" data-act="tDismiss" data-id="${m.id}">退団させる</button>` : '',
    };
  },
  mConds(c) {
    return {
      parent: '団員', title: '所属指揮者', badge: `<span class="tbadge">${STATE.conductors.length}/${CONFIG.conductor.maxHired}名</span>`,
      body: STATE.conductors.map(cd => `<button class="trow" data-act="tgo" ${tvGo('mCond', `data-id="${cd.id}"`)}>${badge(condRank(cd))}<span class="tr-m"><span class="tr-t">${esc(cd.name)}${STATE.conductorId === cd.id || c.conductorId === cd.id ? ' <span class="tag ok">担当</span>' : ''}</span><span class="tr-s">${traitOf(cd).name}・${CONDUCTOR_ABILITIES.map(a => `${a.short}${cd.abilities[a.id]}`).join(' ')}</span></span><span class="chev">›</span></button>`).join('') || '<div class="tempty">契約中の指揮者がいません</div>',
      foot: `<button class="tbtn" data-act="tjump" data-tab="members" data-path="recruit,recConds">指揮者を募集する</button>`,
    };
  },
  mCond(c, scr) {
    const cd = condById(scr.id);
    if (!cd) return { parent: '所属指揮者', title: '指揮者', body: '<div class="tempty">この指揮者とは契約していません</div>' };
    const tab = scr.tab || 'abil', tr = traitOf(cd), isActive = STATE.conductorId === cd.id;
    const dr = dismissConductorBlockReason(cd.id);
    const body = tab === 'abil'
      ? `<div class="tmhead">${badge(condRank(cd))}<b>${esc(cd.name)}</b>${isActive ? '<span class="tag ok">担当中</span>' : ''}</div>${CONDUCTOR_ABILITIES.map(a => stat(a.name, cd.abilities[a.id], cd.potential[a.id], 'wine')).join('')}
         <div class="tnote">${CONDUCTOR_ABILITIES.map(a => `${a.short}：${a.desc}`).slice(0, 2).join('／')}</div>`
      : `${kv('個性', `${tr.name}`)}<div class="tnote">${esc(tr.desc)}</div>
         ${kv('得意な方針', tr.policy ? CONFIG.policies[tr.policy].name : `なし（全体合奏の効果 ×${tr.practice || 1}）`)}
         ${kv('出演料', conductorFee(cd) ? `${yen(conductorFee(cd))}/回` : '無償（常任）')}
         ${kv('指揮した演奏会', `${cd.concerts || 0}回`)}
         ${cd.profile ? `<div class="tnote">${esc(cd.profile)}</div>` : ''}
         ${dr && !isActive ? `<div class="treason">契約解除不可：${esc(dr)}</div>` : ''}`;
    return {
      parent: '所属指揮者', title: esc(cd.name),
      body: tvTabs([['abil', '能力'], ['info', '個性・管理']], tab) + body,
      foot: tab === 'abil' ? `<button class="tbtn pri" data-act="tTrainCond" data-id="${cd.id}">この指揮者を育成</button>`
        : `${isActive ? '<button class="tbtn" disabled>担当中</button>' : `<button class="tbtn pri" data-act="tCondSet" data-id="${cd.id}">担当にする</button>`}<button class="tbtn" data-act="tgo" ${tvGo('mCondFire', `data-id="${cd.id}"`)} ${dr ? 'disabled' : ''}>契約解除</button>`,
    };
  },
  mCondFire(c, scr) {
    const cd = condById(scr.id);
    return {
      parent: cd ? esc(cd.name) : '', title: '契約解除の確認',
      body: cd ? `<div class="tconfirm"><b>${esc(cd.name)}</b>との契約を解除しますか？<br>契約金は戻らず、元に戻せません。</div>` : '<div class="tempty">対象がいません</div>',
      foot: cd ? `<button class="tbtn" data-act="tback">やめる</button><button class="tbtn pri" data-act="tCondFire" data-id="${cd.id}">契約を解除する</button>` : '',
    };
  },
  recruit(c) {
    const open = STATE.recruit.candidates.filter(x => !STATE.recruit.hired.includes(x.id)).length;
    const oc = STATE.conductorMarket.candidates.filter(x => !STATE.conductorMarket.hired.includes(x.id)).length;
    return {
      parent: '団員', title: '人材募集',
      body: `<div class="tnote">募集は演奏会の進行に関係なく、いつでも行えます。</div>
        <button class="tbigchoice" data-act="tgo" ${tvGo('recMembers')}><b>団員を募集</b><span>候補者 ${open}名・採用費は ${yen(Math.min(...STATE.recruit.candidates.map(x => x.cost)))}〜</span></button>
        <button class="tbigchoice" data-act="tgo" ${tvGo('recConds')}><b>指揮者を募集</b><span>候補者 ${oc}名・契約 ${STATE.conductors.length}/${CONFIG.conductor.maxHired}名</span></button>
        <div class="tnote">新しい演奏会が始まると、候補者は無料で入れ替わります。</div>`,
    };
  },
  recMembers(c, scr) {
    const cs = STATE.recruit.candidates, pg = tvPage(cs, scr.page, tvPer(56, 52));
    return {
      parent: '人材募集', title: '団員を募集', badge: `<span class="tbadge">${yen(STATE.funds)}</span>`,
      body: `<div class="tpair"><button class="tbtn sm" data-act="tgo" ${tvGo('recForm')}>現在の編成</button><button class="tbtn sm" data-act="tgo" ${tvGo('recCompare')}>候補を比較</button></div>` +
        pg.items.map(m => { const hired = STATE.recruit.hired.includes(m.id), why = hireBlockReason(m); return `<button class="trow ${hired ? 'done' : ''}" data-act="tgo" ${tvGo('recCand', `data-id="${m.id}"`)}>${badge(memberRank(m))}<span class="tr-m"><span class="tr-t">${esc(m.name)}${m.original ? ' <span class="tag gold">オリジナル</span>' : ''}</span><span class="tr-s">${INST[m.inst].abbr}・平均${Math.round(memberAvg(m))}／潜在${Math.round(memberPotAvg(m))}${!hired && why ? '・採用不可' : ''}</span></span><span class="tr-r">${hired ? '採用済' : yen(m.cost)}</span><span class="chev">›</span></button>`; }).join(''),
      foot: `${tvPager(pg)}<button class="tbtn" data-act="tReroll" ${STATE.funds < CONFIG.rerollRecruitCost ? 'disabled' : ''}>再募集 ${yen(CONFIG.rerollRecruitCost)}</button>`,
    };
  },
  recCand(c, scr) {
    const m = STATE.recruit.candidates.find(x => x.id === scr.id);
    if (!m) return { parent: '団員を募集', title: '候補者', body: '<div class="tempty">候補者が入れ替わりました</div>' };
    const hired = STATE.recruit.hired.includes(m.id), why = hireBlockReason(m), tab = scr.tab || 'abil';
    const body = tab === 'abil'
      ? `<div class="tmhead">${badge(memberRank(m))}<b>${esc(m.name)}</b><span class="muted">${INST_NAME[m.inst]}</span></div>${ABILITIES.map(a => stat(a.name, m.abilities[a.id], m.potential[a.id])).join('')}`
      : `${kv('楽器', `${INST_NAME[m.inst]}（${SEC[INST[m.inst].section].name}）`)}${kv('在籍数', `${countByInst()[m.inst]} / ${INST[m.inst].cap}名`)}${kv('平均／潜在', `${Math.round(memberAvg(m))} ／ ${Math.round(memberPotAvg(m))}`)}${kv('採用費', yen(m.cost))}${m.profile ? `<div class="tnote">${esc(m.profile)}</div>` : ''}`;
    return {
      parent: '団員を募集', title: esc(m.name),
      body: tvTabs([['abil', '能力'], ['info', '詳細']], tab) + body + (!hired && why ? `<div class="treason">採用できません：${esc(why)}</div>` : ''),
      foot: hired ? '<button class="tbtn" disabled>採用済み</button>' : `<button class="tbtn pri" data-act="tHire" data-id="${m.id}" ${why ? 'disabled' : ''}>採用する ${yen(m.cost)}</button>`,
    };
  },
  recForm(c) {
    const have = countByInst();
    return {
      parent: '団員を募集', title: '現在の編成',
      body: `<div class="tnote">在籍 / 上限</div><div class="capgrid">${INSTRUMENTS.map(i => `<div class="${have[i.id] >= i.cap ? 'full' : ''}">${i.abbr}<b>${have[i.id]}<small class="muted">/${i.cap}</small></b></div>`).join('')}</div>
        <div class="tnote">上限に達した楽器の候補者は採用できません。団員が増えると本番ごとの運営費（${yen(CONFIG.economy.operatingPerMember)}/名）も増えます。</div>`,
    };
  },
  recCompare(c) {
    const cs = STATE.recruit.candidates, best = id => Math.max(...cs.map(m => m.abilities[id]));
    return {
      parent: '団員を募集', title: '候補を比較',
      body: `<table class="cmp"><thead><tr><th></th>${cs.map(m => `<th>${esc(m.name.split(' ')[0])}</th>`).join('')}</tr></thead><tbody>
        <tr><td class="l">楽器</td>${cs.map(m => `<td>${INST[m.inst].abbr}</td>`).join('')}</tr>
        <tr><td class="l">ランク</td>${cs.map(m => `<td>${memberRank(m)}</td>`).join('')}</tr>
        ${ABILITIES.map(a => `<tr><td class="l">${a.short}</td>${cs.map(m => `<td class="${m.abilities[a.id] === best(a.id) ? 'best' : ''}">${m.abilities[a.id]}<small>/${m.potential[a.id]}</small></td>`).join('')}</tr>`).join('')}
        <tr><td class="l">費用</td>${cs.map(m => `<td>${Math.round(m.cost / 1000)}k</td>`).join('')}</tr></tbody></table>
        <div class="tnote">数字は 現在値/潜在能力。黄色は候補内で最も高い値。</div>`,
    };
  },
  recConds(c, scr) {
    const M = STATE.conductorMarket, pg = tvPage(M.candidates, scr.page, tvPer(56, 26));
    return {
      parent: '人材募集', title: '指揮者を募集', badge: `<span class="tbadge">契約 ${STATE.conductors.length}/${CONFIG.conductor.maxHired}</span>`,
      body: `<div class="tnote">契約できる指揮者は${CONFIG.conductor.maxHired}名まで。採用した指揮者は1回ごとに出演料がかかります。</div>` +
        pg.items.map(cd => { const done = M.hired.includes(cd.id), why = conductorHireBlockReason(cd); return `<button class="trow ${done ? 'done' : ''}" data-act="tgo" ${tvGo('recCond', `data-id="${cd.id}"`)}>${badge(condRank(cd))}<span class="tr-m"><span class="tr-t">${esc(cd.name)}${cd.original ? ' <span class="tag gold">オリジナル</span>' : ''}</span><span class="tr-s">${traitOf(cd).name}${!done && why ? '・契約不可' : ''}</span></span><span class="tr-r">${done ? '契約済' : yen(cd.cost)}</span><span class="chev">›</span></button>`; }).join(''),
      foot: `${tvPager(pg)}<button class="tbtn" data-act="tCondReroll" ${STATE.funds < CONFIG.conductor.rerollCost ? 'disabled' : ''}>再調査 ${yen(CONFIG.conductor.rerollCost)}</button>`,
    };
  },
  recCond(c, scr) {
    const cd = STATE.conductorMarket.candidates.find(x => x.id === scr.id);
    if (!cd) return { parent: '指揮者を募集', title: '候補者', body: '<div class="tempty">候補者が入れ替わりました</div>' };
    const done = STATE.conductorMarket.hired.includes(cd.id), why = conductorHireBlockReason(cd), tab = scr.tab || 'abil', tr = traitOf(cd);
    const body = tab === 'abil'
      ? `<div class="tmhead">${badge(condRank(cd))}<b>${esc(cd.name)}</b><span class="muted">${tr.name}</span></div>${CONDUCTOR_ABILITIES.map(a => stat(a.name, cd.abilities[a.id], cd.potential[a.id], 'wine')).join('')}`
      : `<div class="tnote">${esc(tr.desc)}</div>${kv('得意な方針', tr.policy ? CONFIG.policies[tr.policy].name : 'なし')}${kv('契約金', yen(cd.cost))}${kv('出演料', `${yen(conductorFee(cd))}/回`)}${cd.profile ? `<div class="tnote">${esc(cd.profile)}</div>` : ''}`;
    return {
      parent: '指揮者を募集', title: esc(cd.name),
      body: tvTabs([['abil', '能力'], ['info', '個性・費用']], tab) + body + (!done && why ? `<div class="treason">契約できません：${esc(why)}</div>` : ''),
      foot: done ? '<button class="tbtn" disabled>契約済み</button>' : `<button class="tbtn pri" data-act="tCondHire" data-id="${cd.id}" ${why ? 'disabled' : ''}>契約する ${yen(cd.cost)}</button>`,
    };
  },

  /* ===== 育成 ===== */
  tRoot(c) {
    return {
      title: '育成',
      body: `<div class="tnote">資金を使って団員・指揮者の能力そのものを伸ばします（潜在能力が上限）。まず育成内容を選び、次に対象を選びます。</div>
        <button class="tbigchoice" data-act="tgo" ${tvGo('tList', 'data-k="member"')}><b>団員の育成</b><span>${CONFIG.trainings.filter(t => t.target !== 'conductor').length}種類・個人育成とセクション育成</span></button>
        <button class="tbigchoice" data-act="tgo" ${tvGo('tList', 'data-k="conductor"')}><b>指揮者の育成</b><span>${CONFIG.trainings.filter(t => t.target === 'conductor').length}種類・契約中の指揮者 ${STATE.conductors.length}名</span></button>
        <div class="tbig sm"><small>使える資金</small><b class="${STATE.funds < 0 ? 'neg' : ''}">${yen(STATE.funds)}</b></div>`,
      foot: `<button class="tbtn" data-act="tgo" ${tvGo('tHistory')} ${c.trainingLog.length ? '' : 'disabled'}>今回の育成履歴（${c.trainingLog.length}）</button>`,
    };
  },
  tList(c, scr) {
    const list = CONFIG.trainings.filter(t => scr.k === 'conductor' ? t.target === 'conductor' : t.target !== 'conductor');
    const pg = tvPage(list, scr.page, tvPer(58, UI.trPre ? 26 : 0));
    const tgt = t => t.target === 'section' ? 'セクション育成' : t.target === 'conductor' ? '指揮者' : '個人育成';
    const pre = UI.trPre && (memberById(UI.trPre) || condById(UI.trPre));
    return {
      parent: '育成', title: scr.k === 'conductor' ? '指揮者の育成' : '団員の育成',
      body: (pre ? `<div class="tnote">対象：<b>${esc(pre.name)}</b>（個人の育成を選ぶと自動で選ばれます）</div>` : '') + pg.items.map(t => `<button class="trow" data-act="tgo" ${tvGo('tTarget', `data-t="${t.id}"`)}><span class="ticon">${t.icon}</span><span class="tr-m"><span class="tr-t">${t.name}</span><span class="tr-s">${tgt(t)}・${t.id === 'instrument' ? '¥40,000〜' : t.cost.perMember && !t.cost.base ? `1名あたり${yen(t.cost.perMember)}` : `${yen(t.cost.base)}〜`}</span></span><span class="chev">›</span></button>`).join(''),
      foot: tvPager(pg),
    };
  },
  tTarget(c, scr) {
    const t = findTraining(scr.t);
    const tag = id => { const why = trainingBlockReason(c, t.id, id, t.chooseAbility ? 'tech' : null); const used = c.trainingUsed[`${t.id}:${id}`]; return used ? '<span class="tag ok">実施済</span>' : why && why.startsWith('資金') ? '<span class="tag warn">資金不足</span>' : ''; };
    let body = '', foot = '', title = '対象を選ぶ';
    if (t.target === 'section') {
      title = '対象のセクション';
      body = SECTIONS.map(s => { const n = membersOfSection(s.id).length; return `<button class="trow" data-act="tTargetPick" data-id="${s.id}"><span class="tr-m"><span class="tr-t">${s.name}セクション</span><span class="tr-s">${n}名・平均 ${Math.round(mean(membersOfSection(s.id).map(memberAvg)) || 0)}・費用 ${n ? yen(trainingCost(t, s.id)) : '—'}</span></span>${tag(s.id)}<span class="chev">›</span></button>`; }).join('');
    } else if (t.target === 'conductor') {
      title = '対象の指揮者';
      body = STATE.conductors.map(cd => `<button class="trow" data-act="tTargetPick" data-id="${cd.id}">${badge(condRank(cd))}<span class="tr-m"><span class="tr-t">${esc(cd.name)}</span><span class="tr-s">${CONDUCTOR_ABILITIES.map(a => `${a.short}${cd.abilities[a.id]}/${cd.potential[a.id]}`).join(' ')}</span></span>${tag(cd.id)}<span class="chev">›</span></button>`).join('');
    } else {
      title = '対象の団員';
      const sec = scr.sec || (UI.trPre && memberById(UI.trPre) ? INST[memberById(UI.trPre).inst].section : 'hs');
      const ms = sortMembers(membersOfSection(sec)), pg = tvPage(ms, scr.page, tvPer(56, 50));
      body = tvTabs(SECTIONS.map(s => [s.id, s.name]), sec) + pg.items.map(m => { const room = Math.round(memberPotAvg(m) - memberAvg(m)); return `<button class="trow ${UI.trPre === m.id ? 'sel' : ''}" data-act="tTargetPick" data-id="${m.id}">${badge(memberRank(m))}<span class="tr-m"><span class="tr-t">${esc(m.name)} <small class="muted">${INST[m.inst].abbr}</small></span><span class="tr-s">平均 ${Math.round(memberAvg(m))}・伸びしろ +${room}${t.id === 'instrument' ? `・${CONFIG.instrumentGrades[m.instrumentGrade || 0].name}` : ''}</span></span>${tag(m.id)}<span class="chev">›</span></button>`; }).join('');
      foot = tvPager(pg);
      if (!scr.sec) scr.sec = sec;
    }
    return { parent: t.name, title, body, foot };
  },
  tAbility(c, scr) {
    const t = findTraining(scr.t), m = memberById(scr.id);
    return {
      parent: `${t.name}・${esc(m.name)}`, title: '伸ばす能力',
      body: `<div class="tnote">選んだ能力が +${t.gains._focus[0]}〜${t.gains._focus[1]}（潜在能力まで）。ほかの能力も伸びることがあります。</div><div class="tabil">` +
        ABILITIES.map(a => `<button class="${scr.ab === a.id ? 'on' : ''}" data-act="tAbilityPick" data-v="${a.id}" ${m.potential[a.id] <= m.abilities[a.id] ? 'disabled' : ''}><b>${a.name}</b><span>${m.abilities[a.id]} / ${m.potential[a.id]}</span></button>`).join('') + '</div>',
    };
  },
  tConfirm(c, scr) {
    const t = findTraining(scr.t), ms = trainingTargets(t, scr.id);
    const why = trainingBlockReason(c, t.id, scr.id, t.chooseAbility ? scr.ab : null);
    const cost = ms.length ? trainingCost(t, scr.id) : 0;
    const targetName = t.target === 'section' ? `${SEC[scr.id].name}セクション（${ms.length}名）` : ms[0] ? esc(ms[0].name) : '—';
    let effect;
    if (t.chooseAbility) effect = `${ABIL[scr.ab].name} +${t.gains._focus[0]}〜${t.gains._focus[1]}、ほかの能力も伸びることがある`;
    else { const g = t.id === 'instrument' ? (ms[0] ? trainingGains(t, ms[0]) : {}) : t.gains; effect = Object.entries(g).map(([a, [x, y, p]]) => `${abilShort(a)} +${x === y ? x : x + '〜' + y}${p < 1 ? `（${Math.round(p * 100)}%）` : ''}`).join('、') + (t.target === 'section' ? '（各団員）' : ''); }
    const cur = t.target === 'member' && ms[0] ? (t.chooseAbility ? `${ABIL[scr.ab].name} ${ms[0].abilities[scr.ab]} / ${ms[0].potential[scr.ab]}` : t.id === 'instrument' ? `${CONFIG.instrumentGrades[ms[0].instrumentGrade || 0].name} → ${(CONFIG.instrumentGrades[(ms[0].instrumentGrade || 0) + 1] || { name: '—' }).name}` : '') : t.target === 'conductor' && ms[0] ? CONDUCTOR_ABILITIES.map(a => `${a.short}${ms[0].abilities[a.id]}/${ms[0].potential[a.id]}`).join(' ') : `平均能力 ${Math.round(mean(ms.map(memberAvg)) || 0)}`;
    return {
      parent: t.name, title: '内容の確認',
      body: `<div class="tconfirm left"><div class="tc-msg">${esc(t.desc)}</div>
        ${kv('育成内容', t.name)}${kv('育成対象', targetName)}${cur ? kv('現在', cur) : ''}${kv('期待される効果', effect)}${kv('必要な費用', `<b>${cost ? yen(cost) : '—'}</b>`)}${kv('資金', `${yen(STATE.funds)} → ${yen(STATE.funds - cost)}`, STATE.funds - cost < 0 ? 'neg' : '')}
        ${t.limit === 'concert' ? '<div class="tnote">同じ対象には1演奏会につき1回まで</div>' : ''}</div>
        ${why ? `<div class="treason">実行できません：${esc(why)}</div>` : ''}`,
      foot: `<button class="tbtn" data-act="tback">戻る</button><button class="tbtn pri" data-act="tTrainRun" ${why ? 'disabled' : ''}>育成を実行 ${cost ? yen(cost) : ''}</button>`,
    };
  },
  tResult(c, scr) {
    const e = c.trainingLog[scr.i];
    const by = {}; e.gains.forEach(g => { (by[g.id] = by[g.id] || { name: g.name, a: [] }).a.push(`${abilShort(g.abil)}+${g.to - g.from}`); });
    const rows = Object.values(by), pg = tvPage(rows, scr.page, tvPer(44, 120));
    const total = e.gains.reduce((s, g) => s + g.to - g.from, 0);
    return {
      parent: e.name, title: '育成の成果',
      body: `<div class="tresmsg">${esc(e.message)}</div><div class="tnote center">${esc(e.target)}・${yen(e.cost)}${e.extra ? `<br>${esc(e.extra)}` : ''}</div>
        ${total ? pg.items.map(x => `<div class="trow static slim"><span class="tr-m"><span class="tr-t">${esc(x.name)}</span></span><span class="growl">${x.a.map(s => `<span class="tag ok">${s}</span>`).join('')}</span></div>`).join('') + `<div class="tnote center">能力の合計 +${total}</div>` : '<div class="tempty">今回は目に見える成果が出なかった…（伸びしろが少ない対象もいる）</div>'}`,
      foot: `${tvPager(pg)}<button class="tbtn pri" data-act="tTrainDone">育成メニューへ</button>`,
    };
  },
  tHistory(c, scr) {
    const list = c.trainingLog.map((l, i) => ({ l, i })).reverse(), pg = tvPage(list, scr.page, tvPer(56));
    return {
      parent: '育成', title: '今回の育成履歴',
      body: pg.items.map(({ l, i }) => tvRow('tgo', tvGo('tResult', `data-i="${i}"`), esc(l.name), `${esc(l.target)}・${yen(l.cost)}`, `<span class="tr-r pos">+${l.gains.reduce((s, g) => s + g.to - g.from, 0)}</span>`)).join('') || '<div class="tempty">まだ育成していません</div>',
      foot: tvPager(pg),
    };
  },

  /* ===== 記録 ===== */
  rRoot(c) {
    const past = pastConcerts();
    const cats = [
      ['rConcerts', '過去の演奏会', `${past.length}回開催`],
      ['rFinance', '財務記録', `資金 ${yen(STATE.funds)}`],
      ['rTraining', '育成の記録', `${STATE.concertOrder.reduce((s, id) => s + STATE.concertPrograms[id].trainingLog.length, 0)}件`],
      ['rConds', '指揮者の記録', `契約中 ${STATE.conductors.length}名`],
      ['rQuiz', '音楽クイズの記録', `回答 ${Object.values(ensureQuizState().songs).reduce((n, s) => n + s.answered, 0)}問・連続正解 ${STATE.quiz.streak}`],
      ['rSettings', '設定・保存データ', `楽団名・データの初期化`],
    ];
    return { title: '記録', body: cats.map(([v, n, s]) => tvRow('tgo', tvGo(v), n, s)).join('') };
  },
  rConcerts(c, scr) {
    const list = STATE.concertOrder.map(id => STATE.concertPrograms[id]).slice().reverse(), pg = tvPage(list, scr.page, tvPer(56));
    return {
      parent: '記録', title: '過去の演奏会',
      body: pg.items.map(x => tvRow('tgo', tvGo('rConcert', `data-id="${x.id}"`), esc(x.title), x.songId ? esc(findSong(x.songId).title) : '曲目未定', x.result ? `${badge(x.result.rank)}<span class="tr-r ${x.result.settlement.net < 0 ? 'neg' : 'pos'}">${yenS(x.result.settlement.net)}</span>` : `<span class="tr-r">${phaseName(x.phase)}中</span>`)).join(''),
      foot: tvPager(pg),
    };
  },
  rConcert(c, scr) {
    const x = STATE.concertPrograms[scr.id], r = x.result, tab = scr.tab || 'sum';
    let body = '', pg = null;
    if (tab === 'sum') {
      body = `${kv('会場', x.hallId ? esc(findHall(x.hallId).name) : '未定')}${kv('曲目', x.songId ? esc(findSong(x.songId).title) : '未定')}${kv('指揮者', r ? esc(r.conductorName || '—') : esc(condById(x.conductorId)?.name || '未定'))}`
        + (r ? `${kv('評価', `${r.rank}（${r.total}点）・${r.success ? '演奏成功' : '演奏に乱れ'}`)}${kv('成功確率', `${Math.round(r.prob * 100)}%・${CONFIG.policies[r.policy].name}${r.rehearsal ? '・ホール練習あり' : ''}`)}${kv('評判', `${Math.round(r.repBefore)} → ${Math.round(r.repAfter)}`)}${kv('来場者', `${r.settlement.audience}名`)}` : kv('段階', `${phaseName(x.phase)}（練習 ${x.practiceDone}/${CONFIG.practiceCount}回）`));
    } else {
      const lists = {
        money: x.ledger.map(l => `<div class="tline"><span>${esc(l.label)}</span><b class="${l.amount < 0 ? 'neg' : 'pos'}">${yenS(l.amount)}</b></div>`),
        prac: x.practices.map(l => `<div class="tline"><span><b class="gold">${l.no === 'H' ? 'ホール' : '第' + l.no + '回'}</b> ${esc(l.summary)}</span></div>`),
        train: x.trainingLog.map(l => `<div class="tline"><span><b class="gold">${esc(l.name)}</b> ${esc(l.target)}</span><b class="pos">+${l.gains.reduce((s, g) => s + g.to - g.from, 0)}</b></div>`),
        rev: r ? r.reviews.map(l => `<div class="tline rv2"><span><b class="gold">${esc(l.k)}</b> ${esc(l.t)}</span></div>`) : [],
      }[tab];
      const rowH = tab === 'rev' ? 96 : tab === 'prac' ? 50 : 46;
      pg = tvPage(lists, scr.page, tvPer(rowH, 50));
      body = pg.items.join('') || '<div class="tempty">記録がありません</div>';
      if (tab === 'money' && x.ledger.length) body += `<div class="tline total"><span>収支合計</span><b class="${ledgerSum(x.ledger) < 0 ? 'neg' : 'pos'}">${yenS(ledgerSum(x.ledger))}</b></div>`;
    }
    return {
      parent: '過去の演奏会', title: esc(x.title), badge: r ? badge(r.rank) : '',
      body: tvTabs([['sum', '概要'], ['money', '収支'], ['prac', '練習'], ['train', '育成'], ['rev', '講評']], tab) + body,
      foot: pg ? tvPager(pg) : '',
    };
  },
  rFinance(c, scr) {
    const rows = [{ id: '_general', t: '団員募集・指揮者契約', s: `${STATE.ledger.length}件`, v: ledgerSum(STATE.ledger) },
      ...STATE.concertOrder.map(id => STATE.concertPrograms[id]).slice().reverse().map(x => ({ id: x.id, t: x.title, s: `${x.ledger.length}件${x.result ? '' : '（進行中）'}`, v: ledgerSum(x.ledger) }))];
    const pg = tvPage(rows, scr.page, tvPer(56, 60));
    return {
      parent: '記録', title: '財務記録',
      body: `<div class="tbig sm"><small>現在の資金</small><b>${yen(STATE.funds)}</b></div>` + pg.items.map(x => tvRow('tgo', tvGo('rLedger', `data-id="${x.id}"`), esc(x.t), x.s, `<span class="tr-r ${x.v < 0 ? 'neg' : 'pos'}">${yenS(x.v)}</span>`)).join(''),
      foot: tvPager(pg),
    };
  },
  rLedger(c, scr) {
    const L = scr.id === '_general' ? STATE.ledger.slice().reverse() : STATE.concertPrograms[scr.id].ledger;
    const pg = tvPage(L, scr.page, tvPer(46, 44));
    return {
      parent: '財務記録', title: scr.id === '_general' ? '団員募集・指揮者契約' : esc(STATE.concertPrograms[scr.id].title),
      body: (pg.items.map(l => `<div class="tline"><span>${esc(l.label)}</span><b class="${l.amount < 0 ? 'neg' : 'pos'}">${yenS(l.amount)}</b></div>`).join('') || '<div class="tempty">記録がありません</div>') + `<div class="tline total"><span>合計</span><b class="${ledgerSum(L) < 0 ? 'neg' : 'pos'}">${yenS(ledgerSum(L))}</b></div>`,
      foot: tvPager(pg),
    };
  },
  rTraining(c, scr) {
    const list = STATE.concertOrder.map(id => STATE.concertPrograms[id]).slice().reverse(), pg = tvPage(list, scr.page, tvPer(56));
    return {
      parent: '記録', title: '育成の記録',
      body: pg.items.map(x => tvRow('tgo', tvGo('rConcert', `data-id="${x.id}" data-tab="train"`), esc(x.title), `${x.trainingLog.length}件・費用 ${yen(x.trainingLog.reduce((s, l) => s + l.cost, 0))}`, `<span class="tr-r pos">+${x.trainingLog.reduce((s, l) => s + l.gains.reduce((a, g) => a + g.to - g.from, 0), 0)}</span>`)).join(''),
      foot: tvPager(pg),
    };
  },
  rConds(c) {
    const done = pastConcerts();
    return {
      parent: '記録', title: '指揮者の記録',
      body: STATE.conductors.map(cd => { const n = done.filter(x => x.result.conductorId === cd.id).length; return tvRow('tgo', tvGo('rCond', `data-id="${cd.id}"`), esc(cd.name), `${traitOf(cd).name}・指揮 ${cd.concerts || 0}回`, `<span class="tr-r">${n}回</span>`); }).join(''),
    };
  },
  rCond(c, scr) {
    const cd = condById(scr.id), list = pastConcerts().filter(x => x.result.conductorId === scr.id), pg = tvPage(list, scr.page, tvPer(56, 60));
    return {
      parent: '指揮者の記録', title: cd ? esc(cd.name) : '指揮者',
      body: (cd ? `<div class="tnote">${CONDUCTOR_ABILITIES.map(a => `${a.short} ${cd.abilities[a.id]}/${cd.potential[a.id]}`).join('・')}<br>指揮した演奏会 ${cd.concerts || 0}回</div>` : '') +
        (pg.items.map(x => tvRow('tgo', tvGo('rConcert', `data-id="${x.id}"`), esc(x.title), `${esc(findSong(x.songId).title)}${(x.result.conductorGrowth || []).length ? `・成長 ${x.result.conductorGrowth.map(g => CABIL[g.abil].short + '+' + (g.to - g.from)).join(' ')}` : ''}`, badge(x.result.rank))).join('') || '<div class="tempty">まだ指揮した演奏会はありません</div>'),
      foot: tvPager(pg),
    };
  },
  rSettings(c, scr) {
    return {
      parent: '記録', title: '設定・保存データ',
      body: `<label class="tnote">楽団名</label><div class="tpair"><input class="input" id="orchName" value="${esc(STATE.orchestraName)}" maxlength="24"><button class="tbtn sm" data-act="rename">変更</button></div>
        ${kv('保存', `操作のたびにこの端末のブラウザへ自動保存（データ形式 v${STATE.version}）`)}
        ${kv('音声', soundOn() ? '演奏会の音あり' : '消音（演奏会タブで切替）')}`,
      foot: `<button class="tbtn" data-act="tgo" ${tvGo('rReset')}>保存データを初期化</button>`,
    };
  },
  rReset() {
    return {
      parent: '設定・保存データ', title: '初期化の確認',
      body: '<div class="tconfirm">すべての進行状況が消えます。<br>本当に初期化しますか？</div>',
      foot: '<button class="tbtn" data-act="tback">やめる</button><button class="tbtn pri" data-act="resetYes">初期化する</button>',
    };
  },
};

/* ---------- 操作 ---------- */
Object.assign(ACTIONS, {
  // タブ切り替え：各タブの階層はそのまま保持（演奏会タブの動作は従来どおり）
  tab(d) {
    if (UI.showing && d.tab !== 'concert') Stage3D.skipShow();
    UI.tab = d.tab; UI.sheetMember = null;
    if (d.tab === 'members' && UI.memView === 'conductors') {   // 演奏会タブ「指揮者の採用・管理」からの案内
      UI.memView = 'list';
      tjump('members', STATE.conductors.length ? [{ s: 'mConds' }] : [{ s: 'recruit' }, { s: 'recConds' }]);
    }
    render(); scrollTop();
  },
  tgo(d) {
    const scr = { s: d.v };
    for (const k of ['g', 'inst', 'id', 'k', 't', 'i', 'tab']) if (d[k] != null) scr[k] = d[k];
    if (d.i != null) scr.i = Number(d.i);
    tpush(scr);
    // 団員詳細・指揮者詳細の「育成する」から来た場合は、個人の育成で対象を自動選択する
    if (d.v === 'tTarget' && UI.trPre) {
      const t = findTraining(d.t);
      if ((t.target === 'member' && memberById(UI.trPre)) || (t.target === 'conductor' && condById(UI.trPre))) { ACTIONS.tTargetPick({ id: UI.trPre }); return; }
    }
    render();
  },
  tback() { tpop(); render(); },
  tpage(d) { tset({ page: (ttop().page || 0) + Number(d.d) }); render(); },
  tsub(d) { const t = ttop(); if (t.s === 'tTarget') tset({ sec: d.v, page: 0 }); else tset({ tab: d.v, page: 0 }); render(); },
  tjump(d) {
    const ids = (d.path || '').split(',').filter(Boolean);
    const path = ids.map((s, k) => ({ s, ...(k === ids.length - 1 && d.id ? { id: d.id } : {}) }));
    tjump(d.tab, path); render();
  },
  tnote(d) { const n = notices(activeConcert())[Number(d.i)]; if (!n) return; if (n.path) tjump(n.tab, n.path); else UI.tab = n.tab; render(); },
  // 団員
  tPrincipal(d) {
    const m = memberById(d.id), prev = m && principalOf(m.inst);
    if (setPrincipal(d.id, d.inst || (m && m.inst))) {
      toast(`${m.name} を ${INST[m.inst].abbr} の首席に任命しました${prev && prev.id !== m.id ? `（${prev.name} は通常団員に戻りました）` : ''}`);
      if (ttop().s === 'mPrincipal') tpop();
    }
    render();
  },
  tPrinPick(d) {
    // 退団確認から来た場合は確認画面を閉じてから首席の選択へ
    if (ttop().s === 'mDismiss') { tpop(); if (ttop().s === 'mMember') tpop(); }
    tpush({ s: 'mPrincipal', inst: d.inst }); render();
  },
  tDismiss(d) {
    const m = memberById(d.id), why = dismissBlockReason(m);
    if (why) { toast(why); render(); return; }
    if (dismissMember(d.id)) {
      toast(`${m.name} が退団しました`);
      if (UI.draft) UI.draft.members = UI.draft.members.filter(x => x !== d.id);
      tpop(); tpop();
    }
    render();
  },
  tTrainMember(d) { UI.trPre = d.id; tjump('train', [{ s: 'tList', k: 'member' }]); render(); },
  tTrainCond(d) { UI.trPre = d.id; tjump('train', [{ s: 'tList', k: 'conductor' }]); render(); },
  tCondSet(d) { if (setActiveConductor(d.id)) toast(`${condById(d.id).name} が担当指揮者になりました`); render(); },
  tCondFire(d) { const cd = condById(d.id); if (dismissConductor(d.id)) { toast(`${cd.name} との契約を解除しました`); tpop(); tpop(); } render(); },
  tHire(d) { const cand = STATE.recruit.candidates.find(x => x.id === d.id); if (hireCandidate(d.id)) { toast(`${cand.name} が入団しました（${yen(cand.cost)}）`); tpop(); } render(); },
  tReroll() { if (rerollRecruit()) { toast('新しい候補者が集まりました'); tset({ page: 0 }); } render(); },
  tCondHire(d) { const cd = STATE.conductorMarket.candidates.find(x => x.id === d.id); if (hireConductor(d.id)) { toast(`${cd.name} と契約しました（${yen(cd.cost)}）`); tpop(); } render(); },
  tCondReroll() { if (rerollConductors()) { toast('新しい指揮者候補が見つかりました'); tset({ page: 0 }); } render(); },
  // 育成：内容 → 対象 →（能力）→ 確認 → 実行 → 成果
  tTargetPick(d) {
    const t = findTraining(ttop().t);
    if (t.chooseAbility) tpush({ s: 'tAbility', t: t.id, id: d.id });
    else tpush({ s: 'tConfirm', t: t.id, id: d.id });
    render();
  },
  tAbilityPick(d) { const t = ttop(); t.ab = d.v; tpush({ s: 'tConfirm', t: t.t, id: t.id, ab: d.v }); render(); },
  tTrainRun() {
    const scr = ttop(), c = activeConcert(), t = findTraining(scr.t);
    const r = runTraining(c, t.id, scr.id, t.chooseAbility ? scr.ab : null);
    if (r.error) { toast(r.error); render(); return; }
    tpop(); tpush({ s: 'tResult', i: c.trainingLog.length - 1 });
    render();
  },
  tTrainDone() { UI.trPre = null; const st = tstack('train'); const k = st.find(x => x.s === 'tList'); UI.tnav.train = [{ s: 'tRoot' }, ...(k ? [{ s: 'tList', k: k.k }] : [])]; render(); },
});

// 新しくゲームを始めた／データを初期化したときは、各タブの階層を最初の画面に戻す（削除済みの団員などを参照しないように）
['newgame', 'resetYes'].forEach(k => {
  const orig = ACTIONS[k];
  if (orig) ACTIONS[k] = function (...a) { UI.tnav = {}; UI.trPre = null; return orig.apply(this, a); };
});
