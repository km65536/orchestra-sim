import asyncio, json, os, sys
sys.path.insert(0, os.path.dirname(__file__)); import flow as F
from playwright.async_api import async_playwright
URL='file:///home/claude/orch/dist/index.html'
errs=[]; R={}
def chk(n,ok,info=''): R[n]=ok; print(('PASS' if ok else 'FAIL'),n,info)
SNAP="JSON.stringify((()=>{const c=activeConcert();return {id:c.id,phase:c.phase,hall:c.hallId,song:c.songId,done:c.practiceDone,perf:c.perf,ledger:c.ledger,practices:c.practices.length,reh:c.rehearsal,order:STATE.concertOrder}})())"
async def ov(p,tag):
    w=await p.evaluate('[document.documentElement.scrollWidth, innerWidth]')
    if w[0]>w[1]: errs.append(f'overflow {tag} {w}')
async def hire_one(p):
    """団員タブ→募集→採用1名→閉じる。進行状況スナップショットの前後比較と費用確認"""
    await F.open_recruit(p)
    before=await p.evaluate(SNAP); f0=await p.evaluate('STATE.funds'); n0=await p.evaluate('STATE.members.length')
    ids=await p.evaluate('STATE.recruit.candidates.filter(c=>!hireBlockReason(c)).map(c=>[c.id,c.cost])')
    if not ids:
        await p.evaluate('STATE.funds+=2000000; save(); render()')
        f0=await p.evaluate('STATE.funds'); ids=await p.evaluate('STATE.recruit.candidates.filter(c=>!hireBlockReason(c)).map(c=>[c.id,c.cost])')
    cid,cost=ids[0]
    await F.hire(p,cid)
    f1=await p.evaluate('STATE.funds'); n1=await p.evaluate('STATE.members.length'); after=await p.evaluate(SNAP)
    await p.click('[data-act=tback]')
    return before==after, f0-f1==cost, n1==n0+1, cid
async def main():
  async with async_playwright() as pw:
    b=await pw.chromium.launch()
    ctx=await b.new_context(viewport={'width':375,'height':780},device_scale_factor=2,is_mobile=True,has_touch=True)
    p=await ctx.new_page(); p.on('pageerror',lambda e: errs.append('JS '+str(e)))
    await p.goto(URL); await p.evaluate('localStorage.clear()'); await p.reload()
    await p.click('[data-act=newgame]')
    await F.open_concert(p)
    lbl=await p.inner_text('.cmd'); phases=await p.evaluate('PHASES.map(x=>x.id)')
    chk('1 進行手順から募集工程がない','募集' not in lbl and 'recruit' not in phases, lbl.replace('\n',' '))
    await p.screenshot(path='shots/r0steps.png')
    await p.click('.nav [data-tab=members]'); await ov(p,'members')
    btn=await p.query_selector('.trecruit[data-v=recruit]'); chk('2 団員タブに募集ボタン',btn is not None and await btn.is_visible())
    await p.screenshot(path='shots/r1members.png')
    await p.click('[data-act=tgo][data-v=mGroup][data-g=br]'); await p.click('[data-act=tback]')
    await p.click('.trecruit[data-v=recruit]'); await p.click('[data-act=tgo][data-v=recMembers]'); await ov(p,'recruit')
    h=await p.inner_text('.ttitle b'); n=await p.evaluate('STATE.recruit.candidates.length'); shown=await p.eval_on_selector_all('.tbody .trow','e=>e.length'); pages=await p.evaluate('document.querySelector(".tpager span")?.textContent||"1 / 1"')
    chk('3 団員タブから募集画面を開ける',h=='団員を募集' and n==5 and shown>0,f'{h} 候補{n}名（表示{shown}名・{pages}ページ）')
    await p.screenshot(path='shots/r2recruit.png',full_page=False)
    # 9 閉じると元に戻る
    await p.click('[data-act=tback]'); await p.click('[data-act=tback]')
    back=await p.inner_text('.ttitle b')
    chk('9 戻ると元の画面に戻る',back=='団員' and await p.evaluate('UI.tab')=='members' and await p.evaluate('ttop().s')=='mRoot',back)
    # 4/5/6 各段階で募集
    stages=[]; ok5=True; ok6=True; hired=[]
    async def stage(name):
        nonlocal ok5, ok6
        same,costok,cnt,cid=await hire_one(p); stages.append((name,await p.evaluate('activeConcert().phase'),same and cnt)); ok5&=same; ok6&=costok; hired.append(cid)
    await stage('準備前')
    await F.open_concert(p); await F.reserve_hall(p,'small')
    await stage('準備中（会場予約済み）')
    await F.open_concert(p); await F.choose_song(p,'orchestral'); await p.click('[data-act=toPractice]')
    await F.practice_all(p,['tutti']*4)
    await stage('練習期間中(4/10)')
    await F.open_concert(p); await F.practice_all(p,['tutti']*6)
    await stage('本番準備中')
    await F.open_concert(p); await F.perform(p)
    await stage('本番終了後')
    for s in stages: print('   ',s)
    chk('4 演奏会のどの段階でも募集できる',all(x[2] for x in stages) and [x[1] for x in stages]==['setup','setup','practice','prep','result'])
    chk('5 募集・採用で進行状況が変わらない',ok5)
    chk('6 採用費用が正しく差し引かれる',ok6)
    # 7 上限
    full=await p.evaluate('''(()=>{const inst='Tuba';while(countByInst()[inst]<INST[inst].cap){const m=generateMember(inst,'C',0);STATE.members.push(m);}
      const cand=generateMember(inst,'B',0);cand.cost=1000;STATE.recruit.candidates[0]=cand;STATE.recruit.hired=[];STATE.funds+=10000;save();return [countByInst()[inst],INST[inst].cap,cand.id]})()''')
    await F.tnav(p,'members',[{'s':'recruit'},{'s':'recMembers'},{'s':'recCand','id':full[2],'tab':'info'}])
    dis=await p.get_attribute('[data-act=tHire]','disabled'); reason=await p.inner_text('.tbody')
    r=await p.evaluate(f'hireCandidate("{full[2]}")')
    chk('7 在籍上限が機能',dis is not None and '在籍上限' in reason and r is False and await p.evaluate("countByInst().Tuba")==full[1],f'Tuba {full[0]}/{full[1]}')
    # 8 更新
    old=await p.evaluate('STATE.recruit.candidates.map(c=>c.id)'); f0=await p.evaluate('STATE.funds'); snap=await p.evaluate(SNAP)
    await F.reroll(p)
    new=await p.evaluate('STATE.recruit.candidates.map(c=>c.id)'); f1=await p.evaluate('STATE.funds')
    chk('8 候補者の更新',len(new)==5 and not set(old)&set(new) and f0-f1==20000 and snap==await p.evaluate(SNAP),f'¥{f0}→¥{f1}')
    # 資金不足
    await p.evaluate('STATE.funds=0; save(); render()'); rd=await p.get_attribute('[data-act=tReroll]','disabled')
    allDis=True
    for cid0 in await p.evaluate('STATE.recruit.candidates.map(c=>c.id)'):
        await F.tnav(p,'members',[{'s':'recruit'},{'s':'recMembers'},{'s':'recCand','id':cid0,'tab':'info'}]); allDis&=await p.get_attribute('[data-act=tHire]','disabled') is not None
    print('    資金0で採用・再募集とも不可:', allDis and rd is not None)
    await p.evaluate('STATE.funds=500000; save()')
    # 新サイクルで候補が無料更新
    await p.click('.nav [data-tab=concert]')
    c1=await p.evaluate('STATE.recruit.candidates.map(c=>c.id)'); fa=await p.evaluate('STATE.funds')
    await p.click('[data-act=next]'); c2=await p.evaluate('STATE.recruit.candidates.map(c=>c.id)')
    print('    次の演奏会で候補が無料入れ替え:', not set(c1)&set(c2) and await p.evaluate('STATE.funds')==fa, await p.evaluate('activeConcert().phase'))
    # 10 リロード
    ids_before=await p.evaluate('STATE.members.map(m=>m.id)'); fb=await p.evaluate('STATE.funds'); lb=await p.evaluate('STATE.ledger.length')
    await p.reload()
    ids_after=await p.evaluate('STATE.members.map(m=>m.id)')
    chk('10 リロード後も採用団員が保存',ids_before==ids_after and all(h in ids_after for h in hired) and await p.evaluate('STATE.funds')==fb and await p.evaluate('STATE.ledger.length')==lb,f'採用{len(hired)}名・帳簿{lb}件')
    await p.click('.nav [data-tab=records]'); await ov(p,'records'); await p.screenshot(path='shots/r3rec.png',full_page=False)
    # 旧(v2)セーブの互換性：募集工程中のデータ
    v2=await p.evaluate('''(()=>{const s=JSON.parse(localStorage.getItem(CONFIG.SAVE_KEY));s.version=2;delete s.recruit;delete s.ledger;const c=s.concertPrograms[s.activeConcertId];
       c.phase='recruit';c.hallId='small';c.recruit={candidates:[generateMember('Fl','B',1)],hired:[],rerolls:0};c.recruit.candidates[0].cost=50000;localStorage.setItem(CONFIG.SAVE_KEY,JSON.stringify(s));return true})()''')
    await p.reload()
    m=await p.evaluate('[STATE.version, activeConcert().phase, "recruit" in activeConcert(), STATE.recruit.candidates.length, Array.isArray(STATE.ledger)]')
    print('    v2セーブ移行:', m, 'started', await p.evaluate('UI.started'))
    await b.close()
  print('ERRORS',errs)
  print('SUMMARY',sum(R.values()),'/',len(R))
asyncio.run(main())
