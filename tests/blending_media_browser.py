"""Local HTTP + real Chromium. YouTube iframe is stubbed for deterministic lifecycle
checks only; no claim of real external playback or live Render verification."""
import json, os, subprocess, time
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts'/'blending-media'; OUT.mkdir(parents=True,exist_ok=True)
BASE='http://127.0.0.1:3387'
checks=[];errors=[];embed_requests=[]
report={'checks':checks,'errors':errors,'realGameHTTP':True,'youtubeIframeStubbed':True,'actualYouTubePlaybackVerified':False,'hostedRenderVerified':False}
env={**os.environ,'BLENDING_OPEN_PREVIEW':'true','NODE_ENV':'test','PORT':'3387','HOST':'127.0.0.1','APP_ORIGIN':BASE}
with (OUT/'server.log').open('w') as log:
 proc=subprocess.Popen(['node','--experimental-sqlite','apps/server/main.mjs'],cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT)
 try:
  for _ in range(100):
   try:
    with urlopen(BASE+'/api/health',timeout=1) as r: assert json.load(r)['openPreview']
    break
   except Exception:
    if proc.poll() is not None: raise RuntimeError('Preview startup failed')
    time.sleep(.1)
  with sync_playwright() as p:
   options={'executable_path':os.environ['CHROMIUM']} if os.environ.get('CHROMIUM') else {}
   browser=p.chromium.launch(**options,headless=True,args=['--no-sandbox'])
   ctx=browser.new_context(viewport={'width':1440,'height':1050})
   def stub(route):
    embed_requests.append({'url':route.request.url,'referer':route.request.headers.get('referer')})
    route.fulfill(status=200,content_type='text/html',body='<html><body>External player stub: playback not tested</body></html>')
   ctx.route('https://www.youtube-nocookie.com/embed/**',stub)
   page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
   page.on('dialog',lambda d:d.accept())
   page.add_init_script("window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective));")
   page.goto(BASE+'/blending/TRYBG',wait_until='domcontentloaded')
   expect(page.locator('#play-event')).to_be_visible()
   expect(page.locator('#show-episodes button')).to_have_count(4)
   expect(page.locator('#show-details')).to_have_attribute('open','')
   assert page.locator('#show-stage iframe').count()==0
   for img in ['.brand img','.studio-credit img']:
    assert page.locator(img).evaluate('(i)=>i.complete && i.naturalWidth>0')
   assert page.locator('#show-external').get_attribute('href').endswith('Lp71Y_h9ZmM')
   page.locator('#mixxtank-watch').scroll_into_view_if_needed()
   page.screenshot(path=str(OUT/'01-watch-desktop.png'),full_page=True)
   report['thumbnailLoaded']=page.locator('#show-thumbnail').evaluate('(i)=>i.complete && i.naturalWidth>0')
   checks.append('Original marks, four verified episode choices and no player until explicit click')
   page.locator('#show-poster').click()
   expect(page.locator('#show-stage iframe')).to_have_count(1)
   page.wait_for_timeout(300)
   frame=page.locator('#show-stage iframe')
   assert frame.get_attribute('referrerpolicy')=='strict-origin-when-cross-origin'
   assert embed_requests and embed_requests[-1]['referer']==BASE+'/'
   frame.evaluate('(n)=>n.dataset.testIdentity="keep"')
   # Force a real server state change from a separate anonymous producer context.
   api=ctx.request
   metadata=api.get(BASE+'/api/open-preview').json()
   host=api.get(BASE+'/api/admin/blending/seasons/TRYBG').json()
   batch=next(b for b in host['batches'] if b['event'])
   response=api.post(BASE+'/api/admin/blending/batches/'+batch['id']+'/advance',data={'action':'open','expectedRevision':batch['event']['stateRevision'],'seconds':120},headers={'Origin':BASE,'X-CSRF-Token':metadata['csrf']})
   assert response.status==200
   page.wait_for_timeout(4500)
   expect(frame).to_have_attribute('data-test-identity','keep')
   assert len(embed_requests)==1
   checks.append('Score polling preserves the iframe; embedding sends only origin as referrer')
   page.locator('[data-show-episode=zNaXMhUye7k]').click()
   assert page.locator('#show-stage iframe').count()==0
   expect(page.locator('#show-episode')).to_contain_text('Episode 2')
   page.locator('#show-poster').click()
   expect(page.locator('#show-stage iframe')).to_have_count(1)
   page.locator('.tabs [data-view=judge]').click()
   expect(page.locator('.scorecard')).to_have_count(6)
   assert page.locator('#show-stage iframe').count()==0
   expect(page.locator('#mixxtank-watch')).not_to_be_visible()
   checks.append('Episode selection and leaving for judging stop playback; no-login judge access preserved')
   page.locator('.tabs [data-view=results]').click()
   expect(page.locator('.score-empty')).to_be_visible()
   assert not page.locator('#show-details').evaluate('(n)=>n.open')
   assert page.locator('#workspace').bounding_box()['y']<page.locator('#mixxtank-watch').bounding_box()['y']
   page.set_viewport_size({'width':390,'height':844})
   page.locator('#show-details summary').click()
   page.locator('#mixxtank-watch').scroll_into_view_if_needed()
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
   page.screenshot(path=str(OUT/'02-watch-phone.png'),full_page=True)
   page.locator('#show-poster').click()
   box=page.locator('#show-stage iframe').bounding_box()
   assert box['width']>=200 and box['height']>=200
   page.set_viewport_size({'width':320,'height':844})
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
   page.locator('#show-stop').click()
   assert page.locator('#show-stage iframe').count()==0
   # Test a failed thumbnail independently from actual thumbnail availability.
   page.locator('#show-thumbnail').dispatch_event('error')
   expect(page.locator('#show-stage')).to_have_class('show-stage thumbnail-unavailable')
   expect(page.locator('#show-external')).to_be_visible()
   assert not page.evaluate('window.__csp')
   assert not errors,errors
   checks.append('Scores stay first; phone reflow, >=200px embed, local thumbnail fallback and external watch link work')
   report['passed']=True
   ctx.close();browser.close()
 except Exception as e:
  report['passed']=False;report['failure']=str(e);raise
 finally:
  proc.terminate()
  try: proc.wait(timeout=10)
  except subprocess.TimeoutExpired: proc.kill()
  (OUT/'report.json').write_text(json.dumps(report,indent=2))
  print(json.dumps(report,indent=2),flush=True)
