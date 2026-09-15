"""Native CI/browser acceptance: no fetch bridge and no storage substitutes.
Creates its own loopback-only DEMO_MODE server and disposable database/profile.
Never point this test at a live venue or provider account.
"""
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import time
import urllib.request
import uuid
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts'
OUT.mkdir(exist_ok=True)
BASE = 'http://127.0.0.1:3361'
checks, errors = [], []

def passed(label):
    checks.append(label)
    print('PASS:', label, flush=True)

def nav(page, name):
    target = page.locator(f'nav [data-page="{name}"]')
    if not target.is_visible():
        page.locator('[data-action="menu"]').click()
    target.click()
    expect(target).to_have_attribute('aria-current', 'page')

def wait(page, expression, timeout=30000):
    """Poll via DevTools evaluation; do not weaken the app's no-unsafe-eval CSP."""
    deadline = time.monotonic() + timeout / 1000
    while time.monotonic() < deadline:
        if page.evaluate(expression):
            return
        page.wait_for_timeout(100)
    raise AssertionError('Timed out waiting for browser condition: ' + expression)

def records(page, store):
    return page.evaluate("async store => {const {all} = await import('/player/offline.mjs'); return (await all(store)).length;}", store)

report = {'checks': checks, 'errors': errors,
          'method': 'Real Chromium navigation/HTTP, native IndexedDB and service-worker caching, browser offline emulation, persistent-profile restart. Isolated demo media only.',
          'liveProvidersTested': False, 'physicalTvTested': False}
with tempfile.TemporaryDirectory(prefix='mixxpro-native-') as temp:
    directory = Path(temp)
    database = directory / 'qa.sqlite'
    profile = directory / 'player-profile'
    environment = {**os.environ, 'NODE_ENV': 'test', 'DEMO_MODE': 'true',
        'SIGNUPS_ENABLED': 'true', 'PORT': '3361', 'HOST': '127.0.0.1',
        'APP_ORIGIN': BASE, 'APP_SECRET': 'native-ci-only-not-a-live-secret-2026',
        'DB_PATH': str(database), 'COMMISSION_BPS': '0'}
    # This fixture must never inherit a provider account or retail destination.
    for key in list(environment):
        if key.startswith(('BUNNY_', 'R2_', 'STRIPE_', 'COMMERCE_')):
            environment.pop(key)
    with (OUT / 'native-server.log').open('w') as log:
        process = subprocess.Popen(['node', '--experimental-sqlite', 'apps/server/main.mjs'],
            cwd=ROOT, env=environment, stdout=log, stderr=subprocess.STDOUT)
        try:
            for attempt in range(60):
                try:
                    with urllib.request.urlopen(BASE + '/api/config', timeout=1) as response:
                        assert json.load(response)['demo'] is True
                    break
                except (OSError, ValueError):
                    if process.poll() is not None:
                        raise RuntimeError('Isolated test server exited; see native-server.log')
                    time.sleep(.2)
            else:
                raise RuntimeError('Isolated test server did not start')
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
                owner = browser.new_context(viewport={'width': 1440, 'height': 1120})
                page = owner.new_page()
                page.on('pageerror', lambda error: errors.append(str(error)))
                player_context = None
                player = None
                try:
                    page.goto(BASE)
                    page.locator('input[name="name"]').fill('Jordan')
                    page.locator('input[name="venueName"]').fill('Oak & Ember QA')
                    page.locator('input[name="email"]').fill('native-' + uuid.uuid4().hex[:10] + '@example.test')
                    page.locator('input[name="password"]').fill('native-browser-test-password-2026')
                    page.locator('[data-form="auth"] button[type=submit]').click()
                    expect(page.get_by_role('heading', name='Make yourself at home, Jordan.')).to_be_visible()
                    session = owner.request.get(BASE + '/api/session').json()
                    venue_id = session['venues'][0]['id']
                    headers = {'X-Venue-Id': venue_id, 'X-CSRF-Token': session['csrf']}
                    passed('Browser signup creates a real server session and venue')
                    # Operator fixture setup in this disposable DB only, not a public promotion API.
                    with sqlite3.connect(database) as connection:
                        connection.execute("UPDATE users SET platform_role='admin' WHERE id=?", (session['user']['id'],))
                    response = owner.request.post(BASE + '/api/admin/demo-content', headers=headers, data={})
                    assert response.status == 201, response.text()

                    nav(page, 'mixx')
                    page.locator('[data-mode="blend"]').click()
                    page.locator('[data-action="world"][data-id="bourbon"]').click()
                    page.locator('[data-action="world"][data-id="travel"]').click()
                    page.locator('[data-action="weight"][data-world="golf"][data-weight="more"]').click()
                    with page.expect_response(lambda r: r.url.endswith('/api/venue') and r.request.method == 'PATCH'):
                        page.locator('[data-action="save-mix"]').click()
                    saved = owner.request.get(BASE + '/api/venue', headers=headers).json()
                    assert saved['venue']['mix']['worlds'] == {'golf': 'more', 'bourbon': 'normal', 'travel': 'normal'}
                    nav(page, 'themes')
                    page.locator('[data-action="theme"][data-id="speakeasy"]').click()
                    with page.expect_response(lambda r: r.url.endswith('/api/venue') and r.request.method == 'PATCH'):
                        page.locator('[data-action="save-theme"]').click()
                    saved = owner.request.get(BASE + '/api/venue', headers=headers).json()
                    assert saved['venue']['theme'] == 'speakeasy'
                    passed('Weighted My Mix and independent theme persist through real browser requests')

                    player_context = p.chromium.launch_persistent_context(str(profile), headless=True,
                        viewport={'width': 1440, 'height': 900}, args=['--no-sandbox'])
                    player = player_context.pages[0]
                    player.on('pageerror', lambda error: errors.append(str(error)))
                    player.goto(BASE + '/player/')
                    wait(player, "/^\\d{6}$/.test(document.getElementById('pair-code').textContent)")
                    code = player.locator('#pair-code').inner_text()
                    nav(page, 'tvs')
                    page.locator('[data-action="pair"]').first.click()
                    page.locator('dialog input[name="code"]').fill(code)
                    page.locator('dialog input[name="name"]').fill('Main Bar')
                    page.locator('dialog input[name="group"]').fill('Bar TVs')
                    with page.expect_response(lambda r: r.url.endswith('/api/tvs/claim')):
                        page.locator('dialog button[type=submit]').click()
                    expect(page.locator('#dialog')).not_to_be_visible()
                    wait(player, "document.getElementById('video').currentTime>.2&&!document.getElementById('video').paused", timeout=25000)
                    wait(player, "async()=>{const {all}=await import('/player/offline.mjs');return (await all('media')).some(m=>m.blob instanceof Blob&&m.blob.size>0);}", timeout=20000)
                    player.evaluate('navigator.serviceWorker.ready')
                    wait(player, 'navigator.serviceWorker.controller !== null')
                    passed('Six-digit UI pairing starts actual MP4 playback and native IndexedDB Blob caching')

                    page.locator('[data-action="tv-remote"]').first.click()
                    page.locator('[data-action="quick-command"][data-kind="pause"]').click()
                    wait(player, "document.getElementById('video').paused", timeout=12000)
                    expect(player.locator('#overlay-title')).to_have_text('Paused from your venue remote.')
                    page.locator('[data-action="tv-remote"]').first.click()
                    page.locator('[data-action="quick-command"][data-kind="play"]').click()
                    wait(player, "!document.getElementById('video').paused", timeout=12000)
                    passed('Cloud pause and play control the native video element')
                    player.screenshot(path=str(OUT / 'native-player.png'))
                    credential = player.evaluate("async()=>{const {get}=await import('/player/offline.mjs');return (await get('kv','credential')).value;}")
                    assert credential
                    player_context.set_offline(True)
                    player.wait_for_timeout(12500)
                    assert player.locator('#video').evaluate('(v)=>!v.paused&&v.readyState>=2')
                    queued = records(player, 'events')
                    assert queued > 0
                    passed('Downloaded media continues offline and telemetry persists in real IndexedDB')
                    player_context.close()
                    player_context = p.chromium.launch_persistent_context(str(profile), headless=True,
                        viewport={'width': 1440, 'height': 900}, offline=True, args=['--no-sandbox'])
                    player = player_context.pages[0]
                    player.on('pageerror', lambda error: errors.append(str(error)))
                    player.goto(BASE + '/player/', wait_until='domcontentloaded')
                    wait(player, "document.getElementById('video').currentTime>.2&&!document.getElementById('video').paused", timeout=20000)
                    restored = player.evaluate("async()=>{const {get}=await import('/player/offline.mjs');return (await get('kv','credential')).value;}")
                    assert restored == credential
                    assert records(player, 'media') > 0
                    assert records(player, 'events') >= queued
                    passed('A persistent browser profile restarts offline with its pairing, cached media and outbox intact')
                    player_context.set_offline(False)
                    wait(player, "async()=>{const {all}=await import('/player/offline.mjs');return (await all('events')).length===0;}", timeout=20000)
                    saved = owner.request.get(BASE + '/api/venue', headers=headers).json()
                    assert saved['metrics']['seconds'] > 0
                    assert saved['metrics']['dwell'] is None
                    passed('Reconnection drains the outbox into device-reported playback analytics, not human dwell')

                    nav(page, 'home')
                    page.screenshot(path=str(OUT / 'native-home-desktop.png'), full_page=True)
                    page.set_viewport_size({'width': 390, 'height': 844})
                    for view in ['home', 'mixx', 'themes', 'tvs', 'schedule', 'commerce', 'revenue', 'billing']:
                        nav(page, view)
                        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), view + ' overflows'
                        if view == 'mixx':
                            page.screenshot(path=str(OUT / 'native-mixx-mobile.png'), full_page=True)
                    passed('Eight real venue pages have no horizontal overflow at 390px')

                    player_context.set_offline(True)
                    # Exercise the existing lease-expiry guard using a disposable fixture lease.
                    player.evaluate("async()=>{const {get,put}=await import('/player/offline.mjs');const saved=await get('kv','manifest');saved.value.expiresAt=Date.now()-60000;await put('kv',saved);}")
                    player.reload(wait_until='domcontentloaded')
                    expect(player.locator('#overlay-title')).to_have_text('Reconnect to refresh your MIXX.', timeout=12000)
                    assert player.locator('#video').evaluate('(v)=>v.paused')
                    passed('An expired persisted playback lease stops offline video after reload')
                    assert not errors, errors
                    passed('No uncaught JavaScript errors during the native acceptance flow')
                    report['passed'] = True
                except BaseException as error:
                    report['passed'] = False
                    report['failure'] = str(error)
                    try:
                        page.screenshot(path=str(OUT / 'native-owner-failure.png'), full_page=True)
                        if player:
                            player.screenshot(path=str(OUT / 'native-player-failure.png'), full_page=True)
                    except Exception:
                        pass
                    raise
                finally:
                    if player_context:
                        player_context.close()
                    browser.close()
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
            report['count'] = len(checks)
            (OUT / 'native-browser-report.json').write_text(json.dumps(report, indent=2))
