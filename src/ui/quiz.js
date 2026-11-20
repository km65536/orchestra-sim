/* =========================================================
 * 練習クイズ（画面）
 *   練習アニメーション → ランダムイベント → 練習終了 → クイズ → 正解・解説 → 既存の練習報告
 *   ・既存の練習の流れ（practice_ui.js）は変えず、練習の終了処理のあとにクイズ画面を重ねる。
 *     回答後「練習の報告へ」で1つ戻ると、既存の「練習の成果」画面がそのまま表示される。
 *   ・回答するまで待つ（時間制限なし）。回答前に再起動しても、演奏会タブを開くと同じ問題が出る。
 * ========================================================= */
// クイズ中は操作パネルを高くして、問題と4つの選択肢が画面内に収まるようにする（ほかの画面は従来どおり）
(() => {
  const base = panelHeight;
  panelHeight = kind => kind === 'quiz' ? Math.round(clamp((window.innerHeight || 780) * 0.6, 400, 520)) : base(kind);
})();
const quizSongTitle = id => (findSong(id) || {}).title || '';
const quizUnd = concertId => { const c = STATE.concertPrograms[concertId]; return c ? c.perf.mastery.underst : null; };
SCREENS.quiz = {
  kind: 'quiz',
  render: c => {
    const res = UI.quizResult, p = quizPending();
    if (res) {
      const item = QUIZ_INDEX[res.qid];
      return {
        crumb: `第${res.practiceNo}回の練習のあと<b>音楽クイズ</b>`, badge: `<span class="cbadge">${QUIZ_CATS[item.k]}</span>`,
        body: `<div class="qz-v ${res.correct ? 'ok' : 'ng'}"><b>${res.correct ? '○ 正解！' : '× 不正解'}</b>${res.correct && res.streak >= 2 ? `<span>${res.streak}問連続正解</span>` : ''}</div>
          <div class="qz-q sm">${esc(item.q)}</div>
          <div class="qz-a ok"><span>正解</span>${esc(res.answer)}</div>
          ${res.correct ? '' : `<div class="qz-a ng"><span>あなたの答え</span>${esc(res.picked)}</div>`}
          <div class="qz-e">${esc(item.e)}</div>
          ${res.before != null ? `<div class="qz-g">楽曲理解度 <b>+${round1(res.gain)}</b>（${round1(res.before)} → ${round1(res.after)}）${res.bonus ? '・連続正解ボーナス込み' : ''}</div>` : ''}`,
        foot: `<button class="cbtn pri big" data-act="quizDone">練習の報告へ</button>`,
      };
    }
    if (!p) return { crumb: '<b>音楽クイズ</b>', body: '<div class="cnote">出題中のクイズはありません</div>', foot: '<button class="cbtn pri big" data-act="quizDone">戻る</button>' };
    const item = QUIZ_INDEX[p.qid], und = quizUnd(p.concertId), st = ensureQuizState().streak;
    return {
      crumb: `第${p.practiceNo}回の練習のあと<b>音楽クイズ</b>`, badge: `<span class="cbadge">${QUIZ_CATS[item.k]}</span>`,
      body: `<div class="qz-song"><span class="ell">『${esc(quizSongTitle(p.songId))}』</span><span>${und != null ? `楽曲理解度 ${Math.round(und)}` : ''}${st ? `・${st}問連続正解中` : ''}</span></div>
        <div class="qz-q">${esc(item.q)}</div>
        <div class="qz-ch">${p.order.map((o, i) => `<button class="qz-c" data-act="quizAnswer" data-v="${i}"><i>${'ABCD'[i]}</i><span>${esc(item.c[o])}</span></button>`).join('')}</div>`,
    };
  },
};

Object.assign(ACTIONS, {
  quizAnswer(d) {
    if (UI.quizResult || !quizPending()) return;   // 二重回答の防止
    UI.quizResult = answerQuiz(Number(d.v));
    render();
  },
  quizDone() {
    UI.quizResult = null;
    if (cmdTop().s === 'quiz') cmdBack();
    render();
  },
});
// 練習の終了処理（既存）のあとに、出題回ならクイズ画面を重ねる
(() => {
  const base = finishPracticeSession;
  finishPracticeSession = function (...a) {
    base.apply(this, a);
    if (quizPending() && cmdTop().s !== 'quiz') { cmdGo({ s: 'quiz' }); if (UI.tab === 'concert') render(); }
  };
})();
// 回答前に再起動した場合など：演奏会タブを開いたとき、出題待ちの問題があればクイズ画面を出す
(() => {
  const base = render;
  render = function (...a) {
    if (UI.tab === 'concert' && STATE && STATE.quiz && STATE.quiz.pending && quizPending() && !UI.practicing && !UI.showing && !UI.quizResult && typeof cmdTop === 'function' && cmdTop().s !== 'quiz') cmdGo({ s: 'quiz' });
    return base.apply(this, a);
  };
})();
// 新しくゲームを始めた／初期化したときは表示中の結果を消す
['newgame', 'resetYes'].forEach(k => {
  const orig = ACTIONS[k];
  if (orig) ACTIONS[k] = function (...a) { UI.quizResult = null; return orig.apply(this, a); };
});

/* ---------- 記録タブ：音楽クイズの記録 ---------- */
Object.assign(TSCREENS, {
  rQuiz(c, scr) {
    const q = ensureQuizState();
    const list = Object.entries(q.songs).filter(([id, s]) => findSong(id) && s.answered).sort((a, b) => b[1].answered - a[1].answered);
    const pg = tvPage(list, scr.page, tvPer(56, 44));
    return {
      parent: '記録', title: '音楽クイズの記録', badge: `<span class="tbadge">連続正解 ${q.streak}・最高 ${q.best}</span>`,
      body: `<div class="tnote">通常練習2回ごとに音楽クイズ。正解するとその演奏会の楽曲理解度が上がります（不正解でも少し上がります）。</div>` +
        (pg.items.map(([id, s]) => tvRow('tgo', tvGo('rQuizSong', `data-id="${id}"`), esc(findSong(id).title), `${esc(findSong(id).composer)}・出題済み ${s.asked.length}問`, `<span class="tr-r">${s.correct}/${s.answered}問正解</span>`)).join('') || '<div class="tempty">まだクイズに回答していません</div>'),
      foot: tvPager(pg) || '',
    };
  },
  rQuizSong(c, scr) {
    const s = quizSong(scr.id), song = findSong(scr.id), tiers = quizTiers(scr.id), q = ensureQuizState();
    const recent = q.history.filter(h => h.songId === scr.id).slice(-3).reverse();
    return {
      parent: '音楽クイズの記録', title: esc(song.title),
      body: `${kv('回答', `${s.answered}問（正解 ${s.correct}問）`)}${kv('出題済み', `${s.asked.length}問／この曲・作曲家・一般 あわせて${tiers.flat().length}問`)}` +
        (recent.length ? `<div class="tlabel">最近の回答</div>` + recent.map(h => `<div class="tline"><span><b class="${h.correct ? 'pos' : 'neg'}">${h.correct ? '○' : '×'}</b> ${esc(QUIZ_INDEX[h.qid] ? QUIZ_INDEX[h.qid].q : '')}</span><b class="pos">理解度 +${h.gain}</b></div>`).join('') : ''),
    };
  },
});
