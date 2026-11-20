"""v4 改修（3D演奏会・指揮者・首席・Perc統一）の確認テスト"""
import asyncio, json, os, sys
sys.path.insert(0, os.path.dirname(__file__)); import flow as F
from playwright.async_api import async_playwright
URL='file:///home/claude/orch/dist/index.html'
GL=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']
R={}; errs=[]
def chk(n,ok,info=''): R[n]=bool(ok); print(('PASS' if ok else 'FAIL'),n,info)
async def ov(p,tag):
    w=await p.evaluate('[document.documentElement.scrollWidth, innerWidth]')
    if w[0]>w[1]: errs.append(f'overflow {tag} {w}')
async def main():
  async with async_playwright() as pw:
    b=await pw.chromium.launch(args=GL)
    ctx=await b.new_context(viewport={'width':390,'height':780},device_scale_factor=2,is_mobile=True,has_touch=True)
    p=await ctx.new_page(); p.on('pageerror',lambda e: errs.append('JS '+str(e))); p.on('console',lambda m: m.type=='error' and errs.append('C '+m.text))
    await p.goto(URL); await p.evaluate('localStorage.clear()'); await p.reload(); await p.click('[data-act=newgame]')
    # 11 Perc 統一
    src=open('dist/index.html',encoding='utf8').read()
    perc=await p.evaluate('''[INSTRUMENTS.map(i=>i.id).includes('Timp'), SEC.pc.insts.join(','), SONG_LIBRARY.filter(s=>JSON.stringify(s).includes('Timp')).length,
      STATE.members.filter(m=>m.inst==='Timp').length, countByInst().Perc, INST.Perc.cap, STATE.recruit.candidates.filter(c=>c.inst==='Timp').length, ORIGINAL_CHARACTERS.find(o=>o.oid==='oc_shinonome').inst]''')
    chk('11 Perc統一（楽器枠・曲・団員・募集）', perc[0] is False and perc[1]=='Perc' and perc[2]==0 and perc[3]==0 and perc[4]==3 and perc[6]==0 and perc[7]=='Perc' and "'Timp'" not in src.split('function migrate')[0][-200000:].replace("m.inst === 'Timp'",'') , perc)
    # 10 首席
    pr=await p.evaluate('INSTRUMENTS.every(i=>principalOf(i.id) && principalOf(i.id).inst===i.id)')
    tags=0
    for g,insts in [('str',['Vn1','Vn2','Va','Vc','Cb']),('ww',['Fl','Ob','Cl','Fg']),('br',['Hr','Tp','Tb','Tuba']),('pc',['Perc'])]:
        for i in insts:
            await F.tnav(p,'members',[{'s':'mGroup','g':g},{'s':'mInst','inst':i}]); await ov(p,'members')
            tags+=await p.evaluate('[...document.querySelectorAll(".tbody .trow")].filter(r=>r.querySelector(".tag.gold")).length')
    vn=await p.evaluate('STATE.members.filter(m=>m.inst==="Vn1").map(m=>m.id)'); old=await p.evaluate('STATE.principals.Vn1')
    other=[x for x in vn if x!=old][0]
    await F.set_principal(p,other)
    newp=await p.evaluate('STATE.principals.Vn1')
    await F.dismiss(p,other)   # 首席のままでは除籍できない
    blocked=await p.evaluate(f'!!memberById("{other}")')
    # 契約終了など除籍操作以外の退団（force）では、従来どおり最も能力の高い団員が後任になる
    await p.evaluate(f'dismissMember("{other}",{{force:true}}); render()')
    after=await p.evaluate('STATE.principals.Vn1'); best=await p.evaluate('STATE.members.filter(m=>m.inst==="Vn1").sort((a,b)=>memberAvg(b)-memberAvg(a))[0].id')
    chk('10 首席の管理（自動任命・任命・除籍制限・退団時の後任）', pr and tags==14 and newp==other and blocked and after==best and after!=other, f'表示{tags}件・任命→{newp==other}・首席は除籍不可→{blocked}・退団後→最上位{after==best}')
    # 指揮者
    await F.tnav(p,'members',[{'s':'mConds'}]); await ov(p,'conductors'); await p.screenshot(path='shots/w_cond.png')
    f0=await p.evaluate('STATE.funds+=2000000; save(); render(); STATE.funds')
    cid=await p.evaluate('STATE.conductorMarket.candidates[0].id'); cost=await p.evaluate('STATE.conductorMarket.candidates[0].cost')
    await F.hire_cond(p,cid)
    await F.set_cond(p,cid)
    cond=await p.evaluate('[STATE.conductors.length, STATE.conductorId, STATE.funds]')
    ab=await p.evaluate('JSON.stringify(activeConductor().abilities)')
    msg=await F.train_run(p,'c_master',cid); ab2=await p.evaluate('JSON.stringify(activeConductor().abilities)')
    await ov(p,'train'); await p.screenshot(path='shots/w_train.png')
    chk('指揮者：採用・変更・育成', cond[0]==2 and cond[1]==cid and f0-cond[2]==cost and ab!=ab2 and 'マスタークラス' in msg, (msg,cond,f0,cost,ab==ab2))
    # 1/9 進行（募集は独立）
    await F.open_concert(p); await p.wait_for_timeout(500)
    in3d=await p.evaluate('[document.body.classList.contains("mode3d"), Stage3D.ok, JSON.stringify(Stage3D.debug())]')
    chk('2 3D表示が動作', in3d[0] and in3d[1], in3d[2])
    await p.screenshot(path='shots/w_hall.png')
    halls=[]
    for h in ['community','top']:
        await F.hall_detail(p,h); await p.wait_for_timeout(300); halls.append(await p.evaluate('Stage3D.debug().hall'))
        await p.screenshot(path=f'shots/w_prev_{h}.png')
    chk('8 ホールごとの違い（会場の詳細で3Dが切り替わる）', halls==['community','top'], halls)
    await F.reserve_hall(p,'large')
    phase=await p.evaluate('activeConcert().phase')
    # 募集を演奏会途中で
    await F.open_recruit(p)
    snap=await p.evaluate('JSON.stringify(activeConcert())')
    cand=await p.evaluate('STATE.recruit.candidates.find(c=>!hireBlockReason(c))?.id')
    if cand: await F.hire(p,cand)
    chk('9 募集が演奏会から独立', phase=='setup' and snap==await p.evaluate('JSON.stringify(activeConcert())') and 'recruit' not in await p.evaluate('PHASES.map(x=>x.id).join()'))
    await F.open_concert(p)
    await F.to_setup(p); await p.click('[data-act=cgo][data-v=songCat]'); await p.click('[data-act=cgo][data-v=songList][data-g=symphony]')
    row=await F.find_row(p,'.cbody .crow[data-id=dvorak9]'); await row.click(); await p.wait_for_timeout(300)
    dbg=await p.evaluate('Stage3D.debug()')
    req=await p.evaluate('Object.values(songRequirements(findSong("dvorak9"))).reduce((a,b)=>a+b,0)')
    have=await p.evaluate('Object.entries(songRequirements(findSong("dvorak9"))).reduce((a,[i,n])=>a+Math.min(n,countByInst()[i]),0)')
    chk('3 団員が正しく配置（曲の編成どおり・欠員は空席・首席は前列）', dbg['seats']==req and dbg['actors']==have and dbg['empty']==req-have, f"席{dbg['seats']} 奏者{dbg['actors']} 空席{dbg['empty']} 首席{dbg['principals']}")
    await p.click('[data-act=chooseSong]')
    if not await p.evaluate('setupStatus(activeConcert()).conductor'): await F.choose_conductor(p)
    await p.click('[data-act=toPractice]')
    # 練習アニメ
    await p.click('[data-act=cgo][data-v=section]'); await p.click('[data-act=runPractice]'); await p.wait_for_timeout(1500)
    sec=await p.evaluate('Stage3D.debug()'); await p.screenshot(path='shots/w_prac.png')
    chk('4a 練習で楽器を構えて演奏', sec['mode']=='practice' and max(sec['actorsW'])>0.5, sec['actorsW'])
    await p.evaluate('UI.practiceTest={scale:0.04}'); await F.finish_practice(p); await p.click('.cfoot .cbtn.big')
    await F.practice_all(p,['tutti']*9)
    await p.click('[data-act=perform]')
    # 演奏中の同期チェック
    samples=[]; cpose=[]; showcam=None
    for k in range(60):
        await p.wait_for_timeout(500)
        st=await p.evaluate('Stage3D.debug().stage')
        if st=='play':
            ss=await p.evaluate('Stage3D.sections()'); samples.append(ss); cpose.append(await p.evaluate('Stage3D.conductorPose()'))
            if len(samples)==6: await p.screenshot(path='shots/w_play.png')
            if len(samples)==10: showcam=await p.evaluate('Stage3D.camName()')
        if st=='applause': await p.screenshot(path='shots/w_applause.png'); break
    # 同期：構え(w)が各パートの演奏区間(active)と一致する割合
    agree=tot=0; restSeen=False
    for ss in samples:
        for s in ss:
            if s['n']==0: continue
            tot+=1; agree+= (s['w']>0.5)==s['active']
            if not s['active']: restSeen=True
    ys=[c['y'] for c in cpose]
    chk('5 音楽とアニメーションの同期（パートの演奏区間と構えが一致）', tot and agree/tot>0.8 and restSeen, f'一致 {agree}/{tot}・休符で楽器を下ろす区間あり={restSeen}')
    chk('6 指揮者が指揮台で指揮動作', len(set(round(y,2) for y in ys))>5 and all(c['visible'] for c in cpose), f'右手の高さ {min(ys):.2f}〜{max(ys):.2f}')
    secs=[s['sec'] for s in samples[0] if s['n']] if samples else []
    chk('4b 演奏中に全パートが楽器を構えて演奏する', secs and all(any(ss[k]['w']>0.5 for ss in samples) for k,s0 in enumerate(samples[0]) if s0['n']), secs)
    for k in range(20):
        if not await p.evaluate('UI.showing'): break
        await p.wait_for_timeout(500)
    res=await p.evaluate('[activeConcert().phase, activeConcert().result.rank, UI.showing]'); await p.screenshot(path='shots/w_result.png')
    # 7 カメラ：通常は正面固定（視点ボタンなし）。3D内部の各視点（練習の演出・ホールの下見で使用）は従来どおり切り替わる
    nobtn=await p.evaluate('document.querySelectorAll("[data-act=cam]").length===0')
    cams=[]
    for cname in ['overview','front','conductor','hs','ls','ww','br','pc','hallRear','hallSide','fromStage']:
        await p.evaluate(f'Stage3D.setCamera("{cname}")'); await p.wait_for_timeout(300); cams.append(await p.evaluate('Stage3D.camName()'))
    await p.evaluate('Stage3D.setCamera("front")')
    chk('7 視点は正面固定（視点ボタンなし・本番も正面）／内部の視点切り替えは正常', nobtn and showcam=='front' and cams==['overview','front','conductor','hs','ls','ww','br','pc','hallRear','hallSide','fromStage'], (nobtn, showcam, cams))
    # 12 セーブ・ロード
    st=await p.evaluate('JSON.stringify({c:STATE.conductors.map(x=>x.id),pr:STATE.principals,looks:STATE.members.map(m=>JSON.stringify(m.look)),f:STATE.funds,ph:activeConcert().phase})')
    await p.reload(); st2=await p.evaluate('JSON.stringify({c:STATE.conductors.map(x=>x.id),pr:STATE.principals,looks:STATE.members.map(m=>JSON.stringify(m.look)),f:STATE.funds,ph:activeConcert().phase})')
    # 旧v3セーブ（Timpあり・指揮者なし）からの移行
    mig=await p.evaluate('''(()=>{const s=JSON.parse(localStorage.getItem(CONFIG.SAVE_KEY));s.version=3;delete s.conductors;delete s.conductorId;delete s.conductorMarket;delete s.principals;
       s.members.forEach(m=>delete m.look); s.members.find(m=>m.inst==='Perc').inst='Timp'; localStorage.setItem(CONFIG.SAVE_KEY,JSON.stringify(s)); return true})()''')
    await p.reload()
    m=await p.evaluate('[STATE.version, STATE.members.filter(m=>m.inst==="Timp").length, STATE.conductors.length, !!STATE.principals.Perc, STATE.members.every(m=>m.look)]')
    looks1=await p.evaluate('STATE.members.map(m=>JSON.stringify(m.look))'); await p.reload(); looks2=await p.evaluate('STATE.members.map(m=>JSON.stringify(m.look))')
    chk('12 セーブ・ロード（最新版の保持・v3からの移行・外見は固定）', st==st2 and m==[5,0,1,True,True] and looks1==looks2, m)
    # 13 スマホ操作：横はみ出しなし・タップ領域
    small=await p.evaluate('[...document.querySelectorAll("button")].filter(b=>b.offsetParent&&b.getBoundingClientRect().height<30).map(b=>b.textContent.trim()).slice(0,5)')
    chk('13 スマホ縦画面（はみ出し・JSエラーなし）', not errs, (errs[:3], 'small buttons', small))
    await b.close()
  print('SUMMARY',sum(R.values()),'/',len(R))
asyncio.run(main())
