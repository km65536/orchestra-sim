"""演奏会タブのコマンド画面UI：全画面の巡回・はみ出し検査（複数の画面サイズ）"""
import asyncio, sys
from playwright.async_api import async_playwright
URL='file:///home/claude/orch/dist/index.html'
GL=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']
SIZES=[('se',375,667),('std',390,844),('max',430,932),('pc',1280,800)]
R={}; errs=[]; problems=[]
def chk(n,ok,info=''): R[n]=bool(ok); print(('PASS' if ok else 'FAIL'),n,info)
CHECK='''(()=>{const b=document.querySelector('.cmd .cbody'), cmd=document.querySelector('.cmd');
  const over=b?Math.max(0,b.scrollHeight-b.clientHeight):-1;
  const page=Math.max(0,document.documentElement.scrollHeight-innerHeight), wide=Math.max(0,document.documentElement.scrollWidth-innerWidth);
  const out=[...document.querySelectorAll('.cmd button')].filter(x=>{const r=x.getBoundingClientRect();return r.width>0&&(r.bottom>innerHeight+1||r.right>innerWidth+1||r.left<-1)}).length;
  const small=[...document.querySelectorAll('.cmd button')].filter(x=>{const r=x.getBoundingClientRect();return r.width>0&&r.height<32}).length;
  const st=document.getElementById('stage3d'); const sh=st?st.getBoundingClientRect().height:0;
  return {scr:UI.cmd&&UI.cmd.stack[UI.cmd.stack.length-1].s, over, page, wide, out, small, stage:Math.round(sh), panel:cmd?Math.round(cmd.getBoundingClientRect().height):0, vh:innerHeight}})()'''
async def look(p,tag,size):
    r=await p.evaluate(CHECK)
    bad=r['over']>1 or r['page']>0 or r['wide']>0 or r['out']>0 or r['small']>0
    if bad: problems.append((size,tag,r))
    return r
async def run(size,w,h,shots):
  async with async_playwright() as pw:
    b=await pw.chromium.launch(args=GL)
    ctx=await b.new_context(viewport={'width':w,'height':h},device_scale_factor=2,is_mobile=size!='pc',has_touch=size!='pc')
    p=await ctx.new_page(); p.on('pageerror',lambda e: errs.append(size+' JS '+str(e)))
    await p.goto(URL); await p.evaluate('localStorage.clear()'); await p.reload(); await p.click('[data-act=newgame]')
    await p.click('.nav [data-tab=concert]'); await p.wait_for_timeout(300)
    async def S(tag):
        r=await look(p,tag,size)
        if shots: await p.screenshot(path=f'shots/g_{size}_{tag}.png')
        return r
    r=await S('entry'); entry_ok = r['scr']=='entry'
    await p.click('[data-act=startConcert]'); r=await S('setup'); setup_r=r
    dis=await p.get_attribute('[data-act=toPractice]','disabled')
    # 選曲：カテゴリー→一覧→詳細→決定
    await p.click('[data-act=cgo][data-v=songCat]'); await S('songCat')
    await p.click('[data-act=cgo][data-v=songList][data-g=symphony]'); await S('songList')
    pg1=await p.evaluate('[...document.querySelectorAll(".cbody .crow")].map(e=>e.dataset.id)')
    if await p.query_selector('[data-act=cpage][data-d="1"]:not([disabled])'):
        await p.click('[data-act=cpage][data-d="1"]'); pg2=await p.evaluate('[...document.querySelectorAll(".cbody .crow")].map(e=>e.dataset.id)')
        await p.click('[data-act=cpage][data-d="-1"]')
    else: pg2=[]
    await p.click('.cbody .crow >> nth=1'); await S('songDetail'); await p.click('[data-act=ctab][data-v=form]'); await S('songDetail2')
    sid=await p.evaluate('cmdTop().id')
    await p.click('[data-act=cback]'); back_ok = await p.evaluate('cmdTop().s')=='songList'
    await p.click(f'.cbody .crow[data-id="{sid}"]'); await p.click('[data-act=chooseSong]')
    st1=await p.evaluate('[cmdTop().s, setupStatus(activeConcert()).song, activeConcert().songId, activeConcert().phase]')
    # 会場：一覧→詳細（3Dプレビュー）→予約
    await p.click('[data-act=cgo][data-v=hallList]'); await S('hallList')
    await p.click('.cbody .crow[data-id=top]') if await p.query_selector('.cbody .crow[data-id=top]') else None
    if await p.evaluate('cmdTop().s')=='hallList': await p.click('[data-act=cpage][data-d="1"]'); await p.click('.cbody .crow[data-id=top]')
    await p.wait_for_timeout(300); prev=await p.evaluate('use3D()?Stage3D.debug().hall:null'); await S('hallDetail')
    topDis=await p.get_attribute('[data-act=reserveHall]','disabled')
    await p.click('[data-act=ctab][data-v=more]'); await S('hallDetail2')
    await p.click('[data-act=cback]')
    if await p.query_selector('[data-act=cpage][data-d="-1"]:not([disabled])'): await p.click('[data-act=cpage][data-d="-1"]')
    await p.click('.cbody .crow[data-id=general]'); f0=await p.evaluate('STATE.funds'); await p.click('[data-act=reserveHall]')
    st2=await p.evaluate('[cmdTop().s, activeConcert().hallId, STATE.funds]')
    # 会場の変更（返金）
    await p.click('[data-act=cgo][data-v=hallList]'); await p.click('.cbody .crow[data-id=small]'); await p.click('[data-act=reserveHall]')
    st2b=await p.evaluate('[activeConcert().hallId, STATE.funds]')
    # 別タブへ移動して戻っても保持
    await p.click('.nav [data-tab=home]'); await p.click('.nav [data-tab=concert]'); keep=await p.evaluate('[cmdTop().s, activeConcert().songId, activeConcert().hallId]')
    # 指揮者
    await p.click('[data-act=cgo][data-v=condList]'); await S('condList')
    await p.click('.cbody .crow >> nth=0'); await S('condDetail'); await p.click('[data-act=ctab][data-v=trait]'); await S('condDetail2')
    cbtn=await p.query_selector('[data-act=chooseCond]')
    if cbtn: await cbtn.click()
    else: await p.click('[data-act=cback]'); await p.click('[data-act=cback]')
    st3=await p.evaluate('[cmdTop().s, setupStatus(activeConcert())]'); await S('setupDone')
    await p.click('[data-act=toPractice]'); r=await S('practice'); st4=await p.evaluate('[activeConcert().phase, cmdTop().s]')
    # 練習：全体合奏／セクション／個人
    await p.click('[data-act=cgo][data-v=tutti]'); await S('tutti'); await p.click('[data-act=fp][data-path=tutti][data-d="-1"]:not([disabled]) >> nth=0'); await S('tutti9')
    await p.click('[data-act=fauto][data-path=tutti]'); await p.click('[data-act=runPractice]'); await S('log')
    after1=await p.evaluate('activeConcert().practiceDone')
    await p.click('[data-act=cHome]')
    await p.click('[data-act=cgo][data-v=section]'); await S('section'); await p.click('.cbody [data-sec=br]'); await S('secEdit')
    await p.click('.cfoot [data-act=cback]'); await p.click('[data-act=runPractice]'); await p.click('[data-act=cHome]')
    await p.click('[data-act=cgo][data-v=indivPick]'); await S('indivPick'); await p.click('[data-act=ctab][data-v=ww]'); await p.click('.cbody .crow >> nth=0')
    await p.click('[data-act=cgo][data-v=indivFocus]'); await S('indivFocus'); await p.click('[data-act=runPractice]'); await p.click('[data-act=cHome]')
    await p.click('[data-act=cgo][data-v=perf]'); await S('perf'); await p.click('[data-act=ctab][data-v=all]'); await S('perf2'); await p.click('[data-act=cback]')
    await p.click('[data-act=cgo][data-v=history]'); await S('history'); await p.click('[data-act=cback]')
    for i in range(7):
        await p.click('[data-act=cgo][data-v=tutti]'); await p.click('[data-act=runPractice]')
        await p.click('.cfoot .cbtn.big')
    st5=await p.evaluate('[activeConcert().phase, activeConcert().practiceDone, cmdTop().s]'); await S('prep')
    await p.click('[data-act=cgo][data-v=rehearse]'); await S('rehearse'); await p.click('[data-act=hall]')
    await p.click('[data-act=cgo][data-v=policy]'); await S('policy'); await p.click('[data-act=policy][data-v=balance]')
    await p.click('[data-act=cgo][data-v=prepInfo]'); await S('prepInfo'); await p.click('[data-act=ctab][data-v=money]'); await S('prepInfo2'); await p.click('[data-act=cback]')
    st6=await p.evaluate('[activeConcert().policy, activeConcert().rehearsal.done, cmdTop().s]')
    await p.click('[data-act=perform]'); await p.wait_for_timeout(1500)
    showing=await p.evaluate('UI.showing'); r=await S('show')
    await p.wait_for_timeout(15000); await S('show2')
    if showing: await p.click('[data-act=skipShow]')
    await S('result')
    for t in ['resEval','resReview','resGrowth','resMoney']:
        await p.click(f'[data-act=cgo][data-v={t}]'); await S(t); await p.click('[data-act=cback]')
    st7=await p.evaluate('[activeConcert().phase, cmdTop().s]')
    await p.click('[data-act=next]'); st8=await p.evaluate('[activeConcert().phase, cmdTop().s, activeConcert().conductorId===STATE.conductorId]')
    await b.close()
    return dict(entry_ok=entry_ok, dis=dis is not None, pg=(pg1,pg2), back_ok=back_ok, st1=st1, prev=prev, topDis=topDis is not None, f0=f0, st2=st2, st2b=st2b, keep=keep, st3=st3, st4=st4, after1=after1, st5=st5, st6=st6, showing=showing, show_stage=r, setup_r=setup_r, st7=st7, st8=st8)
async def main():
  res={}
  for size,w,h in SIZES:
    res[size]=await run(size,w,h, True)
    print(size, res[size]['show_stage'])
  d=res['std']
  chk('演奏会を始める→準備画面', d['entry_ok'] and d['st1'][0]=='setup')
  chk('3項目未完了では練習へ進めない', d['dis'])
  chk('選曲：カテゴリー→一覧（ページ分割）→詳細→決定→準備へ戻る', d['back_ok'] and d['st1'][1] and d['st1'][3]=='setup' and d['pg'][1] and not set(d['pg'][0])&set(d['pg'][1]), d['st1'])
  chk('会場：3Dプレビュー・資金不足は不可・予約で支払い', d['prev']=='top' and d['topDis'] and d['st2'][0]=='setup' and d['st2'][1]=='general' and d['f0']-d['st2'][2]==90000, d['st2'])
  chk('会場の変更は前の予約を返金', d['st2b'][0]=='small' and d['st2b'][1]==d['f0']-30000, d['st2b'])
  chk('別タブへ移動しても選択内容を保持', d['keep'][1] and d['keep'][2]=='small', d['keep'])
  chk('指揮者を選択（前回の担当を引き継ぎ）', d['st3'][1]['conductor'] and d['st3'][1]['ready'], d['st3'])
  chk('3項目完了で練習期間へ', d['st4']==['practice','practice'])
  chk('練習10回（従来どおり）→本番準備', d['after1']==1 and d['st5'][0]=='prep' and d['st5'][1]==10, d['st5'])
  chk('本番準備：ホール練習・方針・確認', d['st6']==['balance',True,'prep'], d['st6'])
  chk('本番中は最小限のパネル', d['showing'] and d['show_stage']['panel']<=80, d['show_stage'])
  chk('結果表示→次の演奏会', d['st7']==['result','result'] and d['st8'][0]=='setup' and d['st8'][1]=='entry' and d['st8'][2], d['st8'])
  st=[res[s]['show_stage'] for s in res]
  chk('本番中は3D領域を最大化（パネルは最小限）', all(x['stage']>x['panel']*5 for x in st), [(x['vh'],x['stage'],x['panel']) for x in st])
  print('  通常画面の 3D領域/操作パネル(px):', [(s_, res[s_]['setup_r']['vh'], res[s_]['setup_r']['stage'], res[s_]['setup_r']['panel']) for s_ in res])
  chk('全画面・全サイズではみ出し／スクロールなし／小さすぎるボタンなし', not problems, problems)
  chk('JSエラーなし', not errs, errs[:3])
  print('SUMMARY',sum(R.values()),'/',len(R))
asyncio.run(main())
