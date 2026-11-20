"""今回の改修の確認：①ページのスクロール・拡大の禁止 ②首席奏者の任命 ③練習のアニメーションとランダムイベント"""
import asyncio, json, os, sys, time
sys.path.insert(0, os.path.dirname(__file__)); import flow as F
from playwright.async_api import async_playwright
URL='file:///home/claude/orch/dist/index.html'
GL=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']
R={}; errs=[]
def chk(n,ok,info=''): R[n]=bool(ok); print(('PASS' if ok else 'FAIL'),n,info)

# 合成タッチ・ホイールの既定動作が止められるか（=ブラウザのスクロール・拡大が起きないか）を調べる
PROBE='''(sel)=>{const el=document.querySelector(sel)||document.body;const r=el.getBoundingClientRect();const x=r.left+r.width/2,y=r.top+Math.min(r.height/2,40);
  const T=(id,yy)=>new Touch({identifier:id,target:el,clientX:x,clientY:yy});
  const res={};
  el.dispatchEvent(new TouchEvent('touchstart',{touches:[T(1,y)],bubbles:true,cancelable:true}));
  let e=new TouchEvent('touchmove',{touches:[T(1,y-60)],bubbles:true,cancelable:true}); el.dispatchEvent(e); res.swipe=e.defaultPrevented;
  e=new TouchEvent('touchstart',{touches:[T(1,y),T(2,y+50)],bubbles:true,cancelable:true}); el.dispatchEvent(e); res.pinchStart=e.defaultPrevented;
  e=new TouchEvent('touchmove',{touches:[T(1,y-20),T(2,y+80)],bubbles:true,cancelable:true}); el.dispatchEvent(e); res.pinch=e.defaultPrevented;
  e=new WheelEvent('wheel',{deltaY:-100,ctrlKey:true,bubbles:true,cancelable:true}); el.dispatchEvent(e); res.ctrlWheel=e.defaultPrevented;
  e=new Event('gesturestart',{bubbles:true,cancelable:true}); el.dispatchEvent(e); res.gesture=e.defaultPrevented;
  e=new MouseEvent('dblclick',{bubbles:true,cancelable:true}); el.dispatchEvent(e); res.dbl=e.defaultPrevented;
  e=new KeyboardEvent('keydown',{key:'+',ctrlKey:true,bubbles:true,cancelable:true}); window.dispatchEvent(e); res.ctrlPlus=e.defaultPrevented;
  window.scrollTo(0,400); document.documentElement.scrollLeft=300; res.scroll=[scrollX,scrollY];
  const cs=getComputedStyle(document.documentElement), bs=getComputedStyle(document.body), ts=getComputedStyle(el);
  res.css=[cs.overflow, bs.overflow, cs.overscrollBehaviorY, bs.overscrollBehaviorY, ts.touchAction];
  res.vp=document.querySelector('meta[name=viewport]').content;
  return res}'''
async def page_lock_checks(p, tag, sel):
    r=await p.evaluate(PROBE, sel)
    ok=r['swipe'] and r['pinchStart'] and r['pinch'] and r['ctrlWheel'] and r['gesture'] and r['dbl'] and r['ctrlPlus'] and r['scroll']==[0,0] \
       and r['css'][0]=='hidden' and r['css'][1]=='hidden' and r['css'][2]=='none' and r['css'][3]=='none' and r['css'][4] in ('manipulation','pan-y','none') and 'user-scalable=no' in r['vp']
    return ok, r

async def main():
  async with async_playwright() as pw:
    b=await pw.chromium.launch(args=GL)
    ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True)
    p=await ctx.new_page(); p.on('pageerror',lambda e: errs.append('JS '+str(e)))
    cdp=await ctx.new_cdp_session(p)
    await p.goto(URL); await p.evaluate('localStorage.clear()'); await p.reload()
    # ===== ① スクロール・拡大の禁止 =====
    title_ok,_=await page_lock_checks(p,'title','.card')
    await p.click('[data-act=newgame]'); await p.evaluate('STATE.funds+=3000000; save()')
    res={}
    for tab,sel in [('home','.tv .tbody'),('members','.tv .tbody'),('train','.tv .tbody'),('records','.tv .tbody'),('concert','#stage3d canvas')]:
        await p.click(f'.nav [data-tab={tab}]'); await p.wait_for_timeout(200)
        res[tab]=await page_lock_checks(p,tab,sel)
        # 実際のタッチ操作（CDP）でスワイプ・ピンチしても、ページが動かず拡大もされない
        await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':195,'y':400}]})
        for k in range(1,6): await cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':195+k*20,'y':400-k*60}]})
        await cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
        await cdp.send('Input.synthesizePinchGesture',{'x':195,'y':400,'scaleFactor':2.5,'relativeSpeed':800,'gestureSourceType':'touch'})
        await cdp.send('Input.synthesizeTapGesture',{'x':195,'y':300,'tapCount':2,'gestureSourceType':'touch'})
        res[tab]+=(await p.evaluate('[scrollX,scrollY,visualViewport.scale,visualViewport.offsetTop,visualViewport.offsetLeft]'),)
    for t,(ok,r,v) in res.items(): print('   ',t,ok,v,{k:r[k] for k in ['swipe','pinch','ctrlWheel','dbl','scroll','css']})
    chk('1a 全タブ（＋タイトル）で縦横スクロール・ピンチ・ダブルタップ・Ctrl+ホイールの既定動作を止める', title_ok and all(ok for ok,_,_ in res.values()))
    chk('1b 実際のタッチ（スワイプ・ピンチ・ダブルタップ）後もページ位置0・拡大率1', all(v[0]==0 and v[1]==0 and abs(v[2]-1)<1e-6 and v[3]==0 and v[4]==0 for _,_,v in res.values()), [v for _,_,v in res.values()])
    # ゲーム内の操作は妨げない：ボタン（実タップ）・カメラ切り替え・pointerイベント・内部スクロール領域
    await p.click('.nav [data-tab=concert]')
    box=await p.evaluate('(()=>{const b=document.querySelector("[data-act=startConcert]").getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2]})()')
    await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':box[0],'y':box[1]}]}); await cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    await p.wait_for_timeout(300); tapped=await p.evaluate('activeConcert().started')
    # 3D上部のボタン（視点は正面固定になったため、残っているのは音声ボタン）を実際のタップで操作
    snd0=await p.evaluate('soundOn()')
    bb=await p.evaluate('(()=>{const b=document.querySelector(".camrow [data-act=sound]").getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2]})()')
    await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':bb[0],'y':bb[1]}]}); await cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    await p.wait_for_timeout(250); cams=[snd0, await p.evaluate('soundOn()'), await p.evaluate('Stage3D.camName()')]
    await p.evaluate('soundOn()||ACTIONS.sound()')
    ptr=await p.evaluate('''(()=>{const c=document.querySelector('#stage3d canvas');let n=0;const f=()=>n++;c.addEventListener('pointerdown',f);c.addEventListener('pointermove',f);
       c.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch'}));c.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerType:'touch'}));return n})()''')
    camswipe=await p.evaluate('''(()=>{const d=document.querySelector('.camrow'); if(d.scrollWidth<=d.clientWidth) return 'no-overflow'; d.scrollLeft=0;
       const T=xx=>new Touch({identifier:8,target:d,clientX:xx,clientY:d.getBoundingClientRect().top+10});d.dispatchEvent(new TouchEvent('touchstart',{touches:[T(300)],bubbles:true,cancelable:true}));
       const e=new TouchEvent('touchmove',{touches:[T(200)],bubbles:true,cancelable:true});d.dispatchEvent(e);return !e.defaultPrevented})()''')
    inner=await p.evaluate('''(()=>{const d=document.createElement('div');d.style.cssText='position:fixed;left:0;top:100px;width:200px;height:120px;overflow:auto;z-index:99';d.innerHTML='<div style="height:600px">x</div>';document.body.appendChild(d);
       const T=yy=>new Touch({identifier:9,target:d,clientX:50,clientY:yy});d.dispatchEvent(new TouchEvent('touchstart',{touches:[T(200)],bubbles:true,cancelable:true}));
       const e=new TouchEvent('touchmove',{touches:[T(140)],bubbles:true,cancelable:true});d.dispatchEvent(e);const r=!e.defaultPrevented;d.remove();return r})()''')
    chk('1c ゲーム内操作は有効（タップでボタン・3D上部の音声ボタン・3D画面のpointer操作・内部スクロール領域）', tapped and cams[0]!=cams[1] and cams[2]=='front' and camswipe in (True,'no-overflow') and ptr==2 and inner, (tapped,cams,camswipe,ptr,inner))
    await p.click('.nav [data-tab=home]')

    # ===== ② 首席奏者 =====
    vn=await p.evaluate('STATE.members.filter(m=>m.inst==="Vn1").sort((a,b)=>memberAvg(a)-memberAvg(b)).map(m=>m.id)')
    weakest, old = vn[0], await p.evaluate('STATE.principals.Vn1')
    await F.tnav(p,'members',[{'s':'mGroup','g':'str'},{'s':'mInst','inst':'Vn1'}])
    await p.click('[data-act=tPrinPick]')
    rows=await p.eval_on_selector_all('.tbody [data-act=tPrincipal]','e=>e.length')
    while not await p.query_selector(f'.tbody [data-act=tPrincipal][data-id="{weakest}"]'): await p.click('[data-act=tpage][data-d="1"]')
    await p.click(f'.tbody [data-act=tPrincipal][data-id="{weakest}"]')
    st=await p.evaluate(f'[STATE.principals.Vn1==="{weakest}", isPrincipal(memberById("{old}")), STATE.members.filter(m=>m.inst==="Vn1"&&isPrincipal(m)).length, ttop().s]')
    chk('2a 能力に関係なく任意の団員を首席に任命（最も能力の低い団員でも可）', st[0] and weakest!=old, f'候補{rows}名表示')
    chk('2b 新しい首席を任命すると前の首席は通常団員に戻る・首席は1人だけ', st[1] is False and st[2]==1 and st[3]=='mInst', st)
    tag=await p.evaluate(f'[...document.querySelectorAll(".tbody .trow")].filter(r=>r.querySelector(".tag.gold")).map(r=>r.dataset.id)')
    shown=tag==[weakest] or (len(tag)==0 and await p.query_selector('[data-act=tpage]'))
    chk('2c 団員一覧で首席が一目で分かる（首席バッジ）', shown, tag)
    other_inst=await p.evaluate(f'STATE.members.find(m=>m.inst==="Va").id')
    cross=await p.evaluate(f'[setPrincipal("{other_inst}","Vn1"), STATE.principals.Vn1==="{weakest}"]')
    chk('2d 他の楽器の団員は任命できない', cross==[False,True], cross)
    # 除籍制限
    await F.member_detail(p,weakest); await p.click('[data-act=tgo][data-v=mDismiss]')
    msg=await p.inner_text('.tbody'); nobtn=await p.query_selector('[data-act=tDismiss]') is None
    await p.evaluate(f'ACTIONS.tDismiss({{id:"{weakest}"}})'); still=await p.evaluate(f'!!memberById("{weakest}")')
    chk('2e 現在の首席は除籍できず、理由を表示', nobtn and still and '首席奏者はそのまま除籍できません。先に別の団員を首席に任命してください。' in msg, msg.replace('\n',' ')[:80])
    await p.click('[data-act=tPrinPick]'); await p.click(f'.tbody [data-act=tPrincipal][data-id="{old}"]')
    ok_dis=await F.dismiss(p,weakest); gone=await p.evaluate(f'!memberById("{weakest}")')
    chk('2f 別の団員を首席に任命した後なら、以前の首席を除籍できる', ok_dis and gone and await p.evaluate(f'STATE.principals.Vn1==="{old}"'))
    # 1.5倍の重み
    w=await p.evaluate('''(()=>{const sec='hs', ms=membersOfSection(sec), std=SEC[sec].insts.reduce((s,i)=>s+INST[i].std,0);
       const headF=CONFIG.sectionBase.headcountFloor+(1-CONFIG.sectionBase.headcountFloor)*Math.min(1,ms.length/std);
       const calc=()=>{const w=ms.map(m=>isPrincipal(m)?1.5:1),ws=w.reduce((a,b)=>a+b,0);return ms.reduce((a,m,i)=>a+m.abilities.tech*w[i],0)/ws*headF};
       const weak=ms.filter(m=>m.inst==='Vn1').sort((a,b)=>memberAvg(a)-memberAvg(b))[0], keep=STATE.principals.Vn1;
       const r1=[sectionBase(sec).tech, calc()]; setPrincipal(weak.id); const r2=[sectionBase(sec).tech, calc()]; setPrincipal(keep);
       return [CONFIG.principal.baseWeight, r1, r2]})()''')
    chk('2g 首席の能力補正1.5倍（任命した団員に適用）', w[0]==1.5 and abs(w[1][0]-w[1][1])<1e-9 and abs(w[2][0]-w[2][1])<1e-9 and w[2][0]<w[1][0], w)
    # 契約終了など（除籍操作以外）の退団：後任を自動任命
    succ=await p.evaluate('''(()=>{const p=principalOf('Tp'); dismissMember(p.id,{force:true}); const n=principalOf('Tp'), best=STATE.members.filter(m=>m.inst==='Tp').sort((a,b)=>memberAvg(b)-memberAvg(a))[0];
       return [!!n, n && n.id===best.id, n && n.id!==p.id]})()''')
    chk('2h 首席が除籍操作以外で退団した場合は後任を自動任命（首席が不在にならない）', all(succ), succ)
    sole=await p.evaluate('''(()=>{const ms=STATE.members.filter(m=>m.inst==='Tuba'); while(ms.length>1){dismissMember(ms.pop().id,{force:true})} const only=STATE.members.find(m=>m.inst==='Tuba'); return [isPrincipal(only), dismissBlockReason(only)]})()''')
    print('    楽器に1名だけの首席は除籍可（後任がいないため）:', sole)
    # セーブ・ロード
    pick=await p.evaluate('STATE.members.filter(m=>m.inst==="Vc").sort((a,b)=>memberAvg(a)-memberAvg(b))[0].id')
    await p.evaluate(f'setPrincipal("{pick}")'); before=await p.evaluate('JSON.stringify(STATE.principals)')
    await p.reload(); after=await p.evaluate('JSON.stringify(STATE.principals)')
    chk('2i セーブ・ロード後も任命状態を維持', before==after and await p.evaluate(f'STATE.principals.Vc==="{pick}"'))
    # 既存セーブ（不整合のある首席情報）
    fix=await p.evaluate('''(()=>{const s=JSON.parse(localStorage.getItem(CONFIG.SAVE_KEY)); const vc=s.principals.Vc;
       delete s.principals.Fl; s.principals.Va=s.members.find(m=>m.inst==='Vn2').id; s.principals.Timp='zzz'; s.principals.Ob='nobody';
       localStorage.setItem(CONFIG.SAVE_KEY,JSON.stringify(s)); return vc})()''')
    await p.reload()
    ld=await p.evaluate(f'''[INSTRUMENTS.every(i=>!STATE.members.some(m=>m.inst===i.id) || (principalOf(i.id) && principalOf(i.id).inst===i.id)), !('Timp' in STATE.principals), STATE.principals.Vc==="{fix}", STATE.version]''')
    chk('2j 既存セーブの読み込み：不正な首席情報は補正し、任命済みの首席は維持', ld[0] and ld[1] and ld[2], ld)

    # ===== ③ 練習 =====
    await F.setup_all(p,'small','orchestral')
    await p.click('[data-act=cgo][data-v=tutti]'); d0=await p.evaluate('activeConcert().practiceDone')
    await p.evaluate('UI.practiceTest={event:"off"}')
    t0=time.time(); await p.click('[data-act=runPractice]'); await p.click('[data-act=runPractice]', timeout=500) if await p.query_selector('[data-act=runPractice]') else None
    await p.evaluate('ACTIONS.runPractice({m:"tutti"})')   # 練習中にもう一度押しても重複しない
    started=await p.evaluate('[!!UI.practicing, cmdTop().s, Stage3D.isPracticing(), activeConcert().practiceDone]')
    poses=[]; ws=[]; remain=[]
    while await p.evaluate('!!UI.practicing'):
        poses.append(await p.evaluate('Stage3D.conductorPose().y')); ws.append(await p.evaluate('Stage3D.sections().map(s=>s.w)'))
        remain.append(await p.evaluate('(document.getElementById("prRemain")||{}).textContent||""'))
        await p.wait_for_timeout(400)
        if time.time()-t0>30: break
    dur=time.time()-t0
    after_log=await p.evaluate('[cmdTop().s, activeConcert().practiceDone, document.querySelector(".crumb").textContent]')
    await p.screenshot(path='shots/p8_log.png')
    chk('3a 練習ボタンで練習が始まり、3Dステージで練習を再生', started[0] and started[1]=='practicing' and started[2] and started[3]==d0+1, started)
    chk('3b 練習時間が10〜15秒', 10<=dur<=15.8, f'{dur:.1f}秒 表示 {remain[0]}→{remain[-2] if len(remain)>1 else ""}')
    avg=[round(sum(w[i] for w in ws[3:-2])/max(1,len(ws[3:-2])),2) for i in range(5)]
    moving=len(set(round(x,3) for x in poses))>5 and max(max(w) for w in ws[3:])>0.6
    chk('3c 指揮者が指揮を振り、団員が演奏する（全体合奏は全セクション）', moving and min(avg)>0.3, (len(set(round(x,3) for x in poses)), avg))
    chk('3d 練習中の重複実行なし・終了後に既存の練習報告', after_log[0]=='log' and after_log[1]==d0+1 and '練習の成果' in after_log[2], after_log)
    await p.click('.cfoot .cbtn.big')
    # セクション練習：中心のセクションが順に切り替わる
    await p.evaluate('UI.practiceTest={event:"off",scale:0.45}')
    await p.click('[data-act=cgo][data-v=section]'); await p.click('[data-act=runPractice]')
    seen={}
    while await p.evaluate('!!UI.practicing'):
        s=await p.evaluate('[UI.practicing?practiceFocusLabel(UI.practicing):"end", Stage3D.sections().map(s=>s.w), Stage3D.camName()]')
        if s[0]!='end': seen.setdefault(s[0],[]).append((s[1],s[2]))
        await p.wait_for_timeout(150)
    await p.screenshot(path='shots/p8_seclog.png')
    def focus_ok(label, idx):
        rows=[w for w,_ in seen.get(label,[])][2:]
        return rows and max(max(r[i] for i in idx) for r in rows)>0.6 and min(max(r[j] for j in range(5) if j not in idx) for r in rows[len(rows)//2:])<0.15
    labels=list(seen.keys())
    chk('3e 練習対象に応じた演出（セクション練習：弦→木管→金管→打楽器の順に中心が移り、カメラも追う）',
        labels==['弦楽器のセクション練習','木管楽器のセクション練習','金管楽器のセクション練習','打楽器のセクション練習'] and focus_ok(labels[0],[0,1]) and focus_ok(labels[1],[2]) and focus_ok(labels[2],[3]) and focus_ok(labels[3],[4])
        and [seen[l][-1][1] for l in labels]==['front','ww','br','pc'], (labels,[seen[l][-1] for l in labels]))
    await F.answer_quiz(p)   # 練習2回ごとのクイズ（今回追加）に答えてから練習報告へ
    await p.click('.cfoot .cbtn.big')
    # 個人練習：選んだ団員だけが演奏する
    await p.click('[data-act=cgo][data-v=indivPick]'); await p.click('[data-act=ctab][data-v=br]')
    hr=await p.evaluate('[...document.querySelectorAll(".cbody [data-act=indPick]")].map(e=>e.dataset.id).find(id=>songRequirements(findSong(activeConcert().songId))[memberById(id).inst])')
    await p.click(f'.cbody [data-act=indPick][data-id="{hr}"]')
    await p.click('[data-act=cgo][data-v=indivFocus]'); await p.click('[data-act=runPractice]'); await p.wait_for_timeout(1500)
    iw=await p.evaluate('[Stage3D.sections().map(s=>s.w), Stage3D.camName(), practiceFocusLabel(UI.practicing)]')
    await F.finish_practice(p); await p.click('.cfoot .cbtn.big')
    chk('3f 個人練習：選んだ団員（金管）だけが演奏・カメラも金管', iw[0][3]>0 and max(iw[0][:3]+iw[0][4:])<0.05 and iw[1]=='br' and '個人練習' in iw[2], iw)
    # 練習中に別のタブへ移っても、戻れば続きから再生される
    await p.evaluate('UI.practiceTest={event:"off",scale:0.4}')
    await p.click('[data-act=cgo][data-v=tutti]'); await p.click('[data-act=runPractice]'); await p.wait_for_timeout(600)
    await p.click('.nav [data-tab=home]'); hidden=await p.evaluate('Stage3D.isPracticing()'); await p.click('.nav [data-tab=concert]')
    resumed=await p.evaluate('[!!UI.practicing, Stage3D.isPracticing(), cmdTop().s]'); await F.finish_practice(p)
    chk('3g 練習中にタブを移動しても進行が続き、戻ると再生を再開', resumed==[True,True,'practicing'] and await p.evaluate('cmdTop().s')=='log', (hidden,resumed))
    await p.click('.cfoot .cbtn.big')
    # ランダムイベント：全種類を発生させ、選択肢ごとに効果と報告を確認
    evs=await p.evaluate('PRACTICE_EVENTS.map(e=>e.id)'); results=[]; layout=[]
    for i,eid in enumerate(evs):
        if await p.evaluate('activeConcert().phase')!='practice':
            await F.perform(p); await p.click('[data-act=next]'); await F.setup_all(p,'small','orchestral')
        menu='individual' if eid=='stay_late' else 'tutti' if i%2==0 else 'section'
        await p.evaluate(f'UI.practiceTest={{scale:0.12,event:"force",eventId:"{eid}"}}')
        if menu=='tutti': await p.click('[data-act=cgo][data-v=tutti]')
        elif menu=='section': await p.click('[data-act=cgo][data-v=section]')
        else:
            await p.click('[data-act=cgo][data-v=indivPick]')
            if not await p.evaluate('UI.draft.members.length'): await p.click('.cbody [data-act=indPick] >> nth=0')
            await p.click('[data-act=cgo][data-v=indivFocus]')
        before=await p.evaluate('JSON.stringify(activeConcert().perf)')
        await p.click('[data-act=runPractice]')
        choice=None; shownTxt=''
        for _ in range(300):
            st=await p.evaluate('UI.practicing ? UI.practicing.evState : "end"')
            if st=='open':
                chs=await p.evaluate('UI.practicing.ev.choices.map(c=>c.id)'); choice=chs[i%len(chs)]
                shownTxt=await p.evaluate('(document.querySelector(".cmd")||{}).innerText||""'); await p.screenshot(path=f'shots/p8_ev_{eid}.png')
                layout.append(await p.evaluate('(()=>{const b=document.querySelector(".cmd .cbody");const out=[...document.querySelectorAll(".cmd button")].filter(x=>{const r=x.getBoundingClientRect();return r.bottom>innerHeight-64+1||r.top<0}).length;return [b.scrollHeight<=b.clientHeight+1,out]})()'))
                await p.click(f'[data-act=prChoice][data-v={choice}]')
            if st=='shown' and not shownTxt: shownTxt=await p.evaluate('(document.querySelector(".cmd")||{}).innerText||""')
            if st=='end': break
            await p.wait_for_timeout(40)
        log=await p.evaluate('(()=>{const c=activeConcert(),l=c.practices[c.practices.length-1];return {ev:l.events,sum:l.summary}})()')
        await F.answer_quiz(p)   # 練習2回ごとのクイズ（今回追加）に答えてから練習報告へ
        rep=await p.inner_text('.cmd .cbody')
        results.append((eid,choice,log['ev'][0]['note'] if log['ev'] else None,log['ev'][0]['delta'] if log['ev'] else None,'⚑' in rep, log['ev'][0]['title'] in log['sum'] if log['ev'] else False, bool(shownTxt)))
        await p.click('.cfoot .cbtn.big')
    for r in results: print('   ',r)
    chk('3h 全9種のイベントが発生し、選択肢・自動イベントとも動作', len(results)==9 and all(r[2] for r in results) and all(r[6] for r in results), [r[0] for r in results])
    chk('3i イベントの結果を既存の練習報告・練習履歴に反映', all(r[4] and r[5] for r in results))
    chk('3j イベント選択画面がパネル内に収まる（スクロールなし・ボタンが画面内）', all(a and b==0 for a,b in layout), layout)
    # 発生頻度・種類のばらつき（実際の抽選関数で2000回）
    freq=await p.evaluate('''(()=>{const c=activeConcert(); const log={no:1,menu:'tutti',plan:{menu:'tutti'},sections:{hs:{tech:2},ls:{tech:2},ww:{tech:2},br:{tech:2},pc:{tech:2}},overall:{},mastery:{},songParams:[]};
       let n=0; const ids={}; for(let i=0;i<2000;i++){const e=pickPracticeEvent(c,log); if(e){n++; ids[e.id]=(ids[e.id]||0)+1}} return [n/2000, ids]})()''')
    chk('3k イベントの発生頻度が自然（約5割・毎回同じではない）', 0.45<freq[0]<0.65 and len(freq[1])>=7, freq)
    # イベントなし
    await p.evaluate('UI.practiceTest={scale:0.05,event:"off"}')
    if await p.evaluate('activeConcert().phase')!='practice':
        await F.perform(p); await p.click('[data-act=next]'); await F.setup_all(p,'small','orchestral')
    await F.practice(p,'tutti'); noev=await p.evaluate('(()=>{const c=activeConcert(),l=c.practices[c.practices.length-1];return [!l.events, l.summary===summarizeLog(l) || l.summary===summarizeLog(l)+"／クイズ"+(l.quiz&&l.quiz.correct?"正解":"不正解")]})()')
    chk('3l イベントが発生しない場合も正常に終了（報告は従来どおり）', all(noev), noev)
    # イベントの効果量とバランス（その回の成果に対する増減）
    bal=await p.evaluate('''(()=>{const out={};const c=JSON.parse(JSON.stringify(activeConcert()));
       for(const E of PRACTICE_EVENTS){ out[E.id]=[] ; for(let k=0;k<3;k++){ const log={no:1,menu:'tutti',plan:{menu:'tutti',members:[STATE.members[0].id]},sections:{hs:{tech:2,pitch:2},ls:{tech:2},ww:{tech:2},br:{tech:2},pc:{tech:1}},overall:{ensemble:3,unity:2},mastery:{comp:2,underst:1.5},songParams:[]};
         const cc=JSON.parse(JSON.stringify(c)); const ev=pickPracticeEvent(cc,log,{force:true,id:E.id}); if(!ev){continue}
         const chs=ev.choices||[null]; for(const ch of chs){const l2=JSON.parse(JSON.stringify(log)), c2=JSON.parse(JSON.stringify(cc)); const t0=logTotal(l2); applyPracticeEvent(c2,l2,ev,ch&&ch.id); out[E.id].push([ch?ch.id:'auto', +((logTotal(l2)-t0)/t0*100).toFixed(1)])} break } }
       return out})()''')
    flat=[v for vs in bal.values() for _,v in vs]
    print('    効果（その回の成果に対する%）:', json.dumps(bal,ensure_ascii=False))
    chk('3m イベントの効果は小さく、ゲームバランスを大きく崩さない（各選択 ±25%以内）', flat and max(abs(x) for x in flat)<=25, (min(flat),max(flat)))
    await b.close()
  chk('JSエラーなし', not errs, errs[:3])
  print('SUMMARY',sum(R.values()),'/',len(R))
asyncio.run(main())
