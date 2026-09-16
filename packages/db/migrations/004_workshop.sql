CREATE TABLE IF NOT EXISTS workshop_blocks(
  id TEXT PRIMARY KEY,
  venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  definition TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS workshop_blocks_venue ON workshop_blocks(venue_id,updated_at DESC);
INSERT OR IGNORE INTO migrations VALUES(4,unixepoch()*1000);
