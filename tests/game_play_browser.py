"""Watch-and-play: real app HTTP in independent contexts. YouTube playback is not mocked or certified."""
import json
import os
from pathlib import Path
import subprocess
import time
from urllib.request import urlopen
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts'/'game-play'
OUT.mkdir(parents=True,exist_ok=True)
BASE='http://127.0.0.1:3377'
checks,errors=[],[]
report={'checks':checks,'errors':errors,'method':'Real Chromium and local application HTTP; no game API mocks',
        'youtubePlaybackCertified':False,'hostedRenderTested':False,'testDataOnly':True}
def passed(text):
 checks.append(text); print('PASS:',text,flush=True)
def fit(page):
 assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'), 'Page overflows'
def advance(page,action):
 page.locator(f'[data-advance="{action}"]').click()
 expect(page.locator('#notice')).to_have_text('Show state updated.')
 page.locator('#notice').evaluate('(n)=>n.textContent=""')
env={**os.environ,'BLENDING_OPEN_PREVIEW':'true','NODE_ENV':'test','PORT':'3377','HOST':'127.0.0.1','APP_ORIGIN':BASE}
with (OUT/'server.log').open('w') as log:
 proc=subprocess.Popen(['node','--experimental-sqlite','apps/server/main.mjs'],cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT)
 try:
  for _ in range(100):
   try:
    with urlopen(BASE+'/api/health',timeout=1) as r: assert json.load(r)['openPreview']
    break
   except Exception:
    if proc.poll() is not None: raise RuntimeError('Preview exited')
    time.sleep(.1)
  with sync_playwright() as pw:
   opts={'executable_path':os.environ['CHROMIUM']} if os.environ.get('CHROMIUM') else {}
   browser=pw.chromium.launch(**opts,headless=True,args=['--no-sandbox'])
   contexts=[]
   def page(width=1440):
    ctx=browser.new_context(viewport={'width':width,'height':1000 if width>700 else 844})
    contexts.append(ctx); p=ctx.new_page()
    p.on('pageerror',lambda e:errors.append(str(e)));p.on('dialog',lambda d:d.accept())
    p.add_init_script("window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective));")
    return p
   try:
    desk=page();desk.goto(BASE+'/blending/TRYBG')
    expect(desk.locator('#play-event')).to_be_visible()
    expect(desk.locator('#show-poster')).to_be_visible()
    expect(desk.locator('#show-details')).to_have_attribute('open','')
    assert desk.locator('.brand img').get_attribute('src')=='/bg-media/bourbon-games.png'
    assert desk.locator('iframe').count()==0, 'Video loaded without user action'
    expect(desk.locator('.show-disclaimer')).to_contain_text('separate')
    fit(desk); desk.wait_for_timeout(1000)
    desk.screenshot(path=str(OUT/'01-game-day-desktop.png'),full_page=True)
    phone=page(390);phone.goto(BASE+'/blending/TRYBG')
    expect(phone.locator('#play-event')).to_be_visible()
    assert phone.locator('#workspace').bounding_box()['y'] < phone.locator('#mixxtank-watch').bounding_box()['y']
    for width in [320,390,768,1280]:
     phone.set_viewport_size({'width':width,'height':844});fit(phone)
    phone.set_viewport_size({'width':390,'height':844})
    phone.screenshot(path=str(OUT/'02-game-day-phone.png'),full_page=True)
    passed('Original brand art, recorded series and one obvious Join action; phone keeps play before optional viewing')

    desk.locator('#show-poster').click()
    expect(desk.locator('#show-stage iframe')).to_have_count(1)
    frame=desk.locator('#show-stage iframe')
    assert frame.get_attribute('src').startswith('https://www.youtube-nocookie.com/embed/Lp71Y_h9ZmM?')
    assert frame.get_attribute('referrerpolicy')=='strict-origin-when-cross-origin'
    frame.evaluate('(node)=>node.dataset.persist="still-here"')
    host=page();host.goto(BASE+'/blending/TRYBG?view=host')
    expect(host.locator('#preview-lock-scores')).to_be_visible()
    advance(host,'open')
    expect(desk.locator('#live-card-content')).to_contain_text('PREDICTIONS OPEN',timeout=12000)
    expect(frame).to_have_attribute('data-persist','still-here')
    desk.locator('[data-show-episode=zNaXMhUye7k]').click()
    expect(desk.locator('#show-stage iframe')).to_have_count(0)
    expect(desk.locator('#show-external')).to_have_attribute('href','https://www.youtube.com/watch?v=zNaXMhUye7k')
    desk.locator('#show-poster').click()
    desk.locator('[data-view=judge]').click()
    expect(desk.locator('#show-stage iframe')).to_have_count(0)
    passed('Click-to-load YouTube frame survives game polling; changing episodes/opening Judge stops it and retains fallback links')

    player=page(390);player.goto(BASE+'/games/BGDEMO')
    expect(player.locator('#join-form')).to_be_visible()
    expect(player.locator('#next-step')).to_contain_text('Enter a name')
    assert player.locator('#watch-drawer').get_attribute('open') is None
    player.locator('#guest-name').fill('Easy Player')
    player.locator('#join-form button').click()
    pick=player.locator('[data-kind=bracket]').first
    expect(pick).to_be_enabled()
    expect(player.locator('#matchups > article')).to_have_count(1)
    expect(player.locator('.bonus-picks')).not_to_have_attribute('open','')
    pick.click();expect(player.locator('[data-kind=bracket][aria-pressed=true]')).to_have_count(1)
    expect(player.locator('#feedback')).to_contain_text('Saved:')
    player.locator('.bonus-picks>summary').click()
    judgepick=player.locator('[data-kind=judge]').first
    judgepick.click();expect(judgepick).to_have_attribute('aria-pressed','true')
    expect(player.locator('.bonus-picks')).to_have_attribute('open','')
    player.reload()
    expect(player.locator('#player-name')).to_have_text('Easy Player')
    expect(player.locator('[data-kind=bracket][aria-pressed=true]')).to_have_count(1)
    # The saved optional pick remains stored, even when the bonus details start collapsed on a fresh page.
    expect(player.locator('[data-kind=judge][aria-pressed=true]')).to_have_count(1)
    fit(player)
    main_pick=player.locator('[data-kind=bracket]').first.bounding_box()
    assert main_pick['y']+main_pick['height'] <= 844, 'Main phone pick should fit before the first scroll'
    player.screenshot(path=str(OUT/'03-player-pick-phone.png'),full_page=True)
    passed('One-name guest entry, a single active matchup, optional bonus picks, and server-confirmed choices restored after refresh')

    player.locator('#watch-drawer>summary').click()
    player.locator('mixx-show .show-cover').click()
    player.locator('mixx-show iframe').evaluate('(node)=>node.dataset.persist="player"')
    player.locator('[data-kind=bracket]').last.click()
    expect(player.locator('[data-kind=bracket]').last).to_have_attribute('aria-pressed','true')
    expect(player.locator('mixx-show iframe')).to_have_attribute('data-persist','player')
    player.locator('#watch-drawer>summary').click()
    expect(player.locator('mixx-show iframe')).to_have_count(0)
    player.context.set_offline(True)
    expect(player.locator('#connection')).to_contain_text('Connection lost',timeout=12000)
    assert player.locator('[data-pick]:enabled').count()==0
    player.context.set_offline(False)
    expect(player.locator('#connection')).to_contain_text('Connected',timeout=12000)
    expect(player.locator('[data-kind=bracket]').last).to_have_attribute('aria-pressed','true')
    passed('Video frame stays mounted while saving picks; closing watch stops it; offline disables writes without losing confirmed choices')

    host.locator('#preview-lock-scores').click()
    expect(host.locator('#notice')).to_contain_text('Demo scorecards locked')
    advance(host,'close');advance(host,'reveal')
    expect(player.locator('#status')).to_have_text('Results are in.',timeout=12000)
    assert player.locator('[data-pick]:enabled').count()==0
    expect(player.locator('#next-step')).to_contain_text('next round')
    late=page(390);late.goto(BASE+'/games/BGDEMO')
    late.locator('#guest-name').fill('Late Player');late.locator('#join-form button').click()
    advance(host,'open')
    expect(late.locator('[data-kind=bracket]').first).to_be_enabled(timeout=12000)
    late.locator('[data-kind=bracket]').first.click()
    expect(late.locator('[data-kind=bracket][aria-pressed=true]')).to_have_count(1)
    for width in [320,390,768,1280]:
     late.set_viewport_size({'width':width,'height':844});fit(late)
    for ctx in contexts:
     for p in ctx.pages: assert not p.evaluate('window.__csp||[]'), 'Parent page CSP violation'
    assert not errors,errors
    passed('Real close/reveal sequence locks picks, late players join the next round, and player screens reflow without JS/CSP errors')
    report['passed']=True
   finally:
    for ctx in contexts: ctx.close()
    browser.close()
 except Exception as e:
  report['passed']=False;report['failure']=str(e);raise
 finally:
  proc.terminate()
  try:proc.wait(timeout=8)
  except subprocess.TimeoutExpired:proc.kill()
  (OUT/'report.json').write_text(json.dumps(report,indent=2))
