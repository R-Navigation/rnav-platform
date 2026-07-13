DO $compatibility$
DECLARE
  incompatible text;
  unsafe text;
BEGIN
  SELECT string_agg(c.table_name || '.' || c.column_name || ' has incompatible type ' || c.data_type, ', ')
  INTO incompatible
  FROM information_schema.columns c
  JOIN (VALUES
    ('lab_platform_types','id','bigint'),('lab_platform_types','code','character varying'),('lab_platform_types','sort_order','integer'),
    ('lab_platform_types','name_zh','text'),('lab_platform_types','name_en','text'),('lab_platform_types','description_zh','text'),('lab_platform_types','description_en','text'),
    ('lab_platform_types','created_at','timestamp with time zone'),('lab_platform_types','updated_at','timestamp with time zone'),
    ('lab_platforms','id','bigint'),('lab_platforms','code','character varying'),('lab_platforms','type_id','bigint'),('lab_platforms','sort_order','integer'),
    ('lab_platforms','name_zh','text'),('lab_platforms','name_en','text'),('lab_platforms','description_zh','text'),('lab_platforms','description_en','text'),
    ('lab_platforms','status','character varying'),('lab_platforms','created_at','timestamp with time zone'),('lab_platforms','updated_at','timestamp with time zone'),
    ('lab_assets','id','bigint'),('lab_assets','code','character varying'),('lab_assets','device_type_zh','text'),('lab_assets','device_type_en','text'),
    ('lab_assets','model','text'),('lab_assets','name_zh','text'),('lab_assets','name_en','text'),('lab_assets','description_zh','text'),('lab_assets','description_en','text'),
    ('lab_assets','vendor_serial','text'),('lab_assets','status','character varying'),('lab_assets','current_platform_id','bigint'),('lab_assets','share_scope','character varying'),
    ('lab_assets','sort_order','integer'),('lab_assets','created_at','timestamp with time zone'),('lab_assets','updated_at','timestamp with time zone'),
    ('lab_platform_notes','id','bigint'),('lab_platform_notes','platform_id','bigint'),('lab_platform_notes','sort_order','integer'),
    ('lab_platform_notes','content_zh','text'),('lab_platform_notes','content_en','text'),('lab_platform_notes','created_at','timestamp with time zone'),('lab_platform_notes','updated_at','timestamp with time zone'),
    ('lab_asset_notes','id','bigint'),('lab_asset_notes','asset_id','bigint'),('lab_asset_notes','sort_order','integer'),
    ('lab_asset_notes','content_zh','text'),('lab_asset_notes','content_en','text'),('lab_asset_notes','created_at','timestamp with time zone'),('lab_asset_notes','updated_at','timestamp with time zone')
  ) expected(table_name,column_name,data_type)
    ON expected.table_name = c.table_name AND expected.column_name = c.column_name
  WHERE c.table_schema = current_schema() AND c.data_type <> expected.data_type;
  IF incompatible IS NOT NULL THEN
    RAISE EXCEPTION 'Lab assets schema has incompatible type: %', incompatible;
  END IF;

  SELECT string_agg(table_name || '.' || column_name, ', ')
  INTO unsafe
  FROM information_schema.columns
  WHERE table_schema = current_schema()
    AND ((table_name IN ('lab_platform_types','lab_platforms','lab_assets') AND column_name IN ('id','code') AND is_nullable = 'YES')
      OR (table_name = 'lab_platform_notes' AND column_name IN ('id','platform_id') AND is_nullable = 'YES')
      OR (table_name = 'lab_asset_notes' AND column_name IN ('id','asset_id') AND is_nullable = 'YES')
      OR (table_name LIKE 'lab_%' AND column_name = 'id' AND (column_default IS NULL OR column_default NOT LIKE 'nextval%'))
      OR (table_name LIKE 'lab_%' AND column_name NOT IN ('type_id','current_platform_id') AND is_nullable = 'YES')
      OR (column_name IN ('type_id','current_platform_id') AND is_nullable <> 'YES')
      OR (table_name IN ('lab_platform_types','lab_platforms','lab_assets') AND column_name = 'code' AND character_maximum_length IS DISTINCT FROM 191)
      OR (table_name LIKE 'lab_%' AND column_name IN ('sort_order','created_at','updated_at') AND column_default IS NULL)
      OR (table_name = 'lab_platforms' AND column_name = 'status' AND column_default IS NULL)
      OR (table_name = 'lab_assets' AND column_name IN ('status','share_scope') AND column_default IS NULL));
  IF unsafe IS NOT NULL THEN
    RAISE EXCEPTION 'Lab assets schema has unsafe nullability or sequence default: %', unsafe;
  END IF;

  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('lab_platform_types'), ('lab_platforms'), ('lab_assets'), ('lab_platform_notes'), ('lab_asset_notes')
    ) tables(table_name)
    JOIN pg_constraint c ON c.conrelid = to_regclass(current_schema() || '.' || tables.table_name) AND c.contype = 'p'
    WHERE c.conkey <> ARRAY[(SELECT attnum FROM pg_attribute
      WHERE attrelid = to_regclass(current_schema() || '.' || tables.table_name) AND attname = 'id')]
  ) THEN
    RAISE EXCEPTION 'Lab assets schema has a primary key on a column other than id';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = to_regclass(current_schema() || '.lab_platforms') AND c.contype = 'f'
      AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = to_regclass(current_schema() || '.lab_platforms') AND attname = 'type_id')]
      AND (c.confrelid <> to_regclass(current_schema() || '.lab_platform_types')
        OR c.confkey <> ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = to_regclass(current_schema() || '.lab_platform_types') AND attname = 'id')]
        OR c.confdeltype <> 'n')
  ) OR EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = to_regclass(current_schema() || '.lab_assets') AND c.contype = 'f'
      AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = to_regclass(current_schema() || '.lab_assets') AND attname = 'current_platform_id')]
      AND (c.confrelid <> to_regclass(current_schema() || '.lab_platforms')
        OR c.confkey <> ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = to_regclass(current_schema() || '.lab_platforms') AND attname = 'id')]
        OR c.confdeltype <> 'n')
  ) OR EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = to_regclass(current_schema() || '.lab_platform_notes') AND c.contype = 'f'
      AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = to_regclass(current_schema() || '.lab_platform_notes') AND attname = 'platform_id')]
      AND (c.confrelid <> to_regclass(current_schema() || '.lab_platforms')
        OR c.confkey <> ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = to_regclass(current_schema() || '.lab_platforms') AND attname = 'id')]
        OR c.confdeltype <> 'c')
  ) OR EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = to_regclass(current_schema() || '.lab_asset_notes') AND c.contype = 'f'
      AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = to_regclass(current_schema() || '.lab_asset_notes') AND attname = 'asset_id')]
      AND (c.confrelid <> to_regclass(current_schema() || '.lab_assets')
        OR c.confkey <> ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = to_regclass(current_schema() || '.lab_assets') AND attname = 'id')]
        OR c.confdeltype <> 'c')
  ) THEN
    RAISE EXCEPTION 'Lab assets schema has incompatible foreign key target or delete action';
  END IF;
END
$compatibility$;

DO $constraints$
BEGIN
  IF to_regclass(current_schema() || '.lab_platform_types') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'lab_platform_types'::regclass AND contype = 'p' AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'lab_platform_types'::regclass AND attname = 'id')]) THEN
      ALTER TABLE lab_platform_types ADD CONSTRAINT lab_platform_types_pkey PRIMARY KEY (id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'lab_platform_types'::regclass AND contype = 'u' AND pg_get_constraintdef(oid) = 'UNIQUE (code)') THEN
      ALTER TABLE lab_platform_types ADD CONSTRAINT lab_platform_types_code_key UNIQUE (code);
    END IF;
  END IF;
  IF to_regclass(current_schema() || '.lab_platforms') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'lab_platforms'::regclass AND contype = 'p' AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'lab_platforms'::regclass AND attname = 'id')]) THEN
      ALTER TABLE lab_platforms ADD CONSTRAINT lab_platforms_pkey PRIMARY KEY (id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'lab_platforms'::regclass AND contype = 'u' AND pg_get_constraintdef(oid) = 'UNIQUE (code)') THEN
      ALTER TABLE lab_platforms ADD CONSTRAINT lab_platforms_code_key UNIQUE (code);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'lab_platforms'::regclass AND contype = 'f' AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'lab_platforms'::regclass AND attname = 'type_id')] AND confrelid = 'lab_platform_types'::regclass AND confkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'lab_platform_types'::regclass AND attname = 'id')] AND confdeltype = 'n') THEN
      ALTER TABLE lab_platforms ADD CONSTRAINT lab_platforms_type_id_fkey FOREIGN KEY (type_id) REFERENCES lab_platform_types(id) ON DELETE SET NULL;
    END IF;
  END IF;
  IF to_regclass(current_schema() || '.lab_assets') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'lab_assets'::regclass AND contype = 'p' AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'lab_assets'::regclass AND attname = 'id')]) THEN
      ALTER TABLE lab_assets ADD CONSTRAINT lab_assets_pkey PRIMARY KEY (id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'lab_assets'::regclass AND contype = 'u' AND pg_get_constraintdef(oid) = 'UNIQUE (code)') THEN
      ALTER TABLE lab_assets ADD CONSTRAINT lab_assets_code_key UNIQUE (code);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'lab_assets'::regclass AND contype = 'f' AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'lab_assets'::regclass AND attname = 'current_platform_id')] AND confrelid = 'lab_platforms'::regclass AND confkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'lab_platforms'::regclass AND attname = 'id')] AND confdeltype = 'n') THEN
      ALTER TABLE lab_assets ADD CONSTRAINT lab_assets_current_platform_id_fkey FOREIGN KEY (current_platform_id) REFERENCES lab_platforms(id) ON DELETE SET NULL;
    END IF;
  END IF;
  IF to_regclass(current_schema() || '.lab_platform_notes') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'lab_platform_notes'::regclass AND contype = 'p' AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'lab_platform_notes'::regclass AND attname = 'id')]) THEN
      ALTER TABLE lab_platform_notes ADD CONSTRAINT lab_platform_notes_pkey PRIMARY KEY (id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'lab_platform_notes'::regclass AND contype = 'f' AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'lab_platform_notes'::regclass AND attname = 'platform_id')] AND confrelid = 'lab_platforms'::regclass AND confkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'lab_platforms'::regclass AND attname = 'id')] AND confdeltype = 'c') THEN
      ALTER TABLE lab_platform_notes ADD CONSTRAINT lab_platform_notes_platform_id_fkey FOREIGN KEY (platform_id) REFERENCES lab_platforms(id) ON DELETE CASCADE;
    END IF;
  END IF;
  IF to_regclass(current_schema() || '.lab_asset_notes') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'lab_asset_notes'::regclass AND contype = 'p' AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'lab_asset_notes'::regclass AND attname = 'id')]) THEN
      ALTER TABLE lab_asset_notes ADD CONSTRAINT lab_asset_notes_pkey PRIMARY KEY (id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'lab_asset_notes'::regclass AND contype = 'f' AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'lab_asset_notes'::regclass AND attname = 'asset_id')] AND confrelid = 'lab_assets'::regclass AND confkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'lab_assets'::regclass AND attname = 'id')] AND confdeltype = 'c') THEN
      ALTER TABLE lab_asset_notes ADD CONSTRAINT lab_asset_notes_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES lab_assets(id) ON DELETE CASCADE;
    END IF;
  END IF;
END
$constraints$;
