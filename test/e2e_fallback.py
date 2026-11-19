"""WebGL が使えない環境（3D無効）でも、同じコマンド画面で最後まで進行できることの確認"""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(__file__)); import flow as F
from playwright.async_api import async_playwright
async def main():
  errs=[]
  async with async_playwright() as pw:
    b=await pw.chromium.launch(args=['--disable-3d-apis','--disable-webgl'])
    p=await b.new_page(viewport={'width':375,'height':667}); p.on('pageerror',lambda e: errs.append(str(e)))
    await p.goto('file:///home/claude/orch/dist/index.html'); await p.evaluate('localStorage.clear()'); await p.reload()
    await p.click('[data-act=newgame]'); await F.open_concert(p)
    print('mode3d',await p.evaluate('document.body.classList.contains("mode3d")'),'Stage3D.ok',await p.evaluate('Stage3D.ok'),'notice:',(await p.inner_text('.stage2d')).replace('\n',' '))
    await F.setup_all(p,'small','orchestral'); await F.practice_all(p); await F.perform(p)
    print('result', await p.evaluate('[activeConcert().phase, activeConcert().result.rank]'))
    page=await p.evaluate('document.documentElement.scrollHeight-innerHeight'); print('page scroll', page)
    await p.screenshot(path='shots/fallback.png')
    await p.click('[data-act=next]'); print('next', await p.evaluate('[activeConcert().phase, cmdTop().s]'))
    await b.close()
  print('ERR',errs)
asyncio.run(main())
