"""Sports/readability acceptance against real disposable HTTP and browser state."""
import json
import os
from pathlib import Path
import subprocess
import time
from urllib.request import urlopen
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts' / 'blending-sports'
OUT.mkdir(parents=True, exist_ok=True)
BASE = 'http://127.0.0.1:3373'
checks, errors = [], []
report = {'checks': checks, 'errors': errors, 'method': 'Real Chromium and HTTP; no API mocks',
          'productionTested': False, 'fictionalDataOnly': True}

def passed(message):
    checks.append(message)
    print('PASS:', message, flush=True)

def accept_dialog(dialog):
    dialog.accept()

def fits(page):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')

def advance(page, action):
    page.locator(f'[data-advance="{action}"]').click()
    expect(page.locator('#notice')).to_have_text('Show state updated.')
    page.locator('#notice').evaluate('(n)=>n.textContent=""')

env = {**os.environ, 'BLENDING_OPEN_PREVIEW': 'true', 'NODE_ENV': 'test', 'PORT': '3373',
       'HOST': '127.0.0.1', 'APP_ORIGIN': BASE}
with (OUT / 'server.log').open('w') as log:
    process = subprocess.Popen(['node', '--experimental-sqlite', 'apps/server/main.mjs'],
                               cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)
    try:
        for _ in range(100):
            try:
                with urlopen(BASE + '/api/health', timeout=1) as response:
                    assert json.load(response)['openPreview']
                break
            except Exception:
                if process.poll() is not None:
                    raise RuntimeError('Disposable preview exited; see server.log')
                time.sleep(.1)
        else:
            raise RuntimeError('Preview did not start')
        with sync_playwright() as p:
            options = {'executable_path': os.environ['CHROMIUM']} if os.environ.get('CHROMIUM') else {}
            browser = p.chromium.launch(**options, headless=True, args=['--no-sandbox'])
            contexts = []
            def newpage(width=1440):
                context = browser.new_context(viewport={'width': width, 'height': 900})
                contexts.append(context)
                page = context.new_page()
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('dialog', accept_dialog)
                return page
            try:
                phone = newpage(390)
                phone.goto(BASE + '/blending/TRYBG?view=results')
                expect(phone.locator('.score-empty')).to_be_visible()
                expect(phone.locator('.hero')).not_to_be_visible()
                expect(phone.locator('.primary-tabs button')).to_have_text(['Play', 'My blend', 'Scores'])
                expect(phone.locator('.role-tabs [data-view=judge]')).to_be_visible()
                expect(phone.locator('.role-tabs [data-view=host]')).to_be_visible()
                assert phone.locator('.score-empty h2').bounding_box()['y'] < 850
                assert phone.locator('.results-table').count() == 0
                for node in phone.locator('.tabs button, .score-switch button').all():
                    box = node.bounding_box()
                    assert box['width'] >= 44 and box['height'] >= 48, box
                fits(phone)
                phone.screenshot(path=str(OUT / '01-scores-empty-phone.png'), full_page=True)
                passed('Three large primary tabs, visible role buttons, honest empty scores, no marketing hero above the scoreboard')

                phone.locator('[data-view=enter]').click()
                expect(phone.locator('#recipe-form')).to_be_visible()
                for component in ['A', 'B', 'C', 'D']:
                    phone.locator(f'[data-for="pct-{component}"][data-adjust="5"]').click(click_count=5)
                expect(phone.locator('#recipe-total')).to_have_text('100.00%')
                expect(phone.locator('#recipe-hint')).to_contain_text('ready')
                phone.locator('.trial-help summary').click()
                expect(phone.locator('#trial-recipe')).to_contain_text('A: 2.50 mL')
                phone.locator('#trial-size').select_option('20')
                expect(phone.locator('#trial-recipe')).to_contain_text('A: 5.00 mL')
                phone.locator('[data-component=A]').fill('30')
                expect(phone.locator('#recipe-hint')).to_have_text('Remove 5.00% to reach 100%.')
                expect(phone.locator('#trial-recipe')).to_contain_text('Finish your 100% recipe')
                phone.locator('[data-component=A]').fill('25')
                phone.locator('[name=teamName]').fill('Sports test crew')
                phone.locator('[name=blendName]').fill('Matchday reserve')
                phone.locator('[name=age21]').check()
                phone.locator('[data-submit=draft]').click()
                expect(phone.locator('#notice')).to_have_text('Draft saved in the shared demo.')
                phone.reload()
                expect(phone.locator('[data-component=A]')).to_have_value('25')
                phone.locator('#workspace').scroll_into_view_if_needed()
                fits(phone)
                phone.screenshot(path=str(OUT / '02-recipe-phone.png'), full_page=True)
                # Reject a navigation that would discard edits and prove the input survives.
                phone.locator('[data-component=A]').fill('30')
                phone.remove_listener('dialog', accept_dialog)
                phone.once('dialog', lambda dialog: dialog.dismiss())
                phone.locator('[data-view=results]').click()
                expect(phone.locator('[data-component=A]')).to_have_value('30')
                expect(phone.locator('body')).to_have_attribute('data-view', 'enter')
                phone.on('dialog', accept_dialog)
                passed('Explicit percent steppers, correct trial measurements, total feedback, saved draft persistence and unsaved-navigation protection')

                host = newpage()
                host.goto(BASE + '/blending/TRYBG?view=host')
                expect(host.locator('#preview-lock-scores')).to_be_visible()
                host.locator('#preview-lock-scores').click()
                expect(host.locator('#notice')).to_contain_text('Demo scorecards locked')
                for action in ['open', 'close', 'reveal']:
                    advance(host, action)
                phone.goto(BASE + '/blending/TRYBG?view=results')
                expect(phone.locator('.results-table tbody tr')).to_have_count(2)
                expect(phone.locator('.score-feature')).to_contain_text('RESULTS COMING IN')
                assert 'FLIGHT WINNER' not in phone.locator('.score-feature').inner_text()
                phone.locator('[data-score-scope=players]').click()
                expect(phone.locator('#workspace')).to_contain_text('WHISKEY DRAFT')
                expect(phone.locator('.results-table')).to_have_count(0)
                phone.locator('[data-score-scope=blends]').click()
                expect(phone.locator('.results-table tbody tr')).to_have_count(2)
                passed('Blend scores and prediction points are separate; partial results do not invent a flight winner or final ranks')

                for _ in range(2):
                    for action in ['open', 'close', 'reveal']:
                        advance(host, action)
                advance(host, 'complete')
                expect(phone.locator('.score-feature')).to_contain_text('FLIGHT WINNER', timeout=15000)
                expect(phone.locator('.results-table tbody tr')).to_have_count(6)
                expect(phone.locator('.qualifier')).to_have_count(1)
                phone.evaluate('window.scrollTo(0,0)')
                fits(phone)
                phone.screenshot(path=str(OUT / '03-final-scoreboard-phone.png'), full_page=True)
                desktop = newpage()
                desktop.goto(BASE + '/blending/TRYBG?view=results')
                expect(desktop.locator('.score-feature')).to_contain_text('The Oak Room')
                expect(desktop.locator('.score-number strong')).to_have_text('96.00')
                desktop.screenshot(path=str(OUT / '04-final-scoreboard-desktop.png'), full_page=True)
                passed('Completed scoreboards display the real published winner, panel score and earned qualification badge')

                for width in [320, 640, 1280]:
                    desktop.set_viewport_size({'width': width, 'height': 900})
                    fits(desktop)
                    for selector in ['.score-feature h2', '.results-table td', '.tabs button']:
                        assert desktop.locator(selector).first.is_visible()
                desktop.keyboard.press('Tab')
                assert desktop.evaluate('document.activeElement !== document.body')
                assert not errors, errors
                passed('Scoreboard reflows at 320, 640 and 1280 pixels; keyboard controls work; no uncaught page errors')
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
