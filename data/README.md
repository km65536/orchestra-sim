# ゲームデータの編集ガイド

曲・団員・クイズ・ホール・練習イベントは、すべてこの `data/` フォルダの JSON ファイルで管理しています。
**プログラム（`src/`）を変更しなくても、JSON を書き換えて `python3 build.py` を実行するだけで**ゲームに反映されます。

```
data/
├── songs/
│   ├── orchestral.json      管弦楽曲（序曲・交響詩・組曲など）
│   └── symphonies.json      交響曲
├── members/
│   ├── names.json           新しく募集する団員の名前候補（姓・名）
│   ├── instruments.json     セクションと楽器（在籍上限・初期人数・表示名）
│   ├── personalities.json   指揮者の個性（性格）
│   └── originals.json       固有キャラクター（団員・指揮者）
├── quizzes/
│   ├── songs.json           曲ごとの問題
│   ├── composers.json       作曲家ごとの問題（どの曲の練習で出すか）
│   ├── instruments.json     楽器・楽器編成の問題
│   └── general.json         音楽史・用語・楽典の問題と、問題の分類名
├── halls/
│   └── index.json           ホール一覧（料金・席数・音響・3Dの内装）と練習室
└── events/
    └── practice.json        練習中のランダムイベントと、練習中のひとこと
```

## 編集の手順

1. JSON ファイルを編集する（文字コードは UTF-8）。
2. `python3 build.py --check` でデータだけを検証する。
3. `python3 build.py` で `dist/index.html` を作り直す。

書き方に誤りがあるときは、ビルドが止まり、次のように**ファイル名と項目の場所**が表示されます（`dist` は更新されません）。

```
  ✗ data/quizzes/general.json  questions[0].choices: 選択肢は4つにしてください（今は3つ）
  ✗ data/songs/symphonies.json  songs[0].winds.Sax: 楽器 "Sax" は data/members/instruments.json にありません
```

`questions[0]` は「questions の 1 番目」、`songs[2]` は「songs の 3 番目」です（0 から数えます）。

各ファイルの先頭にある `"_説明"` は説明用のメモで、ゲームでは使いません。

> **ID は変更しないでください。** 曲・楽器・ホール・問題・固有キャラクターの `id`（`oid`）はセーブデータに保存されています。
> 変更すると、保存済みのデータと結び付かなくなります。新しく追加するのは自由です。

---

## 曲を追加・変更する（`songs/orchestral.json`・`songs/symphonies.json`）

交響曲は `symphonies.json`、それ以外の管弦楽曲は `orchestral.json` の `songs` に追加します。ジャンルはファイルで決まります。

```json
{
  "id": "radetzky",
  "title": "ラデツキー行進曲",
  "composer": "J.シュトラウス1世",
  "year": 1848,
  "duration": 3,
  "difficulty": 30,
  "popularity": 5,
  "mood": "祝祭",
  "description": "選曲画面に表示される紹介文。",
  "strings": {"Vn1": 6, "Vn2": 5, "Va": 4, "Vc": 4, "Cb": 2},
  "winds": {"Fl": 2, "Ob": 2, "Cl": 2, "Fg": 2, "Hr": 2, "Tp": 2, "Perc": 2}
}
```

| 項目 | 内容 |
|---|---|
| `id` | 半角の英小文字・数字・`_`。他の曲と重複しないこと |
| `difficulty` | 0〜100。成功率や練習効果に影響する |
| `popularity` | 1〜5。集客に影響する |
| `duration` | 演奏時間（分）。集客に影響する |
| `strings` / `winds` | 必要な人数。楽器 ID は `members/instruments.json` のもの。不要な楽器は書かない（弦楽合奏なら `"winds": {}`） |

その曲のクイズを出したいときは、`quizzes/songs.json` に問題を追加します。作曲家の問題も出したいときは、`quizzes/composers.json` の該当作曲家の `songs` に曲 ID を追加します。

## 団員の名前（`members/names.json`）

- `family`：姓の候補。
- `given`：名の候補。
- `feminineGiven`：`given` のうち、衣装の初期傾向をドレス寄りにする名前。

新しく募集する団員は、`family` と `given` の組み合わせで名前が付きます。すでに在籍している団員の名前は変わりません。

## 楽器・セクション（`members/instruments.json`）

- `instruments[].name`：団員タブなどに表示する楽器名。
- `abbr`：略称。
- `cap`：在籍上限。
- `std`：新規ゲーム開始時の人数。

楽器 ID（`Vn1` など）は、セーブデータ・曲の編成・3D モデルで使われているため変更しないでください。

## 性格・固有キャラクター（`members/personalities.json`・`members/originals.json`）

**指揮者の個性（`personalities.json` の `conductorTraits`）**

- `policy`：得意な本番方針（`stable` / `express` / `dynamics` / `balance`）。
- `practice`：全体合奏の練習効果の倍率。
- `name`・`desc`：表示名と説明文。自由に変更できます。

**固有キャラクター（`originals.json`）**

- `abilities` / `potential`：能力値と潜在能力。
  - 団員は `[技術, 音感, リズム, 音色, 強弱, 表現, 協調]` の 7 つ。
  - 指揮者は `[統率, 解釈, 技術, カリスマ]` の 4 つ。
- `initial: true`：最初から在籍する団員。それ以外は `cost`（採用費）を書きます。
- `founder: true`：創設時の指揮者（1 人だけ）。
- `look`：3D の見た目（髪型・色などの番号）。

---

## クイズ（`quizzes/*.json`）

1 問の書き方（4 ファイル共通）：

```json
{
  "id": "radetzky_1",
  "category": "trivia",
  "question": "問題文",
  "answer": "正解の選択肢",
  "choices": ["選択肢1", "正解の選択肢", "選択肢3", "選択肢4"],
  "explanation": "回答後に表示する解説"
}
```

- `id`：全ファイルを通して重複しないこと。出題履歴として保存されるので、一度使った ID は変えないでください。
- `choices`：ちょうど 4 つ。並び順は自由で、出題時にゲームが並べ替えます。
- `answer`：`choices` のどれか 1 つと**完全に同じ文字列**にします。
- `category`：`general.json` の `categories` にある分類（`life` 作曲家の生涯 / `bg` 作曲の背景 / `form` 曲の構成・特徴 / `orch` 楽器編成 / `hist` 音楽史・様式 / `term` 音楽用語 / `theory` 楽典 / `trivia` 豆知識）。

| ファイル | 出題される場面 |
|---|---|
| `songs.json` | `"questions"` の中の曲 ID ごとの配列。その曲の練習中に**最優先**で出題 |
| `composers.json` | 作曲家ごと。`songs` に書いた曲の練習中に、曲の問題を出し終えたあとで出題 |
| `instruments.json` / `general.json` | どの曲でも、上の 2 つを出し終えたあとで出題 |

問題を削除すると、その問題は出題されなくなります。出題履歴に残った ID は自動的に無視されます。

## ホール（`halls/index.json`）

| 項目 | 内容 |
|---|---|
| `fee` | 予約時に払う使用料 |
| `rehearsalFee` | 本番準備でホール練習をするときの料金。実施したときに支払う |
| `capacity` | 席数 |
| `ticket` | チケット単価 |
| `acoustics` | 音響（0〜100） |
| `stage` | 舞台に乗る最大人数 |
| `attendance` / `repSens` | 基本集客率 / 評判 1 あたりの集客率の上がり方 |
| `pressure` | 一流会場の重圧（ホール練習で解消） |
| `prestige` | 評判の増減の倍率 |
| `visual` | 3D の内装。`w` / `d` / `h` は広さと天井高、`rows` × `cols` は客席数、色は `"#RRGGBB"`、`chandelier`・`organ`・`balcony` は装飾 |

`practiceRoom` は、通常練習（全体合奏・セクション練習・個人練習）を行う練習室の 3D 内装です（`windows` 窓の数、`whiteboard`、`piano` など）。

## 練習中のランダムイベント（`events/practice.json`）

- `settings.chance`：1 回の練習でイベントが起きる確率（0〜1）。
- `settings.timingFrom` / `timingTo`：練習時間のどのあたりで起きるか。
- `events[]`：イベント 1 件ごとに次の項目を書きます。
  - `title`：イベント名。
  - `text`：イベントの文章。
  - `speaker`：話す人（`conductor` 指揮者 / `principal` 首席 / `member` 団員）。
  - `target`：対象の選び方（下の表）。
  - `requires`：起きる条件（下の表）。
  - `weight.base`：起きやすさ。`perDifficulty`（曲の難易度ごと）、`perPracticeDone`（練習回数ごと）を足すこともできます。
  - `choices`：選択肢（1〜4 つ）。選択肢のないイベントは代わりに `auto` を書きます。
- 選択肢は次の項目で書きます。
  - `label`：ボタンの文字。
  - `hint`：結果の目安。
  - `effect`：効果（下の表）。
  - `note`：練習報告に残る一言。
  - `{"preset": "keep"}`（今の練習を続ける）・`{"preset": "stop"}`（今日はここまで）で、`choicePresets` の定型を使えます。項目を書き足すと上書きできます。

**効果（`effect`）**

効果はすべて「その回の練習の成果」に対する補正です。

| 書き方 | 効果 |
|---|---|
| `"focus": 1.25` | 対象セクションの成果を 1.25 倍 |
| `"others": 0.96` | ほかのセクションを 0.96 倍 |
| `"all": 0.9` | すべて 0.9 倍 |
| `"overall": {"balance": 0.8}` | `ensemble` / `balance` / `unity` に加算 |
| `"mastery": {"comp": 0.6}` | `comp` 楽曲完成度 / `underst` 楽曲理解度に加算 |
| `"stop": true` | 練習を早めに切り上げる |

**文章の中で使える記号**

| 記号 | 置き換わる内容 |
|---|---|
| `{section}` | 対象のセクション名 |
| `{partnerSection}` | `partner` で指定した相手のセクション名 |
| `{song}` | 練習中の曲名 |
| `{conductor}` | 指揮者名 |
| `{member}` | 団員名 |
| `{principal}` | 首席奏者名 |
| `{principalNote}` | `principalNote` の文章（首席がいるときだけ表示） |
| `{place}` | `places` からランダムに 1 つ |
| `{traitFocus}` / `{aim}` | 指揮者の個性ごとの言い回し（`conductorTraitPhrases`） |
| `{concertmaster}` | コンサートマスター名（`commentary` のみ） |
| `{hall}` | ホール練習の会場名（`commentary.hall` のみ） |

**対象の選び方（`target`）**

| 値 | 選ばれる対象 |
|---|---|
| `none` | 対象なし |
| `weakestSection` | いちばん仕上がりが遅れているセクション |
| `principalSection` | 首席がいる練習中のセクション |
| `harmoniousSection` | 協調性の高いセクション |
| `strugglingMember` | 技術に不安のある団員 |
| `randomMember` | 練習中の団員から無作為に 1 人 |

**起きる条件（`requires`）**

| 値 | 条件 |
|---|---|
| `conductor` | 指揮者がいる |
| `practicedSection` | 成果の出たセクションがある |
| `principalSection` | 首席がいる練習中のセクションがある |
| `members` | 対象の団員がいる |
| `individual` | 個人練習のとき |
| `notIndividual` | 個人練習以外のとき |

`commentary` は練習中に約 3 秒ごとに表示されるひとことです（`tutti` / `section` / `individual` / `hall`。`hall` はホール練習用で省略可）。`{"text": ..., "fallback": ...}` の形で書くと、記号に当てはまる人がいないときに `fallback` が使われます。
