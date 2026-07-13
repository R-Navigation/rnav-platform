DO $compatibility$
DECLARE
  missing text;
  incompatible text;
BEGIN
  SELECT string_agg(required.table_name || '.' || required.column_name, ', ')
  INTO missing
  FROM (VALUES
    ('lab_platform_types', 'id'), ('lab_platform_types', 'code'),
    ('lab_platforms', 'id'), ('lab_platforms', 'code'),
    ('lab_assets', 'id'), ('lab_assets', 'code'),
    ('lab_platform_notes', 'id'), ('lab_platform_notes', 'platform_id'),
    ('lab_asset_notes', 'id'), ('lab_asset_notes', 'asset_id')
  ) AS required(table_name, column_name)
  WHERE to_regclass(current_schema() || '.' || required.table_name) IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = current_schema()
        AND c.table_name = required.table_name
        AND c.column_name = required.column_name
    );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Lab assets schema is missing required legacy column: %', missing;
  END IF;

  SELECT string_agg(table_name || '.' || column_name || ' has incompatible type ' || data_type, ', ')
  INTO incompatible
  FROM information_schema.columns
  WHERE table_schema = current_schema()
    AND ((table_name IN ('lab_platform_types', 'lab_platforms', 'lab_assets', 'lab_platform_notes', 'lab_asset_notes')
          AND column_name = 'id' AND data_type <> 'bigint')
      OR (table_name = 'lab_platforms' AND column_name = 'type_id' AND data_type <> 'bigint')
      OR (table_name = 'lab_assets' AND column_name = 'current_platform_id' AND data_type <> 'bigint')
      OR (table_name = 'lab_platform_notes' AND column_name = 'platform_id' AND data_type <> 'bigint')
      OR (table_name = 'lab_asset_notes' AND column_name = 'asset_id' AND data_type <> 'bigint')
      OR (column_name = 'sort_order' AND table_name LIKE 'lab_%' AND data_type <> 'integer'));
  IF incompatible IS NOT NULL THEN
    RAISE EXCEPTION 'Lab assets schema has incompatible type: %', incompatible;
  END IF;
END
$compatibility$;

ALTER TABLE IF EXISTS lab_platform_types
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS name_zh text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS name_en text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS description_zh text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS description_en text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE IF EXISTS lab_platforms
  ADD COLUMN IF NOT EXISTS type_id bigint,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS name_zh text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS name_en text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS description_zh text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS description_en text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status varchar(32) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE IF EXISTS lab_assets
  ADD COLUMN IF NOT EXISTS device_type_zh text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS device_type_en text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS model text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS name_zh text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS name_en text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS description_zh text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS description_en text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS vendor_serial text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status varchar(32) NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS current_platform_id bigint,
  ADD COLUMN IF NOT EXISTS share_scope varchar(32) NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE IF EXISTS lab_platform_notes
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS content_zh text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS content_en text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE IF EXISTS lab_asset_notes
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS content_zh text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS content_en text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
