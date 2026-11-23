/* =========================================================
 * 練習の進行（演奏会タブの3Dステージで練習の様子を見せる）
 *   1. 既存の「練習開始」ボタン → 既存の runPractice() で成果を確定（これまでと同じ計算）
 *   2. 10〜15秒、既存の3Dステージで指揮者・団員が練習する（練習対象に応じて中心のセクションが変わる）
 *   3. 途中で一定確率でランダムイベント（選択肢があるものは手を止めて選ぶ）
 *   4. 終了後、既存の「練習の成果」画面（練習報告）を表示。イベントの結果も報告に載せる
 * テスト用：UI.practiceTest = { scale: 0.05（時間の倍率）, event: 'force'|'off', eventId }
 * ========================================================= */
const MENU_NAME = { tutti: '全体合奏', section: 'セクション練習', individual: '個人練習', hall: 'ホール練習' };
const practiceTitle = log => log.no === 'H' ? MENU_NAME.hall : `第${log.no}回 ${MENU_NAME[log.menu]}`;
const SEC_GROUPS = [
  { id: 'str', name: '弦楽器', secs: ['hs', 'ls'], cam: 'front' },
  { id: 'ww', name: '木管楽器', secs: ['ww'], cam: 'ww' },
  { id: 'br', name: '金管楽器', secs: ['br'], cam: 'br' },
  { id: 'pc', name: '打楽器', secs: ['pc'], cam: 'pc' },
];
let PR_TIMER = null;
const prOpts = () => UI.practiceTest || {};

// 練習時間（秒）：全体合奏・ホール練習 約12〜13秒、セクション練習 約13〜14秒、個人練習 約11〜12秒
function practiceSeconds(menu) {
  const base = { tutti: 12, section: 13, individual: 11, hall: 12 }[menu] || 12;
  return base + pevRand() * 1.2;
}
// 練習中の見せ方（どのセクションを中心に演奏させ、どのカメラで見せるか）の時間割
function practiceSchedule(log) {
  const plan = log.plan;
  if (plan.menu === 'section') {
    const gs = SEC_GROUPS.filter(g => g.secs.some(s => membersOfSection(s).length));
    return gs.map((g, i) => ({ from: i / gs.length, secs: g.secs, cam: g.cam, label: `${g.name}のセクション練習` }));
  }
  if (plan.menu === 'individual') {
    const ms = (plan.members || []).map(memberById).filter(Boolean);
    const sec = ms.length ? INST[ms[0].inst].section : 'hs';
    return [{ from: 0, secs: null, cam: sec, label: `個人練習：${ms.map(m => m.name).join('、') || '—'}` }];
  }
  if (plan.menu === 'hall') {
    const name = (findHall(activeConcert().hallId) || {}).name || 'ホール';
    return [
      { from: 0, secs: null, cam: 'overview', label: `${name}で通し練習をしています` },
      { from: 0.34, secs: null, cam: 'conductor', label: `${name}で通し練習をしています` },
      { from: 0.67, secs: null, cam: 'front', label: `${name}で通し練習をしています` },
    ];
  }
  return [
    { from: 0, secs: null, cam: 'overview', label: 'オーケストラ全体で合わせています' },
    { from: 0.34, secs: null, cam: 'conductor', label: 'オーケストラ全体で合わせています' },
    { from: 0.67, secs: null, cam: 'front', label: 'オーケストラ全体で合わせています' },
  ];
}
// 練習中のひとこと（指揮者・首席・曲名と連動。文章は data/events/practice.json の commentary）
function practiceLines(c, log) {
  const cd = activeConductor(), cm = principalOf('Vn1'), song = findSong(c.songId);
  const vars = { conductor: cd ? cd.name : '指揮者', song: song.title, aim: cd && PEV_TRAIT[cd.trait] ? PEV_TRAIT[cd.trait].aim : PRACTICE_EVENT_DATA.defaultAim, concertmaster: cm ? cm.name : null, hall: (findHall(c.hallId) || {}).name || 'ホール' };
  const L = (PRACTICE_EVENT_DATA.commentary || {})[log.menu];
  if (!L || !L.length) return ['練習中'];
  return L.map(x => typeof x === 'string' ? pevText(x, vars) : (pevFill(x.text, vars) ?? pevText(x.fallback || '', vars)));
}

const practiceAnimOpts = log => ({ loop: true, fallbackSecs: ((log.plan && log.plan.members) || []).map(memberById).filter(Boolean).map(m => INST[m.inst].section) });
function startPracticeSession(c, log) {
  const o = prOpts();
  const ev = o.event === 'off' || log.menu === 'hall' ? null :   // ホール練習ではランダムイベントは起きない
    pickPracticeEvent(c, log, { force: o.event === 'force', id: o.eventId });
  const dur = practiceSeconds(log.menu) * 1000;
  UI.practicing = {
    cid: c.id, log, dur, elapsed: 0, last: performance.now(), ev, evState: null, evShownAt: 0, result: null,
    sched: practiceSchedule(log), seg: -1, override: null, lines: practiceLines(c, log), line: 0,
  };
  UI.cmd = { cid: c.id, phase: c.phase, stack: [rootScreen(c), { s: 'practicing' }] };
  render();
  if (use3D()) { Stage3D.playPractice(log.plan, practiceQuality(c), practiceAnimOpts(log)); applySegment(true); }
  UI.practicing.animStarted = true;
  clearInterval(PR_TIMER); PR_TIMER = setInterval(practiceTick, 100);
}
function currentSegment(P) {
  const f = P.elapsed / P.dur; let k = 0;
  P.sched.forEach((s, i) => { if (f >= s.from) k = i; });
  return k;
}
function applySegment(force) {
  const P = UI.practicing; if (!P) return;
  const k = currentSegment(P);
  if (!force && k === P.seg && !P.overrideDirty) return false;
  P.seg = k; P.overrideDirty = false;
  const seg = P.sched[k], ov = P.override && P.elapsed < P.override.until ? P.override : null;
  if (use3D()) {
    Stage3D.setPracticeFocus(ov ? [ov.sec] : seg.secs);
    Stage3D.setCamera(ov ? ov.sec : seg.cam);
  }
  return true;
}
function practiceTick() {
  const P = UI.practicing; if (!P) { clearInterval(PR_TIMER); PR_TIMER = null; return; }
  const now = performance.now(), dt = now - P.last; P.last = now;
  const speed = 1 / (prOpts().scale || 1);
  let changed = false;
  const open = P.evState === 'open';
  if (!open) P.elapsed += dt * speed;
  // ランダムイベント
  if (P.ev && !P.evState && P.elapsed >= P.ev.at * P.dur) {
    if (P.ev.choices) { P.evState = 'open'; if (use3D()) Stage3D.pausePractice(true); }
    else { P.result = applyPracticeEvent(activeConcertById(P.cid), P.log, P.ev); P.evState = 'shown'; P.evShownAt = P.elapsed; if (P.ev.sec) setOverride(P, P.ev.sec, 3000); }
    changed = true;
  }
  if (P.evState === 'shown' && P.elapsed - P.evShownAt > 3500) { P.evState = 'done'; changed = true; }
  if (P.override && P.elapsed >= P.override.until) { P.override = null; P.overrideDirty = true; }
  applySegment(false);
  // ひとことを約3秒ごとに入れ替える
  P.line = Math.floor(P.elapsed / 3200) % P.lines.length;
  if (P.elapsed >= P.dur && P.evState !== 'open') { finishPracticeSession(); return; }
  if (UI.tab !== 'concert') return;
  if (changed) { render(); return; }   // イベントの表示・終了など、画面の構成が変わるときだけ描き直す
  const fe = document.getElementById('prFocus'), le = document.getElementById('prLine');
  if (fe) fe.textContent = practiceFocusLabel(P);
  if (le) le.textContent = P.lines[P.line];
  const fill = document.getElementById('prFill'), rem = document.getElementById('prRemain');
  if (fill) fill.style.width = Math.min(100, P.elapsed / P.dur * 100).toFixed(1) + '%';
  if (rem) rem.textContent = `残り ${Math.max(0, Math.ceil((P.dur - P.elapsed) / 1000))}秒`;
}
const activeConcertById = id => STATE.concertPrograms[id] || activeConcert();
function setOverride(P, sec, ms) { P.override = { sec, until: P.elapsed + ms }; P.overrideDirty = true; }
function finishPracticeSession() {
  const P = UI.practicing; if (!P || P.finished) return;   // 終了処理は1回だけ
  P.finished = true;
  clearInterval(PR_TIMER); PR_TIMER = null;
  if (use3D()) { Stage3D.endPractice(); Stage3D.setCamera('front'); }   // 練習が終わったら正面の視点に戻す
  UI.practicing = null;
  const c = activeConcertById(P.cid);
  UI.cmd = { cid: c.id, phase: c.phase, stack: [rootScreen(c), { s: 'log' }] };
  if (UI.tab === 'concert') render();
  if (c.phase === 'prep' && P.log.menu !== 'hall') toast('10回の練習が終了しました');
  if (P.log.menu === 'hall') toast('ホール練習を行いました');
}

function practiceFocusLabel(P) {
  if (!P) return "";
  const seg = P.sched[Math.max(0, currentSegment(P))] || P.sched[0];
  const ov = P.override && P.elapsed < P.override.until ? P.override : null;
  return ov ? `${SEC[ov.sec].name}を中心に練習中` : seg.label;
}
/* ---------- 画面 ---------- */
SCREENS.practicing = {
  get kind() { const P = UI.practicing; return P && P.evState === 'open' ? 'tall' : 'short'; },
  render: c => {
    const P = UI.practicing;
    if (!P) return { crumb: '<b>練習</b>', body: '<div class="cnote">練習は終了しました</div>', foot: '<button class="cbtn pri" data-act="cHome">戻る</button>' };
    const log = P.log;
    const focus = practiceFocusLabel(P);
    const head = { crumb: `${practiceTitle(log)}<b>練習中</b>`, badge: `<span class="cbadge" id="prRemain">残り ${Math.max(0, Math.ceil((P.dur - P.elapsed) / 1000))}秒</span>` };
    const bar = `<div class="prbar"><i id="prFill" style="width:${Math.min(100, P.elapsed / P.dur * 100).toFixed(1)}%"></i></div>`;
    const ev = P.ev;
    if (ev && P.evState === 'open') {
      return { ...head, crumb: `${practiceTitle(log)}<b>${esc(ev.title)}</b>`,
        body: `<div class="prev"><div class="prev-h"><span class="tag gold">${esc(ev.title)}</span><span class="prev-w">${esc(ev.who)}<small>（${esc(ev.whoRole)}）</small></span></div><div class="prev-t">「${esc(ev.text)}」</div></div>
          <div class="prch">${ev.choices.map(ch => `<button class="crow" data-act="prChoice" data-v="${ch.id}"><span class="cr-main"><span class="cr-t">${esc(ch.label)}</span><span class="cr-s">${esc(ch.hint)}</span></span></button>`).join('')}</div>` };
    }
    const banner = ev && (P.evState === 'shown' || (P.evState === 'done' && P.result && P.elapsed - P.evShownAt < 3500))
      ? `<div class="prev mini"><div class="prev-h"><span class="tag gold">${esc(ev.title)}</span><span class="prev-w">${esc(ev.who)}</span></div><div class="prev-t">「${esc(ev.text)}」</div></div>`
      : P.result ? `<div class="prev mini done"><div class="prev-t">${esc(ev.title)}：${esc(P.result.choice.note)}</div></div>` : '';
    return { ...head,
      body: `${bar}<div class="cmsg ell" id="prFocus">${esc(focus)}</div>${banner || `<div class="cnote ell" id="prLine">${esc(P.lines[P.line])}</div>`}`,
      foot: `<button class="cbtn" data-act="prSkip" ${P.finishing ? 'disabled' : ''}>スキップ ▶▶</button>` };
  },
};
// 既存の「練習の成果」画面（練習報告）はそのまま使い、イベントがあった回だけ結果を1行添える
(() => {
  const base = SCREENS.log.render;
  SCREENS.log.render = (c, scr) => {
    const out = base(c, scr);
    const log = c.practices[c.practices.length - 1] || UI.lastLog;
    if (log && log.events && log.events.length) {
      out.body = out.body.replace('class="dgrid mini"', 'class="dgrid mini ev"').replace('class="growl" style="margin-top:6px"', 'class="growl" style="margin-top:2px"') +
        log.events.map(e => `<div class="prlog">⚑ ${esc(e.title)}${e.choice ? `「${esc(e.choice)}」` : ''}：${esc(e.note)}${e.delta ? `（仕上がり ${e.delta > 0 ? '+' : ''}${round1(e.delta)}）` : ''}</div>`).join('');
    }
    return out;
  };
})();

/* ---------- 操作 ---------- */
Object.assign(ACTIONS, {
  /* スキップ：演出（アニメーション）だけを省略する。練習の成果は開始時に確定済みで、
   *   ・選択肢のあるイベントが起きる回 → イベントの選択画面で止まる（選んだあと練習を終える）
   *   ・選択肢のないイベント → 結果を反映してから終える
   *   ・終了後は既存の流れどおり、クイズの回ならクイズ画面、そうでなければ練習報告へ */
  prSkip() {
    const P = UI.practicing; if (!P || P.finished || P.skipped) return;   // 連打しても1回だけ
    P.skipped = true;
    if (P.evState === 'open') { render(); return; }          // すでにイベントの選択中
    if (P.ev && !P.evState) {
      if (P.ev.choices) {
        P.elapsed = Math.max(P.elapsed, P.ev.at * P.dur); P.evState = 'open';
        if (use3D()) Stage3D.pausePractice(true);
        render(); return;
      }
      P.result = applyPracticeEvent(activeConcertById(P.cid), P.log, P.ev); P.evState = 'done';
    }
    finishPracticeSession();
  },
  // 既存の練習開始（計算は従来どおり）＋ 練習の様子の再生
  runPractice(d) {
    if (UI.practicing) return;   // 練習中は次の練習を受け付けない（重複実行の防止）
    UI.draft.menu = d.m;
    const c = activeConcert();
    const r = runPractice(c, JSON.parse(JSON.stringify(buildPlan())));
    if (r.error) { toast(r.error); return; }
    UI.lastLog = r.log;
    if (d.m === 'section') SECTIONS.forEach(s => UI.draft.sections[s.id] = autoSectionFocus(c, s.id));   // 次回用に再提案
    startPracticeSession(c, r.log);
  },
  // ホール練習：成果は従来どおり runHallPractice() で確定し、予約したホールで練習の様子を再生する
  hall() {
    if (UI.practicing) return;
    const c = activeConcert();
    const log = runHallPractice(c);
    if (!log) { render(); return; }
    UI.lastLog = log;
    startPracticeSession(c, log);
  },
  prChoice(d) {
    const P = UI.practicing; if (!P || P.evState !== 'open') return;
    P.result = applyPracticeEvent(activeConcertById(P.cid), P.log, P.ev, d.v);
    P.evState = 'done'; P.evShownAt = P.elapsed;
    if (P.skipped) { finishPracticeSession(); return; }   // スキップ中：イベントの選択が済んだらそのまま練習を終える
    if (use3D()) Stage3D.pausePractice(false);
    const e = P.result.choice.effect || {};
    if (e.focus && P.log.sections[e.focus.sec]) setOverride(P, e.focus.sec, 4000);
    if (e.stop) P.dur = Math.min(P.dur, P.elapsed + 1500);   // 早めに切り上げる
    P.last = performance.now();
    render();
  },
});
// 別のタブから戻ったとき、練習中なら3Dの練習アニメーションを再開する
(() => {
  const base = render;
  render = function (...a) {
    base.apply(this, a);
    const P = UI.practicing;
    if (P && P.animStarted && UI.tab === 'concert' && use3D() && !Stage3D.isPracticing()) {
      Stage3D.playPractice(P.log.plan, practiceQuality(activeConcertById(P.cid)), practiceAnimOpts(P.log));
      if (P.evState === 'open') Stage3D.pausePractice(true);
      P.seg = -1; applySegment(true);
    }
  };
})();
// 新しくゲームを始めた／初期化したときは練習の進行も破棄する
['newgame', 'resetYes'].forEach(k => {
  const orig = ACTIONS[k];
  if (orig) ACTIONS[k] = function (...a) { if (UI.practicing) { clearInterval(PR_TIMER); PR_TIMER = null; if (use3D()) Stage3D.endPractice(); UI.practicing = null; } return orig.apply(this, a); };
});
