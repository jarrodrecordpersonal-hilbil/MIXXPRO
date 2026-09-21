"""One synthetic Proof Trials event, a paired TV and four independent guests."""
import sqlite3
from playwright.sync_api import expect


def game_checks(browser, owner, player, base, headers, database, out, passed, wait, errors):
    contexts = []
    console = owner.new_page()
    console.set_viewport_size({'width': 390, 'height': 844})
    console.on('pageerror', lambda error: errors.append(str(error)))
    console.on('dialog', lambda dialog: dialog.accept())
    console.goto(base + '/games/host')
    with console.expect_response(lambda r: r.url.endswith('/proof-trials-demo') and r.request.method == 'POST') as created:
        console.get_by_role('button', name='Create fictional demo').click()
    assert created.value.status in (200, 201), created.value.text()
    event_id = created.value.json()['id']
    expect(console.locator('#event-name')).to_contain_text('Proof Trials')
    expect(console.locator('#connection')).to_have_attribute('data-stale', 'false')
    event = owner.request.get(base + '/api/public/games/PROOF26').json()['event']
    matchup, judge = event['matchups'][0], event['judges'][0]
    entry_name = '<i data-entry-injected>Oak</i>'
    guest_name = '<b data-guest-injected>Riley</b>'
    # Disposable fixture only. No API for editing live event entries is assumed.
    with sqlite3.connect(database) as connection:
        connection.execute('UPDATE tasting_entries SET name=? WHERE id=?', (entry_name, matchup['entryAId']))
    before = player.evaluate("async()=>{const {get}=await import('/player/offline.mjs');return (await get('kv','manifest')).value;}")
    audio = player.locator('#video').evaluate('(v)=>({volume:v.volume,muted:v.muted})')
    console.locator('#group').select_option(label='Bar TVs')
    with console.expect_response(lambda r: r.url.endswith('/present') and r.request.method == 'POST') as presented:
        console.get_by_role('button', name='Show on TVs').click()
    assert presented.value.status == 200, presented.value.text()
    expect(console.locator('#presentations')).to_contain_text('Bar TVs')
    assert console.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'host console mobile overflow'
    console.screenshot(path=str(out / 'bourbon-games-host-mobile.png'), full_page=True)
    console.set_viewport_size({'width': 1440, 'height': 1100})
    console.screenshot(path=str(out / 'bourbon-games-host-desktop.png'), full_page=True)
    console.set_viewport_size({'width': 390, 'height': 844})
    passed('Demo control room creates and presents the fictional event using real mobile controls')

    def phase(name):
        expect(console.locator('#connection')).to_have_attribute('data-stale', 'false')
        if name == 'predictions':
            console.locator('#open-picks select').select_option(matchup['id'])
            console.locator('#open-picks input').fill('120')
            button = console.get_by_role('button', name='Open predictions')
        else:
            button = console.locator({'judging': '#begin-judging', 'results': '#show-results', 'complete': '#complete'}[name])
        with console.expect_response(lambda r: r.url.endswith('/phase') and r.request.method == 'POST') as advanced:
            button.click()
        assert advanced.value.status == 200, advanced.value.text()
        expect(console.locator('#phase')).to_contain_text(name.upper())

    try:
        wait(player, "!document.getElementById('game-stage').classList.contains('hidden')", timeout=12000)
        expect(player.locator('#game-join')).to_contain_text('PROOF26')
        expect(player.locator('#game-matchups')).to_contain_text(entry_name)
        assert player.locator('[data-entry-injected]').count() == 0
        # A local stop must restore programming without completing the shared event.
        console.get_by_role('button', name='Stop presenting').click()
        expect(player.locator('#game-stage')).to_be_hidden(timeout=12000)
        assert owner.request.get(base + '/api/public/games/PROOF26').json()['event']['phase'] == 'lobby'
        console.get_by_role('button', name='Show on TVs').click()
        expect(player.locator('#game-stage')).to_be_visible(timeout=12000)
        passed('Stop presenting restores local TV programming without ending the shared event')

        # Offline actions are disabled, not queued and replayed after reconnect.
        owner.set_offline(True)
        expect(console.locator('#connection')).to_have_attribute('data-stale', 'true')
        expect(console.get_by_role('button', name='Open predictions')).to_be_disabled()
        expect(console.get_by_role('button', name='Show on TVs')).to_be_disabled()
        owner.set_offline(False)
        expect(console.locator('#connection')).to_have_attribute('data-stale', 'false')
        expect(console.locator('#phase')).to_contain_text('LOBBY')
        passed('Host controls pause offline and reconnect without replaying game actions')

        console.locator('#open-picks input').fill('180')
        names = ['Home Taylor', 'Venue Morgan', guest_name, 'Home Casey']
        guests = []
        for name in names:
            context = browser.new_context(viewport={'width': 390, 'height': 844})
            contexts.append(context)
            page = context.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(base + '/games/PROOF26')
            expect(page.get_by_role('heading', name='Join the tasting')).to_be_visible()
            page.locator('#join-form input[name="name"]').fill(name)
            page.locator('#join-form button[type="submit"]').click()
            expect(page.locator('#play')).to_be_visible()
            participant = context.request.get(base + '/api/public/games/PROOF26').json()['participant']
            guests.append((context, page, participant['id']))
        expect(console.locator('#standings')).to_contain_text('Home Casey')
        expect(console.locator('#open-picks input')).to_have_value('180')
        assert console.locator('[data-entry-injected], [data-guest-injected]').count() == 0
        passed('Guest joins preserve in-progress host forms and HTML-shaped names remain literal')
        phase('predictions')
        wait(player, "document.getElementById('game-phase').textContent==='PREDICTIONS'", timeout=12000)
        assert int(player.locator('#game-countdown').inner_text()) > 0
        for index, (context, page, participant_id) in enumerate(guests):
            wait(page, "document.getElementById('status').textContent.includes('Make your picks')", timeout=12000)
            assert int(page.locator('#countdown').inner_text()) > 0
            chosen = matchup['entryAId'] if index in (0, 2) else matchup['entryBId']
            pick = page.locator(f'[data-matchup="{matchup["id"]}"][data-entry="{chosen}"]')
            with page.expect_response(lambda r: r.url.endswith('/predict') and r.request.method == 'POST') as accepted:
                pick.click()
            assert accepted.value.status == 200
            judge_pick = matchup['entryAId'] if index in (0, 1) else matchup['entryBId']
            response = context.request.post(base + '/api/public/games/PROOF26/predict',
                data={'matchupId': matchup['id'], 'entryId': judge_pick, 'kind': 'judge', 'judgeId': judge['id']})
            assert response.status == 200, response.text()
            assert page.locator('[data-entry-injected], [data-guest-injected]').count() == 0
            expect(page.locator('#matchups')).to_contain_text(entry_name)
        first_context, home, participant_id = guests[0]
        home.reload()
        expect(home.locator('#play')).to_be_visible()
        assert first_context.request.get(base + '/api/public/games/PROOF26').json()['participant']['id'] == participant_id
        assert len(owner.request.get(base + '/api/public/games/PROOF26').json()['standings']) == 4
        response = first_context.request.post(base + f'/api/games/{event_id}/phase', data={'phase': 'complete'})
        assert response.status == 401, 'guest cookies must not grant event control'
        passed('Four guest browsers submit to one shared event, preserve identity on reload and cannot control the host')

        phase('judging')
        judge_form = console.locator(f'[data-judge="{judge["id"]}"]')
        assert console.locator('[data-judge]').count() == 1, 'show only the signed-in account assigned judge'
        judge_form.locator('select').select_option(matchup['entryAId'])
        with console.expect_response(lambda r: r.url.endswith('/judge-submit') and r.request.method == 'POST') as judged:
            judge_form.get_by_role('button', name='Save judge choice').click()
        assert judged.value.status == 200, judged.value.text()
        expect(judge_form).to_contain_text('Saved choice: ' + entry_name)
        passed('Assigned judge saves a private tasting choice through the control room')
        assert all(row['totalPoints'] == 0 for row in first_context.request.get(base + '/api/public/games/PROOF26').json()['standings'])
        response = first_context.request.post(base + '/api/public/games/PROOF26/predict',
            data={'matchupId': matchup['id'], 'entryId': matchup['entryBId'], 'kind': 'bracket'})
        assert response.status == 409, 'late predictions must remain closed'
        for revision, (winner, points) in enumerate([(matchup['entryAId'], [2, 1, 1, 0]), (matchup['entryBId'], [1, 2, 0, 1])], start=1):
            result_form = console.locator(f'[data-result="{matchup["id"]}"]')
            result_form.locator('select').select_option(winner)
            with console.expect_response(lambda r: r.url.endswith('/publish-outcome') and r.request.method == 'POST') as published:
                result_form.get_by_role('button').click()
            response = published.value
            assert response.status == 200, response.text()
            expect(result_form).to_have_attribute('data-revision', str(revision))
            if revision == 1:
                phase('results')
            expected = dict(zip(names, points))
            assert {row['name']: row['totalPoints'] for row in response.json()['standings']} == expected
            for context, page, pid in guests:
                for name, total in expected.items():
                    expect(page.locator('#standings > div').filter(has_text=name).locator('b')).to_have_text(str(total) + ' pts')
                assert page.locator('[data-entry-injected], [data-guest-injected]').count() == 0
                expect(page.locator('#standings')).to_contain_text(guest_name)
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'guest page overflow'
            for name, total in expected.items():
                expect(player.locator('#game-leaders')).to_contain_text(f'{name} {total} pt', timeout=12000)
            expect(player.locator('#game-matchups')).to_contain_text('Published winner')
        passed('TV and all four phones agree on bracket plus judge points after publication and a corrected outcome')
        home.screenshot(path=str(out / 'bourbon-games-home-mobile.png'), full_page=True)
        console.screenshot(path=str(out / 'bourbon-games-host-results-mobile.png'), full_page=True)
        player.screenshot(path=str(out / 'bourbon-games-tv-results.png'), full_page=True)
        passed('Guest and entry names containing HTML render as literal text on phones and TV without injected elements')

        phase('complete')
        expect(player.locator('#game-stage')).to_be_hidden(timeout=12000)
        for context, page, pid in guests:
            expect(page.locator('#status')).to_have_text('Final results')
        after = player.evaluate("async()=>{const {get}=await import('/player/offline.mjs');return (await get('kv','manifest')).value;}")
        for key in ['savedMixxId', 'environmentId', 'mix', 'theme', 'playbackMode', 'showQr']:
            assert after[key] == before[key], key + ' changed during the event'
        assert player.locator('#video').evaluate('(v)=>({volume:v.volume,muted:v.muted})') == audio
        wait(player, "!document.getElementById('video').paused&&document.getElementById('video').readyState>=2", timeout=12000)
        expect(player.locator('#qr-box')).to_be_visible()
        passed('Completing the event restores ordinary TV playback, programming and QR with audio preferences intact')
    finally:
        console.close()
        for context in contexts:
            context.close()
