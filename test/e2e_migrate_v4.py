"""v4 のセーブ（会場予約済み・選曲前）が v5 の準備画面に正しく引き継がれることの確認"""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(__file__)); import flow as F
from playwright.async_api import async_playwright
async def main():
  async with async_playwright() as pw:
    b=await pw.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    p=await b.new_page(viewport={'width':390,'height':844}); errs=[]; p.on('pageerror',lambda e: errs.append(str(e)))
    await p.goto('file:///home/claude/orch/dist/index.html'); await p.evaluate('localStorage.clear()'); await p.reload(); await p.click('[data-act=newgame]')
    await p.evaluate('''(()=>{const c=activeConcert(); selectHall(c,'small'); const s=JSON.parse(JSON.stringify(STATE)); s.version=4;
      const cc=s.concertPrograms[s.activeConcertId]; cc.phase='selection'; delete cc.started; delete cc.conductorId; localStorage.setItem(CONFIG.SAVE_KEY, JSON.stringify(s));})()''')
    f=await p.evaluate('STATE.funds'); await p.reload()
    st=await p.evaluate('[STATE.version, activeConcert().phase, activeConcert().started, activeConcert().hallId, setupStatus(activeConcert()), STATE.funds]')
    await F.open_concert(p); scr=await F.scr(p)
    ok = st[0]==5 and st[1]=='setup' and st[2] is True and st[3]=='small' and st[4]['hall'] and st[4]['conductor'] and not st[4]['song'] and st[5]==f and scr=='setup'
    print('PASS' if ok else 'FAIL','v4→v5 移行（予約済みの会場・指揮者を引き継ぎ、再選択を強制しない）', st, scr, errs)
    await b.close()
asyncio.run(main())
