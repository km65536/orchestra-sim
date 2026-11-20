import asyncio, os, sys
sys.path.insert(0, os.path.dirname(__file__)); import flow as F
from playwright.async_api import async_playwright
URL='file:///home/claude/orch/dist/index.html'
errs=[]; R={}
def chk(n,ok,info=''): R[n]=ok; print(('PASS' if ok else 'FAIL'),n,info)
async def ov(p,tag):
    w=await p.evaluate('[document.documentElement.scrollWidth, innerWidth]')
    if w[0]>w[1]: errs.append(f'overflow {tag} {w}')
async def main():
  os.makedirs('shots',exist_ok=True)
  async with async_playwright() as pw:
    b=await pw.chromium.launch()
    ctx=await b.new_context(viewport={'width':375,'height':780},device_scale_factor=2,is_mobile=True,has_touch=True)
    p=await ctx.new_page()
    p.on('pageerror',lambda e: errs.append('JS '+str(e)))
    # 旧セーブ(v1)があっても壊れない
    await p.goto(URL); await p.evaluate("localStorage.setItem('orchestraSim.save', JSON.stringify({version:1,concertPrograms:{}}))"); await p.reload()
    note=await p.inner_text('main'); print('old save note:', 'セーブデータは引き継げません' in note)
    await p.click('[data-act=newgame]')
    f=await p.evaluate('STATE.funds'); chk('1 初期資金',f==300000,f)
    await ov(p,'home'); await p.screenshot(path='shots/a1home.png',full_page=True)
    await F.open_concert(p)
    ph=await p.evaluate('activeConcert().phase'); chk('8 サイクル最初に準備（会場の予約を含む）',ph=='setup' and await F.scr(p)=='setup',ph)
    await p.screenshot(path='shots/a2hall.png'); await ov(p,'setup')
    halls=await p.evaluate('CONFIG.halls.map(h=>[h.fee,h.capacity,h.acoustics])'); chk('9 ホールごとに料金・性能が異なる',len(set(map(tuple,halls)))==5,halls)
    await F.hall_detail(p,'top'); topDisabled=await p.get_attribute('[data-act=reserveHall]','disabled'); chk('11a 資金不足で高額ホール不可',topDisabled is not None)
    await F.reserve_hall(p,'general')
    f2=await p.evaluate('STATE.funds'); chk('8b ホール料金支払い',f2==300000-90000,f2)
    await p.click('[data-act=cgo][data-v=songCat]'); await ov(p,'selection')
    tabs=await p.eval_on_selector_all('.cbody .bigbtn b','els=>els.map(e=>e.textContent)'); chk('2 タブは管弦楽曲・交響曲のみ',tabs==['管弦楽曲','交響曲'],tabs)
    await p.click('[data-act=cgo][data-v=songList][data-g=symphony]')
    genres=await p.evaluate('[...document.querySelectorAll(".cbody .crow")].map(e=>findSong(e.dataset.id).genre)'); print('  symphony list',set(genres))
    await p.click('.cbody .crow >> nth=1'); t=await p.inner_text('.cbody .dt'); print('  詳細表示',t); await p.screenshot(path='shots/a4win.png')
    await p.click('[data-act=cback]'); await p.click('.cbody .crow >> nth=3'); picked=await p.evaluate('cmdTop().id')
    await p.click('[data-act=chooseSong]')
    await F.choose_conductor(p); await p.click('[data-act=toPractice]')
    c=await p.evaluate('({songId:activeConcert().songId, phase:activeConcert().phase, keys:Object.keys(activeConcert()), mastery:Object.keys(activeConcert().perf.mastery)})')
    chk('3 1曲だけ選択できる',c['songId']==picked and c['phase']=='practice',c['songId'])
    src=open('dist/index.html',encoding='utf8').read()
    chk('4 3曲構成の廃止',not any(k in src for k in ['前曲','中曲','メイン曲','opener','encore','SLOTS']) and c['mastery']==['underst','comp'],c['mastery'])
    # 練習で能力が上がらない
    before=await p.evaluate('JSON.stringify(STATE.members.map(m=>m.abilities))')
    await F.practice_all(p,['tutti','section','individual','tutti','section','individual','tutti','section','tutti','section'])
    after=await p.evaluate('JSON.stringify(STATE.members.map(m=>m.abilities))')
    perf=await p.evaluate('activeConcert().perf.mastery.comp')
    chk('5 通常練習で恒久能力が上がらない',before==after and perf>0, f'mastery comp {perf:.1f}')
    # 育成
    await p.click('.nav [data-tab=train]'); await ov(p,'train'); await p.screenshot(path='shots/a6train.png',full_page=True)
    fb=await p.evaluate('STATE.funds'); ab=await p.evaluate('membersOfSection("br").reduce((s,m)=>s+Object.values(m.abilities).reduce((a,b)=>a+b,0),0)')
    cost=await p.evaluate('trainingCost(findTraining("masterclass"),"br")')
    msg=await F.train_run(p,'masterclass','br'); fa=await p.evaluate('STATE.funds'); aa=await p.evaluate('membersOfSection("br").reduce((s,m)=>s+Object.values(m.abilities).reduce((a,b)=>a+b,0),0)')
    chk('6 資金で能力を育成',fa==fb-cost and aa>ab,f'¥{fb}→¥{fa} 能力合計 {ab}→{aa}')
    chk('7 内容に応じたメッセージ',msg=='プロの演奏家による特別講習を実施した！',msg)
    await p.screenshot(path='shots/a7trres.png',full_page=True)
    again=await p.evaluate('trainingBlockReason(activeConcert(),"masterclass","br")'); print('  同一対象2回目:',again)
    # 個人レッスン・楽器
    mid=await p.evaluate('membersOfSection("ww")[0].id')
    print('  lesson:',await F.train_run(p,'lesson',mid,ab='tone',sec='ww'))
    print('  instrument:',await F.train_run(p,'instrument',mid,sec='ww'), (await p.inner_text('.tbody')).replace('\n',' ')[:80])
    pot=await p.evaluate('STATE.members.filter(m=>ABILITIES.some(a=>m.abilities[a.id]>m.potential[a.id])).length'); print('  潜在能力超過:',pot)
    # 資金不足
    saved=await p.evaluate('STATE.funds'); await p.evaluate('STATE.funds=1000'); await F.train_target(p,'concert','hs')
    dis=await p.get_attribute('[data-act=tTrainRun]','disabled'); reason=await p.inner_text('.treason')
    chk('11b 資金不足で育成不可',dis is not None and '資金不足' in reason,reason)
    await p.evaluate(f'STATE.funds={saved}; save()'); 
    # 本番準備
    await p.click('.nav [data-tab=concert]'); await p.screenshot(path='shots/a8prep.png',full_page=True); await ov(p,'prep')
    await p.evaluate('STATE.funds=0; render()'); await p.click('[data-act=cgo][data-v=rehearse]')
    rd=await p.get_attribute('[data-act=hall]','disabled'); chk('11c 資金不足でホール練習不可',rd is not None)
    await p.click('[data-act=cback]')
    await p.evaluate(f'STATE.funds={saved}; save(); render()'); await F.set_policy(p,'balance')
    await F.rehearse(p)
    fbefore=await p.evaluate('STATE.funds')
    await p.click('[data-act=perform]')
    if await p.evaluate('UI.showing'): await p.click('[data-act=skipShow]')   # 3D演出はスキップして結果へ
    res=await p.evaluate('activeConcert().result'); s=res['settlement']
    fafter=await p.evaluate('STATE.funds')
    print('  result',res['rank'],res['total'],'net',s['net'],'funds',fbefore,'→',fafter)
    await p.screenshot(path='shots/a9result.png',full_page=True); await ov(p,'result')
    # 報酬が評価で変動
    var=await p.evaluate('(()=>{const c=activeConcert();return [settlementFor(c,35,"D").net,settlementFor(c,65,"B").net,settlementFor(c,90,"S").net]})()')
    chk('10 結果に応じて報酬が変動',var[0]<var[1]<var[2] and fafter-fbefore==s['net'],var)
    # リロード
    cid=await p.evaluate('STATE.activeConcertId'); sp=await p.evaluate('JSON.stringify(STATE.songParams)')
    await p.reload()
    chk('14 リロード後も保持',await p.evaluate('STATE.activeConcertId')==cid and await p.evaluate('activeConcert().phase')=='result' and await p.evaluate('STATE.funds')==fafter)
    await p.click('.nav [data-tab=concert]'); await p.click('[data-act=next]')
    # 2回目以降
    ok=True
    for k in range(2):
        c2=await p.evaluate('[activeConcert().phase, activeConcert().number, activeConcert().perf.mastery.comp, activeConcert().songId, activeConcert().hallId]')
        ok = ok and c2[0]=='setup' and c2[2]==0 and c2[3] is None
        await F.setup_all(p,'small','orchestral')
        await F.practice_all(p)
        await F.perform(p)
        await p.click('[data-act=next]')
    n=await p.evaluate('STATE.concertOrder.length'); first=await p.evaluate('STATE.concertPrograms[STATE.concertOrder[0]].result.rank')
    sp2=await p.evaluate('JSON.parse(JSON.stringify(STATE.songParams))'); sp1=__import__('json').loads(sp)
    kept=all(sp2[k]['base']>=v['base'] and sp2[k]['underst']>=v['underst'] for k,v in sp1.items())
    chk('12 複数回でデータ引き継ぎ',ok and n==4 and first==res['rank'] and kept,f'concerts {n}')
    await p.click('.nav [data-tab=records]'); await ov(p,'records'); await p.screenshot(path='shots/a10rec.png',full_page=True)
    await F.member_detail(p, await p.evaluate('STATE.members[0].id'), 'abil'); await ov(p,'member')
    await p.click('[data-act=tTrainMember]'); print('  団員詳細→育成:',await p.evaluate('[UI.tab,ttop().s,UI.trPre]'))
    await b.close()
  chk('13 スマホ縦画面（横はみ出し・JSエラーなし）',not errs,errs)
  print('SUMMARY',sum(R.values()),'/',len(R))
asyncio.run(main())
