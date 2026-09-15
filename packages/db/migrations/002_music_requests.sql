CREATE TABLE IF NOT EXISTS music_requests (
  id TEXT PRIMARY KEY,
  venue_id TEXT NOT NULL REFERENCES venues(id),
  payer TEXT NOT NULL CHECK(payer IN ('venue','sponsor')),
  zones INTEGER NOT NULL CHECK(zones BETWEEN 1 AND 20),
  sponsor_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','approved','declined','cancelled')),
  provider TEXT NOT NULL DEFAULT '',
  funding_reference TEXT NOT NULL DEFAULT '',
  license_reference TEXT NOT NULL DEFAULT '',
  valid_until INTEGER,
  reviewed_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK(status!='approved' OR (provider!='' AND funding_reference!='' AND license_reference!='' AND valid_until IS NOT NULL AND reviewed_by IS NOT NULL AND (payer!='sponsor' OR sponsor_name!='')))
);
CREATE UNIQUE INDEX IF NOT EXISTS music_one_open_request ON music_requests(venue_id) WHERE status IN ('requested','approved');
INSERT OR IGNORE INTO migrations VALUES(2,unixepoch()*1000);
