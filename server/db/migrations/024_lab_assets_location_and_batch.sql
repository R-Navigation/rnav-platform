ALTER TABLE lab_assets
  ADD COLUMN IF NOT EXISTS storage_location text;

CREATE INDEX IF NOT EXISTS idx_lab_assets_storage_location
  ON lab_assets (storage_location)
  WHERE storage_location IS NOT NULL;
