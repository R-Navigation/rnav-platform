# Public UI 4.1 分阶段验收

## 范围与安全

按 specs 中 4.1 结构重构规划逐页执行。仅公开展示层改造，不进行数据库迁移、清空、重置或演示数据导入。保留 CMS 选择、双语、URL 清洗与降级。

生产公开内容审计发现明确的示意论文、新闻和联系占位文案；仅在展示层排除，不删除生产记录。无正式内容时显示真实空态。

## 阶段 0–2：基础、公共壳与首页

- 新增 /directions，/research 保持论文语义；7 项导航、站点地图、移动语言与菜单。
- 共享 Hero、卡片、CTA、紧凑页脚，真实邮箱与地址来自公开 Contact API。
- 首页 sectionOrder 映射至方向、论文/平台、成员/新闻、状态、联系插槽；模块可见性与指定 ID 保留。
- 截图：`outputs/public-ui-4.1/01-home-desktop.png`，Chrome 1440 × 900 视口，全页，DPR 2。
- 已逐项对照 `concepts/01_homepage.png`：45/55 Hero、图文方向卡、两组并列内容、紧凑状态、浅色 CTA、紧凑页脚。
- 修正：平台 3 卡同排、真实导师优先、短研究方向、页脚压缩；懒加载图片滚动加载后重新截图。
- 合理差异：现有 CMS 仅 3 个真实方向/平台；没有正式论文与新闻，不复制概念图的假论文、统计或人名。使用已公开实物照片而非概念图合成场景。
- 基础测试与 lint 通过；完整发布构建和跨屏回归在阶段 9 执行。

## 阶段 3：研究方向

- 截图 `outputs/public-ui-4.1/02-directions-desktop.png` 已对照 `concepts/02_research_directions.png`。
- 独立 Hero、大图方向卡、英文副题、相关论文主题链接、代表成果区、场景横卡、CTA/页脚齐全。
- 数据差异：只有三个真实方向，无单独关键词/能力/项目配置；不编造标签与项目，场景复用 CMS 已发表研究描述。正式成果为空态。
- 截图核查中发现旧 RootLayout 将 JSON-LD script 放在 html 直属层导致 hydration 警告；已移入 body，保留 SEO 内容。开发指示器不计入生产设计。

## 阶段 4：论文成果

- 截图 `outputs/public-ui-4.1/03-publications-desktop.png` 已对照 `concepts/03_publications.png`。
- 顶部年份/主题/类型筛选与搜索，240px 左分类栏，右侧重点成果与分组归档；小屏分类折叠面板。
- `/research?topic=slam` 已在浏览器验证选中状态，分类为真实 0 条，不展示示意论文；正式卡片保留图片、作者、年份、关键词与安全 PDF/外链。
- 浏览器 Console 无 errors，旧 hydration 问题已消失。

## 阶段 5：实验平台

- 截图 `outputs/public-ui-4.1/04-facilities-desktop.png` 已对照 `concepts/04_facilities.png`。
- 动态类型图文总览、重点平台三栏、平台选择器、核心设备/组件双栏、公开实验用途、浅色 CTA。
- 仅消费现有 public facilities DTO；兼容现有 API 返回的历史公开 section，不新增手工设施数据源。
- 无独立公开设备与组件时明确空态；不从内部资产推断配置。不展示编号、序列号、库位、领用人、采购来源。
- TypeScript 检查通过。

## 阶段 6：团队成员

> 本节记录首轮实现；2026-09-13 用户最终反馈已取代多组并排与肖像拼图，最终方案见文末。

- 截图 `outputs/public-ui-4.1/05-team-desktop.png` 已对照 `concepts/05_team.png`，第一轮纵向分组偏长，已改为组内双列并重新截图。
- PI 重点区、三组一排、每组最多 4 人预览、全部成员展开、校友折叠；保留原分组与排序。
- 照片原有裁切位置与缩放保留，原生 dialog 提供放大/关闭；公开资料、毕业信息按需展开，不挤入默认卡片。
- 无真实集体照时使用真实成员肖像拼排，不生成虚假合影；导师示意简介不展示，身份保留。
- lint 通过（仅后台既有 img 警告）。

## 阶段 7：新闻动态

- 截图 `outputs/public-ui-4.1/06-news-desktop.png` 已对照 `concepts/06_news.png`。
- Hero、图文重点新闻版位、年份/实际分类筛选、搜索、新闻归档与完整内容入口。
- 仅正式新闻参与排序/置顶/计数，未配置分类不生成假分类；当前 0 条正式动态，保留重点版位与归档空态。
- TypeScript 检查通过。

## 阶段 8：联系信息

- 截图 `outputs/public-ui-4.1/07-contact-desktop.png` 已对照 `concepts/07_contact.png`。
- 双栏联系信息/校园照片、真实社交账号、合作/招生/访问三块、位置与交通区、紧凑页脚。
- 邮箱和地址来自 public Contact API；高德链接已核对指向星湖综合实验大楼，不使用概念图北航地址。
- 当前 CMS 联系图片明确标注为示意图；使用 [LIESMARS 官网](https://liesmars.whu.edu.cn/) 首页公开校园风景图 `images/202501233.png`，页面标注来源，校园图不冒充准确楼址地图。
- 无地图 API 时采用规划允许的校园图 + 原有高德准确位置链接；未引入收费服务或虚假交通路线。
- 新图片组件限定可信源优化为响应式 WebP；保留图片裁切与懒加载。

## 阶段 9：响应式与回归

- 七页分别完成 1440px 桌面、1024px 平板、390px 手机全页截图检查。另有 768px 英文平台边界和英文论文手机截图。
- 手机 Hero 纵向、方向卡横向 snap、论文分类抽屉、团队单列分组；平板方向卡双列。768px 平台详情采用双栏 + 下方配置，避免窄列挤压。
- 实际浏览器验证：公开邮箱复制显示“已复制”；语言切换后跨页保持；移动七项导航可用且选择后关闭；论文主题按钮/选择器/抽屉状态同步；平台切换更新对应图文/参数；照片 dialog 支持 Escape；硕士其余 15 人与校友展开。
- 新增 5 项数据组合/导航测试和 3 项组件渲染测试，覆盖真实 Example 标题不误隐藏、正式论文双语与主题约束、安全 URL、新闻重点/归档、额外内部资产字段不输出。
- `npm test`（含生产图片修复后重跑）：94 Web + 275 Server + 26 scripts = 395 项全部通过。
- `npm run lint`：通过，0 error；4 项既有后台原生 img warning，未新增公开页 warning。
- `npm run build`：Next 发布构建 + Server TypeScript 编译通过；路由包含 `/directions`，原公开路由及 `/monitor`、后台路由保留。
- 辅助文字加深以满足浅色背景对比度；交互控件 focus-visible、语言按钮 44×44px、减少动态效果偏好已覆盖。装饰性 RNAV 占位标志不作为信息文字。
- 图片：官方校园原图 4,087,801 bytes，Next 640px WebP 58,152 bytes（约减少 98.6%）；Hero 高优先级、其余懒加载、sizes/aspect-ratio 和图片失败回退均配置。
- 本次截图是浏览器人工视效/交互验收，不冒充生产真实用户 Core Web Vitals 测量；持续流量指标需上线后积累。

### 截图索引

目录：`outputs/public-ui-4.1/`（本地验收产物，不提交二进制到 Git）。每页桌面图已在该页完成时逐项对照对应 `concepts/*.png`，然后才进入下一页。

| 页面 | 桌面 | 平板 | 手机 |
|---|---|---|---|
| 首页 | `01-home-desktop.png` | `rnav41-01-home-tablet.png` | `rnav41-01-home-mobile.png` |
| 研究方向 | `02-directions-desktop.png` | `rnav41-02-directions-tablet.png` | `rnav41-02-directions-mobile.png` |
| 论文成果 | `03-publications-desktop.png` | `rnav41-03-publications-tablet.png` | `rnav41-03-publications-mobile-en.png` |
| 实验平台 | `04-facilities-desktop.png` | `rnav41-04-facilities-tablet.png` | `rnav41-04-facilities-mobile.png` |
| 团队成员 | `05-team-desktop.png` | `rnav41-05-team-tablet.png` | `rnav41-05-team-mobile.png` |
| 新闻动态 | `06-news-desktop.png` | `rnav41-06-news-tablet.png` | `rnav41-06-news-mobile.png` |
| 联系我们 | `07-contact-desktop.png` | `rnav41-07-contact-tablet.png` | `rnav41-07-contact-mobile.png` |

### 发布前数据保护

- SSH 只读确认生产基线提交 `8c2afeb86fe2c0e62489df51a71beceb5885bdde`，工作区干净，服务 active。
- 新备份：`/srv/rnav_platform/backups/public-ui-4.1-20260913/rnav_platform.dump`，已用 `pg_restore --list` 验证可解析。
- SHA-256：`985a36d8f83a8ad34469fe34fa47f9fdaeccdb9f88239d78611a217c9881aef7`。
- 发布前：users 38 / lab_assets 76 / procurement_requests 32 / schema_migrations 36。
- 不运行 db:migrate、seed、import、reset，不修改数据库结构/生产内容；独立构建后切换应用产物，保留旧产物回滚。

### 生产图片兼容性复验

- 首次发布的线上视觉检查发现 COS 图全部被图片代理拒绝；日志证明同地域腾讯云 DNS 返回 `169.254.0.49`。该行为与 [腾讯云官方说明](https://cloud.tencent.com/document/product/436/56560) 一致，不是缺失文件。发现后已先恢复旧展示产物，未触碰数据库。
- 修复采用受限 `/api/public/image` WebP 服务：只接受固定 COS 桶域名、`/rnav/` 路径且必须出现在当前公开 DTO 中的精确 src；拒绝认证 URL、查询参数、其他域名、未公开对象与重定向。未启用 `dangerouslyAllowLocalIP`，未更改系统 DNS。
- 输入限 16MB / 3200 万像素，仅 JPEG/PNG/WebP/AVIF；输出限 1920px / 4MB；4 并发、16 个在途请求、24MB/64项缓存；公开白名单 30 秒刷新，响应缓存 60 秒。
- Sharp 固定为已在 Next 依赖树中的 `0.35.4`，提升为 Server 显式依赖，没有启用新的云服务或改变媒体访问权限。
- 新增 6 项图片安全/缩放/缓存测试，验证未公开对象和非法尺寸不触发请求、WebP 实际尺寸、请求去重、重定向/SVG/超限拒绝；按文件签名拒绝伪装成 PNG 的 SVG，再交给解码器。

### 上线验证与剩余环境阻塞

- 修复版的七页、`/monitor`、`/login`、`/sitemap.xml`、`/api/health` 均返回 200，健康状态 `database: ok`。
- 七页服务端 HTML 的 4.1 Hero / Footer 已逐页检查；从 HTML 提取的 21 个不同公开 COS 图片逐个验证为 200 / `image/webp`。非法主机返回 400，未公开对象返回 404。
- 生产网络下抽样 3 张平台和 2 张成员图，640px 输出 21,156–54,238 bytes；无人机图由 3,540,119 bytes 降至 32,728 bytes。
- 发布后数量仍为 users 38 / lab_assets 76 / procurement_requests 32 / schema_migrations 36，与发布前一致。保留数据库备份及 4.0 旧 Next/Server 产物。
- **尚待完成：修复版最终线上可视截图复验。** 本机在发布期间锁屏，电脑工具明确要求用户手动解锁，已请求解锁；未绕过锁屏。前述七页逐页概念对照及桌面/平板/手机截图已完成，不能将服务器 HTTP/图片检查冒充锁屏后的浏览器截图。

## 2026-09-13 最终反馈修订与验收

- 按用户最新要求替代原 concept 的团队布局：导师、博士后、博士、硕士、本科、毕业生依次纵向排列，每组占完整内容宽度。组内 1440px 四列、1024px 三列、768px 两列、手机一列。19 位硕士全部直接可见，负责人只出现一次，原排序和公开资料保留。
- 全部页面顶部统一为单张横向照片；取消成员肖像拼接及随选中平台/论文变化的自动首图。后台「网站内容」各页面新增首图地址、说明、上传与恢复默认控件；研究方向首图在首页设置中独立编辑。未设置或明确示意图使用官方校园风景图。仅扩充既有页面 JSON 公开白名单，不新增表、迁移或生产内容写入。
- 官网与管理后台共用 `MemberCard`：同一字体、照片比例、信息层级、公开资料折叠。后台支持双语预览，未保存头像不走已公开图片白名单代理；裁剪预览同步为 80:104 比例。修正公开 DTO 不应补回用户明确隐藏的学术字段。
- 新截图：`rnav41-final-team-desktop.png`、`rnav41-final-team-tablet.png`、`rnav41-final-team-mobile.png`。已对照 `concepts/05_team.png`，其中分组结构和单图首部按本次用户反馈优先，色彩、导航、CTA 与全站一致。
- `rnav41-final-console-preview.png` 为本地隔离组件验收：使用共享真实编辑组件和明确标注的验收数据，不保存到任何数据库。验证双语切换、资料展开、取消学术信息后预览消失；临时验收路由已在发布构建前移除。
- 回归：97 Web + 277 Server + 27 scripts = 401 项通过；lint 0 error / 4 项既有后台 img warning；Next 与 Server 发布构建通过。增加首图投影/安全回退、隐私字段、全量成员与分组顺序测试；命令行渲染测试补齐真实 Next Image 配置。
- 发布前生产基线 `2b46d7d72a57b5748b69bd64fb02aaa230cefb8d`，工作区干净，服务 active。数据计数仍为 38 / 76 / 32 / 36。
- 新数据库备份 `/srv/rnav_platform/backups/public-ui-4.1-final-20260913/rnav_platform.dump`；`pg_restore --list` 校验通过，SHA-256 `90bffdefa80271a0abead9e585395a0a41925ae9caa07893100ef3946a57dbf1`。
- 本次发布后的在线截图与服务/数据核对结果在完成后补记。
