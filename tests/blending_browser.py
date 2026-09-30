"""Real browser/HTTP acceptance for the disposable at-home blending pilot.
No fetch mocks, no production provider accounts, no shared database.
"""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts' / 'blending'
OUT.mkdir(parents=True, exist_ok=True)
checks, errors = [], []

def passed(message):
    checks.append(message)
    print('PASS:', message, flush=True)

def fit(page):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'Horizontal page overflow'

def login(page, info, person, view):
    page.goto(info['base'] + '/blending/' + info['code'] + '?view=' + view)
    page.locator('#auth-form input[name=email]').fill(person['email'])
    page.locator('#auth-form input[name=password]').fill(person['password'])
    page.locator('#auth-form button[type=submit]').click()
    expect(page.locator('#auth-form')).to_have_count(0)

def operation(page, batch_id, action):
    page.locator(f'[data-batch="{batch_id}"][data-advance="{action}"]').click()
    expect(page.locator('#notice')).to_have_text('Show state updated.')
    assert 'error' not in (page.locator('#notice').get_attribute('class') or '')
    page.locator('#notice').evaluate('(n)=>n.textContent=""')

def player(page, info, name):
    page.goto(info['base'] + '/games/' + info['eventCode'])
    page.locator('#guest-name').fill(name)
    page.locator('#join-form button').click()
    expect(page.locator('#player-name')).to_have_text(name)

report = {'checks': checks, 'errors': errors,
          'method': 'Real Chromium, independent contexts, actual loopback HTTP; no network mocks.',
          'physicalTVTested': False, 'productionTested': False, 'fictionalDataOnly': True}
with tempfile.TemporaryDirectory(prefix='blending-browser-') as temp:
    directory = Path(temp)
    infofile = directory / 'info.json'
    environment = {**os.environ, 'NODE_ENV': 'test', 'PORT': '3364',
                   'DB_PATH': str(directory / 'pilot.sqlite'), 'BG_FIXTURE_INFO': str(infofile)}
    for key in list(environment):
        if key.startswith(('BUNNY_', 'R2_', 'STRIPE_', 'COMMERCE_')):
            environment.pop(key)
    with (OUT / 'server.log').open('w') as log:
        process = subprocess.Popen(['node', '--experimental-sqlite', 'tests/blending-demo-server.mjs'],
                                   cwd=ROOT, env=environment, stdout=log, stderr=subprocess.STDOUT)
        try:
            for _ in range(100):
                if infofile.exists():
                    info = json.loads(infofile.read_text())
                    break
                if process.poll() is not None:
                    raise RuntimeError('Disposable fixture exited; see server.log')
                time.sleep(.1)
            else:
                raise RuntimeError('Disposable fixture did not start')
            with sync_playwright() as p:
                options = {'executable_path': os.environ['CHROMIUM']} if os.environ.get('CHROMIUM') else {}
                browser = p.chromium.launch(**options, headless=True, args=['--no-sandbox'])
                contexts = []
                def newpage(width=1440):
                    context = browser.new_context(viewport={'width': width, 'height': 1050 if width > 500 else 844})
                    contexts.append(context)
                    page = context.new_page()
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.on('dialog', lambda dialog: dialog.accept())
                    page.add_init_script("window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective));")
                    return page
                try:
                    public = newpage()
                    public.goto(info['base'] + '/blending/' + info['code'])
                    expect(public.locator('#test-ribbon')).to_be_visible()
                    expect(public.locator('#play-event')).to_be_visible()
                    fit(public)
                    public.screenshot(path=str(OUT / '01-home-desktop.png'), full_page=True)
                    phone = newpage(390)
                    phone.goto(info['base'] + '/blending/' + info['code'])
                    expect(phone.locator('#play-event')).to_be_visible()
                    fit(phone)
                    phone.screenshot(path=str(OUT / '02-home-phone.png'), full_page=True)
                    passed('Desktop and 390px entry pages offer both ways to join with a visible fictional-test label')

                    judge = newpage()
                    login(judge, info, info['judges'][0], 'judge')
                    card = judge.locator('.scorecard:not(.locked)').filter(has=judge.get_by_role('heading', name=info['missingCard']['sample'], exact=True))
                    expect(card).to_have_count(1)
                    for key in ['aroma', 'palate', 'balance', 'finish']:
                        card.locator(f'input[name={key}]').fill(str(info['missingCard']['score']))
                    card.locator('[name=notes]').fill('PRIVATE_BROWSER_NOTE')
                    card.get_by_role('button', name='Lock final scorecard').click()
                    expect(judge.locator('.scorecard:not(.locked)')).to_have_count(0)
                    assert 'The Oak Room' not in judge.locator('#workspace').inner_text()
                    judge.locator('#workspace').scroll_into_view_if_needed()
                    judge.screenshot(path=str(OUT / '03-judge-desk.png'), full_page=True)
                    passed('Independent assigned judge locks the missing card; no team identities or other judge cards appear')

                    host = newpage()
                    login(host, info, info['producer'], 'host')
                    operation(host, info['first'], 'open')
                    host.locator('#workspace').scroll_into_view_if_needed()
                    host.screenshot(path=str(OUT / '04-producer-desk.png'), full_page=True)
                    early = newpage(390)
                    player(early, info, 'Early Viewer')
                    pick = early.locator('[data-pick][data-kind=bracket]').first
                    expect(pick).to_be_enabled()
                    first_match = pick.get_attribute('data-matchup')
                    pick.click()
                    expect(early.locator('[data-pick][data-kind=bracket][aria-pressed=true]')).to_have_count(1)
                    operation(host, info['first'], 'close')
                    operation(host, info['first'], 'reveal')
                    late = newpage(390)
                    player(late, info, 'Halfway Newcomer')
                    expect(late.locator('#status')).to_have_text('Results are in.')
                    expect(late.locator('[data-pick]').first).to_be_disabled()
                    operation(host, info['first'], 'open')
                    expect(late.locator('[data-pick][data-kind=bracket]').first).to_be_enabled(timeout=15000)
                    pick = late.locator('[data-pick][data-kind=bracket]').first
                    assert pick.get_attribute('data-matchup') != first_match
                    pick.click()
                    expect(late.locator('[data-pick][data-kind=bracket][aria-pressed=true]')).to_have_count(1)
                    saved = late.locator('[data-pick][data-kind=bracket][aria-pressed=true]').get_attribute('data-entry')
                    late.reload()
                    expect(late.locator('#player-name')).to_have_text('Halfway Newcomer')
                    expect(late.locator(f'[data-entry="{saved}"][data-kind=bracket]')).to_have_attribute('aria-pressed', 'true')
                    fit(late)
                    late.screenshot(path=str(OUT / '05-join-mid-show-phone.png'), full_page=True)
                    passed('A new viewer joins during a reveal, plays the next open round, and retains their identity and pick after refresh')

                    team = newpage(390)
                    team.goto(info['base'] + '/blending/' + info['code'] + '?view=enter')
                    team.locator('#auth-switch').click()
                    team.locator('#auth-form [name=name]').fill('New Captain')
                    team.locator('#auth-form [name=email]').fill('new-captain@example.test')
                    team.locator('#auth-form [name=password]').fill('Blending-Browser-New-Team-2026!')
                    team.locator('#auth-form button[type=submit]').click()
                    form = team.locator('#recipe-form')
                    expect(form).to_be_visible()
                    teamname = '<img src=x onerror=alert(1)>'
                    form.locator('[name=teamName]').fill(teamname)
                    form.locator('[name=blendName]').fill('Mid-show Reserve')
                    for field in form.locator('[data-component]').all():
                        field.fill('25')
                    form.locator('[name=age21]').check()
                    form.get_by_role('button', name='Create & save draft').click()
                    expect(form.get_by_role('button', name='Save draft', exact=True)).to_be_visible()
                    form.locator('[data-component=A]').fill('40')
                    form.locator('[data-component=B]').fill('40')
                    form.get_by_role('button', name='Save draft', exact=True).click()
                    expect(team.locator('#notice')).to_contain_text('100%')
                    expect(form.locator('[data-component=A]')).to_have_value('40')
                    form.locator('[data-component=A]').fill('30')
                    form.locator('[data-component=B]').fill('20')
                    form.get_by_role('button', name='Save draft', exact=True).click()
                    expect(team.locator('#notice')).to_have_text('Draft saved to your account.')
                    team.reload()
                    expect(team.locator('#recipe-form [data-component=A]')).to_have_value('30')
                    expect(team.locator('#recipe-form [data-component=B]')).to_have_value('20')
                    expect(team.locator('#intake-name')).to_contain_text('Next')
                    team.locator('#workspace').scroll_into_view_if_needed()
                    fit(team)
                    team.screenshot(path=str(OUT / '06-saved-recipe-phone.png'), full_page=True)
                    team.locator('#recipe-form').get_by_role('button', name='Submit & lock recipe').click()
                    expect(team.locator('#notice')).to_contain_text('Recipe submitted and locked')
                    expect(team.locator('.saved-entry .badge').first).to_have_text('submitted')
                    assert not team.locator('#workspace img').count(), 'Team name became active HTML'
                    passed('A new captain registers during play, saves a recipe, retains edits after validation failure and refresh, and submits into the next batch')

                    operation(host, info['first'], 'close')
                    operation(host, info['first'], 'reveal')
                    public.locator('[data-view=results]').click()
                    expect(public.locator('.results-table tbody tr')).to_have_count(4, timeout=15000)
                    assert 'PRIVATE_BROWSER_NOTE' not in public.locator('body').inner_text()
                    public.locator('#workspace').scroll_into_view_if_needed()
                    public.screenshot(path=str(OUT / '07-separate-results.png'), full_page=True)
                    passed('Public reveal shows official blend results separately from fresh-round and whole-show prediction scores, without private notes')
                    for context in contexts:
                        for page in context.pages:
                            assert not page.evaluate('window.__csp || []'), 'Content Security Policy violation'
                    assert not errors, errors
                    passed('No page JavaScript errors, CSP violations or tested viewport overflow')
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
