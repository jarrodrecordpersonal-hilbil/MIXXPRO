"""Curator workflow through the real admin UI, with an already paired TV."""
import json
from playwright.sync_api import expect


def curator_checks(owner, player, base, headers, out, passed, nav, wait):
    page = owner.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    try:
        page.goto(base)
        page.locator('[data-page="admin"]').first.wait_for(state='attached')
        nav(page, 'admin')
        panel = page.locator('[data-curator-environments]')
        expect(panel).to_be_visible()
        panel.get_by_role('button', name='Create environment', exact=True).click()
        dialog = page.locator('.curator-dialog')
        dialog.get_by_label('Environment name', exact=True).fill('Curator Browser Rotation')
        dialog.get_by_label('Rotation minutes', exact=True).fill('30')
        dialog.get_by_role('button', name='Preview programming', exact=True).click()
        preview = dialog.locator('[data-curator-preview-result]')
        expect(preview.locator('video')).to_be_visible()
        preview.locator('video').evaluate('(video)=>video.play()')
        wait(page, "document.querySelector('.curator-dialog video').currentTime>.1")
        assert not any(e['name'] == 'Curator Browser Rotation' for e in owner.request.get(base + '/api/environments', headers=headers).json()['environments'])
        preview.scroll_into_view_if_needed()
        page.screenshot(path=str(out / 'native-curator-preview-desktop.png'), full_page=True)
        passed('Curator previews actual eligible video before saving or publishing an environment')
        dialog.get_by_role('button', name='Save draft', exact=True).click()
        expect(dialog).to_have_count(0)
        environments = owner.request.get(base + '/api/admin/environments', headers=headers).json()['environments']
        environment = next(e for e in environments if e['name'] == 'Curator Browser Rotation')
        environment_id = environment['id']
        assert environment['status'] == 'draft'
        assert not any(e['id'] == environment_id for e in owner.request.get(base + '/api/environments', headers=headers).json()['environments'])
        panel.locator(f'[data-id="{environment_id}"]').click()
        dialog.get_by_role('button', name='Publish environment', exact=True).click()
        expect(dialog).to_have_count(0)
        published = next(e for e in owner.request.get(base + '/api/environments', headers=headers).json()['environments'] if e['id'] == environment_id)
        assert published['version'] == 2
        passed('Curator saves a private draft and explicitly publishes it into venue choices')

        tv = owner.request.get(base + '/api/venue', headers=headers).json()['tvs'][0]
        response = owner.request.post(base + f"/api/tvs/{tv['id']}/environment", headers=headers, data={'environmentId': environment_id})
        assert response.status == 200, response.text()
        wait(player, "async()=>{const {get}=await import('/player/offline.mjs');return (await get('kv','manifest'))?.value.environmentId===" + json.dumps(environment_id) + ";}", timeout=12000)
        expect(player.locator('#qr-box')).to_be_visible()
        page.set_viewport_size({'width': 390, 'height': 844})
        panel.locator(f'[data-id="{environment_id}"]').click()
        dialog.get_by_label('Playback mode', exact=True).select_option('clean')
        dialog.get_by_role('button', name='Preview programming', exact=True).click()
        expect(preview).to_contain_text('QR off')
        expect(player.locator('#qr-box')).to_be_visible()
        live = next(e for e in owner.request.get(base + '/api/environments', headers=headers).json()['environments'] if e['id'] == environment_id)
        assert live['version'] == 2 and live['playbackMode'] == 'full'
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert dialog.evaluate('(el)=>el.scrollWidth<=el.clientWidth')
        preview.scroll_into_view_if_needed()
        page.screenshot(path=str(out / 'native-curator-preview-mobile.png'), full_page=True)
        dialog.get_by_role('button', name='Publish update', exact=True).click()
        expect(dialog).to_have_count(0)
        wait(player, "async()=>{const {get}=await import('/player/offline.mjs');const m=(await get('kv','manifest'))?.value;return m?.environmentId===" + json.dumps(environment_id) + "&&m.environmentVersion===3&&m.playbackMode==='clean';}", timeout=12000)
        expect(player.locator('#qr-box')).to_be_hidden()
        assert player.locator('#qr').get_attribute('src') is None
        assert abs(player.locator('#video').evaluate('(v)=>v.volume') - .55) < .001
        assert player.locator('#video').evaluate('(v)=>v.muted')
        passed('Mobile curator preview leaves the live version unchanged; publishing updates the paired TV and preserves audio')
        panel.locator(f'[data-id="{environment_id}"]').click()
        dialog.get_by_role('button', name='Withdraw environment', exact=True).click()
        expect(dialog).to_have_count(0)
        wait(player, "async()=>{const {get}=await import('/player/offline.mjs');return (await get('kv','manifest'))?.value.environmentId===null;}", timeout=12000)
        expect(player.locator('#qr-box')).to_be_visible()
        assert not any(e['id'] == environment_id for e in owner.request.get(base + '/api/environments', headers=headers).json()['environments'])
        assert not errors, errors
        passed('Curator withdrawal restores the TV fallback; the admin workflow has no uncaught browser errors')
    finally:
        page.close()
