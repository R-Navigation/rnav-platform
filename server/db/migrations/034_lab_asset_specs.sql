CREATE TABLE IF NOT EXISTS lab_platform_specs (
  id bigserial PRIMARY KEY,
  platform_id bigint NOT NULL REFERENCES lab_platforms(id) ON DELETE CASCADE,
  key text NOT NULL,
  label_zh text NOT NULL DEFAULT '',
  label_en text NOT NULL DEFAULT '',
  value_zh text NOT NULL DEFAULT '',
  value_en text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT '',
  public_visible boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(platform_id,key)
);

CREATE TABLE IF NOT EXISTS lab_asset_specs (
  id bigserial PRIMARY KEY,
  asset_id bigint NOT NULL REFERENCES lab_assets(id) ON DELETE CASCADE,
  key text NOT NULL,
  label_zh text NOT NULL DEFAULT '',
  label_en text NOT NULL DEFAULT '',
  value_zh text NOT NULL DEFAULT '',
  value_en text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT '',
  public_visible boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(asset_id,key)
);

CREATE INDEX IF NOT EXISTS idx_lab_platform_specs_public ON lab_platform_specs(platform_id,public_visible,sort_order,id);
CREATE INDEX IF NOT EXISTS idx_lab_asset_specs_public ON lab_asset_specs(asset_id,public_visible,sort_order,id);

