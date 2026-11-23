"""楽団運営記のビルド：src/ のプログラムと data/ のJSONを検証・結合して dist/index.html（1ファイルで動作）を生成する。

使い方:  python3 build.py            … 検証してビルド
         python3 build.py --check    … データの検証だけ行う（dist は作らない）

  1. src/files.json に書かれた順でプログラム（JS）とCSSを読み込む
  2. data/ フォルダのJSONをすべて読み込む
  3. JSONの構文・必須項目・値の範囲・ID の重複や参照先を検証する
     問題があれば「どのファイルのどの項目か」を表示して終了する（dist は更新しない）
  4. データを GAME_DATA としてプログラムの前に埋め込む
  5. dist/index.html を出力する（Firebase Hosting は dist を公開）
  ※ Python 3 の標準ライブラリだけで動く（Node.js は不要）。
  ※ three.js は別の <script> にして、万一読み込みに失敗してもゲーム本体は動くようにしている。
"""
import json, pathlib, re, sys

root = pathlib.Path(__file__).parent
SRC, DATA = root / 'src', root / 'data'
errors = []


def err(file, path, msg):
    errors.append(f'  ✗ data/{file}  {path}: {msg}' if path else f'  ✗ data/{file}: {msg}')


# ---------------------------------------------------------------- 読み込み
def load_data():
    out = {}
    for f in sorted(DATA.rglob('*.json')):
        key = f.relative_to(DATA).with_suffix('').as_posix()
        try:
            out[key] = json.loads(f.read_text(encoding='utf-8'))
        except json.JSONDecodeError as e:
            err(f'{key}.json', f'{e.lineno}行目 {e.colno}文字目', f'JSONの書き方に誤りがあります（{e.msg}）')
    return out


# ---------------------------------------------------------------- 検証の道具
def need(file, obj, path, key, typ, *, min_=None, max_=None, nonempty=True, optional=False):
    """obj[key] が typ であること（数値の範囲・空でないこと）を確認して値を返す"""
    if not isinstance(obj, dict):
        err(file, path, 'オブジェクト（{...}）である必要があります'); return None
    if key not in obj:
        if not optional: err(file, f'{path}.{key}' if path else key, '項目がありません')
        return None
    v = obj[key]; p = f'{path}.{key}' if path else key
    types = typ if isinstance(typ, tuple) else (typ,)
    if (bool not in types and isinstance(v, bool)) or not isinstance(v, types):
        names = {str: '文字列', int: '整数', float: '数値', list: '配列', dict: 'オブジェクト', bool: 'true/false'}
        err(file, p, f'{"か".join(names[t] for t in types)}である必要があります（今の値: {json.dumps(v, ensure_ascii=False)[:40]}）'); return None
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        if min_ is not None and v < min_: err(file, p, f'{min_} 以上にしてください（今の値: {v}）')
        if max_ is not None and v > max_: err(file, p, f'{max_} 以下にしてください（今の値: {v}）')
    if nonempty and isinstance(v, (str, list)) and len(v) == 0: err(file, p, '空にできません')
    return v


def unique(file, items, path, label='id'):
    seen = {}
    for i, x in enumerate(items):
        if not isinstance(x, dict) or label not in x: continue
        if x[label] in seen: err(file, f'{path}[{i}].{label}', f'"{x[label]}" が {path}[{seen[x[label]]}] と重複しています')
        else: seen[x[label]] = i
    return set(seen)


NUM = (int, float)
COLOR = re.compile(r'^#[0-9a-fA-F]{6}$')


# ---------------------------------------------------------------- 各データの検証
def check_instruments(D):
    f, d = 'members/instruments.json', D.get('members/instruments')
    if d is None: err(f, '', 'ファイルがありません'); return set(), set()
    secs = need(f, d, '', 'sections', list) or []
    insts = need(f, d, '', 'instruments', list) or []
    sec_ids = unique(f, secs, 'sections'); inst_ids = unique(f, insts, 'instruments')
    for i, x in enumerate(insts):
        p = f'instruments[{i}]'
        for k in ('id', 'name', 'abbr'): need(f, x, p, k, str)
        s = need(f, x, p, 'section', str)
        if s is not None and s not in sec_ids: err(f, f'{p}.section', f'セクション "{s}" は sections にありません')
        k = need(f, x, p, 'kind', str)
        if k is not None and k not in ('string', 'wind', 'perc'): err(f, f'{p}.kind', 'string / wind / perc のいずれかにしてください')
        cap = need(f, x, p, 'cap', int, min_=1); std = need(f, x, p, 'std', int, min_=0)
        if isinstance(cap, int) and isinstance(std, int) and std > cap: err(f, f'{p}.std', f'在籍上限 cap（{cap}）以下にしてください')
    for i, s in enumerate(secs):
        p = f'sections[{i}]'; need(f, s, p, 'id', str); need(f, s, p, 'name', str)
        for j, ins in enumerate(need(f, s, p, 'instruments', list) or []):
            if ins not in inst_ids: err(f, f'{p}.instruments[{j}]', f'楽器 "{ins}" は instruments にありません')
    return sec_ids, inst_ids


def check_songs(D, inst_ids):
    ids = {}
    for key in ('songs/orchestral', 'songs/symphonies'):
        f, d = f'{key}.json', D.get(key)
        if d is None: err(f, '', 'ファイルがありません'); continue
        g = need(f, d, '', 'genre', str); need(f, d, '', 'genreName', str)
        if key == 'songs/orchestral' and g not in (None, 'orchestral'): err(f, 'genre', '"orchestral" にしてください')
        if key == 'songs/symphonies' and g not in (None, 'symphony'): err(f, 'genre', '"symphony" にしてください')
        songs = need(f, d, '', 'songs', list) or []
        for i, s in enumerate(songs):
            p = f'songs[{i}]'
            sid = need(f, s, p, 'id', str)
            if isinstance(sid, str):
                if not re.match(r'^[a-z0-9_]+$', sid): err(f, f'{p}.id', '半角の英小文字・数字・_ だけにしてください')
                if sid in ids: err(f, f'{p}.id', f'"{sid}" は {ids[sid]} と重複しています')
                ids[sid] = f'data/{f} {p}'
            for k in ('title', 'composer', 'mood', 'description'): need(f, s, p, k, str)
            need(f, s, p, 'year', int, min_=1000, max_=2100); need(f, s, p, 'duration', NUM, min_=1, max_=180)
            need(f, s, p, 'difficulty', NUM, min_=0, max_=100); need(f, s, p, 'popularity', int, min_=1, max_=5)
            for part in ('strings', 'winds'):
                v = s.get(part) if isinstance(s, dict) else None
                if v is None and part == 'strings': err(f, f'{p}.strings', '弦五部の人数（{"Vn1":6,...}）が必要です'); continue
                if not isinstance(v, dict): err(f, f'{p}.{part}', 'オブジェクト（{"楽器ID": 人数}）にしてください'); continue
                for ins, n in v.items():
                    if ins not in inst_ids: err(f, f'{p}.{part}.{ins}', f'楽器 "{ins}" は data/members/instruments.json にありません')
                    if not isinstance(n, int) or isinstance(n, bool) or n < 0 or n > 20: err(f, f'{p}.{part}.{ins}', '0〜20 の整数にしてください')
    return set(ids)


def check_members(D, inst_ids):
    f, d = 'members/names.json', D.get('members/names')
    if d is None: err(f, '', 'ファイルがありません')
    else:
        for k in ('family', 'given', 'feminineGiven'):
            for i, x in enumerate(need(f, d, '', k, list, nonempty=k != 'feminineGiven') or []):
                if not isinstance(x, str) or not x: err(f, f'{k}[{i}]', '空でない文字列にしてください')
    f, d = 'members/personalities.json', D.get('members/personalities')
    traits = set()
    if d is None: err(f, '', 'ファイルがありません')
    else:
        ts = need(f, d, '', 'conductorTraits', list) or []; traits = unique(f, ts, 'conductorTraits')
        for i, t in enumerate(ts):
            p = f'conductorTraits[{i}]'; need(f, t, p, 'name', str); need(f, t, p, 'desc', str)
            pol = need(f, t, p, 'policy', str, optional=True)
            if pol is not None and pol not in ('stable', 'express', 'dynamics', 'balance'): err(f, f'{p}.policy', 'stable / express / dynamics / balance のいずれかにしてください')
            need(f, t, p, 'practice', NUM, min_=0.5, max_=2, optional=True)
    f, d = 'members/originals.json', D.get('members/originals')
    if d is None: err(f, '', 'ファイルがありません'); return
    ms = need(f, d, '', 'members', list) or []; unique(f, ms, 'members', 'oid')
    for i, m in enumerate(ms):
        p = f'members[{i}]'; need(f, m, p, 'oid', str); need(f, m, p, 'name', str); need(f, m, p, 'profile', str)
        ins = need(f, m, p, 'inst', str)
        if ins is not None and ins not in inst_ids: err(f, f'{p}.inst', f'楽器 "{ins}" は data/members/instruments.json にありません')
        for k in ('abilities', 'potential'):
            v = need(f, m, p, k, list)
            if v is not None and (len(v) != 7 or not all(isinstance(x, int) and 1 <= x <= 100 for x in v)): err(f, f'{p}.{k}', '1〜100 の整数を7つ並べてください')
        need(f, m, p, 'look', dict)
        if not (isinstance(m, dict) and (m.get('initial') or isinstance(m.get('cost'), int))): err(f, p, 'initial: true（最初から在籍）か cost（採用費）のどちらかが必要です')
    cs = need(f, d, '', 'conductors', list) or []; unique(f, cs, 'conductors', 'oid')
    if sum(1 for c in cs if isinstance(c, dict) and c.get('founder')) != 1: err(f, 'conductors', 'founder: true の指揮者をちょうど1人にしてください')
    for i, c in enumerate(cs):
        p = f'conductors[{i}]'; need(f, c, p, 'oid', str); need(f, c, p, 'name', str); need(f, c, p, 'look', dict)
        t = need(f, c, p, 'trait', str)
        if t is not None and t not in traits: err(f, f'{p}.trait', f'個性 "{t}" は data/members/personalities.json にありません')
        for k in ('abilities', 'potential'):
            v = need(f, c, p, k, list)
            if v is not None and (len(v) != 4 or not all(isinstance(x, int) and 1 <= x <= 100 for x in v)): err(f, f'{p}.{k}', '1〜100 の整数を4つ並べてください')


VIS_REQ = {'w': (8, 60), 'd': (6, 60), 'h': (4, 30), 'rows': (1, 40), 'cols': (1, 40), 'rake': (0, 0.5), 'lightI': (0.3, 2)}


def check_halls(D):
    f, d = 'halls/index.json', D.get('halls/index')
    if d is None: err(f, '', 'ファイルがありません'); return
    hs = need(f, d, '', 'halls', list) or []; unique(f, hs, 'halls')
    for i, h in enumerate(hs):
        p = f'halls[{i}]'
        for k in ('id', 'name', 'grade', 'feature'): need(f, h, p, k, str)
        for k, lo, hi in (('fee', 0, 10**8), ('rehearsalFee', 0, 10**8), ('capacity', 10, 100000), ('ticket', 0, 10**6), ('acoustics', 0, 100), ('stage', 10, 300),
                          ('attendance', 0, 1), ('repSens', 0, 0.1), ('pressure', 0, 0.5), ('prestige', 0, 5)):
            need(f, h, p, k, NUM, min_=lo, max_=hi)
        v = need(f, h, p, 'visual', dict)
        if v:
            for k, (lo, hi) in VIS_REQ.items(): need(f, v, f'{p}.visual', k, NUM, min_=lo, max_=hi)
            for k in ('wall', 'ceiling', 'floor', 'stageFloor', 'seat', 'light', 'backdrop'):
                c = need(f, v, f'{p}.visual', k, str)
                if c is not None and not COLOR.match(c): err(f, f'{p}.visual.{k}', '色は "#RRGGBB" の形で書いてください')
    pr = need(f, d, '', 'practiceRoom', dict)
    if pr:
        need(f, pr, 'practiceRoom', 'name', str)
        v = need(f, pr, 'practiceRoom', 'visual', dict)
        if v:
            for k, lo, hi in (('w', 12, 40), ('d', 8, 30), ('h', 3.5, 12), ('lightI', 0.3, 2), ('windows', 0, 8)): need(f, v, 'practiceRoom.visual', k, NUM, min_=lo, max_=hi)
            for k in ('wall', 'floor', 'ceiling', 'backdrop', 'light', 'carpet'):
                c = need(f, v, 'practiceRoom.visual', k, str)
                if c is not None and not COLOR.match(c): err(f, f'practiceRoom.visual.{k}', '色は "#RRGGBB" の形で書いてください')


QUIZ_KEYS = ('id', 'category', 'question', 'answer', 'choices', 'explanation')


def check_quizzes(D, song_ids):
    cats = set()
    g = D.get('quizzes/general')
    if g is None: err('quizzes/general.json', '', 'ファイルがありません')
    else: cats = set((need('quizzes/general.json', g, '', 'categories', dict) or {}).keys())
    all_ids = {}

    def q_list(f, qs, path):
        for i, q in enumerate(qs):
            p = f'{path}[{i}]'
            for k in QUIZ_KEYS[:4] + ('explanation',): need(f, q, p, k, str)
            ch = need(f, q, p, 'choices', list)
            if not isinstance(q, dict): continue
            if isinstance(q.get('id'), str):
                if q['id'] in all_ids: err(f, f'{p}.id', f'問題ID "{q["id"]}" が {all_ids[q["id"]]} と重複しています')
                all_ids[q['id']] = f'data/{f} {p}'
            if q.get('category') not in cats: err(f, f'{p}.category', f'分類 "{q.get("category")}" は quizzes/general.json の categories にありません（{", ".join(sorted(cats))}）')
            if ch is not None:
                if len(ch) != 4: err(f, f'{p}.choices', f'選択肢は4つにしてください（今は{len(ch)}つ）')
                if len(set(ch)) != len(ch): err(f, f'{p}.choices', '同じ選択肢が重複しています')
                if not all(isinstance(c, str) and c for c in ch): err(f, f'{p}.choices', '選択肢は空でない文字列にしてください')
                if q.get('answer') not in ch: err(f, f'{p}.answer', f'正解 "{q.get("answer")}" が choices の中にありません')

    f, d = 'quizzes/songs.json', D.get('quizzes/songs')
    if d is None: err(f, '', 'ファイルがありません')
    else:
        for sid, qs in (need(f, d, '', 'questions', dict) or {}).items():
            if sid not in song_ids: err(f, f'questions.{sid}', f'曲ID "{sid}" は data/songs にありません')
            if isinstance(qs, list): q_list(f, qs, f'questions.{sid}')
            else: err(f, f'questions.{sid}', '配列にしてください')
    f, d = 'quizzes/composers.json', D.get('quizzes/composers')
    if d is None: err(f, '', 'ファイルがありません')
    else:
        cs = need(f, d, '', 'composers', list) or []; unique(f, cs, 'composers')
        owner = {}
        for i, c in enumerate(cs):
            p = f'composers[{i}]'; need(f, c, p, 'id', str); need(f, c, p, 'name', str)
            for j, s in enumerate(need(f, c, p, 'songs', list, nonempty=False) or []):
                if s not in song_ids: err(f, f'{p}.songs[{j}]', f'曲ID "{s}" は data/songs にありません')
                elif s in owner: err(f, f'{p}.songs[{j}]', f'曲 "{s}" はすでに {owner[s]} に登録されています（1曲につき作曲家は1人）')
                else: owner[s] = p
            q_list(f, need(f, c, p, 'questions', list, nonempty=False) or [], f'{p}.questions')
    for key in ('quizzes/instruments', 'quizzes/general'):
        f, d = f'{key}.json', D.get(key)
        if d is None: err(f, '', 'ファイルがありません'); continue
        q_list(f, need(f, d, '', 'questions', list) or [], 'questions')
    return len(all_ids)


EV_TARGETS = {'none', 'weakestSection', 'principalSection', 'strugglingMember', 'harmoniousSection', 'randomMember'}
EV_SPEAKERS = {'conductor', 'principal', 'member'}
EV_REQ = {'conductor', 'practicedSection', 'principalSection', 'members', 'individual', 'notIndividual'}
EV_VARS = {'section', 'partnerSection', 'song', 'conductor', 'member', 'principal', 'principalNote', 'traitFocus', 'aim', 'place', 'concertmaster', 'hall'}


def check_effect(f, p, e, sec_ids):
    if not isinstance(e, dict): err(f, p, 'オブジェクトにしてください'); return
    for k, v in e.items():
        if k in ('focus', 'others', 'all'):
            if not isinstance(v, NUM) or isinstance(v, bool) or not 0.5 <= v <= 2: err(f, f'{p}.{k}', '0.5〜2 の倍率にしてください')
        elif k == 'overall':
            for kk, vv in (v or {}).items():
                if kk not in ('ensemble', 'balance', 'unity'): err(f, f'{p}.overall.{kk}', 'ensemble / balance / unity のいずれかにしてください')
                if not isinstance(vv, NUM) or not 0 <= vv <= 5: err(f, f'{p}.overall.{kk}', '0〜5 の数値にしてください')
        elif k == 'mastery':
            for kk, vv in (v or {}).items():
                if kk not in ('comp', 'underst'): err(f, f'{p}.mastery.{kk}', 'comp（楽曲完成度）/ underst（楽曲理解度）にしてください')
                if not isinstance(vv, NUM) or not 0 <= vv <= 5: err(f, f'{p}.mastery.{kk}', '0〜5 の数値にしてください')
        elif k == 'stop':
            if not isinstance(v, bool): err(f, f'{p}.stop', 'true / false にしてください')
        else: err(f, f'{p}.{k}', f'効果 "{k}" は使えません（focus / others / all / overall / mastery / stop）')


def check_vars(f, p, text):
    if isinstance(text, str):
        for v in re.findall(r'\{(\w+)\}', text):
            if v not in EV_VARS: err(f, p, f'{{{v}}} は使えない記号です（使える記号: {", ".join(sorted(EV_VARS))}）')


def check_events(D, sec_ids):
    f, d = 'events/practice.json', D.get('events/practice')
    if d is None: err(f, '', 'ファイルがありません'); return 0
    st = need(f, d, '', 'settings', dict)
    if st:
        need(f, st, 'settings', 'chance', NUM, min_=0, max_=1)
        a = need(f, st, 'settings', 'timingFrom', NUM, min_=0.05, max_=0.95); b = need(f, st, 'settings', 'timingTo', NUM, min_=0.05, max_=0.95)
        if isinstance(a, NUM) and isinstance(b, NUM) and a > b: err(f, 'settings.timingFrom', 'timingTo 以下にしてください')
    tp = need(f, d, '', 'conductorTraitPhrases', dict) or {}
    for k, v in tp.items(): need(f, v, f'conductorTraitPhrases.{k}', 'focus', str); need(f, v, f'conductorTraitPhrases.{k}', 'aim', str)
    if d.get('defaultTraitPhrase') not in tp: err(f, 'defaultTraitPhrase', 'conductorTraitPhrases にある個性IDにしてください')
    need(f, d, '', 'defaultAim', str)
    presets = need(f, d, '', 'choicePresets', dict) or {}
    for k, ch in presets.items():
        for kk in ('id', 'label', 'hint', 'note'): need(f, ch, f'choicePresets.{k}', kk, str)
        check_effect(f, f'choicePresets.{k}.effect', ch.get('effect', {}), sec_ids)
    evs = need(f, d, '', 'events', list) or []; unique(f, evs, 'events')
    for i, e in enumerate(evs):
        p = f'events[{i}]'
        need(f, e, p, 'id', str); need(f, e, p, 'title', str); t = need(f, e, p, 'text', str); check_vars(f, f'{p}.text', t)
        sp = need(f, e, p, 'speaker', str)
        if sp is not None and sp not in EV_SPEAKERS: err(f, f'{p}.speaker', f'{" / ".join(sorted(EV_SPEAKERS))} のいずれかにしてください')
        tg = need(f, e, p, 'target', str)
        if tg is not None and tg not in EV_TARGETS: err(f, f'{p}.target', f'{" / ".join(sorted(EV_TARGETS))} のいずれかにしてください')
        if sp == 'principal' and tg not in ('principalSection', 'harmoniousSection'): err(f, f'{p}.speaker', '首席が話すイベントは target を principalSection にしてください')
        if sp == 'member' and tg not in ('strugglingMember', 'randomMember'): err(f, f'{p}.speaker', '団員が話すイベントは target を strugglingMember か randomMember にしてください')
        for j, r in enumerate(need(f, e, p, 'requires', list, nonempty=False) or []):
            if r not in EV_REQ: err(f, f'{p}.requires[{j}]', f'{" / ".join(sorted(EV_REQ))} のいずれかにしてください')
        w = need(f, e, p, 'weight', dict)
        if w:
            need(f, w, f'{p}.weight', 'base', NUM, min_=0, max_=20)
            need(f, w, f'{p}.weight', 'perDifficulty', NUM, min_=0, max_=1, optional=True); need(f, w, f'{p}.weight', 'perPracticeDone', NUM, min_=0, max_=5, optional=True)
        if 'principalNote' in e: check_vars(f, f'{p}.principalNote', e['principalNote'])
        if 'partner' in e:
            for s, s2 in (e['partner'] or {}).items():
                if s not in sec_ids or s2 not in sec_ids: err(f, f'{p}.partner.{s}', 'セクションIDを指定してください')
        has_c, has_a = 'choices' in e, 'auto' in e
        if has_c == has_a: err(f, p, '選択肢 choices か、自動の結果 auto のどちらか一方を書いてください')
        if has_a:
            check_effect(f, f'{p}.auto.effect', (e['auto'] or {}).get('effect', {}), sec_ids); need(f, e['auto'], f'{p}.auto', 'note', str); check_vars(f, f'{p}.auto.note', (e['auto'] or {}).get('note'))
        if has_c:
            chs = need(f, e, p, 'choices', list) or []
            if not 1 <= len(chs) <= 4: err(f, f'{p}.choices', '選択肢は1〜4つにしてください')
            ids = []
            for j, ch in enumerate(chs):
                q = f'{p}.choices[{j}]'
                if not isinstance(ch, dict): err(f, q, 'オブジェクトにしてください'); continue
                base = presets.get(ch['preset'], {}) if 'preset' in ch else {}
                if 'preset' in ch and ch['preset'] not in presets: err(f, f'{q}.preset', f'"{ch["preset"]}" は choicePresets にありません')
                m = {**base, **ch}
                for k in ('id', 'label', 'hint', 'note'):
                    if not isinstance(m.get(k), str) or not m.get(k): err(f, f'{q}.{k}', '項目がありません（preset を使わない場合は必須）')
                    else: check_vars(f, f'{q}.{k}', m[k])
                ids.append(m.get('id'))
                check_effect(f, f'{q}.effect', m.get('effect', {}), sec_ids)
                if 'focus' in m.get('effect', {}) and tg in (None, 'none'): err(f, f'{q}.effect.focus', '対象セクションのないイベント（target: none）では focus は使えません')
            if len(set(ids)) != len(ids): err(f, f'{p}.choices', '選択肢の id が重複しています')
    cm = need(f, d, '', 'commentary', dict) or {}
    for k in ('tutti', 'section', 'individual', 'hall'):
        for j, x in enumerate(need(f, cm, 'commentary', k, list, optional=(k == 'hall')) or []):
            if isinstance(x, str): check_vars(f, f'commentary.{k}[{j}]', x)
            elif isinstance(x, dict): need(f, x, f'commentary.{k}[{j}]', 'text', str); need(f, x, f'commentary.{k}[{j}]', 'fallback', str); check_vars(f, f'commentary.{k}[{j}].text', x.get('text'))
            else: err(f, f'commentary.{k}[{j}]', '文字列か {"text":..., "fallback":...} にしてください')
    return len(evs)


def validate(D):
    sec_ids, inst_ids = check_instruments(D)
    song_ids = check_songs(D, inst_ids)
    check_members(D, inst_ids)
    check_halls(D)
    nq = check_quizzes(D, song_ids)
    ne = check_events(D, sec_ids)
    return {'曲': len(song_ids), '楽器': len(inst_ids), 'クイズ': nq, '練習イベント': ne, 'ホール': len((D.get('halls/index') or {}).get('halls', []))}


# ---------------------------------------------------------------- ビルド
def main():
    data = load_data()
    summary = validate(data) if not errors else {}
    if errors:
        print('データにエラーがあります（dist/index.html は更新していません）：', file=sys.stderr)
        print('\n'.join(errors), file=sys.stderr)
        sys.exit(1)
    print('データ検証OK：' + '・'.join(f'{k}{v}' for k, v in summary.items()))
    if '--check' in sys.argv: return
    files = json.loads((SRC / 'files.json').read_text(encoding='utf-8'))
    read = lambda rel: (SRC / rel).read_text(encoding='utf-8')
    css = '\n'.join(read(f) for f in files['styles'])
    vendor = '\n'.join(read(f) for f in files['vendor'])
    game_data = json.dumps({k: v for k, v in data.items()}, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    game = f'/* GAME_DATA: data/ フォルダのJSON（build.py が検証して埋め込み） */\nconst GAME_DATA = {game_data};\n' + '\n'.join(read(f) for f in files['logic'] + files['view'])
    html = f'''<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,minimum-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="theme-color" content="#12131a">
<title>楽団運営記 ― オーケストラ運営シミュレーション</title>
<style>{css}</style></head>
<body><div id="app"></div>
<script>
try {{
{vendor}
}} catch (e) {{ window.THREE = undefined; console.error('three.js load failed', e); }}
</script>
<script>
{game}
</script></body></html>'''
    (root / 'dist').mkdir(exist_ok=True)
    (root / 'dist' / 'index.html').write_text(html, encoding='utf-8')
    print(f'dist/index.html を生成しました（{len(html):,} 文字）')


if __name__ == '__main__':
    main()
