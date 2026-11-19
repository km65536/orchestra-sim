/* =========================================================
 * DATA — 楽器・セクション・能力・曲データ
 * ========================================================= */

// 楽器（abbr は表示用略称、cap は在籍上限、std は標準人数＝初期編成）
const INSTRUMENTS = [
  { id: 'Vn1',  abbr: 'Vn I',  section: 'hs', cap: 12, std: 6, kind: 'string' },
  { id: 'Vn2',  abbr: 'Vn II', section: 'hs', cap: 10, std: 5, kind: 'string' },
  { id: 'Va',   abbr: 'Va',    section: 'ls', cap: 8,  std: 4, kind: 'string' },
  { id: 'Vc',   abbr: 'Vc',    section: 'ls', cap: 8,  std: 4, kind: 'string' },
  { id: 'Cb',   abbr: 'Cb',    section: 'ls', cap: 6,  std: 2, kind: 'string' },
  { id: 'Fl',   abbr: 'Fl',    section: 'ww', cap: 4,  std: 2, kind: 'wind' },
  { id: 'Ob',   abbr: 'Ob',    section: 'ww', cap: 4,  std: 2, kind: 'wind' },
  { id: 'Cl',   abbr: 'Cl',    section: 'ww', cap: 4,  std: 2, kind: 'wind' },
  { id: 'Fg',   abbr: 'Fg',    section: 'ww', cap: 4,  std: 2, kind: 'wind' },
  { id: 'Hr',   abbr: 'Hr',    section: 'br', cap: 8,  std: 4, kind: 'wind' },
  { id: 'Tp',   abbr: 'Tp',    section: 'br', cap: 5,  std: 3, kind: 'wind' },
  { id: 'Tb',   abbr: 'Tb',    section: 'br', cap: 4,  std: 2, kind: 'wind' },
  { id: 'Tuba', abbr: 'Tuba',  section: 'br', cap: 2,  std: 1, kind: 'wind' },
  { id: 'Perc', abbr: 'Perc',  section: 'pc', cap: 6,  std: 3, kind: 'perc' },
];
const INST = Object.fromEntries(INSTRUMENTS.map(i => [i.id, i]));

const SECTIONS = [
  { id: 'hs', name: '高弦',   insts: ['Vn1', 'Vn2'] },
  { id: 'ls', name: '低弦',   insts: ['Va', 'Vc', 'Cb'] },
  { id: 'ww', name: '木管',   insts: ['Fl', 'Ob', 'Cl', 'Fg'] },
  { id: 'br', name: '金管',   insts: ['Hr', 'Tp', 'Tb', 'Tuba'] },
  { id: 'pc', name: '打楽器', insts: ['Perc'] }   // 打楽器は Perc に統一（ティンパニ含む）,
];
const SEC = Object.fromEntries(SECTIONS.map(s => [s.id, s]));

// 個人能力 → セクション基礎能力／発表会セクションパラメータ
const ABILITIES = [
  { id: 'tech',   name: '技術力',         short: '技術', param: 'tech' },
  { id: 'ear',    name: '音感',           short: '音感', param: 'pitch' },
  { id: 'rhythm', name: 'リズム感',       short: 'リズム', param: 'rhythm' },
  { id: 'tone',   name: '音色の良さ',     short: '音色', param: 'tone' },
  { id: 'dyn',    name: 'ダイナミクス能力', short: '強弱', param: 'dyn' },
  { id: 'expr',   name: '表現力',         short: '表現', param: 'expr' },
  { id: 'coop',   name: '協調性',         short: '協調', param: 'unity' },
];
const ABIL = Object.fromEntries(ABILITIES.map(a => [a.id, a]));

const SECTION_PARAMS = [
  { id: 'tech',   name: '技術力', short: '技術' },
  { id: 'pitch',  name: '音程精度', short: '音程' },
  { id: 'rhythm', name: 'リズム精度', short: 'リズム' },
  { id: 'tone',   name: '音色', short: '音色' },
  { id: 'dyn',    name: 'ダイナミクス', short: '強弱' },
  { id: 'expr',   name: '表現力', short: '表現' },
  { id: 'unity',  name: '統一感', short: '統一' },
];
const SPARAM = Object.fromEntries(SECTION_PARAMS.map(p => [p.id, p]));
const PARAM_TO_ABIL = Object.fromEntries(ABILITIES.map(a => [a.param, a.id]));

const OVERALL_PARAMS = [
  { id: 'ensemble', name: 'アンサンブル' },
  { id: 'balance',  name: 'バランス' },
  { id: 'unity',    name: '統一感' },
];

// 練習の重点項目（8項目）
const FOCUS = [
  { id: 'pitch',   name: '音程',        param: 'pitch',  abil: 'ear' },
  { id: 'rhythm',  name: 'リズム',      param: 'rhythm', abil: 'rhythm' },
  { id: 'tone',    name: '音色',        param: 'tone',   abil: 'tone' },
  { id: 'dyn',     name: '音量・強弱',  param: 'dyn',    abil: 'dyn' },
  { id: 'ens',     name: 'アンサンブル', param: 'unity',  abil: 'coop' },
  { id: 'expr',    name: '表現力',      param: 'expr',   abil: 'expr' },
  { id: 'underst', name: '曲の理解',    param: null,     abil: 'expr' },
  { id: 'tech',    name: '技術・技巧',  param: 'tech',   abil: 'tech' },
];
const FOC = Object.fromEntries(FOCUS.map(f => [f.id, f]));

const SONG_PARAMS = [
  { id: 'base',   name: '基礎完成度' },
  { id: 'underst', name: '理解度' },
  { id: 'expr',   name: '表現' },
];

const NAME_FAMILY = ['佐藤','鈴木','高橋','田中','伊藤','渡辺','山本','中村','小林','加藤','吉田','山田','佐々木','山口','松本','井上','木村','林','清水','山崎','森','池田','橋本','阿部','石川','前田','藤田','小川','岡田','後藤','長谷川','村上','近藤','石井','坂本','遠藤','青木','藤井','西村','福田','太田','三浦','藤原','岡本','松田','中川','中野','原田','小野','竹内','金子','和田','中山','石田','上田','森田','柴田','酒井','工藤','横山','宮崎','宮本','内田','高木','安藤','谷口','大野','丸山','今井','河野','藤本','村田','武田','上野','杉山','増田','平野','大塚','千葉','久保','松井','小島','岩崎','桜井','野口','松尾','菊地','野村','新井','渡部'];
const NAME_GIVEN = ['陽菜','結衣','美咲','葵','凛','真央','彩花','優奈','千尋','遥','七海','紗希','杏','楓','琴音','美月','和花','詩織','奏','響子','翔太','蓮','大輝','悠真','颯太','拓海','健太','陸','直樹','亮','湊','樹','航','智也','誠','俊介','慎吾','大和','律','透','悠','晴','理沙','朋美','由佳','真理','沙織','達也','浩二','修'];

// オリジナルキャラクター（固定の個性・能力構成）
// abilities / potential は 7能力の順: tech, ear, rhythm, tone, dyn, expr, coop
const ORIGINAL_CHARACTERS = [
  { oid: 'oc_kirishima', look: { hair: 'long', hairColor: 0, skin: 0, face: 2, glasses: false, build: 0.96, height: 1.02, style: 'dress' }, name: '霧島 玲', inst: 'Vn1', initial: true,
    profile: 'コンサートマスター。精密な技巧で楽団を引っ張るが、他人にも厳しい。',
    abilities: [82, 80, 74, 76, 68, 70, 52], potential: [92, 90, 84, 88, 80, 84, 70] },
  { oid: 'oc_nanase', look: { hair: 'bob', hairColor: 3, skin: 1, face: 0, glasses: false, build: 0.94, height: 0.97, style: 'dress' }, name: '七瀬 灯', inst: 'Ob', initial: true,
    profile: '甘く澄んだ音色のオーボエ奏者。本番では驚くほど歌う。',
    abilities: [58, 66, 55, 78, 60, 74, 61], potential: [80, 84, 76, 95, 82, 93, 78] },
  { oid: 'oc_kurogane', look: { hair: 'crop', hairColor: 4, skin: 2, face: 4, glasses: false, build: 1.12, height: 1.04, style: 'tux' }, name: '黒鉄 剛', inst: 'Hr', initial: false, cost: 150000,
    profile: '元プロオケの首席ホルン。豪快な鳴りで金管を支える職人。',
    abilities: [80, 72, 70, 74, 88, 66, 64], potential: [84, 78, 76, 80, 95, 74, 72] },
  { oid: 'oc_amane', look: { hair: 'ponytail', hairColor: 2, skin: 0, face: 1, glasses: false, build: 0.92, height: 0.95, style: 'dress' }, name: '天音 しずく', inst: 'Fl', initial: false, cost: 90000,
    profile: '音大を出たばかりの新星。今は粗削りだが伸びしろは計り知れない。',
    abilities: [52, 60, 50, 64, 48, 62, 55], potential: [96, 95, 90, 97, 88, 96, 85] },
  { oid: 'oc_tokiwa', look: { hair: 'wavy', hairColor: 1, skin: 1, face: 3, glasses: true, build: 1.04, height: 1.03, style: 'tux' }, name: '常盤 朔', inst: 'Vc', initial: false, cost: 130000,
    profile: '深く温かい響きのチェリスト。低弦の柱となる穏やかな人格者。',
    abilities: [74, 72, 70, 82, 72, 78, 84], potential: [84, 82, 80, 92, 82, 88, 95] },
  { oid: 'oc_shinonome', look: { hair: 'short', hairColor: 0, skin: 2, face: 5, glasses: false, build: 1.02, height: 1.0, style: 'suit' }, name: '東雲 拍', inst: 'Perc', initial: false, cost: 110000,
    profile: '寸分違わぬテンポ感を持つ打楽器奏者。ティンパニを叩かせたら楽団の心臓。',
    abilities: [70, 64, 92, 66, 80, 60, 70], potential: [80, 76, 98, 78, 90, 74, 82] },
  { oid: 'oc_hayami', look: { hair: 'side', hairColor: 6, skin: 0, face: 1, glasses: false, build: 0.98, height: 1.01, style: 'tux' }, name: '速水 透', inst: 'Tp', initial: false, cost: 100000,
    profile: '輝かしい高音が武器のトランペット奏者。音量の制御はまだ苦手。',
    abilities: [78, 66, 72, 76, 50, 70, 58], potential: [90, 80, 84, 88, 78, 84, 74] },
  { oid: 'oc_yukimura', look: { hair: 'bun', hairColor: 0, skin: 0, face: 0, glasses: true, build: 0.93, height: 0.98, style: 'dress' }, name: '雪村 澪', inst: 'Va', initial: false, cost: 95000,
    profile: '内声を愛するヴィオラ奏者。誰とでも合わせられる調和の人。',
    abilities: [64, 70, 66, 70, 62, 64, 86], potential: [80, 84, 80, 86, 78, 80, 96] },
  { oid: 'oc_kagura', look: { hair: 'wavy', hairColor: 7, skin: 1, face: 2, glasses: false, build: 0.97, height: 1.0, style: 'suit' }, name: '神楽 鈴音', inst: 'Cl', initial: false, cost: 105000,
    profile: 'ジャズ出身の異色クラリネット奏者。表現の幅は随一。',
    abilities: [72, 62, 76, 70, 70, 84, 56], potential: [84, 76, 88, 84, 84, 96, 72] },
];

/* ---------------------------------------------------------
 * 外見（3Dモデルの部品の組み合わせ）
 *   look = { hair, hairColor, skin, face, glasses, build, height, style }
 *   団員ごとに保存し、演奏会をまたいでも変わらない
 * --------------------------------------------------------- */
const LOOK_PARTS = {
  hair: ['short', 'side', 'crop', 'bob', 'long', 'ponytail', 'bun', 'wavy'],
  hairColors: [0x1c1714, 0x3a2a20, 0x5b3d29, 0x7a4f2e, 0x8e8a85, 0xcfc9c1, 0xa9824a, 0x6b2e22],
  skins: [0xf5dcc7, 0xedcbb0, 0xe2b996, 0xcf9f7a, 0xa9775a],
  faces: 6,   // 目・眉・口の組み合わせパターン数
  styles: ['dress', 'tux', 'suit'],   // ロングドレス／燕尾服（白シャツ・蝶ネクタイ）／黒スーツ
};
// 名前（下の名前）から性別表現の傾向を決める（服装の初期傾向にのみ使用）
const FEMININE_GIVEN = new Set(['陽菜','結衣','美咲','葵','凛','真央','彩花','優奈','千尋','遥','七海','紗希','杏','楓','琴音','美月','和花','詩織','奏','響子','理沙','朋美','由佳','真理','沙織']);

/* ---------------------------------------------------------
 * 指揮者
 * --------------------------------------------------------- */
const CONDUCTOR_ABILITIES = [
  { id: 'lead',     name: '統率力',   short: '統率', desc: '合奏をまとめる力。アンサンブル・統一感と全体合奏の効果に影響' },
  { id: 'interp',   name: '解釈力',   short: '解釈', desc: '作品を読み解く力。音楽表現・楽曲理解度に影響' },
  { id: 'baton',    name: '指揮技術', short: '技術', desc: 'バトンの明確さ。技術面の評価と成功率に影響' },
  { id: 'charisma', name: 'カリスマ', short: '人気', desc: '聴衆を惹きつける力。集客と評判に影響' },
];
const CABIL = Object.fromEntries(CONDUCTOR_ABILITIES.map(a => [a.id, a]));
const CONDUCTOR_TRAITS = [
  { id: 'craft',   name: '職人型',     desc: '正確無比なバトン。「安定重視」の方針で真価を発揮する。', policy: 'stable' },
  { id: 'passion', name: '情熱型',     desc: '熱い指揮で団員を鼓舞する。「表現重視」の方針と好相性。', policy: 'express' },
  { id: 'drama',   name: '劇場型',     desc: '大胆な強弱で聴衆を沸かせる。「ダイナミクス重視」と好相性。', policy: 'dynamics' },
  { id: 'sound',   name: '響き重視型', desc: '全体の響きの調和を大切にする。「バランス重視」と好相性。', policy: 'balance' },
  { id: 'teacher', name: '教育者型',   desc: '練習の組み立てが巧み。全体合奏の練習効果が高まる。', practice: 1.08 },
];
const CTRAIT = Object.fromEntries(CONDUCTOR_TRAITS.map(t => [t.id, t]));
// abilities / potential は lead, interp, baton, charisma の順
const ORIGINAL_CONDUCTORS = [
  { oid: 'cd_takamiya', name: '鷹宮 誠一', founder: true, trait: 'sound',
    look: { hair: 'side', hairColor: 4, skin: 1, face: 3, glasses: true, build: 1.02, height: 1.04, style: 'tux' },
    profile: '楽団創設以来の常任指揮者。穏やかだが音には一切妥協しない。',
    abilities: [50, 49, 51, 44], potential: [76, 80, 82, 68] },
  { oid: 'cd_novak', name: 'エレナ・ノヴァク', trait: 'passion', cost: 420000,
    look: { hair: 'long', hairColor: 6, skin: 0, face: 2, glasses: false, build: 0.95, height: 1.03, style: 'suit' },
    profile: '東欧出身の俊英。燃えるような指揮で団員の潜在力を引き出す。',
    abilities: [68, 74, 66, 72], potential: [84, 90, 82, 88] },
  { oid: 'cd_ichinose', name: '一ノ瀬 奏多', trait: 'teacher', cost: 160000,
    look: { hair: 'crop', hairColor: 0, skin: 0, face: 1, glasses: false, build: 0.94, height: 0.99, style: 'suit' },
    profile: '指揮コンクールで注目を集めた若手。今は経験不足だが、底知れない才能を秘める。',
    abilities: [48, 56, 54, 50], potential: [92, 95, 94, 90] },
  { oid: 'cd_okochi', name: '大河内 巌', trait: 'drama', cost: 650000,
    look: { hair: 'wavy', hairColor: 5, skin: 2, face: 4, glasses: false, build: 1.1, height: 1.02, style: 'tux' },
    profile: '世界の歌劇場を渡り歩いた巨匠。圧倒的な存在感だが、出演料も破格。',
    abilities: [84, 82, 80, 86], potential: [88, 86, 84, 90] },
  { oid: 'cd_ramaud', name: 'ソフィー・ラモー', trait: 'sound', cost: 300000,
    look: { hair: 'bun', hairColor: 3, skin: 0, face: 0, glasses: true, build: 0.93, height: 1.0, style: 'dress' },
    profile: 'パリ仕込みの響きの魔術師。透明感のあるバランスを作り上げる。',
    abilities: [64, 70, 68, 62], potential: [82, 88, 86, 80] },
];

/* ---------------------------------------------------------
 * ホールの3D表現（CONFIG.halls の id に対応）
 *   w/d/h: 客席部分の幅・奥行・天井高  rows×cols: 3D上の客席数（集客率に応じて観客が座る）
 * --------------------------------------------------------- */
const HALL_VISUALS = {
  community: { w: 20, d: 16, h: 6.5, rows: 9, cols: 16, rake: 0.08, wall: 0xd8d0c0, wallWood: false, ceiling: 0xe8e4da,
    floor: 0xb89466, stageFloor: 0xc49a62, seat: 0x6d727a, folding: true, light: 0xeef4ff, lightI: 1.0, warm: 0.0,
    chandelier: 0, organ: false, balcony: 0, panels: false, backdrop: 0xcfc6b4 },
  small: { w: 22, d: 18, h: 8, rows: 12, cols: 18, rake: 0.14, wall: 0xb88a5c, wallWood: true, ceiling: 0xd9c4a6,
    floor: 0x8a5a36, stageFloor: 0xb07a46, seat: 0x7a2630, folding: false, light: 0xfff0dc, lightI: 1.05, warm: 0.3,
    chandelier: 0, organ: false, balcony: 0, panels: true, backdrop: 0xa47448 },
  general: { w: 26, d: 22, h: 11, rows: 15, cols: 22, rake: 0.2, wall: 0x9c6b42, wallWood: true, ceiling: 0xcbb08a,
    floor: 0x6e4528, stageFloor: 0xa8713f, seat: 0x8b1f2c, folding: false, light: 0xffe8c8, lightI: 1.1, warm: 0.5,
    chandelier: 0, organ: false, balcony: 1, panels: true, backdrop: 0x8a5a34 },
  large: { w: 30, d: 26, h: 15, rows: 18, cols: 26, rake: 0.24, wall: 0x7a4c2e, wallWood: true, ceiling: 0xb89a74,
    floor: 0x5a3820, stageFloor: 0x9c6638, seat: 0x7d1726, folding: false, light: 0xffdfb4, lightI: 1.15, warm: 0.7,
    chandelier: 0, organ: true, balcony: 2, panels: true, backdrop: 0x6e4428 },
  top: { w: 34, d: 30, h: 18, rows: 20, cols: 30, rake: 0.28, wall: 0x5e3622, wallWood: true, ceiling: 0xd9b87a,
    floor: 0x4a2c18, stageFloor: 0x9a6232, seat: 0x6e0f1e, folding: false, light: 0xffd9a0, lightI: 1.2, warm: 1.0,
    chandelier: 3, organ: true, balcony: 3, panels: true, gold: true, backdrop: 0x5a3420 },
};

/* ---------------------------------------------------------
 * 曲データ
 *   曲を追加するときは SONG_LIBRARY に1件追加するだけでよい。
 *   genre: 'orchestral'（管弦楽曲：序曲・前奏曲・交響詩・組曲など）
 *          'symphony'  （交響曲）
 * フィールド:
 *   id, title, composer, year, duration(分), difficulty(0-100),
 *   popularity(1-5), mood, description,
 *   strings: {Vn1,Vn2,Va,Vc,Cb} 弦五部の必要人数（null=弦なし）
 *   winds:   {Fl,Ob,Cl,Fg,Hr,Tp,Tb,Tuba,Perc} 管打の必要人数（打楽器はティンパニを含めて Perc）
 * --------------------------------------------------------- */
const S_SMALL  = { Vn1: 6, Vn2: 5, Va: 4, Vc: 4, Cb: 2 };
const S_MID    = { Vn1: 8, Vn2: 7, Va: 5, Vc: 5, Cb: 3 };
const S_LARGE  = { Vn1: 10, Vn2: 9, Va: 7, Vc: 6, Cb: 5 };
const W_CLASS  = { Fl: 2, Ob: 2, Cl: 2, Fg: 2, Hr: 2, Tp: 2, Perc: 1 };

const GENRES = [
  { id: 'orchestral', name: '管弦楽曲' },
  { id: 'symphony',   name: '交響曲' },
];
const SONG_LIBRARY = [
  // ---- 管弦楽曲 ----
    { id: 'egmont', genre: 'orchestral', title: '序曲「エグモント」', composer: 'ベートーヴェン', year: 1810, duration: 9, difficulty: 48, popularity: 4, mood: '劇的',
      description: '圧政に抗う英雄を描いた劇付随音楽の序曲。重い序奏から勝利の終結へ駆け上がる。', strings: S_SMALL, winds: { ...W_CLASS } },
    { id: 'figaro', genre: 'orchestral', title: '歌劇「フィガロの結婚」序曲', composer: 'モーツァルト', year: 1786, duration: 4, difficulty: 45, popularity: 5, mood: '軽快',
      description: '囁くような弦の走句で始まる快活な序曲。短いが音の粒を揃えるのは意外に難しい。', strings: S_SMALL, winds: { ...W_CLASS } },
    { id: 'tell', genre: 'orchestral', title: '歌劇「ウィリアム・テル」序曲', composer: 'ロッシーニ', year: 1829, duration: 12, difficulty: 58, popularity: 5, mood: '華麗',
      description: 'チェロ独奏の夜明け、嵐、牧歌、そして有名な行進へ。場面転換が多彩な序曲。', strings: S_SMALL, winds: { Fl: 2, Ob: 2, Cl: 2, Fg: 2, Hr: 4, Tp: 2, Tb: 3, Perc: 3 } },
    { id: 'ruslan', genre: 'orchestral', title: '歌劇「ルスランとリュドミラ」序曲', composer: 'グリンカ', year: 1842, duration: 5, difficulty: 66, popularity: 4, mood: '華麗',
      description: '猛烈な速さで弦が駆け抜ける序曲。指揮者もテンポ設定に腕を問われる難所揃い。', strings: S_SMALL, winds: { Fl: 2, Ob: 2, Cl: 2, Fg: 2, Hr: 4, Tp: 2, Tb: 3, Perc: 1 } },
    { id: 'academic', genre: 'orchestral', title: '大学祝典序曲', composer: 'ブラームス', year: 1880, duration: 10, difficulty: 57, popularity: 4, mood: '祝祭',
      description: '学生歌を織り込んだ明るい祝典序曲。終盤の「ガウデアムス」は堂々たる響き。', strings: S_MID, winds: { Fl: 3, Ob: 2, Cl: 2, Fg: 3, Hr: 4, Tp: 3, Tb: 3, Tuba: 1, Perc: 4 } },
    { id: 'meister', genre: 'orchestral', title: '楽劇「ニュルンベルクのマイスタージンガー」前奏曲', composer: 'ワーグナー', year: 1868, duration: 10, difficulty: 64, popularity: 4, mood: '壮麗',
      description: '複数の主題が重なり合う壮麗な前奏曲。厚い響きの中で各声部を聴かせる力が要る。', strings: S_MID, winds: { Fl: 3, Ob: 2, Cl: 2, Fg: 2, Hr: 4, Tp: 3, Tb: 3, Tuba: 1, Perc: 2 } },
    { id: 'freischutz', genre: 'orchestral', title: '歌劇「魔弾の射手」序曲', composer: 'ウェーバー', year: 1821, duration: 10, difficulty: 52, popularity: 3, mood: 'ロマン的',
      description: '4本のホルンによる森の情景で知られる序曲。ドイツ・ロマン派オペラの幕開け。', strings: S_SMALL, winds: { Fl: 2, Ob: 2, Cl: 2, Fg: 2, Hr: 4, Tp: 2, Tb: 3, Perc: 1 } },
    { id: 'hebrides', genre: 'orchestral', title: '序曲「フィンガルの洞窟」', composer: 'メンデルスゾーン', year: 1830, duration: 10, difficulty: 55, popularity: 3, mood: '叙景',
      description: 'スコットランドの海と洞窟の印象を描いた演奏会用序曲。波のうねりを弦で表す。', strings: S_SMALL, winds: { ...W_CLASS } },
    { id: 'vltava', genre: 'orchestral', title: '交響詩「モルダウ」', composer: 'スメタナ', year: 1874, duration: 12, difficulty: 60, popularity: 5, mood: '叙景',
      description: '源流から大河へ成長する川の旅。フルートの水音に始まり、雄大な主題が流れる。', strings: S_MID, winds: { Fl: 2, Ob: 2, Cl: 2, Fg: 2, Hr: 4, Tp: 2, Tb: 3, Tuba: 1, Perc: 2 } },
    { id: 'carnival', genre: 'orchestral', title: '序曲「謝肉祭」', composer: 'ドヴォルザーク', year: 1891, duration: 9, difficulty: 65, popularity: 3, mood: '祝祭',
      description: 'タンバリンやトライアングルが彩る熱狂的な序曲。中間部の静けさとの対比が鍵。', strings: S_MID, winds: { Fl: 2, Ob: 2, Cl: 2, Fg: 2, Hr: 4, Tp: 2, Tb: 3, Tuba: 1, Perc: 4 } },
    { id: 'finlandia', genre: 'orchestral', title: '交響詩「フィンランディア」', composer: 'シベリウス', year: 1900, duration: 8, difficulty: 45, popularity: 5, mood: '壮麗',
      description: '重苦しい金管の序奏から祖国への賛歌へ。中間部の讃歌は単独でも愛唱される。', strings: S_SMALL, winds: { Fl: 2, Ob: 2, Cl: 2, Fg: 2, Hr: 4, Tp: 3, Tb: 3, Tuba: 1, Perc: 3 } },
    { id: 'peergynt', genre: 'orchestral', title: '「ペール・ギュント」第1組曲', composer: 'グリーグ', year: 1888, duration: 15, difficulty: 42, popularity: 5, mood: '叙情',
      description: '「朝」「オーセの死」「アニトラの踊り」「山の魔王の宮殿にて」の4曲。親しみやすい名曲集。', strings: S_SMALL, winds: { Fl: 2, Ob: 2, Cl: 2, Fg: 2, Hr: 4, Tp: 2, Tb: 3, Tuba: 1, Perc: 2 } },
    { id: 'arlesienne', genre: 'orchestral', title: '「アルルの女」第2組曲', composer: 'ビゼー（ギロー編）', year: 1879, duration: 17, difficulty: 50, popularity: 4, mood: '叙情',
      description: '南仏の情景を描く4曲。フルートの「メヌエット」と熱い「ファランドール」で知られる。', strings: S_SMALL, winds: { Fl: 2, Ob: 2, Cl: 2, Fg: 2, Hr: 4, Tp: 2, Tb: 3, Perc: 3 } },
    { id: 'baldmtn', genre: 'orchestral', title: '交響詩「禿山の一夜」', composer: 'ムソルグスキー（R=コルサコフ編）', year: 1886, duration: 11, difficulty: 62, popularity: 4, mood: '劇的',
      description: '魔物たちの饗宴が夜明けの鐘で退散する幻想的な音詩。金管の咆哮が聴きどころ。', strings: S_MID, winds: { Fl: 3, Ob: 2, Cl: 2, Fg: 2, Hr: 4, Tp: 2, Tb: 3, Tuba: 1, Perc: 4 } },
    { id: 'steppes', genre: 'orchestral', title: '中央アジアの草原にて', composer: 'ボロディン', year: 1880, duration: 7, difficulty: 40, popularity: 3, mood: '叙景',
      description: '草原を行く隊商の情景。ロシアと東洋の二つの旋律が重なり、遠ざかっていく。', strings: S_SMALL, winds: { Fl: 2, Ob: 2, Cl: 2, Fg: 2, Hr: 4, Tp: 2, Tb: 3, Perc: 1 } },
    { id: 'romeo', genre: 'orchestral', title: '幻想序曲「ロメオとジュリエット」', composer: 'チャイコフスキー', year: 1880, duration: 20, difficulty: 70, popularity: 4, mood: '劇的',
      description: '争いの激しさと愛の主題の甘美さ。悲劇を凝縮したドラマティックな音楽。', strings: S_MID, winds: { Fl: 3, Ob: 2, Cl: 2, Fg: 2, Hr: 4, Tp: 2, Tb: 3, Tuba: 1, Perc: 2 } },
    { id: 'serenade', genre: 'orchestral', title: '弦楽セレナード', composer: 'チャイコフスキー', year: 1880, duration: 30, difficulty: 63, popularity: 4, mood: '叙情',
      description: '弦楽合奏のための4楽章。冒頭の重厚な和音と優美なワルツで知られる。管打楽器は不要。', strings: S_MID, winds: {} },
    { id: 'enigma', genre: 'orchestral', title: 'エニグマ変奏曲', composer: 'エルガー', year: 1899, duration: 30, difficulty: 66, popularity: 3, mood: '叙情',
      description: '友人たちの肖像を描いた変奏曲。第9変奏「ニムロッド」は特に有名。', strings: S_MID, winds: { Fl: 2, Ob: 2, Cl: 2, Fg: 3, Hr: 4, Tp: 3, Tb: 3, Tuba: 1, Perc: 4 } },
    { id: 'bolero', genre: 'orchestral', title: 'ボレロ', composer: 'ラヴェル', year: 1928, duration: 15, difficulty: 68, popularity: 5, mood: '高揚',
      description: '同じリズムと旋律を楽器を替えて繰り返す。管楽器のソロが次々と試され、小太鼓は一瞬も気を抜けない。', strings: S_MID, winds: { Fl: 3, Ob: 3, Cl: 3, Fg: 3, Hr: 4, Tp: 4, Tb: 3, Tuba: 1, Perc: 4 } },
    { id: 'faune', genre: 'orchestral', title: '牧神の午後への前奏曲', composer: 'ドビュッシー', year: 1894, duration: 10, difficulty: 72, popularity: 4, mood: '幻想',
      description: 'フルート独奏の気だるい旋律で始まる印象派の傑作。繊細な音色の制御が要求される。', strings: S_MID, winds: { Fl: 3, Ob: 2, Cl: 2, Fg: 2, Hr: 4, Perc: 1 } },
    { id: 'macabre', genre: 'orchestral', title: '交響詩「死の舞踏」', composer: 'サン＝サーンス', year: 1874, duration: 7, difficulty: 55, popularity: 4, mood: '幻想',
      description: '真夜中に骸骨たちが踊り出す。シロフォンの骨の音と独奏ヴァイオリンが印象的。', strings: S_SMALL, winds: { Fl: 2, Ob: 2, Cl: 2, Fg: 2, Hr: 4, Tp: 2, Tb: 3, Tuba: 1, Perc: 4 } },
    { id: 'hungarian5', genre: 'orchestral', title: 'ハンガリー舞曲 第5番', composer: 'ブラームス', year: 1869, duration: 3, difficulty: 35, popularity: 5, mood: '軽快',
      description: '緩急自在のテンポ変化が楽しい舞曲。アンコールの定番。', strings: S_SMALL, winds: { Fl: 2, Ob: 2, Cl: 2, Fg: 2, Hr: 4, Tp: 2, Perc: 2 } },
    { id: 'pomp1', genre: 'orchestral', title: '行進曲「威風堂々」第1番', composer: 'エルガー', year: 1901, duration: 6, difficulty: 46, popularity: 5, mood: '祝祭',
      description: '躍動的な主部と、広く歌われる気高いトリオ。祝典の定番曲。', strings: S_MID, winds: { Fl: 2, Ob: 2, Cl: 2, Fg: 2, Hr: 4, Tp: 2, Tb: 3, Tuba: 1, Perc: 4 } },
    { id: 'fledermaus', genre: 'orchestral', title: '喜歌劇「こうもり」序曲', composer: 'J.シュトラウス2世', year: 1874, duration: 9, difficulty: 55, popularity: 4, mood: '軽快',
      description: 'ウィンナ・ワルツの粋が詰まった序曲。独特の揺れるリズムをどう表現するかが問われる。', strings: S_SMALL, winds: { Fl: 2, Ob: 2, Cl: 2, Fg: 2, Hr: 4, Tp: 2, Tb: 1, Perc: 3 } },
    { id: 'cavalleria', genre: 'orchestral', title: '「カヴァレリア・ルスティカーナ」間奏曲', composer: 'マスカーニ', year: 1890, duration: 4, difficulty: 30, popularity: 4, mood: '叙情',
      description: '祈りのように静かに歌う弦の旋律。短く美しい名旋律。', strings: S_SMALL, winds: { Fl: 2, Ob: 2, Cl: 2, Fg: 2, Hr: 2 } },
    { id: 'air', genre: 'orchestral', title: 'G線上のアリア', composer: 'J.S.バッハ', year: 1730, duration: 5, difficulty: 25, popularity: 5, mood: '叙情',
      description: '管弦楽組曲第3番のアリア。弦楽のみで静かに奏でられる。', strings: S_SMALL, winds: {} },
    { id: 'rosamunde', genre: 'orchestral', title: '「ロザムンデ」序曲', composer: 'シューベルト', year: 1820, duration: 10, difficulty: 47, popularity: 3, mood: '叙情',
      description: '歌心あふれる旋律が次々と現れる序曲。軽やかさと品の良さが求められる。', strings: S_SMALL, winds: { ...W_CLASS, Hr: 4, Tb: 3 } },
    { id: 'hansel', genre: 'orchestral', title: '歌劇「ヘンゼルとグレーテル」前奏曲', composer: 'フンパーディンク', year: 1893, duration: 8, difficulty: 50, popularity: 3, mood: '幻想',
      description: 'ホルンの祈りの歌に始まる温かな前奏曲。重なり合う声部をまとめる力が要る。', strings: S_MID, winds: { Fl: 2, Ob: 2, Cl: 2, Fg: 2, Hr: 4, Tp: 2, Tb: 3, Tuba: 1, Perc: 2 } },
    { id: 'adagio', genre: 'orchestral', title: '弦楽のためのアダージョ', composer: 'バーバー', year: 1936, duration: 8, difficulty: 55, popularity: 4, mood: '悲歌',
      description: '息の長い旋律が頂点へと高まる弦楽の哀歌。弦のみの編成。', strings: S_MID, winds: {} },
  // ---- 交響曲 ----
    { id: 'beet5', genre: 'symphony', title: '交響曲第5番 ハ短調「運命」', composer: 'ベートーヴェン', year: 1808, duration: 33, difficulty: 68, popularity: 5, mood: '劇的',
      description: '4つの音の動機で全曲を構築した革新的交響曲。暗から明への劇的な展開。', strings: S_MID, winds: { Fl: 3, Ob: 2, Cl: 2, Fg: 3, Hr: 2, Tp: 2, Tb: 3, Perc: 1 } },
    { id: 'beet7', genre: 'symphony', title: '交響曲第7番 イ長調', composer: 'ベートーヴェン', year: 1812, duration: 38, difficulty: 70, popularity: 5, mood: '高揚',
      description: '全楽章をリズムが支配する「舞踏の神化」。終楽章の熱狂は持久力が勝負。', strings: S_MID, winds: { ...W_CLASS } },
    { id: 'beet3', genre: 'symphony', title: '交響曲第3番 変ホ長調「英雄」', composer: 'ベートーヴェン', year: 1804, duration: 48, difficulty: 72, popularity: 4, mood: '壮麗',
      description: '交響曲の規模を一気に拡大した記念碑。葬送行進曲を含む堂々たる4楽章。', strings: S_MID, winds: { ...W_CLASS, Hr: 3 } },
    { id: 'mozart41', genre: 'symphony', title: '交響曲第41番 ハ長調「ジュピター」', composer: 'モーツァルト', year: 1788, duration: 32, difficulty: 60, popularity: 4, mood: '壮麗',
      description: 'モーツァルト最後の交響曲。終楽章では5つの主題が見事な対位法で結合する。', strings: S_SMALL, winds: { Fl: 1, Ob: 2, Fg: 2, Hr: 2, Tp: 2, Perc: 1 } },
    { id: 'schubert8', genre: 'symphony', title: '交響曲第7（8）番 ロ短調「未完成」', composer: 'シューベルト', year: 1822, duration: 25, difficulty: 58, popularity: 4, mood: '叙情',
      description: '2楽章のみが残された神秘的な交響曲。低弦の暗い開始から深い叙情が広がる。', strings: S_SMALL, winds: { ...W_CLASS, Tb: 3 } },
    { id: 'mendel4', genre: 'symphony', title: '交響曲第4番 イ長調「イタリア」', composer: 'メンデルスゾーン', year: 1833, duration: 28, difficulty: 62, popularity: 4, mood: '軽快',
      description: '南国の陽光を思わせる明るい交響曲。終楽章のサルタレッロは息つく暇もない。', strings: S_SMALL, winds: { ...W_CLASS } },
    { id: 'brahms1', genre: 'symphony', title: '交響曲第1番 ハ短調', composer: 'ブラームス', year: 1876, duration: 46, difficulty: 78, popularity: 5, mood: '壮麗',
      description: '構想20年余りの末に完成した重厚な交響曲。苦悩から歓喜へ至る長大なドラマ。', strings: S_LARGE, winds: { Fl: 2, Ob: 2, Cl: 2, Fg: 3, Hr: 4, Tp: 2, Tb: 3, Perc: 1 } },
    { id: 'dvorak9', genre: 'symphony', title: '交響曲第9番 ホ短調「新世界より」', composer: 'ドヴォルザーク', year: 1893, duration: 42, difficulty: 66, popularity: 5, mood: '叙情',
      description: 'アメリカ滞在中に書かれた人気作。イングリッシュホルンの「家路」の旋律が有名。', strings: S_MID, winds: { Fl: 2, Ob: 2, Cl: 2, Fg: 2, Hr: 4, Tp: 2, Tb: 3, Tuba: 1, Perc: 2 } },
    { id: 'tchai5', genre: 'symphony', title: '交響曲第5番 ホ短調', composer: 'チャイコフスキー', year: 1888, duration: 48, difficulty: 74, popularity: 4, mood: '高揚',
      description: '運命の主題が全楽章を貫き、最後は凱歌となる。第2楽章のホルン独奏は難所。', strings: S_MID, winds: { Fl: 3, Ob: 2, Cl: 2, Fg: 2, Hr: 4, Tp: 2, Tb: 3, Tuba: 1, Perc: 1 } },
    { id: 'tchai6', genre: 'symphony', title: '交響曲第6番 ロ短調「悲愴」', composer: 'チャイコフスキー', year: 1893, duration: 46, difficulty: 82, popularity: 5, mood: '悲歌',
      description: '静かに消えゆく終楽章で閉じる異例の交響曲。極端な強弱幅の制御が求められる。', strings: S_LARGE, winds: { Fl: 3, Ob: 2, Cl: 2, Fg: 2, Hr: 4, Tp: 2, Tb: 3, Tuba: 1, Perc: 3 } },
    { id: 'sibelius2', genre: 'symphony', title: '交響曲第2番 ニ長調', composer: 'シベリウス', year: 1902, duration: 44, difficulty: 75, popularity: 4, mood: '壮麗',
      description: '北欧の自然と民族の高揚を感じさせる交響曲。長い上昇の末の終楽章は圧巻。', strings: S_MID, winds: { Fl: 2, Ob: 2, Cl: 2, Fg: 2, Hr: 4, Tp: 3, Tb: 3, Tuba: 1, Perc: 1 } },
    { id: 'rach2', genre: 'symphony', title: '交響曲第2番 ホ短調', composer: 'ラフマニノフ', year: 1907, duration: 60, difficulty: 84, popularity: 4, mood: 'ロマン的',
      description: '甘美な旋律が尽きることなく溢れる大曲。第3楽章のクラリネット独奏が白眉。', strings: S_LARGE, winds: { Fl: 3, Ob: 3, Cl: 3, Fg: 3, Hr: 4, Tp: 3, Tb: 3, Tuba: 1, Perc: 4 } },
    { id: 'fantastique', genre: 'symphony', title: '幻想交響曲', composer: 'ベルリオーズ', year: 1830, duration: 50, difficulty: 86, popularity: 4, mood: '幻想',
      description: '恋に破れた芸術家の幻覚を描く標題交響曲。4人の奏者によるティンパニなど型破りな管弦楽法。', strings: S_LARGE, winds: { Fl: 2, Ob: 2, Cl: 2, Fg: 4, Hr: 4, Tp: 4, Tb: 3, Tuba: 2, Perc: 5 } },
    { id: 'mahler1', genre: 'symphony', title: '交響曲第1番 ニ長調「巨人」', composer: 'マーラー', year: 1888, duration: 55, difficulty: 88, popularity: 4, mood: '高揚',
      description: '自然の目覚めから勝利の終結まで。7本のホルンが起立して吹く終結部は大編成ならでは。', strings: S_LARGE, winds: { Fl: 4, Ob: 4, Cl: 4, Fg: 3, Hr: 7, Tp: 4, Tb: 3, Tuba: 1, Perc: 5 } },
  ];
