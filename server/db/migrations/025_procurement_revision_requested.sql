DO $$
DECLARE
  constraint_record record;
BEGIN
  FOR constraint_record IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'procurement_requests'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE procurement_requests DROP CONSTRAINT %I', constraint_record.conname);
  END LOOP;
END $$;

ALTER TABLE procurement_requests
  ADD CONSTRAINT procurement_requests_status_valid
  CHECK (status IN ('draft','submitted','revision_requested','approved','rejected','purchasing','purchased','received','closed','cancelled'))
  NOT VALID;

ALTER TABLE procurement_requests
  VALIDATE CONSTRAINT procurement_requests_status_valid;

ALTER TABLE procurement_status_history
  DROP CONSTRAINT IF EXISTS procurement_status_history_from_status_valid,
  DROP CONSTRAINT IF EXISTS procurement_status_history_to_status_valid,
  DROP CONSTRAINT IF EXISTS procurement_status_history_from_status_check,
  DROP CONSTRAINT IF EXISTS procurement_status_history_to_status_check;

ALTER TABLE procurement_status_history
  ADD CONSTRAINT procurement_status_history_from_status_check
    CHECK (from_status IS NULL OR from_status IN ('draft','submitted','revision_requested','approved','rejected','purchasing','purchased','received','closed','cancelled')),
  ADD CONSTRAINT procurement_status_history_to_status_check
    CHECK (to_status IN ('draft','submitted','revision_requested','approved','rejected','purchasing','purchased','received','closed','cancelled'));
