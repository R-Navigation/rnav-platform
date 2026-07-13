# RNAV Unified Platform Cutover Runbook

## Current Production Inventory

Read-only inventory captured on 2026-07-13 from `ubuntu@82.156.156.43`:

- nginx currently serves static `rnav_website`, proxies its API to `127.0.0.1:4090`, and separately mounts monitor routes.
- PostgreSQL 14 contains `rnav_site` and `rnav_monitor`.
- `rnav_site`: 20 team members, 23 media assets, 14 lab platforms, 75 lab assets, 72 asset notes.
- `rnav_monitor`: 3 devices, 3136 telemetry rows, 145 events, 1 alert, 1 legacy monitor user.

Treat these numbers as a dated baseline, not final cutover counts.

## Safety Rules

1. Do not run migrations or imports against either legacy production database.
2. Export with read-only, repeatable-read transactions.
3. Keep backups and transformed output outside Git under `backups/`.
4. Import into a new staging database first.
5. Review username mapping and `conflicts.json` before import.
6. Preserve the old services and databases until the rollback window closes.

## Staging Rehearsal

1. Confirm old website and monitor services are healthy.
2. Create a timestamped export directory.
3. Export both production databases through local SSH tunnels or server-side URLs.
4. Run the transformation using a reviewed `scripts/db/username-map.json`.
5. Inspect `transformed/conflicts.json` and confirm merged administrator accounts.
6. Create an empty `rnav_platform_staging` database.
7. Run `npm run db:migrate` against staging.
8. Run the importer with `--dry-run`, then without it after reviewing planned counts.
9. Run `db:verify-migration` and require every count to pass.
10. Start the unified service against staging.
11. Verify `/`, `/monitor`, `/console`, `/console/lab-assets`, and `/console/procurements`.
12. Verify public and authenticated WebSocket connections.
13. Verify device ingest using a test device token before production cutover.

## Production Export

The SSH key is local at `~/.ssh/my_server`. A safe approach is to create two local read-only tunnels and run the exporter locally, or execute `pg_dump`/JSON export on the server and download the result. Do not expose PostgreSQL publicly.

Example server-side SQL backups before JSON migration:

```bash
ssh -i ~/.ssh/my_server ubuntu@82.156.156.43 \
  'sudo -u postgres pg_dump --format=custom --no-owner --file=/tmp/rnav_site.dump rnav_site && \
   sudo -u postgres pg_dump --format=custom --no-owner --file=/tmp/rnav_monitor.dump rnav_monitor'
```

Copy backups off the server immediately and verify checksums. These dumps are rollback artifacts; the JSON exporter remains the source for transformation.

## Final Cutover

1. Announce a write freeze for website administration, monitor administration, and asset management.
2. Stop device ingest briefly or buffer device messages at the sender.
3. Run the final source export.
4. Transform with the approved username map.
5. Import into the production unified database and run verification.
6. Start the unified Node service on `127.0.0.1:4090`.
7. Confirm `GET /api/health`, public pages, login, console modules, monitor, procurement, and WebSockets.
8. Back up the current nginx file.
9. Install `deploy/nginx/rnav`, run `sudo nginx -t`, then reload nginx.
10. Resume device ingest and internal writes.
11. Monitor application logs, PostgreSQL errors, login failures, WebSocket clients, and offline alerts.

The target nginx configuration contains only one application `location /`, which proxies HTTP and WebSocket traffic to the unified service.

## Rollback

1. Stop the unified service.
2. Restore the previous nginx configuration and reload nginx.
3. Restart the old website and monitor services.
4. Point device ingest back to the legacy monitor endpoint.
5. Keep the unified database for diagnosis; do not overwrite the legacy databases with it.
6. Record any writes accepted during the cutover window before scheduling another migration.

## Acceptance Checklist

- Public website content and media counts match.
- All 20+ members can authenticate with the intended unified account.
- `normal`, `plus`, and `super` console module sets are correct.
- Internal asset data is unavailable to visitors.
- Public monitor payloads contain no internal UUID, serial number, metadata, or token hash.
- Settings-only monitor administrators receive no internal device stream.
- Procurement requesters cannot review their own requests.
- Device ingest and public/console WebSocket audiences work through nginx.
