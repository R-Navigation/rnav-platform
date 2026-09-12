ALTER TABLE lab_platforms
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS maintainer_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS commissioned_at date;

CREATE INDEX IF NOT EXISTS idx_lab_platforms_maintainer ON lab_platforms(maintainer_user_id)
WHERE maintainer_user_id IS NOT NULL;

