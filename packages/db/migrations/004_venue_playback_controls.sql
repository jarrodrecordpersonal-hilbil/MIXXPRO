CREATE TABLE IF NOT EXISTS saved_mixxes(
  id TEXT PRIMARY KEY,
  venue_id TEXT NOT NULL REFERENCES venues(id),
  name TEXT NOT NULL,
  mix TEXT NOT NULL,
  theme TEXT NOT NULL DEFAULT 'modern-luxury',
  accent TEXT NOT NULL DEFAULT '#c7aa77',
  playback_mode TEXT NOT NULL DEFAULT 'full' CHECK(playback_mode IN ('full','no-ads','clean')),
  show_qr INTEGER NOT NULL DEFAULT 1 CHECK(show_qr IN (0,1)),
  show_venue_promotions INTEGER NOT NULL DEFAULT 1 CHECK(show_venue_promotions IN (0,1)),
  blocked_brands TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS saved_mixxes_venue ON saved_mixxes(venue_id,updated_at);

CREATE TABLE IF NOT EXISTS tv_profiles(
  tv_id TEXT PRIMARY KEY REFERENCES tvs(id) ON DELETE CASCADE,
  saved_mixx_id TEXT REFERENCES saved_mixxes(id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS venue_creatives(
  id TEXT PRIMARY KEY,
  venue_id TEXT NOT NULL REFERENCES venues(id),
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'video' CHECK(kind IN ('video','template-request')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','processing','ready','rejected','expired')),
  asset_url TEXT NOT NULL DEFAULT '',
  starts_at INTEGER,
  ends_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS venue_creatives_venue ON venue_creatives(venue_id,status);

INSERT OR IGNORE INTO migrations VALUES(4,unixepoch()*1000);
