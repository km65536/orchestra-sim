/* =========================================================
 * 練習（通常練習・ホール練習の成果の計算）
 * ========================================================= */
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
  const log = { no: 'H', menu: 'hall', plan: { menu: 'hall' }, sections: {}, overall: {}, mastery: {}, songParams: [] };
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
