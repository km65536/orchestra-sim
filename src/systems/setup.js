/* =========================================================
 * 演奏会の準備（選曲・会場の予約・指揮者の選択）
 * ========================================================= */
/* ---------- 演奏会の準備（選曲・会場の予約・指揮者の選択。順不同） ---------- */
const inSetup = c => c.phase === 'setup';
function startSetup(c) { if (inSetup(c) && !c.started) { c.started = true; save(); } }
// 会場の予約：使用料は予約時に支払う。練習が始まるまでは変更でき、その場合は前の予約を全額返金する
function hallBlockReason(c, hall) {
  if (!inSetup(c)) return '会場は演奏会の準備中にのみ予約できます';
  if (c.hallId === hall.id) return '予約済みの会場です';
  const refund = c.hallId ? findHall(c.hallId).fee : 0;
  if (hall.fee > 0 && STATE.funds + refund < hall.fee) return `資金不足（あと ¥${(hall.fee - STATE.funds - refund).toLocaleString('ja-JP')}）`;
  return null;
}
function selectHall(c, hallId) {
  const hall = findHall(hallId);
  if (!hall || hallBlockReason(c, hall)) return false;
  if (c.hallId) { const old = findHall(c.hallId); if (old.fee) earn(c, `予約取消・返金（${old.name}）`, old.fee); }
  spend(c, `ホール使用料（${hall.name}）`, hall.fee);
  c.hallId = hallId; c.started = true;
  save(); return true;
}
// 今回の演奏会を担当する指揮者（契約中の最大3名から1名）
function selectConcertConductor(c, id) {
  if (!inSetup(c) || !(STATE.conductors || []).some(x => x.id === id)) return false;
  c.conductorId = id; STATE.conductorId = id; c.started = true;
  save(); return true;
}
function setupStatus(c) {
  const song = !!(c.songId && findSong(c.songId));
  const hall = !!(c.hallId && findHall(c.hallId));
  const conductor = !!(c.conductorId && (STATE.conductors || []).some(x => x.id === c.conductorId));
  return { song, hall, conductor, ready: song && hall && conductor };
}
// 3項目がそろったら練習期間へ（ここから先は従来どおり）
function startPractice(c) {
  if (!inSetup(c) || !setupStatus(c).ready) return false;
  STATE.conductorId = c.conductorId;
  c.phase = 'practice';
  save(); return true;
}
