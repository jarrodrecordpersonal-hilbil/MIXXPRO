CREATE TABLE IF NOT EXISTS curated_environments(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  mix TEXT NOT NULL,
  theme TEXT NOT NULL DEFAULT 'modern-luxury',
  accent TEXT NOT NULL DEFAULT '#c7aa77',
  playback_mode TEXT NOT NULL DEFAULT 'full' CHECK(playback_mode IN ('full','no-ads','clean')),
  show_qr INTEGER NOT NULL DEFAULT 1 CHECK(show_qr IN (0,1)),
  show_venue_promotions INTEGER NOT NULL DEFAULT 1 CHECK(show_venue_promotions IN (0,1)),
  blocked_brands TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','withdrawn')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS curated_environments_status ON curated_environments(status,updated_at);

CREATE TABLE IF NOT EXISTS tv_environments(
  tv_id TEXT PRIMARY KEY REFERENCES tvs(id) ON DELETE CASCADE,
  environment_id TEXT REFERENCES curated_environments(id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO migrations VALUES(5,unixepoch()*1000);
