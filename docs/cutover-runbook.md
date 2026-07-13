# RNAV 统一平台迁移操作手册

本文用于将旧主站、旧监控大屏、两个 PostgreSQL 数据库和两套管理员账号迁移到统一项目 `rnav_platform`。请先完整完成 staging 演练，再安排正式切换；不要把第一次执行放在生产变更窗口。

## 1. 迁移结果

迁移完成后的生产架构如下：

- 代码目录：`/srv/rnav_platform`
- 服务：一个 Node 进程，同时承载 Next.js、REST API 和 WebSocket
- 数据库：一个新 PostgreSQL 数据库 `rnav_platform`
- 公开页面：`/`、`/research`、`/team`、`/news`、`/facilities`、`/contact`、`/monitor`
- 内部入口：`/console`，功能页面全部位于 `/console/*`
- nginx：HTTPS 服务块只保留一个 `location /`，代理到 `127.0.0.1:4090`
- 旧目录 `/srv/rnav`、`/srv/rnav_monitor` 和旧数据库在回滚观察期内保留

本文命令使用两个执行位置标记：

- `[本地 Mac]`：在维护者电脑执行，项目路径为 `/Users/aaron/Projects/rnav/rnav_platform`
- `[服务器]`：通过 `ubuntu@82.156.156.43` 登录后执行

## 2. 强制安全规则

1. 旧数据库 `rnav_site` 和 `rnav_monitor` 只允许备份和只读导出，禁止对它们运行新项目 migration 或 import。
2. 数据导出脚本使用 `REPEATABLE READ READ ONLY` 事务，但正式导出前仍需冻结管理后台、资产管理和设备写入。
3. staging 与生产都使用全新空数据库。导入脚本按旧 ID upsert，核验脚本比较目标表总数；不要向已有业务数据的数据库重复混合导入。
4. `backups/`、数据库密码、`.env`、设备明文 token、pepper 和临时密码不得提交 Git。
5. 新系统稳定运行并完成回滚观察前，不删除旧服务、旧目录、旧数据库和最终 SQL dump。
6. 每个关键步骤失败后立即停止，不要跳过 `manifest.json`、`conflicts.json` 或核验报告的检查。

## 3. 已确认的生产基线

2026-07-13 的只读盘点结果如下。它只是演练基线，正式迁移数量以最终导出的 `manifest.json` 为准。

| 数据域 | 数量 |
|---|---:|
| 旧主站管理员 | 1 |
| 团队成员展示记录 | 20 |
| 媒体记录 | 23 |
| 实验平台 | 14 |
| 实验室资产 | 75 |
| 资产备注 | 72 |
| 页面内容 | 7 |
| 旧 monitor 管理员 | 1 |
| 监控设备 | 3 |
| 遥测记录 | 3136 |
| 设备事件 | 145 |
| 告警 | 1 |
| 设备当前状态 | 3 |
| 设备类别 | 3 |

服务器当前状态：

- PostgreSQL 14，本机监听 `127.0.0.1:5432`
- PM2 应用 `rnav-backend` 位于 `/srv/rnav/backend`，监听 `127.0.0.1:4090`
- PM2 应用 `rnav-monitor-backend` 位于 `/srv/rnav_monitor/backend`，监听 `4190`
- PM2 可执行文件位于 `/home/ubuntu/.nvm/versions/node/v24.15.0/lib/node_modules/pm2/bin/pm2`
- 服务器现有 Node 为 `24.15.0`；新项目要求 Node `>=24.18.0`、npm `>=11.16.0`
- 旧环境文件为 `/srv/rnav/.env` 和 `/srv/rnav_monitor/.env`

正式切换当天先重新执行以下盘点，实际结果与本文不一致时，以当天结果为准：

```bash
# [服务器]
sudo ss -ltnp | awk 'NR==1 || /:4090|:4190/'
ps -eo pid,lstart,args | grep '[n]ode'

PM2_NODE=/home/ubuntu/.nvm/versions/node/v24.15.0/bin/node
PM2_BIN=/home/ubuntu/.nvm/versions/node/v24.15.0/lib/node_modules/pm2/bin/pm2
"$PM2_NODE" "$PM2_BIN" status
```

## 4. 迁移前准备

### 4.1 本地安装与质量检查

```bash
# [本地 Mac]
cd /Users/aaron/Projects/rnav/rnav_platform
node --version
npm --version
npm install
npm test
npm run lint
npm run build
```

要求所有命令退出码为 0。构建期间公开页面可能记录 `127.0.0.1:4090` 暂未启动的回退信息；最终仍必须出现成功构建并以退出码 0 结束。

### 4.2 准备迁移目录

```bash
# [本地 Mac]
cd /Users/aaron/Projects/rnav/rnav_platform
mkdir -p backups/sql backups/staging-export backups/final-export
chmod 700 backups
```

`backups/` 已在 `.gitignore` 中，但仍需确认：

```bash
# [本地 Mac]
git status --short --ignored backups
```

### 4.3 记录秘密值的处理原则

新环境需要以下变量：

- `SESSION_SECRET`：新生成，至少 32 字符
- `PASSWORD_PEPPER`：新生成，至少 32 字符；当前版本保留该配置，但旧 bcrypt 密码兼容不依赖它
- `DEVICE_TOKEN_PEPPER`：必须从 `/srv/rnav_monitor/.env` 原样安全复制，不能重新生成

旧、新 monitor 都用 `SHA256(DEVICE_TOKEN_PEPPER + ":" + token)` 校验设备。改变 `DEVICE_TOKEN_PEPPER` 会让 3 台旧设备保存的 token 全部失效。

生成新随机值：

```bash
# [服务器]
openssl rand -base64 48
openssl rand -base64 48
```

不要在聊天、工单、截图或本文中记录实际秘密值。

## 5. staging 演练

### 5.1 制作旧数据库 SQL 级备份

SQL dump 是灾难恢复材料，JSON 导出才是数据转换输入。先在服务器生成带时间戳的 dump：

```bash
# [服务器]
STAMP=$(date +%Y%m%d-%H%M%S)
sudo -u postgres pg_dump --format=custom --no-owner \
  --file="/tmp/rnav_site-${STAMP}.dump" rnav_site
sudo -u postgres pg_dump --format=custom --no-owner \
  --file="/tmp/rnav_monitor-${STAMP}.dump" rnav_monitor
sha256sum "/tmp/rnav_site-${STAMP}.dump" "/tmp/rnav_monitor-${STAMP}.dump"
echo "$STAMP"
```

记下输出的 `STAMP` 和校验值，再下载到本地：

```bash
# [本地 Mac] 将 STAMP 替换为上一条输出
STAMP=YYYYMMDD-HHMMSS
scp -i ~/.ssh/my_server \
  "ubuntu@82.156.156.43:/tmp/rnav_site-${STAMP}.dump" \
  "ubuntu@82.156.156.43:/tmp/rnav_monitor-${STAMP}.dump" \
  backups/sql/
shasum -a 256 backups/sql/*-${STAMP}.dump
```

本地校验值必须与服务器输出一致。确认后才清理服务器 `/tmp` 副本；若换了终端，先重新填写同一个 `STAMP`：

```bash
# [服务器]
STAMP=YYYYMMDD-HHMMSS
rm "/tmp/rnav_site-${STAMP}.dump" "/tmp/rnav_monitor-${STAMP}.dump"
```

### 5.2 建立 PostgreSQL SSH 隧道

打开一个单独终端并保持运行：

```bash
# [本地 Mac，保持此进程运行]
ssh -N -i ~/.ssh/my_server \
  -L 15432:127.0.0.1:5432 \
  -o ExitOnForwardFailure=yes \
  ubuntu@82.156.156.43
```

另开终端确认端口存在：

```bash
# [本地 Mac]
nc -zv 127.0.0.1 15432
```

从旧环境文件中安全读取数据库用户名、数据库名和密码。主站使用 `/srv/rnav/.env` 中的 `DB_*`，monitor 使用 `/srv/rnav_monitor/.env` 中的 `DATABASE_URL`。可在服务器本地查看，但不要把秘密值输出到共享日志：

```bash
# [服务器，输出含秘密值，确认旁边无人且不要录屏]
sudo sed -n '/^DB_\(HOST\|PORT\|NAME\|USER\|PASSWORD\)=/p' /srv/rnav/.env
sudo sed -n '/^DATABASE_URL=/p' /srv/rnav_monitor/.env
```

在本地创建仅供迁移使用的文件：

```bash
# [本地 Mac]
cd /Users/aaron/Projects/rnav/rnav_platform
touch .migration.env
chmod 600 .migration.env
```

使用本地编辑器写入并替换占位内容，不要用会进入 shell history 的 `echo` 命令。用户名或密码含 `@`、`:`、`/`、`#`、`%` 等字符时，必须进行 URL 编码：

```bash
export LEGACY_WEBSITE_DATABASE_URL='postgresql://SITE_USER:SITE_PASSWORD@127.0.0.1:15432/rnav_site'
export LEGACY_MONITOR_DATABASE_URL='postgresql://MONITOR_USER:MONITOR_PASSWORD@127.0.0.1:15432/rnav_monitor'
```

`.migration.env` 和 `scripts/db/username-map.json` 均已被 `.gitignore` 明确忽略。每次使用时执行：

```bash
# [本地 Mac]
set -a
source .migration.env
set +a
```

### 5.3 导出旧库 JSON

staging 演练使用独立目录，避免覆盖正式导出：

```bash
# [本地 Mac]
cd /Users/aaron/Projects/rnav/rnav_platform
set -a; source .migration.env; set +a

rm -rf backups/staging-export/transformed
npm run db:export-legacy -- \
  --website-db "$LEGACY_WEBSITE_DATABASE_URL" \
  --monitor-db "$LEGACY_MONITOR_DATABASE_URL" \
  --out backups/staging-export
```

不要在正式导出目录中执行上面的 `rm -rf`。检查清单和每个文件的摘要：

```bash
# [本地 Mac]
node -e 'const m=require("./backups/staging-export/manifest.json"); console.table(m.sources.website.tables); console.table(m.sources.monitor.tables)'
shasum -a 256 backups/staging-export/*.json
```

导出记录数应与生产盘点接近；有正常新增时可以不同，但不应无故归零或大幅减少。

### 5.4 合并旧管理员账号

复制示例映射并编辑：

```bash
# [本地 Mac]
cp scripts/db/username-map.example.json scripts/db/username-map.json
chmod 600 scripts/db/username-map.json
```

映射格式：

```json
{
  "users": [
    {
      "unifiedUsername": "统一登录名",
      "websiteAdminUsername": "旧主站管理员登录名",
      "monitorUsername": "旧监控管理员登录名",
      "displayName": "显示名称",
      "baseTier": "super"
    }
  ]
}
```

只有确认两个旧账号属于同一个人时才合并。若属于不同人员，写成两个 mapping 项，或不映射并让转换器保留为两个账号。合并同一人时，转换脚本优先保留旧主站账号的密码哈希；确认该人员知道对应密码，否则切换后按第 6.3 节重置。

执行转换：

```bash
# [本地 Mac]
npm run db:migrate-legacy -- \
  --in backups/staging-export \
  --username-map scripts/db/username-map.json

cat backups/staging-export/transformed/conflicts.json
```

必须人工检查 `conflicts.json`：

- `username-map-missing` 表示映射引用了不存在的旧账号，修正后重新转换
- `username-collision` 表示重名账号被自动加后缀，确认新登录名是否可接受
- 管理员数量和身份必须符合预期

### 5.5 创建空 staging 数据库

首次演练时，在服务器创建独立应用角色，密码通过交互提示输入：

```bash
# [服务器]
sudo -u postgres createuser --pwprompt rnav_platform_app
sudo -u postgres createdb --owner=rnav_platform_app rnav_platform_staging
```

如果角色已存在，只创建数据库：

```bash
# [服务器]
sudo -u postgres createdb --owner=rnav_platform_app rnav_platform_staging
```

把 staging 连接串加入本地 `.migration.env`，通过 SSH 隧道访问：

```bash
export STAGING_DATABASE_URL='postgresql://rnav_platform_app:URL_ENCODED_PASSWORD@127.0.0.1:15432/rnav_platform_staging'
```

先确认目标库确实是 staging：

```bash
# [本地 Mac]
set -a; source .migration.env; set +a
psql "$STAGING_DATABASE_URL" -Atc 'select current_database(), current_user;'
```

输出必须包含 `rnav_platform_staging`，然后才运行 schema migration：

```bash
# [本地 Mac]
DATABASE_URL="$STAGING_DATABASE_URL" npm run db:migrate
```

### 5.6 干跑、导入和核验

先执行会回滚全部写入的 dry-run：

```bash
# [本地 Mac]
npm run db:import-legacy -- \
  --in backups/staging-export/transformed \
  --target-db "$STAGING_DATABASE_URL" \
  --dry-run
```

确认计划数量正确后，执行正式 staging 导入：

```bash
# [本地 Mac]
npm run db:import-legacy -- \
  --in backups/staging-export/transformed \
  --target-db "$STAGING_DATABASE_URL"

npm run db:verify-migration -- \
  --in backups/staging-export/transformed \
  --target-db "$STAGING_DATABASE_URL"
```

必须看到 `Migration verification passed`，并检查：

```bash
# [本地 Mac]
cat backups/staging-export/transformed/verification-report.md
```

任一项 `FAIL` 都要停止。由于核验比较目标表总数，最常见原因是目标库不是空库；重新创建 staging 库后再演练，不要手工篡改报告。

### 5.7 准备 staging 环境并启动

创建本地测试配置：

```bash
# [本地 Mac]
cp .env.example .env
chmod 600 .env
```

至少设置：

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=4090
PUBLIC_BASE_URL=http://127.0.0.1:4090
DATABASE_URL=postgresql://rnav_platform_app:URL_ENCODED_PASSWORD@127.0.0.1:15432/rnav_platform_staging
SESSION_SECRET=新生成的至少32字符随机值
PASSWORD_PEPPER=新生成的至少32字符随机值
DEVICE_TOKEN_PEPPER=从旧monitor原样安全复制
COOKIE_SECURE=false
MONITOR_WS_PATH=/ws
MONITOR_OFFLINE_TIMEOUT_SECONDS=60
```

保持数据库 SSH 隧道运行，然后：

```bash
# [本地 Mac]
npm run build
npm start
```

另开终端验证：

```bash
# [本地 Mac]
curl -fsS http://127.0.0.1:4090/api/health
curl -I http://127.0.0.1:4090/
curl -I http://127.0.0.1:4090/monitor
curl -I http://127.0.0.1:4090/console
```

浏览器验收见第 9 节。演练完成后停止本地进程，不删除 staging 数据库，保留到正式迁移结束用于对照。

## 6. 统一账号准备

### 6.1 身份模型

- `normal`：数据库中的 `base_tier=normal`，只授予基础权限
- `plus`：数据库中仍是 `base_tier=normal`，但拥有一个或多个进阶权限；`plus` 是系统计算出的展示身份，不写入 `base_tier`
- `super`：数据库中的 `base_tier=super`，自动拥有全站所有权限

普通成员基础权限为：

```text
console.access
profile.read_own
profile.write_own
lab_assets.read
procurements.create
procurements.read_own
```

### 6.2 旧成员不能自动变成账号

旧库中的 20 条 `team_members` 是公开展示资料，不含完整统一登录凭据。迁移脚本只迁移旧主站管理员和旧 monitor 管理员，普通成员账号必须另行创建。

当前版本还有以下限制：

- `/console/users` 和 `/console/permissions` 页面已经预留，但完整的用户创建、重置密码和授权后端尚未实现
- 当前没有“首次登录强制修改密码”流程
- `team_members` 展示记录不会自动关联到 `users` 登录账号

因此，正式向 20 多位成员开放前，推荐先完成用户管理、改密和资料关联功能。若必须先上线，可由超级管理员在新数据库中受控初始化账号，并通过独立安全渠道发送临时密码；成员无法自助改密时，由管理员按相同方式重置。

### 6.3 受控创建普通账号

以下操作只允许对 `rnav_platform_staging` 或 `rnav_platform` 执行。先核对连接目标：

```bash
# [服务器]
set -a; source /srv/rnav_platform/.env; set +a
psql "$DATABASE_URL" -Atc 'select current_database(), current_user;'
```

为单个成员生成 bcrypt 哈希。密码不会写入命令历史，但需避免旁人读取当前终端：

```bash
# [服务器，在 /srv/rnav_platform]
read -s -p '临时密码: ' TEMP_PASSWORD; echo
export TEMP_PASSWORD
PASSWORD_HASH=$(
  node --input-type=module -e \
    'import bcrypt from "bcryptjs"; console.log(await bcrypt.hash(process.env.TEMP_PASSWORD, 12))'
)
unset TEMP_PASSWORD
```

进入 `psql "$DATABASE_URL"`，将占位值替换为该成员信息和上一步生成的哈希：

```sql
BEGIN;

INSERT INTO users (username, display_name, password_hash, base_tier, status)
VALUES ('USERNAME', 'DISPLAY_NAME', 'BCRYPT_HASH', 'normal', 'active')
ON CONFLICT (username) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  password_hash = EXCLUDED.password_hash,
  status = 'active',
  updated_at = now();

INSERT INTO user_permissions (user_id, permission_key)
SELECT users.id, permissions.key
FROM users
CROSS JOIN permissions
WHERE users.username = 'USERNAME'
  AND permissions.key IN (
    'console.access',
    'profile.read_own',
    'profile.write_own',
    'lab_assets.read',
    'procurements.create',
    'procurements.read_own'
  )
ON CONFLICT DO NOTHING;

COMMIT;
```

授予进阶权限时只插入需要的属性。例如采购审批员：

```sql
INSERT INTO user_permissions (user_id, permission_key)
SELECT id, 'procurements.review' FROM users WHERE username = 'USERNAME'
ON CONFLICT DO NOTHING;
```

常用进阶权限见 `server/services/auth/permissions.ts`。不要把普通业务管理员设为 `super`。

完成后清理 shell 变量：

```bash
# [服务器]
unset PASSWORD_HASH
```

## 7. 正式生产迁移

### 7.1 变更窗口前一天

- [ ] staging 导入和第 9 节验收全部通过
- [ ] 确认维护窗口、负责人和回滚决策人
- [ ] 确认 3 台设备发送端可暂停或缓冲上报
- [ ] 确认设备发送端的新 URL，或准备旧 URL 的临时兼容方案
- [ ] 确认 `DEVICE_TOKEN_PEPPER` 已安全复制且未改变
- [ ] 确认 COS/对象存储仍可访问，图片、PDF、头像随机抽查正常
- [ ] 确认服务器磁盘、数据库空间和备份下载空间充足
- [ ] 确认旧 PM2 应用名仍为 `rnav-backend`、`rnav-monitor-backend`
- [ ] 确认 DNS、证书路径和 nginx 站点文件位置未变化

### 7.2 升级服务器 Node 运行时

服务器现有 `24.15.0` 不满足项目要求。使用现有 NVM 安装项目要求的版本：

```bash
# [服务器]
source ~/.nvm/nvm.sh
nvm install 24.18.0
nvm use 24.18.0
node --version
npm --version
```

输出必须满足 Node `>=24.18.0`、npm `>=11.16.0`。记录以下绝对路径，systemd 必须使用实际输出：

```bash
# [服务器]
which node
which npm
```

### 7.3 部署代码到新目录

不要覆盖旧目录：

```bash
# [服务器]
sudo mkdir -p /srv/rnav_platform
sudo chown ubuntu:ubuntu /srv/rnav_platform
```

从本地传输代码：

```bash
# [本地 Mac]
cd /Users/aaron/Projects/rnav/rnav_platform
rsync -az \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude 'apps/web/.next/' \
  --exclude 'server/dist/' \
  --exclude 'backups/' \
  --exclude '.env' \
  --exclude '.migration.env' \
  -e 'ssh -i ~/.ssh/my_server' \
  ./ ubuntu@82.156.156.43:/srv/rnav_platform/
```

在服务器安装并构建：

```bash
# [服务器]
cd /srv/rnav_platform
source ~/.nvm/nvm.sh
nvm use 24.18.0
npm ci
npm test
npm run lint
npm run build
```

### 7.4 创建生产数据库和环境文件

创建全新的空生产数据库：

```bash
# [服务器]
sudo -u postgres createdb --owner=rnav_platform_app rnav_platform
```

若命令提示已存在，不要继续。先判断它是否是此前失败演练遗留；正式导入要求空的新库，不能误删不明数据库。

创建 `/srv/rnav_platform/.env`：

```env
NODE_ENV=production
PORT=4090
HOST=127.0.0.1
PUBLIC_BASE_URL=https://r-navigation.com
DATABASE_URL=postgresql://rnav_platform_app:URL_ENCODED_PASSWORD@127.0.0.1:5432/rnav_platform
SESSION_SECRET=新生成的至少32字符随机值
PASSWORD_PEPPER=新生成的至少32字符随机值
DEVICE_TOKEN_PEPPER=从旧monitor原样安全复制
COOKIE_SECURE=true
MONITOR_WS_PATH=/ws
MONITOR_OFFLINE_TIMEOUT_SECONDS=60
```

```bash
# [服务器]
chmod 600 /srv/rnav_platform/.env
```

确认文件中没有占位值，但不要打印秘密值到日志：

```bash
# [服务器]
awk -F= '{print $1}' /srv/rnav_platform/.env
```

### 7.5 冻结旧系统写入

通知所有维护者停止操作首页管理、成员管理、monitor 管理和实验室资产管理。暂停 3 台设备发送或在设备端缓存消息，然后停止两个旧 PM2 后端：

```bash
# [服务器]
PM2_NODE=/home/ubuntu/.nvm/versions/node/v24.15.0/bin/node
PM2_BIN=/home/ubuntu/.nvm/versions/node/v24.15.0/lib/node_modules/pm2/bin/pm2

"$PM2_NODE" "$PM2_BIN" status
"$PM2_NODE" "$PM2_BIN" stop rnav-backend rnav-monitor-backend
sudo ss -ltnp | awk 'NR==1 || /:4090|:4190/'
```

`4090` 和 `4190` 应不再监听。记录冻结开始时间。此后禁止恢复旧系统写入，除非执行回滚。

### 7.6 最终 SQL dump 和 JSON 导出

重复第 5.1 节，生成并下载最终带时间戳 SQL dump。

保持第 5.2 节 SSH 隧道运行，在本地使用全新的正式导出目录：

```bash
# [本地 Mac]
cd /Users/aaron/Projects/rnav/rnav_platform
set -a; source .migration.env; set +a
FINAL_DIR="backups/final-export-$(date +%Y%m%d-%H%M%S)"

npm run db:export-legacy -- \
  --website-db "$LEGACY_WEBSITE_DATABASE_URL" \
  --monitor-db "$LEGACY_MONITOR_DATABASE_URL" \
  --out "$FINAL_DIR"

echo "$FINAL_DIR"
cat "$FINAL_DIR/manifest.json"
```

记下 `FINAL_DIR`。不要复用 staging JSON；正式数据必须在写入冻结后重新导出。

使用已审批的账号映射转换：

```bash
# [本地 Mac]
npm run db:migrate-legacy -- \
  --in "$FINAL_DIR" \
  --username-map scripts/db/username-map.json

cat "$FINAL_DIR/transformed/conflicts.json"
```

再次人工确认冲突后继续。

### 7.7 正式导入新生产库

为了从本地通过 SSH 隧道导入，在 `.migration.env` 中增加：

```bash
export PRODUCTION_DATABASE_URL='postgresql://rnav_platform_app:URL_ENCODED_PASSWORD@127.0.0.1:15432/rnav_platform'
```

核对目标库：

```bash
# [本地 Mac]
set -a; source .migration.env; set +a
psql "$PRODUCTION_DATABASE_URL" -Atc 'select current_database(), current_user;'
```

输出必须是 `rnav_platform`。随后执行：

```bash
# [本地 Mac]
DATABASE_URL="$PRODUCTION_DATABASE_URL" npm run db:migrate

npm run db:import-legacy -- \
  --in "$FINAL_DIR/transformed" \
  --target-db "$PRODUCTION_DATABASE_URL" \
  --dry-run

npm run db:import-legacy -- \
  --in "$FINAL_DIR/transformed" \
  --target-db "$PRODUCTION_DATABASE_URL"

npm run db:verify-migration -- \
  --in "$FINAL_DIR/transformed" \
  --target-db "$PRODUCTION_DATABASE_URL"

cat "$FINAL_DIR/transformed/verification-report.md"
```

只有报告为 `PASS` 才能启动新服务。

### 7.8 安装 systemd 服务

先确认新 Node 的绝对路径：

```bash
# [服务器]
source ~/.nvm/nvm.sh
nvm use 24.18.0
which node
```

创建 `/etc/systemd/system/rnav-platform.service`。如果 `which node` 输出不是下方路径，修改 `ExecStart` 和 `Environment=PATH`：

```ini
[Unit]
Description=RNAV Unified Platform
After=network.target postgresql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/srv/rnav_platform
EnvironmentFile=/srv/rnav_platform/.env
Environment=PATH=/home/ubuntu/.nvm/versions/node/v24.18.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin
ExecStart=/home/ubuntu/.nvm/versions/node/v24.18.0/bin/node /srv/rnav_platform/server/dist/index.js
Restart=always
RestartSec=5
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
```

启动并检查：

```bash
# [服务器]
sudo systemctl daemon-reload
sudo systemctl enable --now rnav-platform
sudo systemctl status rnav-platform --no-pager
sudo journalctl -u rnav-platform -n 100 --no-pager
curl -fsS http://127.0.0.1:4090/api/health
```

健康检查必须返回 `status: ok` 和 `database: ok`。

### 7.9 切换 nginx

先确认实际站点文件和符号链接：

```bash
# [服务器]
sudo ls -l /etc/nginx/sites-available /etc/nginx/sites-enabled
sudo nginx -T | grep -n -A5 -B5 'server_name r-navigation.com'
```

备份当前配置，再安装仓库中的目标配置：

```bash
# [服务器，在 /srv/rnav_platform]
STAMP=$(date +%Y%m%d-%H%M%S)
NGINX_BACKUP="/etc/nginx/sites-available/rnav.before-unified-${STAMP}"
sudo cp /etc/nginx/sites-available/rnav \
  "$NGINX_BACKUP"
echo "$NGINX_BACKUP" | sudo tee /srv/rnav_platform/.nginx-backup-path

sudo cp deploy/nginx/rnav /etc/nginx/sites-available/rnav
sudo nginx -t
sudo systemctl reload nginx
```

如果启用目录不是指向 `/etc/nginx/sites-available/rnav` 的符号链接，应先按现场结构备份并修正链接。`nginx -t` 失败时绝对不要 reload。

目标 HTTPS 配置只有一个应用 location：

```nginx
location / {
    proxy_pass http://127.0.0.1:4090;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 300s;
}
```

### 7.10 恢复设备上报

新 ingest 地址为：

```text
POST /api/monitor/ingest/v1/heartbeat
POST /api/monitor/ingest/v1/telemetry
POST /api/monitor/ingest/v1/event
```

旧设备目前使用 `/monitor/api/ingest/v1/...`。统一后端已为 heartbeat、telemetry 和 event 保留窄范围兼容别名，因此目标 nginx 无需增加额外 location 或 rewrite，旧设备可以在切换后继续上报。

切换后仍应逐台将发送端 URL 改为 `https://r-navigation.com/api/monitor/ingest/v1/...`。全部设备完成更新并经过观察期后，再从统一后端删除 `/monitor/api/ingest/v1/...` 兼容别名。

继续沿用设备原有 token。发送一条测试 heartbeat，确认返回成功并在 `/monitor`、`/console/monitor` 中看到更新时间，然后再恢复全部设备。

## 8. 媒体文件迁移说明

迁移脚本只迁移 `media_assets` 数据库记录，不下载或复制 COS/对象存储中的图片和文件。

- 若继续使用原 COS bucket 和原公开 URL，无需搬运对象，只需确认新服务可访问
- 若更换 bucket，必须额外复制对象，并同步更新数据库中的 `bucket`、`object_key`、`url`
- 切换前后至少抽查首页图片、成员头像、研究成果 PDF、新闻图片和设施图片
- 不能只根据 `media_assets=23` 判断媒体迁移成功，必须实际请求对象 URL

## 9. 上线验收

### 9.1 命令行验收

```bash
# [任意可联网终端]
curl -fsS https://r-navigation.com/api/health
curl -I https://r-navigation.com/
curl -I https://r-navigation.com/research
curl -I https://r-navigation.com/team
curl -I https://r-navigation.com/monitor
curl -I https://r-navigation.com/login
curl -I https://r-navigation.com/console
```

服务器同步观察日志：

```bash
# [服务器]
sudo journalctl -u rnav-platform -f
sudo tail -f /var/log/nginx/access.log /var/log/nginx/error.log
```

### 9.2 浏览器验收

- [ ] 首页、研究、成员、新闻、设施、联系页面内容和中英文切换正常
- [ ] 图片、成员头像和 PDF 可打开
- [ ] 游客可访问 `/monitor`，响应中不含内部 UUID、序列号、metadata 或 token hash
- [ ] 游客访问 `/console` 会被要求登录，不能读取实验室资产
- [ ] 合并后的超级管理员可登录，`/console` 展示全部模块
- [ ] `normal` 用户只看到个人资料、实验室资产和自己的采购功能
- [ ] 有任一进阶权限的普通用户显示为 `plus`
- [ ] `lab_assets.read` 只能读，`lab_assets.write` 才能修改
- [ ] monitor 设置管理员若没有设备读取权限，看不到内部设备流
- [ ] 采购申请人不能审批自己的申请
- [ ] WebSocket `/ws` 可向公开 monitor 推送，`/ws/console` 需要相应登录权限
- [ ] 3 台设备都能上报，在线状态、遥测和事件继续增长

### 9.3 数据库最终检查

```bash
# [服务器]
set -a; source /srv/rnav_platform/.env; set +a
psql "$DATABASE_URL" -P pager=off <<'SQL'
SELECT 'users' AS item, count(*) FROM users
UNION ALL SELECT 'team_members', count(*) FROM team_members
UNION ALL SELECT 'media_assets', count(*) FROM media_assets
UNION ALL SELECT 'lab_platforms', count(*) FROM lab_platforms
UNION ALL SELECT 'lab_assets', count(*) FROM lab_assets
UNION ALL SELECT 'devices', count(*) FROM devices
UNION ALL SELECT 'device_telemetry', count(*) FROM device_telemetry
UNION ALL SELECT 'device_events', count(*) FROM device_events
UNION ALL SELECT 'device_alerts', count(*) FROM device_alerts;
SQL
```

用户数只包含迁移的旧管理员和已经人工创建的新成员账号，不能要求它自动等于 `team_members` 数量。

## 10. 回滚

满足以下任一条件时应优先回滚：

- 数据核验失败且不能在维护窗口内确定原因
- 新服务无法稳定启动或健康检查持续失败
- 管理员无法登录、权限边界错误或内部数据向游客泄露
- 设备批量无法上报且不能快速恢复
- nginx 切换造成主要页面或 WebSocket 大面积不可用

### 10.1 回滚 nginx

```bash
# [服务器]
NGINX_BACKUP=$(cat /srv/rnav_platform/.nginx-backup-path)
sudo test -f "$NGINX_BACKUP"
sudo cp "$NGINX_BACKUP" /etc/nginx/sites-available/rnav
sudo nginx -t
sudo systemctl reload nginx
```

### 10.2 停止新服务并恢复旧服务

```bash
# [服务器]
sudo systemctl stop rnav-platform

PM2_NODE=/home/ubuntu/.nvm/versions/node/v24.15.0/bin/node
PM2_BIN=/home/ubuntu/.nvm/versions/node/v24.15.0/lib/node_modules/pm2/bin/pm2
"$PM2_NODE" "$PM2_BIN" restart rnav-backend rnav-monitor-backend
"$PM2_NODE" "$PM2_BIN" status

sudo ss -ltnp | awk 'NR==1 || /:4090|:4190/'
```

将设备发送端改回旧 `/monitor/api/ingest/v1/...`，恢复旧系统写入并执行旧站健康检查。

### 10.3 回滚数据原则

- 不要把新 `rnav_platform` 数据库反向覆盖到旧数据库
- 保留新数据库用于故障分析
- 记录切换后新系统已经接收的账号、资产、采购、monitor 或设备写入
- 若切换后已产生新数据，下次重迁前要决定丢弃、人工补录或编写增量迁移脚本
- SQL dump 仅在旧数据库本身损坏时用于恢复；普通应用回滚通常不需要还原旧库

## 11. 常见问题

### `db:verify-migration` 数量不一致

通常是目标数据库已有数据，或导入中途失败后又重复操作。确认连接目标，重新创建空 staging/生产数据库，再按 migration、dry-run、import、verify 的顺序执行。

### 管理员旧密码无法登录

确认账号映射选择了正确的旧账号和 `password_hash` 来源；查看 `transformed/users.json` 中的用户名、状态和来源字段，但不要传播 password hash。必要时按第 6.3 节设置新密码。

### 设备全部返回 401

优先检查新环境的 `DEVICE_TOKEN_PEPPER` 是否与旧 monitor 完全一致，再检查设备 token 和请求头。不要通过重新生成 token hash 来掩盖 pepper 配置错误。

### `/monitor` 能打开但没有实时更新

检查设备 ingest URL、`/ws` 升级请求、nginx `Upgrade/Connection` 头、systemd 日志和设备最后上报时间。

### 页面图片或 PDF 404

数据库记录迁移不等于对象存储迁移。检查原 COS bucket、对象权限、URL、域名和 `object_key`；更换 bucket 时执行对象复制和 URL 更新。

### systemd 启动时报找不到 Node

systemd 不加载交互 shell 的 NVM。使用 `which node` 的绝对路径填写 `ExecStart`，并在 `Environment=PATH` 中加入同一版本的 `bin` 目录。

## 12. 最终勾选表

- [ ] 本地测试、lint、build 全部通过
- [ ] staging SQL dump 和 JSON 导出完成并校验
- [ ] 账号映射和 `conflicts.json` 已人工审批
- [ ] staging 导入与 verification report 全部 PASS
- [ ] 公开页面、console、权限、WebSocket、设备 ingest 演练通过
- [ ] 新服务器 Node/npm 满足版本要求
- [ ] 最终写入冻结已通知并记录时间
- [ ] 最终 SQL dump 已下载且 checksum 一致
- [ ] 最终 JSON 使用冻结后的数据重新导出
- [ ] 新生产数据库为空且目标连接已二次确认
- [ ] 生产 migration、dry-run、import、verify 全部通过
- [ ] `/srv/rnav_platform/.env` 权限为 `600`
- [ ] `DEVICE_TOKEN_PEPPER` 原样沿用
- [ ] systemd 服务和 `/api/health` 正常
- [ ] nginx 原配置已备份，`nginx -t` 通过后才 reload
- [ ] 3 台设备已使用新 ingest URL 并恢复上报
- [ ] COS 图片、头像和 PDF 已抽查
- [ ] 旧服务、旧目录、旧数据库和备份仍保留
- [ ] 已确定回滚观察期结束时间和最终清理日期
