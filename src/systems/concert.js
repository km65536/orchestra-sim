/* =========================================================
 * 演奏会（成功確率・集客・収支・本番の評価・講評）
 * ========================================================= */
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
