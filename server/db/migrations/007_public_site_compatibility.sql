-- Completes partially deployed legacy public-site schemas without rewriting 006.
DO $compatibility$
DECLARE
  expected record;
  actual_type text;
BEGIN
  FOR expected IN
    SELECT * FROM (VALUES
      ('page_content', 'page_key', 'text'), ('page_content', 'content_json', 'jsonb'),
      ('research_items', 'id', 'text'), ('research_items', 'sort_order', 'int4'), ('research_items', 'publication_year', 'int4'),
      ('research_items', 'image_asset_id', 'uuid'), ('research_items', 'pdf_asset_id', 'uuid'),
      ('research_item_keywords', 'id', 'int8'), ('research_item_keywords', 'research_item_id', 'text'), ('research_item_keywords', 'sort_order', 'int4'),
      ('research_item_authors', 'id', 'int8'), ('research_item_authors', 'research_item_id', 'text'), ('research_item_authors', 'sort_order', 'int4'), ('research_item_authors', 'highlight', 'bool'),
      ('research_item_links', 'id', 'int8'), ('research_item_links', 'research_item_id', 'text'), ('research_item_links', 'sort_order', 'int4'),
      ('news_items', 'id', 'text'), ('news_items', 'sort_order', 'int4'), ('news_items', 'featured', 'bool'), ('news_items', 'image_asset_id', 'uuid'),
      ('team_members', 'id', 'int8'), ('team_members', 'sort_order', 'int4'), ('team_members', 'image_asset_id', 'uuid'),
      ('team_member_links', 'id', 'int8'), ('team_member_links', 'team_member_id', 'int8'), ('team_member_links', 'sort_order', 'int4'),
      ('team_member_contacts', 'id', 'int8'), ('team_member_contacts', 'team_member_id', 'int8'), ('team_member_contacts', 'sort_order', 'int4'),
      ('facility_items', 'id', 'int8'), ('facility_items', 'sort_order', 'int4'), ('facility_items', 'image_asset_id', 'uuid'),
      ('facility_item_specs', 'id', 'int8'), ('facility_item_specs', 'facility_item_id', 'int8'), ('facility_item_specs', 'sort_order', 'int4'),
      ('contact_primary_channels', 'id', 'int8'), ('contact_primary_channels', 'sort_order', 'int4'),
      ('contact_social_links', 'id', 'int8'), ('contact_social_links', 'sort_order', 'int4'),
      ('contact_extra_cards', 'id', 'int8'), ('contact_extra_cards', 'sort_order', 'int4')
    ) AS required(table_name, column_name, expected_udt)
  LOOP
    SELECT columns.udt_name INTO actual_type
    FROM information_schema.columns
    WHERE columns.table_schema = current_schema()
      AND columns.table_name = expected.table_name
      AND columns.column_name = expected.column_name;
    IF actual_type IS NOT NULL AND actual_type <> expected.expected_udt THEN
      RAISE EXCEPTION 'Public-site compatibility migration: %.% has incompatible type %, expected %',
        expected.table_name, expected.column_name, actual_type, expected.expected_udt;
    END IF;
  END LOOP;
END
$compatibility$;

ALTER TABLE page_content
  ADD COLUMN IF NOT EXISTS page_key text,
  ADD COLUMN IF NOT EXISTS content_json jsonb DEFAULT '{}'::jsonb;

ALTER TABLE research_items
  ADD COLUMN IF NOT EXISTS id text, ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS title_zh text DEFAULT '', ADD COLUMN IF NOT EXISTS title_en text DEFAULT '', ADD COLUMN IF NOT EXISTS publication_year integer,
  ADD COLUMN IF NOT EXISTS venue_zh text DEFAULT '', ADD COLUMN IF NOT EXISTS venue_en text DEFAULT '', ADD COLUMN IF NOT EXISTS publication_type text DEFAULT '', ADD COLUMN IF NOT EXISTS topic text DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_asset_id uuid, ADD COLUMN IF NOT EXISTS image_src text, ADD COLUMN IF NOT EXISTS image_alt text, ADD COLUMN IF NOT EXISTS image_data_alt text,
  ADD COLUMN IF NOT EXISTS pdf_asset_id uuid, ADD COLUMN IF NOT EXISTS pdf_src text, ADD COLUMN IF NOT EXISTS pdf_label_zh text, ADD COLUMN IF NOT EXISTS pdf_label_en text;
ALTER TABLE research_item_keywords
  ADD COLUMN IF NOT EXISTS id bigint, ADD COLUMN IF NOT EXISTS research_item_id text, ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS value_zh text DEFAULT '', ADD COLUMN IF NOT EXISTS value_en text DEFAULT '';
ALTER TABLE research_item_authors
  ADD COLUMN IF NOT EXISTS id bigint, ADD COLUMN IF NOT EXISTS research_item_id text, ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS name_zh text DEFAULT '', ADD COLUMN IF NOT EXISTS name_en text DEFAULT '', ADD COLUMN IF NOT EXISTS highlight boolean DEFAULT false;
ALTER TABLE research_item_links
  ADD COLUMN IF NOT EXISTS id bigint, ADD COLUMN IF NOT EXISTS research_item_id text, ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS label_zh text DEFAULT '', ADD COLUMN IF NOT EXISTS label_en text DEFAULT '', ADD COLUMN IF NOT EXISTS href text DEFAULT '', ADD COLUMN IF NOT EXISTS icon text DEFAULT '';

ALTER TABLE news_items
  ADD COLUMN IF NOT EXISTS id text, ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS date_zh text DEFAULT '', ADD COLUMN IF NOT EXISTS date_en text DEFAULT '', ADD COLUMN IF NOT EXISTS badge_zh text DEFAULT '', ADD COLUMN IF NOT EXISTS badge_en text DEFAULT '', ADD COLUMN IF NOT EXISTS badge_tone text DEFAULT 'cyan',
  ADD COLUMN IF NOT EXISTS title_zh text DEFAULT '', ADD COLUMN IF NOT EXISTS title_en text DEFAULT '', ADD COLUMN IF NOT EXISTS description_zh text DEFAULT '', ADD COLUMN IF NOT EXISTS description_en text DEFAULT '', ADD COLUMN IF NOT EXISTS excerpt_zh text DEFAULT '', ADD COLUMN IF NOT EXISTS excerpt_en text DEFAULT '', ADD COLUMN IF NOT EXISTS featured boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS image_asset_id uuid, ADD COLUMN IF NOT EXISTS image_src text, ADD COLUMN IF NOT EXISTS image_alt text, ADD COLUMN IF NOT EXISTS image_data_alt text,
  ADD COLUMN IF NOT EXISTS link_label_zh text, ADD COLUMN IF NOT EXISTS link_label_en text, ADD COLUMN IF NOT EXISTS link_href text, ADD COLUMN IF NOT EXISTS link_icon text;

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS id bigint, ADD COLUMN IF NOT EXISTS slug text, ADD COLUMN IF NOT EXISTS group_key text, ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS name_zh text DEFAULT '', ADD COLUMN IF NOT EXISTS name_en text DEFAULT '', ADD COLUMN IF NOT EXISTS subtitle_zh text, ADD COLUMN IF NOT EXISTS subtitle_en text,
  ADD COLUMN IF NOT EXISTS bio_zh text, ADD COLUMN IF NOT EXISTS bio_en text, ADD COLUMN IF NOT EXISTS role_zh text, ADD COLUMN IF NOT EXISTS role_en text, ADD COLUMN IF NOT EXISTS focus_zh text, ADD COLUMN IF NOT EXISTS focus_en text,
  ADD COLUMN IF NOT EXISTS degree_zh text, ADD COLUMN IF NOT EXISTS degree_en text, ADD COLUMN IF NOT EXISTS enrollment_year text, ADD COLUMN IF NOT EXISTS major_zh text, ADD COLUMN IF NOT EXISTS major_en text,
  ADD COLUMN IF NOT EXISTS research_zh text, ADD COLUMN IF NOT EXISTS research_en text, ADD COLUMN IF NOT EXISTS graduation_zh text, ADD COLUMN IF NOT EXISTS graduation_en text,
  ADD COLUMN IF NOT EXISTS thesis_zh text, ADD COLUMN IF NOT EXISTS thesis_en text, ADD COLUMN IF NOT EXISTS destination_zh text, ADD COLUMN IF NOT EXISTS destination_en text,
  ADD COLUMN IF NOT EXISTS image_asset_id uuid, ADD COLUMN IF NOT EXISTS image_src text, ADD COLUMN IF NOT EXISTS image_alt text, ADD COLUMN IF NOT EXISTS image_data_alt text;
ALTER TABLE team_member_links
  ADD COLUMN IF NOT EXISTS id bigint, ADD COLUMN IF NOT EXISTS team_member_id bigint, ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS label_zh text DEFAULT '', ADD COLUMN IF NOT EXISTS label_en text DEFAULT '', ADD COLUMN IF NOT EXISTS href text DEFAULT '', ADD COLUMN IF NOT EXISTS icon text DEFAULT '';
ALTER TABLE team_member_contacts
  ADD COLUMN IF NOT EXISTS id bigint, ADD COLUMN IF NOT EXISTS team_member_id bigint, ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS label_zh text DEFAULT '', ADD COLUMN IF NOT EXISTS label_en text DEFAULT '', ADD COLUMN IF NOT EXISTS value_text text DEFAULT '';

ALTER TABLE facility_items
  ADD COLUMN IF NOT EXISTS id bigint, ADD COLUMN IF NOT EXISTS category_key text, ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0, ADD COLUMN IF NOT EXISTS icon text DEFAULT '',
  ADD COLUMN IF NOT EXISTS tag_zh text, ADD COLUMN IF NOT EXISTS tag_en text, ADD COLUMN IF NOT EXISTS title_zh text DEFAULT '', ADD COLUMN IF NOT EXISTS title_en text DEFAULT '',
  ADD COLUMN IF NOT EXISTS description_zh text DEFAULT '', ADD COLUMN IF NOT EXISTS description_en text DEFAULT '', ADD COLUMN IF NOT EXISTS spec_line_zh text, ADD COLUMN IF NOT EXISTS spec_line_en text,
  ADD COLUMN IF NOT EXISTS image_asset_id uuid, ADD COLUMN IF NOT EXISTS image_src text, ADD COLUMN IF NOT EXISTS image_alt text, ADD COLUMN IF NOT EXISTS image_data_alt text;
ALTER TABLE facility_item_specs
  ADD COLUMN IF NOT EXISTS id bigint, ADD COLUMN IF NOT EXISTS facility_item_id bigint, ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS label_zh text DEFAULT '', ADD COLUMN IF NOT EXISTS label_en text DEFAULT '', ADD COLUMN IF NOT EXISTS value_zh text DEFAULT '', ADD COLUMN IF NOT EXISTS value_en text DEFAULT '';

ALTER TABLE contact_primary_channels
  ADD COLUMN IF NOT EXISTS id bigint, ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0, ADD COLUMN IF NOT EXISTS icon text DEFAULT '',
  ADD COLUMN IF NOT EXISTS title_zh text DEFAULT '', ADD COLUMN IF NOT EXISTS title_en text DEFAULT '', ADD COLUMN IF NOT EXISTS value_zh text DEFAULT '', ADD COLUMN IF NOT EXISTS value_en text DEFAULT '', ADD COLUMN IF NOT EXISTS href text DEFAULT '';
ALTER TABLE contact_social_links
  ADD COLUMN IF NOT EXISTS id bigint, ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0, ADD COLUMN IF NOT EXISTS icon text DEFAULT '',
  ADD COLUMN IF NOT EXISTS label_zh text DEFAULT '', ADD COLUMN IF NOT EXISTS label_en text DEFAULT '', ADD COLUMN IF NOT EXISTS handle_zh text DEFAULT '', ADD COLUMN IF NOT EXISTS handle_en text DEFAULT '', ADD COLUMN IF NOT EXISTS href text DEFAULT '';
ALTER TABLE contact_extra_cards
  ADD COLUMN IF NOT EXISTS id bigint, ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS title_zh text DEFAULT '', ADD COLUMN IF NOT EXISTS title_en text DEFAULT '', ADD COLUMN IF NOT EXISTS description_zh text DEFAULT '', ADD COLUMN IF NOT EXISTS description_en text DEFAULT '', ADD COLUMN IF NOT EXISTS value_zh text DEFAULT '', ADD COLUMN IF NOT EXISTS value_en text DEFAULT '';

DO $key_compatibility$
DECLARE
  relationship record;
  parent_attnum smallint;
  parent_type oid;
  parent_typmod integer;
  child_type oid;
  child_typmod integer;
  has_nulls boolean;
  has_duplicates boolean;
BEGIN
  FOR relationship IN
    SELECT * FROM (VALUES
      ('research_items', 'id', 'research_items_id_key_compat', 'research_item_keywords', 'research_item_id'),
      ('research_items', 'id', 'research_items_id_key_compat', 'research_item_authors', 'research_item_id'),
      ('research_items', 'id', 'research_items_id_key_compat', 'research_item_links', 'research_item_id'),
      ('team_members', 'id', 'team_members_id_key_compat', 'team_member_links', 'team_member_id'),
      ('team_members', 'id', 'team_members_id_key_compat', 'team_member_contacts', 'team_member_id'),
      ('facility_items', 'id', 'facility_items_id_key_compat', 'facility_item_specs', 'facility_item_id')
    ) AS required(parent_table, parent_column, key_name, child_table, child_column)
  LOOP
    SELECT parent_attribute.attnum, parent_attribute.atttypid, parent_attribute.atttypmod,
           child_attribute.atttypid, child_attribute.atttypmod
      INTO parent_attnum, parent_type, parent_typmod, child_type, child_typmod
    FROM pg_attribute parent_attribute
    JOIN pg_class parent_class ON parent_class.oid = parent_attribute.attrelid
    JOIN pg_namespace parent_namespace ON parent_namespace.oid = parent_class.relnamespace
    JOIN pg_class child_class ON child_class.relname = relationship.child_table
    JOIN pg_namespace child_namespace ON child_namespace.oid = child_class.relnamespace
      AND child_namespace.oid = parent_namespace.oid
    JOIN pg_attribute child_attribute ON child_attribute.attrelid = child_class.oid
      AND child_attribute.attname = relationship.child_column
      AND NOT child_attribute.attisdropped
    WHERE parent_namespace.nspname = current_schema()
      AND parent_class.relname = relationship.parent_table
      AND parent_attribute.attname = relationship.parent_column
      AND NOT parent_attribute.attisdropped;

    IF parent_attnum IS NULL OR child_type IS NULL THEN
      RAISE EXCEPTION 'RNAV public-site key compatibility: missing %.% or %.% before foreign-key validation',
        relationship.parent_table, relationship.parent_column, relationship.child_table, relationship.child_column;
    END IF;

    IF parent_type <> child_type OR parent_typmod <> child_typmod THEN
      RAISE EXCEPTION 'RNAV public-site key compatibility: incompatible parent %.% type % and child %.% type %; required cleanup must align the column types before adding foreign keys',
        relationship.parent_table, relationship.parent_column, format_type(parent_type, parent_typmod),
        relationship.child_table, relationship.child_column, format_type(child_type, child_typmod);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = format('%I.%I', current_schema(), relationship.parent_table)::regclass
        AND contype IN ('p', 'u')
        AND conkey = ARRAY[parent_attnum]::smallint[]
    ) THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.%I WHERE %I IS NULL)', current_schema(), relationship.parent_table, relationship.parent_column)
        INTO has_nulls;
      IF has_nulls THEN
        RAISE EXCEPTION 'RNAV public-site key compatibility: required cleanup for %.%: NULL values prevent a unique parent key',
          relationship.parent_table, relationship.parent_column;
      END IF;

      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.%I GROUP BY %I HAVING count(*) > 1)', current_schema(), relationship.parent_table, relationship.parent_column)
        INTO has_duplicates;
      IF has_duplicates THEN
        RAISE EXCEPTION 'RNAV public-site key compatibility: required cleanup for %.%: duplicate values prevent a unique parent key',
          relationship.parent_table, relationship.parent_column;
      END IF;

      BEGIN
        EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I UNIQUE (%I)', current_schema(), relationship.parent_table, relationship.key_name, relationship.parent_column);
      EXCEPTION WHEN duplicate_object THEN
        RAISE EXCEPTION 'RNAV public-site key compatibility: constraint name % already exists but does not uniquely protect %.%; required cleanup must resolve the conflicting constraint',
          relationship.key_name, relationship.parent_table, relationship.parent_column;
      END;
    END IF;
  END LOOP;
END
$key_compatibility$;

DO $constraints$
BEGIN
  BEGIN ALTER TABLE page_content ADD CONSTRAINT page_content_page_key_key UNIQUE (page_key); EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END;
  BEGIN ALTER TABLE team_members ADD CONSTRAINT team_members_slug_key UNIQUE (slug); EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END;
  BEGIN ALTER TABLE research_item_keywords ADD CONSTRAINT research_item_keywords_research_item_fk FOREIGN KEY (research_item_id) REFERENCES research_items(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END;
  BEGIN ALTER TABLE research_item_authors ADD CONSTRAINT research_item_authors_research_item_fk FOREIGN KEY (research_item_id) REFERENCES research_items(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END;
  BEGIN ALTER TABLE research_item_links ADD CONSTRAINT research_item_links_research_item_fk FOREIGN KEY (research_item_id) REFERENCES research_items(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END;
  BEGIN ALTER TABLE team_member_links ADD CONSTRAINT team_member_links_team_member_fk FOREIGN KEY (team_member_id) REFERENCES team_members(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END;
  BEGIN ALTER TABLE team_member_contacts ADD CONSTRAINT team_member_contacts_team_member_fk FOREIGN KEY (team_member_id) REFERENCES team_members(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END;
  BEGIN ALTER TABLE facility_item_specs ADD CONSTRAINT facility_item_specs_facility_item_fk FOREIGN KEY (facility_item_id) REFERENCES facility_items(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END;
EXCEPTION WHEN undefined_column OR undefined_table THEN
  RAISE EXCEPTION 'Public-site compatibility migration could not add guarded constraints: %', SQLERRM;
END
$constraints$;

CREATE INDEX IF NOT EXISTS idx_research_items_sort ON research_items(sort_order, publication_year DESC);
CREATE INDEX IF NOT EXISTS idx_news_items_sort ON news_items(sort_order);
CREATE INDEX IF NOT EXISTS idx_team_members_group_sort ON team_members(group_key, sort_order);
CREATE INDEX IF NOT EXISTS idx_facility_items_category_sort ON facility_items(category_key, sort_order);
