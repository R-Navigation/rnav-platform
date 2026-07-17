CREATE TABLE IF NOT EXISTS lab_device_types (
  id bigserial PRIMARY KEY,
  code varchar(191) NOT NULL UNIQUE,
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO lab_platform_types(code,name_zh,name_en,description_zh,description_en,sort_order)
VALUES('uncategorized','未分类平台','Uncategorized Platforms','','',0)
ON CONFLICT(code) DO NOTHING;

UPDATE lab_platforms
SET type_id=(SELECT id FROM lab_platform_types WHERE code='uncategorized')
WHERE type_id IS NULL;

INSERT INTO lab_device_types(code,name)
SELECT 'device-' || substr(md5(type_name),1,12), type_name
FROM (
  SELECT DISTINCT COALESCE(NULLIF(btrim(device_type_zh),''),NULLIF(btrim(device_type_en),''),'未分类设备') type_name
  FROM lab_assets
) types
ON CONFLICT DO NOTHING;

ALTER TABLE lab_assets
  ADD COLUMN IF NOT EXISTS device_type_id bigint REFERENCES lab_device_types(id),
  ADD COLUMN IF NOT EXISTS assigned_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS borrower_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS borrower_contact text NOT NULL DEFAULT '';

UPDATE lab_assets assets
SET device_type_id=types.id
FROM lab_device_types types
WHERE assets.device_type_id IS NULL
  AND types.name=COALESCE(NULLIF(btrim(assets.device_type_zh),''),NULLIF(btrim(assets.device_type_en),''),'未分类设备');

ALTER TABLE lab_platforms ALTER COLUMN type_id SET NOT NULL;
ALTER TABLE lab_assets ALTER COLUMN device_type_id SET NOT NULL;

UPDATE lab_platforms SET status=CASE status
  WHEN 'active' THEN 'active'
  WHEN 'maintenance' THEN 'maintenance'
  WHEN 'lend' THEN 'lend'
  ELSE 'building'
END;

UPDATE lab_assets SET status=CASE
  WHEN current_platform_id IS NOT NULL THEN 'mounted'
  WHEN status='retired' THEN 'retired'
  WHEN status='maintenance' THEN 'maintenance'
  WHEN status='lend' THEN 'lend'
  ELSE 'idle'
END;

UPDATE lab_assets SET assigned_user_id=NULL;
UPDATE lab_assets
SET borrower_name=CASE WHEN status='lend' THEN COALESCE(NULLIF(btrim(borrower_name),''),'历史借用者（待补充）') ELSE '' END,
    borrower_contact=CASE WHEN status='lend' THEN COALESCE(NULLIF(btrim(borrower_contact),''),'待补充') ELSE '' END;

UPDATE lab_platforms platforms
SET description_zh=concat_ws(E'\n',NULLIF(btrim(platforms.description_zh),''),NULLIF(notes.content_zh,'')),
    description_en=concat_ws(E'\n',NULLIF(btrim(platforms.description_en),''),NULLIF(notes.content_en,''))
FROM (
  SELECT platform_id,string_agg(NULLIF(btrim(content_zh),''),E'\n' ORDER BY sort_order,id) content_zh,
    string_agg(NULLIF(btrim(content_en),''),E'\n' ORDER BY sort_order,id) content_en
  FROM lab_platform_notes GROUP BY platform_id
) notes
WHERE notes.platform_id=platforms.id;

UPDATE lab_assets assets
SET description_zh=concat_ws(E'\n',NULLIF(btrim(assets.description_zh),''),NULLIF(notes.content_zh,'')),
    description_en=concat_ws(E'\n',NULLIF(btrim(assets.description_en),''),NULLIF(notes.content_en,''))
FROM (
  SELECT asset_id,string_agg(NULLIF(btrim(content_zh),''),E'\n' ORDER BY sort_order,id) content_zh,
    string_agg(NULLIF(btrim(content_en),''),E'\n' ORDER BY sort_order,id) content_en
  FROM lab_asset_notes GROUP BY asset_id
) notes
WHERE notes.asset_id=assets.id;

CREATE TABLE IF NOT EXISTS lab_asset_usage_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id bigint NOT NULL REFERENCES lab_assets(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK(status IN ('pending','approved','rejected','cancelled')),
  reason text NOT NULL DEFAULT '',
  review_note text NOT NULL DEFAULT '',
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lab_asset_usage_pending_requester
  ON lab_asset_usage_requests(asset_id,requester_id)
  WHERE status='pending';
CREATE INDEX IF NOT EXISTS idx_lab_asset_usage_requests_status_created
  ON lab_asset_usage_requests(status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_assets_device_type_code
  ON lab_assets(device_type_id,code);
CREATE INDEX IF NOT EXISTS idx_lab_assets_assigned_user
  ON lab_assets(assigned_user_id) WHERE assigned_user_id IS NOT NULL;

DO $lab_asset_constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='lab_platforms_status_v2_check') THEN
    ALTER TABLE lab_platforms ADD CONSTRAINT lab_platforms_status_v2_check
      CHECK(status IN ('active','maintenance','building','lend','retired')) NOT VALID;
    ALTER TABLE lab_platforms VALIDATE CONSTRAINT lab_platforms_status_v2_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='lab_assets_status_v2_check') THEN
    ALTER TABLE lab_assets ADD CONSTRAINT lab_assets_status_v2_check
      CHECK(status IN ('idle','in_use','mounted','maintenance','lend','retired')) NOT VALID;
    ALTER TABLE lab_assets VALIDATE CONSTRAINT lab_assets_status_v2_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='lab_assets_state_fields_check') THEN
    ALTER TABLE lab_assets ADD CONSTRAINT lab_assets_state_fields_check CHECK(
      (status='mounted')=(current_platform_id IS NOT NULL)
      AND (status='in_use')=(assigned_user_id IS NOT NULL)
      AND (status='lend')=(NULLIF(btrim(borrower_name),'') IS NOT NULL AND NULLIF(btrim(borrower_contact),'') IS NOT NULL)
      AND (status='lend' OR (borrower_name='' AND borrower_contact=''))
    ) NOT VALID;
    ALTER TABLE lab_assets VALIDATE CONSTRAINT lab_assets_state_fields_check;
  END IF;
END
$lab_asset_constraints$;
