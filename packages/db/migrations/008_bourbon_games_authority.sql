CREATE TABLE IF NOT EXISTS tasting_event_operators(
 event_id TEXT NOT NULL REFERENCES tasting_events(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(event_id,user_id)
);
CREATE TABLE IF NOT EXISTS tasting_judge_users(
 judge_id TEXT PRIMARY KEY REFERENCES tasting_judges(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tasting_event_operators_user ON tasting_event_operators(user_id,event_id);
CREATE INDEX IF NOT EXISTS tasting_judge_users_user ON tasting_judge_users(user_id,judge_id);
INSERT OR IGNORE INTO migrations VALUES(8,unixepoch()*1000);
