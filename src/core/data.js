/* =========================================================
 * DATA — ゲームの定義データ
 *   ・編集用のデータ（曲・楽器・名前・固有キャラクター・指揮者の個性・ホール・クイズ・練習イベント）は
 *     data/ フォルダのJSONにあり、build.py が検証して GAME_DATA としてゲームに埋め込む。
 *     ここでは GAME_DATA を、ゲーム内で使う形（従来と同じ定数名）に整える。
 *   ・能力の種類や練習の重点項目など、計算式と一体の定義はプログラム側（このファイル）に置く。
 * ========================================================= */
const GD = (key) => { if (!GAME_DATA[key]) throw new Error(`データ ${key}.json がありません`); return GAME_DATA[key]; };
const hexColor = v => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? parseInt(v.slice(1), 16) : v;
const colorsOf = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, hexColor(v)]));

// 楽器・セクション（data/members/instruments.json）
const INSTRUMENTS = GD('members/instruments').instruments.map(i => ({ id: i.id, abbr: i.abbr, section: i.section, cap: i.cap, std: i.std, kind: i.kind, name: i.name }));
const INST = Object.fromEntries(INSTRUMENTS.map(i => [i.id, i]));
const INST_NAME = Object.fromEntries(INSTRUMENTS.map(i => [i.id, i.name || i.abbr]));

const SECTIONS = GD('members/instruments').sections.map(s => ({ id: s.id, name: s.name, insts: s.instruments }));
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

// 名前の候補（data/members/names.json）
const NAME_FAMILY = GD('members/names').family;
const NAME_GIVEN = GD('members/names').given;

// オリジナルキャラクター（data/members/originals.json：固定の個性・能力構成）
// abilities / potential は 7能力の順: tech, ear, rhythm, tone, dyn, expr, coop
const ORIGINAL_CHARACTERS = GD('members/originals').members;

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
const FEMININE_GIVEN = new Set(GD('members/names').feminineGiven);

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
// 指揮者の個性（data/members/personalities.json）
const CONDUCTOR_TRAITS = GD('members/personalities').conductorTraits;
const CTRAIT = Object.fromEntries(CONDUCTOR_TRAITS.map(t => [t.id, t]));
// 固有の指揮者（data/members/originals.json）。abilities / potential は lead, interp, baton, charisma の順
const ORIGINAL_CONDUCTORS = GD('members/originals').conductors;

/* ---------------------------------------------------------
 * ホール（data/halls/index.json）
 *   CONFIG.halls：使用料・席数・音響・ホール練習料金などのゲーム上の値
 *   HALL_VISUALS：3Dの内装（w/d/h: 客席部分の幅・奥行・天井高  rows×cols: 3D上の客席数）
 *   PRACTICE_ROOM：通常練習を行う練習室（3Dの内装）
 * --------------------------------------------------------- */
CONFIG.halls = GD('halls/index').halls.map(h => { const { visual, ...rest } = h; return rest; });
const HALL_VISUALS = Object.fromEntries(GD('halls/index').halls.map(h => [h.id, colorsOf(h.visual)]));
const PRACTICE_ROOM = { ...GD('halls/index').practiceRoom, visual: colorsOf(GD('halls/index').practiceRoom.visual) };

/* ---------------------------------------------------------
 * 曲データ（data/songs/orchestral.json・symphonies.json）
 *   ファイルの genre が曲のジャンルになる（'orchestral' 管弦楽曲／'symphony' 交響曲）
 * フィールド:
 *   id, title, composer, year, duration(分), difficulty(0-100),
 *   popularity(1-5), mood, description,
 *   strings: {Vn1,Vn2,Va,Vc,Cb} 弦五部の必要人数（null=弦なし）
 *   winds:   {Fl,Ob,Cl,Fg,Hr,Tp,Tb,Tuba,Perc} 管打の必要人数（打楽器はティンパニを含めて Perc）
 * --------------------------------------------------------- */
const SONG_FILES = ['songs/orchestral', 'songs/symphonies'].map(GD);
const GENRES = SONG_FILES.map(f => ({ id: f.genre, name: f.genreName }));
const SONG_LIBRARY = SONG_FILES.flatMap(f => f.songs.map(s => ({ ...s, genre: f.genre, strings: s.strings ? { ...s.strings } : null, winds: { ...(s.winds || {}) } })));

/* ---------------------------------------------------------
 * 練習クイズ（data/quizzes/*.json）
 *   QUIZ_SONG[曲ID] / QUIZ_COMPOSER[作曲家ID] / QUIZ_GENERAL（楽器＋一般）
 *   1問 = { id, k: 分類, q: 問題文, c: [選択肢4つ（先頭が正解に並べ直す）], e: 解説 }
 * --------------------------------------------------------- */
const quizItem = x => ({ id: x.id, k: x.category, q: x.question, c: [x.answer, ...x.choices.filter(c => c !== x.answer)], e: x.explanation });
const QUIZ_CATS = GD('quizzes/general').categories;
const QUIZ_SONG = Object.fromEntries(Object.entries(GD('quizzes/songs').questions).map(([sid, qs]) => [sid, qs.map(quizItem)]));
const QUIZ_COMPOSER = Object.fromEntries(GD('quizzes/composers').composers.map(c => [c.id, { name: c.name, songs: c.songs, qs: c.questions.map(quizItem) }]));
const QUIZ_GENERAL = [...GD('quizzes/instruments').questions, ...GD('quizzes/general').questions].map(quizItem);

/* ---------------------------------------------------------
 * 練習のランダムイベント（data/events/practice.json）
 * --------------------------------------------------------- */
const PRACTICE_EVENT_DATA = GD('events/practice');
