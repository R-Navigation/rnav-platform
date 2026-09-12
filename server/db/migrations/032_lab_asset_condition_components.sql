ALTER TABLE lab_assets
  ADD COLUMN IF NOT EXISTS manufacturer text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS condition text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS platform_role_zh text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS platform_role_en text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS platform_slot text,
  ADD COLUMN IF NOT EXISTS platform_sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mounted_at timestamptz;

UPDATE lab_assets SET condition=CASE status
  WHEN 'maintenance' THEN 'maintenance'
  WHEN 'retired' THEN 'retired'
  ELSE 'normal'
END
WHERE condition='normal';

UPDATE lab_assets SET mounted_at=COALESCE(mounted_at,updated_at,created_at)
WHERE current_platform_id IS NOT NULL;

ALTER TABLE lab_assets DROP CONSTRAINT IF EXISTS lab_assets_state_fields_check;

DO $condition_constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='lab_assets_condition_check') THEN
    ALTER TABLE lab_assets ADD CONSTRAINT lab_assets_condition_check
      CHECK(condition IN ('normal','maintenance','retired')) NOT VALID;
    ALTER TABLE lab_assets VALIDATE CONSTRAINT lab_assets_condition_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='lab_assets_allocation_fields_check') THEN
    ALTER TABLE lab_assets ADD CONSTRAINT lab_assets_allocation_fields_check CHECK(
      (status='in_use')=(assigned_user_id IS NOT NULL)
      AND (status='lend')=(NULLIF(btrim(borrower_name),'') IS NOT NULL AND NULLIF(btrim(borrower_contact),'') IS NOT NULL)
      AND (status='lend' OR (borrower_name='' AND borrower_contact=''))
    ) NOT VALID;
    ALTER TABLE lab_assets VALIDATE CONSTRAINT lab_assets_allocation_fields_check;
  END IF;
END
$condition_constraints$;

CREATE INDEX IF NOT EXISTS idx_lab_assets_condition ON lab_assets(condition);
CREATE INDEX IF NOT EXISTS idx_lab_assets_platform_components ON lab_assets(current_platform_id,platform_sort_order,code);

