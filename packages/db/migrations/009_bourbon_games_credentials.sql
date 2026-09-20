CREATE TABLE IF NOT EXISTS game_participant_credentials(
 event_id TEXT NOT NULL REFERENCES tasting_events(id) ON DELETE CASCADE,
 credential_hash TEXT NOT NULL,
 participant_id TEXT NOT NULL REFERENCES game_participants(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL,
 revoked_at INTEGER,
 PRIMARY KEY(event_id,credential_hash)
);
CREATE INDEX IF NOT EXISTS game_participant_credentials_participant ON game_participant_credentials(participant_id,event_id,revoked_at);
INSERT OR IGNORE INTO game_participant_credentials(event_id,credential_hash,participant_id,created_at)
 SELECT event_id,identity_hash,id,created_at FROM game_participants
 WHERE identity_hash IS NOT NULL AND identity_hash<>'';
INSERT OR IGNORE INTO migrations VALUES(9,unixepoch()*1000);
