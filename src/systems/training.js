/* =========================================================
 * 育成（資金で団員・指揮者の能力を伸ばす）
 * ========================================================= */
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
