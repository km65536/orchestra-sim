"""練習クイズの確認：出題タイミング・保存・既存の楽曲理解度への反映・重複防止・解説表示・既存機能・旧セーブ・画面に収まるか"""
import asyncio, json, os, sys
sys.path.insert(0, os.path.dirname(__file__)); import flow as F
from playwright.async_api import async_playwright
URL='file:///home/claude/orch/dist/index.html'
GL=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']
R={}; errs=[]
def chk(n,ok,info=''): R[n]=bool(ok); print(('PASS' if ok else 'FAIL'),n,info)

async def one_practice(p, menu='tutti', quiz=None):
    """練習を1回行い、クイズが出たかどうか・回答結果を返す（quiz=None なら出題画面のまま止める）"""
    await p.click(f'[data-act=cgo][data-v={"tutti" if menu=="tutti" else "section"}]'); await p.click('[data-act=runPractice]')
    await F.finish_practice(p, quiz=None)
    shown=await p.evaluate('cmdTop().s==="quiz"')
    res=None
    if shown and quiz is not None:
        res=await F.answer_quiz(p, quiz)
    if not shown or quiz is not None: await p.click('.cfoot .cbtn.big')
    return shown, res

async def main():
  async with async_playwright() as pw:
    b=await pw.chromium.launch(args=GL)
    ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
    p=await ctx.new_page(); p.on('pageerror',lambda e: errs.append('JS '+str(e)))
    await p.goto(URL); await p.evaluate('localStorage.clear()'); await p.reload(); await p.click('[data-act=newgame]')
    await p.evaluate('STATE.funds+=3000000; save()')
    await F.setup_all(p,'small','orchestral'); await p.evaluate('UI.practiceTest={scale:0.04,event:"off"}')
    song1=await p.evaluate('activeConcert().songId')
    # 1・2：出題タイミング（2回目・4回目に出題、1回目・3回目は出ない）
    seq=[]
    s,_=await one_practice(p); seq.append(s)
    s,r1=await one_practice(p,quiz='right'); seq.append(s)
    s,_=await one_practice(p,'section'); seq.append(s)
    cnt3=await p.evaluate('STATE.quiz.count')
    # 3：再起動しても出題カウントを維持（3回目のあとで再読み込み → 4回目に出題）
    await p.reload(); await p.evaluate('UI.practiceTest={scale:0.04,event:"off"}'); await p.click('.nav [data-tab=concert]')
    cnt3b=await p.evaluate('STATE.quiz.count')
    s,r2=await one_practice(p,quiz='right'); seq.append(s)
    s,_=await one_practice(p); seq.append(s)
    s,_=await one_practice(p,quiz=None); seq.append(s)
    chk('1/2 通常練習2回ごとに出題・1回目と3回目は出題なし', seq==[False,True,False,True,False,True], seq)
    # 回答前に再起動 → 演奏会タブを開くと同じ問題がそのまま出る
    pend=await p.evaluate('JSON.stringify(quizPending())')
    await p.reload(); await p.evaluate('UI.practiceTest={scale:0.04,event:"off"}'); await p.click('.nav [data-tab=concert]')
    again=await p.evaluate('[cmdTop().s, JSON.stringify(quizPending())]')
    chk('3 再起動しても出題カウント・出題中の問題を維持', cnt3==3 and cnt3b==3 and again==['quiz',pend], (cnt3,cnt3b,again[0]))
    # 9：回答後に正解・解説を表示
    item=await p.evaluate('QUIZ_INDEX[quizPending().qid]')
    wrong_idx=await p.evaluate('quizPending().order.findIndex(x=>x!==0)')
    u0=await p.evaluate('activeConcert().perf.mastery.underst')
    await p.click(f'[data-act=quizAnswer][data-v="{wrong_idx}"]')
    shown_txt=await p.inner_text('.cmd'); r3=await p.evaluate('UI.quizResult')
    await p.click(f'[data-act=quizAnswer] >> nth=0', timeout=500) if await p.query_selector('[data-act=quizAnswer]') else None
    await p.screenshot(path='shots/q9_result.png')
    chk('9 回答後に 不正解の表示・正解の選択肢・解説・楽曲理解度の変化 を表示', '× 不正解' in shown_txt and item['c'][0] in shown_txt and item['e'] in shown_txt and 'あなたの答え' in shown_txt and '楽曲理解度' in shown_txt, shown_txt.replace('\n',' ')[:120])
    await p.click('[data-act=quizDone]'); back=await p.evaluate('cmdTop().s')
    # 4/5：正解で大きく、不正解でも少し上がる・連続正解ボーナス
    chk('4 正解で既存の楽曲理解度が上がる（2問連続でボーナス）', r1['correct'] and r1['gain']>1.5 and r2['correct'] and r2['gain']>r1['gain']*1.05 and r2['bonus']>0, (round(r1['gain'],2),round(r2['gain'],2)))
    chk('5 不正解でも少し上がり、連続正解はリセット', (not r3['correct']) and 0<r3['gain']<r1['gain']/2 and abs(r3['before']-u0)<1e-9 and abs(await p.evaluate('activeConcert().perf.mastery.underst')-(u0+r3['gain']))<1e-9 and await p.evaluate('STATE.quiz.streak')==0 and back in ('log','practice'), (round(r3['gain'],2),round(u0,2),back))
    if back=='log': await p.click('.cfoot .cbtn.big')
    # 本番準備（ホール練習）は数えない
    while await p.evaluate('activeConcert().phase')=='practice':
        await one_practice(p,quiz=0)
    c_before=await p.evaluate('STATE.quiz.count'); await F.rehearse(p); c_after=await p.evaluate('STATE.quiz.count')
    chk('1b 本番準備のホール練習は出題回数に含めない', c_before==10 and c_after==10, (c_before,c_after))
    # 7：クイズで上がった楽曲理解度は、既存の評価式を通じて演奏会に効く（同じ乱数で、クイズの上昇分あり／なしを比較）
    cmp=await p.evaluate('''(()=>{const snap=JSON.stringify(STATE), out={};
       const seeded=()=>{let a=777;Math.random=()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}};
       const orig=Math.random, quizGain=STATE.quiz.history.filter(h=>h.concertId===activeConcert().id).reduce((s,h)=>s+h.gain,0);
       for (const k of ['with','without']) { STATE=JSON.parse(snap); const c=activeConcert(); if(k==='without') c.perf.mastery.underst-=quizGain; seeded(); const pr=successInfo(c).prob; runConcert(c); out[k]={cats:c.result.cats,total:c.result.total,prob:pr,und:c.perf.mastery.underst}; }
       Math.random=orig; STATE=JSON.parse(snap); save(); return [out, quizGain, typeof quizEvalBonus]})()''')
    o=cmp[0]
    chk('7 クイズの理解度は既存の楽曲理解度として、既存の評価式で演奏会に効く（独自の補正なし）', cmp[1]>0 and o['with']['und']>o['without']['und'] and o['with']['total']>=o['without']['total'] and o['with']['prob']>=o['without']['prob'] and cmp[2]=='undefined',
        (round(cmp[1],1), o['without']['total'], o['with']['total'], round(o['without']['prob'],3), round(o['with']['prob'],3)))
    await p.evaluate('render()')
    # 本番 → 次の演奏会で別の曲
    await F.perform(p); await p.click('[data-act=next]')
    cid1=await p.evaluate('STATE.concertOrder[STATE.concertOrder.length-2]'); und_song1=await p.evaluate(f'STATE.concertPrograms["{cid1}"].perf.mastery.underst')
    await F.open_concert(p); await F.to_setup(p)
    await p.click('[data-act=cgo][data-v=songCat]'); await p.click('[data-act=cgo][data-v=songList][data-g=symphony]')
    row=await F.find_row(p,'.cbody .crow[data-id=beet5]'); await row.click(); await p.click('[data-act=chooseSong]')
    await F.reserve_hall(p,'small')
    if not await p.evaluate('setupStatus(activeConcert()).conductor'): await F.choose_conductor(p)
    await p.click('[data-act=toPractice]')
    await one_practice(p); _,rb=await one_practice(p,quiz='right')
    ind=await p.evaluate(f'[STATE.concertPrograms["{cid1}"].perf.mastery.underst, activeConcert().songId, activeConcert().practices[1].quiz]')
    chk('6 理解度は曲（演奏会）ごとに独立（別の曲の正解で前の曲の理解度は変わらない）', ind[0]==und_song1 and ind[1]=='beet5' and rb['songId']=='beet5' and rb['concertId']!=cid1 and ind[2] and abs(ind[2]['gain']-rb['gain'])<1e-9, (round(ind[0],2), ind[1]))
    # 10：ランダムイベントと既存の練習報告（イベント→クイズ→報告の順）
    await p.evaluate('UI.practiceTest={scale:0.08,event:"force",eventId:"prin_passage"}')
    await one_practice(p)   # 3回目（出題なし）
    await p.click('[data-act=cgo][data-v=tutti]'); await p.click('[data-act=runPractice]')
    order=[]
    for _ in range(400):
        st=await p.evaluate('UI.practicing ? UI.practicing.evState : "end"')
        if st=='open' and 'event' not in order: order.append('event'); await p.click('[data-act=prChoice] >> nth=0')
        if st=='end': break
        await p.wait_for_timeout(40)
    if await p.evaluate('cmdTop().s')=='quiz': order.append('quiz'); await F.answer_quiz(p,0)
    rep=await p.inner_text('.cmd'); order.append('log' if '練習の成果' in rep else '?')
    ev=await p.evaluate('activeConcert().practices.slice(-1)[0].events')
    chk('10 既存のランダムイベント→クイズ→既存の練習報告（イベント結果も反映）', order==['event','quiz','log'] and ev and '⚑' in rep, order)
    await p.click('.cfoot .cbtn.big')
    # 8：重複防止（同じ曲で一通り出題するまで同じ問題は出ない・曲の問題→作曲家→一般の順）
    dup=await p.evaluate('''(()=>{const snap=JSON.stringify(STATE); const c=activeConcert(), sid='bolero'; c.songId=sid; STATE.quiz.songs[sid]={und:0,asked:[],answered:0,correct:0};
       const tiers=quizTiers(sid), total=tiers.flat().length, seen=[], scopes=[];
       for(let i=0;i<total+6;i++){ STATE.quiz.count=1; quizAfterPractice(c,{no:2}); const q=quizPending(); seen.push(q.qid); scopes.push(QUIZ_INDEX[q.qid].scope); answerQuiz(0); }
       const first=seen.slice(0,total), after=seen.slice(total);
       const ok1=new Set(first).size===total, sc=scopes.slice(0,total).join(','), order=sc===[...tiers[0].map(()=>'song'),...tiers[1].map(()=>'composer'),...tiers[2].map(()=>'general')].join(',');
       const ok2=!after.slice(0,1).some(x=>first.slice(-3).includes(x));
       STATE=JSON.parse(snap); save(); return [ok1, order, ok2, total, tiers.map(t=>t.length)]})()''')
    chk('8 問題が不自然に重複しない（一通り出題するまで再出題なし・曲→作曲家→一般の優先順）', dup[0] and dup[1] and dup[2], dup)
    # 上限：既存の楽曲理解度の上限（既存の上昇処理の上限）を超えない
    cap=await p.evaluate('''(()=>{const snap=JSON.stringify(STATE); const c=activeConcert(); c.perf.mastery.underst=CONFIG.practice.perfCap*1.2-0.5; STATE.quiz.count=1; quizAfterPractice(c,{no:c.practices.length});
       const r=answerQuiz(quizPending().order.indexOf(0)); const v=c.perf.mastery.underst; STATE=JSON.parse(snap); save(); return [v, CONFIG.practice.perfCap*1.2, r.gain]})()''')
    chk('理解度は既存の楽曲理解度の上限を超えない', cap[0]<=cap[1]+1e-9, cap)
    # 練習報告（理解度+x）と練習履歴にクイズの分も反映
    rl=await p.evaluate('(()=>{const l=activeConcert().practices[1];return [l.quiz, l.mastery.underst, l.summary]})()')
    chk('既存の練習報告の「理解度」と練習履歴にクイズの分を反映', rl[0] and rl[1]>=rl[0]['gain'] and 'クイズ' in rl[2], rl[2])
    # 画面上で確認できる（仕上がり画面・記録タブ）
    await p.click('[data-act=cgo][data-v=perf]'); await p.click('[data-act=ctab][data-v=all]'); perf=await p.inner_text('.cmd'); await p.click('[data-act=cback]')
    await F.tnav(p,'records',[]); root=await p.inner_text('.tbody'); await p.click('[data-act=tgo][data-v=rQuiz]'); lst=await p.inner_text('.tbody')
    await p.click('.tbody .trow >> nth=0'); det=await p.inner_text('.tbody'); await p.screenshot(path='shots/q9_rec.png')
    ov=await p.evaluate('(()=>{const b=document.querySelector(".tv .tbody");return b.scrollHeight<=b.clientHeight+1})()')
    await F.tnav(p,'records',[{'s':'rConcerts'},{'s':'rConcert','id':await p.evaluate('STATE.concertOrder[0]')}]); rc=await p.inner_text('.tbody')
    chk('理解度を画面で確認（仕上がり画面の楽曲理解度・記録タブのクイズ記録）', '楽曲理解度' in perf and '音楽クイズの記録' in root and '問正解' in lst and '出題済み' in det and ov, lst.replace('\n',' ')[:60])
    # 11：既存のセーブデータ（クイズ情報なし／壊れた値）を読み込める
    await p.evaluate('(()=>{const s=JSON.parse(localStorage.getItem(CONFIG.SAVE_KEY)); delete s.quiz; localStorage.setItem(CONFIG.SAVE_KEY,JSON.stringify(s))})()')
    await p.reload(); old=await p.evaluate('[STATE.version, JSON.stringify(STATE.quiz), STATE.members.length>0]')
    await p.evaluate('(()=>{const s=JSON.parse(localStorage.getItem(CONFIG.SAVE_KEY)); s.quiz={count:"x",streak:null,songs:{egmont:{und:250,asked:"bad"},bolero:5},pending:{foo:1},history:"no"}; localStorage.setItem(CONFIG.SAVE_KEY,JSON.stringify(s))})()')
    await p.reload(); bad=await p.evaluate('[STATE.quiz.count, STATE.quiz.songs.egmont.und===undefined?null:STATE.quiz.songs.egmont.und, Array.isArray(STATE.quiz.songs.egmont.asked), "bolero" in STATE.quiz.songs, STATE.quiz.pending, Array.isArray(STATE.quiz.history)]')
    await p.evaluate('UI.practiceTest={scale:0.04,event:"off"}'); await p.click('.nav [data-tab=concert]')
    ok_play=True
    try:
        for _ in range(2): await one_practice(p,quiz=0)
    except Exception as e: ok_play=False; print(e)
    chk('11 既存セーブ（クイズ情報なし・不正な値）を正常に読み込み、そのまま遊べる', old[1]=='{"count":0,"streak":0,"best":0,"songs":{},"pending":null,"history":[]}' and bad==[0,None,True,False,None,True] and ok_play and await p.evaluate('STATE.quiz.count')==2, (old, bad))
    await ctx.close()
    # 全問題が画面内に収まるか（小さい画面と標準）：出題画面と回答後（不正解時が最も長い）
    lay=[]
    for (w,h) in [(375,667),(390,844),(320,568)]:
        ctx=await b.new_context(viewport={'width':w,'height':h},is_mobile=True,has_touch=True); p=await ctx.new_page(); p.on('pageerror',lambda e: errs.append('JS '+str(e)))
        await p.goto(URL); await p.evaluate('localStorage.clear()'); await p.reload(); await p.click('[data-act=newgame]'); await F.setup_all(p,'small','orchestral')
        bads=await p.evaluate('''(async()=>{const ids=Object.keys(QUIZ_INDEX), bad=[]; const c=activeConcert();
          const fit=()=>{const b=document.querySelector('.cmd .cbody'), nav=document.getElementById('nav').getBoundingClientRect().top; const out=[...document.querySelectorAll('.cmd button')].filter(x=>{const r=x.getBoundingClientRect();return r.bottom>nav+1||r.top<0||r.right>innerWidth+1}).length; const cut=[...document.querySelectorAll('.qz-c span,.qz-q,.qz-e,.qz-a')].filter(e=>e.scrollWidth>e.clientWidth+1).length; return b.scrollHeight<=b.clientHeight+1 && out===0 && cut===0};
          for(const id of ids){ STATE.quiz=STATE.quiz||{}; ensureQuizState(); const q=QUIZ_INDEX[id];
            STATE.quiz.pending={qid:id,songId:c.songId,concertId:c.id,practiceNo:2,count:2,order:[1,2,3,0]}; UI.quizResult=null; UI.cmd={cid:c.id,phase:c.phase,stack:[rootScreen(c),{s:'log'},{s:'quiz'}]}; UI.lastLog=UI.lastLog||{no:1,menu:'tutti',sections:{},overall:{},mastery:{},songParams:[]}; render();
            if(!fit()) bad.push('Q:'+id);
            UI.quizResult={qid:id,songId:c.songId,correct:false,picked:q.c[3],answer:q.c[0],gain:0.6,bonus:0,before:40.2,after:40.8,streak:0,practiceNo:2}; render();
            if(!fit()) bad.push('A:'+id); }
          STATE.quiz.pending=null; UI.quizResult=null; return [ids.length, bad]})()''')
        lay.append((w,h,bads[0],bads[1][:6],len(bads[1])))
        await ctx.close()
    for x in lay: print('   ',x)
    chk('全問題（出題画面・回答後）がスマホ画面内に収まる（スクロール・はみ出し・見切れなし）', all(x[4]==0 for x in lay), [(x[0],x[1],x[4]) for x in lay])
    await b.close()
  chk('JSエラーなし', not errs, errs[:3])
  print('SUMMARY',sum(R.values()),'/',len(R))
asyncio.run(main())
