ALTER TABLE tasting_events ADD COLUMN state_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasting_matchups ADD COLUMN predictions_locked_at INTEGER;

CREATE INDEX IF NOT EXISTS tasting_matchups_lock ON tasting_matchups(event_id,predictions_locked_at);
INSERT OR IGNORE INTO migrations VALUES(10,unixepoch()*1000);
