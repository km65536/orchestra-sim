"""演奏会タブの回帰確認用スナップショット：乱数を固定し、各画面のDOMと主要要素の位置・サイズを記録する。
   使い方: python3 test/concert_snapshot.py <html> <out.json>"""
import asyncio, json, os, sys
sys.path.insert(0, os.path.dirname(__file__)); import flow as F
from playwright.async_api import async_playwright
SEED='''(()=>{let a=12345,k=0;window.__reseed=()=>{a=12345+(++k)*7919};Math.random=()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
  let n=1700000000000;Date.now=()=>n++;})()'''
GRAB='''(()=>{const r=e=>{if(!e)return null;const b=e.getBoundingClientRect();return [Math.round(b.left),Math.round(b.top),Math.round(b.width),Math.round(b.height)]};
  const cs=e=>{if(!e)return null;const s=getComputedStyle(e);return [s.fontSize,s.backgroundColor,s.color,s.padding,s.borderRadius].join('|')};
  return {app:document.getElementById('app').innerHTML.replace(/ style="[^"]*"/g,''), nav:document.getElementById('nav').innerHTML,
   rects:{cmd:r(document.querySelector('.cmd')),stage:r(document.getElementById('stage3d')),top:r(document.querySelector('.top')),nav:r(document.getElementById('nav')),cam:r(document.querySelector('.camrow'))},
   styles:['.cmd','.chead','.cbody','.cfoot','.cbtn','.citem','.crow','.top','.camrow button','.bigbtn','.fcell','.tile'].map(s=>cs(document.querySelector(s))),
   bodyClass:document.body.className}})()'''
async def main(html,out):
  res={}
  async with async_playwright() as pw:
    b=await pw.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
    await ctx.add_init_script(SEED)
    p=await ctx.new_page(); errs=[]; p.on('pageerror',lambda e: errs.append(str(e)))
    await p.goto('file://'+html); await p.evaluate('localStorage.clear()'); await p.reload()
    await p.click('[data-act=newgame]'); await p.evaluate('if (CONFIG.quiz) Object.assign(CONFIG.quiz,{gainCorrect:0,gainWrong:0,streakBonus:0,streakBonusMax:0})'); await p.click('.nav [data-tab=concert]')
    async def snap(k): res[k]=await p.evaluate(GRAB)
    await snap('entry'); await p.click('[data-act=startConcert]'); await snap('setup')
    await p.click('[data-act=cgo][data-v=songCat]'); await snap('songCat'); await p.click('[data-act=cgo][data-v=songList][data-g=symphony]'); await snap('songList')
    await p.click('.cbody .crow >> nth=0'); await snap('songDetail'); await p.click('[data-act=chooseSong]')
    await p.click('[data-act=cgo][data-v=hallList]'); await snap('hallList'); await p.click('.cbody .crow[data-id=small]'); await snap('hallDetail'); await p.click('[data-act=reserveHall]')
    await p.click('[data-act=cgo][data-v=condList]'); await snap('condList'); await p.click('.cbody .crow >> nth=0'); await snap('condDetail'); await p.click('[data-act=cback]'); await p.click('[data-act=cback]')
    await snap('setupDone'); await p.click('[data-act=toPractice]'); await snap('practice')
    await p.click('[data-act=cgo][data-v=tutti]'); await snap('tutti'); await p.evaluate('UI.practiceTest={scale:0.04,event:"off"}'); await p.evaluate('window.__reseed && __reseed()'); await p.click('[data-act=runPractice]'); await F.finish_practice(p); await snap('log'); await p.click('.cfoot .cbtn.big')
    await p.click('[data-act=cgo][data-v=section]'); await snap('section'); await p.click('[data-act=cback]')
    await p.click('[data-act=cgo][data-v=indivPick]'); await snap('indivPick'); await p.click('[data-act=cback]')
    await F.practice_all(p,['tutti']*9); await snap('prep')
    await p.click('[data-act=cgo][data-v=policy]'); await snap('policy'); await p.click('[data-act=policy][data-v=stable]')
    await p.evaluate('window.__reseed && __reseed()'); await p.click('[data-act=perform]'); await p.wait_for_timeout(1200); await snap('show'); await p.click('[data-act=skipShow]'); await snap('result')
    for t in ['resEval','resReview','resGrowth','resMoney']: await p.click(f'[data-act=cgo][data-v={t}]'); await snap(t); await p.click('[data-act=cback]')
    res['_errors']=errs
    await b.close()
  json.dump(res,open(out,'w'),ensure_ascii=False)
  print('screens',len(res)-1,'errors',errs)
asyncio.run(main(sys.argv[1],sys.argv[2]))
