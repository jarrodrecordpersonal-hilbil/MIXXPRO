"""One synthetic Proof Trials event, a paired TV and four independent guests."""
import sqlite3
from playwright.sync_api import expect


def game_checks(browser, owner, player, base, headers, database, out, passed, wait, errors):
    contexts = []
    response = owner.request.post(base + '/api/admin/games/proof-trials-demo', headers=headers, data={})
    assert response.status in (200, 201), response.text()
    event_id = response.json()['id']
    event = owner.request.get(base + '/api/public/games/PROOF26').json()['event']
    matchup, judge = event['matchups'][0], event['judges'][0]
    entry_name = '<i data-entry-injected>Oak</i>'
    guest_name = '<b data-guest-injected>Riley</b>'
    # Disposable fixture only. No API for editing live event entries is assumed.
    with sqlite3.connect(database) as connection:
        connection.execute('UPDATE tasting_entries SET name=? WHERE id=?', (entry_name, matchup['entryAId']))
    before = player.evaluate("async()=>{const {get}=await import('/player/offline.mjs');return (await get('kv','manifest')).value;}")
    audio = player.locator('#video').evaluate('(v)=>({volume:v.volume,muted:v.muted})')
    response = owner.request.post(base + f'/api/games/{event_id}/present', headers=headers, data={'groupName': 'Bar TVs'})
    assert response.status == 200, response.text()

    def phase(name):
        event = owner.request.get(base + '/api/public/games/PROOF26').json()['event']
        response = owner.request.post(base + f'/api/games/{event_id}/phase', headers=headers,
            data={'phase': name, 'matchupId': matchup['id'], 'seconds': 120, 'expectedRevision': event['stateRevision']})
        assert response.status == 200, response.text()

    try:
        wait(player, "!document.getElementById('game-stage').classList.contains('hidden')", timeout=12000)
        expect(player.locator('#game-join')).to_contain_text('PROOF26')
        expect(player.locator('#game-matchups')).to_contain_text(entry_name)
        assert player.locator('[data-entry-injected]').count() == 0
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

        phase('judging')
        response = owner.request.post(base + f'/api/games/{event_id}/judge-submit', headers=headers,
            data={'matchupId': matchup['id'], 'judgeId': judge['id'], 'winnerEntryId': matchup['entryAId']})
        assert response.status == 200, response.text()
        assert all(row['totalPoints'] == 0 for row in first_context.request.get(base + '/api/public/games/PROOF26').json()['standings'])
        response = first_context.request.post(base + '/api/public/games/PROOF26/predict',
            data={'matchupId': matchup['id'], 'entryId': matchup['entryBId'], 'kind': 'bracket'})
        assert response.status == 409, 'late predictions must remain closed'
        for revision, (winner, points) in enumerate([(matchup['entryAId'], [2, 1, 1, 0]), (matchup['entryBId'], [1, 2, 0, 1])], start=1):
            response = owner.request.post(base + f'/api/admin/games/{event_id}/publish-outcome', headers=headers,
                data={'matchupId': matchup['id'], 'winnerEntryId': winner})
            assert response.status == 200, response.text()
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
        for context in contexts:
            context.close()
