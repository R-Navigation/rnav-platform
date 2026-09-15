CREATE TABLE IF NOT EXISTS scholarly_sync_settings (
  singleton smallint PRIMARY KEY DEFAULT 1 CHECK (singleton = 1),
  enabled boolean NOT NULL,
  crossref_contact_email text,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS system_secrets (
  key text PRIMARY KEY CHECK (key ~ '^[a-z0-9][a-z0-9._-]{1,127}$'),
  ciphertext bytea NOT NULL,
  nonce bytea NOT NULL,
  auth_tag bytea NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE system_secrets IS 'Application secrets encrypted with AES-256-GCM; plaintext values must never be stored here.';
COMMENT ON COLUMN system_secrets.ciphertext IS 'Encrypted bytes only; never a plaintext secret or settings JSON.';
