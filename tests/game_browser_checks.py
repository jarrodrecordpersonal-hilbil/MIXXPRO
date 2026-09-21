"""One synthetic Proof Trials event, a paired TV and four independent guests."""
import sqlite3
from playwright.sync_api import expect


def game_checks(browser, owner, player, base, headers, database, out, passed, wait, errors, nav):
    contexts = []
    host = owner.new_page()
    host.on('pageerror', lambda error: errors.append(str(error)))
    host.on('dialog', lambda dialog: dialog.accept())
    second_host = None
    host.goto(base)
    host.locator('[data-page="games"]').first.wait_for(state='attached')
    nav(host, 'games')
    expect(host.locator('[data-host-status]')).to_have_text('Up to date.')
    host.get_by_role('button', name='Open fictional demo', exact=True).click()
    expect(host.locator('[data-host-phase]')).to_have_text('Lobby')
    event = owner.request.get(base + '/api/public/games/PROOF26').json()['event']
    event_id = event['id']
    matchup, judge = event['matchups'][0], event['judges'][0]
    entry_name = '<i data-entry-injected>Oak</i>'
    guest_name = '<b data-guest-injected>Riley</b>'
    # Disposable fixture only. No API for editing live event entries is assumed.
    with sqlite3.connect(database) as connection:
        connection.execute('UPDATE tasting_entries SET name=? WHERE id=?', (entry_name, matchup['entryAId']))
    host.get_by_role('button', name='Refresh', exact=True).click()
    expect(host.get_by_label('Next matchup')).to_contain_text(entry_name)
    before = player.evaluate("async()=>{const {get}=await import('/player/offline.mjs');return (await get('kv','manifest')).value;}")
    audio = player.locator('#video').evaluate('(v)=>({volume:v.volume,muted:v.muted})')

    def present():
        host.get_by_label('TV group', exact=True).select_option('Bar TVs')
        host.get_by_role('button', name='Show event on TVs', exact=True).click()
        expect(host.locator('[data-host-status]')).to_contain_text('Presentation requested')

    def phase(name):
        labels = {'predictions': 'Open predictions', 'judging': 'Close predictions & start judging',
                  'results': 'Close judging & show results', 'complete': 'End event'}
        if name == 'predictions':
            host.get_by_label('Next matchup', exact=True).select_option(matchup['id'])
            host.get_by_label('Prediction window', exact=True).select_option('120')
        with host.expect_response(lambda r: r.url.endswith('/phase') and r.request.method == 'POST') as accepted:
            host.get_by_role('button', name=labels[name], exact=True).click()
        assert accepted.value.status == 200, accepted.value.text()
        expect(host.locator('[data-host-phase]')).to_have_text({'predictions': 'Predictions open', 'judging': 'Judging', 'results': 'Results', 'complete': 'Complete'}[name])

    present()
    try:
        wait(player, "!document.getElementById('game-stage').classList.contains('hidden')", timeout=12000)
        expect(player.locator('#game-join')).to_contain_text('PROOF26')
        expect(player.locator('#game-matchups')).to_contain_text(entry_name)
        assert player.locator('[data-entry-injected]').count() == 0
        host.get_by_role('button', name='Stop showing', exact=True).click()
        expect(player.locator('#game-stage')).to_be_hidden(timeout=12000)
        assert owner.request.get(base + '/api/public/games/PROOF26').json()['event']['status'] == 'open'
        present()
        expect(player.locator('#game-stage')).to_be_visible(timeout=12000)
        passed('Host opens the fictional demo, presents it to a TV group and stops presentation without ending the shared event')
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

        second_host = owner.new_page()
        second_host.on('pageerror', lambda error: errors.append(str(error)))
        second_host.goto(base)
        second_host.locator('[data-page="games"]').first.wait_for(state='attached')
        nav(second_host, 'games')
        expect(second_host.locator('[data-host-phase]')).to_have_text('Predictions open')
        # Keep a choice focused so the second tab preserves its reviewed revision.
        second_host.get_by_role('button', name='Close predictions & start judging', exact=True).focus()
        phase('judging')
        with second_host.expect_response(lambda r: r.url.endswith('/phase') and r.request.method == 'POST') as conflict:
            second_host.get_by_role('button', name='Close predictions & start judging', exact=True).click()
        assert conflict.value.status == 409
        expect(second_host.locator('[data-host-status]')).to_contain_text('Your action was not applied')
        expect(second_host.locator('[data-host-phase]')).to_have_text('Judging')
        assert owner.request.get(base + '/api/public/games/PROOF26').json()['event']['phase'] == 'judging'
        second_host.close()
        second_host = None
        passed('A stale host tab cannot overwrite the current phase and refreshes with an explicit conflict message')

        host.route('**/api/games', lambda route: route.abort())
        host.get_by_role('button', name='Refresh', exact=True).click()
        expect(host.locator('[data-host-status]')).to_contain_text('Connection interrupted')
        expect(host.get_by_role('button', name='End event', exact=True)).to_be_disabled()
        host.unroute('**/api/games')
        host.get_by_role('button', name='Refresh', exact=True).click()
        expect(host.locator('[data-host-status]')).to_have_text('Up to date.')
        expect(host.get_by_role('button', name='End event', exact=True)).to_be_enabled()
        host.get_by_label(judge['name'] + ' winner', exact=True).select_option(matchup['entryAId'])
        host.get_by_role('button', name='Submit judge choice', exact=True).click()
        expect(host.locator('[data-host-judge-saved]')).to_contain_text(entry_name)
        passed('Host connection failures disable mutations until refresh; the assigned judge submits a choice through the UI')
        assert all(row['totalPoints'] == 0 for row in first_context.request.get(base + '/api/public/games/PROOF26').json()['standings'])
        response = first_context.request.post(base + '/api/public/games/PROOF26/predict',
            data={'matchupId': matchup['id'], 'entryId': matchup['entryBId'], 'kind': 'bracket'})
        assert response.status == 409, 'late predictions must remain closed'
        for revision, (winner, points) in enumerate([(matchup['entryAId'], [2, 1, 1, 0]), (matchup['entryBId'], [1, 2, 0, 1])], start=1):
            result_card = host.locator(f'[data-host-matchup="{matchup["id"]}"]')
            result_card.get_by_label('Matchup winner' if revision == 1 else 'Corrected winner', exact=True).select_option(winner)
            with host.expect_response(lambda r: r.url.endswith('/publish-outcome') and r.request.method == 'POST') as accepted:
                result_card.get_by_role('button', name='Publish winner' if revision == 1 else 'Publish correction', exact=True).click()
            assert accepted.value.status == 200, accepted.value.text()
            expect(result_card).to_contain_text('Result ' + str(revision))
            if revision == 1:
                phase('results')
            expected = dict(zip(names, points))
            assert {row['name']: row['totalPoints'] for row in accepted.value.json()['standings']} == expected
            for context, page, pid in guests:
                for name, total in expected.items():
                    expect(page.locator('#standings > div').filter(has_text=name).locator('b')).to_have_text(str(total) + ' pts')
                assert page.locator('[data-entry-injected], [data-guest-injected]').count() == 0
                expect(page.locator('#standings')).to_contain_text(guest_name)
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'guest page overflow'
            for name, total in expected.items():
                expect(player.locator('#game-leaders')).to_contain_text(f'{name} {total} pt', timeout=12000)
            expect(player.locator('#game-matchups')).to_contain_text('Published winner')
        host.screenshot(path=str(out / 'bourbon-games-host-desktop.png'), full_page=True)
        host.set_viewport_size({'width': 390, 'height': 844})
        assert host.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'host page overflow'
        assert host.locator('[data-entry-injected], [data-guest-injected]').count() == 0
        host.screenshot(path=str(out / 'bourbon-games-host-mobile.png'), full_page=True)
        passed('Host publishes and corrects results through the app; desktop and 390px controls render names as literal text')
        passed('TV and all four phones agree on bracket plus judge points after publication and a corrected outcome')
        home.screenshot(path=str(out / 'bourbon-games-home-mobile.png'), full_page=True)
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
    except Exception:
        host.screenshot(path=str(out / 'bourbon-games-host-failure.png'), full_page=True)
        print('Host status:', host.locator('[data-host-status]').all_text_contents(), flush=True)
        raise
    finally:
        host.close()
        if second_host:
            second_host.close()
        for context in contexts:
            context.close()
