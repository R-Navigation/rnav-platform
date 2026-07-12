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

DO $constraints$
BEGIN
  BEGIN ALTER TABLE page_content ADD CONSTRAINT page_content_page_key_key UNIQUE (page_key); EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER TABLE team_members ADD CONSTRAINT team_members_slug_key UNIQUE (slug); EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER TABLE research_item_keywords ADD CONSTRAINT research_item_keywords_research_item_fk FOREIGN KEY (research_item_id) REFERENCES research_items(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER TABLE research_item_authors ADD CONSTRAINT research_item_authors_research_item_fk FOREIGN KEY (research_item_id) REFERENCES research_items(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER TABLE research_item_links ADD CONSTRAINT research_item_links_research_item_fk FOREIGN KEY (research_item_id) REFERENCES research_items(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER TABLE team_member_links ADD CONSTRAINT team_member_links_team_member_fk FOREIGN KEY (team_member_id) REFERENCES team_members(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER TABLE team_member_contacts ADD CONSTRAINT team_member_contacts_team_member_fk FOREIGN KEY (team_member_id) REFERENCES team_members(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER TABLE facility_item_specs ADD CONSTRAINT facility_item_specs_facility_item_fk FOREIGN KEY (facility_item_id) REFERENCES facility_items(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END;
EXCEPTION WHEN undefined_column OR undefined_table THEN
  RAISE EXCEPTION 'Public-site compatibility migration could not add guarded constraints: %', SQLERRM;
END
$constraints$;

CREATE INDEX IF NOT EXISTS idx_research_items_sort ON research_items(sort_order, publication_year DESC);
CREATE INDEX IF NOT EXISTS idx_news_items_sort ON news_items(sort_order);
CREATE INDEX IF NOT EXISTS idx_team_members_group_sort ON team_members(group_key, sort_order);
CREATE INDEX IF NOT EXISTS idx_facility_items_category_sort ON facility_items(category_key, sort_order);
