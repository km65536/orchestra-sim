/* =========================================================
 * 団員（能力・外見・首席奏者・セクション基礎能力・募集・採用・除籍）
 * ========================================================= */
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
// 首席はプレイヤーが任命する。ここでは「首席が不在」の楽器だけを補う（任命済みの首席は能力に関係なく維持する）。
//   ・団員の採用で、その楽器に初めて団員が入ったとき
//   ・首席が退団したとき（後任の自動任命）
//   ・セーブデータ読み込み時に、首席が存在しない／別の楽器の団員になっている不整合を直すとき
function ensurePrincipals() {
  STATE.principals = STATE.principals || {};
  for (const k of Object.keys(STATE.principals)) if (!INST[k]) delete STATE.principals[k];
  for (const ins of INSTRUMENTS) {
    const cur = STATE.members.find(m => m.id === STATE.principals[ins.id] && m.inst === ins.id);
    if (cur) continue;
    const best = STATE.members.filter(m => m.inst === ins.id).sort((a, b) => memberAvg(b) - memberAvg(a))[0];
    if (best) STATE.principals[ins.id] = best.id; else delete STATE.principals[ins.id];
  }
}
// 同じ楽器の団員なら能力に関係なく誰でも任命できる。首席は楽器ごとに1名（前の首席は自動的に通常団員に戻る）
function setPrincipal(memberId, inst) {
  const m = STATE.members.find(x => x.id === memberId); if (!m) return false;
  if (inst && m.inst !== inst) return false;   // 他の楽器の団員は任命できない
  STATE.principals = STATE.principals || {};
  STATE.principals[m.inst] = m.id; save(); return true;
}
// 除籍できない理由（首席奏者は、同じ楽器の別の団員を首席にしてからでないと除籍できない）
function dismissBlockReason(m) {
  if (!m) return '対象の団員がいません';
  if (isPrincipal(m) && STATE.members.some(x => x.inst === m.inst && x.id !== m.id))
    return '首席奏者はそのまま除籍できません。先に別の団員を首席に任命してください。';
  return null;
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
// opts.force：契約終了など、プレイヤーの除籍操作以外で退団する場合（首席でも退団し、後任を自動任命する）
function dismissMember(memberId, opts = {}) {
  if (!opts.force && dismissBlockReason(STATE.members.find(m => m.id === memberId))) return false;
  const before = STATE.members.length;
  STATE.members = STATE.members.filter(m => m.id !== memberId);
  if (STATE.members.length === before) return false;
  ensurePrincipals();   // 首席が退団した場合は、同じ楽器の最も能力の高い団員が後任になる
  save(); return true;
}
