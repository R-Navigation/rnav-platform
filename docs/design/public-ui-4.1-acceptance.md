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
- `npm test`：94 Web + 269 Server + 26 scripts = 389 项全部通过。
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
