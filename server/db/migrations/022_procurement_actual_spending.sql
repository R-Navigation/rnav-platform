CREATE TABLE IF NOT EXISTS procurement_spend_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES procurement_requests(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('items', 'request_total')),
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  note text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS procurement_spend_entry_items (
  entry_id uuid NOT NULL REFERENCES procurement_spend_entries(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES procurement_request_items(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, item_id),
  UNIQUE (item_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_procurement_spend_request_total
  ON procurement_spend_entries(request_id)
  WHERE scope='request_total';

CREATE INDEX IF NOT EXISTS idx_procurement_spend_entries_request
  ON procurement_spend_entries(request_id, scope, created_at);

