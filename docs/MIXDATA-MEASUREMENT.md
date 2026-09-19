# MIXDATA measurement layer

MIXDATA should distinguish what the system **measures** from what it merely **estimates** or **associates**.

## Evidence streams

### Screen delivery (measured)
Existing MIXXWAVE player telemetry is the primary delivery record: venue, TV, manifest, content, campaign, playback id, event sequence, source (network/cache), rendered playback seconds, player heartbeat and current title.

### Venue traffic (aggregate / estimated)
Traffic connectors may ingest timestamped occupancy or footfall counts from venue-approved sensors or analytics systems. Do not ingest raw faces, biometric templates, persistent Wi-Fi MAC addresses, or other covert device identifiers. Camera sources should produce aggregate counts locally where possible; raw imagery is not required for MIXDATA measurement.

### Commerce (measured from connected POS)
POS connectors should ingest transaction facts with a provider-scoped idempotency key: venue, provider, external order id, opened/closed timestamp, gross/discount/net/tax/tip cents, currency, item SKU/name/category, quantity and line net cents.

A customer identifier is optional. If a venue has a lawful loyalty/customer identifier, hash or pseudonymize it before MIXDATA persistence. Do not require customer identity for sales-lift reporting.

## Analysis

MIXDATA may report:

- delivered playback seconds by content/campaign/TV/venue;
- venue traffic by time bucket;
- sales and units by category/SKU/time bucket;
- QR scans and downstream orders already attributable through MIXXWAVE referral identifiers;
- temporal exposure windows, e.g. sales during and after a content playback;
- repeat-purchase / churn cohorts only where an appropriate pseudonymous customer identifier exists;
- controlled lift experiments when venues/screens are explicitly assigned to treatment and holdout groups.

Simple time-window correlation must be labeled **associated sales**, not causal lift. Causal language requires an experimental or otherwise defensible causal design.

## Retention and access

Keep raw POS transaction identifiers scoped to the venue/provider, minimize retained fields, encrypt provider credentials outside the database, and expose aggregate client reporting by default. Venue administrators should be able to disconnect a connector and understand what historical data remains under the applicable retention policy.
