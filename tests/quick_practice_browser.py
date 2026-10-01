"""Instant practice acceptance on real local HTTP; no video or live API needed.
The one network failure and denied-storage case are deliberate fault injection.
"""
import json,os,subprocess,time
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright,expect
R=Path(__file__).resolve().parents[1];OUT=R/'artifacts/rehearsal';OUT.mkdir(parents=True,exist_ok=True)
BASE='http://127.0.0.1:3395';checks=[];errors=[];requests=[]
report={'checks':checks,'errors':errors,'realLocalHTTP':True,'liveAPIMocked':False,'hostedRenderVerified':False,'physicalPhoneVerified':False}
env={**os.environ,'BLENDING_OPEN_PREVIEW':'true','NODE_ENV':'test','APP_ORIGIN':BASE,'PORT':'3395','HOST':'127.0.0.1'}
def passed(t):checks.append(t);print('PASS',t,flush=True)
with (OUT/'quick-server.log').open('w') as log:
 proc=subprocess.Popen(['node','--experimental-sqlite','apps/server/main.mjs'],cwd=R,env=env,stdout=log,stderr=subprocess.STDOUT)
 try:
  for _ in range(100):
   try:
    with urlopen(BASE+'/api/health',timeout=1) as r:assert json.load(r)['openPreview']
    break
   except Exception:
    if proc.poll() is not None:raise RuntimeError('Preview failed to start')
    time.sleep(.1)
  else:raise RuntimeError('Preview readiness timed out')
  with sync_playwright() as pw:
   opts={'executable_path':os.environ['CHROMIUM']} if os.environ.get('CHROMIUM') else {}
   browser=pw.chromium.launch(headless=True,**opts,args=['--no-sandbox']);ctx=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce')
   page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
   page.on('request',lambda r:requests.append({'url':r.url,'method':r.method}))
   try:
    before=ctx.request.get(BASE+'/api/public/games/BGDEMO').json()['standings']
    page.goto(BASE+'/rehearsal',wait_until='domcontentloaded')
    expect(page.locator('[data-choice="101"]')).to_be_enabled()
    expect(page.locator('#reveal')).to_be_disabled()
    assert page.locator('video,audio,iframe,input').count()==0
    assert not any('.mp4' in r['url'] for r in requests)
    for selector in ['[data-choice="101"]','[data-choice="102"]','#reveal']:
     box=page.locator(selector).bounding_box();assert box['y']+box['height']<=844;assert box['height']>=48
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path=str(OUT/'quick-phone-start.png'),full_page=True)
    passed('Default page opens directly to a pick: no login, audio, video load, timer or first-screen scrolling')
    page.locator('[data-choice="102"]').click()
    expect(page.locator('[data-choice="102"]')).to_have_attribute('aria-pressed','true')
    expect(page.locator('#feedback')).to_contain_text('saved in this tab')
    expect(page.locator('#reveal')).to_be_enabled()
    # The selected-hover state must stay legible, not dark text on a dark card.
    assert page.locator('[data-choice="102"]').evaluate('(e)=>getComputedStyle(e).backgroundColor')=='rgb(241, 94, 57)'
    page.screenshot(path=str(OUT/'quick-phone-pick.png'),full_page=True)
    page.locator('[data-choice="101"]').click();page.locator('[data-choice="102"]').click()
    page.reload();expect(page.locator('[data-choice="102"]')).to_have_attribute('aria-pressed','true')
    page.locator('#reveal').click();expect(page.locator('#points')).to_have_text('1 / 1')
    expect(page.locator('#question-title')).to_have_text('You called it.')
    expect(page.locator('[data-choice="101"]')).to_be_disabled()
    page.reload();expect(page.locator('#points')).to_have_text('1 / 1')
    page.screenshot(path=str(OUT/'quick-phone-result.png'),full_page=True)
    passed('One-tap choices, changes, confirmed local save and reveal work; refresh keeps one point without double counting')
    page.locator('#restart').click();expect(page.locator('#points')).to_have_text('0 / 1')
    expect(page.locator('#reveal')).to_be_disabled()
    page.locator('[data-choice="101"]').focus();page.keyboard.press('Enter')
    expect(page.locator('[data-choice="101"]')).to_have_attribute('aria-pressed','true')
    ctx.set_offline(True);page.locator('#reveal').click();expect(page.locator('#points')).to_have_text('0 / 1')
    expect(page.locator('#question-title')).to_have_text('Sample 102 takes it.')
    ctx.set_offline(False)
    for width in [320,390,768,1280]:
     page.set_viewport_size({'width':width,'height':900});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.locator('#restart').click();page.locator('[data-choice="102"]').click()
    page.screenshot(path=str(OUT/'quick-desktop-pick.png'),full_page=True)
    passed('Wrong pick, instant restart, keyboard play, offline local reveal and four responsive widths work')
    other=ctx.new_page();other.goto(BASE+'/rehearsal');expect(other.locator('#reveal')).to_be_disabled()
    denied=browser.new_context()
    denied.add_init_script('Object.defineProperty(window,"sessionStorage",{get(){throw new DOMException("Blocked","SecurityError")}})')
    no=denied.new_page();no.goto(BASE+'/rehearsal');expect(no.locator('[data-choice="102"]')).to_be_enabled()
    no.locator('[data-choice="102"]').click();expect(no.locator('#storage-note')).to_contain_text('Storage is unavailable')
    no.locator('#reveal').click();expect(no.locator('#points')).to_have_text('1 / 1');denied.close()
    bad=ctx.new_page();bad.route('**/rehearsal/episode.json',lambda r:r.abort());bad.goto(BASE+'/rehearsal')
    expect(bad.locator('#retry')).to_be_visible();expect(bad.locator('#reveal')).to_be_disabled()
    bad.unroute('**/rehearsal/episode.json');bad.locator('#retry').click();expect(bad.locator('[data-choice="101"]')).to_be_enabled()
    assert all(r['method'] in ['GET','HEAD'] for r in requests)
    assert ctx.request.get(BASE+'/api/public/games/BGDEMO').json()['standings']==before
    assert not errors,errors
    passed('Fresh-tab and denied-storage behavior, recoverable load failure and no writes to shared live standings verified')
    report['passed']=True
   except Exception:
    page.screenshot(path=str(OUT/'quick-failure.png'),full_page=True);raise
   finally:ctx.close();browser.close()
 except Exception as e:
  report['passed']=False;report['failure']=str(e);raise
 finally:
  proc.terminate()
  try:proc.wait(timeout=10)
  except subprocess.TimeoutExpired:proc.kill()
  (OUT/'quick-report.json').write_text(json.dumps(report,indent=2))
