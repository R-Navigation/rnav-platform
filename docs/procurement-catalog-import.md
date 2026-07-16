# 采购目录 CSV 批量导入

该工具用于将京东商品规格 CSV 清洗并同步到 `procurement_catalog_items`。

## 数据规则

- 每个 `option_sku` 对应一个可采购目录条目，目录 SKU 为 `JD-<option_sku>`。
- 京东规格按整包售卖，因此目录单位为“包”，加购步长为 1 包。
- 每包数量、螺纹、长度、厚度、对边尺寸、材质、货期和原始选项保存在 `spec_metadata`。
- 商品链接使用具体规格的 `option_url`，不使用商品族首页地址。
- CSV 价格为空时，不清空管理员后来手动填写的参考价格。
- 公开页面抓取器不请求价格接口，也不读取任何登录后信息。
- 重复导入会按目录 SKU 更新，不会产生重复条目。
- 新商品增量导入应使用 `--insert-missing`，冲突 SKU 会直接跳过，不更新既有目录数据。
- 重复导入不会重新启用管理员已经停用的目录条目。
- 现有非 `JD-` 目录条目不会被修改。

## 本地预览

从京东公开移动商品页抓取商品名、品牌、规格选项、规格 SKU、链接和主图地址：

```bash
npm run procurement:scrape-jd-public -- \
  --skus 100202715039,100112164913 \
  --out outputs/jd-public-options.csv \
  --report outputs/jd-public-options-report.json
```

京东可能对短时间连续请求返回公开风控页。脚本会有限重试；仍失败时应稍后重试，不应尝试登录或绕过验证。

抓取结果中的 `price` 和 `price_status` 必须为空，报告中的 `priceDataCollected` 必须为 `false`。

预览规范化结果：

```bash
npm run procurement:import-catalog -- \
  --in /path/to/jd_products_options_with_prices.csv \
  --report outputs/procurement-catalog-import-report.json
```

预览不会连接数据库。必须检查报告中的：

- `rowCount` 是否等于 CSV 有效数据行数。
- `categories` 和 `families` 是否符合抓取范围。
- `missingPrices` 是否符合价格抓取结果。
- 是否出现未知商品族、重复 SKU、缺失包装数量或非法价格错误。

## 临时数据库演练

先恢复最新生产备份到临时数据库，再执行：

```bash
npm run procurement:import-catalog -- \
  --in /path/to/jd_products_options_with_prices.csv \
  --report /tmp/procurement-catalog-import-check.json \
  --database-url "$TEMP_DATABASE_URL" \
  --apply
```

连续执行两次。首次应报告新增条目，第二次应报告全部更新且目录总数不增长。

## 正式导入

1. 备份生产 PostgreSQL 数据库并生成校验和。
2. 确认应用代码已部署，目录 API 支持分页。
3. 对新增商品使用生产 `DATABASE_URL`、`--apply` 和 `--insert-missing` 执行导入：

```bash
npm run procurement:import-catalog -- \
  --in outputs/jd-public-options.csv \
  --report outputs/procurement-catalog-import-report.json \
  --insert-missing \
  --apply
```

4. 核对 `JD-%` 条目数量、分类数量和空价格数量。
5. 在 `/console/procurements` 搜索代表性规格并加入采购清单。

导入会写入 `procurement.catalog.bulk_import` 审计记录。出现任何解析或数据库错误时，当前批次事务会回滚。
