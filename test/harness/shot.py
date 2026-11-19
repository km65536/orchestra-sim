import asyncio, sys, subprocess
from playwright.async_api import async_playwright
async def main(hall,song,cams,w=390,h=700,extra=None):
  subprocess.run(['python3','test/harness/make.py',hall,song,cams[0]],check=True)
  async with async_playwright() as pw:
    b=await pw.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    p=await b.new_page(viewport={'width':w,'height':h})
    errs=[]; p.on('pageerror',lambda e: errs.append(str(e))); p.on('console',lambda m: m.type=='error' and errs.append(m.text))
    await p.goto('file:///home/claude/orch/test/harness/h.html'); await p.wait_for_timeout(800)
    print('ok',await p.evaluate('window.__ok'),await p.evaluate('window.__reason'), await p.evaluate('JSON.stringify(Stage3D.debug())'))
    for cam in cams:
      await p.evaluate(f'Stage3D.setCamera("{cam}",true)'); await p.wait_for_timeout(400)
      await p.screenshot(path=f'shots/s_{hall}_{cam}.png')
    if extra:
      await p.evaluate(extra[0]); 
      for i,ms in enumerate(extra[1]):
        await p.wait_for_timeout(ms); await p.screenshot(path=f'shots/x{i}.png')
        print('t',i,await p.evaluate('JSON.stringify(Stage3D.debug())'))
    print('errors',errs[:5])
    await b.close()
if __name__=='__main__':
  asyncio.run(main(sys.argv[1],sys.argv[2],sys.argv[3].split(',')))
