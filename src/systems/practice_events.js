/* =========================================================
 * 練習中のランダムイベント（ゲームロジック・画面とは独立）
 *   ・練習の成果そのものは既存の runPractice() がこれまでどおり計算する。
 *   ・イベントは「その回の練習で得た成果」に小さな補正をかけるだけ（選択肢による追加効果）。
 *   ・イベントの抽選には Math.random とは別の乱数を使い、既存の計算の乱数の並びを変えない。
 *   ・結果は練習ログ（log.events）に記録し、既存の練習報告・練習履歴に反映する。
 *   ・イベントの文章・選択肢・効果・発生しやすさは data/events/practice.json で編集する。
 *     ここには「誰が話すか」「どのセクションが対象になるか」などの選び方（プログラム）だけを置く。
 * ========================================================= */
const PRACTICE_EVENT_CFG = {
  chance: PRACTICE_EVENT_DATA.settings.chance,          // 1回の練習でイベントが起きる確率（起きるのは最大1件）
  minAt: PRACTICE_EVENT_DATA.settings.timingFrom, maxAt: PRACTICE_EVENT_DATA.settings.timingTo,   // イベントが起きるタイミングの範囲
};
// 別系統の乱数（mulberry32）
let PEV_SEED = (Date.now() ^ 0x9e3779b9) >>> 0;
function pevRand() {
  PEV_SEED = (PEV_SEED + 0x6D2B79F5) >>> 0;
  let t = PEV_SEED;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pevPick = arr => arr[Math.floor(pevRand() * arr.length)];
function pevWeighted(list) {
  const tot = list.reduce((s, x) => s + x.w, 0); if (tot <= 0) return null;
  let r = pevRand() * tot;
  for (const x of list) { if ((r -= x.w) < 0) return x; }
  return list[list.length - 1];
}
const secName = sec => SEC[sec].name;
const pevGain = (log, sec) => Object.values(log.sections[sec] || {}).reduce((a, b) => a + b, 0);
// その回の練習で成果が出たセクション（＝練習対象）
const pevSecs = log => SECTIONS.map(s => s.id).filter(s => pevGain(log, s) > 0);
const secPrincipal = sec => SEC[sec].insts.map(principalOf).find(Boolean) || null;
const secAvg = (c, sec, key) => mean(SECTION_PARAMS.map(p => c.perf.sections[sec][p.id]));

// 指揮者の個性ごとの口ぐせ（指揮者からの提案・練習中のひとこと）
const PEV_TRAIT = PRACTICE_EVENT_DATA.conductorTraitPhrases;
const pevTrait = cd => (cd && PEV_TRAIT[cd.trait]) || PEV_TRAIT[PRACTICE_EVENT_DATA.defaultTraitPhrase] || { focus: '', aim: PRACTICE_EVENT_DATA.defaultAim };
// 文章の {名前} を置き換える。値のない記号があれば null を返す（代わりの文章を使うため）
function pevFill(t, vars) {
  let missing = false;
  const out = String(t).replace(/\{(\w+)\}/g, (_, k) => { const v = vars[k]; if (v == null) { missing = true; return ''; } return v; });
  return missing ? null : out;
}
const pevText = (t, vars) => pevFill(t, vars) ?? String(t).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

/* 発生条件（requires）：イベントが起きるために必要な状況 */
const PEV_REQUIRES = {
  conductor: (c, log, ctx) => !!ctx.cd,
  practicedSection: (c, log, ctx) => ctx.secs.length > 0,
  principalSection: (c, log, ctx) => ctx.secs.some(secPrincipal),
  members: (c, log, ctx) => ctx.members.length > 0,
  individual: (c, log) => log.menu === 'individual',
  notIndividual: (c, log) => log.menu !== 'individual',
};
/* 対象の選び方（target）：どのセクション・団員についてのイベントか */
const PEV_TARGETS = {
  none: () => ({}),
  // いちばん仕上がりが遅れているセクション
  weakestSection: (c, log, ctx) => ({ sec: ctx.secs.slice().sort((a, b) => secAvg(c, a) - secAvg(c, b))[0] }),
  // 首席奏者がいる練習中のセクション（話すのはその首席）
  principalSection: (c, log, ctx) => { const sec = pevPick(ctx.secs.filter(secPrincipal)); return { sec, principal: secPrincipal(sec) }; },
  // 技術に不安のある団員ほど相談しにくる
  strugglingMember: (c, log, ctx) => { const m = ctx.members.slice().sort((a, b) => a.abilities.tech - b.abilities.tech)[Math.floor(pevRand() * Math.min(3, ctx.members.length))]; return { sec: INST[m.inst].section, member: m }; },
  // 協調性の高いセクションほど好調になりやすい
  harmoniousSection: (c, log, ctx) => { const sec = ctx.secs.slice().sort((a, b) => mean(membersOfSection(b).map(m => m.abilities.coop)) - mean(membersOfSection(a).map(m => m.abilities.coop)))[Math.floor(pevRand() * Math.min(2, ctx.secs.length))]; return { sec, principal: secPrincipal(sec) }; },
  randomMember: (c, log, ctx) => { const m = pevPick(ctx.members); return { sec: INST[m.inst].section, member: m }; },
};
/* 話す人（speaker） */
const PEV_SPEAKERS = {
  conductor: (ctx) => ({ who: ctx.cd ? ctx.cd.name : '指揮者', whoRole: '指揮者' }),
  principal: (ctx, t) => ({ who: t.principal.name, whoRole: `${INST[t.principal.inst].abbr} 首席` }),
  member: (ctx, t) => ({ who: t.member.name, whoRole: INST[t.member.inst].abbr }),
};
// 選択肢の効果をプログラム用の形に（focus はそのイベントの対象セクションに対する倍率）
function pevEffect(e, sec) {
  const out = {};
  if (e.focus != null && sec) out.focus = { sec, mult: e.focus };
  for (const k of ['others', 'all', 'overall', 'mastery', 'stop']) if (e[k] != null) out[k] = e[k];
  return out;
}
const PRACTICE_EVENTS = PRACTICE_EVENT_DATA.events.map(E => ({
  id: E.id, title: E.title, role: E.speaker,
  weight: (c, log, ctx) => {
    if (!(E.requires || []).every(r => PEV_REQUIRES[r] && PEV_REQUIRES[r](c, log, ctx))) return 0;
    const cc = E.conductorCondition;
    if (cc && !(ctx.cd && (ctx.cd.abilities.interp >= (cc.minInterp ?? 101) || (cc.orTraits || []).includes(ctx.cd.trait)))) return 0;
    const w = E.weight || {};
    return (w.base || 0) + (w.perDifficulty || 0) * ctx.song.difficulty + (w.perPracticeDone || 0) * c.practiceDone;
  },
  build: (c, log, ctx) => {
    const t = (PEV_TARGETS[E.target] || PEV_TARGETS.none)(c, log, ctx);
    const sp = (PEV_SPEAKERS[E.speaker] || PEV_SPEAKERS.conductor)(ctx, t);
    const tr = pevTrait(ctx.cd);
    const vars = {
      section: t.sec ? secName(t.sec) : null, partnerSection: t.sec && E.partner && E.partner[t.sec] ? secName(E.partner[t.sec]) : null,
      song: ctx.song.title, conductor: ctx.cd ? ctx.cd.name : '指揮者', member: t.member ? t.member.name : null,
      principal: t.principal ? t.principal.name : null, traitFocus: tr.focus, aim: tr.aim,
      place: E.places ? pevPick(E.places) : null,
    };
    vars.principalNote = E.principalNote && t.principal ? pevText(E.principalNote, vars) : '';
    const choice = ch => {
      const base = ch.preset ? PRACTICE_EVENT_DATA.choicePresets[ch.preset] : {};
      const m = { ...base, ...ch }; delete m.preset;
      return { id: m.id, label: pevText(m.label, vars), hint: pevText(m.hint, vars), effect: pevEffect(m.effect || {}, t.sec), note: pevText(m.note, vars) };
    };
    const out = { sec: t.sec || null, ...sp, text: pevText(E.text, vars) };
    if (E.choices) out.choices = E.choices.map(choice);
    else out.auto = { effect: pevEffect((E.auto || {}).effect || {}, t.sec), note: pevText((E.auto || {}).note || '', vars) };
    return out;
  },
}));

// 練習のログからイベントを1件選ぶ（起きない場合は null）。force=true で必ず起こす（テスト用）
function pickPracticeEvent(c, log, opts = {}) {
  if (!opts.force && pevRand() >= PRACTICE_EVENT_CFG.chance) return null;
  const ctx = {
    cd: activeConductor(), song: findSong(c.songId), secs: pevSecs(log),
    members: log.menu === 'individual' ? (log.plan.members || []).map(memberById).filter(Boolean) : STATE.members.filter(m => pevSecs(log).includes(INST[m.inst].section)),
  };
  const list = PRACTICE_EVENTS.filter(e => !opts.id || e.id === opts.id).map(e => ({ e, w: e.weight(c, log, ctx) })).filter(x => x.w > 0);
  const hit = pevWeighted(list); if (!hit) return null;
  const ev = hit.e.build(c, log, ctx);
  return { id: hit.e.id, title: hit.e.title, role: hit.e.role, at: PRACTICE_EVENT_CFG.minAt + pevRand() * (PRACTICE_EVENT_CFG.maxAt - PRACTICE_EVENT_CFG.minAt), ...ev };
}

// 選んだ結果を、その回の成果に反映する（既存の上昇処理 addSec / addOverall / addMastery を使う）
function scaleLogSection(c, log, sec, mult) {
  if (!log.sections[sec] || mult === 1) return;
  for (const [p, v] of Object.entries(log.sections[sec])) {
    if (v <= 0) continue;
    const d = v * (mult - 1);
    if (d > 0) addSec(c, log, sec, p, d);
    else { const before = c.perf.sections[sec][p]; c.perf.sections[sec][p] = Math.max(0, before + d); log.sections[sec][p] += c.perf.sections[sec][p] - before; }
  }
}
function scaleLogMap(c, log, key, target, mult) {
  if (mult === 1) return;
  for (const [k, v] of Object.entries(log[key])) {
    if (v <= 0) continue;
    const d = v * (mult - 1);
    if (d > 0) (key === 'overall' ? addOverall : addMastery)(c, log, k, d);
    else { const before = target[k]; target[k] = Math.max(0, before + d); log[key][k] += target[k] - before; }
  }
}
function applyPracticeEvent(c, log, ev, choiceId) {
  const ch = ev.choices ? ev.choices.find(x => x.id === choiceId) || ev.choices.find(x => x.id === 'keep') || ev.choices[0] : ev.auto;
  const e = ch.effect || {};
  const totalBefore = logTotal(log);
  const focusSec = e.focus && log.sections[e.focus.sec] ? e.focus.sec : null;
  for (const s of SECTIONS) {
    let mult = e.all || 1;
    if (focusSec) mult *= s.id === focusSec ? e.focus.mult : (e.others || 1);
    scaleLogSection(c, log, s.id, mult);
  }
  if (e.all) { scaleLogMap(c, log, 'overall', c.perf.overall, e.all); scaleLogMap(c, log, 'mastery', c.perf.mastery, e.all); }
  for (const [k, v] of Object.entries(e.overall || {})) addOverall(c, log, k, v);
  for (const [k, v] of Object.entries(e.mastery || {})) addMastery(c, log, k, v);
  const delta = logTotal(log) - totalBefore;
  log.events = log.events || [];
  log.events.push({ id: ev.id, title: ev.title, who: ev.who, whoRole: ev.whoRole, text: ev.text, choice: ev.choices ? ch.label : null, note: ch.note, delta: Math.round(delta * 10) / 10 });
  log.summary = summarizeLog(log) + `／${ev.title}：${ch.note}`;
  save();
  return { choice: ch, delta };
}
function logTotal(log) {
  let t = 0;
  Object.values(log.sections).forEach(o => Object.values(o).forEach(v => t += v));
  Object.values(log.overall).forEach(v => t += v);
  Object.values(log.mastery).forEach(v => t += v);
  return t;
}
