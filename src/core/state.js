/* =========================================================
 * STATE — ゲームの状態（演奏会の初期状態・新規ゲーム）。計算は systems/ の各ファイル（UIから独立）
 *   団員個人能力  : STATE.members[].abilities / potential
 *   曲パラメータ  : STATE.songParams[songId]  （長期・演奏会をまたいで保持）
 *   発表会パラメータ: STATE.concertPrograms[id].perf（演奏会ごと、0から開始）
 * ========================================================= */
let STATE = null;

/* ---------- 演奏会 ---------- */
function emptyPerf() {
  const sections = {};
  SECTIONS.forEach(s => { sections[s.id] = {}; SECTION_PARAMS.forEach(p => sections[s.id][p.id] = 0); });
  return {
    sections,
    overall: { ensemble: 0, balance: 0, unity: 0 },  // balance は合奏での上積み分（実効値は算出）
    mastery: { underst: 0, comp: 0 },                // 今回の曲の楽曲理解度・楽曲完成度
  };
}

function createConcert() {
  const number = STATE.concertOrder.length + 1;
  const id = 'c' + number + '_' + Date.now().toString(36);
  const c = {
    id, number, title: `第${number}回 定期演奏会`,
    phase: 'setup',      // setup（準備：選曲・会場・指揮者）→ practice → prep → result → done（募集は独立）
    started: false,      // 「演奏会を始める」を押したか
    hallId: null,
    songId: null,        // 演奏する曲（1曲）
    conductorId: (STATE.conductors || []).some(x => x.id === STATE.conductorId) ? STATE.conductorId : null,  // 前回の担当を引き継ぐ
    practiceDone: 0,
    practices: [],       // 練習履歴
    perf: emptyPerf(),   // 発表会パラメータ（毎回0から）
    rehearsal: { done: false },  // ホール練習
    policy: 'stable',
    growth: {},          // 今回の育成による能力上昇 { memberId: { abil: +n } }
    trainingUsed: {},    // 育成の実施済み記録 { 'lesson:m12': true }
    trainingLog: [],
    songGrowth: {},      // { songId: { param: +n } }
    ledger: [],          // 収支 [{label, amount}]
    result: null,
  };
  STATE.concertPrograms[id] = c;
  STATE.concertOrder.push(id);
  STATE.activeConcertId = id;
  return c;
}
const activeConcert = () => STATE.concertPrograms[STATE.activeConcertId];

/* ---------- 新規ゲーム ---------- */
function newGame(name) {
  STATE = {
    version: CONFIG.SAVE_VERSION,
    orchestraName: name || '星霜フィルハーモニー管弦楽団',
    funds: CONFIG.initialFunds,
    reputation: CONFIG.initialReputation,
    members: [],
    songParams: {},
    concertPrograms: {},
    concertOrder: [],
    activeConcertId: null,
    recruit: emptyRecruit(),  // 団員募集（演奏会から独立）
    ledger: [],               // 演奏会に属さない支出（採用費・追加募集）
    nextId: 1,
    createdAt: Date.now(),
  };
  const initialOC = ORIGINAL_CHARACTERS.filter(o => o.initial);
  for (const inst of INSTRUMENTS) {
    let n = inst.std;
    for (const oc of initialOC.filter(o => o.inst === inst.id)) { STATE.members.push(makeOriginal(oc, 0)); n--; }
    for (let i = 0; i < n; i++) STATE.members.push(generateMember(inst.id, weightedPick(CONFIG.initialRankWeights), 0));
  }
  STATE.conductors = [makeConductor(ORIGINAL_CONDUCTORS.find(o => o.founder))];
  STATE.conductorId = STATE.conductors[0].id;
  ensurePrincipals();
  createConcert();
  generateRecruitCandidates();
  generateConductorCandidates();
  save();
}
