"""Production-mode Settings readiness, using only the disposable activation fixture."""
import sqlite3
from playwright.sync_api import expect


def settings_checks(page, context, base, database, out, passed):
    def nav(name):
        target = page.locator(f'nav [data-page="{name}"]')
        if not target.is_visible():
            menu = page.locator('[data-action="menu"]')
            if menu.is_visible():
                menu.click()
        settings = page.locator('nav [data-stream-settings]')
        if not target.is_visible() and not settings.evaluate('(el)=>el.open'):
            settings.locator('summary').click()
        target.click()
        expect(target).to_have_attribute('aria-current', 'page')

    settings = page.locator('nav [data-stream-settings]')
    expect(settings.locator('[data-settings-group="venue"]')).to_have_text('Venue tools')
    expect(settings.locator('[data-settings-group="reports"]')).to_have_text('Reporting')
    expect(settings.locator('[data-settings-group="network"]')).to_have_count(0)
    expect(page.locator('[data-page="billing"]')).to_have_count(0)
    expect(page.locator('[data-page="admin"],[data-extension="setup"]')).to_have_count(0)
    expect(page.locator('[data-extension="music"]')).to_contain_text('Music setup')
    nav('games')
    expect(page.get_by_role('heading', name='No live event available yet')).to_be_visible()
    expect(page.locator('[data-host-action="demo"]')).to_have_count(0)
    writes = []
    def observe(request):
        if '/api/' in request.url and request.method not in ['GET', 'HEAD']:
            writes.append(request.url)
    page.on('request', observe)
    page.locator('[data-preview-pick="B"]').click()
    page.locator('[data-preview-view="score"]').click()
    expect(page.locator('[data-preview-score]')).to_contain_text('0 points')
    page.locator('[data-preview-view="phone"]').click()
    page.locator('[data-preview-pick="A"]').click()
    page.locator('[data-preview-view="score"]').click()
    expect(page.locator('[data-preview-score]')).to_contain_text('1 point')
    page.locator('[data-preview-view="tv"]').click()
    expect(page.locator('[data-preview-panel="tv"]')).to_be_visible()
    expect(page.locator('.game-preview-disclaimer')).to_contain_text('does not save picks')
    with sqlite3.connect(database) as db:
        for table in ['tasting_events', 'game_predictions', 'event_presentations', 'commands']:
            assert db.execute('SELECT COUNT(*) FROM '+table).fetchone()[0] == 0, table
    assert writes == [], writes
    page.remove_listener('request', observe)
    page.locator('[data-preview-view="phone"]').click()
    page.screenshot(path=str(out/'settings-games-desktop.png'), full_page=True)
    passed('Empty production games show a labeled interactive preview without creating events, picks or TV commands')

    page.route('**/api/games', lambda route: route.abort())
    page.locator('[data-host-action="refresh"]').click()
    expect(page.locator('[data-host-status]')).to_contain_text('Connection interrupted')
    page.locator('[data-preview-view="score"]').click()
    expect(page.locator('[data-preview-score]')).to_be_visible()
    page.unroute('**/api/games')
    page.locator('[data-host-action="refresh"]').click()
    expect(page.locator('[data-host-status]')).to_have_text('Up to date.')
    page.locator('[data-host-nav="tvs"]').click()
    expect(page.locator('nav [data-page="tvs"]')).to_have_attribute('aria-current', 'page')
    passed('Game discovery reports connection failures, recovers explicitly and links to real TV controls')

    nav('themes')
    expect(page.locator('[data-action="apply-theme"]')).to_be_disabled()
    page.locator('[data-action="theme"][data-id="speakeasy"]').click()
    page.locator('[data-action="save-theme"]').click()
    expect(page.locator('#toast')).to_contain_text('Venue look saved')
    nav('schedule')
    page.locator('[data-action="schedule"]').first.click()
    expect(page.locator('#dialog')).to_contain_text('Applies to all TVs')
    page.locator('#dialog [name="name"]').fill('Dinner QA')
    page.locator('#dialog button[type="submit"]').click()
    expect(page.locator('.main')).to_contain_text('Dinner QA')
    nav('commerce')
    expect(page.locator('[data-bb-status]')).to_contain_text('Drafts are up to date')
    expect(page.locator('[data-bb-publish]')).to_be_disabled()
    passed('Appearance saves a default before pairing, schedules save real rows, and new billboards require a saved draft')

    page.set_viewport_size({'width':390,'height':844})
    for name in ['themes','schedule','commerce','games']:
        nav(name)
        expect(page.locator('h1')).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), name
    page.screenshot(path=str(out/'settings-games-mobile.png'), full_page=True)
    passed('All four venue Settings screens fit a 390px phone without horizontal overflow')

    session = context.request.get(base+'/api/session').json()
    with sqlite3.connect(database) as db:
        db.execute("UPDATE members SET role='viewer' WHERE user_id=?", (session['user']['id'],))
    page.reload()
    expect(page.get_by_role('heading', name='Home.', exact=True)).to_be_visible()
    expect(page.locator('nav [data-page="games"]')).to_have_count(0)
    nav('themes')
    expect(page.get_by_text('View only.', exact=False)).to_be_visible()
    expect(page.locator('[data-action="save-theme"]')).to_be_disabled()
    nav('schedule')
    expect(page.locator('[data-action="schedule"]').first).to_be_disabled()
    expect(page.locator('[data-action="remove-schedule"]')).to_be_disabled()
    with sqlite3.connect(database) as db:
        db.execute("UPDATE members SET role='owner' WHERE user_id=?", (session['user']['id'],))
    page.set_viewport_size({'width':1440,'height':1050})
    page.reload()
    expect(page.locator('nav [data-page="home"]')).to_be_visible()
    settings=page.locator('nav [data-stream-settings]')
    if not settings.evaluate('(el)=>el.open'):
        settings.locator('summary').click()
    passed('Viewers can inspect appearance and schedules without being offered unauthorized edits')
