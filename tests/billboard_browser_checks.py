"""Real venue editor, portrait media and short-lived billboard delivery in the isolated fixture."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import sqlite3
import time
from playwright.sync_api import expect


def billboard_checks(owner, page, player, player2, base, headers, database, out, passed, nav, wait):
    venue = owner.request.get(base+'/api/venue', headers=headers).json()
    main = next(t for t in venue['tvs'] if t['name']=='Main Bar')
    other = next(t for t in venue['tvs'] if t['name']=='Patio')
    audio = player.evaluate('({volume:video.volume,muted:video.muted})')
    with sqlite3.connect(database) as db:
        catalog = db.execute('SELECT id,status FROM content').fetchall()
        profiles = db.execute('SELECT tv_id,saved_mixx_id,updated_at FROM tv_profiles WHERE tv_id IN (?,?)', (main['id'],other['id'])).fetchall()
        environments = db.execute('SELECT tv_id,environment_id,updated_at FROM tv_environments WHERE tv_id IN (?,?)', (main['id'],other['id'])).fetchall()
        db.execute("UPDATE content SET status='draft'")
        db.execute("INSERT INTO content(id,title,worlds,tags,duration,provider,asset_id,status,ready,clean,rights_confirmed,created_at) VALUES('portrait-qa','The maker’s story','[\"golf\"]','[]',6,'demo','portrait','published',1,1,1,?)", (int(time.time()*1000),))
    owner.request.patch(base+'/api/tvs/'+other['id'],headers=headers,data={'group':'Patio TVs'})
    mix = {'mode':'single','worlds':{'golf':'normal'},'subcategories':{},'minutes':180,'seed':1}
    def profile(name, mode='full', qr=True):
        response=owner.request.post(base+'/api/saved-mixxes',headers=headers,data={'name':name,'mix':mix,'playbackMode':mode,'showQr':qr})
        assert response.status==201,response.text()
        return response.json()['id']
    full, no_qr, clean = profile('Billboard fixture'), profile('Billboard QR off','no-ads',False), profile('Billboard clean','clean')
    for tv in [main,other]:
        assert owner.request.post(base+'/api/tvs/'+tv['id']+'/profile',headers=headers,data={'savedMixxId':full}).status==200
    accept=lambda dialog:dialog.accept()
    page.on('dialog',accept)
    held=[]
    hold=lambda route:held.append(route)
    try:
        wait(player,'video.videoHeight>video.videoWidth&&video.currentTime>.1&&!video.paused',timeout=20000)
        wait(player2,'video.videoHeight>video.videoWidth&&video.currentTime>.1&&!video.paused',timeout=20000)
        nav(page,'commerce')
        expect(page.locator('[data-bb-status]')).to_contain_text('Drafts are up to date')
        page.locator('[data-bb-template="store-pick"]').click()
        title='Friday discovery <img src=x>'
        page.get_by_label('Headline',exact=True).fill(title)
        page.get_by_label('Message',exact=True).fill('Our store pick. A new story. Ask the team and discover something worth sharing.')
        page.get_by_label('QR destination · optional',exact=True).fill('https://example.test/billboard-qa')
        page.get_by_label('TV group',exact=True).select_option('Bar TVs')
        info=owner.request.get(base+'/api/billboards',headers=headers).json()
        start=(datetime.now(ZoneInfo(info['timeZone']))-timedelta(minutes=1)).strftime('%Y-%m-%dT%H:%M')
        page.locator('[name=startsLocal]').fill(start)
        page.get_by_role('button',name='Save draft',exact=True).click()
        expect(page.locator('[data-bb-status]')).to_contain_text('Draft saved')
        expect(player.locator('#billboard')).to_be_hidden()
        page.reload();nav(page,'commerce')
        expect(page.get_by_label('Headline',exact=True)).to_have_value(title)
        page.screenshot(path=str(out/'billboard-editor-desktop.png'),full_page=True)
        passed('Venue editor saves and reloads a template-based draft without publishing or changing TV playback')

        page.get_by_role('button',name='Publish billboard',exact=True).click()
        expect(page.locator('[data-bb-status]')).to_contain_text('Billboard published')
        expect(player.locator('#billboard')).to_be_visible(timeout=12000)
        expect(player.locator('#billboard-title')).to_have_text(title)
        expect(player2.locator('#billboard')).to_be_hidden()
        wait(player,'document.getElementById("billboard-qr").naturalWidth>0')
        assert player.locator('#billboard-title img').count()==0
        assert player.locator('video').count()==1
        assert player.evaluate('({volume:video.volume,muted:video.muted})')==audio
        bounds=player.evaluate('({v:video.getBoundingClientRect().right,b:document.getElementById("billboard").getBoundingClientRect().left})')
        assert bounds['v']<=bounds['b']+1
        player.screenshot(path=str(out/'billboard-portrait-short-tv.png'),full_page=True)
        with sqlite3.connect(database) as db:
            code=db.execute('SELECT qr_code FROM venue_billboards').fetchone()[0]
            assert db.execute('SELECT COUNT(*) FROM ledger').fetchone()[0]==0
        link=owner.request.get(base+'/b/'+code,max_redirects=0)
        assert link.status==302 and link.headers['location']=='https://example.test/billboard-qa'
        passed('One real portrait video plays beside the authorized store billboard and working QR; other TV groups and audio stay unchanged')

        page.get_by_label('Headline',exact=True).fill('The next store discovery.')
        page.get_by_role('button',name='Save draft',exact=True).click()
        expect(page.locator('[data-bb-status]')).to_contain_text('Draft saved')
        expect(player.locator('#billboard-title')).to_have_text(title)
        page.get_by_role('button',name='Publish billboard',exact=True).click()
        expect(player.locator('#billboard-title')).to_have_text('The next store discovery.',timeout=12000)
        assert owner.request.get(base+'/b/'+code,max_redirects=0).status==404
        passed('Editing a published billboard stays private until explicit publication; the old QR expires on replacement')

        owner.request.post(base+'/api/tvs/'+main['id']+'/profile',headers=headers,data={'savedMixxId':no_qr})
        expect(player.locator('#billboard')).to_be_visible(timeout=12000)
        expect(player.locator('#billboard-qr-box')).to_be_hidden(timeout=12000)
        owner.request.post(base+'/api/tvs/'+main['id']+'/profile',headers=headers,data={'savedMixxId':clean})
        expect(player.locator('#billboard')).to_be_hidden(timeout=12000)
        owner.request.post(base+'/api/tvs/'+main['id']+'/profile',headers=headers,data={'savedMixxId':full})
        expect(player.locator('#billboard')).to_be_visible(timeout=12000)
        expect(player.locator('#billboard-qr-box')).to_be_visible()
        passed('Billboards honor Clean Screen and QR-off; No Ads keeps the retailer’s own promotion')

        player.route('**/api/player/state',hold)
        expect(player.locator('#billboard')).to_be_hidden(timeout=18000)
        assert not player.locator('#video').evaluate('(video)=>video.paused')
        player.unroute('**/api/player/state',hold)
        for route in held:
            try:route.abort()
            except Exception:pass
        expect(player.locator('#billboard')).to_be_visible(timeout=20000)
        passed('A stalled state connection expires the billboard within its short lease while the cached film continues, then restores on reconnect')

        player.set_viewport_size({'width':720,'height':1280})
        expect(player.locator('#billboard')).to_be_visible()
        assert player.evaluate('video.getBoundingClientRect().bottom<=document.getElementById("billboard").getBoundingClientRect().top+1')
        assert player.evaluate('document.documentElement.scrollWidth<=innerWidth')
        player.screenshot(path=str(out/'billboard-vertical-tv.png'),full_page=True)
        page.set_viewport_size({'width':390,'height':844})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(out/'billboard-editor-mobile.png'),full_page=True)
        page.get_by_role('button',name='Withdraw',exact=True).click()
        expect(page.locator('[data-bb-status]')).to_contain_text('Billboard withdrawn')
        expect(player.locator('#billboard')).to_be_hidden(timeout=12000)
        passed('The editor fits a phone, vertical TV layout preserves the short above the billboard, and withdrawal removes the display')
    finally:
        player.unroute('**/api/player/state',hold)
        page.remove_listener('dialog',accept)
        page.set_viewport_size({'width':1440,'height':1120});player.set_viewport_size({'width':1440,'height':900})
        with sqlite3.connect(database) as db:
            for content,status in catalog:db.execute('UPDATE content SET status=? WHERE id=?',(status,content))
            db.execute("UPDATE content SET status='draft' WHERE id='portrait-qa'")
            db.execute('UPDATE tvs SET group_name=? WHERE id=?',(other['group_name'],other['id']))
            for tv in [main,other]:
                db.execute('DELETE FROM tv_profiles WHERE tv_id=?',(tv['id'],))
                db.execute('DELETE FROM tv_environments WHERE tv_id=?',(tv['id'],))
            for row in profiles:db.execute('INSERT INTO tv_profiles VALUES(?,?,?)',row)
            for row in environments:db.execute('INSERT INTO tv_environments VALUES(?,?,?)',row)
        owner.request.post(base+'/api/commands',headers=headers,data={'kind':'shuffle','ids':[main['id'],other['id']]})
    wait(player,'video.videoWidth>video.videoHeight&&video.currentTime>.1&&!video.paused',timeout=20000)
    expect(player.locator('#billboard')).to_be_hidden()
    assert player.evaluate('({volume:video.volume,muted:video.muted})')==audio
    passed('The venue returns to ordinary landscape playback with one media element and preserved audio preferences')
