# RNAV Unified Platform

RNAV 课题组统一网站与内部业务平台。项目将公开网站、统一账号、实验室资产、机器人监控和零件采购合并为一个代码库、一个 PostgreSQL 数据库和一个 Node 服务。

## Routes

- Public: `/`, `/research`, `/team`, `/news`, `/facilities`, `/contact`, `/monitor`
- Internal: `/console`, `/console/lab-assets`, `/console/monitor`, `/console/procurements`
- API: `/api/auth`, `/api/public`, `/api/console`, `/api/lab-assets`, `/api/monitor`, `/api/procurements`, `/api/scholarly-sync`
- Realtime: `/ws` for public monitor data and `/ws/console` for device readers

`/admin` is retired and redirects to `/console/site`. The legacy `/lab-assets` route redirects to `/console/lab-assets`.

## Accounts

- `normal`: base member permissions, including own profile, internal asset reading, and own procurement requests.
- `plus`: derived when a normal account receives one or more advanced permission attributes.
- `super`: receives every known permission.

Advanced permissions remain granular, for example `monitor.devices.write`, `procurements.review`, and `site.members.write`.

## Development

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run dev:server
```

The unified server embeds Next.js, Express APIs, and monitor WebSockets on `http://127.0.0.1:4090`.

## Verification

```bash
npm test
npm run lint
npm run build
```

## Legacy Migration

Source databases are read-only during export. Never import into production before staging verification.

```bash
npm run db:export-legacy -- \
  --website-db "$LEGACY_WEBSITE_DATABASE_URL" \
  --monitor-db "$LEGACY_MONITOR_DATABASE_URL" \
  --out backups/production-export

npm run db:migrate-legacy -- \
  --in backups/production-export \
  --username-map scripts/db/username-map.json

npm run db:import-legacy -- \
  --in backups/production-export/transformed \
  --target-db "$DATABASE_URL" \
  --dry-run

npm run db:verify-migration -- \
  --in backups/production-export/transformed \
  --target-db "$DATABASE_URL"
```

完整的 staging 演练、生产数据导出、账号准备、systemd 部署、nginx 切换、验收与回滚步骤见 [`docs/cutover-runbook.md`](docs/cutover-runbook.md)。

## Scholarly Sync

OpenAlex 负责论文发现，Crossref 负责 DOI 元数据校准，公开站仍只读取 `research_items`。配置、手动同步、定时任务与回滚说明见 [`docs/scholarly-sync-operations.md`](docs/scholarly-sync-operations.md)。
