CREATE TABLE IF NOT EXISTS procurement_catalog_subcategories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES procurement_catalog_categories(id) ON DELETE RESTRICT,
  code text NOT NULL,
  name_zh text NOT NULL,
  name_en text NOT NULL DEFAULT '',
  description_zh text NOT NULL DEFAULT '',
  description_en text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(category_id, code)
);

CREATE TABLE IF NOT EXISTS procurement_catalog_attribute_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subcategory_id uuid NOT NULL REFERENCES procurement_catalog_subcategories(id) ON DELETE CASCADE,
  attribute_key text NOT NULL,
  label_zh text NOT NULL,
  label_en text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT '',
  value_type text NOT NULL DEFAULT 'text' CHECK (value_type IN ('text', 'number', 'multi')),
  sort_order integer NOT NULL DEFAULT 0,
  is_filterable boolean NOT NULL DEFAULT true,
  UNIQUE(subcategory_id, attribute_key)
);

ALTER TABLE procurement_catalog_items
  ADD COLUMN IF NOT EXISTS subcategory_id uuid REFERENCES procurement_catalog_subcategories(id) ON DELETE RESTRICT;

INSERT INTO procurement_catalog_subcategories
  (category_id, code, name_zh, name_en, sort_order)
SELECT categories.id, seed.code, seed.name_zh, seed.name_en, seed.sort_order
FROM (VALUES
  ('bolts', 'socket-head-cap-screw', '内六角圆柱头螺钉', 'Socket head cap screw', 10),
  ('bolts', 'phillips-low-profile-screw', '十字薄头螺钉', 'Phillips low profile screw', 20),
  ('nuts', 'hex-nut', '六角螺母', 'Hex nut', 10),
  ('nuts', 'nylon-insert-lock-nut', '尼龙锁紧螺母', 'Nylon insert lock nut', 20),
  ('washers', 'flat-washer', '平垫圈', 'Flat washer', 10),
  ('studs-rods', 'female-female-hex-standoff', '铜双通六角隔离柱', 'Brass female-female hex standoff', 10),
  ('studs-rods', 'male-female-hex-standoff', '铜单通六角隔离柱', 'Brass male-female hex standoff', 20),
  ('studs-rods', 'stainless-female-female-hex-standoff', '不锈钢双通六角隔离柱', 'Stainless female-female hex standoff', 30)
) AS seed(category_code, code, name_zh, name_en, sort_order)
JOIN procurement_catalog_categories categories ON categories.code=seed.category_code
ON CONFLICT (category_id, code) DO UPDATE SET
  name_zh=EXCLUDED.name_zh,
  name_en=EXCLUDED.name_en,
  sort_order=EXCLUDED.sort_order,
  updated_at=now();

INSERT INTO procurement_catalog_subcategories
  (category_id, code, name_zh, name_en, sort_order)
SELECT id, 'other', '其他', 'Other', 10000
FROM procurement_catalog_categories
ON CONFLICT (category_id, code) DO NOTHING;

UPDATE procurement_catalog_items items
SET subcategory_id=subcategories.id
FROM procurement_catalog_subcategories subcategories
WHERE subcategories.category_id=items.category_id
  AND subcategories.code=COALESCE(NULLIF(items.spec_metadata->>'productFamily',''), 'other');

UPDATE procurement_catalog_items items
SET subcategory_id=subcategories.id
FROM procurement_catalog_subcategories subcategories
WHERE items.subcategory_id IS NULL
  AND subcategories.category_id=items.category_id
  AND subcategories.code='other';

ALTER TABLE procurement_catalog_items ALTER COLUMN subcategory_id SET NOT NULL;

-- Earlier public option parsing sometimes appended material grades to nut thread sizes.
UPDATE procurement_catalog_items
SET spec_metadata=jsonb_set(
  spec_metadata,
  '{thread}',
  to_jsonb((regexp_match(spec_metadata->>'rawOptionValues', '(?:规格|型号)=H?(M[0-9]+(?:\.[0-9]+)?)(?:x[0-9.]+牙)?', 'i'))[1]),
  true
)
WHERE spec_metadata->>'productFamily' IN ('hex-nut','nylon-insert-lock-nut')
  AND spec_metadata ? 'rawOptionValues'
  AND regexp_match(spec_metadata->>'rawOptionValues', '(?:规格|型号)=H?(M[0-9]+(?:\.[0-9]+)?)(?:x[0-9.]+牙)?', 'i') IS NOT NULL;

INSERT INTO procurement_catalog_attribute_definitions
  (subcategory_id, attribute_key, label_zh, label_en, unit, value_type, sort_order, is_filterable)
SELECT DISTINCT subcategories.id, attributes.attribute_key, attributes.label_zh, attributes.label_en,
  attributes.unit, attributes.value_type, attributes.sort_order, true
FROM procurement_catalog_subcategories subcategories
JOIN procurement_catalog_items items ON items.subcategory_id=subcategories.id
JOIN LATERAL (VALUES
  ('thread', '尺寸', 'Thread size', '', 'text', 10),
  ('lengthMm', '长度', 'Length', 'mm', 'number', 20),
  ('headDiameterMm', '螺头直径', 'Head diameter', 'mm', 'number', 30),
  ('bodyLengthMm', '柱体长度', 'Body length', 'mm', 'number', 20),
  ('maleThreadLengthMm', '外螺纹长度', 'Male thread length', 'mm', 'number', 30),
  ('hexWidthMm', '对边尺寸', 'Across flats', 'mm', 'number', 40),
  ('outerDiameterMm', '外径', 'Outer diameter', 'mm', 'number', 20),
  ('thicknessMm', '厚度', 'Thickness', 'mm', 'number', 30),
  ('threadPitchMm', '螺距', 'Thread pitch', 'mm', 'number', 20),
  ('material', '材料', 'Material', '', 'text', 50),
  ('variants', '特性', 'Variants', '', 'multi', 60),
  ('standard', '标准', 'Standard', '', 'text', 70),
  ('packQuantity', '每包数量', 'Pack quantity', '个', 'number', 80),
  ('brand', '品牌', 'Brand', '', 'text', 90),
  ('leadTime', '货期', 'Lead time', '', 'text', 100)
) AS attributes(attribute_key, label_zh, label_en, unit, value_type, sort_order)
  ON items.spec_metadata ? attributes.attribute_key
ON CONFLICT (subcategory_id, attribute_key) DO UPDATE SET
  label_zh=EXCLUDED.label_zh,
  label_en=EXCLUDED.label_en,
  unit=EXCLUDED.unit,
  value_type=EXCLUDED.value_type,
  sort_order=EXCLUDED.sort_order;

ALTER TABLE procurement_request_items
  ADD COLUMN IF NOT EXISTS processing_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS processed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;

DO $processing_status$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='procurement_request_items'::regclass
      AND conname='procurement_request_items_processing_status_check'
  ) THEN
    ALTER TABLE procurement_request_items
      ADD CONSTRAINT procurement_request_items_processing_status_check
      CHECK (processing_status IN ('pending','purchased','rejected'));
  END IF;
END
$processing_status$;

DO $rejection_reason$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='procurement_request_items'::regclass
      AND conname='procurement_request_items_rejection_reason_check'
  ) THEN
    ALTER TABLE procurement_request_items
      ADD CONSTRAINT procurement_request_items_rejection_reason_check
      CHECK (processing_status <> 'rejected' OR NULLIF(btrim(rejection_reason), '') IS NOT NULL);
  END IF;
END
$rejection_reason$;

CREATE INDEX IF NOT EXISTS idx_procurement_catalog_subcategories_category_sort
  ON procurement_catalog_subcategories(category_id, is_active, sort_order, name_zh);
CREATE INDEX IF NOT EXISTS idx_procurement_catalog_items_subcategory_active
  ON procurement_catalog_items(subcategory_id, is_active, name_zh, spec);
CREATE INDEX IF NOT EXISTS idx_procurement_catalog_items_spec_metadata
  ON procurement_catalog_items USING gin(spec_metadata);
CREATE INDEX IF NOT EXISTS idx_procurement_request_items_processing
  ON procurement_request_items(request_id, processing_status, sort_order);
