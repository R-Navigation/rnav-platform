ALTER TABLE lab_assets
  ADD COLUMN IF NOT EXISTS source_procurement_request_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'lab_assets'::regclass
      AND conname = 'lab_assets_source_procurement_request_id_fkey'
  ) THEN
    ALTER TABLE lab_assets
      ADD CONSTRAINT lab_assets_source_procurement_request_id_fkey
      FOREIGN KEY (source_procurement_request_id)
      REFERENCES procurement_requests(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lab_assets_source_procurement_request
  ON lab_assets(source_procurement_request_id)
  WHERE source_procurement_request_id IS NOT NULL;
