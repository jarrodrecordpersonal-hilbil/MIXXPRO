"""Native UI acceptance against the existing isolated native-browser fixture."""
from pathlib import Path
import time
from playwright.sync_api import expect


def screen_checks(owner, page, player, base, headers, output, passed):
    page.goto(base + '/screens')
    expect(page.get_by_role('heading', name='Every screen has a story.')).to_be_visible()
    expect(page.get_by_role('button', name='Whole network', exact=True)).to_be_visible()
    page.get_by_role('button', name='My venue', exact=True).click()
    page.get_by_role('button', name='Edit venue location', exact=True).click()
    form = page.locator('#location-form')
    form.locator('[name="address"]').fill('100 Demo Clubhouse Road')
    form.locator('[name="city"]').fill('Springfield')
    form.locator('[name="region"]').fill('Missouri')
    form.locator('[name="postalCode"]').fill('65801')
    form.locator('[name="country"]').fill('US')
    form.get_by_role('button', name='Save venue location').click()
    expect(page.locator('#location-dialog')).not_to_be_visible()
    # Ask the real player to obtain the newly located manifest now, not in two minutes.
    r=owner.request.post(base+'/api/commands',headers=headers,data={'ids':'all','kind':'apply','theme':'speakeasy'})
    assert r.status==200,r.text()
    deadline=time.monotonic()+25
    while time.monotonic()<deadline:
        r=owner.request.get(base+'/api/screen-activity?city=Springfield',headers=headers)
        assert r.status==200,r.text()
        if r.json()['summary']['reportedSeconds']>0:
            break
        page.wait_for_timeout(1000)
    else:
        raise AssertionError('No located playback progress received from the player')
    page.locator('#filters [name="city"]').fill('Springfield')
    page.get_by_role('button',name='Show activity',exact=True).click()
    expect(page.locator('tbody tr').first).to_contain_text('Springfield')
    assert page.locator('tbody tr').first.inner_text().find('Main Bar')>=0
    with page.expect_download() as download_info:
        page.get_by_role('button',name='Export this page · CSV').click()
    path=download_info.value.path()
    csv=Path(path).read_text()
    assert 'Reported seconds' in csv and 'Springfield' in csv
    assert '100 Demo Clubhouse Road' not in csv
    page.screenshot(path=str(output/'screen-activity-desktop.png'),full_page=True)
    passed('Native screen-activity UI saves venue location, filters actual playback, and exports a labelled CSV page')
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path=str(output/'screen-activity-mobile.png'),full_page=True)
    passed('Screen activity fits a 390px viewport with scroll-contained playback details')
    page.set_viewport_size({'width':1440,'height':1120})
    page.goto(base)
    expect(page.locator('nav [data-screen-activity]')).to_be_visible()
