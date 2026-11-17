# MIXXWAVE SQLite backup and restore safety

This is an operational checklist, not evidence that the live database has been backed up off-host.

1. Confirm the correct persistent `DB_PATH` (on the Render pilot: `/app/data/mixxpro.sqlite`) and healthy live service. The backup helper **refuses missing source files**; it will never silently initialize a fresh database.
2. Run `npm run backup`, or `npm run backup -- /app/data/backups/pilot-YYYYMMDD.sqlite` on the service. The command reads the source database without applying migrations and produces a consistent `VACUUM INTO` archive, validates its SQLite structure and foreign keys, and creates a SHA-256 checksum sidecar. A pre-existing destination is never overwritten.
3. **Transfer both the `.sqlite` and `.sha256` files out of the Render disk** to private restricted storage. Backups left only on the attached disk do not protect against a disk or account incident. This repository does not configure or schedule that transfer.
4. On a separate isolated machine, compare `sha256sum -c pilot-YYYYMMDD.sqlite.sha256` from the archive directory; open the copy with SQLite and run `PRAGMA integrity_check;`, `PRAGMA foreign_key_check;` and verify a few known records. Never run a restore over a live instance as a test.
5. Document the last completed off-host restore test, storage owner, retention, encryption and access controls before a commercial rollout.

**Important:** A successful backup of a pilot database does not prove the ability to restore a fleet or serve multiple Render instances. The 5 GB disk and single SQLite writer remain pilot limitations. Keep the service deployment and disk recovery plan separate from local browser media caching.
