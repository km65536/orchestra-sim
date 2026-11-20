"""ホーム・団員・育成・記録：全画面の巡回（4サイズ）と機能確認"""
import asyncio, json, os, sys
sys.path.insert(0, os.path.dirname(__file__)); import flow as F
from playwright.async_api import async_playwright
URL='file:///home/claude/orch/dist/index.html'
GL=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']
SIZES=[('se',375,667),('std',390,844),('max',430,932),('pc',1280,800)]
R={}; errs=[]; problems=[]; visited={}
def chk(n,ok,info=''): R[n]=bool(ok); print(('PASS' if ok else 'FAIL'),n,info)
CHECK='''(()=>{const tv=document.querySelector('.tv'), b=document.querySelector('.tv .tbody'); if(!tv) return {none:true};
  const over=Math.max(0,b.scrollHeight-b.clientHeight), page=Math.max(0,document.documentElement.scrollHeight-innerHeight), wide=Math.max(0,document.documentElement.scrollWidth-innerWidth);
  const vis=[...tv.querySelectorAll('button,input')].filter(x=>x.getBoundingClientRect().width>0);
  const out=vis.filter(x=>{const r=x.getBoundingClientRect();return r.bottom>innerHeight+1||r.right>innerWidth+1||r.left<-1||r.top<-1}).length;
  const small=vis.filter(x=>x.getBoundingClientRect().height<40).map(x=>x.textContent.trim().slice(0,8));
  const nav=document.getElementById('nav').getBoundingClientRect(), tvr=tv.getBoundingClientRect(), bodyR=b.getBoundingClientRect();
  const overlap=Math.max(0,Math.round(tvr.bottom-nav.top));
  // 本文の要素が本文領域からはみ出していないか（overflowで隠していないかの確認）
  const escaped=[...b.querySelectorAll('*')].filter(e=>{const r=e.getBoundingClientRect();return r.height>0&&(r.bottom>bodyR.bottom+1||r.right>bodyR.right+1)}).length;
  // 見切れた主要テキスト（行タイトル・見出し）
  const cut=[...tv.querySelectorAll('.tr-t,.ttitle b,.tcat b,.tbigchoice b,.tn-t,.tbtn,.tsub button,.tmhead b')].filter(e=>e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+2).map(e=>e.textContent.trim().slice(0,14));
  const tiny=[...tv.querySelectorAll('*')].filter(e=>e.childElementCount===0&&e.textContent.trim()&&parseFloat(getComputedStyle(e).fontSize)<11).map(e=>e.className+':'+e.textContent.trim().slice(0,6));
  return {scr:(UI.tnav&&UI.tnav[UI.tab])?UI.tnav[UI.tab].slice(-1)[0].s:'', over, page, wide, out, small, overlap, escaped, cut, tiny}})()'''
async def look(p,size):
    r=await p.evaluate(CHECK)
    if r.get('none'):
        if await p.evaluate('UI.tab')!='concert': problems.append((size,'no tv'))
        return r
    visited.setdefault(size,set()).add(r['scr'])
    bad={k:v for k,v in r.items() if k not in('scr',) and v and v!=[] }
    if bad: problems.append((size,r['scr'],bad))
    return r
async def run(size,w,h):
  async with async_playwright() as pw:
    b=await pw.chromium.launch(args=GL)
    ctx=await b.new_context(viewport={'width':w,'height':h},device_scale_factor=1,is_mobile=size!='pc',has_touch=size!='pc')
    p=await ctx.new_page(); p.on('pageerror',lambda e: errs.append(size+' JS '+str(e)))
    await p.goto(URL); await p.evaluate('localStorage.clear()'); await p.reload(); await p.click('[data-act=newgame]')
    L=lambda: look(p,size)
    async def go(sel): await p.click(sel); return await L()
    async def back(): await p.click('[data-act=tback]'); return await L()
    out={}
    # 1回目の演奏会を最後まで進め、記録・成長が揃った状態にする
    await p.evaluate('STATE.funds+=3000000; save()')
    await F.setup_all(p,'small','orchestral'); await F.practice_all(p); await F.perform(p); await p.click('[data-act=next]')
    await F.open_concert(p); await F.reserve_hall(p,'small')
    # ===== ホーム =====
    await p.click('.nav [data-tab=home]'); await L()
    out['home_back_hidden']=await p.evaluate('getComputedStyle(document.querySelector(".tback")).visibility==="hidden"')
    for v in ['hFinance','hOrch','hPlan','hNotice','hRecent','hCond']:
        await go(f'[data-act=tgo][data-v={v}]')
        if v=='hNotice':
            n=await p.eval_on_selector_all('.trow.note','e=>e.length'); out['notices']=n
        await back()
    await go('[data-act=tgo][data-v=hNotice]'); await go('.trow.note >> nth=0'); out['note_jump']=await p.evaluate('UI.tab')
    # ===== 団員 =====
    await p.click('.nav [data-tab=members]'); await L()
    out['mroot_btns']=await p.evaluate('[...document.querySelectorAll(".tcat b,.trecruit b")].map(e=>e.textContent)')
    insts=[]
    for g in ['str','ww','br','pc']:
        await go(f'[data-act=tgo][data-v=mGroup][data-g={g}]')
        ilist=await p.evaluate('[...document.querySelectorAll("[data-act=tgo][data-v=mInst]")].map(e=>e.dataset.inst)')
        for i in ilist:
            await go(f'[data-act=tgo][data-v=mInst][data-inst={i}]'); insts.append(i)
            first=await p.query_selector('.tbody .trow')
            if first:
                await first.click(); await L(); await go('[data-act=tsub][data-v=info]'); await back()
            await back()
        await back()
    out['insts']=insts
    # ページ送り：第1ヴァイオリンを一時的に多くして一覧が複数ページになることを確認
    await p.evaluate('window.__bk=JSON.stringify(STATE.members); const m=STATE.members.find(x=>x.inst==="Vn1"); for(let i=0;i<14;i++) STATE.members.push(Object.assign(JSON.parse(JSON.stringify(m)),{id:"pg"+i,name:m.name+i})); render()')
    await go('[data-act=tgo][data-v=mGroup][data-g=str]'); await go('[data-act=tgo][data-v=mInst][data-inst=Vn1]')
    pg1=await p.evaluate('[...document.querySelectorAll(".tbody .trow")].map(e=>e.dataset.id)'); lab=await p.inner_text('.tpager')
    await go('[data-act=tpage][data-d="1"]'); pg2=await p.evaluate('[...document.querySelectorAll(".tbody .trow")].map(e=>e.dataset.id)')
    await p.click('.nav [data-tab=home]'); await p.click('.nav [data-tab=members]'); pkeep=await p.evaluate('ttop().page')
    out['paged']=[len(pg1)>0, len(pg2)>0, not set(pg1)&set(pg2), pkeep==1, lab.replace('\n',' ')]
    await p.evaluate('STATE.members=JSON.parse(window.__bk); render()'); await back(); await back()
    # 団員詳細：首席任命・育成への移動・退団
    await go('[data-act=tgo][data-v=mGroup][data-g=str]'); await go('[data-act=tgo][data-v=mInst][data-inst=Vn1]')
    rows=await p.query_selector_all('.tbody .trow'); await rows[1].click(); await L()
    mid=await p.evaluate('ttop().id'); await go('[data-act=tsub][data-v=info]')
    await go('[data-act=tPrincipal]'); out['principal']=await p.evaluate(f'STATE.principals.Vn1==="{mid}"')
    await go('[data-act=tgo][data-v=mDismiss]')
    blocked=[await p.query_selector('[data-act=tDismiss]') is None, '首席奏者はそのまま除籍できません' in await p.inner_text('.tbody')]
    await go('[data-act=tPrinPick]'); other=await p.evaluate(f'STATE.members.find(m=>m.inst==="Vn1"&&m.id!=="{mid}").id')
    await go(f'[data-act=tPrincipal][data-id="{other}"]')
    await p.evaluate(f'tjump("members",[{{s:"mGroup",g:"str"}},{{s:"mInst",inst:"Vn1"}},{{s:"mMember",id:"{mid}",tab:"info"}}]); render()')
    await go('[data-act=tgo][data-v=mDismiss]'); await go('[data-act=tDismiss]')
    out['dismiss']=await p.evaluate(f'[!memberById("{mid}"), STATE.principals.Vn1==="{other}", ttop().s]')+blocked
    # タブの階層保持
    await p.click('.nav [data-tab=home]'); await p.click('.nav [data-tab=members]'); out['keep']=await p.evaluate('ttop().s')
    await p.click('[data-act=tback]'); await p.click('[data-act=tback]')
    # 指揮者管理
    await go('[data-act=tgo][data-v=mConds]'); await go('.tbody .trow >> nth=0'); await go('[data-act=tsub][data-v=info]'); await back(); await back()
    # 人材募集：団員
    await go('[data-act=tgo][data-v=recruit]'); await go('[data-act=tgo][data-v=recMembers]')
    await go('[data-act=tgo][data-v=recForm]'); await back(); await go('[data-act=tgo][data-v=recCompare]'); await back()
    f0=await p.evaluate('STATE.funds'); n0=await p.evaluate('STATE.members.length')
    cid=await p.evaluate('STATE.recruit.candidates.find(c=>!hireBlockReason(c)).id'); cost=await p.evaluate(f'STATE.recruit.candidates.find(c=>c.id==="{cid}").cost')
    await go(f'.tbody .trow[data-id="{cid}"]'); await go('[data-act=tsub][data-v=info]'); await go('[data-act=tHire]')
    out['hire']=[await p.evaluate('STATE.funds')==f0-cost, await p.evaluate('STATE.members.length')==n0+1, await p.evaluate('ttop().s')]
    old=await p.evaluate('STATE.recruit.candidates.map(c=>c.id)'); await go('[data-act=tReroll]'); out['reroll']=not set(old)&set(await p.evaluate('STATE.recruit.candidates.map(c=>c.id)'))
    await back()
    # 人材募集：指揮者（採用→担当→育成）
    await go('[data-act=tgo][data-v=recConds]')
    kid=await p.evaluate('STATE.conductorMarket.candidates.find(c=>!conductorHireBlockReason(c)).id')
    await go(f'.tbody .trow[data-id="{kid}"]'); await go('[data-act=tsub][data-v=info]'); await go('[data-act=tCondHire]')
    out['condhire']=await p.evaluate(f'STATE.conductors.some(c=>c.id==="{kid}")')
    await back(); await back()
    await go('[data-act=tgo][data-v=mConds]'); await go(f'.tbody .trow[data-id="{kid}"]'); await go('[data-act=tsub][data-v=info]'); await go('[data-act=tCondSet]')
    out['condset']=await p.evaluate(f'[STATE.conductorId==="{kid}", activeConcert().conductorId==="{kid}"]')
    await go('[data-act=tsub][data-v=abil]'); await go('[data-act=tTrainCond]')
    out['condtrain_jump']=await p.evaluate('[UI.tab, ttop().s]')
    # ===== 育成 =====
    await go('[data-act=tgo][data-v=tTarget][data-t=c_score]'); out['auto_target']=await p.evaluate('[ttop().s, ttop().id]')
    ab=await p.evaluate(f'JSON.stringify(STATE.conductors.find(c=>c.id==="{kid}").abilities)')
    await go('[data-act=tTrainRun]'); out['condtrain']=[await p.evaluate('ttop().s'), ab!=await p.evaluate(f'JSON.stringify(STATE.conductors.find(c=>c.id==="{kid}").abilities)')]
    await go('[data-act=tTrainDone]')
    await p.evaluate('UI.tnav.train=[{s:"tRoot"}]; UI.trPre=null; render()')
    await L(); await go('[data-act=tgo][data-v=tList][data-k=member]')
    # セクション育成
    await go('[data-act=tgo][data-v=tTarget][data-t=masterclass]'); out['sec_targets']=await p.eval_on_selector_all('.tbody .trow','e=>e.length')
    f1=await p.evaluate('STATE.funds'); await go('[data-act=tTargetPick][data-id=br]'); cst=await p.evaluate('trainingCost(findTraining("masterclass"),"br")')
    await go('[data-act=tTrainRun]'); out['sectrain']=[await p.evaluate('ttop().s'), await p.evaluate('STATE.funds')==f1-cst, await p.inner_text('.tresmsg')]
    await go('[data-act=tTrainDone]')
    # 個人育成（レッスン：能力を選ぶ）
    await go('[data-act=tgo][data-v=tTarget][data-t=lesson]'); await go('[data-act=tsub][data-v=ww]')
    out['member_targets']=await p.evaluate('[...document.querySelectorAll(".tbody .trow")].every(e=>memberById(e.dataset.id)&&INST[memberById(e.dataset.id).inst].section==="ww")')
    await go('.tbody .trow >> nth=0'); await go('[data-act=tAbilityPick]:not([disabled]) >> nth=0'); await go('[data-act=tTrainRun]')
    out['lesson']=await p.inner_text('.tresmsg'); await go('[data-act=tTrainDone]')
    # 楽器の買い換え
    await go('[data-act=tgo][data-v=tTarget][data-t=instrument]'); await go('.tbody .trow >> nth=0'); await go('[data-act=tTrainRun]'); out['instr']=await p.inner_text('.tresmsg'); await go('[data-act=tTrainDone]')
    await back(); await go('[data-act=tgo][data-v=tHistory]'); out['history']=await p.eval_on_selector_all('.tbody .trow','e=>e.length'); await go('.tbody .trow >> nth=0'); await back(); await back()
    # 資金不足
    await p.evaluate('STATE.funds=0; render()'); await go('[data-act=tgo][data-v=tList][data-k=member]'); await go('[data-act=tgo][data-v=tTarget][data-t=maintenance]'); await go('[data-act=tTargetPick][data-id=hs]')
    out['nofunds']=await p.get_attribute('[data-act=tTrainRun]','disabled') is not None
    await p.evaluate('STATE.funds=2000000; save(); render()')
    # ===== 記録 =====
    await p.click('.nav [data-tab=records]'); await L()
    await go('[data-act=tgo][data-v=rConcerts]'); await go('.tbody .trow >> nth=-1')
    for t in ['money','prac','train','rev','sum']:
        await go(f'[data-act=tsub][data-v={t}]')
        nxt=await p.query_selector('[data-act=tpage][data-d="1"]:not([disabled])')
        if nxt: await nxt.click(); await L(); out.setdefault('rpaged',[]).append(t)
    await back(); await back()
    await go('[data-act=tgo][data-v=rFinance]'); await go('.tbody .trow >> nth=0'); await back(); await go('.tbody .trow >> nth=1'); await back(); await back()
    await go('[data-act=tgo][data-v=rTraining]'); await go('.tbody .trow >> nth=0'); await back(); await back()
    await go('[data-act=tgo][data-v=rConds]'); await go('.tbody .trow >> nth=0'); await back(); await back()
    await go('[data-act=tgo][data-v=rSettings]')
    await p.fill('#orchName','新星交響楽団'); await go('[data-act=rename]'); out['rename']=await p.evaluate('STATE.orchestraName')
    await go('[data-act=tgo][data-v=rReset]'); await back(); await back()
    # セーブ・ロード：再読み込み後も状態と各タブの表示が正しい
    st=await p.evaluate('JSON.stringify([STATE.funds,STATE.members.length,STATE.conductors.length,STATE.orchestraName])')
    await p.reload(); await p.click('.nav [data-tab=members]'); await L()
    out['reload']=st==await p.evaluate('JSON.stringify([STATE.funds,STATE.members.length,STATE.conductors.length,STATE.orchestraName])')
    # 演奏会タブ→戻っても階層保持
    await p.click('[data-act=tgo][data-v=recruit]'); await p.click('.nav [data-tab=concert]'); await p.click('.nav [data-tab=members]'); out['keep2']=await p.evaluate('ttop().s')
    await b.close()
    return out
async def main():
  res={}
  for size,w,h in SIZES:
    res[size]=await run(size,w,h); print(size,'screens',len(visited.get(size,[])))
  d=res['std']
  chk('ホーム：トップの戻るは非表示・6つの詳細・お知らせから移動', d['home_back_hidden'] and d['notices']>0 and d['note_jump'] in ('concert','members','train','records','home'), (d['notices'],d['note_jump']))
  chk('団員：所属メンバー（弦・木管・金管・打楽器・指揮者）と人材募集が別', d['mroot_btns']==['弦楽器','木管楽器','金管楽器','打楽器','指揮者','人材募集'], d['mroot_btns'])
  chk('団員：全楽器の一覧・詳細にアクセス', d['insts']==['Vn1','Vn2','Va','Vc','Cb','Fl','Ob','Cl','Fg','Hr','Tp','Tb','Tuba','Perc'], d['insts'])
  chk('団員：首席の任命・首席は除籍不可→別の団員を任命後に除籍', d['principal'] and all(d['dismiss'][:2]) and d['dismiss'][2]=='mInst' and all(d['dismiss'][3:]), d['dismiss'])
  chk('団員募集：採用（費用・人数）・再募集', d['hire'][0] and d['hire'][1] and d['hire'][2]=='recMembers' and d['reroll'], d['hire'])
  chk('指揮者：募集・契約・担当変更（準備中の演奏会にも反映）', d['condhire'] and d['condset']==[True,True], d['condset'])
  chk('指揮者の育成（詳細→育成→対象を自動選択→実行）', d['condtrain_jump']==['train','tList'] and d['auto_target'][0]=='tConfirm' and d['condtrain'][0]=='tResult' and d['condtrain'][1], d['auto_target'])
  chk('セクション育成と個人育成の区別（対象画面が切り替わる）', d['sec_targets']==5 and d['member_targets'] and d['sectrain'][1] and 'プロの演奏家' in d['sectrain'][2], d['sectrain'])
  chk('団員の育成（レッスン・楽器）と履歴', '個人レッスン' in d['lesson'] and '楽器' in d['instr'] and d['history']>=3, (d['lesson'],d['instr'],d['history']))
  chk('資金不足では育成を実行できない', d['nofunds'])
  chk('記録：全カテゴリーと詳細・ページ送り', bool(d.get('rpaged')), d.get('rpaged'))
  chk('ページ送り（重複なし・タブ切替後もページ保持）', all(all(x[:4]) for x in [res[k]['paged'] for k in res]), [res[k]['paged'][4] for k in res])
  chk('タブ切り替えで階層を保持', d['keep']=='mInst' and d['keep2']=='recruit', (d['keep'],d['keep2']))
  chk('設定（楽団名）とセーブ・ロード', d['rename']=='新星交響楽団' and d['reload'], d['rename'])
  uniq=sorted({(x[0],x[1],json.dumps(x[2],ensure_ascii=False)) if len(x)>2 else (x[0],x[1],'') for x in problems})
  for u in uniq: print('  PROBLEM',*u)
  chk('全画面・4サイズで スクロール／はみ出し／見切れ／重なり／小さいボタン なし', not problems, len(uniq))
  chk('JSエラーなし', not errs, errs[:3])
  print('visited screens:', sorted(set().union(*visited.values())))
  print('SUMMARY',sum(R.values()),'/',len(R))
asyncio.run(main())
