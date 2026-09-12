CREATE TABLE IF NOT EXISTS lab_platform_public_profiles (
  platform_id bigint PRIMARY KEY REFERENCES lab_platforms(id) ON DELETE CASCADE,
  public_visible boolean NOT NULL DEFAULT false,
  title_zh text NOT NULL DEFAULT '',
  title_en text NOT NULL DEFAULT '',
  description_zh text NOT NULL DEFAULT '',
  description_en text NOT NULL DEFAULT '',
  image_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  component_display_mode text NOT NULL DEFAULT 'summary' CHECK(component_display_mode IN ('none','summary','detail')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lab_asset_public_profiles (
  asset_id bigint PRIMARY KEY REFERENCES lab_assets(id) ON DELETE CASCADE,
  public_visible boolean NOT NULL DEFAULT false,
  title_zh text NOT NULL DEFAULT '',
  title_en text NOT NULL DEFAULT '',
  description_zh text NOT NULL DEFAULT '',
  description_en text NOT NULL DEFAULT '',
  image_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE facility_items
  ADD COLUMN IF NOT EXISTS source_platform_id bigint REFERENCES lab_platforms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_asset_id bigint REFERENCES lab_assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lab_platform_public_visible ON lab_platform_public_profiles(public_visible,sort_order,platform_id);
CREATE INDEX IF NOT EXISTS idx_lab_asset_public_visible ON lab_asset_public_profiles(public_visible,sort_order,asset_id);

