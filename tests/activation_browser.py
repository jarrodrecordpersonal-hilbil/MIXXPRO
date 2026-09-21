"""Real browser acceptance for music funding requests and Bunny diagnostics.
Owns a disposable loopback-only server/database. No provider credentials inherited.
"""
import json,os,sqlite3,subprocess,tempfile,time,urllib.request,uuid
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from settings_browser_checks import settings_checks
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts';OUT.mkdir(exist_ok=True)
BASE='http://127.0.0.1:3362';checks=[];errors=[]
def passed(label):checks.append(label);print('PASS:',label,flush=True)
with tempfile.TemporaryDirectory(prefix='mixxpro-activation-') as temp:
    database=Path(temp)/'test.sqlite'
    env={**os.environ,'NODE_ENV':'test','SIGNUPS_ENABLED':'true','DEMO_MODE':'false','PORT':'3362','HOST':'127.0.0.1','DB_PATH':str(database),'APP_ORIGIN':BASE,'APP_SECRET':'test-activation-long-private-local-only','COMMISSION_BPS':'0'}
    for key in list(env):
        if key.startswith(('BUNNY_','R2_','STRIPE_','COMMERCE_')):env.pop(key)
    with (OUT/'activation-server.log').open('w') as log:
        process=subprocess.Popen(['node','--experimental-sqlite','apps/server/main.mjs'],cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT)
        try:
            for _ in range(60):
                try:
                    urllib.request.urlopen(BASE+'/api/health',timeout=1).close();break
                except OSError:
                    if process.poll() is not None:raise RuntimeError('Fixture server stopped')
                    time.sleep(.2)
            with sync_playwright() as p:
                options={'headless':True,'args':['--no-sandbox']}
                if os.environ.get('CHROMIUM'):options['executable_path']=os.environ['CHROMIUM']
                browser=p.chromium.launch(**options);context=browser.new_context(viewport={'width':1440,'height':1050});page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
                try:
                    page.goto(BASE);page.locator('input[name="name"]').fill('Jordan');page.locator('input[name="venueName"]').fill('Oak & Ember');page.locator('input[name="email"]').fill('activation-'+uuid.uuid4().hex[:8]+'@example.test');page.locator('input[name="password"]').fill('test-activation-password-2026');page.locator('[data-form="auth"] button[type=submit]').click()
                    settings=page.locator('nav [data-stream-settings]');expect(settings.locator('summary')).to_be_visible()
                    if not settings.evaluate('(el)=>el.open'):settings.locator('summary').click()
                    settings_checks(page,context,BASE,database,OUT,passed)
                    expect(page.locator('nav [data-extension="music"]')).to_be_visible();page.locator('nav [data-extension="music"]').click();expect(page.get_by_role('heading',name='Plan your room’s music.')).to_be_visible();passed('Music setup is reachable from the existing venue dashboard')
                    page.locator('[name="payer"][value="sponsor"]').check();page.locator('[name="confirm"]').check();page.locator('#music-request button[type=submit]').click();expect(page.get_by_text('Awaiting review',exact=True)).to_be_visible();expect(page.locator('#music-request')).to_have_count(0);passed('Sponsor request persists without self-activation or payment')
                    page.on('dialog',lambda d:d.accept());page.locator('[data-cancel]').click();expect(page.locator('#music-request')).to_be_visible();page.locator('[name="payer"][value="venue"]').check();page.locator('[name="zones"]').fill('2');page.locator('[name="confirm"]').check();page.locator('#music-request button[type=submit]').click();expect(page.get_by_text('Venue-paid music',exact=True)).to_be_visible();passed('Owner can cancel a request and choose venue-funded music instead')
                    session=context.request.get(BASE+'/api/session').json()
                    with sqlite3.connect(database) as con:con.execute("UPDATE users SET platform_role='admin' WHERE id=?",(session['user']['id'],))
                    page.goto(BASE);expect(page.locator('[data-page="admin"]')).to_have_count(1)
                    panel=page.locator('nav [data-stream-settings]');panel.locator('summary').click();expect(panel.locator('[data-settings-group="network"]')).to_have_text('Network tools');expect(page.locator('[data-extension="setup"]')).to_have_text('↗Connections')
                    page.locator('[data-page="admin"]').click();expect(page.locator('[data-action="import-bunny"]')).to_be_disabled();expect(page.locator('[data-action="archive"]')).to_be_disabled()
                    page.locator('[data-page="brands"]').click();expect(page.locator('.main')).to_contain_text('No campaigns in this account.')
                    passed('Network tools appear only for administrators and unavailable provider actions explain their prerequisites')
                    page.goto(BASE+'/setup');page.locator('#bunny-check button[type=submit]').click();expect(page.locator('#bunny-result')).to_contain_text('BUNNY_API_KEY');expect(page.locator('#bunny-result')).to_contain_text('PENDING');passed('Bunny checker honestly reports missing private configuration')
                    page.locator('[data-review]').click();page.locator('[name="provider"]').fill('Licensed provider fixture');page.locator('[name="fundingReference"]').fill('payer-fixture');page.locator('[name="licenseReference"]').fill('license-fixture');page.locator('[name="validUntil"]').fill(time.strftime('%Y-%m-%d',time.gmtime(time.time()+7*86400)));page.locator('#music-review-form [name="confirm"]').check();page.locator('#music-review-form button[type=submit]').click();expect(page.get_by_text('Approved for provider setup',exact=True)).to_be_visible();passed('Operator review requires payer and provider references; it does not start music')
                    page.screenshot(path=str(OUT/'activation-setup-desktop.png'),full_page=True)
                    page.goto(BASE+'/music');expect(page.get_by_text('Approved for provider setup',exact=True)).to_be_visible();expect(page.get_by_text('Music playback is not connected yet.',exact=False)).to_be_visible();page.screenshot(path=str(OUT/'activation-music-desktop.png'),full_page=True)
                    page.set_viewport_size({'width':390,'height':844})
                    for route in ['/music','/setup']:
                        page.goto(BASE+route);expect(page.locator('h1')).to_be_visible();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),route+' overflows'
                    passed('Music and connection pages fit a 390px mobile viewport')
                    assert not errors,errors;passed('No uncaught browser JavaScript errors')
                except BaseException:
                    page.screenshot(path=str(OUT/'activation-failure.png'),full_page=True);raise
                finally:browser.close()
        finally:
            process.terminate()
            try:process.wait(timeout=10)
            except subprocess.TimeoutExpired:process.kill()
            (OUT/'activation-browser-report.json').write_text(json.dumps({'checks':checks,'count':len(checks),'errors':errors,'actualProviderConnected':False,'paymentsProcessed':False,'musicPlaybackImplemented':False},indent=2))
