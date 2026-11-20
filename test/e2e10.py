"""データ分離・練習室・ホールの3Dプレビュー・正面固定の視点・ホール練習の料金 の確認"""
import asyncio, json, os, re, shutil, subprocess, sys, tempfile, pathlib
sys.path.insert(0, os.path.dirname(__file__)); import flow as F
from playwright.async_api import async_playwright
ROOT = pathlib.Path(__file__).resolve().parents[1]
URL = f'file://{ROOT}/dist/index.html'
OLD = '/tmp/orch_backup_v81/dist/index.html'   # 改修前（v8.1）のビルド：旧データとの比較・旧セーブの作成に使う
GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
R = {}; errs = []
def chk(n, ok, info=''): R[n] = bool(ok); print(('PASS' if ok else 'FAIL'), n, info)

DUMP = '''(()=>({songs:SONG_LIBRARY.map(s=>JSON.stringify([s.id,s.genre,s.title,s.composer,s.year,s.duration,s.difficulty,s.popularity,s.mood,s.description,s.strings,s.winds])),
  genres:GENRES, insts:INSTRUMENTS.map(i=>JSON.stringify([i.id,i.abbr,i.section,i.cap,i.std,i.kind])), secs:SECTIONS, family:NAME_FAMILY, given:NAME_GIVEN, fem:[...FEMININE_GIVEN],
  oc:ORIGINAL_CHARACTERS, ocd:ORIGINAL_CONDUCTORS, traits:CONDUCTOR_TRAITS, halls:CONFIG.halls.map(h=>JSON.stringify(Object.assign({},h,{rehearsalFee:0}))), hv:HALL_VISUALS,
  quiz:Object.fromEntries(Object.entries(QUIZ_INDEX).map(([k,q])=>[k,JSON.stringify([q.k,q.q,q.c,q.e])])), fees:CONFIG.halls.map(h=>[h.id,h.fee,h.rehearsalFee]),
  events:PRACTICE_EVENTS.map(e=>e.id)}))()'''


def build_in(tmp):
    return subprocess.run([sys.executable, 'build.py'], cwd=tmp, capture_output=True, text=True)


async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(args=GL)
        # ===== データ：改修前のゲーム内データと完全に一致 =====
        p = await b.new_page()
        await p.goto(f'file://{OLD}'); old = await p.evaluate(DUMP)
        await p.goto(URL); new = await p.evaluate(DUMP)
        await p.close()
        same = {k: old[k] == new[k] for k in old if k not in ('fees', 'events')}
        chk('D1 全43曲が維持（曲ID・曲名・作曲者・難易度・編成など全項目が改修前と一致）', same['songs'] and same['genres'] and len(new['songs']) == 43, len(new['songs']))
        chk('D2 団員関連データ（楽器・セクション・名前候補・固有キャラ・指揮者の個性）が改修前と一致', all(same[k] for k in ('insts', 'secs', 'family', 'given', 'fem', 'oc', 'ocd', 'traits')), [k for k in ('insts', 'secs', 'family', 'given', 'fem', 'oc', 'ocd', 'traits') if not same[k]])
        chk('D3 176問すべてが維持（問題ID・分類・問題文・選択肢・正解・解説が一致）', same['quiz'] and len(new['quiz']) == 176, len(new['quiz']))
        chk('D4 ホール（ホール練習料金以外）と3D内装・練習イベント9種が維持', same['halls'] and same['hv'] and new['events'] == old['events'], new['events'])
        files = sorted(str(x.relative_to(ROOT)) for x in (ROOT / 'data').rglob('*.json'))
        chk('D5 データはJSONファイルに分離', all(f in files for f in ['data/songs/symphonies.json', 'data/songs/orchestral.json', 'data/members/names.json', 'data/members/instruments.json', 'data/members/personalities.json',
            'data/quizzes/songs.json', 'data/quizzes/composers.json', 'data/quizzes/instruments.json', 'data/quizzes/general.json', 'data/halls/index.json', 'data/events/practice.json']), files)

        # ===== JSONだけを編集して内容を変えられる（プログラムは変更しない） =====
        tmp = pathlib.Path(tempfile.mkdtemp())
        for d in ('src', 'data'): shutil.copytree(ROOT / d, tmp / d)
        shutil.copy(ROOT / 'build.py', tmp / 'build.py')
        def edit(rel, fn):
            f = tmp / 'data' / rel; v = json.loads(f.read_text()); fn(v); f.write_text(json.dumps(v, ensure_ascii=False, indent=2))
        edit('songs/orchestral.json', lambda v: v['songs'].append({'id': 'radetzky', 'title': 'ラデツキー行進曲', 'composer': 'J.シュトラウス1世', 'year': 1848, 'duration': 3, 'difficulty': 30, 'popularity': 5,
            'mood': '祝祭', 'description': 'テスト用に追加した曲。', 'strings': {'Vn1': 6, 'Vn2': 5, 'Va': 4, 'Vc': 4, 'Cb': 2}, 'winds': {'Fl': 2, 'Ob': 2, 'Cl': 2, 'Fg': 2, 'Hr': 2, 'Tp': 2, 'Perc': 2}}))
        edit('quizzes/songs.json', lambda v: v['questions'].setdefault('radetzky', []).append({'id': 'radetzky_1', 'category': 'trivia', 'question': 'テスト問題？', 'answer': 'A', 'choices': ['B', 'A', 'C', 'D'], 'explanation': 'テスト'}))
        edit('members/names.json', lambda v: v['family'].append('試験'))
        edit('halls/index.json', lambda v: v['halls'][1].update({'rehearsalFee': 12345, 'name': '市民会館 小ホール（改）'}))
        edit('events/practice.json', lambda v: v['events'][6].update({'text': '団員の集中力が落ちてきました。（テスト文）'}))
        r = build_in(tmp)
        p = await b.new_page(); await p.goto(f'file://{tmp}/dist/index.html')
        ed = await p.evaluate('''[findSong("radetzky")&&findSong("radetzky").genre, songsOfGenre("orchestral").length, QUIZ_INDEX.radetzky_1&&QUIZ_INDEX.radetzky_1.c[0], NAME_FAMILY.includes("試験"),
            findHall("small").rehearsalFee, findHall("small").name, PRACTICE_EVENT_DATA.events[6].text]''')
        await p.close()
        chk('D6 JSONの編集だけで曲・クイズ・名前・ホール料金・イベント文章を追加変更できる', r.returncode == 0 and ed == ['orchestral', 30, 'A', True, 12345, '市民会館 小ホール（改）', '団員の集中力が落ちてきました。（テスト文）'], (r.stdout.strip()[-40:], ed))
        # 不正なJSON：どのファイルのどの項目かを表示し、dist は更新しない
        before = (tmp / 'dist/index.html').read_bytes()
        edit('quizzes/general.json', lambda v: v['questions'][0].update({'choices': ['a', 'b', 'c'], 'answer': 'x'}))
        edit('songs/symphonies.json', lambda v: v['songs'][0]['winds'].update({'Sax': 1}))
        edit('halls/index.json', lambda v: v['halls'][0]['visual'].update({'wall': 'red'}))
        edit('events/practice.json', lambda v: v['events'][0]['choices'][0]['effect'].update({'focus': 9}))
        r2 = build_in(tmp)
        (tmp / 'data/members/names.json').write_text('{ "family": ["佐藤", }')
        r3 = build_in(tmp)
        msgs = r2.stderr
        chk('D7 不正な値は「ファイル名・項目」を示してビルドを止める（distは更新しない）', r2.returncode == 1 and r3.returncode == 1 and (tmp / 'dist/index.html').read_bytes() == before
            and 'data/quizzes/general.json  questions[0].choices: 選択肢は4つ' in msgs and 'questions[0].answer' in msgs and 'data/songs/symphonies.json  songs[0].winds.Sax' in msgs
            and 'data/halls/index.json  halls[0].visual.wall' in msgs and 'events[0].choices[0].effect.focus' in msgs and 'data/members/names.json' in r3.stderr and '行目' in r3.stderr,
            (msgs.strip().split('\n')[1:6], r3.stderr.strip().split('\n')[-1]))
        shutil.rmtree(tmp)
        rc = subprocess.run([sys.executable, 'build.py', '--check'], cwd=ROOT, capture_output=True, text=True)
        chk('D8 build.py で検証・ビルドできる（Node.js不要・標準ライブラリのみ）', rc.returncode == 0 and 'データ検証OK' in rc.stdout and 'import json, pathlib, re, sys' in (ROOT / 'build.py').read_text(), rc.stdout.strip())

        # ===== 練習室・視点・ホールの下見・ホール練習料金 =====
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        p = await ctx.new_page(); p.on('pageerror', lambda e: errs.append('JS ' + str(e)))
        await p.goto(URL); await p.evaluate('localStorage.clear()'); await p.reload(); await p.click('[data-act=newgame]')
        await p.evaluate('STATE.funds+=2000000; save(); UI.practiceTest={scale:0.05,event:"off"}')
        await F.open_concert(p)
        v_setup = await p.evaluate('[Stage3D.venue(), Stage3D.camName(), document.querySelectorAll("[data-act=cam]").length]')
        # 下見：資金・予約は変わらない、同じ3Dホール、カメラが会場内を巡る、戻ると正面
        await F.hall_detail(p, 'large')
        f0, h0 = await p.evaluate('[STATE.funds, activeConcert().hallId]')
        detail_btn = await p.evaluate('!!document.querySelector("[data-act=cgo][data-v=hallPreview]")')
        await p.click('[data-act=cgo][data-v=hallPreview]'); await p.wait_for_timeout(300)
        pv = await p.evaluate('[Stage3D.venue(), cmdTop().s, Stage3D.camName(), document.getElementById("tour3d").textContent]')
        tour = set()
        for _ in range(9):
            await p.wait_for_timeout(1000); tour.add(await p.evaluate('Stage3D.camName()'))
        await p.screenshot(path='shots/h10_preview.png')
        f1, h1 = await p.evaluate('[STATE.funds, activeConcert().hallId]')
        await p.click('[data-act=cback]'); await p.wait_for_timeout(300)
        back = await p.evaluate('[cmdTop().s, Stage3D.camName(), Stage3D.venue()]')
        chk('H1 予約前にホールを3Dで下見できる（実際のホールと同じ3D・カメラが会場内を巡る）', detail_btn and pv[0] == 'large' and pv[1] == 'hallPreview' and len(tour) >= 3, (pv, sorted(tour)))
        chk('H2 下見では資金・予約状態が変わらない／「予約画面に戻る」で戻ると正面の視点・練習室', f1 == f0 and h1 == h0 and back[0] == 'hallDetail' and back[1] == 'front' and back[2] == 'practice_room', (f0, f1, back))
        # 下見の画面から予約 → 本番準備・本番で同じホール
        await p.click('[data-act=cgo][data-v=hallPreview]'); fee = await p.evaluate('findHall("large").fee')
        await p.click('[data-act=reserveHall]'); r1 = await p.evaluate('[activeConcert().hallId, STATE.funds, cmdTop().s, Stage3D.camName()]')
        chk('H3 下見から予約でき、使用料は予約時に1回だけ支払う', r1[0] == 'large' and r1[1] == f0 - fee and r1[2] == 'setup' and r1[3] == 'front', (r1, fee))
        await F.setup_all(p, 'large', 'orchestral')
        v_prac = await p.evaluate('[Stage3D.venue(), Stage3D.camName(), document.getElementById("venue3d").textContent]')
        f_prac0 = await p.evaluate('STATE.funds')
        # 全体合奏（練習室）
        await p.click('[data-act=cgo][data-v=tutti]'); await p.click('[data-act=runPractice]'); await p.wait_for_timeout(200)
        during = await p.evaluate('[Stage3D.venue(), Stage3D.isPracticing()]')
        await F.finish_practice(p); after1 = await p.evaluate('Stage3D.camName()'); await p.click('.cfoot .cbtn.big')
        # セクション練習：視点がセクションを順に移る（練習室でも）
        await p.evaluate('UI.practiceTest={scale:0.45,event:"off"}')
        await p.click('[data-act=cgo][data-v=section]'); await p.click('[data-act=runPractice]')
        seen = []
        while await p.evaluate('!!UI.practicing'):
            c_ = await p.evaluate('Stage3D.camName()')
            if not seen or seen[-1] != c_: seen.append(c_)
            await p.wait_for_timeout(120)
        await p.screenshot(path='shots/h10_room.png')
        after2 = await p.evaluate('[Stage3D.camName(), Stage3D.venue()]')
        await F.answer_quiz(p, 0); await p.click('.cfoot .cbtn.big')
        # 個人練習（練習室）
        await p.evaluate('UI.practiceTest={scale:0.05,event:"off"}')
        await p.click('[data-act=cgo][data-v=indivPick]'); await p.click('.cbody [data-act=indPick] >> nth=0'); await p.click('[data-act=cgo][data-v=indivFocus]')
        await p.click('[data-act=runPractice]'); await p.wait_for_timeout(150); ind = await p.evaluate('[Stage3D.venue(), Stage3D.isPracticing()]')
        await F.finish_practice(p); await p.click('.cfoot .cbtn.big')
        f_prac1 = await p.evaluate('STATE.funds')
        chk('P1 通常練習（全体合奏・セクション・個人）は練習室で行われる', v_prac[0] == 'practice_room' and during == ['practice_room', True] and ind == ['practice_room', True] and v_prac[2] == '楽団の練習室', (v_prac, during, ind))
        chk('P2 セクション練習の視点移動は維持（弦→木管→金管→打楽器）・練習後は正面', seen[-4:] == ['front', 'ww', 'br', 'pc'] or seen[:4] == ['front', 'ww', 'br', 'pc'], seen)
        chk('P3 練習が終わると正面の視点に戻る（場所は練習室のまま）', after1 == 'front' and after2 == ['front', 'practice_room'], (after1, after2))
        chk('P4 通常練習では資金が減らない', f_prac1 == f_prac0, (f_prac0, f_prac1))
        chk('V1 視点ボタンがなく、通常時は正面に固定', v_setup[2] == 0 and v_setup[1] == 'front' and v_prac[1] == 'front', v_setup)
        # 本番準備：ホールに切り替わる。ホール練習は料金を実施時に支払う
        while await p.evaluate('activeConcert().phase') == 'practice': await F.practice(p, 'tutti')
        v_prep = await p.evaluate('[Stage3D.venue(), Stage3D.camName()]')
        rfee = await p.evaluate('concertHall(activeConcert()).rehearsalFee')
        await p.click('[data-act=cgo][data-v=rehearse]'); scr_txt = await p.inner_text('.cmd')
        # 資金不足：実施できず、資金も変わらない
        keep = await p.evaluate('STATE.funds'); await p.evaluate(f'STATE.funds={rfee - 1}; render()')
        lack = [await p.get_attribute('[data-act=hall]', 'disabled') is not None, await p.inner_text('[data-act=hall]'), await p.inner_text('.cmd .cbody')]
        await p.evaluate('ACTIONS.hall()'); lack.append(await p.evaluate('[STATE.funds, activeConcert().rehearsal.done]'))
        await p.screenshot(path='shots/h10_lack.png')
        await p.evaluate(f'STATE.funds={keep}; render()')
        await p.click('[data-act=hall]'); paid = await p.evaluate('[STATE.funds, activeConcert().rehearsal.done, activeConcert().ledger.filter(l=>l.label.startsWith("ホール練習")).map(l=>l.amount)]')
        await p.evaluate('ACTIONS.hall()'); again = await p.evaluate('STATE.funds')
        chk('F1 ホール練習の料金を表示（料金・資金・実施後の資金）', f'{rfee:,}' in scr_txt and '実施するときに支払い' in scr_txt and '実施後' in scr_txt, scr_txt.replace('\n', ' ')[:90])
        chk('F2 資金不足ではホール練習できない（理由を表示・資金は変わらない）', lack[0] and '資金が足りません' in lack[1] and '資金不足' in lack[2] and lack[3] == [rfee - 1, False], lack[:2])
        chk('F3 ホールに応じた料金を実施時に1回だけ支払う（予約料とは別・二重請求なし）', paid[0] == keep - rfee and paid[1] and paid[2] == [-rfee] and again == paid[0] and rfee == 45000, (paid, again))
        chk('V2 本番準備（ホール練習以外）は練習室のまま', v_prep == ['practice_room', 'front'], v_prep)
        await F.perform(p)
        v_show = await p.evaluate('[Stage3D.venue(), activeConcert().result.settlement ? 1 : 0, Stage3D.camName()]')
        chk('V3 本番・結果は予約したホールで行われる（視点は正面）', v_show == ['large', 1, 'front'], v_show)
        # 全ホールのホール練習料金（データから）
        fees = await p.evaluate('CONFIG.halls.map(h=>[h.id,h.fee,h.rehearsalFee])')
        chk('F4 ホール練習は全ホールで有料（料金はホールごと・JSONで設定）', all(r_ > 0 for _, _, r_ in fees), fees)
        await ctx.close()

        # ===== 改修前（v8.1）のセーブデータをそのまま読み込める =====
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}); p = await ctx.new_page()
        await p.goto(f'file://{OLD}'); await p.evaluate('localStorage.clear()'); await p.reload(); await p.click('[data-act=newgame]')
        await p.evaluate('STATE.funds+=500000; save(); UI.practiceTest={scale:0.04,event:"off"}')
        await F.setup_all(p, 'small', 'orchestral'); await F.practice(p, 'tutti')
        await p.click('[data-act=cgo][data-v=tutti]'); await p.click('[data-act=runPractice]'); await F.finish_practice(p, quiz=None)   # クイズは回答前のまま保存
        save_old = await p.evaluate('localStorage.getItem(CONFIG.SAVE_KEY)')
        await p.goto(URL); await p.evaluate(f'localStorage.setItem(CONFIG.SAVE_KEY, {json.dumps(save_old)})'); await p.reload()
        await p.click('.nav [data-tab=concert]'); await p.wait_for_timeout(300)
        st = json.loads(save_old)
        ld = await p.evaluate('[STATE.version, STATE.funds, STATE.members.length, activeConcert().practiceDone, activeConcert().hallId, cmdTop().s, !!QUIZ_INDEX[quizPending().qid], Stage3D.venue()]')
        await F.answer_quiz(p, 0)
        chk('S1 改修前のセーブを初期化せずに読み込み、続きから遊べる（出題中のクイズも有効）', ld[:5] == [st['version'], st['funds'], len(st['members']), 2, 'small'] and ld[5] == 'quiz' and ld[6] and ld[7] == 'practice_room', ld)
        # 出題中の問題がJSONから削除された場合も、エラーにならず出題が取り消される
        await p.evaluate('(()=>{const c=activeConcert(); STATE.quiz.pending={qid:"deleted_q",songId:c.songId,concertId:c.id,practiceNo:2,count:2,order:[0,1,2,3]}; save(); UI.cmd=null; render()})()')
        gone = await p.evaluate('[cmdTop().s, STATE.quiz.pending, answerQuiz(0)]')
        chk('S2 削除された問題が出題中でもエラーにならない（出題を取り消す）', gone[0] != 'quiz' and gone[1] is None and gone[2] is None, gone)
        await ctx.close(); await b.close()
    chk('JSエラーなし', not errs, errs[:3])
    print('SUMMARY', sum(R.values()), '/', len(R))

asyncio.run(main())
