"""3D空間の切り替え（練習室が基本）・練習のスキップ・本番の団員入場 の確認"""
import asyncio, json, os, sys, time
sys.path.insert(0, os.path.dirname(__file__)); import flow as F
from playwright.async_api import async_playwright
URL = 'file:///home/claude/orch/dist/index.html'
OLD = 'file:///tmp/orch_backup_v81/dist/index.html'   # 改修前の版：既存セーブデータの作成に使う
GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
R = {}; errs = []
def chk(n, ok, info=''): R[n] = bool(ok); print(('PASS' if ok else 'FAIL'), n, info)
# 実機で起きる状況を再現：音声（AudioContext）がタップのあと少し遅れて動き出す
FAKE_AUDIO = '''(()=>{const R=window.AudioContext; let running=false, base=0;
 class FakeAC extends R { get state(){ return running?'running':'suspended'; } get currentTime(){ return running ? (performance.now()/1000 - base) : 0; }
   resume(){ if(!running && window.__allowAudio){ setTimeout(()=>{ running=true; base=performance.now()/1000; }, 300); } return Promise.resolve(); } }
 window.AudioContext=FakeAC; window.webkitAudioContext=FakeAC;})()'''
V = '[Stage3D.venue(), cmdTop().s]'


async def venue(p): return await p.evaluate('Stage3D.venue()')


async def watch_show(p, limit=150, break_at_enter=False):
    """本番の演出を最後まで見る：段階の移り変わり・入場が終わったか・結果に進んだか"""
    stages, t0 = [], time.time(); walked = None; ven = set()
    while time.time() - t0 < limit:
        d = await p.evaluate('[Stage3D.debug(), UI.showing, Stage3D.venue()]')
        st = d[0]['stage']; ven.add(d[2])
        if break_at_enter and st == 'enter' and not await p.evaluate('window.__brokeRun||false'):
            await p.evaluate('window.__brokeRun=Stage3D.debugBreakActor(3)')   # 入場中に1人の3D表示を壊す
        if st and (not stages or stages[-1] != st): stages.append(st)
        if st in ('tuning', 'maestro') and walked is None: walked = [d[0]['walking'], d[0]['actors'], d[0]['hidden'] - d[0]['failed'], d[0]['failed']]
        if not d[1]: break
        await p.wait_for_timeout(250)
    return stages, walked, round(time.time() - t0, 1), ven, await p.evaluate('activeConcert().phase') if not await p.evaluate('UI.showing') else 'STILL SHOWING'


async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(args=GL)
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        await ctx.add_init_script(FAKE_AUDIO)
        p = await ctx.new_page(); p.on('pageerror', lambda e: errs.append('JS ' + str(e)))
        await p.goto(URL); await p.evaluate('localStorage.clear()'); await p.reload(); await p.click('[data-act=newgame]')
        await p.evaluate('STATE.funds+=3000000; save(); UI.practiceTest={scale:0.05,event:"off"}')
        # ===== 1. 3D空間の切り替え =====
        seq = {}
        await F.open_concert(p); seq['setup'] = await p.evaluate(V)
        await F.to_setup(p); await p.click('[data-act=cgo][data-v=hallList]'); seq['hallList'] = await p.evaluate(V)
        row = await F.find_row(p, '.cbody .crow[data-id="large"]'); await row.click(); seq['hallDetail'] = await p.evaluate(V)
        f0 = await p.evaluate('STATE.funds')
        await p.click('[data-act=cgo][data-v=hallPreview]'); seq['preview'] = await p.evaluate(V); f1 = await p.evaluate('STATE.funds')
        await p.click('[data-act=cback]'); seq['previewBack'] = await p.evaluate(V)
        await p.click('[data-act=reserveHall]'); seq['reservedFromDetail'] = await p.evaluate(V)
        await F.hall_detail(p, 'top'); await p.click('[data-act=cgo][data-v=hallPreview]'); seq['preview2'] = await p.evaluate(V)
        await p.click('[data-act=reserveHall]'); seq['reservedFromPreview'] = await p.evaluate(V)
        hall = await p.evaluate('activeConcert().hallId')
        await F.setup_all(p, 'top', 'orchestral'); seq['practice'] = await p.evaluate(V)
        await p.click('[data-act=cgo][data-v=tutti]'); await p.click('[data-act=runPractice]'); await p.wait_for_timeout(150); seq['practicing'] = await p.evaluate(V)
        await F.finish_practice(p); seq['practiceLog'] = await p.evaluate(V); await p.click('.cfoot .cbtn.big')
        while await p.evaluate('activeConcert().phase') == 'practice': await F.practice(p, 'tutti')
        seq['prep'] = await p.evaluate(V)
        await p.click('[data-act=cgo][data-v=rehearse]'); seq['rehearse'] = await p.evaluate(V)
        await p.click('[data-act=hall]'); seq['afterRehearse'] = await p.evaluate(V)
        await p.evaluate('window.__allowAudio=true')
        await p.click('[data-act=perform]'); await p.wait_for_timeout(400); seq['show'] = await p.evaluate(V)
        stages, walked, secs, ven, phase = await watch_show(p)
        seq['result'] = await p.evaluate(V)
        await p.click('[data-act=next]'); seq['nextConcert'] = await p.evaluate(V)
        for k, v in seq.items(): print('   ', k, v)
        PR = 'practice_room'
        chk('1a 通常は練習室（演奏会タブ・ホール一覧・ホール詳細・予約した直後も）', all(seq[k][0] == PR for k in ('setup', 'hallList', 'hallDetail', 'previewBack', 'reservedFromDetail', 'reservedFromPreview')))
        chk('1b 「3Dで下見」の間だけ選んだホール（下見では資金が変わらない）', seq['preview'] == ['large', 'hallPreview'] and seq['preview2'] == ['top', 'hallPreview'] and f0 == f1)
        chk('1c 通常練習は練習室・本番準備も練習室', all(seq[k][0] == PR for k in ('practice', 'practicing', 'practiceLog', 'prep')))
        chk('1d ホール練習は予約済みホール → 終了後は練習室', seq['rehearse'] == [hall, 'rehearse'] and seq['afterRehearse'][0] == PR, (seq['rehearse'], seq['afterRehearse']))
        chk('1e 本番と結果は予約済みホール → 演奏会が終わると練習室', seq['show'][0] == hall and ven == {hall} and seq['result'][0] == hall and seq['nextConcert'][0] == PR, (seq['show'], ven, seq['result'], seq['nextConcert']))
        chk('3a 新規ゲーム：本番開始直後に音声が動き出しても、入場→チューニング→…→結果まで進む', stages[:4] == ['before', 'enter', 'tuning', 'maestro'] and 'play' in stages and walked and walked[0] == 0 and walked[2] == 0 and phase == 'result', (stages, walked, secs))

        # ===== 2. 練習のスキップ =====
        await p.evaluate('UI.practiceTest={event:"off"}')   # 実際の練習時間（10〜15秒）
        await F.setup_all(p, 'small', 'orchestral')
        q0 = await p.evaluate('STATE.quiz.count')
        # (a) イベントもクイズもない回：すぐ練習報告へ。連打しても1回だけ
        d0 = await p.evaluate('activeConcert().practiceDone')
        await p.click('[data-act=cgo][data-v=tutti]'); await p.click('[data-act=runPractice]'); await p.wait_for_timeout(800)
        skipbtn = await p.evaluate('!!document.querySelector("[data-act=prSkip]")')
        t0 = time.time()
        await p.evaluate('ACTIONS.prSkip(); ACTIONS.prSkip(); ACTIONS.prSkip(); finishPracticeSession(); finishPracticeSession()')
        a = await p.evaluate('[cmdTop().s, activeConcert().practiceDone, activeConcert().practices.length, !!UI.practicing, Stage3D.isPracticing(), Stage3D.camName(), STATE.quiz.count, Stage3D.venue()]')
        el_a = round(time.time() - t0, 2)
        chk('2a スキップすると即座に終了し練習報告へ（連打しても成果・終了処理は1回だけ）', skipbtn and a[:5] == ['log', d0 + 1, d0 + 1, False, False] and a[5] == 'front' and a[6] == q0 + 1 and el_a < 1, (a, el_a))
        await p.click('.cfoot .cbtn.big')
        # (b) クイズの回：スキップするとクイズ画面で止まる（クイズはスキップしない）
        await p.click('[data-act=cgo][data-v=tutti]'); await p.click('[data-act=runPractice]'); await p.wait_for_timeout(500)
        await p.click('[data-act=prSkip]'); bq = await p.evaluate('[cmdTop().s, !!quizPending(), activeConcert().practiceDone]')
        await F.answer_quiz(p, 0); bq.append(await p.evaluate('cmdTop().s'))
        chk('2b クイズの回はクイズ画面で止まり、回答後に練習報告', bq == ['quiz', True, d0 + 2, 'log'], bq)
        await p.click('.cfoot .cbtn.big')
        # (c) 選択肢のあるイベントが起きる回：イベントの選択画面で止まる → 選ぶと練習報告（イベントはスキップしない）
        await p.evaluate('UI.practiceTest={event:"force",eventId:"tired"}')
        await p.click('[data-act=cgo][data-v=tutti]'); await p.click('[data-act=runPractice]'); await p.wait_for_timeout(500)
        before_ev = await p.evaluate('UI.practicing.evState')
        await p.click('[data-act=prSkip]'); c1 = await p.evaluate('[UI.practicing && UI.practicing.evState, document.querySelectorAll("[data-act=prChoice]").length, Stage3D.isPracticing()]')
        await p.screenshot(path='shots/s11_event.png')
        await p.click('[data-act=prChoice] >> nth=0'); c2 = await p.evaluate('[cmdTop().s, !!UI.practicing, (activeConcert().practices.slice(-1)[0].events||[]).length]')
        chk('2c 選択肢のあるイベントはスキップしても選択画面で止まり、選ぶと次へ進む', before_ev is None and c1[:2] == ['open', 3] and c2 == ['log', False, 1], (before_ev, c1, c2))
        await p.click('.cfoot .cbtn.big')
        # (d) イベント＋クイズの回：イベント → クイズ → 練習報告
        await p.click('[data-act=cgo][data-v=tutti]'); await p.click('[data-act=runPractice]'); await p.wait_for_timeout(400)
        await p.click('[data-act=prSkip]'); d1 = await p.evaluate('UI.practicing && UI.practicing.evState')
        await p.click('[data-act=prChoice] >> nth=1'); d2 = await p.evaluate('cmdTop().s'); await F.answer_quiz(p, 0); d3 = await p.evaluate('cmdTop().s')
        chk('2d イベントとクイズが両方ある回：イベント選択 → クイズ → 練習報告', [d1, d2, d3] == ['open', 'quiz', 'log'], [d1, d2, d3])
        await p.click('.cfoot .cbtn.big')
        # (e) 選択肢のないイベント：スキップしても結果は反映される
        await p.evaluate('UI.practiceTest={event:"force",eventId:"interp"}')
        n_before = await p.evaluate('activeConcert().practiceDone')
        await p.click('[data-act=cgo][data-v=tutti]'); await p.click('[data-act=runPractice]'); await p.wait_for_timeout(300)
        await p.click('[data-act=prSkip]'); e1 = await p.evaluate('[cmdTop().s, (activeConcert().practices.slice(-1)[0].events||[]).map(e=>e.id)]')
        chk('2e 選択肢のないイベントはスキップ時も結果を反映して練習報告へ', e1 == ['log', ['interp']] or (e1[0] == 'quiz' and e1[1] == ['interp']), e1)
        if e1[0] == 'quiz': await F.answer_quiz(p, 0)
        await p.click('.cfoot .cbtn.big')
        # (f) スキップしても成果は同じ：同じ乱数で、最後まで見た場合とスキップした場合を比べる
        same = []
        for mode_ in ('watch', 'skip'):
            await p.evaluate('''(()=>{window.__snap=window.__snap||JSON.stringify(STATE); window.__draft=window.__draft||JSON.stringify(UI.draft); STATE=JSON.parse(window.__snap); UI.draft=JSON.parse(window.__draft); save(); UI.cmd=null; UI.practicing=null;
              let a=4242; Math.random=()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}; UI.practiceTest={scale:0.15,event:"off"}; render()})()''')
            await p.click('[data-act=cgo][data-v=section]')
            await p.evaluate('''(()=>{let a=777; Math.random=()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}; document.querySelector('[data-act=runPractice]').click()})()''')
            await p.wait_for_timeout(200)
            if mode_ == 'skip': await p.click('[data-act=prSkip]')
            await F.finish_practice(p, quiz=None)
            same.append(await p.evaluate('JSON.stringify([activeConcert().perf, activeConcert().practices.slice(-1)[0].sections, activeConcert().practiceDone, STATE.funds])'))
        if same[0] != same[1]:
            import difflib; A, B = json.loads(same[0]), json.loads(same[1]); print('    DIFF', [ (k, A[0][k], B[0][k]) for k in A[0] if A[0][k] != B[0][k]][:3], A[1:] == B[1:])
        chk('2f スキップは演出の省略だけ（練習の成果・回数・資金は最後まで見た場合と同じ）', same[0] == same[1])
        await p.evaluate('UI.practiceTest={scale:0.05,event:"off"}')
        await ctx.close()

        # ===== 3. 本番の入場：さまざまな編成・既存セーブ・1人の不具合 =====
        cases = []
        async def concert(label, prep_js, song_cat, song_id, from_save=None, break_at_enter=False):
            ctx = await b.new_context(viewport={'width': 390, 'height': 844}); await ctx.add_init_script(FAKE_AUDIO)
            p = await ctx.new_page(); p.on('pageerror', lambda e: errs.append(f'JS[{label}] ' + str(e)))
            await p.goto(URL); await p.evaluate('localStorage.clear()')
            if from_save: await p.evaluate(f'localStorage.setItem(CONFIG.SAVE_KEY, {json.dumps(from_save)})')
            await p.reload()
            if not from_save: await p.click('[data-act=newgame]')
            await p.evaluate('STATE.funds+=3000000; save(); UI.practiceTest={scale:0.04,event:"off"}')
            if prep_js: await p.evaluate(prep_js)
            await F.open_concert(p)
            if await p.evaluate('activeConcert().phase') == 'setup':
                await F.to_setup(p); await p.click('[data-act=cgo][data-v=songCat]'); await p.click(f'[data-act=cgo][data-v=songList][data-g={song_cat}]')
                row = await F.find_row(p, f'.cbody .crow[data-id={song_id}]'); await row.click(); await p.click('[data-act=chooseSong]')
                await F.reserve_hall(p, 'general')
                if not await p.evaluate('setupStatus(activeConcert()).conductor'): await F.choose_conductor(p)
                await p.click('[data-act=toPractice]')
            while await p.evaluate('activeConcert().phase') == 'practice': await F.practice(p, 'tutti')
            n = await p.evaluate('STATE.members.length')
            await p.evaluate('window.__allowAudio=true')
            await p.click('[data-act=perform]')
            r = await watch_show(p, break_at_enter=break_at_enter)
            cases.append((label, n, r))
            await ctx.close()
        await concert('標準（新規ゲーム・交響曲 大編成）', None, 'symphony', 'mahler1')
        await concert('少人数（各楽器1名まで）', '''(()=>{const keep={}; for(const m of [...STATE.members]){ if(keep[m.inst]) dismissMember(m.id,{force:true}); else keep[m.inst]=1 } save()})()''', 'orchestral', 'egmont')
        await concert('弦楽合奏', None, 'orchestral', 'serenade')
        await concert('大人数（各楽器に団員を追加）', '''(()=>{const add=[]; for(const m of STATE.members.slice(0,20)) add.push(Object.assign(JSON.parse(JSON.stringify(m)),{id:m.id+'x'})); STATE.members.push(...add); ensurePrincipals(); save()})()''', 'symphony', 'beet5')
        # 1人の3Dモデルの作成に失敗（読み込みの不具合）＋ 入場中に別の1人の表示処理が失敗
        await concert('1人のモデル作成と1人の演出処理に失敗', '''(()=>{const m=principalOf('Vn1'); m.look=new Proxy(m.look,{get(t,k){ if(new Error().stack.includes('makePerson')) throw new Error('壊れた見た目データ'); return t[k]; }})})()''', 'orchestral', 'finlandia', break_at_enter=True)
        # 既存セーブ（改修前の版で途中まで進めたデータ）
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}); p = await ctx.new_page()
        await p.goto(OLD); await p.evaluate('localStorage.clear()'); await p.reload(); await p.click('[data-act=newgame]')
        await p.evaluate('STATE.funds+=500000; save(); UI.practiceTest={scale:0.04,event:"off"}')
        await F.setup_all(p, 'small', 'orchestral'); await F.practice(p, 'tutti'); await F.practice(p, 'tutti')
        old_save = await p.evaluate('localStorage.getItem(CONFIG.SAVE_KEY)'); await ctx.close()
        await concert('既存セーブデータ（改修前の版で練習途中）', None, 'orchestral', 'egmont', from_save=old_save)
        for c_ in cases: print('   ', c_[0], '団員', c_[1], c_[2][0][:5], '入場後', c_[2][1], c_[2][2], '秒', c_[2][4])
        ok = all(r[0][:4] == ['before', 'enter', 'tuning', 'maestro'] and r[1] and r[1][0] == 0 and r[4] == 'result' for _, _, r in cases)
        chk('3b 団員数・編成が違っても（大編成・少人数・弦楽合奏・大人数・既存セーブ）全員が入場し本番が最後まで進む', ok)
        broken = cases[4][2][1]
        chk('3c 1人のモデル作成・1人の演出処理に失敗しても、ほかの団員は入場し演奏会は最後まで進む', cases[4][2][4] == 'result' and broken and broken[0] == 0 and broken[3] == 1 and broken[1] == cases[0][2][1][1] - 1 and broken[2] == 0, (broken, cases[0][2][1]))
        await b.close()
    errs_real = [e for e in errs if 'look' not in e]
    chk('JSエラーなし', not errs_real, errs_real[:3])
    print('SUMMARY', sum(R.values()), '/', len(R))

asyncio.run(main())
