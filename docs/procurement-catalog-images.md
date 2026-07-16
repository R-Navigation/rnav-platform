# 标准件目录图片导入

图片文件名必须以京东商品 `source_sku` 开头，例如：

```text
100053385015_GUWANJI_GB.jpg
```

预览识别结果：

```bash
npm run procurement:import-images -- \
  --dir /path/to/jd_product_images \
  --report outputs/procurement-catalog-images-report.json
```

上传至 COS 并关联数据库：

```bash
npm run procurement:import-images -- \
  --dir /path/to/jd_product_images \
  --report outputs/procurement-catalog-images-report.json \
  --apply
```

同一商品下的所有规格共享一份主图。脚本按图片内容哈希生成对象路径，可重复执行；图片内容变化时会关联新资源，失去所有业务引用的旧资源自动进入回收站。
