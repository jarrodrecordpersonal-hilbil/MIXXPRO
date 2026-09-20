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
from screen_browser_checks import screen_checks

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts'
OUT.mkdir(exist_ok=True)
BASE = 'http://127.0.0.1:3361'
checks, errors = [], []

def passed(label):
    checks.append(label)
    print('PASS:', label, flush=True)

def nav(page, name):
    target = page.locator(f'[data-page="{name}"]').first
    if not target.is_visible():
        menu = page.locator('[data-action="menu"]')
        if menu.is_visible():
            menu.click()
    if not target.is_visible():
        settings = target.locator('xpath=ancestor::details[@data-stream-settings]')
        if settings.count() and not settings.evaluate('(el)=>el.open'):
            settings.locator('summary').click()
    expect(target).to_be_visible()
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
                player2_context = None
                player2 = None
                try:
                    page.goto(BASE)
                    page.locator('input[name="name"]').fill('Jordan')
                    page.locator('input[name="venueName"]').fill('Oak & Ember QA')
                    page.locator('input[name="email"]').fill('native-' + uuid.uuid4().hex[:10] + '@example.test')
                    page.locator('input[name="password"]').fill('native-browser-test-password-2026')
                    page.locator('[data-form="auth"] button[type=submit]').click()
                    expect(page.get_by_role('heading', name='Home.')).to_be_visible()
                    for primary in ['home','mixx','tvs','revenue']:
                        expect(page.locator(f'[data-page="{primary}"]').first).to_be_visible()
                    assert page.locator('[data-stream-settings]').count() == 1
                    passed('Streamlined venue shell exposes Home, MIXX, TV, Results with secondary Settings')
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
                    page.locator('[data-stream-settings] summary').click()
                    nav(page, 'themes')
                    page.locator('[data-action="theme"][data-id="speakeasy"]').click()
                    with page.expect_response(lambda r: r.url.endswith('/api/venue') and r.request.method == 'PATCH'):
                        page.locator('[data-action="save-theme"]').click()
                    saved = owner.request.get(BASE + '/api/venue', headers=headers).json()
                    assert saved['venue']['theme'] == 'speakeasy'
                    passed('Weighted My Mix and independent theme persist through real browser requests')

                    player_context = p.chromium.launch_persistent_context(str(profile), headless=True,
                        viewport={'width': 1440, 'height': 900}, args=['--no-sandbox','--autoplay-policy=user-gesture-required'])
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
                    assert player.locator('.player-sound').count() == 0
                    expect(player.locator('#sound-activate')).to_be_hidden()
                    passed('Normal playback has no persistent sound-control strip')

                    # Pair a second real player so remote targeting can prove isolation and group/all behavior.
                    profile2 = directory / 'player-profile-2'
                    player2_context = p.chromium.launch_persistent_context(str(profile2), headless=True,
                        viewport={'width': 1280, 'height': 800}, args=['--no-sandbox','--autoplay-policy=user-gesture-required'])
                    player2 = player2_context.pages[0]
                    player2.on('pageerror', lambda error: errors.append(str(error)))
                    player2.goto(BASE + '/player/')
                    wait(player2, "/^\\d{6}$/.test(document.getElementById('pair-code').textContent)")
                    code2 = player2.locator('#pair-code').inner_text()
                    page.locator('[data-action="pair"]').first.click()
                    page.locator('dialog input[name="code"]').fill(code2)
                    page.locator('dialog input[name="name"]').fill('Patio')
                    page.locator('dialog input[name="group"]').fill('Bar TVs')
                    with page.expect_response(lambda r: r.url.endswith('/api/tvs/claim')):
                        page.locator('dialog button[type=submit]').click()
                    wait(player2, "document.getElementById('video').currentTime>.2&&!document.getElementById('video').paused", timeout=25000)

                    # Selected TV remote: volume changes the actual HTMLMediaElement and does not touch the other TV.
                    page.locator('[data-action="tv-remote"]').filter(has=page.locator('xpath=..')).first if False else None
                    cards = page.locator('.tv-card')
                    main_card = cards.filter(has_text='Main Bar')
                    main_card.locator('[data-action="tv-remote"]').click()
                    dialog = page.locator('#dialog')
                    dialog.locator('[data-player-volume]').fill('35')
                    dialog.locator('[data-action="audio-volume"]').click()
                    wait(player, "Math.abs(document.getElementById('video').volume-.35)<.001", timeout=12000)
                    expect(dialog.locator('[data-audio-status]')).to_contain_text('Applied')
                    assert abs(player2.locator('#video').evaluate('(v)=>v.volume') - .7) < .001
                    page.screenshot(path=str(OUT / 'native-remote-audio-desktop.png'), full_page=True)
                    passed('Selected-TV Player Volume changes actual video.volume without changing another TV')

                    dialog.locator('[data-action="audio-mute"][data-muted="true"]').click()
                    wait(player, "document.getElementById('video').muted", timeout=12000)
                    expect(dialog.locator('[data-audio-status]')).to_contain_text('Applied')
                    dialog.locator('[data-action="audio-mute"][data-muted="false"]').click()
                    # A browser may require local activation before allowing audible autoplay.
                    wait(player, "document.getElementById('sound-activate').classList.contains('hidden')===false || document.getElementById('video').muted===false", timeout=12000)
                    if player.locator('#sound-activate').is_visible():
                        expect(dialog.locator('[data-audio-status]')).to_contain_text('Blocked')
                        player.locator('#sound-activate').click()
                        wait(player, "!document.getElementById('video').muted&&!document.getElementById('video').paused", timeout=12000)
                        main_card.locator('[data-action="tv-remote"]').click()
                        dialog = page.locator('#dialog')
                        dialog.locator('[data-action="audio-mute"][data-muted="false"]').click()
                    wait(player, "!document.getElementById('video').muted", timeout=12000)
                    expect(dialog.locator('[data-audio-status]')).to_contain_text('Applied')
                    assert abs(player.locator('#video').evaluate('(v)=>v.volume') - .35) < .001
                    passed('Mute/unmute changes actual video.muted and preserves Player Volume, with truthful browser-blocked status')

                    # Group selection targets both authorized Bar TVs.
                    page.locator('#dialog').get_by_label('Close dialog').click()
                    page.get_by_role('button', name='Bar TVs').click()
                    audio = page.locator('.player-audio-remote').first
                    audio.locator('[data-player-volume]').fill('55')
                    audio.locator('[data-action="audio-volume"]').click()
                    wait(player, "Math.abs(document.getElementById('video').volume-.55)<.001", timeout=12000)
                    wait(player2, "Math.abs(document.getElementById('video').volume-.55)<.001", timeout=12000)
                    expect(audio.locator('[data-audio-status]')).to_contain_text('Applied')
                    passed('Group Player Volume affects both authorized group members')

                    # Individual Patio change must not restore/change Main Bar.
                    page.locator('.tv-card').filter(has_text='Patio').locator('[data-action="tv-remote"]').click()
                    dialog = page.locator('#dialog')
                    dialog.locator('[data-player-volume]').fill('80')
                    dialog.locator('[data-action="audio-volume"]').click()
                    wait(player2, "Math.abs(document.getElementById('video').volume-.8)<.001", timeout=12000)
                    assert abs(player.locator('#video').evaluate('(v)=>v.volume') - .55) < .001
                    page.locator('#dialog').get_by_label('Close dialog').click()

                    # All-TV scope mutes both; volume survives track changes.
                    page.locator('#all-tvs').check()
                    audio = page.locator('.player-audio-remote').first
                    audio.locator('[data-action="audio-mute"][data-muted="true"]').click()
                    wait(player, "document.getElementById('video').muted", timeout=12000)
                    wait(player2, "document.getElementById('video').muted", timeout=12000)
                    page.locator('.tv-card').filter(has_text='Main Bar').locator('[data-action="tv-remote"]').click()
                    page.locator('#dialog [data-action="quick-command"][data-kind="next"]').click()
                    player.wait_for_timeout(1500)
                    assert abs(player.locator('#video').evaluate('(v)=>v.volume') - .55) < .001
                    assert player.locator('#video').evaluate('(v)=>v.muted')
                    passed('All-TV mute applies to authorized TVs and audio settings survive track changes')

                    page.locator('[data-action="tv-remote"]').first.click()
                    page.locator('[data-action="quick-command"][data-kind="pause"]').click()
                    wait(player, "document.getElementById('video').paused", timeout=12000)
                    expect(player.locator('#overlay-title')).to_have_text('Paused from your venue remote.')
                    page.locator('[data-action="tv-remote"]').first.click()
                    page.locator('[data-action="quick-command"][data-kind="play"]').click()
                    wait(player, "!document.getElementById('video').paused", timeout=12000)
                    passed('Cloud pause and play control the native video element')
                    player.screenshot(path=str(OUT / 'native-player.png'))
                    player.screenshot(path=str(OUT / 'native-player-audio.png'))
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
                    assert abs(player.locator('#video').evaluate('(v)=>v.volume') - .55) < .001
                    assert player.locator('#video').evaluate('(v)=>v.muted')
                    passed('A persistent browser profile restarts offline with pairing, cache, outbox and audio preferences intact')
                    player_context.set_offline(False)
                    wait(player, "async()=>{const {all}=await import('/player/offline.mjs');return (await all('events')).length===0;}", timeout=20000)
                    saved = owner.request.get(BASE + '/api/venue', headers=headers).json()
                    assert saved['metrics']['seconds'] > 0
                    assert saved['metrics']['dwell'] is None
                    passed('Reconnection drains the outbox into device-reported playback analytics, not human dwell')

                    # Bourbon Games: real venue TV + real home browser share one authoritative Proof Trials event.
                    response = owner.request.post(BASE + '/api/admin/games/proof-trials-demo', headers=headers, data={})
                    assert response.status in (200,201), response.text()
                    proof = response.json()
                    event_id = proof['id']
                    response = owner.request.post(BASE + f'/api/games/{event_id}/present', headers=headers, data={'groupName':'Bar TVs'})
                    assert response.status == 200, response.text()
                    wait(player, "!document.getElementById('game-stage').classList.contains('hidden')", timeout=12000)
                    expect(player.locator('#game-name')).to_contain_text('Proof Trials')
                    expect(player.locator('#game-join')).to_contain_text('PROOF26')
                    home_context = browser.new_context(viewport={'width':390,'height':844})
                    home = home_context.new_page()
                    home.on('pageerror', lambda error: errors.append(str(error)))
                    home.goto(BASE + '/games/PROOF26')
                    expect(home.get_by_role('heading', name='Join the tasting')).to_be_visible()
                    home.locator('#join-form input[name="name"]').fill('Home Taylor')
                    home.locator('#join-form button[type="submit"]').click()
                    expect(home.locator('#play')).to_be_visible()
                    event_data = owner.request.get(BASE + '/api/public/games/PROOF26').json()['event']
                    matchup = event_data['matchups'][0]
                    response = owner.request.post(BASE + f'/api/games/{event_id}/phase', headers=headers, data={'phase':'predictions','matchupId':matchup['id'],'seconds':30})
                    assert response.status == 200, response.text()
                    wait(player, "document.getElementById('game-phase').textContent==='PREDICTIONS'", timeout=12000)
                    wait(home, "document.getElementById('status').textContent.includes('Make your picks')", timeout=12000)
                    assert int(player.locator('#game-countdown').inner_text()) > 0
                    assert int(home.locator('#countdown').inner_text()) > 0
                    pick = home.locator(f'[data-matchup="{matchup["id"]}"][data-entry="{matchup["entryAId"]}"]')
                    expect(pick).to_be_visible()
                    pick.click()
                    expect(pick).to_have_text('Picked')
                    response = owner.request.post(BASE + f'/api/admin/games/{event_id}/publish-outcome', headers=headers, data={'matchupId':matchup['id'],'winnerEntryId':matchup['entryAId']})
                    assert response.status == 200, response.text()
                    response = owner.request.post(BASE + f'/api/games/{event_id}/phase', headers=headers, data={'phase':'results','matchupId':matchup['id']})
                    assert response.status == 200, response.text()
                    wait(home, "document.getElementById('status').textContent.includes('Results are in')", timeout=12000)
                    expect(home.locator('#standings')).to_contain_text('Home Taylor')
                    expect(home.locator('#standings')).to_contain_text('1 pts')
                    wait(player, "document.getElementById('game-phase').textContent==='RESULTS'", timeout=12000)
                    expect(player.locator('#game-matchups')).to_contain_text('Published winner')
                    home.screenshot(path=str(OUT / 'bourbon-games-home-mobile.png'), full_page=True)
                    player.screenshot(path=str(OUT / 'bourbon-games-tv-results.png'), full_page=True)
                    home_context.close()
                    passed('Bourbon Games synchronizes one Proof Trials event across a venue TV and home player with explainable scoring')

                    screen_checks(owner,page,player,BASE,headers,OUT,passed)
                    nav(page, 'home')
                    page.screenshot(path=str(OUT / 'native-home-desktop.png'), full_page=True)
                    page.set_viewport_size({'width': 390, 'height': 844})
                    for view in ['home', 'mixx', 'themes', 'tvs', 'schedule', 'commerce', 'revenue', 'billing']:
                        nav(page, view)
                        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), view + ' overflows'
                        if view == 'mixx':
                            page.screenshot(path=str(OUT / 'native-mixx-mobile.png'), full_page=True)
                        if view == 'tvs':
                            page.screenshot(path=str(OUT / 'native-remote-audio-mobile.png'), full_page=True)
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
                    if player2_context:
                        player2_context.close()
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
