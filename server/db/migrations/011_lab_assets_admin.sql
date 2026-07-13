CREATE TABLE IF NOT EXISTS lab_platform_types (
  id bigserial PRIMARY KEY,
  code varchar(191) NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  name_zh text NOT NULL DEFAULT '',
  name_en text NOT NULL DEFAULT '',
  description_zh text NOT NULL DEFAULT '',
  description_en text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lab_platforms (
  id bigserial PRIMARY KEY,
  code varchar(191) NOT NULL UNIQUE,
  type_id bigint REFERENCES lab_platform_types(id),
  sort_order integer NOT NULL DEFAULT 0,
  name_zh text NOT NULL DEFAULT '',
  name_en text NOT NULL DEFAULT '',
  description_zh text NOT NULL DEFAULT '',
  description_en text NOT NULL DEFAULT '',
  status varchar(32) NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lab_assets (
  id bigserial PRIMARY KEY,
  code varchar(191) NOT NULL UNIQUE,
  device_type_zh text NOT NULL DEFAULT '',
  device_type_en text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT '',
  name_zh text NOT NULL DEFAULT '',
  name_en text NOT NULL DEFAULT '',
  description_zh text NOT NULL DEFAULT '',
  description_en text NOT NULL DEFAULT '',
  vendor_serial text NOT NULL DEFAULT '',
  status varchar(32) NOT NULL DEFAULT 'idle',
  current_platform_id bigint REFERENCES lab_platforms(id),
  share_scope varchar(32) NOT NULL DEFAULT 'private',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lab_platform_notes (
  id bigserial PRIMARY KEY,
  platform_id bigint NOT NULL REFERENCES lab_platforms(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  content_zh text NOT NULL DEFAULT '',
  content_en text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lab_asset_notes (
  id bigserial PRIMARY KEY,
  asset_id bigint NOT NULL REFERENCES lab_assets(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  content_zh text NOT NULL DEFAULT '',
  content_en text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $compatibility$
DECLARE
  incompatible text;
BEGIN
  SELECT string_agg(table_name || '.' || column_name || ' has incompatible type ' || data_type, ', ')
  INTO incompatible
  FROM information_schema.columns
  WHERE table_schema = current_schema()
    AND ((table_name = 'lab_platform_types' AND column_name IN ('id', 'sort_order') AND data_type NOT IN ('bigint', 'integer'))
      OR (table_name = 'lab_platforms' AND column_name IN ('id', 'type_id') AND data_type <> 'bigint')
      OR (table_name = 'lab_assets' AND column_name IN ('id', 'current_platform_id') AND data_type <> 'bigint')
      OR (table_name = 'lab_platform_notes' AND column_name IN ('id', 'platform_id') AND data_type <> 'bigint')
      OR (table_name = 'lab_asset_notes' AND column_name IN ('id', 'asset_id') AND data_type <> 'bigint'));
  IF incompatible IS NOT NULL THEN
    RAISE EXCEPTION 'Lab assets schema has incompatible type: %', incompatible;
  END IF;
END
$compatibility$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lab_platform_types_code ON lab_platform_types(code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lab_platforms_code ON lab_platforms(code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lab_assets_code ON lab_assets(code);
CREATE INDEX IF NOT EXISTS idx_lab_platform_types_sort ON lab_platform_types(sort_order, code);
CREATE INDEX IF NOT EXISTS idx_lab_platforms_type_sort ON lab_platforms(type_id, sort_order, code);
CREATE INDEX IF NOT EXISTS idx_lab_assets_platform_sort ON lab_assets(current_platform_id, sort_order, code);
CREATE INDEX IF NOT EXISTS idx_lab_platform_notes_platform_sort ON lab_platform_notes(platform_id, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_lab_asset_notes_asset_sort ON lab_asset_notes(asset_id, sort_order, id);

INSERT INTO site_content_revisions (module_key)
VALUES ('lab-assets')
ON CONFLICT (module_key) DO NOTHING;
