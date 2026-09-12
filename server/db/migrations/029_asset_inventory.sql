CREATE TABLE IF NOT EXISTS lab_asset_inventory_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','completed')),
  created_by uuid NOT NULL REFERENCES users(id),
  expected_count integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lab_asset_inventory_items (
  batch_id uuid NOT NULL REFERENCES lab_asset_inventory_batches(id) ON DELETE CASCADE,
  asset_id bigint NOT NULL REFERENCES lab_assets(id),
  asset_code_snapshot text NOT NULL,
  asset_name_snapshot text NOT NULL DEFAULT '',
  scanned_at timestamptz,
  scanned_by uuid REFERENCES users(id),
  PRIMARY KEY(batch_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_lab_asset_inventory_batches_created
  ON lab_asset_inventory_batches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_asset_inventory_items_code
  ON lab_asset_inventory_items(batch_id, asset_code_snapshot);
