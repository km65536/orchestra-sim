/* =========================================================
 * ページ全体のスクロール・拡大の禁止（全タブ共通）
 *   ブラウザ標準のスクロール／ピンチ拡大／ダブルタップ拡大／端でのバウンス／
 *   Ctrl+ホイール・Ctrl+＋− による拡大を止める。
 *   ゲーム内の操作（ボタン、ウインドウのドラッグなど pointer イベントで作られた操作、
 *   内部でスクロールするよう作られた領域）は妨げない。
 * ========================================================= */
(() => {
  const opt = { passive: false };
  // 指の動きを内部でスクロールさせてよい要素か（ゲームが意図してスクロール可能にしている領域）
  function scrollableAncestor(el, dx, dy) {
    for (; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      if (!(el instanceof Element)) continue;
      const cs = getComputedStyle(el);
      const oy = /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1;
      const ox = /(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1;
      if (oy && Math.abs(dy) >= Math.abs(dx)) {
        // 端に達している方向へは動かさない（ページへの連鎖・バウンスを防ぐ）
        if ((dy > 0 && el.scrollTop <= 0) || (dy < 0 && el.scrollTop + el.clientHeight >= el.scrollHeight - 1)) return null;
        return el;
      }
      if (ox && Math.abs(dx) > Math.abs(dy)) {
        if ((dx > 0 && el.scrollLeft <= 0) || (dx < 0 && el.scrollLeft + el.clientWidth >= el.scrollWidth - 1)) return null;
        return el;
      }
    }
    return null;
  }
  let sx = 0, sy = 0;
  document.addEventListener('touchstart', e => {
    if (e.touches.length > 1) { e.preventDefault(); return; }   // 2本指＝ピンチ拡大の開始
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
  }, opt);
  document.addEventListener('touchmove', e => {
    if (e.touches.length > 1 || (typeof e.scale === 'number' && e.scale !== 1)) { e.preventDefault(); return; }
    const t = e.touches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (!scrollableAncestor(e.target, dx, dy)) e.preventDefault();   // ページのスクロール・バウンスを止める
  }, opt);
  // iOS Safari のピンチ拡大（独自のジェスチャーイベント）
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, e => e.preventDefault(), opt));
  // ダブルタップ拡大（CSS の touch-action:manipulation が主。dblclick は念のため既定動作だけ止める）
  document.addEventListener('dblclick', e => e.preventDefault(), opt);
  // PC：Ctrl（⌘）＋ホイール、Ctrl（⌘）＋ ＋/−/0 による拡大縮小
  window.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) e.preventDefault(); }, opt);
  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0', ';', '_'].includes(e.key)) e.preventDefault();
  });
  // それでもページがずれた場合（入力欄のフォーカスなど）は元の位置に戻す
  window.addEventListener('scroll', () => {
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;   // 入力中のキーボード表示は妨げない
    if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
  }, { passive: true });
})();
