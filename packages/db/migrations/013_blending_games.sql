-- Additive extension. Existing player identity, events, predictions and scoring are reused.
CREATE TABLE blend_seasons (
 id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 components TEXT NOT NULL, stage_rules TEXT NOT NULL, is_test INTEGER NOT NULL DEFAULT 0 CHECK(is_test IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE TABLE blend_batches (
 id TEXT PRIMARY KEY, season_id TEXT NOT NULL REFERENCES blend_seasons(id), name TEXT NOT NULL,
 stage TEXT NOT NULL CHECK(stage IN ('round1','round2','last-chance','final')),
 closes_at INTEGER NOT NULL, slots INTEGER NOT NULL CHECK(slots BETWEEN 0 AND 20),
 capacity INTEGER NOT NULL DEFAULT 48 CHECK(capacity BETWEEN 2 AND 100),
 judges TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'accepting' CHECK(status IN ('accepting','prepared','complete')),
 event_id TEXT UNIQUE REFERENCES tasting_events(id), resolution_note TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE INDEX blend_batch_intake ON blend_batches(season_id,status,closes_at);
CREATE TABLE blend_teams (
 id TEXT PRIMARY KEY, season_id TEXT NOT NULL REFERENCES blend_seasons(id), owner_user_id TEXT NOT NULL REFERENCES users(id),
 name TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(season_id,owner_user_id)
);
CREATE TABLE blend_recipes (
 id TEXT PRIMARY KEY, season_id TEXT NOT NULL REFERENCES blend_seasons(id), team_id TEXT NOT NULL REFERENCES blend_teams(id),
 batch_id TEXT REFERENCES blend_batches(id), blend_name TEXT NOT NULL, recipe TEXT NOT NULL, components_snapshot TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','queued')),
 entry_id TEXT UNIQUE REFERENCES tasting_entries(id), revision INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL, submitted_at INTEGER, UNIQUE(team_id,batch_id)
);
CREATE UNIQUE INDEX blend_one_open_draft ON blend_recipes(team_id) WHERE status='draft';
CREATE UNIQUE INDEX blend_one_queued_entry ON blend_recipes(team_id) WHERE status='queued';
CREATE TABLE blend_scorecards (
 entry_id TEXT NOT NULL REFERENCES tasting_entries(id), judge_id TEXT NOT NULL REFERENCES tasting_judges(id),
 aroma INTEGER NOT NULL CHECK(aroma BETWEEN 0 AND 25), palate INTEGER NOT NULL CHECK(palate BETWEEN 0 AND 25),
 balance INTEGER NOT NULL CHECK(balance BETWEEN 0 AND 25), finish INTEGER NOT NULL CHECK(finish BETWEEN 0 AND 25),
 notes TEXT NOT NULL DEFAULT '', locked_at INTEGER, revision INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(entry_id,judge_id)
);
CREATE TRIGGER blend_locked_scorecard_update BEFORE UPDATE ON blend_scorecards
 WHEN OLD.locked_at IS NOT NULL BEGIN SELECT RAISE(ABORT,'Locked blind scorecards cannot change'); END;
CREATE TRIGGER blend_locked_scorecard_delete BEFORE DELETE ON blend_scorecards
 WHEN OLD.locked_at IS NOT NULL BEGIN SELECT RAISE(ABORT,'Locked blind scorecards cannot be deleted'); END;
CREATE TABLE blend_qualifications (
 season_id TEXT NOT NULL REFERENCES blend_seasons(id), team_id TEXT NOT NULL REFERENCES blend_teams(id),
 batch_id TEXT NOT NULL REFERENCES blend_batches(id), awarded_at INTEGER NOT NULL,
 PRIMARY KEY(season_id,team_id)
);
INSERT INTO migrations VALUES(13,unixepoch()*1000);
