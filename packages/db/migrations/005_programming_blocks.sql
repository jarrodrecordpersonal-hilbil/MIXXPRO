CREATE TABLE IF NOT EXISTS programming_blocks(
  id TEXT PRIMARY KEY,
  venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  saved_mixx_id TEXT REFERENCES saved_mixxes(id) ON DELETE CASCADE,
  mix TEXT NOT NULL,
  items TEXT NOT NULL,
  target_seconds INTEGER NOT NULL DEFAULT 10800,
  duration_seconds INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS programming_blocks_venue ON programming_blocks(venue_id,active,updated_at);
CREATE INDEX IF NOT EXISTS programming_blocks_saved_mixx ON programming_blocks(saved_mixx_id,active,updated_at);

INSERT OR IGNORE INTO migrations VALUES(5,unixepoch()*1000);
