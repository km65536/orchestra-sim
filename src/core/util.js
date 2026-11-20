/* =========================================================
 * 汎用の小さな関数（乱数・平均など）
 * ========================================================= */
/* ---------- 汎用 ---------- */
const rnd = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rnd(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mean = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
const stdev = arr => { if (arr.length < 2) return 0; const m = mean(arr); return Math.sqrt(mean(arr.map(v => (v - m) ** 2))); };
const sigmoid = x => 1 / (1 + Math.exp(-x));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const round1 = v => Math.round(v * 10) / 10;
function weightedPick(obj) {
  const entries = Object.entries(obj).filter(([, w]) => w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [k, w] of entries) { if ((r -= w) <= 0) return k; }
  return entries.length ? entries[entries.length - 1][0] : null;
}
function newId(prefix) { STATE.nextId = (STATE.nextId || 1) + 1; return prefix + STATE.nextId; }
