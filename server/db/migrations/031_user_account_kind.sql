ALTER TABLE users
  ADD COLUMN IF NOT EXISTS account_kind text NOT NULL DEFAULT 'person';

DO $account_kind$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_account_kind_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_account_kind_check
      CHECK(account_kind IN ('person','system')) NOT VALID;
    ALTER TABLE users VALIDATE CONSTRAINT users_account_kind_check;
  END IF;
END
$account_kind$;

CREATE INDEX IF NOT EXISTS idx_users_account_kind ON users(account_kind,status);

