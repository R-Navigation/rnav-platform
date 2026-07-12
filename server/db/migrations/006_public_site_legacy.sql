-- Uses 006 instead of backfilling 002 so already-deployed databases apply it after 005.
CREATE TABLE IF NOT EXISTS media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL,
  filename text NOT NULL,
  object_key text NOT NULL UNIQUE,
  url text NOT NULL,
  mime_type text NOT NULL DEFAULT '',
  size_bytes bigint NOT NULL DEFAULT 0,
  checksum_sha256 text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS page_content (
  page_key text PRIMARY KEY,
  content_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS research_items (
  id text PRIMARY KEY, sort_order integer NOT NULL DEFAULT 0,
  title_zh text NOT NULL DEFAULT '', title_en text NOT NULL DEFAULT '', publication_year integer,
  venue_zh text NOT NULL DEFAULT '', venue_en text NOT NULL DEFAULT '', publication_type text NOT NULL DEFAULT '', topic text NOT NULL DEFAULT '',
  image_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL, image_src text, image_alt text, image_data_alt text,
  pdf_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL, pdf_src text, pdf_label_zh text, pdf_label_en text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS research_item_keywords (id bigserial PRIMARY KEY, research_item_id text NOT NULL REFERENCES research_items(id) ON DELETE CASCADE, sort_order integer NOT NULL DEFAULT 0, value_zh text NOT NULL DEFAULT '', value_en text NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS research_item_authors (id bigserial PRIMARY KEY, research_item_id text NOT NULL REFERENCES research_items(id) ON DELETE CASCADE, sort_order integer NOT NULL DEFAULT 0, name_zh text NOT NULL DEFAULT '', name_en text NOT NULL DEFAULT '', highlight boolean NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS research_item_links (id bigserial PRIMARY KEY, research_item_id text NOT NULL REFERENCES research_items(id) ON DELETE CASCADE, sort_order integer NOT NULL DEFAULT 0, label_zh text NOT NULL DEFAULT '', label_en text NOT NULL DEFAULT '', href text NOT NULL DEFAULT '', icon text NOT NULL DEFAULT '');

CREATE TABLE IF NOT EXISTS news_items (
  id text PRIMARY KEY, sort_order integer NOT NULL DEFAULT 0, date_zh text NOT NULL DEFAULT '', date_en text NOT NULL DEFAULT '', badge_zh text NOT NULL DEFAULT '', badge_en text NOT NULL DEFAULT '', badge_tone text NOT NULL DEFAULT 'cyan',
  title_zh text NOT NULL DEFAULT '', title_en text NOT NULL DEFAULT '', description_zh text NOT NULL DEFAULT '', description_en text NOT NULL DEFAULT '', excerpt_zh text NOT NULL DEFAULT '', excerpt_en text NOT NULL DEFAULT '', featured boolean NOT NULL DEFAULT false,
  image_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL, image_src text, image_alt text, image_data_alt text, link_label_zh text, link_label_en text, link_href text, link_icon text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_members (
  id bigserial PRIMARY KEY, slug text NOT NULL UNIQUE, group_key text NOT NULL, sort_order integer NOT NULL DEFAULT 0,
  name_zh text NOT NULL DEFAULT '', name_en text NOT NULL DEFAULT '', subtitle_zh text, subtitle_en text, bio_zh text, bio_en text, role_zh text, role_en text, focus_zh text, focus_en text,
  degree_zh text, degree_en text, enrollment_year text, major_zh text, major_en text, research_zh text, research_en text, graduation_zh text, graduation_en text, thesis_zh text, thesis_en text, destination_zh text, destination_en text,
  image_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL, image_src text, image_alt text, image_data_alt text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS team_member_links (id bigserial PRIMARY KEY, team_member_id bigint NOT NULL REFERENCES team_members(id) ON DELETE CASCADE, sort_order integer NOT NULL DEFAULT 0, label_zh text NOT NULL DEFAULT '', label_en text NOT NULL DEFAULT '', href text NOT NULL DEFAULT '', icon text NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS team_member_contacts (id bigserial PRIMARY KEY, team_member_id bigint NOT NULL REFERENCES team_members(id) ON DELETE CASCADE, sort_order integer NOT NULL DEFAULT 0, label_zh text NOT NULL DEFAULT '', label_en text NOT NULL DEFAULT '', value_text text NOT NULL DEFAULT '');

CREATE TABLE IF NOT EXISTS facility_items (
  id bigserial PRIMARY KEY, category_key text NOT NULL, sort_order integer NOT NULL DEFAULT 0, icon text NOT NULL DEFAULT '', tag_zh text, tag_en text,
  title_zh text NOT NULL DEFAULT '', title_en text NOT NULL DEFAULT '', description_zh text NOT NULL DEFAULT '', description_en text NOT NULL DEFAULT '', spec_line_zh text, spec_line_en text,
  image_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL, image_src text, image_alt text, image_data_alt text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS facility_item_specs (id bigserial PRIMARY KEY, facility_item_id bigint NOT NULL REFERENCES facility_items(id) ON DELETE CASCADE, sort_order integer NOT NULL DEFAULT 0, label_zh text NOT NULL DEFAULT '', label_en text NOT NULL DEFAULT '', value_zh text NOT NULL DEFAULT '', value_en text NOT NULL DEFAULT '');

CREATE TABLE IF NOT EXISTS contact_primary_channels (id bigserial PRIMARY KEY, sort_order integer NOT NULL DEFAULT 0, icon text NOT NULL DEFAULT '', title_zh text NOT NULL DEFAULT '', title_en text NOT NULL DEFAULT '', value_zh text NOT NULL DEFAULT '', value_en text NOT NULL DEFAULT '', href text NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS contact_social_links (id bigserial PRIMARY KEY, sort_order integer NOT NULL DEFAULT 0, icon text NOT NULL DEFAULT '', label_zh text NOT NULL DEFAULT '', label_en text NOT NULL DEFAULT '', handle_zh text NOT NULL DEFAULT '', handle_en text NOT NULL DEFAULT '', href text NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS contact_extra_cards (id bigserial PRIMARY KEY, sort_order integer NOT NULL DEFAULT 0, title_zh text NOT NULL DEFAULT '', title_en text NOT NULL DEFAULT '', description_zh text NOT NULL DEFAULT '', description_en text NOT NULL DEFAULT '', value_zh text NOT NULL DEFAULT '', value_en text NOT NULL DEFAULT '');

CREATE INDEX IF NOT EXISTS idx_research_items_sort ON research_items(sort_order, publication_year DESC);
CREATE INDEX IF NOT EXISTS idx_news_items_sort ON news_items(sort_order);
CREATE INDEX IF NOT EXISTS idx_team_members_group_sort ON team_members(group_key, sort_order);
CREATE INDEX IF NOT EXISTS idx_facility_items_category_sort ON facility_items(category_key, sort_order);
