/* =========================================================
 * UI3D — 演奏会タブ（専用のゲーム画面）
 *   ・画面上部〜中央：3Dオーケストラ（主役）
 *   ・画面下部：コマンドパネル（固定。いま必要な操作だけを表示し、階層式に進む）
 *       操作を選ぶ → 詳細を選ぶ → 決定する → 元の画面に戻る
 *   ・画面全体はスクロールしない。項目が多いときはカテゴリー分け・ページ分割する
 *   ・3Dが使えない端末では3D領域を簡易表示に置き換え、同じ操作で遊べる
 * ========================================================= */
const CAMERAS = [
  ['overview', '全体'], ['front', '正面'], ['conductor', '指揮者'],
  ['hs', '高弦'], ['ls', '低弦'], ['ww', '木管'], ['br', '金管'], ['pc', '打楽器'],
];
let STAGE_HOST = null, STAGE_TRIED = false;
function use3D() {
  if (UI.no3d) return false;
  if (!STAGE_TRIED) {
    STAGE_TRIED = true;
    try {
      STAGE_HOST = document.createElement('div'); STAGE_HOST.id = 'stage3d';
      document.body.appendChild(STAGE_HOST);
      if (typeof Stage3D === 'undefined' || !Stage3D.init(STAGE_HOST)) { STAGE_HOST.remove(); STAGE_HOST = null; }
    } catch (e) { STAGE_HOST = null; }
  }
  return !!(STAGE_HOST && Stage3D.ok);
}
const stageReason = () => (typeof Stage3D !== 'undefined' && Stage3D.reason) || '3D表示を初期化できませんでした';
function soundOn() { try { return localStorage.getItem('orchestraSim.sound') !== 'off'; } catch (e) { return true; } }

// 3D表示に今の状態を反映（会場・曲・指揮者・観客）
function sync3D(c) {
  if (!use3D()) return;
  try {
    const scr = cmdTop();
    const hallId = (scr.s === 'hallDetail' && scr.id) || (scr.s === 'hallList' && UI.previewHall) || c.hallId || UI.previewHall || 'general';
    const songId = (scr.s === 'songDetail' && scr.id) || c.songId || null;
    const cdId = (scr.s === 'condDetail' && scr.id) || null;
    const cd = cdId ? STATE.conductors.find(x => x.id === cdId) : activeConductor();
    Stage3D.sync({ hallId, song: songId ? findSong(songId) : null, conductor: cd });
    // 準備・練習中は客席が空。本番準備では予想集客、結果では実際の来場者
    if (!Stage3D.isShowing()) {
      let fill = 0;
      if (c.phase === 'prep') fill = attendanceRate(c);
      if (c.phase === 'result' && c.result) fill = clamp(c.result.settlement.audience / findHall(c.hallId).capacity, 0, 1);
      if (scr.s === 'hallList' || scr.s === 'hallDetail') fill = 0.35;
      Stage3D.setAudienceFill(fill);
    }
  } catch (e) { console.error(e); }
}
function practiceQuality(c) {
  const q = {};
  for (const s of SECTIONS) q[s.id] = clamp(0.3 + mean(SECTION_PARAMS.map(p => c.perf.sections[s.id][p.id])) / 110, 0.3, 0.95);
  return q;
}
function showQuality(c) {
  const r = c.result, q = {};
  for (const s of SECTIONS) {
    const secAvg = mean(SECTION_PARAMS.map(p => c.perf.sections[s.id][p.id]));
    q[s.id] = clamp(0.35 + secAvg / 120 + (r.cats.ens - 50) / 250, 0.3, 1);
  }
  if (!r.success) { const worst = Object.entries(q).sort((a, b) => a[1] - b[1])[0][0]; q[worst] = Math.max(0.25, q[worst] - 0.12); }
  return q;
}

/* ---------- 画面（コマンド）の階層管理 ----------
 * UI.cmd = { cid, phase, stack:[{s, ...}] }。演奏会や段階が変わったら、その段階の最初の画面に戻す。
 * 決定内容は STATE に即保存されるので、途中で別タブへ移っても失われない。 */
function rootScreen(c) {
  if (c.phase === 'setup') return { s: c.started ? 'setup' : 'entry' };
  return { s: c.phase };   // practice / prep / result
}
function cmdState() {
  const c = activeConcert();
  if (!UI.cmd || UI.cmd.cid !== c.id || UI.cmd.phase !== c.phase) UI.cmd = { cid: c.id, phase: c.phase, stack: [rootScreen(c)] };
  if (c.phase === 'setup' && c.started && UI.cmd.stack[0].s === 'entry') UI.cmd.stack = [{ s: 'setup' }];
  return UI.cmd;
}
const cmdTop = () => { const st = cmdState().stack; return st[st.length - 1]; };
function cmdGo(scr) { cmdState().stack.push(scr); }
function cmdBack() { const st = cmdState().stack; if (st.length > 1) st.pop(); }
function cmdHome() { const st = cmdState().stack; st.splice(1); }
function cmdSet(patch) { Object.assign(cmdTop(), patch); }

/* ---------- 画面サイズ ---------- */
// 3D領域と操作パネルの高さを画面サイズから決める（縦長スマホ優先・PCでは上限あり）
function panelHeight(kind) {
  const vh = window.innerHeight || 780;
  if (kind === 'show') return 74;
  if (kind === 'short') return Math.round(clamp(vh * 0.27, 176, 230));
  return Math.round(clamp(vh * 0.42, 300, 400));
}
const ROW_H = 50;
function perPage(extra = 0) {
  const h = panelHeight('tall') - 46 - 62 - 14 - extra;   // 見出し・フッター・余白を除いた高さ
  return Math.max(2, Math.floor(h / ROW_H));
}
function paged(list, page, extra) {
  const n = perPage(extra), pages = Math.max(1, Math.ceil(list.length / n));
  const p = clamp(page || 0, 0, pages - 1);
  return { items: list.slice(p * n, p * n + n), page: p, pages };
}
const pager = pg => pg.pages > 1 ? `<div class="pager"><button data-act="cpage" data-d="-1" ${pg.page <= 0 ? 'disabled' : ''} aria-label="前のページ">‹</button><span>${pg.page + 1} / ${pg.pages}</span><button data-act="cpage" data-d="1" ${pg.page >= pg.pages - 1 ? 'disabled' : ''} aria-label="次のページ">›</button></div>` : '';
const tabs = (list, cur) => `<div class="ctabs">${list.map(([id, n]) => `<button class="${cur === id ? 'on' : ''}" data-act="ctab" data-v="${id}">${n}</button>`).join('')}</div>`;
const backBtn = (label = '戻る') => `<button class="cbtn" data-act="cback">← ${label}</button>`;

/* ---------- 演奏会タブ全体 ---------- */
function renderConcertGame(c) {
  const scr = cmdTop();
  const showing = UI.showing;
  const def = SCREENS[showing ? 'show' : scr.s] || SCREENS.setup;
  const kind = showing ? 'show' : def.kind || 'tall';
  const ph = panelHeight(kind);
  document.documentElement.style.setProperty('--panel', ph + 'px');
  const out = def.render(c, scr);
  const cams = CAMERAS.map(([id, n]) => `<button class="${use3D() && Stage3D.camName() === id ? 'on' : ''}" data-act="cam" data-v="${id}">${n}</button>`).join('');
  const stageArea = use3D()
    ? `<div class="ov3d"><div class="camrow">${cams}<button class="snd" data-act="sound" aria-label="音声">${soundOn() ? '♪ 音あり' : '♪ 消音'}</button></div>
        ${showing ? `<div class="caption" id="cap3d">${esc(UI.caption || '開演前')}</div>` : ''}</div>`
    : `<div class="stage2d"><div class="s2-hall">${esc((findHall(c.hallId) || {}).name || 'コンサートホール')}</div><div class="s2-song">${esc((findSong(c.songId) || {}).title || '曲目未定')}</div>
        <div class="s2-note">3D表示を利用できないため簡易表示です<br><small>${esc(stageReason())}</small></div></div>`;
  return `${stageArea}
  <section class="cmd k-${kind}" style="height:${ph}px" aria-label="操作パネル">
    ${out.head !== false ? `<div class="chead">${out.back ? backBtn(out.backLabel) : ''}<div class="crumb">${out.crumb || ''}</div>${out.badge || ''}</div>` : ''}
    <div class="cbody">${out.body}</div>
    ${out.foot ? `<div class="cfoot">${out.foot}</div>` : ''}
  </section>`;
}

/* ---------- 各画面 ---------- */
const statusMark = ok => ok ? '<span class="mk ok">✓</span>' : '<span class="mk">○</span>';
const shortMini = s => { const sh = shortageOf(s); return sh.items.some(i => i.missing) ? '<span class="tag bad">楽器欠員</span>' : sh.items.length ? `<span class="tag warn">不足${sh.items.reduce((a, i) => a + i.lack, 0)}名</span>` : '<span class="tag ok">編成OK</span>'; };
function focusGrid(path, f) {
  const t = ftotal(f);
  return `<div class="fgrid">${FOCUS.map(x => `<div class="fcell ${f[x.id] ? 'on' : ''}"><span class="fl">${x.name}</span>
    <button data-act="fp" data-path="${path}" data-f="${x.id}" data-d="-1" ${f[x.id] <= 0 ? 'disabled' : ''} aria-label="${x.name}を減らす">−</button><b>${f[x.id]}</b>
    <button data-act="fp" data-path="${path}" data-f="${x.id}" data-d="1" ${t >= CONFIG.focusPoints ? 'disabled' : ''} aria-label="${x.name}を増やす">＋</button></div>`).join('')}</div>`;
}
const pts = f => { const t = ftotal(f); return `<span class="cbadge ${t === CONFIG.focusPoints ? 'ok' : 'ng'}">配分 ${t}/${CONFIG.focusPoints}</span>`; };

const SCREENS = {
  /* ===== 準備 ===== */
  entry: { kind: 'short', render: c => ({
    head: false,
    body: `<div class="entry"><div class="muted">${esc(STATE.orchestraName)}</div><div class="et">${esc(c.title)}</div>
      <div class="muted">選曲・会場・指揮者を決めて、練習10回の後に本番を迎えます</div></div>`,
    foot: `<button class="cbtn pri big" data-act="startConcert">演奏会を始める</button>`,
  }) },
  setup: { render: c => {
    const st = setupStatus(c), song = findSong(c.songId), hall = findHall(c.hallId), cd = c.conductorId && STATE.conductors.find(x => x.id === c.conductorId);
    const left = [st.song, st.hall, st.conductor].filter(x => !x).length;
    const item = (ok, n, label, val, go) => `<button class="citem ${ok ? 'done' : ''}" data-act="cgo" data-v="${go}">${statusMark(ok)}<span class="grow"><span class="ci-l">${n}. ${label}</span><span class="ci-v">${val}</span></span><span class="chev">›</span></button>`;
    return {
      crumb: `${esc(c.title)}<b>演奏会の準備</b>`,
      body: `<div class="cmsg">以下を完了してください</div>
        ${item(st.song, 1, '選曲', song ? esc(song.title) : '未選択', 'songCat')}
        ${item(st.hall, 2, '会場の予約', hall ? `${esc(hall.name)}（${hall.fee ? yen(hall.fee) : '無料'}）` : '未予約', 'hallList')}
        ${item(st.conductor, 3, '指揮者の選択', cd ? `${esc(cd.name)}（${traitOf(cd).name}）` : '未選択', 'condList')}`,
      foot: `<button class="cbtn pri big" data-act="toPractice" ${st.ready ? '' : 'disabled'}>${st.ready ? '準備完了 ― 練習期間へ' : `あと${left}項目で準備完了`}</button>`,
    };
  } },
  songCat: { render: c => {
    const cur = findSong(c.songId);
    return {
      back: true, crumb: '準備 › <b>選曲</b>',
      body: `<div class="cmsg">ジャンルを選んでください</div><div class="bigrid">${GENRES.map(g => `<button class="bigbtn" data-act="cgo" data-v="songList" data-g="${g.id}"><b>${g.name}</b><span>${songsOfGenre(g.id).length}曲</span>${cur && cur.genre === g.id ? '<i class="tag gold">選択中の曲あり</i>' : ''}</button>`).join('')}</div>
        <div class="cnote">${cur ? `選択中：<b>${esc(cur.title)}</b>` : 'まだ曲が選ばれていません'}</div>`,
    };
  } },
  songList: { render: (c, scr) => {
    const list = songsOfGenre(scr.g), pg = paged(list, scr.page);
    return {
      back: true, crumb: `選曲 › <b>${genreName(scr.g)}</b>`,
      body: pg.items.map(s => `<button class="crow ${c.songId === s.id ? 'sel' : ''}" data-act="cgo" data-v="songDetail" data-id="${s.id}">
          <span class="cr-main"><span class="cr-t">${c.songId === s.id ? '✓ ' : ''}${esc(s.title)}</span><span class="cr-s">${esc(s.composer)}・${difficultyLabel(s.difficulty)}・${s.duration}分</span></span>${shortMini(s)}</button>`).join(''),
      foot: pager(pg) || '<span class="muted">曲を選ぶと詳細を確認できます</span>',
    };
  } },
  songDetail: { render: (c, scr) => {
    const s = findSong(scr.id), sp = STATE.songParams[s.id] || { base: 0, underst: 0, expr: 0, performed: 0 }, sh = shortageOf(s);
    const tab = scr.tab || 'info', chosen = c.songId === s.id;
    const body = tab === 'info'
      ? `<div class="dt">${esc(s.title)}</div><div class="ds">${esc(s.composer)}（${s.year}年）・${genreName(s.genre)}</div>
         <div class="dtags"><span class="tag">${difficultyLabel(s.difficulty)}</span><span class="tag">約${s.duration}分</span><span class="tag">${esc(s.mood)}</span><span class="tag gold">知名度${'★'.repeat(s.popularity)}</span>${shortMini(s)}</div>
         <p class="dd">${esc(s.description)}</p>`
      : `<div class="kvc"><span>編成</span><span>${formatInstrumentation(s).map(esc).join('<br>')}（計${songPlayers(s)}名）</span></div>
         ${sh.items.length ? `<div class="kvc"><span>不足</span><span class="warnt">${sh.items.map(i => `${INST[i.inst].abbr} ${i.lack}名${i.missing ? '（欠員）' : ''}`).join('、')}</span></div>` : '<div class="kvc"><span>不足</span><span class="okt">なし（編成が揃っています）</span></div>'}
         <div class="kvc"><span>習熟</span><span>基礎 ${sp.base}・理解 ${sp.underst}・表現 ${sp.expr}（演奏 ${sp.performed}回）</span></div>`;
    return {
      back: true, crumb: `${genreName(s.genre)} › <b>曲の詳細</b>`,
      body: tabs([['info', '概要'], ['form', '編成・習熟']], tab) + `<div class="dbox">${body}</div>`,
      foot: chosen ? `<button class="cbtn" data-act="cback">一覧に戻る</button><button class="cbtn pri" disabled>選曲済み</button>` : `<button class="cbtn" data-act="cback">一覧に戻る</button><button class="cbtn pri" data-act="chooseSong" data-id="${s.id}">この曲に決定</button>`,
    };
  } },
  hallList: { render: (c, scr) => {
    const pg = paged(CONFIG.halls, scr.page);
    return {
      back: true, crumb: '準備 › <b>会場の予約</b>', badge: use3D() ? '<span class="cbadge">3Dで比較できます</span>' : '',
      body: pg.items.map(h => `<button class="crow ${c.hallId === h.id ? 'sel' : ''} ${UI.previewHall === h.id ? 'peek' : ''}" data-act="cgo" data-v="hallDetail" data-id="${h.id}">
          <span class="cr-main"><span class="cr-t">${c.hallId === h.id ? '✓ ' : ''}${esc(h.name)}</span><span class="cr-s">${h.grade}・${h.capacity.toLocaleString()}席・音響${h.acoustics}</span></span><span class="cr-fee">${h.fee ? yen(h.fee) : '無料'}</span></button>`).join(''),
      foot: pager(pg) || `<span class="muted">資金 ${yen(STATE.funds)}</span>`,
    };
  } },
  hallDetail: { render: (c, scr) => {
    const h = findHall(scr.id), E = CONFIG.economy, tab = scr.tab || 'basic';
    const reason = hallBlockReason(c, h), reserved = c.hallId === h.id;
    const att = clamp(h.attendance + STATE.reputation * h.repSens, E.attendanceMin, E.attendanceMax);
    const refund = c.hallId && !reserved ? findHall(c.hallId).fee : 0;
    const body = tab === 'basic'
      ? `<div class="dt">${esc(h.name)} <span class="tag">${h.grade}</span></div>
         <div class="kgrid"><span>使用料<b>${h.fee ? yen(h.fee) : '無料'}</b></span><span>席数<b>${h.capacity.toLocaleString()}席</b></span><span>チケット<b>${yen(h.ticket)}</b></span>
         <span>舞台<b>${h.stage}名まで</b></span><span>ホール練習<b>${h.rehearsalFee ? yen(h.rehearsalFee) : '無料'}</b></span><span>評判<b>×${h.prestige}</b></span></div>
         ${stat('音響性能', h.acoustics, null, 'blue')}`
      : `<p class="dd">${esc(h.feature)}</p>
         <div class="kvc"><span>集客</span><span>予想 約${Math.round(att * 100)}%（${Math.round(h.capacity * att)}名）・チケット収入 約${yen(Math.round(h.capacity * att) * h.ticket)}</span></div>
         ${h.pressure ? `<div class="kvc"><span>重圧</span><span class="warnt">ホール練習をしないと成功率 −${Math.round(h.pressure * 100)}%</span></div>` : ''}
         <div class="kvc"><span>注意</span><span>予約時に使用料を支払います。練習が始まるまでは別の会場に変更でき、前の予約は全額返金されます。</span></div>`;
    return {
      back: true, crumb: `会場の予約 › <b>${esc(h.name)}</b>`,
      body: tabs([['basic', '基本'], ['more', '特徴・集客']], tab) + `<div class="dbox">${body}</div>${!reserved && reason ? `<div class="creason">${esc(reason)}</div>` : ''}`,
      foot: `<button class="cbtn" data-act="cback">一覧に戻る</button>` + (reserved ? '<button class="cbtn pri" disabled>予約済み</button>'
        : `<button class="cbtn pri" data-act="reserveHall" data-id="${h.id}" ${reason ? 'disabled' : ''}>${refund ? '変更して予約' : '予約する'}${h.fee ? `（${yen(h.fee)}）` : ''}</button>`),
    };
  } },
  condList: { render: c => {
    if (!STATE.conductors.length) return { back: true, crumb: '準備 › <b>指揮者の選択</b>', body: '<div class="cmsg">契約中の指揮者がいません</div><div class="cnote">団員タブの「指揮者」から採用してください。</div>', foot: '<button class="cbtn pri big" data-act="goHireCond">指揮者を採用する</button>' };
    return {
      back: true, crumb: '準備 › <b>指揮者の選択</b>', badge: `<span class="cbadge">契約 ${STATE.conductors.length}/${CONFIG.conductor.maxHired}名</span>`,
      body: STATE.conductors.map(cd => `<button class="crow ${c.conductorId === cd.id ? 'sel' : ''}" data-act="cgo" data-v="condDetail" data-id="${cd.id}">
          ${badge(condRank(cd))}<span class="cr-main"><span class="cr-t">${c.conductorId === cd.id ? '✓ ' : ''}${esc(cd.name)}</span><span class="cr-s">${traitOf(cd).name}・${CONDUCTOR_ABILITIES.map(a => `${a.short}${cd.abilities[a.id]}`).join(' ')}</span></span></button>`).join(''),
      foot: `<button class="cbtn" data-act="goHireCond">指揮者の採用・管理</button>`,
    };
  } },
  condDetail: { render: (c, scr) => {
    const cd = STATE.conductors.find(x => x.id === scr.id), tab = scr.tab || 'abil', tr = traitOf(cd), chosen = c.conductorId === cd.id;
    const pol = tr.policy ? CONFIG.policies[tr.policy].name : 'なし（全体合奏の練習効果 ×' + (tr.practice || 1) + '）';
    const body = tab === 'abil'
      ? `<div class="dt">${badge(condRank(cd))}${esc(cd.name)}<span class="muted dsm">出演料 ${conductorFee(cd) ? yen(conductorFee(cd)) + '/回' : '無償'}・${cd.concerts || 0}回</span></div>${CONDUCTOR_ABILITIES.map(a => stat(a.name, cd.abilities[a.id], cd.potential[a.id], 'wine')).join('')}`
      : `<div class="dt">${tr.name}</div><p class="dd">${esc(tr.desc)}</p>
         <div class="kvc"><span>得意</span><span>${pol}</span></div><div class="kvc"><span>人物</span><span>${esc(cd.profile || '—')}</span></div>`;
    return {
      back: true, crumb: `指揮者の選択 › <b>${esc(cd.name)}</b>`,
      body: tabs([['abil', '能力'], ['trait', '個性']], tab) + `<div class="dbox">${body}</div>`,
      foot: `<button class="cbtn" data-act="cback">一覧に戻る</button>` + (chosen ? '<button class="cbtn pri" disabled>担当に決定済み</button>' : `<button class="cbtn pri" data-act="chooseCond" data-id="${cd.id}">この指揮者に決定</button>`),
    };
  } },

  /* ===== 練習期間 ===== */
  practice: { render: c => {
    fillDraft(c);
    const song = findSong(c.songId), cd = activeConductor();
    const dots = Array.from({ length: CONFIG.practiceCount }, (_, i) => `<i class="${i < c.practiceDone ? 'd' : i === c.practiceDone ? 'n' : ''}"></i>`).join('');
    const mb = (id, n, d) => `<button class="bigbtn" data-act="cgo" data-v="${id}"><b>${n}</b><span>${d}</span></button>`;
    return {
      crumb: `練習期間<b>第${c.practiceDone + 1}回 / ${CONFIG.practiceCount}回</b>`, badge: `<div class="dots">${dots}</div>`,
      body: `<div class="cnote ell">『${esc(song.title)}』・${esc(findHall(c.hallId).name)}・指揮 ${esc(cd ? cd.name : '—')}</div>
        <div class="cmsg">練習メニューを1つ選んでください</div>
        <div class="bigrid three">${mb('tutti', '全体合奏', '全員で曲を通す')}${mb('section', 'セクション練習', '5セクション同時')}${mb('indivPick', '個人練習', '奏者を絞って')}</div>`,
      foot: `<button class="cbtn" data-act="cgo" data-v="perf">仕上がり</button><button class="cbtn" data-act="cgo" data-v="history" ${c.practices.length ? '' : 'disabled'}>練習履歴</button>`,
    };
  } },
  tutti: { render: c => ({
    back: true, crumb: '練習 › <b>全体合奏</b>', badge: pts(UI.draft.focus),
    body: focusGrid('tutti', UI.draft.focus),
    foot: `<button class="cbtn" data-act="fauto" data-path="tutti">おまかせ</button><button class="cbtn pri" data-act="runPractice" data-m="tutti" ${focusValid(UI.draft.focus) ? '' : 'disabled'}>練習開始</button>`,
  }) },
  section: { render: c => {
    const d = UI.draft, all = SECTIONS.every(s => focusValid(d.sections[s.id]));
    return {
      back: true, crumb: '練習 › 各10ポイント <b>セクション練習</b>',
      body: `<div class="tiles sec5">` + SECTIONS.map(s => { const f = d.sections[s.id], ok = focusValid(f), n = membersOfSection(s.id).length; return `<button class="tile ${ok ? '' : 'warn'}" data-act="cgo" data-v="secEdit" data-sec="${s.id}"><span>${s.name}${ok ? ' ✓' : `（${ftotal(f)}/10）`}</span><b class="sm">${n ? esc(focusSummary(f)) : '団員なし'}</b></button>`; }).join('') + '</div>',
      foot: `<button class="cbtn" data-act="autoAll">全部おまかせ</button><button class="cbtn pri" data-act="runPractice" data-m="section" ${all ? '' : 'disabled'}>練習開始</button>`,
    };
  } },
  secEdit: { render: (c, scr) => ({
    back: true, backLabel: '決定', crumb: `セクション練習 › <b>${SEC[scr.sec].name}</b>`, badge: pts(UI.draft.sections[scr.sec]),
    body: focusGrid('sec:' + scr.sec, UI.draft.sections[scr.sec]),
    foot: `<button class="cbtn" data-act="fauto" data-path="sec:${scr.sec}">おまかせ</button><button class="cbtn pri" data-act="cback" ${focusValid(UI.draft.sections[scr.sec]) ? '' : 'disabled'}>決定</button>`,
  }) },
  indivPick: { render: (c, scr) => {
    const sec = scr.sec || UI.indSec || 'hs', ms = membersOfSection(sec), pg = paged(ms, scr.page, 40), sel = UI.draft.members;
    return {
      back: true, crumb: '個人練習 › <b>対象を選ぶ</b>', badge: `<span class="cbadge">${sel.length}/${CONFIG.individualMaxTargets}名</span>`,
      body: tabs(SECTIONS.map(s => [s.id, s.name]), sec) + pg.items.map(m => `<button class="crow slim ${sel.includes(m.id) ? 'sel' : ''}" data-act="indPick" data-id="${m.id}">${badge(memberRank(m))}<span class="cr-main"><span class="cr-t">${sel.includes(m.id) ? '✓ ' : ''}${esc(m.name)}</span><span class="cr-s">${INST[m.inst].abbr}・平均${Math.round(memberAvg(m))}</span></span></button>`).join('') + (ms.length ? '' : '<div class="cnote">団員がいません</div>'),
      foot: `${pager(pg)}<button class="cbtn pri" data-act="cgo" data-v="indivFocus" ${sel.length ? '' : 'disabled'}>次へ</button>`,
    };
  } },
  indivFocus: { render: c => ({
    back: true, crumb: '個人練習 › <b>重点項目</b>', badge: pts(UI.draft.indFocus),
    body: focusGrid('ind', UI.draft.indFocus),
    foot: `<button class="cbtn" data-act="fauto" data-path="ind">おまかせ</button><button class="cbtn pri" data-act="runPractice" data-m="individual" ${focusValid(UI.draft.indFocus) && UI.draft.members.length ? '' : 'disabled'}>練習開始</button>`,
  }) },
  log: { render: (c, scr) => {
    const log = c.practices[c.practices.length - 1] || UI.lastLog;
    const menuN = { tutti: '全体合奏', section: 'セクション練習', individual: '個人練習', hall: 'ホール練習' }[log.menu];
    const rows = SECTIONS.filter(s => log.sections[s.id]).map(s => `<div class="s">${s.name}</div>${SECTION_PARAMS.map(p => { const v = log.sections[s.id][p.id] || 0; return `<div class="${v ? 'delta' : 'z'}">${v ? '+' + Math.round(v) : '·'}</div>`; }).join('')}`).join('');
    const extra = [...Object.entries(log.overall).map(([k, v]) => `${OVERALL_PARAMS.find(o => o.id === k).name}+${round1(v)}`), ...[['comp', '完成度'], ['underst', '理解度']].filter(([k]) => log.mastery[k]).map(([k, n]) => `${n}+${round1(log.mastery[k])}`), ...log.songParams.map(x => `曲の${SONG_PARAMS.find(p => p.id === x.param).name}+1`)];
    const done = c.phase !== 'practice';
    return {
      crumb: `${log.no === 'H' ? 'ホール練習' : `第${log.no}回 ${menuN}`}<b>練習の成果</b>`,
      body: (rows ? `<div class="dgrid mini"><div></div>${SECTION_PARAMS.map(p => `<div class="h">${p.short}</div>`).join('')}${rows}</div>` : '') + `<div class="growl" style="margin-top:6px">${extra.map(x => `<span class="tag ok">${x}</span>`).join('')}</div>`,
      foot: `<button class="cbtn pri big" data-act="${done ? 'cRoot' : 'cHome'}">${done ? (c.phase === 'prep' ? '本番準備へ進む' : '続ける') : '次の練習へ'}</button>`,
    };
  } },
  perf: { render: (c, scr) => {
    const tab = scr.tab || 'sec', ov = effectiveOverall(c);
    const body = tab === 'sec' ? SECTIONS.map(s => stat(s.name, mean(SECTION_PARAMS.map(x => c.perf.sections[s.id][x.id])))).join('')
      : OVERALL_PARAMS.map(o => stat(o.name, ov[o.id], null, 'wine')).join('') + stat('楽曲完成度', c.perf.mastery.comp) + stat('楽曲理解度', c.perf.mastery.underst);
    return { back: true, crumb: '<b>現在の仕上がり</b>', body: tabs([['sec', 'セクション'], ['all', '全体・楽曲']], tab) + `<div class="dbox">${body}</div>` };
  } },
  history: { render: (c, scr) => {
    const list = c.practices.slice().reverse(), pg = paged(list, scr.page);
    return { back: true, crumb: '<b>練習履歴</b>', body: pg.items.map(l => `<div class="crow static"><span class="sn">${l.no === 'H' ? 'ホール' : '第' + l.no + '回'}</span><span class="cr-s grow">${esc(l.summary)}</span></div>`).join(''), foot: pager(pg) };
  } },

  /* ===== 本番準備 ===== */
  prep: { render: c => {
    const info = successInfo(c), pol = CONFIG.policies[c.policy], cd = activeConductor(), hall = info.hall;
    const tile = (go, l, v, cls = '') => `<button class="tile ${cls}" data-act="cgo" data-v="${go}"><span>${l}</span><b>${v}</b></button>`;
    return {
      crumb: `本番準備<b>『${esc(info.readiness.song.title)}』</b>`,
      body: `<div class="probrow"><div class="pbig">${Math.round(info.prob * 100)}<small>%</small></div><div class="pinfo"><span>成功確率</span><span class="muted ell">${esc(hall.name)}・指揮 ${esc(cd ? cd.name : '—')}</span></div></div>
        <div class="tiles">${tile('rehearse', 'ホール練習', c.rehearsal.done ? '実施済み ✓' : hall.rehearsalFee ? yen(hall.rehearsalFee) : '無料', c.rehearsal.done ? 'done' : '')}
        ${tile('policy', '指揮方針', pol.name)}${tile('perf', '仕上がり', `完成度 ${Math.round(c.perf.mastery.comp)}`)}${tile('prepInfo', '編成・収支', info.readiness.short.items.length || info.overflow ? '注意あり' : '問題なし', info.readiness.short.items.length || info.overflow ? 'warn' : '')}</div>`,
      foot: `<button class="cbtn pri big" data-act="perform">本番を開始する</button>`,
    };
  } },
  rehearse: { render: c => {
    const hall = concertHall(c), why = rehearsalBlockReason(c);
    return {
      back: true, crumb: '本番準備 › <b>ホール練習</b>',
      body: c.rehearsal.done ? '<div class="cmsg">ホール練習は実施済みです</div><div class="cnote">成功率と演奏の安定性が上がっています。</div>'
        : `<div class="cmsg">${esc(hall.name)}で通し練習を行いますか？</div><div class="cnote">成功率が約${Math.round(CONFIG.concert.hallBonus * 100)}%上がり、演奏のばらつきが減ります${hall.pressure ? `。一流会場の重圧（−${Math.round(hall.pressure * 100)}%）も解消されます` : ''}。</div><div class="kvc"><span>費用</span><span>${hall.rehearsalFee ? yen(hall.rehearsalFee) : '無料'}（任意・1回）</span></div>${why ? `<div class="creason">${esc(why)}</div>` : ''}`,
      foot: c.rehearsal.done ? '' : `<button class="cbtn pri" data-act="hall" ${why ? 'disabled' : ''}>ホール練習を行う</button>`,
    };
  } },
  policy: { render: c => {
    const tr = activeConductor() && CTRAIT[activeConductor().trait];
    return {
      back: true, crumb: '本番準備 › <b>指揮方針</b>', badge: tr && tr.policy ? '<span class="cbadge">★ 指揮者の得意</span>' : '',
      body: `<div class="pol2">${Object.entries(CONFIG.policies).map(([id, p]) => `<button class="${c.policy === id ? 'on' : ''}" data-act="policy" data-v="${id}"><b>${tr && tr.policy === id ? '★ ' : ''}${p.name}</b><span>${p.desc}</span></button>`).join('')}</div>`,
    };
  } },
  prepInfo: { render: (c, scr) => {
    const tab = scr.tab || 'form', info = successInfo(c), r = info.readiness, hall = info.hall;
    const est = rk => settlementFor(c, { S: 88, A: 76, B: 65, C: 52, D: 35 }[rk], rk).net;
    const att = attendanceRate(c);
    const body = tab === 'form'
      ? (r.short.items.length ? `<div class="kvc"><span>不足</span><span class="warnt">${r.short.items.map(i => `${INST[i.inst].abbr} ${i.lack}名`).join('、')}（成功率 ×${Math.round(r.mult * 100)}%）</span></div>` : '<div class="kvc"><span>編成</span><span class="okt">必要な編成が揃っています</span></div>')
        + (info.overflow ? `<div class="kvc"><span>舞台</span><span class="warnt">${songPlayers(r.song)}名編成に対し舞台は${hall.stage}名まで。響きが飽和します</span></div>` : `<div class="kvc"><span>舞台</span><span>${songPlayers(r.song)}名 / ${hall.stage}名まで</span></div>`)
        + `<div class="kvc"><span>仕上がり</span><span>${Math.round(r.composite)}（目安 ${Math.round(r.required)}）</span></div>`
      : `<div class="kvc"><span>集客</span><span>${Math.round(hall.capacity * att)}名（${Math.round(att * 100)}%）・チケット ${yen(ticketRevenue(c))}</span></div>
         <div class="kvc"><span>費用</span><span>運営費 ${yen(operatingCost())}${conductorFee(activeConductor()) ? `・指揮者 ${yen(conductorFee(activeConductor()))}` : ''}</span></div>
         <div class="kvc"><span>見込み</span><span>S ${yenS(est('S'))}／B ${yenS(est('B'))}／D ${yenS(est('D'))}</span></div>`;
    return { back: true, crumb: '本番準備 › <b>編成・収支</b>', body: tabs([['form', '編成'], ['money', '収支の見込み']], tab) + `<div class="dbox">${body}</div>` };
  } },

  /* ===== 本番中（最小限） ===== */
  show: { kind: 'show', render: () => ({ head: false, body: `<div class="showbar"><span class="muted">本番中・視点は上で切替</span><button class="cbtn" data-act="skipShow">スキップして結果へ</button></div>` }) },

  /* ===== 結果 ===== */
  result: { render: c => {
    const r = c.result, s = r.settlement;
    const tile = (go, l, v) => `<button class="tile" data-act="cgo" data-v="${go}"><span>${l}</span><b>${v}</b></button>`;
    return {
      crumb: `${esc(c.title)}<b>結果発表</b>`,
      body: `<div class="resrow"><div class="rgrade">${r.rank}</div><div class="rinfo"><span class="stamp ${r.success ? 'ok' : 'ng'}">${r.success ? '演奏成功' : '演奏に乱れ'}</span><span>総合 ${r.total}点・成功確率 ${Math.round(r.prob * 100)}%</span><span>本番の収支 <b class="${s.net < 0 ? 'neg' : 'pos'}">${yenS(s.net)}</b>・評判 ${Math.round(r.repBefore)}→${Math.round(r.repAfter)}</span></div></div>
        <div class="tiles">${tile('resEval', '項目別評価', `技術 ${r.cats.tech}`)}${tile('resReview', '講評', `${r.reviews.length}件`)}${tile('resGrowth', '育成・成長', `${Object.keys(c.growth).length}名`)}${tile('resMoney', '収支', yen(s.net))}</div>`,
      foot: `<button class="cbtn pri big" data-act="next">次の演奏会へ進む</button>`,
    };
  } },
  resEval: { render: c => ({ back: true, crumb: '結果 › <b>項目別評価</b>', body: `<div class="dbox">${EVAL_CATS.map(cat => stat(cat.name, c.result.cats[cat.id])).join('')}<div class="muted">${CONFIG.policies[c.result.policy].name}${c.result.rehearsal ? '・ホール練習あり' : ''}</div></div>` }) },
  resReview: { render: (c, scr) => { const pg = paged(c.result.reviews, scr.page, 100); return { back: true, crumb: '結果 › <b>講評</b>', body: pg.items.map(l => `<div class="rv"><b>${esc(l.k)}</b>${esc(l.t)}</div>`).join(''), foot: pager(pg) }; } },
  resGrowth: { render: (c, scr) => {
    const r = c.result;
    const rows = Object.entries(c.growth).map(([id, g]) => ({ m: memberById(id), g })).filter(x => x.m).map(({ m, g }) => `<div class="crow static slim">${badge(memberRank(m))}<span class="cr-t grow ell">${esc(m.name)}</span><span class="growl">${Object.entries(g).map(([a, v]) => `<span class="tag ok">${abilShort(a)}+${v}</span>`).join('')}</span></div>`);
    if (r.conductorName) rows.unshift(`<div class="crow static slim"><span class="tag gold">指揮者</span><span class="cr-t grow ell">${esc(r.conductorName)}</span><span class="growl">${(r.conductorGrowth || []).map(g => `<span class="tag ok">${CABIL[g.abil].short} ${g.from}→${g.to}</span>`).join('') || '<span class="muted">変化なし</span>'}</span></div>`);
    const pg = paged(rows, scr.page);
    return { back: true, crumb: '結果 › <b>育成・成長</b>', body: pg.items.join('') || '<div class="cnote">今回は育成を行いませんでした。</div>', foot: pager(pg) };
  } },
  resMoney: { render: c => { const s = c.result.settlement; const L = (l, v) => `<div class="kvc"><span>${l}</span><span class="${v < 0 ? 'neg' : 'pos'}">${yenS(v)}</span></div>`;
    return { back: true, crumb: '結果 › <b>本番の収支</b>', body: `<div class="dbox">${L(`チケット（${s.audience}名）`, s.ticket)}${L('出来高', s.perf)}${L('協賛金', s.sponsor)}${L('運営費', -s.operating)}${s.conductorFee ? L('指揮者出演料', -s.conductorFee) : ''}<div class="muted">現在の資金 ${yen(STATE.funds)}</div></div>` }; } },
};

/* ---------- 本番の演出 ---------- */
function startShow(c) {
  const r = c.result, song = findSong(c.songId), hall = findHall(c.hallId);
  const sc = Music.createScore(song, { seed: hashStr(c.id + song.id), sections: songSections(song).filter(s => membersOfSection(s).length) });
  UI.showing = true; UI.caption = '開演前';
  Music.setMuted(!soundOn());
  render();
  Stage3D.setCamera('overview');
  Stage3D.playShow({
    score: sc, quality: showQuality(c), acoustics: hall.acoustics,
    fill: clamp(r.settlement.audience / hall.capacity, 0, 1),
    applause: { S: 1, A: 0.85, B: 0.65, C: 0.45, D: 0.3 }[r.rank], standing: r.rank === 'S' || r.rank === 'A',
    applauseLabel: r.rank === 'S' || r.rank === 'A' ? 'スタンディングオベーション！' : r.success ? '観客の拍手' : '控えめな拍手',
    onCaption: (label) => { UI.caption = label; const el = document.getElementById('cap3d'); if (el) { el.textContent = label; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); } },
    onEnd: () => { UI.showing = false; render(); toast(`結果発表：総合評価 ${r.rank}`); },
  });
}

/* ---------- 操作（演奏会タブ） ---------- */
function closeToSetup(msg) { cmdHome(); UI.previewHall = null; render(); if (msg) toast(msg); }
Object.assign(ACTIONS, {
  startConcert() { startSetup(activeConcert()); UI.cmd = null; render(); },
  cgo(d) {
    const scr = { s: d.v };
    if (d.g) scr.g = d.g; if (d.id) scr.id = d.id; if (d.sec) scr.sec = d.sec;
    if (d.v === 'hallDetail') UI.previewHall = d.id;
    if (d.v === 'tutti' || d.v === 'section' || d.v === 'indivPick') UI.draft.menu = d.v === 'indivPick' ? 'individual' : d.v;
    cmdGo(scr); render();
  },
  cback() { const t = cmdTop(); if (t.s === 'hallDetail') UI.previewHall = null; cmdBack(); render(); },
  cHome() { cmdHome(); render(); },
  cRoot() { UI.cmd = null; render(); },
  ctab(d) { const t = cmdTop(); if (t.s === 'indivPick') { cmdSet({ sec: d.v, page: 0 }); UI.indSec = d.v; } else cmdSet({ tab: d.v }); render(); },
  cpage(d) { cmdSet({ page: (cmdTop().page || 0) + Number(d.d) }); render(); },
  chooseSong(d) { if (confirmSong(activeConcert(), d.id)) closeToSetup(`選曲：『${findSong(d.id).title}』に決定しました`); },
  reserveHall(d) { const h = findHall(d.id); if (selectHall(activeConcert(), d.id)) closeToSetup(`${h.name}を予約しました${h.fee ? `（${yen(h.fee)}）` : ''}`); else render(); },
  chooseCond(d) { if (selectConcertConductor(activeConcert(), d.id)) closeToSetup(`${activeConductor().name}が今回の指揮を担当します`); },
  goHireCond() { UI.tab = 'members'; UI.memView = 'conductors'; render(); scrollTop(); },
  toPractice() { const c = activeConcert(); if (startPractice(c)) { UI.cmd = null; render(); toast('準備完了！ 練習期間に入ります'); } },
  runPractice(d) {
    UI.draft.menu = d.m;
    const c = activeConcert();
    const r = runPractice(c, JSON.parse(JSON.stringify(buildPlan())));
    if (r.error) { toast(r.error); return; }
    UI.lastLog = r.log;
    if (d.m === 'section') SECTIONS.forEach(s => UI.draft.sections[s.id] = autoSectionFocus(c, s.id));   // 次回用に再提案
    // 練習の成果画面を表示（段階が本番準備に変わっていても、まず成果を見せる）
    UI.cmd = { cid: c.id, phase: c.phase, stack: [rootScreen(c), { s: 'log' }] };
    render();
    if (use3D()) Stage3D.playPractice(r.log.plan, practiceQuality(c));
    if (c.phase === 'prep') toast('10回の練習が終了しました');
  },
});
/* ---------- 指揮者 ---------- */
const traitOf = cd => CTRAIT[cd.trait] || { name: '—', desc: '' };
function condStats(cd) { return CONDUCTOR_ABILITIES.map(a => stat(a.name, cd.abilities[a.id], cd.potential[a.id], 'wine')).join(''); }
function renderConductorCard(cd, opts = {}) {
  const tr = traitOf(cd), fee = conductorFee(cd), active = STATE.conductorId === cd.id;
  return `<div class="card ${active ? 'gold' : ''}"><div class="row">${badge(condRank(cd))}<div class="grow" style="min-width:0">
      <div style="font-family:var(--serif);font-size:16px">${esc(cd.name)}${cd.original ? ' <span class="tag gold">オリジナル</span>' : ''}${active ? ' <span class="tag ok">担当中</span>' : ''}</div>
      <div class="muted">${tr.name}・出演料 ${fee ? yen(fee) + '/回' : '無償（常任）'}・指揮 ${cd.concerts || 0}回</div></div>${opts.cost ? `<div class="cost">${yen(opts.cost)}</div>` : ''}</div>
    <p class="sub" style="margin:6px 0">${esc(cd.profile || tr.desc)}</p>
    <div class="muted" style="margin-bottom:4px">個性：${esc(tr.desc)}</div>
    ${condStats(cd)}
    ${opts.actions || ''}</div>`;
}
function renderConductors() {
  const M = STATE.conductorMarket;
  const hired = STATE.conductors.map(cd => {
    const dr = dismissConductorBlockReason(cd.id);
    const actions = STATE.conductorId === cd.id ? '' : `<div class="row" style="margin-top:8px"><button class="btn gold grow" data-act="condSet" data-id="${cd.id}">担当にする</button><button class="btn grow" data-act="condFire" data-id="${cd.id}" ${dr ? 'disabled' : ''}>契約解除</button></div>`;
    return renderConductorCard(cd, { actions });
  }).join('');
  const cands = M.candidates.map(cd => {
    const why = conductorHireBlockReason(cd), done = M.hired.includes(cd.id);
    return renderConductorCard(cd, { cost: cd.cost, actions: done ? '<button class="btn block" disabled>契約済み</button>' : `<div style="height:8px"></div><button class="btn ${why ? '' : 'gold'} block" data-act="condHire" data-id="${cd.id}" ${why ? 'disabled' : ''}>契約する</button>${why ? `<div class="reason">契約できません：${esc(why)}</div>` : ''}` });
  }).join('');
  return `<div class="row sp" style="margin:6px 0 10px"><button class="btn sm" data-act="closeCond">← 団員一覧に戻る</button><span class="muted">資金 <b class="num">${yen(STATE.funds)}</b></span></div>
  <h2>指揮者</h2>
  <p class="sub" style="margin-top:-6px">担当指揮者の能力は、合奏練習の効率・本番の仕上がりと評価・集客に影響します。指揮者は演奏会を重ねると成長し、「育成」タブで鍛えることもできます。</p>
  <h3>契約中（${STATE.conductors.length}/${CONFIG.conductor.maxHired}）</h3>${hired}
  <h3 style="margin-top:16px">指揮者候補</h3>${cands}
  <div class="card"><div class="row sp"><div><div>候補の再調査</div><div class="muted">候補者を入れ替えます（${yen(CONFIG.conductor.rerollCost)}）。新しい演奏会が始まると無料で入れ替わります。</div></div>
    <button class="btn sm" data-act="condReroll" ${STATE.funds < CONFIG.conductor.rerollCost ? 'disabled' : ''}>再調査</button></div></div>
  <button class="btn block" data-act="closeCond">閉じる</button>`;
}
function conductorSummary() {
  const cd = activeConductor(); if (!cd) return '';
  return `<div class="card condcta"><div class="row sp"><div class="grow" style="min-width:0"><div class="muted">担当指揮者</div>
    <div style="font-family:var(--serif);font-size:16px;color:var(--gold2)">${esc(cd.name)} <span class="muted" style="font-size:12px">${traitOf(cd).name}</span></div>
    <div class="muted">${CONDUCTOR_ABILITIES.map(a => `${a.short} ${cd.abilities[a.id]}`).join('・')}</div></div>
    <button class="btn" data-act="openCond">指揮者</button></div></div>`;
}

/* ---------- 操作 ---------- */
Object.assign(ACTIONS, {
  cam(d) { Stage3D.setCamera(d.v); document.querySelectorAll('.camrow [data-act=cam]').forEach(b => b.classList.toggle('on', b.dataset.v === d.v)); },
  sound() { const on = !soundOn(); try { localStorage.setItem('orchestraSim.sound', on ? 'on' : 'off'); } catch (e) {} Music.setMuted(!on); render(); },
  skipShow() { Stage3D.skipShow(); },
  openCond() { UI.memScroll = window.scrollY; UI.memView = 'conductors'; UI.sheetMember = null; render(); scrollTop(); },
  closeCond() { UI.memView = 'list'; render(); window.scrollTo(0, UI.memScroll || 0); },
  condHire(d) { const cd = STATE.conductorMarket.candidates.find(x => x.id === d.id); if (hireConductor(d.id)) toast(`${cd.name} と契約しました（${yen(cd.cost)}）`); render(); },
  condSet(d) { if (setActiveConductor(d.id)) toast(`${activeConductor().name} が担当指揮者になりました`); render(); },
  condFire(d) { const cd = STATE.conductors.find(x => x.id === d.id); if (dismissConductor(d.id)) toast(`${cd.name} との契約を解除しました`); render(); },
  condReroll() { if (rerollConductors()) toast('新しい指揮者候補が見つかりました'); render(); },
  hall() { const log = runHallPractice(activeConcert()); if (log) { toast('ホール練習を行いました'); if (cmdTop().s === 'rehearse') cmdBack(); } render(); },
  policy(d) { activeConcert().policy = d.v; save(); if (cmdTop().s === 'policy') cmdBack(); render(); toast(`指揮方針：${CONFIG.policies[d.v].name}`); },
  setPrincipal(d) { const m = memberById(d.id); if (setPrincipal(d.id)) toast(`${m.name} を ${INST[m.inst].abbr} の首席に任命しました`); renderSheet(); render(); },
});
