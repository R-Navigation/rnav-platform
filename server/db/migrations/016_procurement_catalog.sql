CREATE TABLE IF NOT EXISTS procurement_catalog_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_zh text NOT NULL,
  name_en text NOT NULL DEFAULT '',
  description_zh text NOT NULL DEFAULT '',
  description_en text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS procurement_catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES procurement_catalog_categories(id),
  sku text UNIQUE,
  name_zh text NOT NULL,
  name_en text NOT NULL DEFAULT '',
  spec text NOT NULL DEFAULT '',
  spec_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  unit text NOT NULL DEFAULT '件',
  pack_size numeric(12,2) NOT NULL DEFAULT 1 CHECK (pack_size > 0),
  estimated_unit_price numeric(12,2) CHECK (estimated_unit_price IS NULL OR estimated_unit_price >= 0),
  vendor text,
  url text,
  keywords text[] NOT NULL DEFAULT '{}',
  image_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE procurement_request_items
  ADD COLUMN IF NOT EXISTS catalog_item_id uuid REFERENCES procurement_catalog_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT '件',
  ADD COLUMN IF NOT EXISTS catalog_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $source_type$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'procurement_request_items'::regclass
      AND conname = 'procurement_request_items_source_type_check'
  ) THEN
    ALTER TABLE procurement_request_items
      ADD CONSTRAINT procurement_request_items_source_type_check
      CHECK (source_type IN ('catalog', 'custom'));
  END IF;
END
$source_type$;

CREATE INDEX IF NOT EXISTS idx_procurement_catalog_categories_active_sort
  ON procurement_catalog_categories(is_active, sort_order, name_zh);
CREATE INDEX IF NOT EXISTS idx_procurement_catalog_items_category_active
  ON procurement_catalog_items(category_id, is_active, name_zh, spec);
CREATE INDEX IF NOT EXISTS idx_procurement_catalog_items_keywords
  ON procurement_catalog_items USING gin(keywords);
CREATE INDEX IF NOT EXISTS idx_procurement_request_items_catalog_item
  ON procurement_request_items(catalog_item_id)
  WHERE catalog_item_id IS NOT NULL;

INSERT INTO procurement_catalog_categories
  (code, name_zh, name_en, description_zh, sort_order)
VALUES
  ('bolts', '螺栓', 'Bolts', '内六角、外六角等常用螺栓', 10),
  ('nuts', '螺母', 'Nuts', '六角螺母、锁紧螺母等', 20),
  ('studs-rods', '螺柱/螺杆', 'Studs and threaded rods', '双头螺柱与全牙螺杆', 30),
  ('washers', '垫圈', 'Washers', '平垫、弹垫等', 40),
  ('bearings', '轴承', 'Bearings', '常用滚动轴承与轴承配件', 50),
  ('profiles-connectors', '型材与连接件', 'Profiles and connectors', '铝型材及角件、连接板', 60),
  ('cables-connectors', '线缆与接插件', 'Cables and connectors', '线缆、端子和接插件', 70),
  ('electronics', '电子元器件', 'Electronics', '常用电子元器件与模块', 80),
  ('sensor-accessories', '传感器配件', 'Sensor accessories', '安装支架、保护件和转接件', 90),
  ('other-standard', '其他标准件', 'Other standard parts', '其他可重复采购的标准物料', 100)
ON CONFLICT (code) DO NOTHING;

INSERT INTO procurement_catalog_items
  (category_id, sku, name_zh, name_en, spec, spec_metadata, unit, pack_size, keywords)
SELECT categories.id, seed.sku, seed.name_zh, seed.name_en, seed.spec,
  seed.metadata::jsonb, seed.unit, seed.pack_size, seed.keywords
FROM (VALUES
  ('bolts', 'BOLT-SHCS-M3X8', '内六角圆柱头螺钉', 'Socket head cap screw', 'M3x8', '{"thread":"M3","lengthMm":8,"head":"socket"}', '个', 1::numeric, ARRAY['螺栓','螺钉','内六角','M3']),
  ('bolts', 'BOLT-SHCS-M3X12', '内六角圆柱头螺钉', 'Socket head cap screw', 'M3x12', '{"thread":"M3","lengthMm":12,"head":"socket"}', '个', 1::numeric, ARRAY['螺栓','螺钉','内六角','M3']),
  ('bolts', 'BOLT-SHCS-M4X10', '内六角圆柱头螺钉', 'Socket head cap screw', 'M4x10', '{"thread":"M4","lengthMm":10,"head":"socket"}', '个', 1::numeric, ARRAY['螺栓','螺钉','内六角','M4']),
  ('bolts', 'BOLT-SHCS-M4X16', '内六角圆柱头螺钉', 'Socket head cap screw', 'M4x16', '{"thread":"M4","lengthMm":16,"head":"socket"}', '个', 1::numeric, ARRAY['螺栓','螺钉','内六角','M4']),
  ('bolts', 'BOLT-SHCS-M5X20', '内六角圆柱头螺钉', 'Socket head cap screw', 'M5x20', '{"thread":"M5","lengthMm":20,"head":"socket"}', '个', 1::numeric, ARRAY['螺栓','螺钉','内六角','M5']),
  ('bolts', 'BOLT-SHCS-M6X20', '内六角圆柱头螺钉', 'Socket head cap screw', 'M6x20', '{"thread":"M6","lengthMm":20,"head":"socket"}', '个', 1::numeric, ARRAY['螺栓','螺钉','内六角','M6']),
  ('nuts', 'NUT-HEX-M3', '六角螺母', 'Hex nut', 'M3', '{"thread":"M3"}', '个', 1::numeric, ARRAY['螺母','六角','M3']),
  ('nuts', 'NUT-HEX-M4', '六角螺母', 'Hex nut', 'M4', '{"thread":"M4"}', '个', 1::numeric, ARRAY['螺母','六角','M4']),
  ('nuts', 'NUT-HEX-M5', '六角螺母', 'Hex nut', 'M5', '{"thread":"M5"}', '个', 1::numeric, ARRAY['螺母','六角','M5']),
  ('nuts', 'NUT-HEX-M6', '六角螺母', 'Hex nut', 'M6', '{"thread":"M6"}', '个', 1::numeric, ARRAY['螺母','六角','M6']),
  ('washers', 'WASHER-FLAT-M3', '平垫圈', 'Flat washer', 'M3', '{"thread":"M3","type":"flat"}', '个', 1::numeric, ARRAY['垫圈','平垫','M3']),
  ('washers', 'WASHER-FLAT-M4', '平垫圈', 'Flat washer', 'M4', '{"thread":"M4","type":"flat"}', '个', 1::numeric, ARRAY['垫圈','平垫','M4']),
  ('washers', 'WASHER-FLAT-M5', '平垫圈', 'Flat washer', 'M5', '{"thread":"M5","type":"flat"}', '个', 1::numeric, ARRAY['垫圈','平垫','M5']),
  ('washers', 'WASHER-FLAT-M6', '平垫圈', 'Flat washer', 'M6', '{"thread":"M6","type":"flat"}', '个', 1::numeric, ARRAY['垫圈','平垫','M6']),
  ('studs-rods', 'ROD-THREADED-M5', '全牙螺杆', 'Threaded rod', 'M5x1000mm', '{"thread":"M5","lengthMm":1000}', '根', 1::numeric, ARRAY['螺杆','丝杆','全牙','M5']),
  ('studs-rods', 'ROD-THREADED-M6', '全牙螺杆', 'Threaded rod', 'M6x1000mm', '{"thread":"M6","lengthMm":1000}', '根', 1::numeric, ARRAY['螺杆','丝杆','全牙','M6'])
) AS seed(category_code, sku, name_zh, name_en, spec, metadata, unit, pack_size, keywords)
JOIN procurement_catalog_categories categories ON categories.code = seed.category_code
ON CONFLICT (sku) DO NOTHING;
