/* =========================================================
 * 練習クイズ（ゲームロジック）
 *   ・通常練習（全体合奏・セクション練習・個人練習）の回数を数え、2回ごとに1問を出題待ちにする。
 *     ホール練習（本番準備）は runHallPractice なので数えない。
 *   ・出題は「練習中の曲の問題」→「その曲の作曲家の問題」→「一般の音楽の問題」の優先順。
 *     出題済みの問題は曲ごとに記録し、一通り出題したら記録をリセットして再出題する。
 *   ・回答で、その演奏会の既存の「楽曲理解度」が上がる（正解は大きく、不正解でも少し、連続正解でボーナス）。
 *     楽曲理解度は演奏会（＝その曲）ごとの値なので、ほかの曲には影響しない。演奏会の評価への効き方も既存のまま。
 *   ・既存の練習の計算には手を加えず、runPractice の後に回数を数えるだけ。
 * ========================================================= */
// 問題の索引：ID → 問題
const QUIZ_INDEX = {};
const QUIZ_BY_SONG = {}, QUIZ_BY_COMPOSER = {}, QUIZ_COMPOSER_OF = {};
(() => {
  for (const [sid, qs] of Object.entries(QUIZ_SONG)) QUIZ_BY_SONG[sid] = qs.map(q => (QUIZ_INDEX[q.id] = { ...q, scope: 'song' }).id);
  for (const [cid, d] of Object.entries(QUIZ_COMPOSER)) {
    QUIZ_BY_COMPOSER[cid] = d.qs.map(q => (QUIZ_INDEX[q.id] = { ...q, scope: 'composer' }).id);
    d.songs.forEach(s => QUIZ_COMPOSER_OF[s] = cid);
  }
  QUIZ_GENERAL.forEach(q => QUIZ_INDEX[q.id] = { ...q, scope: 'general' });
})();
const QUIZ_GENERAL_IDS = QUIZ_GENERAL.map(q => q.id);
// 出題の抽選は既存の計算に使う Math.random とは別の乱数で行う
let QZ_SEED = (Date.now() ^ 0x51ed27a3) >>> 0;
function qzRand() {
  QZ_SEED = (QZ_SEED + 0x6D2B79F5) >>> 0;
  let t = QZ_SEED; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function quizSong(songId) {
  const q = ensureQuizState();
  return q.songs[songId] = q.songs[songId] || { asked: [], answered: 0, correct: 0 };
}
// 曲に関係する問題の候補（優先順の3段階）
const quizTiers = songId => [QUIZ_BY_SONG[songId] || [], QUIZ_BY_COMPOSER[QUIZ_COMPOSER_OF[songId]] || [], QUIZ_GENERAL_IDS];
function pickQuizQuestion(songId) {
  const s = quizSong(songId), tiers = quizTiers(songId);
  let pool = null;
  for (const t of tiers) { const left = t.filter(id => !s.asked.includes(id)); if (left.length) { pool = left; break; } }
  if (!pool) {
    // 一通り出題した：記録をリセット（直前に出した数問はしばらく避ける）
    const recent = s.asked.slice(-3);
    s.asked = [];
    for (const t of tiers) { const left = t.filter(id => !recent.includes(id)); if (left.length) { pool = left; break; } }
    pool = pool || tiers.flat();
  }
  return pool[Math.floor(qzRand() * pool.length)];
}
// 通常練習が1回終わるたびに呼ぶ。出題回なら出題待ちの問題を作る
function quizAfterPractice(c, log) {
  const q = ensureQuizState();
  q.count++;
  if (q.count % CONFIG.quiz.every === 0 && c.songId) {
    const qid = pickQuizQuestion(c.songId);
    const order = [0, 1, 2, 3];
    for (let i = 3; i > 0; i--) { const j = Math.floor(qzRand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    q.pending = { qid, songId: c.songId, concertId: c.id, practiceNo: log.no, count: q.count, order };
  }
  save();
  return q.pending;
}
// 出題中の問題がデータから削除されていた場合（JSONの編集後など）は、出題をなかったことにする
const quizPending = () => { const q = ensureQuizState(); if (q.pending && !QUIZ_INDEX[q.pending.qid]) { q.pending = null; save(); } return q.pending; };
// 練習ログの一言（練習履歴）を作り直す：既存の要約＋イベント＋クイズ
function quizRebuildSummary(log) {
  let sum = summarizeLog(log);
  for (const e of log.events || []) sum += `／${e.title}：${e.note}`;
  if (log.quiz) sum += `／クイズ${log.quiz.correct ? '正解' : '不正解'}`;
  log.summary = sum;
}
// 回答（choice は画面上の並び順の番号 0〜3）。その演奏会の既存の楽曲理解度に、既存の上昇処理（addMastery）で加える
function answerQuiz(choice) {
  const q = ensureQuizState(), p = quizPending(); if (!p) return null;
  const item = QUIZ_INDEX[p.qid], K = CONFIG.quiz, s = quizSong(p.songId);
  const picked = p.order[choice], correct = picked === 0;
  let base, bonus = 0;
  if (correct) { q.streak++; bonus = Math.min(K.streakBonusMax, (q.streak - 1) * K.streakBonus); base = K.gainCorrect; q.best = Math.max(q.best, q.streak); s.correct++; }
  else { q.streak = 0; base = K.gainWrong; }
  s.answered++;
  if (!s.asked.includes(p.qid)) s.asked.push(p.qid);
  // 出題した演奏会（まだ本番前）の楽曲理解度と、その回の練習ログに反映する
  const c = STATE.concertPrograms[p.concertId];
  let before = null, after = null, gain = 0;
  if (c && !c.result && c.songId === p.songId) {
    const log = c.practices.find(l => l.no === p.practiceNo) || { mastery: {} };
    before = c.perf.mastery.underst;
    addMastery(c, log, 'underst', base + bonus);
    after = c.perf.mastery.underst; gain = after - before;
    log.quiz = { qid: p.qid, correct, gain };
    if (log.sections) quizRebuildSummary(log);
  }
  const res = { qid: p.qid, songId: p.songId, correct, picked: item.c[picked], answer: item.c[0], gain, bonus: correct && gain ? gain * bonus / (base + bonus) : 0, before, after, streak: q.streak, practiceNo: p.practiceNo, concertId: p.concertId };
  q.history.push({ qid: p.qid, songId: p.songId, correct, gain: Math.round(gain * 10) / 10, concertId: p.concertId, practiceNo: p.practiceNo });
  q.history = q.history.slice(-50);
  q.pending = null;
  save();
  return res;
}

// 既存の通常練習（runPractice）の後に回数を数える。計算・結果は一切変えない
(() => {
  const base = runPractice;
  runPractice = function (c, plan) {
    const r = base(c, plan);
    if (r && !r.error) quizAfterPractice(c, r.log);
    return r;
  };
})();
