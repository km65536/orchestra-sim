/* =========================================================
 * 保存・読み込み（セーブデータの版の移行を含む）
 * ========================================================= */
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
    ensureQuizState();
    save();
    return true;
  } catch (e) { return false; }
}
function resetSave() { try { localStorage.removeItem(CONFIG.SAVE_KEY); } catch (e) {} }

if (typeof module !== 'undefined') module.exports = {};

/* ---------- 練習クイズの記録 ----------
 * クイズの回答は、その演奏会の既存の「楽曲理解度」（c.perf.mastery.underst）を上げる（新しい数値は作らない）。
 * STATE.quiz = { count: 通常練習の回数（出題タイミング用）, streak: 連続正解数, best: 最高連続正解数,
 *               songs: { 曲ID: { asked: [出題済みの問題ID], answered, correct } },
 *               pending: 出題中の問題（回答前に再起動しても続きから出す）, history: 直近の回答 }
 * 古いセーブデータには無いので、読み込み時に安全な初期値で補う（セーブの版は変えない） */
function ensureQuizState() {
  const q = STATE.quiz = (STATE.quiz && typeof STATE.quiz === 'object') ? STATE.quiz : {};
  const num = (v, d = 0) => Number.isFinite(v) ? v : d;
  q.count = Math.max(0, Math.floor(num(q.count))); q.streak = Math.max(0, num(q.streak)); q.best = Math.max(q.streak, num(q.best));
  q.songs = (q.songs && typeof q.songs === 'object') ? q.songs : {};
  for (const [id, s] of Object.entries(q.songs)) {
    if (!s || typeof s !== 'object') { delete q.songs[id]; continue; }
    delete s.und;   // 以前の版で使っていた独自の理解度（今は既存の楽曲理解度に一本化）
    s.asked = Array.isArray(s.asked) ? s.asked : []; s.answered = num(s.answered); s.correct = num(s.correct);
  }
  q.pending = (q.pending && typeof q.pending === 'object' && q.pending.qid && Array.isArray(q.pending.order)) ? q.pending : null;
  q.history = Array.isArray(q.history) ? q.history.slice(-50) : [];
  return q;
}

// 管打楽器の首席によるソロの出来（音楽表現の評価へ）
function principalSoloBonus(song) {
  const req = songRequirements(song);
  const ps = Object.keys(req).filter(i => INST[i].kind !== 'string').map(principalOf).filter(Boolean);
  if (!ps.length) return 0;
  return (mean(ps.map(m => (m.abilities.tone + m.abilities.expr) / 2)) - 55) * CONFIG.principal.soloWeight;
}
