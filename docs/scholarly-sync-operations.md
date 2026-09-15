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
npm run scholarly:reset-member -- --user <USER_ID> --dry-run
npm run scholarly:reset-member -- --user <USER_ID> --execute --confirm <USERNAME>
```

`scholarly:sync` 使用 PostgreSQL advisory lock，已有任务运行时会安全跳过。`scholarly:backfill` 只为带 DOI 的现有人工论文绑定 OpenAlex 来源，不修改其展示字段。

`scholarly:reset-member` 仅用于清理成员错误的首次同步。执行前必须完成 custom-format 备份、用 `pg_restore --list` 验证备份，并暂停 timer。脚本默认 dry-run；正式执行还必须输入当前账号名。它会保留成员 ORCID/OpenAlex 已验证身份、同步运行历史、审计历史、人工论文、共享论文和首页重点论文；遇到可能伤及这些数据的情况会直接阻止执行。脚本完成后保持该成员 `sync_enabled=false`，不要自动重新同步。

## Provider 状态与额度

CMS 的论文自动同步面板显示 OpenAlex 的真实健康状态、服务端 Key 配置状态、最近一次检测、剩余额度、本次 credits 消耗和额度重置时间。“检测状态”最多每 60 秒请求一次 OpenAlex；页面加载不会自动轮询，也不会将 API Key 返回浏览器。

状态会区分 Key 缺失、鉴权失败、额度耗尽、频率限制、超时和上游服务异常。限额是 credits/budget，不要在文案或告警中换算为固定请求次数；不同端点的消耗不同，生产告警应以响应头为准。

## 批量整理

CMS 支持按成员、年份、期刊/会议和重复风险筛选候选。批量计划和批量动作的服务端上限为 500 条，前端每 50 条顺序提交；每篇论文独立事务处理，因此单项失败不会回滚已经成功的项目，最终摘要可用于重试失败项。

“安全接收”只接受仍为 pending、元数据完整且没有重复提示的论文。标题指纹只生成建议；标题、年份和作者均有重合时显示高置信合并建议，但仍需管理员确认。OpenAlex Work ID 或 DOI 精确匹配会归一到同一 registry，一篇共同论文可关联多个成员，不会重复生成公开论文。

若 OpenAlex 自身为同一成果提供了多个 Work ID 或预出版/正式出版 DOI，合并时保留已有公开论文为主记录，并把第二个来源保存为已确认别名；别名不占用第二个 `research_item_id`，也不会生成重复的公开论文。其成员关系会归并到主 registry，重复执行同一合并操作是幂等的。

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
