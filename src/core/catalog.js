/* =========================================================
 * 曲・ホールの参照と資金の出入り
 * ========================================================= */
/* ---------- 曲 ---------- */
const findSong = id => SONG_LIBRARY.find(s => s.id === id) || null;
const songsOfGenre = g => SONG_LIBRARY.filter(s => s.genre === g);
const genreName = g => (GENRES.find(x => x.id === g) || {}).name || '';
function songRequirements(song) {
  const req = {};
  if (song.strings) Object.entries(song.strings).forEach(([k, v]) => { if (v) req[k] = v; });
  Object.entries(song.winds || {}).forEach(([k, v]) => { if (v) req[k] = v; });
  return req;
}
const songPlayers = song => Object.values(songRequirements(song)).reduce((s, v) => s + v, 0);
function songSections(song) {
  const req = songRequirements(song);
  return SECTIONS.filter(s => s.insts.some(i => req[i])).map(s => s.id);
}
function difficultyLabel(d) { return d <= 40 ? '初級' : d <= 60 ? '中級' : d <= 80 ? '上級' : '最高難度'; }
function songParam(id) {
  if (!STATE.songParams[id]) STATE.songParams[id] = { base: 0, underst: 0, expr: 0, performed: 0 };
  return STATE.songParams[id];
}
function songLongBonus(id) {
  const p = STATE.songParams[id]; if (!p) return 0;
  const sum = p.base + p.underst + p.expr;
  return CONFIG.songParam.bonusMax * (1 - Math.exp(-sum / CONFIG.songParam.bonusScale));
}

// 編成不足（楽器単位）
function shortageOf(song) {
  const have = countByInst();
  const req = songRequirements(song);
  const sc = CONFIG.concert.shortage;
  const items = []; let penalty = 0;
  for (const [inst, need] of Object.entries(req)) {
    const lack = Math.max(0, need - have[inst]);
    if (!lack) continue;
    const kind = INST[inst].kind;
    const per = kind === 'string' ? sc.perStringPlayer : kind === 'perc' ? sc.perPercPlayer : sc.perWindPlayer;
    const missing = have[inst] === 0;
    penalty += lack * per + (missing ? sc.missingInstrument : 0);
    items.push({ inst, need, have: have[inst], lack, missing });
  }
  return { items, penalty };
}
function formatInstrumentation(song) {
  const parts = [];
  const w = song.winds || {};
  for (const g of [['Fl', 'Ob', 'Cl', 'Fg'], ['Hr', 'Tp', 'Tb', 'Tuba'], ['Perc']]) {
    const s = g.filter(i => w[i]).map(i => `${INST[i].abbr} ${w[i]}`).join(', ');
    if (s) parts.push(s);
  }
  if (song.strings) { const s = song.strings; parts.push(`弦五部 (${s.Vn1}-${s.Vn2}-${s.Va}-${s.Vc}-${s.Cb})`); }
  return parts;
}

/* ---------- ホール ---------- */
const findHall = id => CONFIG.halls.find(h => h.id === id) || null;
const concertHall = c => findHall(c.hallId);

/* ---------- 資金 ---------- */
function spend(c, label, amount) {
  if (amount > 0 && STATE.funds < amount) return false;
  STATE.funds -= amount;
  if (amount) c.ledger.push({ label, amount: -amount });
  return true;
}
function earn(c, label, amount) { STATE.funds += amount; c.ledger.push({ label, amount }); }
const operatingCost = () => CONFIG.economy.operatingBase + CONFIG.economy.operatingPerMember * STATE.members.length;

/* ---------- 選曲（プレイヤーが一覧から1曲を選ぶ） ---------- */
function confirmSong(c, songId) {
  if (!inSetup(c) || !findSong(songId)) return false;
  c.songId = songId; c.started = true;
  songParam(songId);
  save(); return true;
}
