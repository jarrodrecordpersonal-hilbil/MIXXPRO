-- Additive migration. Keep previous events and financial records untouched.
CREATE TABLE venue_locations (
  venue_id TEXT PRIMARY KEY REFERENCES venues(id),
  address TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '', postal_code TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL
);
-- Snapshot the server-issued context once per playback, not the current venue labels.
CREATE TABLE playback_context (
  tv_id TEXT NOT NULL REFERENCES tvs(id), playback_id TEXT NOT NULL,
  venue_id TEXT NOT NULL REFERENCES venues(id),
  manifest_id TEXT NOT NULL REFERENCES manifests(id), content_id TEXT NOT NULL REFERENCES content(id),
  campaign_id TEXT REFERENCES campaigns(id), brand_id TEXT, campaign_name TEXT,
  title TEXT NOT NULL, world TEXT, venue_name TEXT, tv_name TEXT,
  location TEXT, planned_seconds REAL NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0,
  item_index INTEGER, PRIMARY KEY(tv_id,playback_id)
);
ALTER TABLE events ADD COLUMN delivery_source TEXT NOT NULL DEFAULT 'unknown' CHECK(delivery_source IN ('cache','network','unknown'));
ALTER TABLE events ADD COLUMN sequence INTEGER;
CREATE UNIQUE INDEX event_sequence_once ON events(tv_id,playback_id,sequence) WHERE sequence IS NOT NULL;
CREATE INDEX events_playback ON events(tv_id,playback_id,occurred_at);
CREATE INDEX events_time ON events(occurred_at);
CREATE INDEX events_campaign_time ON events(campaign_id,occurred_at);
CREATE INDEX playback_context_venue ON playback_context(venue_id,world);
CREATE INDEX playback_context_brand ON playback_context(brand_id,campaign_id);
INSERT INTO migrations VALUES(3,unixepoch()*1000);
