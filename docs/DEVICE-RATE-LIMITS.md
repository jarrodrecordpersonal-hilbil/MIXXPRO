# Per-device MIXXWAVE request-rate isolation

The first Render pilot has `TRUST_PROXY=false`. With a reverse proxy, the server may see many venues as one direct-peer IP. A generic per-IP limit of 6,000 API calls/minute can block unrelated TVs during a shared-network traffic spike.

Authenticated TV requests for the five existing device endpoints now use a **per-TV** 300 calls/minute limit. This is keyed by the database-verified, unrevoked TV ID, not a client-provided ID. Invalid bearer tokens, pairing, other API operations, and unauthenticated requests keep the general peer-IP limiter.

This is a pilot resilience fix, **not proof that SQLite or a single 512 MB Render instance can run 500 screens**. Database write volume, proxy address attribution, device-heartbeat traffic, WAL growth, load testing and a distributed rate limiter all require a separate measured capacity plan before multi-instance or broad fleet rollout.
