DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'procurement_requests_total_estimated_amount_nonnegative'
      AND conrelid = 'procurement_requests'::regclass
  ) THEN
    ALTER TABLE procurement_requests
      ADD CONSTRAINT procurement_requests_total_estimated_amount_nonnegative
      CHECK (total_estimated_amount >= 0);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'procurement_request_items_quantity_positive'
      AND conrelid = 'procurement_request_items'::regclass
  ) THEN
    ALTER TABLE procurement_request_items
      ADD CONSTRAINT procurement_request_items_quantity_positive
      CHECK (quantity > 0);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'procurement_request_items_unit_price_nonnegative'
      AND conrelid = 'procurement_request_items'::regclass
  ) THEN
    ALTER TABLE procurement_request_items
      ADD CONSTRAINT procurement_request_items_unit_price_nonnegative
      CHECK (estimated_unit_price IS NULL OR estimated_unit_price >= 0);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'procurement_status_history_from_status_valid'
      AND conrelid = 'procurement_status_history'::regclass
  ) THEN
    ALTER TABLE procurement_status_history
      ADD CONSTRAINT procurement_status_history_from_status_valid
      CHECK (
        from_status IS NULL OR from_status IN (
          'draft',
          'submitted',
          'approved',
          'rejected',
          'purchasing',
          'purchased',
          'received',
          'closed',
          'cancelled'
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'procurement_status_history_to_status_valid'
      AND conrelid = 'procurement_status_history'::regclass
  ) THEN
    ALTER TABLE procurement_status_history
      ADD CONSTRAINT procurement_status_history_to_status_valid
      CHECK (
        to_status IN (
          'draft',
          'submitted',
          'approved',
          'rejected',
          'purchasing',
          'purchased',
          'received',
          'closed',
          'cancelled'
        )
      );
  END IF;
END
$$;
