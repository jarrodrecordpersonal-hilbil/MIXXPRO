CREATE TABLE IF NOT EXISTS tasting_events(
 id TEXT PRIMARY KEY,code TEXT NOT NULL UNIQUE,name TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','open','live','final')),
 scoring_version TEXT NOT NULL DEFAULT 'proof-trials-v1',created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tasting_entries(
 id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES tasting_events(id) ON DELETE CASCADE,seed INTEGER NOT NULL,name TEXT NOT NULL,story TEXT NOT NULL DEFAULT '',UNIQUE(event_id,seed)
);
CREATE TABLE IF NOT EXISTS tasting_matchups(
 id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES tasting_events(id) ON DELETE CASCADE,round INTEGER NOT NULL,slot INTEGER NOT NULL,
 entry_a_id TEXT NOT NULL REFERENCES tasting_entries(id),entry_b_id TEXT NOT NULL REFERENCES tasting_entries(id),UNIQUE(event_id,round,slot)
);
CREATE TABLE IF NOT EXISTS tasting_judges(
 id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES tasting_events(id) ON DELETE CASCADE,name TEXT NOT NULL,UNIQUE(event_id,name)
);
CREATE TABLE IF NOT EXISTS tasting_judge_submissions(
 matchup_id TEXT NOT NULL REFERENCES tasting_matchups(id) ON DELETE CASCADE,judge_id TEXT NOT NULL REFERENCES tasting_judges(id) ON DELETE CASCADE,
 winner_entry_id TEXT NOT NULL REFERENCES tasting_entries(id),submitted_at INTEGER NOT NULL,PRIMARY KEY(matchup_id,judge_id)
);
CREATE TABLE IF NOT EXISTS tasting_outcomes(
 matchup_id TEXT PRIMARY KEY REFERENCES tasting_matchups(id) ON DELETE CASCADE,winner_entry_id TEXT NOT NULL REFERENCES tasting_entries(id),
 revision INTEGER NOT NULL DEFAULT 1,published_at INTEGER NOT NULL,corrected_at INTEGER
);
CREATE TABLE IF NOT EXISTS game_participants(
 id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES tasting_events(id) ON DELETE CASCADE,identity_hash TEXT NOT NULL,display_name TEXT NOT NULL,
 created_at INTEGER NOT NULL,last_seen INTEGER NOT NULL,UNIQUE(event_id,identity_hash)
);
CREATE TABLE IF NOT EXISTS game_participation(
 participant_id TEXT NOT NULL REFERENCES game_participants(id) ON DELETE CASCADE,location_kind TEXT NOT NULL CHECK(location_kind IN ('home','venue')),
 venue_id TEXT REFERENCES venues(id),room_key TEXT NOT NULL DEFAULT '',last_seen INTEGER NOT NULL,PRIMARY KEY(participant_id,location_kind,room_key)
);
CREATE TABLE IF NOT EXISTS game_predictions(
 participant_id TEXT NOT NULL REFERENCES game_participants(id) ON DELETE CASCADE,matchup_id TEXT NOT NULL REFERENCES tasting_matchups(id) ON DELETE CASCADE,
 prediction_kind TEXT NOT NULL CHECK(prediction_kind IN ('bracket','judge')),judge_id TEXT NOT NULL DEFAULT '',entry_id TEXT NOT NULL REFERENCES tasting_entries(id),
 submitted_at INTEGER NOT NULL,PRIMARY KEY(participant_id,matchup_id,prediction_kind,judge_id)
);
CREATE TABLE IF NOT EXISTS event_presentations(
 event_id TEXT NOT NULL REFERENCES tasting_events(id) ON DELETE CASCADE,venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
 group_name TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,
 PRIMARY KEY(event_id,venue_id,group_name)
);
CREATE INDEX IF NOT EXISTS game_participant_event ON game_participants(event_id,last_seen);
CREATE INDEX IF NOT EXISTS event_presentations_venue ON event_presentations(venue_id,active,updated_at);
INSERT OR IGNORE INTO migrations VALUES(6,unixepoch()*1000);
