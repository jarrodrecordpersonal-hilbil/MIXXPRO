CREATE UNIQUE INDEX promotion_venue_identity ON promotions(id,venue_id);
CREATE TABLE venue_billboards(
 id TEXT PRIMARY KEY,venue_id TEXT NOT NULL REFERENCES venues(id),
 title TEXT NOT NULL,description TEXT NOT NULL,qr_url TEXT NOT NULL DEFAULT '',
 template_id TEXT NOT NULL DEFAULT '',group_name TEXT NOT NULL DEFAULT '',
 starts_at INTEGER NOT NULL,ends_at INTEGER NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 published_revision INTEGER,published_json TEXT,published_at INTEGER,
 promotion_id TEXT UNIQUE,qr_code TEXT UNIQUE,
 created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,
 CHECK(ends_at>starts_at),
 FOREIGN KEY(promotion_id,venue_id) REFERENCES promotions(id,venue_id)
);
CREATE INDEX venue_billboards_venue ON venue_billboards(venue_id,updated_at);
INSERT INTO migrations VALUES(12,unixepoch()*1000);
