"""Real UI coverage for environment/profile switching on disposable demo TVs."""
import json
import re
from playwright.sync_api import expect


def environment_checks(owner, page, player, player2, player_context, base, headers, out, passed, nav, wait):
    current = owner.request.get(base + '/api/current-mix', headers=headers).json()
    shared = {'mix': current['mix'], 'theme': current['theme'], 'accent': current['accent']}
    response = owner.request.post(base + '/api/admin/environments', headers=headers,
        data={**shared, 'name': 'Switching Test Environment', 'description': 'Synthetic browser fixture', 'playbackMode': 'full'})
    assert response.status == 201, response.text()
    environment_id = response.json()['id']
    response = owner.request.post(base + f'/api/admin/environments/{environment_id}/publish', headers=headers, data={})
    assert response.status == 200, response.text()
    profiles = {}
    for mode in ['clean', 'no-ads', 'full']:
        response = owner.request.post(base + '/api/saved-mixxes', headers=headers,
            data={**shared, 'name': 'Switch Test ' + mode, 'playbackMode': mode, 'showQr': mode == 'full'})
        assert response.status == 201, response.text()
        profiles[mode] = response.json()['id']

    nav(page, 'mixx')
    original_viewport = page.viewport_size
    page.set_viewport_size({'width': 390, 'height': 844})
    page.locator('.playback-controls-entry button').click()
    overlay = page.locator('.playback-controls-overlay')
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    environment_button = overlay.locator(f'[data-environment="{environment_id}"][data-target="all"]')
    environment_button.click()
    expect(environment_button).to_have_text('Applied')
    wait(player, "async()=>{const {get}=await import('/player/offline.mjs');return (await get('kv','manifest'))?.value.environmentId===" + json.dumps(environment_id) + ";}", timeout=12000)
    expect(player.locator('#qr-box')).to_be_visible()

    def apply_profile(mode):
        button = overlay.locator(f'[data-apply="{profiles[mode]}"]')
        button.click()
        expect(button).to_have_text('Applied')
        expression = "async()=>{const {get}=await import('/player/offline.mjs');const m=(await get('kv','manifest'))?.value;return m?.savedMixxId===" + json.dumps(profiles[mode]) + "&&m.environmentId===null&&m.playbackMode===" + json.dumps(mode) + ";}"
        for target in [player, player2]:
            wait(target, expression, timeout=12000)

    apply_profile('clean')
    assert owner.request.get(base + '/api/environments', headers=headers).json()['assignments'] == []
    for target in [player, player2]:
        expect(target.locator('#qr-box')).to_be_hidden()
        assert target.locator('#qr').get_attribute('src') is None
        wait(target, "!document.getElementById('video').paused&&document.getElementById('video').readyState>=2", timeout=12000)
    page.screenshot(path=str(out / 'native-environment-profile-mobile.png'), full_page=True)
    player.screenshot(path=str(out / 'native-clean-screen-player.png'), full_page=True)
    passed('Mobile saved Clean Screen selection replaces a curated environment on both real TVs within the state-poll window')

    player_context.set_offline(True)
    player.reload(wait_until='domcontentloaded')
    wait(player, "document.getElementById('video').currentTime>.2&&!document.getElementById('video').paused", timeout=20000)
    expect(player.locator('#qr-box')).to_be_hidden()
    assert player.locator('#qr').get_attribute('src') is None
    assert abs(player.locator('#video').evaluate('(v)=>v.volume') - .55) < .001
    assert player.locator('#video').evaluate('(v)=>v.muted')
    passed('Clean Screen persists through offline reload with real playback, hidden QR and unchanged audio preferences')
    player_context.set_offline(False)

    apply_profile('no-ads')
    expect(player.locator('#qr-box')).to_be_hidden()
    assert player.locator('#qr').get_attribute('src') is None
    apply_profile('full')
    for target in [player, player2]:
        expect(target.locator('#qr-box')).to_be_visible()
        expect(target.locator('#qr')).to_have_attribute('src', re.compile(r'^(?!undefined$).+'))
    assert abs(player.locator('#video').evaluate('(v)=>v.volume') - .55) < .001
    assert player.locator('#video').evaluate('(v)=>v.muted')
    passed('No Ads honors QR-off and Full MIXX restores QR without changing audio or the selected programming mix')
    overlay.locator('[data-close]').click()
    page.set_viewport_size(original_viewport)
