/* =========================================================
 * CONFIG — ゲームバランス用の数値はすべてここで一元管理
 *   金額の単位はすべて「円」
 * ========================================================= */
const CONFIG = {
  SAVE_KEY: 'orchestraSim.save',
  SAVE_VERSION: 5,             // v2: 1曲構成・ホール選択・資金育成 / v3: 募集を演奏会から独立 / v4: 指揮者・首席・外見・Perc統一 / v5: 演奏会の準備（選曲・会場・指揮者）

  initialFunds: 300000,
  initialReputation: 10,       // 楽団の評判（0〜100）。集客に影響
  practiceCount: 10,           // 1演奏会あたりの通常練習回数（固定）
  recruitCandidates: 5,        // 1回の募集で提示する候補者数
  rerollRecruitCost: 20000,    // 追加募集（候補の入れ替え）費用
  originalCandidateChance: 0.22, // 候補1枠がオリジナルキャラになる確率
  individualMaxTargets: 4,     // 個人練習の最大対象人数
  focusPoints: 10,             // 重点項目の配分ポイント合計

  // ランク判定（7能力の平均値）
  rankThresholds: [ ['S', 80], ['A', 68], ['B', 57], ['C', 46], ['D', 35], ['E', 0] ],
  // 生成時の目標平均値
  rankBaseLevel: { S: 84, A: 72, B: 61, C: 50, D: 40, E: 29 },
  // 採用費（円）
  hireCost: { S: 190000, A: 120000, B: 75000, C: 45000, D: 25000, E: 15000 },
  hirePotentialFactor: 1200,   // 潜在能力の伸びしろ1あたりの追加費用
  // 募集候補のランク出現率
  recruitRankWeights: { S: 3, A: 10, B: 22, C: 32, D: 22, E: 11 },
  // 初期団員のランク出現率
  initialRankWeights: { S: 0, A: 3, B: 18, C: 45, D: 28, E: 6 },

  // ---- セクション基礎能力 ----
  sectionBase: {
    headcountFloor: 0.85,      // 人数ゼロに近いときの係数下限
    unitySpreadPenalty: 0.35,  // 統一感：団員の総合力のばらつき（標準偏差）によるペナルティ
  },

  // ---- 練習効果（発表会パラメータ）※団員の恒久的な能力は上昇しない ----
  practice: {
    kSection: 4.8,             // セクション練習：1ポイントあたりの基本上昇量
    kTuttiSection: 1.8,        // 全体合奏：セクション項目への上昇量
    kTuttiOverall: 6.5,        // 全体合奏：全体パラメータへの上昇量
    kTuttiBaseEnsemble: 6.0,   // 全体合奏：重点に関係なく得られるアンサンブル上昇
    kMastery: 5.0,             // 全体合奏：楽曲完成度/理解度への上昇量
    kSectionMastery: 1.0,      // セクション練習：楽曲完成度
    kIndividualSection: 2.0,   // 個人練習：対象団員のセクション項目
    kIndividualMastery: 2.0,   // 個人練習：楽曲理解度
    effMin: 0.4, effDiv: 80,   // 基礎能力→効率  eff = effMin + base/effDiv
    diminishScale: 55,         // 逓減  1/(1+cur/scale)
    randomMin: 0.75, randomMax: 1.25,
    perfCap: 100,              // 発表会パラメータの目安上限
    pointsExponent: 0.7,       // 配分ポイントの効き方（1未満で集中配分ほど効率低下）
  },

  // ---- 曲パラメータ（長期・上限なし） ----
  songParam: {
    tuttiBaseChance: 0.55,
    individualBaseChance: 0.32,
    diminishScale: 40,         // 確率 = base * ... / (1 + cur/scale)
    bonusScale: 18,            // 本番への寄与 = bonusMax * (1 - exp(-sum/bonusScale))
    bonusMax: 9,
  },

  /* ---- 育成（資金で団員の能力を伸ばす。唯一の恒久的な成長手段）----
   * target: member=団員1名 / section=セクション全員
   * gains : { 能力: [最小, 最大, 発生確率] }   ※潜在能力は超えない
   * cost  : base + perMember×人数（＋ levelFactor×平均能力 で上級者ほど高額）
   * limit : 'concert' = 同じ対象に1演奏会1回まで
   */
  trainings: [
    { id: 'concert', name: 'プロの演奏会を聴かせる', icon: '聴', target: 'section', limit: 'concert',
      cost: { base: 0, perMember: 1500 },
      gains: { expr: [2, 4, 0.8], ear: [1, 3, 0.7], tone: [1, 3, 0.6] },
      desc: 'セクション全員をプロオーケストラの公演に招待。耳と表現の引き出しが増える。',
      message: 'プロの演奏会に団員を招待した！' },
    { id: 'masterclass', name: 'プロ奏者の特別講習', icon: '講', target: 'section', limit: 'concert',
      cost: { base: 20000, perMember: 1000 },
      gains: { tech: [2, 5, 0.9], rhythm: [2, 4, 0.8], coop: [1, 3, 0.7], ear: [1, 2, 0.5] },
      desc: '第一線の奏者を招いてセクション全体を指導してもらう。技術とアンサンブル力が伸びる。',
      message: 'プロの演奏家による特別講習を実施した！' },
    { id: 'lesson', name: '個人レッスン', icon: '師', target: 'member', limit: 'concert', chooseAbility: true,
      cost: { base: 8000, perMember: 0, levelFactor: 120 },
      gains: { _focus: [4, 7, 1], _other: [1, 3, 0.7] },
      desc: '団員1名に専門の先生をつけ、選んだ能力を集中的に伸ばす。上手い団員ほど高額。',
      message: '個人レッスンの成果が表れた！' },
    { id: 'maintenance', name: '楽器のメンテナンス', icon: '調', target: 'section', limit: 'concert',
      cost: { base: 0, perMember: 1000 },
      gains: { tone: [1, 3, 0.8], dyn: [1, 2, 0.7] },
      desc: 'セクションの楽器を工房で一斉に調整。音色と鳴りが少し良くなる。',
      message: 'セクションの楽器を一斉にメンテナンスした！' },
    { id: 'instrument', name: '新しい楽器に買い換える', icon: '器', target: 'member', limit: 'grade',
      desc: '団員の楽器を上位グレードへ買い換える。音色と鳴りが大きく向上する高額投資。',
      message: '新しい楽器を購入した！' },
    // ---- 指揮者の育成（target: 'conductor'）----
    { id: 'c_score', name: 'スコア研究会', icon: '譜', target: 'conductor', limit: 'concert',
      cost: { base: 15000, perMember: 0, levelFactor: 0 },
      gains: { interp: [1, 3, 0.9], baton: [1, 1, 0.4] },
      desc: '研究者を招いて作品の背景や版の違いを学ぶ。解釈力が深まる。',
      message: '指揮者がスコア研究会で作品を掘り下げた！' },
    { id: 'c_master', name: '海外マスタークラス受講', icon: '渡', target: 'conductor', limit: 'concert',
      cost: { base: 60000, perMember: 0, levelFactor: 400 },
      gains: { baton: [2, 4, 0.9], interp: [1, 2, 0.6], lead: [1, 1, 0.4] },
      desc: '世界的指揮者のマスタークラスへ派遣する。指揮技術が大きく伸びる。',
      message: '指揮者が海外のマスタークラスを受講した！' },
    { id: 'c_guest', name: '客演指揮で経験を積む', icon: '客', target: 'conductor', limit: 'concert',
      cost: { base: 30000, perMember: 0, levelFactor: 0 },
      gains: { lead: [2, 3, 0.85], charisma: [1, 3, 0.7] },
      desc: '他の楽団への客演を手配する。統率力と人気が高まる（渡航・調整費が必要）。',
      message: '指揮者が客演指揮で大きな経験を積んだ！' },
  ],
  // 楽器グレード（買い換えで1段階ずつ上がる）
  instrumentGrades: [
    { name: '練習用モデル' },
    { name: '中級モデル', cost: 40000,  gains: { tone: [3, 4, 1], dyn: [1, 2, 1] } },
    { name: '上級モデル', cost: 100000, gains: { tone: [4, 5, 1], dyn: [2, 3, 1], tech: [1, 1, 1] } },
    { name: 'プロモデル', cost: 200000, gains: { tone: [5, 7, 1], dyn: [2, 3, 1], tech: [1, 2, 1], expr: [1, 2, 1] } },
  ],

  /* ---- ホール（各サイクルの最初に選択・使用料は選択時に支払い）----
   * acoustics: 音響性能（評価に影響）  stage: 舞台に乗る最大人数（超えると響きが飽和）
   * attendance: 基本集客率  repSens: 評判1あたりの集客率上昇
   * pressure: 一流会場の重圧（成功率低下。ホール練習で解消）  prestige: 評判の増減倍率
   */
  halls: [
    { id: 'community', name: '公民館 多目的ホール', grade: '小規模', fee: 0, capacity: 200, ticket: 500,
      acoustics: 30, stage: 45, attendance: 0.60, repSens: 0.003, pressure: 0, prestige: 0.5, rehearsalFee: 0,
      feature: '無料で使えるが響きは乏しい。舞台が狭く大編成の曲は収まりきらない。' },
    { id: 'small', name: '市民会館 小ホール', grade: '小規模', fee: 30000, capacity: 400, ticket: 800,
      acoustics: 50, stage: 55, attendance: 0.45, repSens: 0.004, pressure: 0, prestige: 0.8, rehearsalFee: 8000,
      feature: '客席との距離が近く、満席にしやすい堅実な会場。' },
    { id: 'general', name: '文化センター 大ホール', grade: '一般', fee: 90000, capacity: 800, ticket: 1200,
      acoustics: 65, stage: 75, attendance: 0.25, repSens: 0.005, pressure: 0.01, prestige: 1.0, rehearsalFee: 20000,
      feature: '標準的なコンサートホール。二管編成の交響曲も無理なく演奏できる。' },
    { id: 'large', name: '県立芸術劇場 コンサートホール', grade: '大規模', fee: 200000, capacity: 1500, ticket: 1800,
      acoustics: 80, stage: 100, attendance: 0.06, repSens: 0.0055, pressure: 0.03, prestige: 1.3, rehearsalFee: 45000,
      feature: '豊かな残響の大ホール。評判が低いうちは空席が目立つ。' },
    { id: 'top', name: 'グランシンフォニア・ホール', grade: '一流', fee: 450000, capacity: 2000, ticket: 3000,
      acoustics: 95, stage: 110, attendance: 0.0, repSens: 0.0035, pressure: 0.06, prestige: 2.0, rehearsalFee: 90000,
      feature: '世界的名演が生まれてきた一流ホール。響きは最高だが、重圧も大きい。' },
  ],
  hallEffect: {
    acousticsBase: 60,         // これより良い音響で評価にプラス
    acousticsEval: 0.15,       // (音響-基準)×係数 を表現・バランス評価に加算（他項目は半分）
    overflowProb: 0.012,       // 舞台からはみ出す1人あたりの成功率低下
    overflowEval: 0.8,         // 同・バランス評価の低下
  },

  // ---- 収支 ----
  economy: {
    operatingBase: 20000,      // 1演奏会ごとの運営費（事務・印刷・譜面レンタル等）
    operatingPerMember: 1000,  // 団員1名あたりの謝礼・交通費
    popularityAttendance: 0.04,// 知名度（3が基準）1あたりの集客率
    durationBase: 0.8, durationDiv: 150, durationMax: 1.1, // 演奏時間による集客係数
    attendanceMin: 0.05, attendanceMax: 0.97,
    // 出来高係数 = clamp(base + 総合点×slope)  … 評価が高いほど物販・追加公演・寄付が増える
    resultBase: 0.25, resultSlope: 0.0125, resultMin: 0.4, resultMax: 1.4,
    sponsor: { S: 80000, A: 40000, B: 15000, C: 0, D: 0 },  // 協賛金
    reputation: { S: 6, A: 3, B: 1.5, C: 0, D: -3 },          // 評判の変化（×ホールのprestige）
  },

  // ---- 本番 ----
  concert: {
    sectionWeight: { hs: 1.3, ls: 1.0, ww: 1.0, br: 1.0, pc: 0.6 },
    composite: { section: 0.45, overall: 0.25, mastery: 0.30, imbalancePenalty: 0.4 }, // 偏った練習へのペナルティ
    abilityWeight: 1.0,        // 楽団の地力（セクション基礎能力の平均-50）× 係数 を仕上がりに加算
    requiredBase: 13, requiredPerDifficulty: 0.5,  // v4: 首席の重み付けによる地力上昇分を相殺するため 12→13
    sigmoidScale: 8,
    hallBonus: 0.05,           // ホール練習による成功率上昇
    hallEvalBonus: 3,
    maxProb: 0.97, minProb: 0.02,
    // 編成不足ペナルティ（楽器単位）
    shortage: {
      perStringPlayer: 0.02,
      perWindPlayer: 0.09,
      perPercPlayer: 0.08,
      missingInstrument: 0.30,  // 必要楽器が完全に欠けている場合の追加
      floor: 0.05,              // 成功確率に掛ける係数の下限
      evalPenalty: 45,          // 評価（音量・バランス等）への影響
    },
    evalSpread: 4,
    successEvalBonus: 8, failEvalPenalty: 16,
    evalSlope: 1.2,
    difficultyEvalBonus: 0.1,
    rankThresholds: [ ['S', 85], ['A', 72], ['B', 60], ['C', 45], ['D', 0] ],
  },

  // ---- 指揮者 ----
  conductor: {
    maxHired: 3,                 // 同時に契約できる指揮者の数
    candidates: 3,               // 指揮者候補の提示数
    rerollCost: 30000,           // 候補の入れ替え費用
    originalChance: 0.3,         // 候補1枠がオリジナル指揮者になる確率
    rankWeights: { S: 2, A: 8, B: 25, C: 40, D: 20, E: 5 },
    rankThresholds: [ ['S', 80], ['A', 68], ['B', 57], ['C', 46], ['D', 35], ['E', 0] ],
    hireCost: { S: 600000, A: 400000, B: 250000, C: 150000, D: 90000, E: 50000 },
    hirePotentialFactor: 2000,
    feeBase: 45, feePerPoint: 1500, feeMin: 5000,  // 出演料 = max(feeMin, (平均能力 - feeBase) × feePerPoint)（創設時の常任指揮者は無償）
    // 能力の効果（50を基準に上下。基準付近なら既存バランスはほぼ変わらない）
    compositeWeight: 0.2,        // 仕上がり += (統率・解釈・技術の平均 - 50) × 係数
    evalWeight: 0.08,            // 評価: 技術面←技術、表現←解釈、アンサンブル←統率
    practiceWeight: 1 / 250,     // 全体合奏の効果 ×(1 + (統率-50)×係数)、理解度は解釈で同様
    attendancePerPoint: 0.0012,  // 集客率 += (カリスマ-50) × 係数
    traitProb: 0.02, traitEval: 2,  // 得意な指揮方針を選んだときの成功率・評価ボーナス
    growthChance: 0.45,          // 演奏会の経験による成長：各能力がこの確率で +1〜2
  },
  // ---- 首席奏者 ----
  principal: {
    baseWeight: 1.5,             // セクション基礎能力の計算で首席の能力を重く数える
    soloWeight: 0.08,            // 管打楽器の首席の（音色+表現）/2 が55を超えた分 × 係数 を音楽表現の評価へ
  },

  // 本番の指揮方針
  policies: {
    stable:   { name: '安定重視',         desc: '事故を避け確実に。成功率↑ 表現の評価↓', prob: 0.06, eval: { tech: 3, expr: -5, ens: 1, bal: 0, comp: 1 }, spread: 0.6 },
    express:  { name: '表現重視',         desc: '攻めた解釈。成功率↓ 表現の評価↑',       prob: -0.05, eval: { tech: -2, expr: 8, ens: 0, bal: 0, comp: 1 }, spread: 1.4 },
    dynamics: { name: 'ダイナミクス重視', desc: '強弱の幅を最大に。バランスの仕上がり次第で評価が大きく変わる', prob: -0.03, eval: { tech: 0, expr: 3, ens: 0, bal: 'dyn', comp: 0 }, spread: 1.2 },
    balance:  { name: 'バランス重視',     desc: '全体の響きを整える。成功率やや↑',      prob: 0.02, eval: { tech: 0, expr: -2, ens: 3, bal: 5, comp: 0 }, spread: 0.9 },
  },
};
