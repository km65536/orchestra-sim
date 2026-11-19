/* =========================================================
 * LOGIC — ゲームの状態と計算（UIから独立）
 *   団員個人能力  : STATE.members[].abilities / potential
 *   曲パラメータ  : STATE.songParams[songId]  （長期・演奏会をまたいで保持）
 *   発表会パラメータ: STATE.concertPrograms[id].perf（演奏会ごと、0から開始）
 * ========================================================= */
let STATE = null;

/* ---------- 汎用 ---------- */
const rnd = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rnd(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mean = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
const stdev = arr => { if (arr.length < 2) return 0; const m = mean(arr); return Math.sqrt(mean(arr.map(v => (v - m) ** 2))); };
const sigmoid = x => 1 / (1 + Math.exp(-x));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const round1 = v => Math.round(v * 10) / 10;
function weightedPick(obj) {
  const entries = Object.entries(obj).filter(([, w]) => w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [k, w] of entries) { if ((r -= w) <= 0) return k; }
  return entries.length ? entries[entries.length - 1][0] : null;
}
function newId(prefix) { STATE.nextId = (STATE.nextId || 1) + 1; return prefix + STATE.nextId; }

/* ---------- 団員 ---------- */
function rankFromAvg(avg) {
  for (const [r, t] of CONFIG.rankThresholds) if (avg >= t) return r;
  return 'E';
}
const memberAvg = m => mean(ABILITIES.map(a => m.abilities[a.id]));
const memberPotAvg = m => mean(ABILITIES.map(a => m.potential[a.id]));
const memberRank = m => rankFromAvg(memberAvg(m));

function randomName() {
  const used = new Set((STATE?.members || []).map(m => m.name));
  for (let i = 0; i < 30; i++) { const n = pick(NAME_FAMILY) + ' ' + pick(NAME_GIVEN); if (!used.has(n)) return n; }
  return pick(NAME_FAMILY) + ' ' + pick(NAME_GIVEN);
}

/* ---------- 外見（3Dモデル用。IDから決定的に生成し、保存して固定する） ---------- */
function hashStr(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function seededRng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function generateLook(seedStr, name) {
  const r = seededRng(hashStr(seedStr));
  const given = (name || '').split(' ')[1] || '';
  const fem = FEMININE_GIVEN.has(given) ? true : given ? false : r() < 0.5;
  const P = LOOK_PARTS;
  const hairF = ['bob', 'long', 'ponytail', 'bun', 'wavy', 'short'], hairM = ['short', 'side', 'crop', 'wavy', 'side', 'crop'];
  const hair = (fem ? hairF : hairM)[Math.floor(r() * 6)];
  const hc = r(); const hairColor = hc < 0.38 ? 0 : hc < 0.62 ? 1 : hc < 0.78 ? 2 : hc < 0.86 ? 3 : hc < 0.92 ? 4 : hc < 0.96 ? 5 : hc < 0.98 ? 6 : 7;
  const st = r();
  const style = fem ? (st < 0.7 ? 'dress' : 'suit') : (st < 0.75 ? 'tux' : 'suit');
  return {
    hair, hairColor, skin: Math.floor(r() * P.skins.length), face: Math.floor(r() * P.faces), glasses: r() < 0.18,
    build: Math.round((0.92 + r() * 0.18) * 100) / 100, height: Math.round((0.95 + r() * 0.1) * 100) / 100, style,
  };
}
function ensureLooks() {
  for (const m of STATE.members) if (!m.look) m.look = generateLook(m.id + m.name, m.name);
  for (const c of STATE.conductors || []) if (!c.look) c.look = generateLook(c.id + c.name, c.name);
}

// ランダム生成：同じランクでも得意・不得意が出るよう、得意2つ・苦手1つを設定
function generateMember(inst, rank, joined) {
  const base = CONFIG.rankBaseLevel[rank] + rnd(-3, 3);
  const ids = ABILITIES.map(a => a.id);
  const strong = [], weak = [];
  const shuffled = ids.slice().sort(() => Math.random() - 0.5);
  strong.push(shuffled[0], shuffled[1]); weak.push(shuffled[2]);
  const abilities = {}, potential = {};
  const growthRoom = rank === 'S' ? 10 : rank === 'A' ? 16 : 24;
  for (const id of ids) {
    let v = base + rnd(-7, 7);
    if (strong.includes(id)) v += rnd(6, 13);
    if (weak.includes(id)) v -= rnd(6, 12);
    v = Math.round(clamp(v, 5, 98));
    abilities[id] = v;
    potential[id] = Math.round(clamp(v + rnd(3, growthRoom) + (Math.random() < 0.15 ? rnd(8, 20) : 0), v, 100));
  }
  const m = { id: newId('m'), name: randomName(), inst, abilities, potential, joined, original: false, profile: '' };
  m.look = generateLook(m.id + m.name, m.name);
  return m;
}

function makeOriginal(oc, joined) {
  const abilities = {}, potential = {};
  ABILITIES.forEach((a, i) => { abilities[a.id] = oc.abilities[i]; potential[a.id] = oc.potential[i]; });
  return { id: newId('m'), oid: oc.oid, name: oc.name, inst: oc.inst, abilities, potential, joined, original: true, profile: oc.profile,
    look: { ...(oc.look || generateLook(oc.oid, oc.name)) } };
}

function hireCost(m) {
  if (m.original) { const oc = ORIGINAL_CHARACTERS.find(o => o.oid === m.oid); if (oc?.cost) return oc.cost; }
  const room = Math.max(0, memberPotAvg(m) - memberAvg(m));
  return Math.round((CONFIG.hireCost[memberRank(m)] + room * CONFIG.hirePotentialFactor) / 1000) * 1000;
}

function countByInst() {
  const c = Object.fromEntries(INSTRUMENTS.map(i => [i.id, 0]));
  for (const m of STATE.members) c[m.inst]++;
  return c;
}
const membersOfSection = sec => STATE.members.filter(m => INST[m.inst].section === sec);

/* ---------- 首席奏者（各楽器に1名） ---------- */
const principalOf = inst => STATE.members.find(m => m.id === (STATE.principals || {})[inst]) || null;
const isPrincipal = m => !!m && (STATE.principals || {})[m.inst] === m.id;
// 首席が未設定・退団済みの楽器は、その楽器で最も能力の高い団員を自動で任命する
function ensurePrincipals() {
  STATE.principals = STATE.principals || {};
  for (const ins of INSTRUMENTS) {
    const cur = STATE.members.find(m => m.id === STATE.principals[ins.id] && m.inst === ins.id);
    if (cur) continue;
    const best = STATE.members.filter(m => m.inst === ins.id).sort((a, b) => memberAvg(b) - memberAvg(a))[0];
    if (best) STATE.principals[ins.id] = best.id; else delete STATE.principals[ins.id];
  }
}
function setPrincipal(memberId) {
  const m = STATE.members.find(x => x.id === memberId); if (!m) return false;
  STATE.principals[m.inst] = m.id; save(); return true;
}

/* ---------- セクション基礎能力（内部値） ---------- */
function sectionBase(secId) {
  const ms = membersOfSection(secId);
  const out = {};
  if (!ms.length) { SECTION_PARAMS.forEach(p => out[p.id] = 0); return out; }
  const std = SEC[secId].insts.reduce((s, i) => s + INST[i].std, 0);
  const headF = CONFIG.sectionBase.headcountFloor + (1 - CONFIG.sectionBase.headcountFloor) * Math.min(1, ms.length / std);
  // 首席奏者はセクションを率いるため重く数える
  const w = ms.map(m => isPrincipal(m) ? CONFIG.principal.baseWeight : 1), ws = w.reduce((a, b) => a + b, 0);
  for (const a of ABILITIES) out[a.param] = ms.reduce((acc, m, i) => acc + m.abilities[a.id] * w[i], 0) / ws * headF;
  // 統一感：協調性の平均から、団員の総合力のばらつきを差し引く
  out.unity -= stdev(ms.map(memberAvg)) * CONFIG.sectionBase.unitySpreadPenalty;
  out.unity = Math.max(0, out.unity);
  return out;
}
const allSectionBases = () => Object.fromEntries(SECTIONS.map(s => [s.id, sectionBase(s.id)]));
const orchestraAbility = id => mean(STATE.members.map(m => m.abilities[id]));


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

/* ---------- 演奏会 ---------- */
function emptyPerf() {
  const sections = {};
  SECTIONS.forEach(s => { sections[s.id] = {}; SECTION_PARAMS.forEach(p => sections[s.id][p.id] = 0); });
  return {
    sections,
    overall: { ensemble: 0, balance: 0, unity: 0 },  // balance は合奏での上積み分（実効値は算出）
    mastery: { underst: 0, comp: 0 },                // 今回の曲の楽曲理解度・楽曲完成度
  };
}

function createConcert() {
  const number = STATE.concertOrder.length + 1;
  const id = 'c' + number + '_' + Date.now().toString(36);
  const c = {
    id, number, title: `第${number}回 定期演奏会`,
    phase: 'setup',      // setup（準備：選曲・会場・指揮者）→ practice → prep → result → done（募集は独立）
    started: false,      // 「演奏会を始める」を押したか
    hallId: null,
    songId: null,        // 演奏する曲（1曲）
    conductorId: (STATE.conductors || []).some(x => x.id === STATE.conductorId) ? STATE.conductorId : null,  // 前回の担当を引き継ぐ
    practiceDone: 0,
    practices: [],       // 練習履歴
    perf: emptyPerf(),   // 発表会パラメータ（毎回0から）
    rehearsal: { done: false },  // ホール練習
    policy: 'stable',
    growth: {},          // 今回の育成による能力上昇 { memberId: { abil: +n } }
    trainingUsed: {},    // 育成の実施済み記録 { 'lesson:m12': true }
    trainingLog: [],
    songGrowth: {},      // { songId: { param: +n } }
    ledger: [],          // 収支 [{label, amount}]
    result: null,
  };
  STATE.concertPrograms[id] = c;
  STATE.concertOrder.push(id);
  STATE.activeConcertId = id;
  return c;
}
const activeConcert = () => STATE.concertPrograms[STATE.activeConcertId];

/* ---------- 新規ゲーム ---------- */
function newGame(name) {
  STATE = {
    version: CONFIG.SAVE_VERSION,
    orchestraName: name || '星霜フィルハーモニー管弦楽団',
    funds: CONFIG.initialFunds,
    reputation: CONFIG.initialReputation,
    members: [],
    songParams: {},
    concertPrograms: {},
    concertOrder: [],
    activeConcertId: null,
    recruit: emptyRecruit(),  // 団員募集（演奏会から独立）
    ledger: [],               // 演奏会に属さない支出（採用費・追加募集）
    nextId: 1,
    createdAt: Date.now(),
  };
  const initialOC = ORIGINAL_CHARACTERS.filter(o => o.initial);
  for (const inst of INSTRUMENTS) {
    let n = inst.std;
    for (const oc of initialOC.filter(o => o.inst === inst.id)) { STATE.members.push(makeOriginal(oc, 0)); n--; }
    for (let i = 0; i < n; i++) STATE.members.push(generateMember(inst.id, weightedPick(CONFIG.initialRankWeights), 0));
  }
  STATE.conductors = [makeConductor(ORIGINAL_CONDUCTORS.find(o => o.founder))];
  STATE.conductorId = STATE.conductors[0].id;
  ensurePrincipals();
  createConcert();
  generateRecruitCandidates();
  generateConductorCandidates();
  save();
}

/* ---------- 演奏会の準備（選曲・会場の予約・指揮者の選択。順不同） ---------- */
const inSetup = c => c.phase === 'setup';
function startSetup(c) { if (inSetup(c) && !c.started) { c.started = true; save(); } }
// 会場の予約：使用料は予約時に支払う。練習が始まるまでは変更でき、その場合は前の予約を全額返金する
function hallBlockReason(c, hall) {
  if (!inSetup(c)) return '会場は演奏会の準備中にのみ予約できます';
  if (c.hallId === hall.id) return '予約済みの会場です';
  const refund = c.hallId ? findHall(c.hallId).fee : 0;
  if (hall.fee > 0 && STATE.funds + refund < hall.fee) return `資金不足（あと ¥${(hall.fee - STATE.funds - refund).toLocaleString('ja-JP')}）`;
  return null;
}
function selectHall(c, hallId) {
  const hall = findHall(hallId);
  if (!hall || hallBlockReason(c, hall)) return false;
  if (c.hallId) { const old = findHall(c.hallId); if (old.fee) earn(c, `予約取消・返金（${old.name}）`, old.fee); }
  spend(c, `ホール使用料（${hall.name}）`, hall.fee);
  c.hallId = hallId; c.started = true;
  save(); return true;
}
// 今回の演奏会を担当する指揮者（契約中の最大3名から1名）
function selectConcertConductor(c, id) {
  if (!inSetup(c) || !(STATE.conductors || []).some(x => x.id === id)) return false;
  c.conductorId = id; STATE.conductorId = id; c.started = true;
  save(); return true;
}
function setupStatus(c) {
  const song = !!(c.songId && findSong(c.songId));
  const hall = !!(c.hallId && findHall(c.hallId));
  const conductor = !!(c.conductorId && (STATE.conductors || []).some(x => x.id === c.conductorId));
  return { song, hall, conductor, ready: song && hall && conductor };
}
// 3項目がそろったら練習期間へ（ここから先は従来どおり）
function startPractice(c) {
  if (!inSetup(c) || !setupStatus(c).ready) return false;
  STATE.conductorId = c.conductorId;
  c.phase = 'practice';
  save(); return true;
}

/* ---------- 募集（演奏会の進行から独立。団員タブからいつでも実行） ----------
 * 状態は STATE.recruit に保持し、演奏会データ（concertPrograms）には一切触れない。
 * 支出は楽団全体の帳簿 STATE.ledger に記録する。
 */
function emptyRecruit() { return { candidates: [], hired: [], rerolls: 0 }; }
const joinIndex = () => STATE.concertOrder.length;   // 入団時期（第n回の演奏会の頃）
function spendGeneral(label, amount) {
  if (amount > 0 && STATE.funds < amount) return false;
  STATE.funds -= amount;
  STATE.ledger.push({ label, amount: -amount, concert: joinIndex(), at: Date.now() });
  return true;
}
function generateRecruitCandidates() {
  const have = countByInst();
  const inOrch = new Set(STATE.members.filter(m => m.oid).map(m => m.oid));
  const list = [];
  for (let i = 0; i < CONFIG.recruitCandidates; i++) {
    const avail = ORIGINAL_CHARACTERS.filter(o => !o.initial && !inOrch.has(o.oid) && !list.some(x => x.oid === o.oid));
    if (avail.length && Math.random() < CONFIG.originalCandidateChance) {
      const m = makeOriginal(pick(avail), joinIndex()); m.cost = hireCost(m); list.push(m); continue;
    }
    const w = {}; INSTRUMENTS.forEach(ins => w[ins.id] = (have[ins.id] < ins.cap ? 3 : 0.6) * (ins.kind === 'string' ? 1.3 : 1));
    const m = generateMember(weightedPick(w), weightedPick(CONFIG.recruitRankWeights), joinIndex());
    m.cost = hireCost(m); list.push(m);
  }
  STATE.recruit.candidates = list;
  STATE.recruit.hired = [];
}
function hireBlockReason(cand) {
  if (STATE.recruit.hired.includes(cand.id)) return '採用済み';
  const have = countByInst()[cand.inst];
  if (have >= INST[cand.inst].cap) return `${INST[cand.inst].abbr} は在籍上限（${INST[cand.inst].cap}名）に達しています`;
  if (STATE.funds < cand.cost) return `資金不足（あと ¥${(cand.cost - STATE.funds).toLocaleString('ja-JP')}）`;
  return null;
}
function hireCandidate(candId) {
  const cand = STATE.recruit.candidates.find(x => x.id === candId);
  if (!cand || hireBlockReason(cand)) return false;
  spendGeneral(`採用費（${cand.name}・${INST[cand.inst].abbr}）`, cand.cost);
  const m = { ...cand, abilities: { ...cand.abilities }, potential: { ...cand.potential }, joined: joinIndex() };
  delete m.cost;
  STATE.members.push(m);
  STATE.recruit.hired.push(cand.id);
  ensurePrincipals();   // その楽器に首席がいなければ自動で任命
  save(); return true;
}
function rerollRecruit() {
  if (STATE.funds < CONFIG.rerollRecruitCost) return false;
  spendGeneral('追加募集（候補者の入れ替え）', CONFIG.rerollRecruitCost);
  STATE.recruit.rerolls++;
  generateRecruitCandidates(); save(); return true;
}
function dismissMember(memberId) {
  const before = STATE.members.length;
  STATE.members = STATE.members.filter(m => m.id !== memberId);
  if (STATE.members.length === before) return false;
  ensurePrincipals();   // 首席が退団した場合は、同じ楽器の最も能力の高い団員が後任になる
  save(); return true;
}

/* ---------- 指揮者（採用・変更・育成・成長） ---------- */
const condAvg = c => mean(CONDUCTOR_ABILITIES.map(a => c.abilities[a.id]));
const condPotAvg = c => mean(CONDUCTOR_ABILITIES.map(a => c.potential[a.id]));
function condRank(c) { for (const [r, t] of CONFIG.conductor.rankThresholds) if (condAvg(c) >= t) return r; return 'E'; }
const entityAvg = e => mean(Object.values(e.abilities));
function makeConductor(o) {
  const abilities = {}, potential = {};
  CONDUCTOR_ABILITIES.forEach((a, i) => { abilities[a.id] = Array.isArray(o.abilities) ? o.abilities[i] : o.abilities[a.id]; potential[a.id] = Array.isArray(o.potential) ? o.potential[i] : o.potential[a.id]; });
  const c = { id: newId('k'), oid: o.oid || null, name: o.name, abilities, potential, trait: o.trait, founder: !!o.founder,
    original: !!o.oid, profile: o.profile || '', joined: STATE.concertOrder ? STATE.concertOrder.length : 0, concerts: 0 };
  c.look = o.look ? { ...o.look } : generateLook(c.id + c.name, c.name);
  return c;
}
function generateConductor(rank) {
  const base = CONFIG.rankBaseLevel[rank] + rnd(-3, 3);
  const ab = [], pot = [];
  CONDUCTOR_ABILITIES.forEach(() => { const v = Math.round(clamp(base + rnd(-9, 9), 10, 96)); ab.push(v); pot.push(Math.round(clamp(v + rnd(5, rank === 'S' ? 10 : 26), v, 100))); });
  const t = pick(CONDUCTOR_TRAITS);
  return makeConductor({ name: randomName(), abilities: ab, potential: pot, trait: t.id, profile: `${t.name}の指揮者。${t.desc}` });
}
function conductorHireCost(c) {
  const oc = c.oid && ORIGINAL_CONDUCTORS.find(o => o.oid === c.oid);
  if (oc?.cost) return oc.cost;
  const room = Math.max(0, condPotAvg(c) - condAvg(c));
  return Math.round((CONFIG.conductor.hireCost[condRank(c)] + room * CONFIG.conductor.hirePotentialFactor) / 1000) * 1000;
}
// 1演奏会ごとの出演料（創設以来の常任指揮者は無償）
function conductorFee(c) {
  if (!c || c.founder) return 0;
  const K = CONFIG.conductor;
  return Math.max(K.feeMin, Math.round(Math.max(0, condAvg(c) - K.feeBase) * K.feePerPoint / 1000) * 1000);
}
// 現在の演奏会に担当指揮者が決まっていればその指揮者、なければ楽団の既定（前回の担当）
function activeConductor() {
  const cs = STATE.conductors || [];
  const cc = STATE.concertPrograms && STATE.concertPrograms[STATE.activeConcertId];
  const id = cc && cc.conductorId && cs.some(x => x.id === cc.conductorId) ? cc.conductorId : STATE.conductorId;
  return cs.find(x => x.id === id) || null;
}
function generateConductorCandidates() {
  const owned = new Set((STATE.conductors || []).map(c => c.oid).filter(Boolean));
  const list = [];
  for (let i = 0; i < CONFIG.conductor.candidates; i++) {
    const avail = ORIGINAL_CONDUCTORS.filter(o => !o.founder && !owned.has(o.oid) && !list.some(x => x.oid === o.oid));
    const c = avail.length && Math.random() < CONFIG.conductor.originalChance ? makeConductor(pick(avail)) : generateConductor(weightedPick(CONFIG.conductor.rankWeights));
    c.cost = conductorHireCost(c); list.push(c);
  }
  STATE.conductorMarket = { candidates: list, hired: [] };
}
function conductorHireBlockReason(cand) {
  if (STATE.conductorMarket.hired.includes(cand.id)) return '契約済み';
  if (STATE.conductors.length >= CONFIG.conductor.maxHired) return `契約できる指揮者は${CONFIG.conductor.maxHired}名までです`;
  if (STATE.funds < cand.cost) return `資金不足（あと ¥${(cand.cost - STATE.funds).toLocaleString('ja-JP')}）`;
  return null;
}
function hireConductor(candId) {
  const cand = STATE.conductorMarket.candidates.find(x => x.id === candId);
  if (!cand || conductorHireBlockReason(cand)) return false;
  spendGeneral(`指揮者の契約金（${cand.name}）`, cand.cost);
  const c = { ...cand, abilities: { ...cand.abilities }, potential: { ...cand.potential }, look: { ...cand.look }, joined: STATE.concertOrder.length };
  delete c.cost;
  STATE.conductors.push(c);
  STATE.conductorMarket.hired.push(cand.id);
  save(); return true;
}
function rerollConductors() {
  if (STATE.funds < CONFIG.conductor.rerollCost) return false;
  spendGeneral('指揮者候補の再調査', CONFIG.conductor.rerollCost);
  generateConductorCandidates(); save(); return true;
}
// 団員タブからの担当変更：準備中なら今回の演奏会にも反映、練習開始後は次回からの既定になる
function setActiveConductor(id) {
  if (!STATE.conductors.some(c => c.id === id)) return false;
  STATE.conductorId = id;
  const c = activeConcert(); if (c && inSetup(c)) c.conductorId = id;
  save(); return true;
}
function dismissConductorBlockReason(id) {
  if (STATE.conductors.length <= 1) return '指揮者が1名だけのため契約を解除できません';
  const c = activeConcert();
  if (c && c.conductorId === id && c.phase !== 'done') return '今回の演奏会の担当指揮者は解除できません';
  if (STATE.conductorId === id) return '現在の担当指揮者は解除できません（先に担当を変更してください）';
  return null;
}
function dismissConductor(id) {
  if (dismissConductorBlockReason(id)) return false;
  STATE.conductors = STATE.conductors.filter(c => c.id !== id); save(); return true;
}
// 演奏会の経験による成長（潜在能力を超えない）
function conductorGrowthAfterConcert(cd) {
  const out = [];
  if (!cd) return out;
  cd.concerts = (cd.concerts || 0) + 1;
  for (const a of CONDUCTOR_ABILITIES) {
    const gap = cd.potential[a.id] - cd.abilities[a.id];
    if (gap <= 0 || Math.random() >= CONFIG.conductor.growthChance) continue;
    const inc = Math.min(gap, randInt(1, 2));
    out.push({ abil: a.id, from: cd.abilities[a.id], to: cd.abilities[a.id] + inc });
    cd.abilities[a.id] += inc;
  }
  return out;
}
// 指揮者能力の効果（50 を基準とした差分）
function conductorEffect(policyId) {
  const cd = activeConductor(), K = CONFIG.conductor;
  if (!cd) return { composite: 0, tech: 0, expr: 0, ens: 0, tutti: 1, underst: 1, attendance: 0, prob: 0, evalBonus: 0 };
  const a = cd.abilities, tr = CTRAIT[cd.trait] || {};
  const match = tr.policy && tr.policy === policyId;
  return {
    composite: (mean([a.lead, a.interp, a.baton]) - 50) * K.compositeWeight,
    tech: (a.baton - 50) * K.evalWeight, expr: (a.interp - 50) * K.evalWeight, ens: (a.lead - 50) * K.evalWeight,
    tutti: (1 + (a.lead - 50) * K.practiceWeight) * (tr.practice || 1),
    underst: 1 + (a.interp - 50) * K.practiceWeight,
    attendance: (a.charisma - 50) * K.attendancePerPoint,
    prob: match ? K.traitProb : 0, evalBonus: match ? K.traitEval : 0,
  };
}
// 管打楽器の首席によるソロの出来（音楽表現の評価へ）
function principalSoloBonus(song) {
  const req = songRequirements(song);
  const ps = Object.keys(req).filter(i => INST[i].kind !== 'string').map(principalOf).filter(Boolean);
  if (!ps.length) return 0;
  return (mean(ps.map(m => (m.abilities.tone + m.abilities.expr) / 2)) - 55) * CONFIG.principal.soloWeight;
}

/* ---------- 選曲（プレイヤーが一覧から1曲を選ぶ） ---------- */
function confirmSong(c, songId) {
  if (!inSetup(c) || !findSong(songId)) return false;
  c.songId = songId; c.started = true;
  songParam(songId);
  save(); return true;
}

/* ---------- 育成（資金で団員の能力を伸ばす） ---------- */
const findTraining = id => CONFIG.trainings.find(t => t.id === id);
function trainingTargets(t, targetId) {
  if (t.target === 'section') return membersOfSection(targetId);
  if (t.target === 'conductor') { const c = (STATE.conductors || []).find(x => x.id === targetId); return c ? [c] : []; }
  const m = STATE.members.find(x => x.id === targetId); return m ? [m] : [];
}
function trainingCost(t, targetId) {
  if (t.id === 'instrument') {
    const m = STATE.members.find(x => x.id === targetId); if (!m) return 0;
    const next = CONFIG.instrumentGrades[(m.instrumentGrade || 0) + 1];
    return next ? next.cost : 0;
  }
  const ms = trainingTargets(t, targetId);
  const lv = t.cost.levelFactor ? t.cost.levelFactor * mean(ms.map(entityAvg)) : 0;
  return Math.round((t.cost.base + t.cost.perMember * ms.length + lv) / 1000) * 1000;
}
function trainingGains(t, m) {
  if (t.id === 'instrument') return (CONFIG.instrumentGrades[(m.instrumentGrade || 0) + 1] || {}).gains || {};
  return t.gains;
}
function hasRoom(t, ms, ability) {
  return ms.some(m => {
    if (t.chooseAbility) return m.potential[ability] > m.abilities[ability] || ABILITIES.some(a => m.potential[a.id] > m.abilities[a.id]);
    return Object.keys(trainingGains(t, m)).some(a => m.potential[a] > m.abilities[a]);
  });
}
function trainingBlockReason(c, tId, targetId, ability) {
  const t = findTraining(tId);
  if (!t) return '育成方法を選んでください';
  if (c.phase === 'result' || c.phase === 'done') return '次の演奏会のサイクルで実施できます';
  if (!targetId) return t.target === 'section' ? 'セクションを選んでください' : t.target === 'conductor' ? '指揮者を選んでください' : '団員を選んでください';
  const ms = trainingTargets(t, targetId);
  if (!ms.length) return t.target === 'section' ? 'このセクションには団員がいません' : t.target === 'conductor' ? '指揮者が見つかりません' : '団員が見つかりません';
  if (t.chooseAbility && !ability) return '伸ばす能力を選んでください';
  if (t.limit === 'concert' && c.trainingUsed[`${t.id}:${targetId}`]) return '今回の演奏会ではすでに実施しました';
  if (t.id === 'instrument' && !CONFIG.instrumentGrades[(ms[0].instrumentGrade || 0) + 1]) return 'すでに最高グレードの楽器です';
  if (!hasRoom(t, ms, ability)) return '潜在能力の上限に達していて伸びしろがありません';
  const cost = trainingCost(t, targetId);
  if (STATE.funds < cost) return `資金不足（あと ¥${(cost - STATE.funds).toLocaleString('ja-JP')}）`;
  return null;
}
function applyGain(c, m, abil, amount, out) {
  const gap = m.potential[abil] - m.abilities[abil];
  const inc = Math.min(amount, gap);
  if (inc <= 0) return;
  const from = m.abilities[abil];
  m.abilities[abil] = from + inc;   // 潜在能力を超えない
  c.growth[m.id] = c.growth[m.id] || {};
  c.growth[m.id][abil] = (c.growth[m.id][abil] || 0) + inc;
  out.push({ id: m.id, name: m.name, abil, from, to: from + inc });
}
function runTraining(c, tId, targetId, ability) {
  const err = trainingBlockReason(c, tId, targetId, ability);
  if (err) return { error: err };
  const t = findTraining(tId);
  const ms = trainingTargets(t, targetId);
  const cost = trainingCost(t, targetId);
  const targetName = t.target === 'section' ? `${SEC[targetId].name}セクション` : ms[0].name;
  spend(c, `${t.name}（${targetName}）`, cost);
  const gains = [];
  let extra = '';
  for (const m of ms) {
    if (t.chooseAbility) {
      const [fa, fb] = t.gains._focus; applyGain(c, m, ability, randInt(fa, fb), gains);
      const [oa, ob, op] = t.gains._other;
      const others = ABILITIES.map(a => a.id).filter(a => a !== ability && m.potential[a] > m.abilities[a]);
      if (others.length && Math.random() < op) applyGain(c, m, pick(others), randInt(oa, ob), gains);
    } else {
      for (const [abil, [a, b, p]] of Object.entries(trainingGains(t, m))) if (Math.random() < p) applyGain(c, m, abil, randInt(a, b), gains);
    }
  }
  if (t.id === 'instrument') {
    const m = ms[0]; m.instrumentGrade = (m.instrumentGrade || 0) + 1;
    extra = `${m.name}の楽器が「${CONFIG.instrumentGrades[m.instrumentGrade].name}」になった。`;
  }
  if (t.limit === 'concert') c.trainingUsed[`${t.id}:${targetId}`] = true;
  const entry = { tId, name: t.name, message: t.message, target: targetName, cost, gains, extra, ability: ability || null };
  c.trainingLog.push(entry);
  save();
  return entry;
}

/* ---------- 練習（発表会の仕上がりのみ。団員の恒久的な能力は上がらない） ---------- */
const eff = base => CONFIG.practice.effMin + base / CONFIG.practice.effDiv;
const dim = cur => 1 / (1 + Math.max(0, cur) / CONFIG.practice.diminishScale);
const noise = () => rnd(CONFIG.practice.randomMin, CONFIG.practice.randomMax);
const capPerf = v => Math.min(v, CONFIG.practice.perfCap * 1.2);
const difficultyFactor = song => 1.25 - song.difficulty / 160;

function emptyFocus() { return Object.fromEntries(FOCUS.map(f => [f.id, 0])); }
function focusValid(f) { return f && FOCUS.reduce((s, x) => s + (f[x.id] || 0), 0) === CONFIG.focusPoints && FOCUS.every(x => (f[x.id] || 0) >= 0); }

function autoSectionFocus(c, secId) {
  const base = sectionBase(secId), cur = c.perf.sections[secId];
  const done = c.practiceDone / CONFIG.practiceCount;
  const scored = SECTION_PARAMS.map(p => ({
    p: p.id,
    // 低い項目ほど・基礎能力に対して伸び代がある項目ほど優先
    k: (100 - cur[p.id]) * (0.6 + base[p.id] / 100) - Math.max(0, cur[p.id] - (base[p.id] * 0.9 + 10 * done)) + rnd(0, 6),
  })).sort((a, b) => b.k - a.k);
  const f = emptyFocus();
  const pToF = Object.fromEntries(FOCUS.filter(x => x.param).map(x => [x.param, x.id]));
  f[pToF[scored[0].p]] += 4; f[pToF[scored[1].p]] += 3; f[pToF[scored[2].p]] += 3;
  return f;
}
function autoTuttiFocus(c) {
  const ov = effectiveOverall(c);
  const m = c.perf.mastery;
  const f = emptyFocus();
  const cand = [
    ['ens', 100 - ov.ensemble], ['dyn', 100 - ov.balance], ['expr', 100 - ov.unity],
    ['underst', 100 - m.underst], ['tech', 100 - m.comp],
  ].map(([k, v]) => [k, v + rnd(0, 8)]).sort((a, b) => b[1] - a[1]);
  f[cand[0][0]] += 4; f[cand[1][0]] += 3; f[cand[2][0]] += 3;
  return f;
}

function trySongParamGrowth(c, songId, weights, chanceBase, log) {
  const sp = songParam(songId);
  const param = weightedPick(weights);
  const p = chanceBase / (1 + sp[param] / CONFIG.songParam.diminishScale);
  if (Math.random() >= p) return;
  sp[param] += 1;
  c.songGrowth[songId] = c.songGrowth[songId] || {};
  c.songGrowth[songId][param] = (c.songGrowth[songId][param] || 0) + 1;
  log.songParams.push({ songId, param, to: sp[param] });
}
// ポイントの効き方は逓減（1項目への極端な集中より、配分した方が効率的）
const ptsEff = pts => pts > 0 ? CONFIG.focusPoints * Math.pow(pts / CONFIG.focusPoints, CONFIG.practice.pointsExponent) : 0;
// 1回の上昇量にも逓減を適用（上昇の途中で伸びにくくなる効果を近似）
const settle = (g0, cur) => g0 * dim(cur + g0 / 2) / dim(cur);
function addSec(c, log, sec, param, gain) {
  if (gain <= 0) return;
  const before = c.perf.sections[sec][param];
  gain = settle(gain, before);
  c.perf.sections[sec][param] = capPerf(before + gain);
  log.sections[sec] = log.sections[sec] || {};
  log.sections[sec][param] = (log.sections[sec][param] || 0) + (c.perf.sections[sec][param] - before);
}
function addOverall(c, log, key, gain) {
  if (gain <= 0) return;
  gain = settle(gain, c.perf.overall[key]);
  c.perf.overall[key] = capPerf(c.perf.overall[key] + gain);
  log.overall[key] = (log.overall[key] || 0) + gain;
}
function addMastery(c, log, key, gain) {
  if (gain <= 0) return;
  gain = settle(gain, c.perf.mastery[key]);
  c.perf.mastery[key] = capPerf(c.perf.mastery[key] + gain);
  log.mastery[key] = (log.mastery[key] || 0) + gain;
}

/**
 * plan = { menu: 'tutti'|'section'|'individual',
 *          focus: {...},                  // tutti / individual
 *          sections: { hs:{...}, ... },     // section
 *          members: [memberId...] }         // individual
 */
function validatePlan(c, plan) {
  if (c.phase !== 'practice') return '今は練習期間ではありません';
  if (c.practiceDone >= CONFIG.practiceCount) return '通常練習はすべて終了しました';
  if (plan.menu === 'section') {
    for (const s of SECTIONS) if (!focusValid(plan.sections?.[s.id])) return `${s.name}の配分が${CONFIG.focusPoints}ポイントになっていません`;
  } else if (plan.menu === 'tutti' || plan.menu === 'individual') {
    if (!focusValid(plan.focus)) return `重点項目の配分を合計${CONFIG.focusPoints}ポイントにしてください`;
    if (plan.menu === 'individual') {
      if (!plan.members?.length) return '対象の団員を選んでください';
      if (plan.members.length > CONFIG.individualMaxTargets) return `対象は${CONFIG.individualMaxTargets}名までです`;
    }
  } else return '練習メニューを選んでください';
  return null;
}

function runPractice(c, plan) {
  const err = validatePlan(c, plan); if (err) return { error: err };
  const P = CONFIG.practice;
  const bases = allSectionBases();
  const log = { no: c.practiceDone + 1, menu: plan.menu, plan: JSON.parse(JSON.stringify(plan)), sections: {}, overall: {}, mastery: {}, songParams: [] };
  const present = SECTIONS.filter(s => membersOfSection(s.id).length).map(s => s.id);
  const song = findSong(c.songId);
  const used = songSections(song);
  const m = c.perf.mastery;

  if (plan.menu === 'section') {
    for (const sec of present) {
      const f = plan.sections[sec];
      for (const fo of FOCUS) {
        const pts = f[fo.id]; if (!pts) continue;
        if (fo.param) addSec(c, log, sec, fo.param, P.kSection * ptsEff(pts) * eff(bases[sec][fo.param]) * dim(c.perf.sections[sec][fo.param]) * noise());
        if (fo.id === 'ens') addOverall(c, log, 'unity', 0.12 * pts * eff(bases[sec].unity) * dim(c.perf.overall.unity) * noise());
        if (fo.id === 'underst' && used.includes(sec)) addMastery(c, log, 'underst', 0.35 * pts * eff(bases[sec].expr) * dim(m.underst) * noise());
      }
      // 楽曲完成度（その曲で使うセクションの練習が効く）
      if (used.includes(sec)) {
        const techPts = 10 - (f.underst || 0);
        addMastery(c, log, 'comp', P.kSectionMastery * techPts / 10 * eff(mean(Object.values(bases[sec]))) * dim(m.comp) * difficultyFactor(song) * noise());
      }
    }
  }

  if (plan.menu === 'tutti') {
    const f = plan.focus;
    const ce = conductorEffect(c.policy);   // 指揮者の統率力・解釈力が合奏の効率を左右する
    for (const sec of present) for (const fo of FOCUS) {
      const pts = f[fo.id]; if (!pts || !fo.param) continue;
      addSec(c, log, sec, fo.param, ce.tutti * P.kTuttiSection * ptsEff(pts) * eff(bases[sec][fo.param]) * dim(c.perf.sections[sec][fo.param]) * noise());
    }
    const rc = mean([orchestraAbility('rhythm'), orchestraAbility('coop')]);
    const ec = mean([orchestraAbility('expr'), orchestraAbility('coop')]);
    addOverall(c, log, 'ensemble', ce.tutti * (P.kTuttiBaseEnsemble + P.kTuttiOverall * 0.35 * (f.ens + 0.4 * f.rhythm)) * eff(rc) * dim(c.perf.overall.ensemble) * noise());
    addOverall(c, log, 'unity', ce.tutti * (1.2 + P.kTuttiOverall * 0.3 * (0.6 * f.ens + 0.6 * f.expr + 0.3 * f.underst)) * eff(ec) * dim(c.perf.overall.unity) * noise());
    addOverall(c, log, 'balance', P.kTuttiOverall * 0.25 * f.dyn * eff(orchestraAbility('dyn')) * dim(c.perf.overall.balance) * noise());
    const avgAll = mean(STATE.members.map(memberAvg));
    const compPts = f.tech + f.pitch + f.rhythm + 0.8 * f.ens + 0.4 * (f.tone + f.dyn) + 2;
    const undPts = 1.5 * f.underst + 0.8 * f.expr + 1;
    addMastery(c, log, 'comp', P.kMastery * 0.35 * compPts * eff(avgAll) * dim(m.comp) * difficultyFactor(song) * noise());
    addMastery(c, log, 'underst', ce.underst * P.kMastery * 0.35 * undPts * eff(orchestraAbility('expr')) * dim(m.underst) * difficultyFactor(song) * noise());
    // 曲パラメータ（長期）：いずれか1項目+1の機会
    trySongParamGrowth(c, song.id, {
      base: 1 + f.tech + f.pitch + f.rhythm + f.ens, underst: 1 + f.underst * 2, expr: 1 + f.expr + f.tone + f.dyn,
    }, CONFIG.songParam.tuttiBaseChance * avgAll / 55, log);
  }

  if (plan.menu === 'individual') {
    const f = plan.focus;
    for (const id of plan.members) {
      const mem = STATE.members.find(x => x.id === id); if (!mem) continue;
      const sec = INST[mem.inst].section;
      const nSec = membersOfSection(sec).length;
      for (const fo of FOCUS) {
        const pts = f[fo.id]; if (!pts) continue;
        if (fo.param) addSec(c, log, sec, fo.param, P.kIndividualSection * ptsEff(pts) * (mem.abilities[fo.abil] / 60) * dim(c.perf.sections[sec][fo.param]) * noise() / Math.sqrt(nSec));
        if (fo.id === 'underst') addMastery(c, log, 'underst', P.kIndividualMastery * pts / 10 * (mem.abilities.expr / 60) * dim(m.underst) * noise());
      }
      // 個人の音楽性が曲の長期的な習熟（曲パラメータ）を深めることがある
      const a = mem.abilities;
      trySongParamGrowth(c, song.id, {
        base: (a.tech + a.ear) / 2, underst: (a.expr + a.coop) / 2 + f.underst * 4, expr: (a.expr + a.tone) / 2 + f.expr * 3,
      }, CONFIG.songParam.individualBaseChance * mean([a.expr, a.tone, a.ear]) / 65, log);
    }
  }

  c.practiceDone++;
  log.summary = summarizeLog(log);
  c.practices.push(log);
  if (c.practiceDone >= CONFIG.practiceCount) c.phase = 'prep';
  save();
  return { log };
}

function summarizeLog(log) {
  const menu = { tutti: '全体合奏', section: 'セクション練習', individual: '個人練習', hall: 'ホール練習' }[log.menu];
  let total = 0;
  Object.values(log.sections).forEach(o => Object.values(o).forEach(v => total += v));
  Object.values(log.overall).forEach(v => total += v);
  Object.values(log.mastery).forEach(v => total += v);
  return `${menu}：仕上がり +${round1(total)}／曲パラメータ +${log.songParams.length}`;
}

// ホール練習（任意・1回・会場の練習使用料が必要）：本番の安定性を高め、一流会場の重圧を和らげる
function rehearsalBlockReason(c) {
  if (c.phase !== 'prep') return '本番準備の段階で実施できます';
  if (c.rehearsal.done) return '実施済みです';
  const fee = concertHall(c).rehearsalFee;
  if (STATE.funds < fee) return `資金不足（あと ¥${(fee - STATE.funds).toLocaleString('ja-JP')}）`;
  return null;
}
function runHallPractice(c) {
  if (rehearsalBlockReason(c)) return null;
  const hall = concertHall(c);
  spend(c, `ホール練習（${hall.name}）`, hall.rehearsalFee);
  const log = { no: 'H', menu: 'hall', sections: {}, overall: {}, mastery: {}, songParams: [] };
  for (const s of SECTIONS) if (membersOfSection(s.id).length) {
    addSec(c, log, s.id, 'tone', rnd(0.5, 1.5)); addSec(c, log, s.id, 'dyn', rnd(0.5, 1.5));
  }
  addOverall(c, log, 'balance', rnd(1.5, 3)); addOverall(c, log, 'unity', rnd(0.5, 1.5));
  c.rehearsal.done = true;
  log.summary = `${hall.name}の響きを確認：成功率と演奏の安定性が向上`;
  c.practices.push(log);
  save();
  return log;
}

/* ---------- 実効パラメータ／成功確率 ---------- */
function effectiveOverall(c) {
  const present = SECTIONS.filter(s => membersOfSection(s.id).length).map(s => s.id);
  const dyn = present.map(s => c.perf.sections[s].dyn);
  const uni = present.map(s => c.perf.sections[s].unity);
  return {
    ensemble: c.perf.overall.ensemble,
    // バランス：各セクションのダイナミクスの平均から、ばらつきを差し引く＋合奏での調整分
    balance: Math.max(0, mean(dyn) - 0.8 * stdev(dyn) + c.perf.overall.balance),
    unity: 0.55 * c.perf.overall.unity + 0.45 * mean(uni),
  };
}
function sectionScoreFor(c, song, param) {
  const w = CONFIG.concert.sectionWeight;
  let s = 0, ws = 0;
  for (const sec of songSections(song)) {
    const v = param ? c.perf.sections[sec][param] : mean(SECTION_PARAMS.map(p => c.perf.sections[sec][p.id]));
    s += v * w[sec]; ws += w[sec];
  }
  return ws ? s / ws : 0;
}
// 楽団の地力（曲で使うセクションの基礎能力平均）
function orchestraStrength(song) {
  const secs = songSections(song);
  return mean(secs.map(s => mean(Object.values(sectionBase(s)))));
}
function songReadiness(c) {
  const song = findSong(c.songId);
  const K = CONFIG.concert;
  const ov = effectiveOverall(c);
  const m = c.perf.mastery;
  const sec = sectionScoreFor(c, song);
  const ovS = mean([ov.ensemble, ov.balance, ov.unity]);
  const mas = (m.underst + m.comp) / 2;
  const long = songLongBonus(song.id);
  const strength = K.abilityWeight * (orchestraStrength(song) - 50);
  const conductor = conductorEffect(c.policy).composite;
  const composite = K.composite.section * sec + K.composite.overall * ovS + K.composite.mastery * mas + long + strength + conductor
    - K.composite.imbalancePenalty * stdev([sec, ovS, mas]);
  const required = K.requiredBase + song.difficulty * K.requiredPerDifficulty;
  const short = shortageOf(song);
  const mult = Math.max(K.shortage.floor, 1 - short.penalty);
  const pBase = sigmoid((composite - required) / K.sigmoidScale);
  return { song, sec, ovS, mas, long, strength, conductor, composite, required, short, mult, pBase, p: pBase * mult };
}
function stageOverflow(c) {
  const hall = concertHall(c), song = findSong(c.songId);
  return hall && song ? Math.max(0, songPlayers(song) - hall.stage) : 0;
}
function successInfo(c, opts = {}) {
  const K = CONFIG.concert;
  const rehearsal = opts.rehearsal ?? c.rehearsal.done;
  const policy = CONFIG.policies[opts.policy || c.policy];
  const hall = concertHall(c);
  const r = songReadiness(c);
  const overflow = stageOverflow(c);
  const overflowMult = Math.max(0.3, 1 - overflow * CONFIG.hallEffect.overflowProb);
  const pressure = rehearsal ? 0 : hall.pressure;
  let p = r.p * overflowMult;
  const ce = conductorEffect(opts.policy || c.policy);
  p += ((rehearsal ? K.hallBonus : 0) + policy.prob + ce.prob - pressure) * Math.max(0.2, r.mult);
  p = clamp(p, K.minProb, K.maxProb);
  return { prob: p, readiness: r, rehearsal, policy, hall, overflow, overflowMult, pressure };
}

/* ---------- 集客・収支 ---------- */
function attendanceRate(c) {
  const E = CONFIG.economy, hall = concertHall(c), song = findSong(c.songId);
  const durF = clamp(E.durationBase + song.duration / E.durationDiv, E.durationBase, E.durationMax);
  const rate = (hall.attendance + STATE.reputation * hall.repSens + (song.popularity - 3) * E.popularityAttendance + conductorEffect(c.policy).attendance) * durF;
  return clamp(rate, E.attendanceMin, E.attendanceMax);
}
const ticketRevenue = c => Math.round(concertHall(c).capacity * attendanceRate(c)) * concertHall(c).ticket;
const resultMultiplier = score => clamp(CONFIG.economy.resultBase + score * CONFIG.economy.resultSlope, CONFIG.economy.resultMin, CONFIG.economy.resultMax);
function settlementFor(c, score, rank) {
  const E = CONFIG.economy;
  const audience = Math.round(concertHall(c).capacity * attendanceRate(c));
  const ticket = ticketRevenue(c);
  const perf = Math.round(ticket * (resultMultiplier(score) - 1) / 1000) * 1000;   // 評価による増減（物販・追加寄付・払い戻し等）
  const sponsor = E.sponsor[rank] || 0;
  const operating = operatingCost();
  const conductorFeeAmt = conductorFee(activeConductor());
  return { audience, ticket, perf, sponsor, operating, conductorFee: conductorFeeAmt, net: ticket + perf + sponsor - operating - conductorFeeAmt };
}

/* ---------- 本番 ---------- */
function concertRankOf(score) { for (const [r, t] of CONFIG.concert.rankThresholds) if (score >= t) return r; return 'D'; }
const EVAL_CATS = [
  { id: 'tech', name: '技術面', w: 0.22 }, { id: 'expr', name: '音楽表現', w: 0.22 }, { id: 'ens', name: 'アンサンブル', w: 0.2 },
  { id: 'bal', name: '音量・バランス', w: 0.16 }, { id: 'comp', name: '楽曲完成度', w: 0.2 },
];

function runConcert(c) {
  if (c.phase !== 'prep') return null;
  const K = CONFIG.concert, H = CONFIG.hallEffect;
  const info = successInfo(c);
  const success = Math.random() < info.prob;
  const pol = info.policy, hall = info.hall, r = info.readiness;
  const ov = effectiveOverall(c);
  const song = r.song, m = c.perf.mastery;
  const S = p => sectionScoreFor(c, song, p);
  const spread = K.evalSpread * pol.spread * (info.rehearsal ? 0.7 : 1);
  const acoustic = (hall.acoustics - H.acousticsBase) * H.acousticsEval;
  const raw = {
    tech: 0.4 * S('tech') + 0.3 * S('pitch') + 0.3 * S('rhythm'),
    expr: 0.5 * S('expr') + 0.3 * S('tone') + 0.2 * m.underst,
    ens: 0.5 * ov.ensemble + 0.3 * ov.unity + 0.2 * S('unity'),
    bal: 0.5 * ov.balance + 0.5 * S('dyn'),
    comp: 0.5 * m.comp + 0.5 * m.underst,
  };
  const ce = conductorEffect(c.policy);
  const solo = principalSoloBonus(song);
  const cats = {};
  for (const cat of EVAL_CATS) {
    let v = 50 + (raw[cat.id] + r.long + r.strength - r.required) * K.evalSlope + (song.difficulty - 50) * K.difficultyEvalBonus;
    v += success ? K.successEvalBonus : -K.failEvalPenalty;
    v += (ce[cat.id] || 0) + ce.evalBonus;           // 指揮者の能力・得意な方針
    if (cat.id === 'expr') v += solo;                // 首席奏者のソロ
    let pe = pol.eval[cat.id];
    if (pe === 'dyn') pe = ov.balance >= 50 ? 7 : -5;
    v += pe || 0;
    v += (cat.id === 'expr' || cat.id === 'bal') ? acoustic : acoustic / 2;      // ホールの音響
    if (cat.id === 'bal') v -= info.overflow * H.overflowEval;                   // 舞台からのはみ出し
    if (info.rehearsal && (cat.id === 'bal' || cat.id === 'ens')) v += K.hallEvalBonus;
    if (cat.id === 'bal' || cat.id === 'ens') v -= r.short.penalty * K.shortage.evalPenalty;
    else v -= r.short.penalty * K.shortage.evalPenalty * 0.4;
    v += rnd(-spread, spread);
    cats[cat.id] = Math.round(clamp(v, 0, 100));
  }
  const total = Math.round(EVAL_CATS.reduce((s, cat) => s + cats[cat.id] * cat.w, 0));
  const rank = concertRankOf(total);
  const settle = settlementFor(c, total, rank);
  earn(c, `チケット収入（${settle.audience}名）`, settle.ticket);
  if (settle.perf) earn(c, settle.perf > 0 ? '出来高（物販・寄付の増加）' : '出来高（評価不振による減収）', settle.perf);
  if (settle.sponsor) earn(c, '協賛金', settle.sponsor);
  earn(c, `運営費（団員${STATE.members.length}名）`, -settle.operating);
  const cd = activeConductor();
  if (settle.conductorFee) earn(c, `指揮者出演料（${cd.name}）`, -settle.conductorFee);
  const conductorGrowth = conductorGrowthAfterConcert(cd);
  const repBefore = STATE.reputation;
  STATE.reputation = clamp(Math.round((STATE.reputation + CONFIG.economy.reputation[rank] * hall.prestige) * 10) / 10, 0, 100);
  songParam(song.id).performed++;
  c.result = {
    prob: info.prob, success, cats, total, rank, policy: c.policy, rehearsal: info.rehearsal,
    hallId: hall.id, settlement: settle, repBefore, repAfter: STATE.reputation,
    conductorId: cd ? cd.id : null, conductorName: cd ? cd.name : '', conductorGrowth,
    reviews: buildReviews(c, success, cats, ov, info),
    at: Date.now(),
  };
  c.phase = 'result';
  save();
  return c.result;
}

/* ---------- 講評（数値に基づく） ---------- */
function buildReviews(c, success, cats, ov, info) {
  const lines = [];
  const song = findSong(c.songId), hall = info.hall, r = info.readiness;
  if (success) lines.push({ k: '総評', t: `『${song.title}』を大きな事故なく演奏し切った。${cats.tech >= cats.expr ? '堅実な技術' : '豊かな表現'}が印象に残る演奏会となった。` });
  else lines.push({ k: '総評', t: `『${song.title}』の途中で${r.short.items.length ? '編成の薄さが露呈し' : info.pressure ? '会場の重圧に飲まれ' : '準備不足が表面化し'}、演奏が崩れる場面があった。` });

  const lack = Object.fromEntries(r.short.items.map(it => [it.inst, it.lack]));
  for (const s of SECTIONS) {
    if (!songSections(song).includes(s.id)) continue;
    const p = c.perf.sections[s.id];
    const n = membersOfSection(s.id).length;
    if (!n) { lines.push({ k: s.name, t: `${s.name}セクションの奏者が不在で、曲の骨格が欠けてしまった。` }); continue; }
    const sorted = SECTION_PARAMS.slice().sort((a, b) => p[b.id] - p[a.id]);
    const best = sorted[0], worstP = sorted[sorted.length - 1];
    const avg = mean(SECTION_PARAMS.map(x => p[x.id]));
    let t = '';
    if (avg >= 55) t += `${s.name}セクションは全体に完成度が高く、特に${best.name}が光った。`;
    else if (avg >= 38) t += `${s.name}セクションの${best.name}は${p[best.id] >= 50 ? '高く、安定していた' : 'まずまずだった'}。`;
    else t += `${s.name}セクションは練習量が足りず、${best.name}を含め全体に粗さが残った。`;
    if (p[worstP.id] < avg - 8 || p[worstP.id] < 30) t += `一方、${worstP.name}には課題が残る。`;
    const ls = s.insts.filter(i => lack[i]).map(i => `${INST[i].abbr}が${lack[i]}名`);
    if (ls.length) t += `${ls.join('、')}不足しており、${s.id === 'br' ? '終盤の盛り上がりで厚みを欠いた' : s.id === 'ww' ? 'ソロや和声の受け渡しが不安定になった' : s.id === 'pc' ? 'リズムの土台が揺らいだ' : '響きの量感が不足した'}。`;
    lines.push({ k: s.name, t });
  }
  const parts = [];
  parts.push(ov.ensemble >= 50 ? 'アンサンブルは緻密で、縦の線がよく揃っていた' : ov.ensemble >= 30 ? 'アンサンブルはおおむね揃っていた' : '合奏の時間が足りず、縦の線がずれる場面が目立った');
  parts.push(ov.balance >= 50 ? '各セクションの音量バランスも良好' : ov.balance >= 30 ? '音量バランスはやや不揃い' : 'セクション間の音量差が大きく、響きがまとまらなかった');
  lines.push({ k: '全体', t: parts.join('。') + '。' });
  // 会場
  let ht = hall.acoustics >= 80 ? `${hall.name}の豊かな響きが演奏を後押しした。` : hall.acoustics >= 60 ? `${hall.name}の素直な響きの中で、楽団の実力がそのまま表れた。` : `${hall.name}は響きが乾いており、音色の美しさが伝わりにくかった。`;
  if (info.overflow) ht += `舞台に${info.overflow}名分の余裕がなく、音が飽和する場面があった。`;
  if (info.pressure && !info.rehearsal) ht += '初めての大舞台に、団員の表情は硬かった。';
  if (info.rehearsal) ht += '事前のホール練習で響きを掴んでいたため、音量感が安定していた。';
  lines.push({ k: '会場', t: ht });
  return lines;
}

function proceedToNextConcert() {
  const c = activeConcert();
  if (c.phase !== 'result') return;
  c.phase = 'done';
  createConcert();
  generateRecruitCandidates();   // 新しい演奏会の始まりに候補者が無料で入れ替わる
  generateConductorCandidates();
  save();
}

/* ---------- 保存・読み込み ---------- */
function save() {
  try { localStorage.setItem(CONFIG.SAVE_KEY, JSON.stringify(STATE)); } catch (e) { /* ストレージ不可 */ }
}
function migrate(s) {
  if (!s || typeof s !== 'object' || !s.concertPrograms) return null;
  // v1（3曲構成・練習で成長）は構造が大きく異なるため引き継がない
  if ((s.version || 1) < 2) return null;
  if (!s.songParams) s.songParams = {};
  // v2 → v3：募集を演奏会から切り離す
  if (s.version < 3) {
    const order = (s.concertOrder || []).map(id => s.concertPrograms[id]).filter(Boolean);
    const cur = s.concertPrograms[s.activeConcertId];
    s.recruit = emptyRecruit();
    if (cur && cur.recruit) s.recruit = { candidates: cur.recruit.candidates || [], hired: cur.recruit.hired || [], rerolls: cur.recruit.rerolls || 0 };
    for (const c of order) {
      delete c.recruit;
      if (c.phase === 'recruit') c.phase = 'selection';   // 募集工程にいた演奏会は選曲から再開
    }
    s.ledger = s.ledger || [];
    s.version = 3;
    s._needCandidates = !s.recruit.candidates.length;
  }
  if (!s.recruit) s.recruit = emptyRecruit();
  // v3 → v4：Timp を Perc に統一／外見・首席・指揮者を追加
  if (s.version < 4) {
    for (const m of [...(s.members || []), ...((s.recruit && s.recruit.candidates) || [])]) if (m.inst === 'Timp') m.inst = 'Perc';
    s.version = 4;
    s._needV4 = true;
  }
  // v4 → v5：会場選択・選曲の段階を「演奏会の準備（setup）」に統合。決定済みの内容は引き継ぐ
  if (s.version < 5) {
    for (const c of Object.values(s.concertPrograms)) {
      if (c.phase === 'hall' || c.phase === 'selection') { c.phase = 'setup'; c.started = !!(c.hallId || c.songId); }
      if (!('conductorId' in c)) c.conductorId = c.phase === 'done' || c.phase === 'result' ? (c.result && c.result.conductorId) || null : s.conductorId || null;
    }
    s.version = 5;
  }
  if (!s.ledger) s.ledger = [];
  if (s.reputation == null) s.reputation = CONFIG.initialReputation;
  return s;
}
let LOAD_NOTE = '';
function load() {
  try {
    const raw = localStorage.getItem(CONFIG.SAVE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    const s = migrate(parsed);
    if (!s || !s.concertPrograms[s.activeConcertId]) {
      if (parsed && (parsed.version || 1) < 2) LOAD_NOTE = 'ゲームの仕組みが新しくなったため、以前のセーブデータは引き継げません。新しく楽団を始めてください。';
      return false;
    }
    STATE = s;
    if (STATE._needCandidates) { delete STATE._needCandidates; generateRecruitCandidates(); }
    if (STATE._needV4 || !STATE.conductors || !STATE.conductors.length) {
      delete STATE._needV4;
      STATE.conductors = [makeConductor(ORIGINAL_CONDUCTORS.find(o => o.founder))];
      STATE.conductorId = STATE.conductors[0].id;
    }
    if (!STATE.conductorMarket) generateConductorCandidates();
    if (!activeConductor()) STATE.conductorId = STATE.conductors[0].id;
    ensureLooks();
    ensurePrincipals();
    save();
    return true;
  } catch (e) { return false; }
}
function resetSave() { try { localStorage.removeItem(CONFIG.SAVE_KEY); } catch (e) {} }

if (typeof module !== 'undefined') module.exports = {};
