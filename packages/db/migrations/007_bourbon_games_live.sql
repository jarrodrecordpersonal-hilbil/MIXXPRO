ALTER TABLE tasting_events ADD COLUMN phase TEXT NOT NULL DEFAULT 'lobby' CHECK(phase IN ('lobby','predictions','judging','results','complete'));
ALTER TABLE tasting_events ADD COLUMN phase_deadline INTEGER;
ALTER TABLE tasting_events ADD COLUMN active_matchup_id TEXT REFERENCES tasting_matchups(id);

CREATE TABLE IF NOT EXISTS game_identity_links(
 code_hash TEXT PRIMARY KEY,participant_id TEXT NOT NULL REFERENCES game_participants(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL,used_at INTEGER
);
CREATE INDEX IF NOT EXISTS game_identity_links_participant ON game_identity_links(participant_id,expires_at);

INSERT OR IGNORE INTO migrations VALUES(7,unixepoch()*1000);
