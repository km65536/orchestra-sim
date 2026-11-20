"""演奏会タブ（コマンド画面UI）を操作するテスト用ヘルパー"""
async def scr(p): return await p.evaluate('UI.cmd ? UI.cmd.stack[UI.cmd.stack.length-1].s : null')
async def open_concert(p):
    await p.click('.nav [data-tab=concert]')
    if await scr(p)=='entry': await p.click('[data-act=startConcert]')
async def to_setup(p):
    for _ in range(6):
        if await scr(p)=='setup': return
        await p.click('.chead [data-act=cback]')
async def find_row(p, sel):
    for _ in range(12):
        el=await p.query_selector(sel)
        if el: return el
        nxt=await p.query_selector('[data-act=cpage][data-d="1"]:not([disabled])')
        if not nxt: return None
        await nxt.click()
    return None
async def choose_song(p, genre='orchestral', song_id=None, idx=0):
    await to_setup(p)
    await p.click('[data-act=cgo][data-v=songCat]'); await p.click(f'[data-act=cgo][data-v=songList][data-g={genre}]')
    row = await find_row(p, f'.cbody .crow[data-id="{song_id}"]') if song_id else (await p.query_selector_all('.cbody .crow'))[idx]
    await row.click()
    sid=await p.evaluate('cmdTop().id')
    btn=await p.query_selector('[data-act=chooseSong]')
    if btn: await btn.click()
    else: await to_setup(p)
    return sid
async def hall_detail(p, hall_id):
    await to_setup(p)
    await p.click('[data-act=cgo][data-v=hallList]')
    row=await find_row(p, f'.cbody .crow[data-id="{hall_id}"]'); await row.click()
async def reserve_hall(p, hall_id):
    await hall_detail(p, hall_id)
    btn=await p.query_selector('[data-act=reserveHall]:not([disabled])')
    if btn: await btn.click(); return True
    await to_setup(p); return False
async def choose_conductor(p, cid=None):
    await to_setup(p)
    await p.click('[data-act=cgo][data-v=condList]')
    if cid: await p.click(f'.cbody .crow[data-id="{cid}"]')
    else: await p.click('.cbody .crow >> nth=0')
    btn=await p.query_selector('[data-act=chooseCond]')
    if btn: await btn.click()
    else: await to_setup(p)
async def setup_all(p, hall='small', genre='orchestral', song_id=None, idx=0):
    await open_concert(p)
    await choose_song(p, genre, song_id, idx); await reserve_hall(p, hall)
    if not await p.evaluate('setupStatus(activeConcert()).conductor'): await choose_conductor(p)
    await p.click('[data-act=toPractice]')
async def practice(p, menu='tutti'):
    if menu=='tutti': await p.click('[data-act=cgo][data-v=tutti]')
    elif menu=='section': await p.click('[data-act=cgo][data-v=section]')
    else:
        await p.click('[data-act=cgo][data-v=indivPick]')
        if not await p.evaluate('UI.draft.members.length'): await p.click('.cbody [data-act=indPick] >> nth=0')
        await p.click('[data-act=cgo][data-v=indivFocus]')
    # 練習は10〜15秒かけて3Dで再生される。テストでは時間を縮め、イベントが出たら最初の選択肢を選ぶ
    await p.evaluate('UI.practiceTest = UI.practiceTest || {scale:0.04}')
    await p.evaluate('window.__reseed && __reseed()')   # 回帰テスト用（乱数の並びを練習ごとにそろえる）
    await p.click('[data-act=runPractice]')
    await finish_practice(p)
    await p.click('.cfoot .cbtn.big')
async def finish_practice(p, choice=None, quiz=0):
    for _ in range(400):
        st = await p.evaluate('UI.practicing ? UI.practicing.evState : "end"')
        if st == 'end':
            if quiz is not None: await answer_quiz(p, quiz)
            return
        if st == 'open':
            sel = f'[data-act=prChoice][data-v={choice}]' if choice else '[data-act=prChoice] >> nth=0'
            await p.click(sel)
        await p.wait_for_timeout(50)
    raise Exception('practice did not finish')
async def practice_all(p, menus=None):
    menus = menus or ['tutti','section']*5
    for m in menus:
        if await p.evaluate('activeConcert().phase')!='practice': break
        await practice(p, m)
async def rehearse(p):
    await p.click('[data-act=cgo][data-v=rehearse]')
    btn=await p.query_selector('[data-act=hall]:not([disabled])')
    if btn: await btn.click(); return True
    await p.click('[data-act=cback]'); return False
async def set_policy(p, v):
    await p.click('[data-act=cgo][data-v=policy]'); await p.click(f'[data-act=policy][data-v={v}]')
async def perform(p, skip=True):
    await p.click('[data-act=perform]')
    if skip and await p.evaluate('UI.showing'): await p.click('[data-act=skipShow]')

# ===== ホーム・団員・育成・記録（階層型UI）の操作ヘルパー =====
import json as _json
async def tnav(p, tab, path=()):
    """指定タブの階層を path の画面まで開く（タブボタン押下後に階層を設定）"""
    await p.click(f'.nav [data-tab={tab}]')
    await p.evaluate(f'tjump({_json.dumps(tab)}, {_json.dumps(list(path))}); render()')
async def open_recruit(p):
    await tnav(p, 'members', [{'s': 'recruit'}, {'s': 'recMembers'}])
async def hire(p, cid):
    await tnav(p, 'members', [{'s': 'recruit'}, {'s': 'recMembers'}, {'s': 'recCand', 'id': cid, 'tab': 'info'}])
    await p.click('[data-act=tHire]')
async def reroll(p):
    await open_recruit(p); await p.click('[data-act=tReroll]')
async def train_target(p, t, target_id, ab=None, sec=None):
    """育成：種類→対象→（能力）→確認画面まで進める"""
    k = 'conductor' if t.startswith('c_') else 'member'
    scr = {'s': 'tTarget', 't': t}
    if sec: scr['tab'] = sec
    await tnav(p, 'train', [{'s': 'tList', 'k': k}, scr])
    sel = f'.tbody [data-act=tTargetPick][data-id="{target_id}"]'
    if await p.query_selector(sel): await p.click(sel)
    else: await p.evaluate(f'ACTIONS.tTargetPick({{id:{_json.dumps(target_id)}}})')
    if ab: await p.click(f'[data-act=tAbilityPick][data-v={ab}]')
async def train_run(p, t, target_id, ab=None, sec=None):
    await train_target(p, t, target_id, ab, sec)
    await p.click('[data-act=tTrainRun]')
    return await p.inner_text('.tresmsg')
async def member_detail(p, mid, tab='info'):
    inst = await p.evaluate(f'memberById("{mid}").inst')
    g = await p.evaluate(f'GROUPS.find(g=>groupInsts(g.id).includes("{inst}")).id')
    await tnav(p, 'members', [{'s': 'mGroup', 'g': g}, {'s': 'mInst', 'inst': inst}, {'s': 'mMember', 'id': mid, 'tab': tab}])
async def set_principal(p, mid):
    await member_detail(p, mid); await p.click('[data-act=tPrincipal]')
async def dismiss(p, mid):
    await member_detail(p, mid); await p.click('[data-act=tgo][data-v=mDismiss]')
    btn = await p.query_selector('[data-act=tDismiss]')   # 首席奏者は除籍できない（ボタンが出ない）
    if not btn: return False
    await btn.click(); return True
async def hire_cond(p, cid):
    await tnav(p, 'members', [{'s': 'recruit'}, {'s': 'recConds'}, {'s': 'recCond', 'id': cid, 'tab': 'info'}])
    await p.click('[data-act=tCondHire]')
async def set_cond(p, cid):
    await tnav(p, 'members', [{'s': 'mConds'}, {'s': 'mCond', 'id': cid, 'tab': 'info'}])
    await p.click('[data-act=tCondSet]')

async def answer_quiz(p, choice=0):
    """練習2回ごとのクイズが出ていれば回答して練習報告へ戻る（choice: 画面上の番号 / 'right' / 'wrong'）"""
    if not await p.evaluate('typeof cmdTop==="function" && cmdTop().s==="quiz"'): return None
    if choice in ('right', 'wrong'):
        choice = await p.evaluate(f'(()=>{{const o=quizPending().order;return {"o.indexOf(0)" if choice=="right" else "o.findIndex(x=>x!==0)"}}})()')
    await p.click(f'[data-act=quizAnswer][data-v="{choice}"]')
    res = await p.evaluate('UI.quizResult')
    await p.click('[data-act=quizDone]')
    return res
