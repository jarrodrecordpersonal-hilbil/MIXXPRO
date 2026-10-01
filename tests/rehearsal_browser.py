"""Real native MP4 playback/seek and local HTTP. No mocked video clock or game APIs."""
import json, os, subprocess, time
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'artifacts/rehearsal';OUT.mkdir(parents=True,exist_ok=True)
BASE='http://127.0.0.1:3389';checks=[];errors=[];writes=[]
report={'checks':checks,'errors':errors,'realLocalHTTP':True,'realNativeMP4':True,'mockedClock':False,'hostedRenderVerified':False,'physicalPhoneVerified':False}
env={**os.environ,'BLENDING_OPEN_PREVIEW':'true','NODE_ENV':'test','APP_ORIGIN':BASE,'PORT':'3389','HOST':'127.0.0.1'}
def passed(t):checks.append(t);print('PASS',t,flush=True)
def seek(page,t):
 page.locator('#video').evaluate('(v,t)=>{v.pause();v.currentTime=t;}',t)
 page.wait_for_function('(t)=>Math.abs(document.getElementById("video").currentTime-t)<.15&&!document.getElementById("video").seeking',arg=t)
 page.wait_for_timeout(180)
def fits(page):assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
with (OUT/'server.log').open('w') as log:
 proc=subprocess.Popen(['node','--experimental-sqlite','apps/server/main.mjs'],cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT)
 try:
  for _ in range(100):
   try:
    with urlopen(BASE+'/api/health',timeout=1) as r:assert json.load(r)['openPreview']
    break
   except Exception:
    if proc.poll() is not None:raise RuntimeError('Preview failed to start')
    time.sleep(.1)
  with sync_playwright() as pw:
   opts={'executable_path':os.environ['CHROMIUM']} if os.environ.get('CHROMIUM') else {}
   browser=pw.chromium.launch(headless=True,**opts,args=['--no-sandbox']);ctx=browser.new_context(viewport={'width':390,'height':844})
   page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
   page.on('request',lambda r:writes.append(r.url) if r.method not in ['GET','HEAD'] else None)
   page.add_init_script("window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective));")
   try:
    before=ctx.request.get(BASE+'/api/public/games/BGDEMO').json()['standings']
    page.goto(BASE+'/rehearsal?mode=video',wait_until='domcontentloaded')
    expect(page.locator('#start')).to_be_enabled()
    expect(page.locator('#answers')).not_to_be_visible()
    assert page.locator('input').count()==0
    assert page.locator('#video').evaluate('(v)=>v.paused&&v.playsInline')
    assert abs(page.locator('#video').evaluate('(v)=>v.duration')-90)<.1
    media=ctx.request.get(BASE+'/rehearsal/episode.mp4',headers={'Range':'bytes=0-15'})
    assert media.status==206 and len(media.body())==16
    assert media.headers['content-type']=='video/mp4'
    assert ctx.request.get(BASE+'/rehearsal/episode.mp4',headers={'Range':'bytes=999999999-'}).status==416
    assert ctx.request.get(BASE+'/rehearsal/captions.vtt').text().startswith('WEBVTT')
    passed('No-code/no-login entry; real 90-second silent H264 video with inline controls, captions and HTTP range support')
    # Advance using the actual decoder. No mocked timeupdate events.
    seek(page,33.75);page.locator('#start').click()
    expect(page.locator('#answers')).to_be_visible(timeout=4000)
    page.locator('#video').evaluate('(v)=>v.pause()')
    remaining=page.locator('#countdown').inner_text();page.wait_for_timeout(1200)
    assert page.locator('#countdown').inner_text()==remaining
    page.locator('[data-choice="102"]').click()
    expect(page.locator('[data-choice="102"]')).to_have_attribute('aria-pressed','true')
    expect(page.locator('#feedback')).to_contain_text('saved in this tab')
    saved_time=page.locator('#video').evaluate('(v)=>v.currentTime')
    page.reload(wait_until='domcontentloaded')
    expect(page.locator('[data-choice="102"]')).to_have_attribute('aria-pressed','true')
    assert abs(page.locator('#video').evaluate('(v)=>v.currentTime')-saved_time)<.3
    assert page.locator('#video').evaluate('(v)=>v.paused')
    page.locator('[data-choice="101"]').click();page.locator('[data-choice="102"]').click()
    expect(page.locator('#points')).to_contain_text('0')
    fits(page);page.evaluate('scrollTo(0,0)')
    bottom=page.locator('[data-choice="102"]').bounding_box()
    assert bottom['y']+bottom['height']<=844
    page.screenshot(path=str(OUT/'phone-question.png'),full_page=True)
    passed('Real playback opens the embedded question; pause freezes it; picks save immediately and refresh resumes paused with the same choice')
    seek(page,54);expect(page.locator('[data-choice="101"]')).to_be_disabled()
    seek(page,40);expect(page.locator('[data-choice="101"]')).to_be_disabled()
    expect(page.locator('#instruction')).to_contain_text('already passed')
    seek(page,62);expect(page.locator('#question-title')).to_have_text('Sample 102 wins.')
    expect(page.locator('#verdict')).to_contain_text('+1 practice point')
    for t in [75,40,62]:seek(page,t)
    expect(page.locator('#points')).to_have_text('1 / 1')
    page.screenshot(path=str(OUT/'phone-result.png'),full_page=True)
    passed('Deadline locks at 0:54, rewind cannot reopen this run, reveal arrives at 1:02, and replay never adds extra points')
    for width in [320,390,768,1280]:
     page.set_viewport_size({'width':width,'height':900});fits(page)
    page.screenshot(path=str(OUT/'desktop-result.png'),full_page=True)
    page.locator('#restart').click();expect(page.locator('#points')).to_have_text('0 / 1')
    seek(page,40);expect(page.locator('[data-choice="101"]')).to_be_enabled()
    page.locator('[data-choice="101"]').click();seek(page,62)
    expect(page.locator('#verdict')).to_contain_text('0 practice points')
    other=ctx.new_page();other.goto(BASE+'/rehearsal?mode=video');expect(other.locator('#start')).to_be_enabled()
    expect(other.locator('#points')).to_have_text('0 / 1')
    assert not writes,writes
    assert ctx.request.get(BASE+'/api/public/games/BGDEMO').json()['standings']==before
    assert not page.evaluate('window.__csp')
    assert not errors,errors
    passed('Independent tab, honest wrong/no-pick results, restart, responsive widths and zero writes to live game APIs')
    report['passed']=True
    ctx.close();browser.close()
   except Exception:
    page.screenshot(path=str(OUT/'failure.png'),full_page=True);raise
   finally:ctx.close();browser.close()
 except Exception as e:
  report['passed']=False;report['failure']=str(e);raise
 finally:
  proc.terminate()
  try:proc.wait(timeout=10)
  except subprocess.TimeoutExpired:proc.kill()
  (OUT/'report.json').write_text(json.dumps(report,indent=2))
