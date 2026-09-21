"""Venue finishing checks against the disposable, production-mode fixture."""
import json
import sqlite3
from playwright.sync_api import expect


def finish_checks(page, context, base, database, out, passed):
    def nav(name):
        target = page.locator(f'nav [data-page="{name}"]')
        if not target.is_visible() and page.locator('[data-action="menu"]').is_visible():
            page.locator('[data-action="menu"]').click()
        settings = page.locator('nav [data-stream-settings]')
        if not target.is_visible() and not settings.evaluate('(el)=>el.open'):
            settings.locator('summary').click()
        target.click()
        expect(target).to_have_attribute('aria-current', 'page')

    nav('tvs')
    page.locator('.playback-controls-entry button').click()
    overlay = page.locator('.playback-controls-overlay')
    expect(overlay).to_contain_text('Pair a TV before applying a setup.')
    form = overlay.locator('[data-save]')
    form.locator('[name="name"]').fill('Evening MIXX')
    form.locator('[name="mode"][value="clean"]').check()
    for name in ['qr', 'promos']:
        expect(form.locator(f'[name="{name}"]')).not_to_be_checked()
        expect(form.locator(f'[name="{name}"]')).to_be_disabled()
    form.locator('[name="mode"][value="full"]').check()
    for name in ['qr', 'promos']:
        expect(form.locator(f'[name="{name}"]')).to_be_checked()
        expect(form.locator(f'[name="{name}"]')).to_be_enabled()
    form.locator('button[type="submit"]').click()
    expect(overlay.locator('[data-apply]')).to_have_count(1)
    expect(overlay.locator('[data-apply]')).to_be_disabled()
    page.screenshot(path=str(out/'finish-tv-settings-desktop.png'), full_page=True)
    page.keyboard.press('Escape')
    expect(overlay).to_have_count(0)
    passed('TV exposes playback settings; Clean Screen explains QR/promotion behavior and unpaired venues cannot report a successful apply')

    nav('commerce')
    expect(page.locator('[data-bb-status]')).to_contain_text('Drafts are up to date')
    page.locator('[data-bb-template]').first.click()
    page.locator('[name="title"]').fill('A great pour starts with a great story.')
    expect(page.locator('[data-bb-preview-title]')).to_have_text('A great pour starts with a great story.')
    assert not page.locator('[data-bb-options]').evaluate('(el)=>el.open')
    editor = page.locator('.bb-editor').bounding_box()
    preview = page.locator('.bb-preview-panel').bounding_box()
    assert editor['x'] + editor['width'] <= preview['x'], (editor, preview)
    page.locator('[data-bb-save]').click()
    expect(page.locator('[data-bb-status]')).to_contain_text('Draft saved.')
    expect(page.locator('[data-bb-count]')).to_have_text('1')
    expect(page.locator('[data-bb-publish]')).to_be_enabled()
    page.screenshot(path=str(out/'finish-billboard-desktop.png'), full_page=True)
    page.locator('[name="title"]').fill('Unsaved store message')
    page.once('dialog', lambda dialog: dialog.dismiss())
    page.locator('nav [data-page="home"]').click()
    expect(page.locator('nav [data-page="commerce"]')).to_have_attribute('aria-current', 'page')
    expect(page.locator('[name="title"]')).to_have_value('Unsaved store message')
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.locator('[data-bb-see]').click()
    expect(page.locator('.bb-preview-panel')).to_be_focused()
    page.screenshot(path=str(out/'finish-billboard-mobile.png'), full_page=True)
    page.set_viewport_size({'width':1440,'height':1050})
    passed('Billboard keeps editing and preview together, fits phones, requires explicit publication and protects unsaved navigation')

    page.route('**/api/ui-version', lambda route: route.fulfill(status=200, content_type='application/json', body=json.dumps({'version':'f'*64})))
    page.evaluate("window.finishDraftMarker='still here';window.dispatchEvent(new Event('focus'))")
    expect(page.locator('[data-app-update]')).to_be_visible()
    page.screenshot(path=str(out/'finish-update-notice.png'), full_page=True)
    page.once('dialog', lambda dialog: dialog.dismiss())
    page.locator('[data-update-reload]').click(no_wait_after=True)
    assert page.evaluate('window.finishDraftMarker') == 'still here'
    expect(page.locator('[name="title"]')).to_have_value('Unsaved store message')
    page.locator('[data-update-later]').click()
    with page.expect_response('**/api/ui-version'):
        page.evaluate("window.dispatchEvent(new Event('focus'))")
    expect(page.locator('[data-app-update]')).to_have_count(0)
    page.unroute('**/api/ui-version')
    page.locator('[data-bb-save]').click()
    expect(page.locator('[data-bb-status]')).to_contain_text('Draft saved.')
    passed('New UI versions offer a dismissible reload notice without automatic refresh or loss of an unsaved billboard')

    session = context.request.get(base+'/api/session').json()
    with sqlite3.connect(database) as db:
        db.execute("UPDATE members SET role='viewer' WHERE user_id=?", (session['user']['id'],))
    page.reload()
    nav('tvs')
    page.locator('.playback-controls-entry button').click()
    expect(overlay).to_contain_text('View only.')
    expect(overlay.locator('[data-save] button[type="submit"]')).to_be_disabled()
    expect(overlay.locator('[name="qr"]')).to_be_disabled()
    expect(overlay.locator('[data-apply]')).to_be_disabled()
    overlay.locator('[data-close]').click()
    nav('commerce')
    expect(page.locator('[data-bb-status]')).to_contain_text('Your venue role can preview')
    for selector in ['[data-bb-save]', '[data-bb-publish]', '[data-bb-new]']:
        expect(page.locator(selector)).to_be_disabled()
    expect(page.locator('[name="title"]')).to_have_value('Unsaved store message')
    with sqlite3.connect(database) as db:
        db.execute("UPDATE members SET role='owner' WHERE user_id=?", (session['user']['id'],))
    page.reload()
    expect(page.locator('nav [data-page="home"]')).to_be_visible()
    settings=page.locator('nav [data-stream-settings]')
    if not settings.evaluate('(el)=>el.open'):
        settings.locator('summary').click()
    passed('Viewers can inspect saved billboards and playback settings without being offered unauthorized writes')
