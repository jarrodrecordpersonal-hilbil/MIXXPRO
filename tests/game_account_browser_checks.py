"""Disposable account and five-player store roster through real guest/host UIs."""
import sqlite3
import time
from playwright.sync_api import expect


def account_game_checks(browser, owner, player, base, headers, database, out, passed, wait, errors, nav):
    event_id, match_id, judge_id = 'account-browser-event', 'account-browser-match', 'account-browser-judge'
    entry_a, entry_b = 'account-browser-oak', 'account-browser-river'
    user_id = owner.request.get(base + '/api/session').json()['user']['id']
    stamp = int(time.time() * 1000)
    with sqlite3.connect(database) as db:
        db.execute("INSERT INTO tasting_events(id,code,name,status,created_at,updated_at) VALUES(?,?,?,'open',?,?)", (event_id, 'ACCOUNTQA', 'The Store Showdown', stamp, stamp))
        for entry, name, seed in [(entry_a, 'Oak & Ember', 1), (entry_b, 'River Proof', 2)]:
            db.execute('INSERT INTO tasting_entries(id,event_id,seed,name) VALUES(?,?,?,?)', (entry, event_id, seed, name))
        db.execute('INSERT INTO tasting_matchups(id,event_id,round,slot,entry_a_id,entry_b_id) VALUES(?,?,1,1,?,?)', (match_id, event_id, entry_a, entry_b))
        db.execute('INSERT INTO tasting_judges(id,event_id,name) VALUES(?,?,?)', (judge_id, event_id, 'Judge Rowan'))
        db.execute('INSERT INTO tasting_event_operators VALUES(?,?,?)', (event_id, user_id, stamp))
        db.execute('INSERT INTO tasting_judge_users VALUES(?,?,?)', (judge_id, user_id, stamp))
        db.execute('INSERT INTO game_team_rules(event_id,team_size) VALUES(?,5)', (event_id,))
    host, contexts = owner.new_page(), []
    host.on('pageerror', lambda error: errors.append(str(error)))
    host.on('dialog', lambda dialog: dialog.accept())
    try:
        host.goto(base)
        host.locator('[data-page="games"]').first.wait_for(state='attached')
        nav(host, 'games')
        expect(host.locator('[data-host-status]')).to_have_text('Up to date.')
        if host.locator('[data-host-event]').input_value() != event_id:
            host.locator('[data-host-event]').select_option(event_id)
        expect(host.locator('[data-host-phase]')).to_have_text('Lobby')
        host.get_by_label('TV group', exact=True).select_option('Bar TVs')
        host.get_by_role('button', name='Show event on TVs', exact=True).click()
        expect(player.locator('#game-name')).to_have_text('The Store Showdown', timeout=12000)
        venue_code = player.locator('#game-qr').get_attribute('src').split('/')[-1].removesuffix('.svg')
        players = []
        password = 'browser-player-password-2026'
        for index in range(5):
            context = browser.new_context(viewport={'width': 390, 'height': 844})
            contexts.append(context)
            page = context.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(base + '/games/ACCOUNTQA?v=' + venue_code)
            page.get_by_label('Your display name', exact=True).fill('Store Player ' + str(index + 1))
            page.locator('#join-form button[type="submit"]').click()
            expect(page.locator('#play')).to_be_visible()
            participant_id = context.request.get(base + '/api/public/games/ACCOUNTQA').json()['participant']['id']
            page.locator('#account-summary').click()
            page.locator('#account-mode').select_option('register')
            page.get_by_label('Account email', exact=True).fill(f'store-player-{index}@example.test')
            page.get_by_label('Account password', exact=True).fill(password)
            page.get_by_role('button', name='Create account', exact=True).click()
            expect(page.locator('#account-status')).to_contain_text(f'store-player-{index}@example.test')
            page.get_by_role('button', name='Save this player to my account', exact=True).click()
            expect(page.locator('#account-status')).to_contain_text('picks are saved')
            assert context.request.get(base + '/api/public/games/ACCOUNTQA').json()['participant']['id'] == participant_id
            assert context.request.get(base + '/api/session').json()['venues'] == []
            page.locator('#team-join').click()
            expect(page.locator('#my-team')).to_contain_text('Your store:')
            page.locator('#account-summary').click()
            players.append((context, page, participant_id))
        first_context, first, participant_id = players[0]
        expect(first.locator('#team-standings')).to_contain_text('5/5 players')
        expect(player.locator('#game-team-leaders')).to_contain_text('5/5', timeout=12000)
        assert first.evaluate('document.documentElement.scrollWidth<=innerWidth')
        first.locator('#team-details summary').click()
        first.screenshot(path=str(out / 'game-account-store-roster-mobile.png'), full_page=True)
        passed('Five guests create consumer accounts without venues, save their existing players and fill one fixed store roster through the phone UI')

        remote_context = browser.new_context(viewport={'width': 390, 'height': 844})
        contexts.append(remote_context)
        remote = remote_context.new_page()
        remote.on('pageerror', lambda error: errors.append(str(error)))
        remote.goto(base + '/games/ACCOUNTQA')
        remote.locator('#account-summary').click()
        remote.get_by_label('Account email', exact=True).fill('store-player-0@example.test')
        remote.get_by_label('Account password', exact=True).fill(password)
        remote.get_by_role('button', name='Sign in', exact=True).click()
        expect(remote.locator('#my-team')).to_contain_text('Your store:')
        assert remote_context.request.get(base + '/api/public/games/ACCOUNTQA').json()['participant']['id'] == participant_id
        with sqlite3.connect(database) as db:
            assert db.execute('SELECT COUNT(*) FROM game_participants WHERE event_id=?', (event_id,)).fetchone()[0] == 5
            assert db.execute('SELECT COUNT(*) FROM game_team_memberships WHERE event_id=?', (event_id,)).fetchone()[0] == 5
        passed('Signing in on a fresh device restores the same player and store without adding a participant or roster slot')

        host.get_by_label('Next matchup', exact=True).select_option(match_id)
        host.get_by_label('Prediction window', exact=True).select_option('120')
        host.get_by_role('button', name='Open predictions', exact=True).click()
        expect(host.locator('[data-host-phase]')).to_have_text('Predictions open')
        for context, page, pid in players:
            expect(page.locator('#my-team')).to_contain_text('Roster locked.')
            for kind in ['bracket', 'judge']:
                button = page.locator(f'[data-kind="{kind}"][data-entry="{entry_a}"]')
                expect(button).to_be_enabled()
                button.click()
                expect(button).to_have_attribute('aria-pressed', 'true')
        remote.reload()
        expect(remote.locator(f'[data-kind="bracket"][data-entry="{entry_a}"]')).to_have_attribute('aria-pressed', 'true')
        host.get_by_role('button', name='Close predictions & start judging', exact=True).click()
        expect(host.locator('[data-host-phase]')).to_have_text('Judging')
        host.get_by_label('Judge Rowan winner', exact=True).select_option(entry_a)
        host.get_by_role('button', name='Submit judge choice', exact=True).click()
        expect(host.locator('[data-host-judge-saved]')).to_contain_text('Oak & Ember')
        assert first_context.request.get(base + '/api/public/games/ACCOUNTQA').json()['teams'][0]['points'] == 0
        for revision, winner, personal, team in [(0, entry_a, 2, 10), (1, entry_b, 1, 5)]:
            card = host.locator(f'[data-host-matchup="{match_id}"]')
            card.get_by_label('Matchup winner' if revision == 0 else 'Corrected winner', exact=True).select_option(winner)
            card.get_by_role('button', name='Publish winner' if revision == 0 else 'Publish correction', exact=True).click()
            expect(card).to_contain_text('Result ' + str(revision + 1))
            if revision == 0:
                host.get_by_role('button', name='Close judging & show results', exact=True).click()
            for context, page, pid in players:
                expect(page.locator('#my-score')).to_have_text(f'{personal} pts')
                expect(page.locator('#team-standings [data-self] b')).to_have_text(f'{team} pts')
            expect(remote.locator('#my-score')).to_have_text(f'{personal} pts')
            expect(player.locator('#game-team-leaders')).to_contain_text(f'{team} pts', timeout=12000)
        first.screenshot(path=str(out / 'game-account-team-results-mobile.png'), full_page=True)
        player.screenshot(path=str(out / 'game-account-team-results-tv.png'), full_page=True)
        assert 'example.test' not in player.locator('#game-stage').inner_text()
        passed('Locked store totals and personal points agree on every phone and TV after publication and correction, without exposing account emails')

        first.locator('#account-summary').click()
        first.get_by_role('button', name='My games', exact=True).click()
        expect(first.locator('#account-games')).to_contain_text('The Store Showdown')
        expect(first.locator('#account-games')).to_contain_text('1 pts')
        first.get_by_role('button', name='Sign out', exact=True).click()
        expect(first.locator('#join')).to_be_visible()
        assert first.locator('[data-pick]').count() == 0
        assert first_context.request.get(base + '/api/public/games/ACCOUNTQA').json()['predictions'] == []
        first.get_by_label('Account email', exact=True).fill('store-player-0@example.test')
        first.get_by_label('Account password', exact=True).fill(password)
        first.locator('#account-mode').select_option('login')
        first.get_by_role('button', name='Sign in', exact=True).click()
        expect(first.locator('#my-score')).to_have_text('1 pts')
        expect(first.locator('#my-team')).to_contain_text('Roster locked.')
        first.locator('#account-signed details summary').click()
        first.get_by_label('Current password', exact=True).fill(password)
        first.get_by_label('New password', exact=True).fill('updated-browser-password-2026')
        first.get_by_role('button', name='Update password', exact=True).click()
        expect(first.locator('#feedback')).to_contain_text('Password updated.')
        expect(remote.locator('#join')).to_be_visible(timeout=12000)
        assert remote_context.request.get(base + '/api/public/games/ACCOUNTQA').json()['predictions'] == []
        passed('Account history retains points, sign-out protects private picks, and changing a password signs out the other device')

        host.get_by_role('button', name='End event', exact=True).click()
        expect(player.locator('#game-stage')).to_be_hidden(timeout=12000)
        wait(player, "!document.getElementById('video').paused&&document.getElementById('video').readyState>=2", timeout=12000)
        expect(first.locator('#status')).to_have_text('Final results')
        passed('The account/team event ends normally and restores the paired TV to ordinary playback')
    except Exception:
        host.screenshot(path=str(out / 'game-account-host-failure.png'), full_page=True)
        for index, context in enumerate(contexts):
            if context.pages:
                context.pages[0].screenshot(path=str(out / f'game-account-phone-failure-{index}.png'), full_page=True)
        raise
    finally:
        host.close()
        for context in contexts:
            context.close()
