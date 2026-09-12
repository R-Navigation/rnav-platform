ALTER TABLE procurement_spend_entries
  ADD COLUMN IF NOT EXISTS order_number text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_procurement_spend_entries_order_number
  ON procurement_spend_entries(order_number) WHERE order_number <> '';
