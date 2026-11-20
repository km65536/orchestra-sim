/* =========================================================
 * 指揮者（採用・変更・育成・成長）
 * ========================================================= */
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
