# RNAV Scholarly Sync 运维说明

Scholarly Sync 只把经审核或符合自动接收策略的成果写入现有 `research_items`；不会抓取 ResearchGate、Google Scholar、PDF、全文或摘要。

## 生产配置

在服务器 Secret Store 或 `/srv/rnav_platform/.env` 配置：

```env
OPENALEX_API_KEY=replace-in-production
SCHOLARLY_SYNC_CONTACT_EMAIL=lab-contact@example.org
SCHOLARLY_SYNC_ENABLED=true
SCHOLARLY_SYNC_OPENALEX_BASE_URL=https://api.openalex.org
SCHOLARLY_SYNC_CROSSREF_BASE_URL=https://api.crossref.org
```

API Key 只能进入服务端环境，不应写进 Git、浏览器响应、审计记录或同步错误摘要。

## 命令

```bash
npm run scholarly:sync
npm run scholarly:backfill
```

`scholarly:sync` 使用 PostgreSQL advisory lock，已有任务运行时会安全跳过。`scholarly:backfill` 只为带 DOI 的现有人工论文绑定 OpenAlex 来源，不修改其展示字段。

## systemd timer

安装 `deploy/systemd/rnav-scholarly-sync.service` 与 `deploy/systemd/rnav-scholarly-sync.timer`，然后执行：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now rnav-scholarly-sync.timer
systemctl list-timers rnav-scholarly-sync.timer
```

## 迁移与回滚

迁移前必须完成 PostgreSQL custom-format 备份，并用 `pg_restore --list` 校验目录可读。Migration 041 只增加表、索引和现有论文 registry 记录，不删除现有论文。

应用回滚时先停用 timer，并将 `SCHOLARLY_SYNC_ENABLED=false`。旧应用可继续忽略新增表运行；不要删除 `scholarly_*` 表。若需要撤销已自动接收的公开论文，应在 CMS 中人工处理并保留 registry 审计关系。
