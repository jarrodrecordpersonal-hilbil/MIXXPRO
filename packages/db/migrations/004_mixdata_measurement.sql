CREATE TABLE IF NOT EXISTS venue_traffic(
  id TEXT PRIMARY KEY,
  venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  external_key TEXT NOT NULL,
  bucket_start INTEGER NOT NULL,
  bucket_end INTEGER NOT NULL,
  present_count INTEGER,
  entries INTEGER,
  exits INTEGER,
  avg_dwell_seconds INTEGER,
  returning_count INTEGER,
  confidence REAL,
  created_at INTEGER NOT NULL,
  UNIQUE(venue_id,provider,external_key)
);
CREATE INDEX IF NOT EXISTS venue_traffic_time ON venue_traffic(venue_id,bucket_start);

CREATE TABLE IF NOT EXISTS pos_orders(
  id TEXT PRIMARY KEY,
  venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  external_order_id TEXT NOT NULL,
  customer_hash TEXT,
  opened_at INTEGER,
  closed_at INTEGER NOT NULL,
  gross_cents INTEGER NOT NULL DEFAULT 0,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  net_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  tip_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at INTEGER NOT NULL,
  UNIQUE(venue_id,provider,external_order_id)
);
CREATE INDEX IF NOT EXISTS pos_orders_time ON pos_orders(venue_id,closed_at);
CREATE INDEX IF NOT EXISTS pos_orders_customer ON pos_orders(venue_id,customer_hash,closed_at);

CREATE TABLE IF NOT EXISTS pos_items(
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES pos_orders(id) ON DELETE CASCADE,
  external_line_id TEXT,
  sku TEXT,
  name TEXT NOT NULL,
  category TEXT,
  quantity REAL NOT NULL DEFAULT 1,
  net_cents INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS pos_items_order ON pos_items(order_id);
CREATE INDEX IF NOT EXISTS pos_items_sku ON pos_items(sku);

CREATE TABLE IF NOT EXISTS measurement_connectors(
  id TEXT PRIMARY KEY,
  venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('pos','wifi','traffic','loyalty')),
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','connected','disabled','error')),
  config_ref TEXT,
  last_sync_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(venue_id,kind,provider)
);

INSERT OR IGNORE INTO migrations VALUES(4,unixepoch()*1000);
