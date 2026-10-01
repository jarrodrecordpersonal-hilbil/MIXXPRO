"""No-login build preview: real Chromium/HTTP, no mocked APIs or admin cookies."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
from urllib.request import urlopen
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts' / 'blending-open-preview'
OUT.mkdir(parents=True, exist_ok=True)
BASE = 'http://127.0.0.1:3369'
checks, errors = [], []
report = {'checks':checks, 'errors':errors, 'method':'Real browser and HTTP; no API mocks and no login cookies',
          'productionTested':False, 'fictionalDataOnly':True}

def passed(text):
    checks.append(text)
    print('PASS:', text, flush=True)

def fits(page):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'Horizontal overflow'

with tempfile.TemporaryDirectory(prefix='blending-open-browser-') as tmp:
    sentinel = Path(tmp) / 'do-not-open.sqlite'
    sentinel.write_text('Existing data must not be opened or modified by preview mode.')
    env = {**os.environ, 'BLENDING_OPEN_PREVIEW':'true', 'NODE_ENV':'test', 'PORT':'3369',
           'HOST':'127.0.0.1', 'APP_ORIGIN':BASE, 'DB_PATH':str(sentinel)}
    with (OUT / 'server.log').open('w') as log:
        process = subprocess.Popen(['node','--experimental-sqlite','apps/server/main.mjs'], cwd=ROOT,
                                   env=env, stdout=log, stderr=subprocess.STDOUT)
        try:
            for _ in range(100):
                try:
                    with urlopen(BASE + '/api/health', timeout=1) as response:
                        assert json.load(response)['openPreview']
                    break
                except Exception:
                    if process.poll() is not None:
                        raise RuntimeError('Preview server exited. See server.log.')
                    time.sleep(.1)
            else:
                raise RuntimeError('Preview server did not start.')
            with sync_playwright() as pw:
                options = {'executable_path':os.environ['CHROMIUM']} if os.environ.get('CHROMIUM') else {}
                browser = pw.chromium.launch(**options, headless=True, args=['--no-sandbox'])
                contexts = []
                def newpage(width=1440):
                    context = browser.new_context(viewport={'width':width,'height':900})
                    contexts.append(context)
                    page = context.new_page()
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.on('dialog', lambda dialog: dialog.accept())
                    page.add_init_script("window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective));")
                    return page
                try:
                    page = newpage()
                    page.goto(BASE)
                    expect(page).to_have_url(BASE + '/blending/TRYBG')
                    expect(page.locator('#test-ribbon')).to_contain_text('OPEN BUILD PREVIEW')
                    expect(page.locator('#host-tab')).to_be_visible()
                    expect(page.locator('#account-button')).to_have_text('Reset demo')
                    expect(page.locator('#auth-form')).to_have_count(0)
                    fits(page)
                    page.screenshot(path=str(OUT / '01-open-preview.png'), full_page=True)
                    passed('Preview starts populated at the root; judge/producer buttons are visible without signing in')

                    page.locator('.tabs [data-view=judge]').click()
                    expect(page.locator('#preview-judge')).to_be_visible()
                    expect(page.locator('.scorecard')).to_have_count(6)
                    form = page.locator('.scorecard').first
                    form.locator('[name=aroma]').fill('24')
                    form.locator('[name=notes]').fill('Example build-session note')
                    form.get_by_role('button', name='Lock final scorecard').click()
                    expect(page.locator('.scorecard.locked')).to_have_count(1)
                    page.locator('#preview-judge').select_option('2')
                    expect(page.locator('#notice')).to_have_text('Switched demo judge.')
                    expect(page.locator('.scorecard.locked')).to_have_count(0)
                    expect(page.locator('#workspace')).to_contain_text('Demo Judge 2')
                    page.locator('#workspace').scroll_into_view_if_needed()
                    page.screenshot(path=str(OUT / '02-judge-open.png'), full_page=True)
                    passed('Anonymous visitor edits and locks a scorecard and switches to another independent demo judge')

                    producer = newpage()
                    producer.goto(BASE + '/blending/TRYBG?view=host')
                    expect(producer.locator('#auth-form')).to_have_count(0)
                    expect(producer.locator('#preview-lock-scores')).to_be_visible()
                    producer.locator('#preview-lock-scores').click()
                    expect(producer.locator('#notice')).to_contain_text('Demo scorecards locked')
                    producer.locator('[data-advance=open]').click()
                    expect(producer.locator('#notice')).to_have_text('Show state updated.')
                    producer.locator('#workspace').scroll_into_view_if_needed()
                    producer.screenshot(path=str(OUT / '03-producer-open.png'), full_page=True)

                    player = newpage(390)
                    player.goto(BASE + '/games/BGDEMO')
                    expect(player.locator('#open-preview-banner')).to_be_visible()
                    expect(player.locator('#account-panel')).not_to_be_visible()
                    player.locator('#guest-name').fill('Example Viewer')
                    player.locator('#join-form button').click()
                    expect(player.locator('#player-name')).to_have_text('Example Viewer')
                    player.locator('[data-kind=bracket]').first.click()
                    expect(player.locator('[data-kind=bracket][aria-pressed=true]')).to_have_count(1)
                    player.reload()
                    expect(player.locator('#player-name')).to_have_text('Example Viewer')
                    expect(player.locator('[data-kind=bracket][aria-pressed=true]')).to_have_count(1)
                    for action in ['close','reveal']:
                        producer.locator(f'[data-advance={action}]').click()
                        expect(producer.locator('#notice')).to_have_text('Show state updated.')
                        producer.locator('#notice').evaluate('(n)=>n.textContent=""')
                    expect(player.locator('#status')).to_have_text('Results are in.', timeout=15000)
                    fits(player)
                    passed('No-login producer runs a real reveal; guest prediction identity and picks survive refresh')

                    captain = newpage(390)
                    captain.goto(BASE + '/blending/TRYBG?view=enter')
                    expect(captain.locator('#recipe-form')).to_be_visible()
                    expect(captain.locator('#auth-form')).to_have_count(0)
                    expect(captain.locator('#workspace')).to_contain_text('SHARED TEST RECIPE')
                    captain.locator('#recipe-form [name=teamName]').fill('New demo crew')
                    captain.locator('#recipe-form [name=blendName]').fill('Example new blend')
                    for field in captain.locator('#recipe-form [data-component]').all():
                        field.fill('25')
                    captain.locator('#recipe-form [name=age21]').check()
                    captain.get_by_role('button', name='Create & save draft').click()
                    expect(captain.locator('#notice')).to_have_text('Draft saved in the shared demo.')
                    captain.locator('#recipe-form').get_by_role('button', name='Submit & lock recipe').click()
                    expect(captain.locator('#notice')).to_contain_text('Recipe submitted and locked')
                    expect(captain.locator('.saved-entry .badge').first).to_have_text('submitted')
                    expect(captain.locator('.saved-entry').first).to_contain_text('Next judging flight')
                    fits(captain)
                    captain.screenshot(path=str(OUT / '04-entry-open-phone.png'), full_page=True)
                    passed('New example team enters during a reveal without an account and is routed to the next batch')

                    producer.locator('#account-button').click()
                    expect(producer.locator('#notice')).to_contain_text('Shared demo reset')
                    page.reload()
                    expect(page.locator('.scorecard:not(.locked)')).to_have_count(6)
                    captain.reload()
                    expect(captain.locator('.saved-entry')).to_have_count(0)
                    assert sentinel.read_text() == 'Existing data must not be opened or modified by preview mode.'
                    for context in contexts:
                        assert not any(c['name'] == 'mixx_session' for c in context.cookies()), 'Admin session cookie exposed'
                        for active_page in context.pages:
                            assert not active_page.evaluate('window.__csp || []'), 'CSP violation'
                    assert not errors, errors
                    passed('Reset clears only shared demo actions; original DB untouched, no admin cookie, page errors or CSP violations')
                    report['passed'] = True
                finally:
                    for context in contexts:
                        context.close()
                    browser.close()
        except Exception as error:
            report['passed'] = False
            report['failure'] = str(error)
            raise
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
            (OUT / 'report.json').write_text(json.dumps(report, indent=2))
