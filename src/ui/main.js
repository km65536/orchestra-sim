/* =========================================================
 * UI — スマートフォン縦画面優先
 * ========================================================= */
const UI = {
  tab: 'home', memSec: 'all', memView: 'list', memScroll: 0, recruitView: 'cards', draft: null, lastLog: null,
  sheetMember: null, confirmDismiss: false, confirmReset: false, indSec: 'hs', started: false,
  genre: 'orchestral', pickSong: null,
  train: { t: 'masterclass', sec: 'hs', memSec: 'hs', member: null, ability: 'tech', last: null },
};
const PHASES = [
  { id: 'setup', name: '準備' },
  { id: 'practice', name: '練習' }, { id: 'prep', name: '本番準備' }, { id: 'result', name: '結果' },
];
const phaseName = p => (PHASES.find(x => x.id === p) || { name: '完了' }).name;
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const yen = n => (n < 0 ? '−¥' : '¥') + Math.abs(Math.round(n)).toLocaleString('ja-JP');
const yenS = n => (n >= 0 ? '+' : '') + yen(n);
const badge = r => `<span class="badge rk-${r}">${r}</span>`;
const bar = (v, max = 100, cls = '', pot = null) => `<div class="bar ${cls}">${pot != null ? `<i class="pot" style="width:${clamp(pot / max * 100, 0, 100)}%"></i>` : ''}<i style="width:${clamp(v / max * 100, 0, 100)}%"></i></div>`;
const stat = (label, v, pot = null, cls = '') => `<div class="stat"><span>${label}</span>${bar(v, 100, cls, pot)}<span class="v">${Math.round(v)}${pot != null ? `<small>/${pot}</small>` : ''}</span></div>`;
const memberById = id => STATE.members.find(m => m.id === id);
const abilShort = id => (ABIL[id] || CABIL[id] || { short: id }).short;

/* ---------- 起動 ---------- */
function boot() {
  UI.started = load();
  render();
  document.addEventListener('click', onClick);
  window.addEventListener('resize', () => clampWin());
}

/* ---------- 描画 ---------- */
function render() {
  const app = document.getElementById('app');
  if (!UI.started) { app.innerHTML = renderTitle(); renderNav(false); return; }
  const c = activeConcert();
  ensureDraft(c);
  const views = { home: renderHome, concert: renderConcert, train: renderTrain, members: renderMembers, records: renderRecords };
  // 演奏会タブは専用のゲーム画面（上：3D／下：コマンドパネル、全体は固定でスクロールしない）
  const game = UI.tab === 'concert';
  const in3d = game && use3D();
  document.body.classList.toggle('game', game);
  document.body.classList.toggle('mode3d', in3d);
  // ホーム・団員・育成・記録は階層型の固定画面（ui_tabs.js）。演奏会タブは従来どおり
  document.body.classList.toggle('tabsui', !game);
  if (game) {
    const body = renderConcertGame(c);
    app.innerHTML = renderHeader(c, game) + `<main class="${game ? 'gm' : ''}">${body}</main>`;
  } else app.innerHTML = renderTabsUI(c);
  void views;
  renderNav(true);
  renderSheet();
  if (game) {
    const hdr = app.querySelector('.top'); if (hdr) document.documentElement.style.setProperty('--hdr', hdr.offsetHeight + 'px');
    if (in3d) { sync3D(c); Stage3D.setVisible(true); Stage3D.resize(); }
  } else if (typeof Stage3D !== 'undefined' && Stage3D.ok) Stage3D.setVisible(false);
}
function renderTitle() {
  return `<main style="padding-top:10vh"><div class="card gold hero">
    <div class="muted" style="letter-spacing:.3em">ORCHESTRA MANAGEMENT</div>
    <div class="ttl" style="font-size:24px;margin:8px 0 4px">楽団運営記</div>
    <p class="sub">会場を押さえ、団員を集めて育て、曲を選んで定期演奏会へ。<br>限られた資金をどう使うかが、楽団の未来を決めます。</p>
    ${LOAD_NOTE ? `<div class="short" style="text-align:left">${esc(LOAD_NOTE)}</div>` : ''}
    <div style="text-align:left;margin:16px 0 8px"><label class="muted">楽団名</label>
    <input class="input" id="newName" value="星霜フィルハーモニー管弦楽団" maxlength="24"></div>
    <div class="muted" style="margin-bottom:10px">初期資金 ${yen(CONFIG.initialFunds)}・団員42名からスタート</div>
    <button class="btn pri block" data-act="newgame">楽団を始める</button></div></main>`;
}
function renderHeader(c, compact) {
  // 本番の演出中は結果（資金・評判の変化）を先に見せない
  const sh = UI.showing && c.result;
  const funds = sh ? STATE.funds - c.result.settlement.net : STATE.funds, rep = sh ? c.result.repBefore : STATE.reputation;
  if (compact) return `<header class="top compact"><div class="row sp"><span class="ellip grow"><b class="ph">${esc(c.title)}・${sh ? '本番' : phaseName(c.phase)}</b><span class="muted"> 評判 ${Math.round(rep)}</span></span><span class="funds ${funds < 0 ? 'neg' : ''}">${yen(funds)}</span></div></header>`;
  return `<header class="top"><div class="row sp"><div class="name grow">${esc(STATE.orchestraName)}</div><div class="funds ${funds < 0 ? 'neg' : ''}">${yen(funds)}</div></div>
    <div class="meta"><span>団員 <b>${STATE.members.length}</b>名</span><span>評判 <b>${Math.round(rep)}</b></span><span class="ellip">${esc(c.title)}・<b>${sh ? '本番' : phaseName(c.phase)}</b></span></div></header>`;
}
function renderNav(show) {
  let nav = document.getElementById('nav');
  if (!show) { if (nav) nav.remove(); return; }
  if (!nav) { nav = document.createElement('nav'); nav.id = 'nav'; nav.className = 'nav'; document.body.appendChild(nav); }
  const items = [['home', '館', 'ホーム'], ['concert', '♪', '演奏会'], ['train', '育', '育成'], ['members', '團', '団員'], ['records', '録', '記録']];
  nav.innerHTML = `<div class="in">${items.map(([id, ic, l]) => `<button data-act="tab" data-tab="${id}" class="${UI.tab === id ? 'on' : ''}"><span class="ic">${ic}</span>${l}${id === 'concert' && UI.tab !== 'concert' ? '<span class="dot"></span>' : ''}</button>`).join('')}</div>`;
}

/* ---------- ホーム ---------- */
function nextActionText(c) {
  return {
    setup: [c.started ? '選曲・会場の予約・指揮者の選択を完了しましょう' : '新しい演奏会を始めましょう', c.started ? '準備を続ける' : '演奏会を始める'],
    practice: [`練習 ${c.practiceDone}/${CONFIG.practiceCount} 回目まで完了`, '練習を行う'],
    prep: ['本番前の最終確認をしましょう', '本番準備へ'],
    result: ['演奏会が終わりました', '結果を見る'],
  }[c.phase];
}
function renderHome(c) {
  const [t, b] = nextActionText(c);
  const past = STATE.concertOrder.map(id => STATE.concertPrograms[id]).filter(x => x.result).reverse();
  const ranks = {}; STATE.members.forEach(m => { const r = memberRank(m); ranks[r] = (ranks[r] || 0) + 1; });
  const hall = concertHall(c);
  return `
  <div class="card gold hero">
    <div class="muted">現在の演奏会</div>
    <div class="ttl">${esc(c.title)}</div>
    <div class="phase">${phaseName(c.phase)} ― ${t}</div>
    <button class="btn pri block" data-act="tab" data-tab="concert">${b}</button>
  </div>
  <div class="kpis" style="margin-bottom:12px">
    <div class="kpi"><div class="l">所持資金</div><div class="v ${STATE.funds < 0 ? 'neg' : ''}">${yen(STATE.funds)}</div></div>
    <div class="kpi"><div class="l">評判</div><div class="v">${Math.round(STATE.reputation)}<small style="font-size:12px">/100</small></div></div>
    <div class="kpi"><div class="l">開催回数</div><div class="v">${past.length}<small style="font-size:12px">回</small></div></div>
  </div>
  <div class="card"><h3>今回の演奏会</h3>
    <div class="row" style="margin-bottom:8px"><span class="muted" style="width:52px">会場</span><span class="grow">${hall ? esc(hall.name) : '<span class="muted">未定</span>'}</span></div>
    <div class="row" style="margin-bottom:8px"><span class="muted" style="width:52px">指揮</span><span class="grow">${esc(activeConductor()?.name || '—')}</span></div>
    ${c.songId ? renderSongButton(c.songId, '曲目') : '<div class="row"><span class="muted" style="width:52px">曲目</span><span class="muted">未定</span></div>'}
  </div>
  <div class="card"><h3>団員構成</h3>
    <div class="row wrap" style="gap:6px">${['S', 'A', 'B', 'C', 'D', 'E'].map(r => `<span class="row" style="gap:4px">${badge(r)}<span class="num">${ranks[r] || 0}</span></span>`).join('')}</div>
    <div class="hr"></div>
    ${SECTIONS.map(s => { const v = mean(membersOfSection(s.id).map(memberAvg)); return `<div class="stat"><span>${s.name}<small class="muted"> ${membersOfSection(s.id).length}名</small></span>${bar(v)}<span class="v">${Math.round(v)}</span></div>`; }).join('')}
    <div class="muted" style="margin-top:4px">数値はセクション団員の平均能力。能力は「育成」で伸ばせます。</div>
  </div>
  <div class="card"><h3>最近の演奏会</h3>${past.length ? past.slice(0, 4).map(p => `<div class="row sp" style="padding:6px 0;border-bottom:1px solid var(--line)"><div class="grow" style="min-width:0"><div style="font-family:var(--serif)">${esc(p.title)}</div><div class="muted ellip">${esc(findSong(p.songId).title)}</div></div>${badge(p.result.rank)}<span class="num ${p.result.settlement.net < 0 ? 'neg' : 'pos'}" style="min-width:84px;text-align:right">${yenS(p.result.settlement.net)}</span></div>`).join('') : '<div class="muted">まだ演奏会は開催されていません。</div>'}</div>`;
}
function renderSongButton(id, label) {
  const s = findSong(id);
  return `<button class="prog-item" data-act="song" data-id="${id}"><span class="slot">${label}</span><span class="grow"><span class="t">${esc(s.title)}</span><br><span class="muted">${esc(s.composer)}・${s.duration}分・${difficultyLabel(s.difficulty)}</span></span><span class="muted">›</span></button>`;
}

/* ---------- 演奏会（フェーズ別） ---------- */
function renderSteps(c) {
  const idx = PHASES.findIndex(p => p.id === c.phase);
  return `<div class="steps">${PHASES.map((p, i) => `<span class="${i < idx ? 'done' : i === idx ? 'on' : ''}"></span>`).join('')}</div>
    <div class="steplbl">${PHASES.map(p => `<span>${p.name}</span>`).join('')}</div>`;
}
// ※ 以下の renderConcert とフェーズ別の画面は v4 までの縦長レイアウト。演奏会タブは ui3d.js のコマンド画面に置き換えた
function renderConcert(c) {
  const body = { hall: renderHallSelect, selection: renderSelection, practice: renderPractice, prep: renderPrep, result: renderResult }[c.phase];
  return `<h2>${esc(c.title)}</h2>${renderSteps(c)}${body ? body(c) : ''}`;
}

/* --- 会場選択 --- */
function renderHallSelect(c) {
  const E = CONFIG.economy;
  return `<p class="sub">演奏会の会場を押さえます。使用料はこの場で支払い、会場は本番まで変更できません。良い会場ほど響きが良く集客も見込めますが、使用料は高く、評判が低いうちは空席も目立ちます。</p>
  <div class="card"><div class="row sp"><span>現在の資金</span><b class="num">${yen(STATE.funds)}</b></div>
    <div class="row sp muted"><span>本番後の運営費（見込み）</span><span class="num">${yen(operatingCost())}</span></div></div>
  ${CONFIG.halls.map(h => {
    const reason = hallBlockReason(c, h);
    const att = clamp(h.attendance + STATE.reputation * h.repSens, E.attendanceMin, E.attendanceMax);
    const est = Math.round(h.capacity * att) * h.ticket;
    return `<div class="card hall"><div class="row sp"><div class="grow" style="min-width:0"><span class="tag">${h.grade}</span><div class="hn">${esc(h.name)}</div></div><div class="fee">${h.fee ? yen(h.fee) : '無料'}</div></div>
      <p class="sub" style="margin:6px 0 8px">${esc(h.feature)}</p>
      ${stat('音響性能', h.acoustics, null, 'blue')}
      <dl class="kv kv3"><dt>収容人数</dt><dd>${h.capacity.toLocaleString()}席</dd><dt>チケット</dt><dd>${yen(h.ticket)}</dd><dt>舞台</dt><dd>${h.stage}名まで</dd>
      <dt>予想集客</dt><dd>約${Math.round(att * 100)}%（${Math.round(h.capacity * att)}名）</dd><dt>チケット収入</dt><dd>約${yen(est)}</dd><dt>ホール練習</dt><dd>${h.rehearsalFee ? yen(h.rehearsalFee) : '無料'}</dd></dl>
      ${h.pressure ? `<div class="muted">一流会場の重圧：ホール練習をしないと成功率 −${Math.round(h.pressure * 100)}%</div>` : ''}
      <div class="muted">評判への影響 ×${h.prestige}</div>
      <div style="height:8px"></div>
      <div class="row" style="gap:8px">${use3D() ? `<button class="btn ${UI.previewHall === h.id ? 'on' : ''}" data-act="previewHall" data-id="${h.id}">3Dで見る</button>` : ''}<button class="btn ${reason ? '' : 'gold'} grow" data-act="hallPick" data-id="${h.id}" ${reason ? 'disabled' : ''}>${h.fee ? `${yen(h.fee)} を支払って予約` : 'この会場で開催'}</button></div>
      ${reason ? `<div class="reason">選べません：${esc(reason)}</div>` : ''}</div>`;
  }).join('')}
  <p class="muted">予想集客は知名度が標準的な曲の場合の目安です。曲の知名度・演奏時間や楽団の評判で変わります。</p>`;
}

/* ---------- 団員募集（団員タブから開く。演奏会の進行とは独立） ---------- */
function renderRecruit() {
  const have = countByInst();
  const cands = STATE.recruit.candidates;
  return `<div class="row sp" style="margin:6px 0 10px"><button class="btn sm" data-act="closeRecruit">← 団員一覧に戻る</button><span class="muted">資金 <b class="num">${yen(STATE.funds)}</b></span></div>
  <h2>団員募集</h2>
  <p class="sub" style="margin-top:-6px">演奏会の進行に関係なく、いつでも採用できます。採用した団員は次の練習からすぐ加わります。</p>
  <div class="card"><div class="row sp"><h3 style="margin:0">現在の編成</h3><span class="muted">在籍 / 上限</span></div><div style="height:8px"></div>
    <div class="capgrid">${INSTRUMENTS.map(i => `<div class="${have[i.id] >= i.cap ? 'full' : ''}">${i.abbr}<b>${have[i.id]}<small class="muted">/${i.cap}</small></b></div>`).join('')}</div></div>
  <div class="row sp" style="margin:4px 2px 10px"><h3 style="margin:0">候補者 ${cands.length}名</h3>
    <div class="seg" style="margin:0;padding:0"><button class="${UI.recruitView === 'cards' ? 'on' : ''}" data-act="rview" data-v="cards">カード</button><button class="${UI.recruitView === 'table' ? 'on' : ''}" data-act="rview" data-v="table">比較表</button></div></div>
  ${UI.recruitView === 'table' ? renderCompareTable() : cands.map(m => renderCandidate(m)).join('')}
  <div class="card"><div class="row sp"><div><div>追加募集</div><div class="muted">候補者を入れ替えます（${yen(CONFIG.rerollRecruitCost)}）。新しい演奏会が始まると無料で入れ替わります。</div></div>
    <button class="btn sm" data-act="reroll" ${STATE.funds < CONFIG.rerollRecruitCost ? 'disabled' : ''}>再募集</button></div></div>
  <button class="btn block" data-act="closeRecruit">募集画面を閉じる</button>
  <p class="muted" style="text-align:center">団員が増えると本番ごとの運営費（${yen(CONFIG.economy.operatingPerMember)}/名）も増えます。</p>`;
}
function renderCandidate(m) {
  const reason = hireBlockReason(m);
  const hired = STATE.recruit.hired.includes(m.id);
  return `<div class="card cand"><div class="head">${badge(memberRank(m))}
    <div class="grow" style="min-width:0"><div class="ellip" style="font-family:var(--serif);font-size:15.5px">${esc(m.name)}${m.original ? '<span class="tag gold" style="margin-left:6px">オリジナル</span>' : ''}</div>
    <div class="muted">${INST[m.inst].abbr}・${SEC[INST[m.inst].section].name}　平均 ${Math.round(memberAvg(m))}／潜在 ${Math.round(memberPotAvg(m))}</div></div>
    <div class="cost">${yen(m.cost)}</div></div>
    ${m.profile ? `<div class="sub" style="margin-bottom:6px">${esc(m.profile)}</div>` : ''}
    ${ABILITIES.map(a => stat(a.name, m.abilities[a.id], m.potential[a.id])).join('')}
    <div style="height:8px"></div>
    ${hired ? '<button class="btn block" disabled>採用済み</button>' : `<button class="btn ${reason ? '' : 'gold'} block" data-act="hire" data-id="${m.id}" ${reason ? 'disabled' : ''}>採用する</button>`}
    ${!hired && reason ? `<div class="reason">採用できません：${esc(reason)}</div>` : ''}</div>`;
}
function renderCompareTable() {
  const cs = STATE.recruit.candidates;
  const best = id => Math.max(...cs.map(m => m.abilities[id]));
  return `<div class="card" style="padding:10px 8px"><table class="cmp"><thead><tr><th></th>${cs.map(m => `<th>${esc(m.name.split(' ')[0])}</th>`).join('')}</tr></thead><tbody>
    <tr><td class="l">楽器</td>${cs.map(m => `<td>${INST[m.inst].abbr}</td>`).join('')}</tr>
    <tr><td class="l">ランク</td>${cs.map(m => `<td>${badge(memberRank(m))}</td>`).join('')}</tr>
    ${ABILITIES.map(a => `<tr><td class="l">${a.short}</td>${cs.map(m => `<td class="${m.abilities[a.id] === best(a.id) ? 'best' : ''}">${m.abilities[a.id]}<br><small>/${m.potential[a.id]}</small></td>`).join('')}</tr>`).join('')}
    <tr><td class="l">平均</td>${cs.map(m => `<td>${Math.round(memberAvg(m))}</td>`).join('')}</tr>
    <tr><td class="l">費用</td>${cs.map(m => `<td>${Math.round(m.cost / 1000)}k</td>`).join('')}</tr>
    <tr><td class="l"></td>${cs.map(m => { const r = hireBlockReason(m); return `<td>${STATE.recruit.hired.includes(m.id) ? '<span class="tag ok">済</span>' : `<button class="btn sm ${r ? '' : 'gold'}" style="padding:0 8px" data-act="hire" data-id="${m.id}" ${r ? 'disabled' : ''}>採用</button>`}</td>`; }).join('')}</tr>
  </tbody></table><div class="muted" style="margin-top:6px">小さい数字は潜在能力。採用できない理由はカード表示で確認できます。</div></div>`;
}

/* --- 選曲（2タブ・一覧から1曲） --- */
function songTags(s, c) {
  const sh = shortageOf(s);
  const t = [`<span class="tag">${difficultyLabel(s.difficulty)}</span>`, `<span class="tag">${s.duration}分</span>`, `<span class="tag">知名度${s.popularity}</span>`];
  if (sh.items.some(i => i.missing)) t.push('<span class="tag bad">楽器欠員</span>');
  else if (sh.items.length) t.push(`<span class="tag warn">編成不足 ${sh.items.reduce((a, i) => a + i.lack, 0)}名</span>`);
  else t.push('<span class="tag ok">編成OK</span>');
  const hall = c && concertHall(c);
  if (hall && songPlayers(s) > hall.stage) t.push(`<span class="tag warn">舞台超過 ${songPlayers(s) - hall.stage}名</span>`);
  const sp = STATE.songParams[s.id]; if (sp && sp.performed) t.push(`<span class="tag gold">演奏歴${sp.performed}</span>`);
  return t.join('');
}
function renderSelection(c) {
  const list = songsOfGenre(UI.genre);
  const sel = UI.pickSong && findSong(UI.pickSong);
  const selbar = `<div class="selbar">${sel ? `<div class="ellip"><span class="muted">選択中</span> <b style="font-family:var(--serif)">${esc(sel.title)}</b></div><button class="btn pri block" data-act="confirmSong">この曲で確定する</button>` : '<div class="muted" style="text-align:center;padding:10px 0">一覧から曲を選んでください</div>'}</div>`;
  const in3d = UI.tab === 'concert' && use3D();   // 3D表示中はパネルが狭いため、確定ボタンを一覧の上に置く
  return `<p class="sub">演奏する曲を<b>1曲</b>選びます。曲をタップすると詳細が開き、3Dでも編成を確認できます。</p>
  ${in3d ? selbar : ''}
  <div class="tabs2">${GENRES.map(g => `<button class="${UI.genre === g.id ? 'on' : ''}" data-act="genre" data-v="${g.id}">${g.name}<small>${songsOfGenre(g.id).length}曲</small></button>`).join('')}</div>
  <div class="songlist">${list.map(s => `<button class="sitem ${UI.pickSong === s.id ? 'picked' : ''}" data-act="pickSong" data-id="${s.id}">
    <span class="chk">${UI.pickSong === s.id ? '●' : '○'}</span>
    <span class="body"><span class="t">${esc(s.title)}</span><span class="c">${esc(s.composer)}（${s.year}）</span><span class="tags">${songTags(s, c)}</span></span></button>`).join('')}</div>
  ${in3d ? '' : selbar}`;
}

/* --- 練習 --- */
function ensureDraft(c) {
  if (UI.draft && UI.draft.cid === c.id) return;
  UI.draft = { cid: c.id, menu: 'tutti', focus: null, indFocus: null, sections: null, members: [], openSec: null };
  UI.lastLog = null; UI.pickSong = null; UI.train.last = null;
}
function fillDraft(c) {
  const d = UI.draft;
  if (!d.focus) d.focus = autoTuttiFocus(c);
  if (!d.indFocus) { d.indFocus = emptyFocus(); d.indFocus.tech = 4; d.indFocus.expr = 3; d.indFocus.pitch = 3; }
  if (!d.sections) { d.sections = {}; SECTIONS.forEach(s => d.sections[s.id] = autoSectionFocus(c, s.id)); }
}
function focusOf(path) { const d = UI.draft; return path === 'tutti' ? d.focus : path === 'ind' ? d.indFocus : d.sections[path.slice(4)]; }
const ftotal = f => FOCUS.reduce((s, x) => s + (f[x.id] || 0), 0);
function renderFocusEditor(path, f) {
  const t = ftotal(f);
  return `<div class="focus">${FOCUS.map(x => `<div class="fitem ${f[x.id] ? 'on' : ''}"><span>${x.name}</span><span class="ctl">
    <button data-act="fp" data-path="${path}" data-f="${x.id}" data-d="-1" ${f[x.id] <= 0 ? 'disabled' : ''} aria-label="${x.name}を減らす">−</button><b>${f[x.id]}</b>
    <button data-act="fp" data-path="${path}" data-f="${x.id}" data-d="1" ${t >= CONFIG.focusPoints ? 'disabled' : ''} aria-label="${x.name}を増やす">＋</button></span></div>`).join('')}</div>
    <div class="ptotal"><span class="${t === CONFIG.focusPoints ? 'ok' : 'ng'}">配分 ${t} / ${CONFIG.focusPoints}${t === CONFIG.focusPoints ? ' ✓' : `（残り ${CONFIG.focusPoints - t}）`}</span>
    <span class="row" style="gap:6px"><button class="btn sm" data-act="fclear" data-path="${path}">クリア</button><button class="btn sm gold" data-act="fauto" data-path="${path}">おまかせ</button></span></div>`;
}
const focusSummary = f => FOCUS.filter(x => f[x.id]).map(x => `${x.name}${f[x.id]}`).join(' ') || '未設定';

function renderPractice(c) {
  fillDraft(c);
  const d = UI.draft;
  const menus = [['tutti', '全体合奏', '全員・曲を通す'], ['section', 'セクション練習', '5セクション同時'], ['individual', '個人練習', '奏者を絞って']];
  let editor = '';
  if (d.menu === 'tutti') {
    editor = `<div class="card"><h3>重点項目</h3>${renderFocusEditor('tutti', d.focus)}</div>`;
  } else if (d.menu === 'section') {
    editor = `<div class="row sp" style="margin:2px 2px 8px"><span class="sub">各セクションに10ポイントずつ配分</span><button class="btn sm gold" data-act="autoAll">全部おまかせ</button></div>
      ${SECTIONS.map(s => { const f = d.sections[s.id]; const ok = ftotal(f) === CONFIG.focusPoints; const n = membersOfSection(s.id).length; return `<div class="acc"><button class="ah" data-act="acc" data-s="${s.id}"><span class="nm">${s.name}</span><span class="sum ellip">${n ? '' : '<span class="tag bad">団員なし</span> '}${focusSummary(f)}</span>${ok ? '<span class="tag ok">10</span>' : `<span class="tag warn">${ftotal(f)}</span>`}<span class="muted">${d.openSec === s.id ? '－' : '＋'}</span></button>
        ${d.openSec === s.id ? `<div class="ab">${renderFocusEditor('sec:' + s.id, f)}</div>` : ''}</div>`; }).join('')}`;
  } else {
    const ms = membersOfSection(UI.indSec);
    editor = `<div class="card"><h3>対象団員（最大${CONFIG.individualMaxTargets}名）</h3>
      <div class="seg">${SECTIONS.map(s => `<button class="${UI.indSec === s.id ? 'on' : ''}" data-act="indSec" data-v="${s.id}">${s.name}</button>`).join('')}</div>
      ${ms.map(m => { const sel = d.members.includes(m.id); return `<button class="mrow ${sel ? 'sel' : ''}" data-act="indPick" data-id="${m.id}">${badge(memberRank(m))}<span class="grow"><span class="nm">${esc(m.name)}</span><span class="muted"> ${INST[m.inst].abbr}</span><br><span class="muted">平均 ${Math.round(memberAvg(m))}</span></span><span>${sel ? '✓' : ''}</span></button>`; }).join('') || '<div class="muted">団員がいません</div>'}
      <div class="muted">選択中：${d.members.map(id => esc(memberById(id)?.name)).join('、') || 'なし'}</div></div>
      <div class="card"><h3>重点項目</h3>${renderFocusEditor('ind', d.indFocus)}</div>`;
  }
  const err = validatePlan(c, buildPlan());
  return `
  <div class="card gold"><div class="row sp"><div><div class="muted">練習</div><div style="font-family:var(--serif);font-size:26px" class="num">${c.practiceDone + 1}<small style="font-size:15px"> / ${CONFIG.practiceCount} 回目</small></div></div>
    <div class="grow" style="max-width:55%">${bar(c.practiceDone, CONFIG.practiceCount)}<div class="muted" style="text-align:right;margin-top:4px">残り ${CONFIG.practiceCount - c.practiceDone} 回</div></div></div>
    <div class="hr"></div>${renderSongButton(c.songId, '曲目')}</div>
  ${UI.lastLog ? renderLog(c, UI.lastLog, true) : ''}
  <div class="menus">${menus.map(([id, n, s]) => `<button class="${d.menu === id ? 'on' : ''}" data-act="menu" data-v="${id}"><b>${n}</b><span>${s}</span></button>`).join('')}</div>
  ${editor}
  <button class="btn pri block" data-act="practice" ${err ? 'disabled' : ''}>練習開始</button>
  ${err ? `<div class="reason" style="text-align:center">${esc(err)}</div>` : ''}
  <p class="muted" style="text-align:center">練習で高まるのは今回の本番に向けた仕上がりです。団員の能力そのものは「育成」で伸ばします。</p>
  ${renderPerfFold(c)}
  ${c.practices.length ? `<div class="card"><details class="fold"><summary><h3 style="margin:0">練習履歴（${c.practices.length}）</h3></summary>${c.practices.slice().reverse().map(l => `<div class="review"><b>${l.no === 'H' ? 'ホール' : '第' + l.no + '回'}</b>${esc(l.summary)}</div>`).join('')}</details></div>` : ''}`;
}
function buildPlan() {
  const d = UI.draft;
  if (d.menu === 'tutti') return { menu: 'tutti', focus: d.focus };
  if (d.menu === 'section') return { menu: 'section', sections: d.sections };
  return { menu: 'individual', focus: d.indFocus, members: d.members };
}
function renderLog(c, log, closable) {
  const menuN = { tutti: '全体合奏', section: 'セクション練習', individual: '個人練習', hall: 'ホール練習' }[log.menu];
  const secRows = SECTIONS.filter(s => log.sections[s.id]).map(s => `<div class="s">${s.name}</div>${SECTION_PARAMS.map(p => { const v = log.sections[s.id][p.id] || 0; return `<div class="${v ? 'delta' : 'z'}">${v ? '+' + round1(v) : '·'}</div>`; }).join('')}`).join('');
  const ov = Object.entries(log.overall).map(([k, v]) => `${OVERALL_PARAMS.find(o => o.id === k).name} <span class="delta">+${round1(v)}</span>`).join('　');
  const ma = [['comp', '楽曲完成度'], ['underst', '楽曲理解度']].filter(([k]) => log.mastery[k]).map(([k, n]) => `${n} <span class="delta">+${round1(log.mastery[k])}</span>`).join('　');
  const sp = log.songParams.map(x => `<span class="tag gold">${SONG_PARAMS.find(p => p.id === x.param).name} +1 → ${x.to}</span>`).join('');
  return `<div class="card" style="border-color:#4d7d5a"><div class="row sp"><h3 style="margin:0">${log.no === 'H' ? 'ホール練習' : `第${log.no}回 ${menuN}`} の結果</h3>${closable ? '<button class="btn sm" data-act="closeLog">閉じる</button>' : ''}</div>
    ${secRows ? `<div style="height:10px"></div><div class="dgrid"><div></div>${SECTION_PARAMS.map(p => `<div class="h">${p.short}</div>`).join('')}${secRows}</div>` : ''}
    ${ov ? `<div style="margin-top:10px;font-size:13px">全体：${ov}</div>` : ''}
    ${ma ? `<div style="margin-top:6px;font-size:13px">${ma}</div>` : ''}
    ${sp ? `<div style="margin-top:8px" class="growl"><span class="muted">曲の長期習熟</span>${sp}</div>` : ''}
  </div>`;
}
function renderPerfFold(c, open) {
  const ov = effectiveOverall(c);
  return `<div class="card"><details class="fold" ${open ? 'open' : ''}><summary><h3 style="margin:0">現在の仕上がり（発表会パラメータ）</h3></summary>
    <div style="height:6px"></div>
    ${SECTIONS.map(s => { const p = c.perf.sections[s.id]; return `<details class="fold"><summary>${stat(s.name, mean(SECTION_PARAMS.map(x => p[x.id])))}</summary>
      <div style="padding:0 0 6px 10px">${SECTION_PARAMS.map(x => stat(x.name, p[x.id], null, 'blue')).join('')}</div></details>`; }).join('')}
    <div class="hr"></div>
    ${OVERALL_PARAMS.map(o => stat(o.name, ov[o.id], null, 'wine')).join('')}
    <div class="hr"></div>
    ${stat('楽曲完成度', c.perf.mastery.comp)}${stat('楽曲理解度', c.perf.mastery.underst)}
  </details></div>`;
}

/* --- 本番準備 --- */
function renderPrep(c) {
  const info = successInfo(c);
  const r = info.readiness, hall = info.hall, sp = songParam(c.songId);
  const att = attendanceRate(c), ticket = ticketRevenue(c);
  const est = rk => settlementFor(c, { S: 88, A: 76, B: 65, C: 52, D: 35 }[rk], rk).net;
  return `
  <div class="card gold prob"><div class="muted">現在の成功確率</div><div class="big">${Math.round(info.prob * 100)}<small>%</small></div>
    <div class="muted">${esc(r.song.title)}</div></div>
  <div class="card"><h3>編成と舞台の確認</h3>${r.short.items.length ? `<div class="short">${r.short.items.map(i => `${INST[i.inst].abbr}：必要${i.need}名／在籍${i.have}名（<b style="color:#ffb3b9">${i.lack}名不足</b>${i.missing ? '・楽器欠員' : ''}）`).join('<br>')}<br><span class="muted">編成不足による成功率 ×${Math.round(r.mult * 100)}%</span></div>` : '<div class="tag ok">必要な編成が揃っています</div>'}
    ${info.overflow ? `<div class="short">この曲は${songPlayers(r.song)}名編成。${esc(hall.name)}の舞台（${hall.stage}名）に${info.overflow}名分収まらず、響きが飽和します。</div>` : ''}</div>
  <div class="card"><h3>楽曲の仕上がり</h3>
    <div class="row sp"><span style="font-family:var(--serif)" class="ellip grow">${esc(r.song.title)}</span><span class="tag">${difficultyLabel(r.song.difficulty)}</span></div>
    ${bar(r.composite, Math.max(r.required * 1.6, 1))}<div class="muted">仕上がり ${Math.round(r.composite)}（目安 ${Math.round(r.required)}）・楽団の地力 ${r.strength >= 0 ? '+' : ''}${round1(r.strength)}</div>
    <div class="muted">今回の完成度 ${Math.round(c.perf.mastery.comp)}・理解度 ${Math.round(c.perf.mastery.underst)}／長期習熟（基礎${sp.base}・理解${sp.underst}・表現${sp.expr}）</div></div>
  ${renderPerfFold(c, false)}
  <div class="card"><h3>会場と収支の見込み</h3>
    <div class="row sp"><span>${esc(hall.name)}</span><span class="tag blue">音響 ${hall.acoustics}</span></div>
    <dl class="kv kv3"><dt>予想集客</dt><dd>${Math.round(hall.capacity * att)}名（${Math.round(att * 100)}%）</dd><dt>チケット収入</dt><dd>${yen(ticket)}</dd><dt>運営費</dt><dd>${yen(operatingCost())}</dd>${conductorFee(activeConductor()) ? `<dt>指揮者出演料</dt><dd>${yen(conductorFee(activeConductor()))}</dd>` : ''}</dl>
    <div class="muted">評価による最終収支の目安：S ${yenS(est('S'))}／B ${yenS(est('B'))}／D ${yenS(est('D'))}</div></div>
  <div class="card"><h3>ホール練習（任意・1回）</h3>
    ${c.rehearsal.done ? '<span class="tag ok">実施済み：成功率と安定性が向上しています</span>' : (() => { const why = rehearsalBlockReason(c); return `<p class="sub" style="margin-top:0">本番会場で通し練習を行います。成功率が約${Math.round(CONFIG.concert.hallBonus * 100)}%上がり、演奏のばらつきが減ります${hall.pressure ? `。一流会場の重圧（−${Math.round(hall.pressure * 100)}%）も解消されます` : ''}。</p><button class="btn block" data-act="hall" ${why ? 'disabled' : ''}>ホール練習を行う（${hall.rehearsalFee ? yen(hall.rehearsalFee) : '無料'}）</button>${why ? `<div class="reason">${esc(why)}</div>` : ''}`; })()}</div>
  <div class="card"><h3>本番の指揮方針</h3>${(() => { const cd = activeConductor(), tr = cd && CTRAIT[cd.trait]; return cd ? `<div class="muted" style="margin-bottom:8px">指揮：${esc(cd.name)}（${tr.name}）・仕上がりへの影響 ${r.conductor >= 0 ? '+' : ''}${round1(r.conductor)}${tr.policy ? `・★の方針が得意` : ''}</div>` : ''; })()}
    <div class="pol">${Object.entries(CONFIG.policies).map(([id, p]) => { const tr = activeConductor() && CTRAIT[activeConductor().trait]; return `<button class="${c.policy === id ? 'on' : ''}" data-act="policy" data-v="${id}"><b>${tr && tr.policy === id ? '★ ' : ''}${p.name}</b><span>${p.desc}</span></button>`; }).join('')}</div></div>
  <button class="btn pri block" data-act="perform">本番を開始する</button>`;
}

/* --- 結果 --- */
function renderLedger(c) {
  return `<div class="ledger">${c.ledger.map(l => `<div class="row sp"><span class="grow ellip">${esc(l.label)}</span><span class="num ${l.amount < 0 ? 'neg' : 'pos'}">${yenS(l.amount)}</span></div>`).join('')}
    <div class="row sp total"><span>この演奏会の収支合計</span><b class="num ${c.ledger.reduce((s, l) => s + l.amount, 0) < 0 ? 'neg' : 'pos'}">${yenS(c.ledger.reduce((s, l) => s + l.amount, 0))}</b></div></div>`;
}
function renderGrowthList(c) {
  const growth = Object.entries(c.growth).map(([id, g]) => ({ m: memberById(id), g })).filter(x => x.m)
    .sort((a, b) => Object.values(b.g).reduce((s, v) => s + v, 0) - Object.values(a.g).reduce((s, v) => s + v, 0));
  return growth.length ? growth.map(({ m, g }) => `<div class="row" style="padding:5px 0;border-bottom:1px solid var(--line)">${badge(memberRank(m))}<span class="grow ellip">${esc(m.name)} <span class="muted">${INST[m.inst].abbr}</span></span><span class="growl" style="justify-content:flex-end">${Object.entries(g).map(([a, v]) => `<span class="tag ok">${abilShort(a)}+${v}</span>`).join('')}</span></div>`).join('') : '<div class="muted">今回は育成を行いませんでした。</div>';
}
function renderResult(c) {
  const r = c.result, s = r.settlement;
  return `
  <div class="card gold" style="text-align:center">
    <div class="muted">事前の成功確率 ${Math.round(r.prob * 100)}%・${CONFIG.policies[r.policy].name}${r.rehearsal ? '・ホール練習あり' : ''}</div>
    <div style="margin:10px 0"><span class="stamp ${r.success ? 'ok' : 'ng'}">${r.success ? '演奏成功' : '演奏に乱れ'}</span></div>
    <div class="grade">${r.rank}</div><div class="muted">総合評価　${r.total}点</div>
    <div class="hr"></div>
    <div class="row sp"><span>本番の収支</span><b class="num ${s.net < 0 ? 'neg' : 'pos'}" style="font-size:20px">${yenS(s.net)}</b></div>
    <div class="row sp muted"><span>現在の資金</span><span class="num">${yen(STATE.funds)}</span></div>
    <div class="row sp muted"><span>評判</span><span class="num">${Math.round(r.repBefore)} → ${Math.round(r.repAfter)}</span></div></div>
  <div class="card"><h3>本番の収支</h3>
    <div class="row sp"><span>チケット収入（${s.audience}名来場）</span><span class="num pos">${yenS(s.ticket)}</span></div>
    <div class="row sp"><span>出来高（評価による増減）</span><span class="num ${s.perf < 0 ? 'neg' : 'pos'}">${yenS(s.perf)}</span></div>
    <div class="row sp"><span>協賛金</span><span class="num pos">${yenS(s.sponsor)}</span></div>
    <div class="row sp"><span>運営費</span><span class="num neg">${yenS(-s.operating)}</span></div>
    ${s.conductorFee ? `<div class="row sp"><span>指揮者出演料</span><span class="num neg">${yenS(-s.conductorFee)}</span></div>` : ''}
    <div class="muted" style="margin-top:6px">出来高は総合点が高いほど増え（物販・寄付）、低いと減ります（払い戻し・悪評）。</div></div>
  <div class="card"><h3>項目別評価</h3>${EVAL_CATS.map(cat => stat(cat.name, r.cats[cat.id])).join('')}</div>
  <div class="card"><h3>講評</h3>${r.reviews.map(l => `<div class="review"><b>${esc(l.k)}</b>${esc(l.t)}</div>`).join('')}</div>
  <div class="card"><h3>今回の育成成果</h3>${renderGrowthList(c)}</div>
  ${r.conductorName ? `<div class="card"><h3>指揮者の成長</h3><div>${esc(r.conductorName)}は演奏会の経験を積んだ。</div><div class="growl" style="margin-top:6px">${(r.conductorGrowth || []).map(g => `<span class="tag ok">${CABIL[g.abil].short} ${g.from}→${g.to}</span>`).join('') || '<span class="muted">今回は目立った変化なし</span>'}</div></div>` : ''}
  ${Object.keys(c.songGrowth).length ? `<div class="card"><h3>曲の長期習熟</h3>${Object.entries(c.songGrowth).map(([id, g]) => `<div style="margin:4px 0">${esc(findSong(id).title)} ${Object.entries(g).map(([p, v]) => `<span class="tag gold">${SONG_PARAMS.find(x => x.id === p).name}+${v}</span>`).join(' ')}</div>`).join('')}<div class="muted">次に同じ曲を選んだとき、この習熟度を引き継ぎます。</div></div>` : ''}
  <div class="card"><details class="fold"><summary><h3 style="margin:0">この演奏会の収支明細</h3></summary>${renderLedger(c)}</details></div>
  <button class="btn pri block" data-act="next">次の演奏会へ進む</button>`;
}

/* ---------- 育成 ---------- */
function trainTargetId() { const t = findTraining(UI.train.t); return t.target === 'section' ? UI.train.sec : t.target === 'conductor' ? (UI.train.cond || STATE.conductorId) : UI.train.member; }
function renderTrain(c) {
  const T = UI.train, t = findTraining(T.t);
  const targetId = trainTargetId();
  const reason = trainingBlockReason(c, t.id, targetId, t.chooseAbility ? T.ability : null);
  const cost = targetId && trainingTargets(t, targetId).length ? trainingCost(t, targetId) : 0;
  let picker = '';
  if (t.target === 'conductor') {
    picker = STATE.conductors.map(cd => { const used = c.trainingUsed[`${t.id}:${cd.id}`]; return `<button class="mrow ${targetId === cd.id ? 'sel' : ''}" data-act="trCond" data-id="${cd.id}">${badge(condRank(cd))}<span class="grow" style="min-width:0"><span class="nm">${esc(cd.name)}</span>${STATE.conductorId === cd.id ? ' <span class="tag ok">担当</span>' : ''}${used ? ' <span class="tag ok">実施済</span>' : ''}<br><span class="muted">${CONDUCTOR_ABILITIES.map(a => `${a.short}${cd.abilities[a.id]}/${cd.potential[a.id]}`).join(' ')}</span></span><span>${targetId === cd.id ? '✓' : ''}</span></button>`; }).join('');
  } else if (t.target === 'section') {
    picker = `<div class="seg">${SECTIONS.map(s => { const used = c.trainingUsed[`${t.id}:${s.id}`]; return `<button class="${T.sec === s.id ? 'on' : ''}" data-act="trSec" data-v="${s.id}">${s.name}${used ? ' ✓' : ''}</button>`; }).join('')}</div>
      <div class="muted">${SEC[T.sec].name}：${membersOfSection(T.sec).length}名・平均能力 ${Math.round(mean(membersOfSection(T.sec).map(memberAvg)))}</div>`;
  } else {
    const ms = membersOfSection(T.memSec);
    picker = `<div class="seg">${SECTIONS.map(s => `<button class="${T.memSec === s.id ? 'on' : ''}" data-act="trMemSec" data-v="${s.id}">${s.name}</button>`).join('')}</div>
      ${ms.map(m => { const room = Math.round(memberPotAvg(m) - memberAvg(m)); const g = m.instrumentGrade || 0; const used = c.trainingUsed[`${t.id}:${m.id}`]; return `<button class="mrow ${T.member === m.id ? 'sel' : ''}" data-act="trMember" data-id="${m.id}">${badge(memberRank(m))}<span class="grow" style="min-width:0"><span class="nm">${esc(m.name)}</span><span class="muted"> ${INST[m.inst].abbr}</span>${used ? ' <span class="tag ok">実施済</span>' : ''}<br><span class="muted">平均 ${Math.round(memberAvg(m))}・伸びしろ +${room}${t.id === 'instrument' ? `・${CONFIG.instrumentGrades[g].name}` : ''}</span></span><span>${T.member === m.id ? '✓' : ''}</span></button>`; }).join('') || '<div class="muted">団員がいません</div>'}`;
  }
  const m = t.target === 'member' && memberById(T.member);
  const gainsText = (() => {
    if (t.chooseAbility) return `選んだ能力 +${t.gains._focus[0]}〜${t.gains._focus[1]}、ほかの能力も伸びることがある`;
    const g = t.id === 'instrument' ? (m ? trainingGains(t, m) : CONFIG.instrumentGrades[1].gains) : t.gains;
    return Object.entries(g).map(([a, [x, y, p]]) => `${abilShort(a)} +${x === y ? x : x + '〜' + y}${p < 1 ? `（${Math.round(p * 100)}%）` : ''}`).join('、');
  })();
  return `<h2>育成</h2>
  <p class="sub">資金を投じて団員や指揮者の能力そのものを伸ばします（潜在能力が上限）。練習では団員の能力は伸びません。指揮者は演奏会の経験でも少しずつ成長します。</p>
  <div class="card"><div class="row sp"><span>使える資金</span><b class="num ${STATE.funds < 0 ? 'neg' : ''}">${yen(STATE.funds)}</b></div></div>
  ${T.last ? renderTrainResult(T.last) : ''}
  <h3>団員の育成</h3>
  <div class="tgrid">${CONFIG.trainings.filter(x => x.target !== 'conductor').map(x => `<button class="${T.t === x.id ? 'on' : ''}" data-act="trType" data-v="${x.id}"><span class="ic">${x.icon}</span><b>${x.name}</b><span>${x.target === 'section' ? 'セクション単位' : '団員1名'}</span></button>`).join('')}</div>
  <h3>指揮者の育成</h3>
  <div class="tgrid">${CONFIG.trainings.filter(x => x.target === 'conductor').map(x => `<button class="${T.t === x.id ? 'on' : ''}" data-act="trType" data-v="${x.id}"><span class="ic">${x.icon}</span><b>${x.name}</b><span>指揮者</span></button>`).join('')}</div>
  <div class="card"><h3>${esc(t.name)}</h3><p class="sub" style="margin-top:0">${esc(t.desc)}</p>
    <div class="muted" style="margin-bottom:8px">効果：${gainsText}${t.limit === 'concert' ? '／同じ対象には1演奏会につき1回' : ''}</div>
    <h3 style="font-size:14px">${t.target === 'section' ? '対象セクション' : t.target === 'conductor' ? '対象の指揮者' : '対象の団員'}</h3>${picker}
    ${t.chooseAbility ? `<h3 style="font-size:14px;margin-top:12px">伸ばす能力</h3><div class="seg wrapseg">${ABILITIES.map(a => `<button class="${T.ability === a.id ? 'on' : ''}" data-act="trAbility" data-v="${a.id}">${a.short}${m ? ` ${m.abilities[a.id]}/${m.potential[a.id]}` : ''}</button>`).join('')}</div>` : ''}
    ${m ? `<div class="hr"></div>${ABILITIES.map(a => stat(a.name, m.abilities[a.id], m.potential[a.id])).join('')}` : ''}
  </div>
  <div class="trbar"><div class="row sp"><span class="muted">費用</span><b class="num">${cost ? yen(cost) : '—'}</b></div>
    <button class="btn pri block" data-act="trRun" ${reason ? 'disabled' : ''}>育成を実施する</button>${reason ? `<div class="reason" style="text-align:center">${esc(reason)}</div>` : ''}</div>
  ${c.trainingLog.length ? `<div class="card"><details class="fold"><summary><h3 style="margin:0">今回の育成履歴（${c.trainingLog.length}）</h3></summary>${c.trainingLog.slice().reverse().map(l => `<div class="review"><b>${esc(l.name)}</b>${esc(l.target)}・${yen(l.cost)}・能力 +${l.gains.reduce((s, g) => s + g.to - g.from, 0)}</div>`).join('')}</details></div>` : ''}`;
}
function renderTrainResult(e) {
  const by = {}; e.gains.forEach(g => { (by[g.id] = by[g.id] || { name: g.name, a: [] }).a.push(`${abilShort(g.abil)}+${g.to - g.from}`); });
  const total = e.gains.reduce((s, g) => s + g.to - g.from, 0);
  return `<div class="card trres"><div class="msg">${esc(e.message)}</div>
    <div class="muted" style="text-align:center">${esc(e.target)}・${yen(e.cost)}</div>
    ${e.extra ? `<p class="sub" style="text-align:center">${esc(e.extra)}</p>` : ''}
    <div class="hr"></div>
    ${total ? `<div class="growl">${Object.values(by).map(x => `<span class="tag ok">${esc(x.name.split(' ')[0])} ${x.a.join(' ')}</span>`).join('')}</div><div class="muted" style="margin-top:6px">能力の合計 +${total}</div>` : '<div class="muted">今回は目に見える成果が出なかった…（伸びしろが少ない団員もいる）</div>'}
    <div style="text-align:right;margin-top:6px"><button class="btn sm" data-act="trClose">閉じる</button></div></div>`;
}

/* ---------- 団員 ---------- */
function renderMembers(c) {
  if (UI.memView === 'recruit') return renderRecruit();
  if (UI.memView === 'conductors') return renderConductors();
  const secs = UI.memSec === 'all' ? SECTIONS : [SEC[UI.memSec]];
  const have = countByInst();
  const open = STATE.recruit.candidates.filter(x => !STATE.recruit.hired.includes(x.id)).length;
  return `<h2>団員一覧 <span class="muted">${STATE.members.length}名</span></h2>
  <div class="card gold recruitcta"><div class="row sp"><div class="grow"><div style="font-family:var(--serif);font-size:16px;color:var(--gold2)">団員募集</div><div class="muted">候補者 ${open}名・演奏会の進行中もいつでも採用できます</div></div>
    <button class="btn gold" data-act="openRecruit">募集する</button></div></div>
  ${conductorSummary()}
  <div class="seg"><button class="${UI.memSec === 'all' ? 'on' : ''}" data-act="memSec" data-v="all">全員</button>${SECTIONS.map(s => `<button class="${UI.memSec === s.id ? 'on' : ''}" data-act="memSec" data-v="${s.id}">${s.name}</button>`).join('')}</div>
  ${secs.map(s => `<h3 style="margin:16px 2px 0">${s.name}セクション</h3>${s.insts.map(i => { const ms = STATE.members.filter(m => m.inst === i).sort((a, b) => (isPrincipal(b) - isPrincipal(a)) || (memberAvg(b) - memberAvg(a))); return `<div class="inst-h"><span>${INST[i].abbr}</span><span class="muted num">${have[i]} / ${INST[i].cap}</span></div>${ms.map(m => `<button class="mrow" data-act="member" data-id="${m.id}">${badge(memberRank(m))}<span class="grow"><span class="nm">${esc(m.name)}</span>${isPrincipal(m) ? '<span class="tag gold prin">首席</span>' : ''}${m.original ? '<span class="oc">★</span>' : ''}<br><span class="muted">平均 ${Math.round(memberAvg(m))}・潜在 ${Math.round(memberPotAvg(m))}${m.instrumentGrade ? `・${CONFIG.instrumentGrades[m.instrumentGrade].name}` : ''}</span></span><span class="spark" aria-hidden="true">${ABILITIES.map(a => `<i style="height:${Math.max(2, m.abilities[a.id] / 100 * 22)}px"></i>`).join('')}</span></button>`).join('') || '<div class="muted" style="padding:4px 2px">在籍なし</div>'}`; }).join('')}`).join('')}
  <p class="muted">右の小さなグラフは 技術・音感・リズム・音色・強弱・表現・協調 の順。</p>`;
}
function renderSheet() {
  let root = document.getElementById('sheetRoot');
  if (!root) { root = document.createElement('div'); root.id = 'sheetRoot'; document.body.appendChild(root); }
  const m = UI.sheetMember && memberById(UI.sheetMember);
  if (!m) { root.innerHTML = ''; return; }
  const c = activeConcert();
  const g = c.growth[m.id] || {};
  root.innerHTML = `<div class="sheet-bg" data-act="closeSheet"></div><div class="sheet" role="dialog" aria-label="団員詳細"><div class="grip"></div>
    <div class="row">${badge(memberRank(m))}<div class="grow"><div style="font-family:var(--serif);font-size:19px">${esc(m.name)}${m.original ? ' <span class="tag gold">オリジナル</span>' : ''}</div>
    <div class="muted">${INST[m.inst].abbr}・${SEC[INST[m.inst].section].name}セクション・${m.joined ? `第${m.joined}回から在籍` : '創設メンバー'}</div></div><button class="btn sm" data-act="closeSheet">閉じる</button></div>
    ${m.profile ? `<p class="sub">${esc(m.profile)}</p>` : ''}
    <div class="muted" style="margin-top:6px">楽器：${CONFIG.instrumentGrades[m.instrumentGrade || 0].name}</div>
    <div class="row sp" style="margin-top:8px">${isPrincipal(m) ? `<span class="tag gold">${INST[m.inst].abbr} 首席奏者</span><span class="muted">セクションの基礎能力で重く数えられ、管打楽器ではソロの出来が評価に影響します</span>` : `<span class="muted">${INST[m.inst].abbr}の首席：${esc(principalOf(m.inst)?.name || 'なし')}</span><button class="btn sm" data-act="setPrincipal" data-id="${m.id}">首席に任命</button>`}</div>
    <div class="hr"></div>
    ${ABILITIES.map(a => stat(a.name + (g[a.id] ? ` <span class="delta">+${g[a.id]}</span>` : ''), m.abilities[a.id], m.potential[a.id])).join('')}
    <div class="muted" style="margin-top:6px">明るい部分が現在値、淡い部分が潜在能力（育成の上限）。平均 ${round1(memberAvg(m))}／潜在 ${round1(memberPotAvg(m))}</div>
    <div style="height:10px"></div><button class="btn gold block" data-act="trainMember" data-id="${m.id}">この団員を育成する</button>
    ${`<div class="hr"></div>${UI.confirmDismiss ? `<p class="sub">本当に ${esc(m.name)} を退団させますか？　元に戻せません。</p><div class="row"><button class="btn grow" data-act="dismissNo">やめる</button><button class="btn pri grow" data-act="dismissYes">退団させる</button></div>` : '<button class="btn block" data-act="dismiss">退団させる（在籍枠を空ける）</button>'}`}
  </div>`;
}

/* ---------- 記録・設定 ---------- */
function renderRecords(c) {
  const list = STATE.concertOrder.map(id => STATE.concertPrograms[id]).slice().reverse();
  return `<h2>演奏会の記録</h2>
  ${list.map(x => `<div class="card"><details class="fold" ${x === c ? 'open' : ''}><summary><div class="grow" style="min-width:0"><div style="font-family:var(--serif)">${esc(x.title)}</div><div class="muted ellip">${x.result ? `評価 ${x.result.rank}・本番収支 ${yenS(x.result.settlement.net)}` : phaseName(x.phase) + '中'}</div></div>${x.result ? badge(x.result.rank) : ''}</summary>
    <div style="margin-top:8px" class="muted">会場：${x.hallId ? esc(findHall(x.hallId).name) : '未定'}</div>
    <div class="muted">曲目：${x.songId ? esc(findSong(x.songId).title) : '未定'}</div>
    ${x.ledger.length ? `<div class="hr"></div><div class="muted">収支明細</div>${renderLedger(x)}` : ''}
    ${x.trainingLog.length ? `<div class="hr"></div><div class="muted">育成</div>${x.trainingLog.map(l => `<div class="review"><b>${esc(l.name)}</b>${esc(l.target)}・能力 +${l.gains.reduce((s, g) => s + g.to - g.from, 0)}</div>`).join('')}` : ''}
    ${x.practices.length ? `<div class="hr"></div><div class="muted">練習履歴</div>${x.practices.map(l => `<div class="review"><b>${l.no === 'H' ? 'ホール' : '第' + l.no + '回'}</b>${esc(l.summary)}</div>`).join('')}` : ''}
    ${x.result ? `<div class="hr"></div><div class="muted">講評</div>${x.result.reviews.map(l => `<div class="review"><b>${esc(l.k)}</b>${esc(l.t)}</div>`).join('')}` : ''}
  </details></div>`).join('')}
  ${STATE.ledger.length ? `<div class="card"><details class="fold"><summary><div class="grow"><div style="font-family:var(--serif)">団員募集の支出</div><div class="muted">${yen(-STATE.ledger.reduce((a, l) => a + l.amount, 0))}（${STATE.ledger.length}件）</div></div></summary>
    <div class="ledger" style="margin-top:8px">${STATE.ledger.slice().reverse().map(l => `<div class="row sp"><span class="grow ellip">${esc(l.label)}</span><span class="num neg">${yenS(l.amount)}</span></div>`).join('')}</div></details></div>` : ''}
  <h2>設定</h2>
  <div class="card"><label class="muted">楽団名</label><div class="row" style="margin-top:4px"><input class="input grow" id="orchName" value="${esc(STATE.orchestraName)}" maxlength="24"><button class="btn sm" data-act="rename">変更</button></div></div>
  <div class="card"><h3>保存データ</h3><p class="sub" style="margin-top:0">進行状況は操作のたびにこの端末のブラウザへ自動保存されます（データ形式 v${STATE.version}）。</p>
    ${UI.confirmReset ? `<p class="sub" style="color:#ffb3b9">すべての進行状況が消えます。よろしいですか？</p><div class="row"><button class="btn grow" data-act="resetNo">やめる</button><button class="btn pri grow" data-act="resetYes">初期化する</button></div>` : '<button class="btn block" data-act="reset">保存データを初期化</button>'}</div>`;
}

/* ---------- 曲詳細Window（ゲーム内フローティング・1つだけ） ---------- */
let WIN = null;
function openSong(id) {
  const s = findSong(id); if (!s) return;
  if (!WIN) {
    WIN = document.createElement('div'); WIN.className = 'fwin'; WIN.id = 'songWin';
    WIN.innerHTML = '<div class="tb"><span class="tt"></span><button class="x" data-act="closeWin" aria-label="閉じる">×</button></div><div class="wb"></div>';
    document.body.appendChild(WIN);
    bindWinDrag(WIN.querySelector('.tb'));
    const w = Math.min(380, window.innerWidth - 16);
    WIN.style.left = Math.round((window.innerWidth - w) / 2) + 'px'; WIN.style.top = (document.body.classList.contains('mode3d') ? 104 : 72) + 'px';
  }
  WIN.hidden = false;
  const sp = STATE.songParams[id] || { base: 0, underst: 0, expr: 0, performed: 0 };
  const sh = shortageOf(s);
  const c = activeConcert();
  const hall = concertHall(c);
  const selecting = false;   // 選曲は演奏会タブのコマンド画面で行う（この窓は閲覧専用）
  WIN.querySelector('.tt').textContent = `${genreName(s.genre)}｜曲の詳細`;
  WIN.querySelector('.wb').innerHTML = `<div class="song-t">${esc(s.title)}</div><div class="sub">${esc(s.composer)}（${s.year}年）</div>
    <div class="row wrap" style="gap:4px;margin-top:8px"><span class="tag">${genreName(s.genre)}</span><span class="tag">${difficultyLabel(s.difficulty)}</span><span class="tag">${s.duration}分</span><span class="tag">${esc(s.mood)}</span><span class="tag gold">知名度 ${'★'.repeat(s.popularity)}${'☆'.repeat(5 - s.popularity)}</span></div>
    <p style="margin:10px 0">${esc(s.description)}</p>
    <dl class="kv"><dt>作曲年</dt><dd>${s.year}年</dd><dt>演奏時間</dt><dd>約${s.duration}分</dd><dt>難易度</dt><dd>${difficultyLabel(s.difficulty)}</dd><dt>編成</dt><dd>${formatInstrumentation(s).map(esc).join('<br>')}<br><span class="muted">計${songPlayers(s)}名</span></dd></dl>
    ${sh.items.length ? `<div class="short">現在の楽団では編成不足：${sh.items.map(i => `${INST[i.inst].abbr} ${i.lack}名${i.missing ? '（欠員）' : ''}`).join('、')}</div>` : '<div class="tag ok">現在の楽団で編成が揃っています</div>'}
    ${hall && songPlayers(s) > hall.stage ? `<div class="short">${esc(hall.name)}の舞台（${hall.stage}名）に${songPlayers(s) - hall.stage}名分収まりません。</div>` : ''}
    <div class="hr"></div><div class="muted">この曲への楽団の習熟（長期・演奏会をまたいで保持）</div>
    ${stat('基礎完成度', Math.min(sp.base, 100))}${stat('理解度', Math.min(sp.underst, 100))}${stat('表現', Math.min(sp.expr, 100))}
    <div class="muted">演奏回数 ${sp.performed}回</div>
    ${selecting ? `<div style="height:10px"></div><button class="btn ${UI.pickSong === id ? '' : 'gold'} block" data-act="pickFromWin" data-id="${id}">${UI.pickSong === id ? '選択中の曲です' : 'この曲を選ぶ'}</button>` : (c.songId === id ? '<div class="ro">今回の曲目に確定済み（閲覧のみ）</div>' : '')}`;
  WIN.querySelector('.wb').scrollTop = 0;
  clampWin();
}
function clampWin() {
  if (!WIN || WIN.hidden) return;
  const r = WIN.getBoundingClientRect();
  const x = clamp(r.left, 4, Math.max(4, window.innerWidth - r.width - 4));
  const y = clamp(r.top, 4, Math.max(4, window.innerHeight - 48));
  WIN.style.left = x + 'px'; WIN.style.top = y + 'px';
  // 3D表示中は下部パネルに重ならない高さにする（3D空間の上に浮かべる）
  const panel = document.querySelector('.panel3d');
  const limit = panel ? Math.max(180, panel.getBoundingClientRect().top - y - 8) : window.innerHeight - y - 12;
  WIN.style.maxHeight = Math.min(560, limit) + 'px';
}
function bindWinDrag(tb) {
  let sx, sy, ox, oy, id = null;
  tb.addEventListener('pointerdown', e => {
    if (e.target.closest('.x')) return;
    id = e.pointerId; tb.setPointerCapture(id);
    const r = WIN.getBoundingClientRect(); sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
  });
  tb.addEventListener('pointermove', e => {
    if (e.pointerId !== id) return;
    WIN.style.left = (ox + e.clientX - sx) + 'px'; WIN.style.top = (oy + e.clientY - sy) + 'px'; clampWin();
  });
  const end = e => { if (e.pointerId === id) { id = null; clampWin(); } };
  tb.addEventListener('pointerup', end); tb.addEventListener('pointercancel', end);
}

/* ---------- 操作 ---------- */
function toast(msg) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
const scrollTop = () => { window.scrollTo(0, 0); const pb = document.querySelector('.panel3d .pbody'); if (pb) pb.scrollTop = 0; UI.panelReset = true; };
const closeWin = () => { if (WIN) WIN.hidden = true; };

const ACTIONS = {
  newgame() { newGame(document.getElementById('newName').value.trim()); UI.started = true; UI.tab = 'home'; LOAD_NOTE = ''; render(); },
  tab(d) { if (UI.showing && d.tab !== 'concert') { Stage3D.skipShow(); } UI.tab = d.tab; UI.memView = 'list'; UI.sheetMember = null; render(); scrollTop(); },
  song(d) { openSong(d.id); },
  closeWin,
  hallPick(d) { const h = findHall(d.id); if (selectHall(activeConcert(), d.id)) { UI.previewHall = null; toast(`${h.name}を予約しました${h.fee ? `（${yen(h.fee)}）` : ''}`); } render(); scrollTop(); },
  rview(d) { UI.recruitView = d.v; render(); },
  openRecruit() { UI.memScroll = window.scrollY; UI.memView = 'recruit'; UI.sheetMember = null; render(); scrollTop(); },
  closeRecruit() { UI.memView = 'list'; render(); window.scrollTo(0, UI.memScroll || 0); },
  hire(d) { const cand = STATE.recruit.candidates.find(x => x.id === d.id); if (hireCandidate(d.id)) toast(`${cand.name} が入団しました（${yen(cand.cost)}）`); render(); },
  reroll() { if (rerollRecruit()) toast('新しい候補者が集まりました'); render(); },
  genre(d) { UI.genre = d.v; render(); },
  pickSong(d) { UI.pickSong = d.id; render(); openSong(d.id); },
  pickFromWin(d) { UI.pickSong = d.id; render(); openSong(d.id); },
  confirmSong() { if (confirmSong(activeConcert(), UI.pickSong)) { closeWin(); toast('曲目が確定しました。練習を始めましょう'); } render(); scrollTop(); },
  menu(d) { UI.draft.menu = d.v; render(); },
  acc(d) { UI.draft.openSec = UI.draft.openSec === d.s ? null : d.s; render(); },
  fp(d) { const f = focusOf(d.path); const v = f[d.f] + Number(d.d); if (v < 0 || ftotal(f) + Number(d.d) > CONFIG.focusPoints) return; f[d.f] = v; render(); },
  fclear(d) { const f = focusOf(d.path); FOCUS.forEach(x => f[x.id] = 0); render(); },
  fauto(d) {
    const c = activeConcert();
    if (d.path === 'tutti') UI.draft.focus = autoTuttiFocus(c);
    else if (d.path === 'ind') { const ms = UI.draft.members.map(memberById).filter(Boolean); const f = emptyFocus();
      const low = FOCUS.filter(x => x.param).map(x => ({ id: x.id, v: ms.length ? mean(ms.map(m => c.perf.sections[INST[m.inst].section][x.param])) : rnd(0, 10) + 0 })).sort((a, b) => a.v - b.v);
      f[low[0].id] += 4; f[low[1].id] += 3; f[low[2].id] += 3; UI.draft.indFocus = f; }
    else UI.draft.sections[d.path.slice(4)] = autoSectionFocus(c, d.path.slice(4));
    render();
  },
  autoAll() { const c = activeConcert(); SECTIONS.forEach(s => UI.draft.sections[s.id] = autoSectionFocus(c, s.id)); toast('5セクションの方針を自動設定しました'); render(); },
  indSec(d) { UI.indSec = d.v; render(); },
  indPick(d) { const a = UI.draft.members; const i = a.indexOf(d.id); if (i >= 0) a.splice(i, 1); else if (a.length < CONFIG.individualMaxTargets) a.push(d.id); else toast(`対象は${CONFIG.individualMaxTargets}名までです`); render(); },
  practice() {
    const c = activeConcert();
    const r = runPractice(c, JSON.parse(JSON.stringify(buildPlan())));
    if (r.error) { toast(r.error); return; }
    UI.lastLog = r.log;
    if (UI.draft.menu === 'section') SECTIONS.forEach(s => UI.draft.sections[s.id] = autoSectionFocus(c, s.id)); // 次回用に再提案
    if (c.phase === 'prep') { toast('10回の練習が終了しました。本番準備へ進みます'); UI.lastLog = null; }
    render(); scrollTop();
    if (use3D()) Stage3D.playPractice(r.log.plan, practiceQuality(c));   // 練習の様子を3Dで再生（音なし）
  },
  closeLog() { UI.lastLog = null; render(); },
  hall() { const log = runHallPractice(activeConcert()); if (log) toast('ホール練習を行いました'); render(); },
  policy(d) { activeConcert().policy = d.v; save(); render(); },
  perform() {
    const c = activeConcert();
    if (UI.tab === 'concert' && use3D()) Music.resume();   // 音声はタップ操作の中で開始する必要がある
    if (!runConcert(c)) return;
    if (UI.tab === 'concert' && use3D()) { closeWin(); startShow(c); return; }
    render(); scrollTop();
  },
  next() { proceedToNextConcert(); UI.tab = 'concert'; render(); scrollTop(); toast('新しい演奏会のサイクルが始まりました'); },
  // 育成
  trType(d) { UI.train.t = d.v; UI.train.last = null; render(); },
  trSec(d) { UI.train.sec = d.v; render(); },
  trMemSec(d) { UI.train.memSec = d.v; render(); },
  trMember(d) { UI.train.member = d.id; render(); },
  trAbility(d) { UI.train.ability = d.v; render(); },
  trCond(d) { UI.train.cond = d.id; render(); },
  trRun() {
    const t = findTraining(UI.train.t);
    const r = runTraining(activeConcert(), t.id, trainTargetId(), t.chooseAbility ? UI.train.ability : null);
    if (r.error) { toast(r.error); return; }
    UI.train.last = r; render(); scrollTop();
  },
  trClose() { UI.train.last = null; render(); },
  trainMember(d) { const m = memberById(d.id); UI.tab = 'train'; UI.train.t = 'lesson'; UI.train.member = d.id; UI.train.memSec = INST[m.inst].section; UI.train.last = null; UI.sheetMember = null; render(); scrollTop(); },
  memSec(d) { UI.memSec = d.v; render(); },
  member(d) { UI.sheetMember = d.id; UI.confirmDismiss = false; renderSheet(); },
  closeSheet() { UI.sheetMember = null; renderSheet(); },
  dismiss() { UI.confirmDismiss = true; renderSheet(); },
  dismissNo() { UI.confirmDismiss = false; renderSheet(); },
  dismissYes() {
    const id = UI.sheetMember, m = memberById(id), why = dismissBlockReason(m);
    if (why) toast(why);
    else if (dismissMember(id)) {
      toast(`${m.name} が退団しました`);
      if (UI.draft) UI.draft.members = UI.draft.members.filter(x => x !== id);
      if (UI.train.member === id) UI.train.member = null;
    }
    UI.sheetMember = null; render();
  },
  rename() { const v = document.getElementById('orchName').value.trim(); if (v) { STATE.orchestraName = v; save(); toast('楽団名を変更しました'); render(); } },
  reset() { UI.confirmReset = true; render(); },
  resetNo() { UI.confirmReset = false; render(); },
  resetYes() { resetSave(); STATE = null; UI.started = false; UI.confirmReset = false; UI.draft = null; UI.tab = 'home'; closeWin(); const r = document.getElementById('sheetRoot'); if (r) r.innerHTML = ''; render(); },
};
function onClick(e) {
  const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.act]; if (fn) fn(el.dataset, el);
}

document.addEventListener('DOMContentLoaded', boot);
