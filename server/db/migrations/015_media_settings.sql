ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS recycled_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS delete_error text,
  ADD COLUMN IF NOT EXISTS delete_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_delete_attempt_at timestamptz;

DO $media_status$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'media_assets'::regclass
      AND conname = 'media_assets_status_check'
  ) THEN
    ALTER TABLE media_assets
      ADD CONSTRAINT media_assets_status_check
      CHECK (status IN ('active', 'recycled', 'deleting'));
  END IF;
END
$media_status$;

CREATE INDEX IF NOT EXISTS idx_media_assets_status_created
  ON media_assets(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_assets_recycled_at
  ON media_assets(recycled_at)
  WHERE status = 'recycled';

DO $avatar_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'user_profiles'::regclass
      AND conname = 'user_profiles_avatar_asset_id_fkey'
  ) THEN
    ALTER TABLE user_profiles
      ADD CONSTRAINT user_profiles_avatar_asset_id_fkey
      FOREIGN KEY (avatar_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL;
  END IF;
END
$avatar_fk$;

CREATE TABLE IF NOT EXISTS system_settings (
  key text PRIMARY KEY,
  value_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO system_settings (key, value_json)
VALUES
  ('site', '{"groupName":"R-Nav 研究组","contact":"","icp":""}'::jsonb),
  ('locale', '{"defaultLanguage":"zh","timezone":"Asia/Shanghai"}'::jsonb),
  ('security', '{"sessionDurationHours":168}'::jsonb),
  ('monitor', '{"offlineThresholdSeconds":60}'::jsonb),
  ('procurement', '{"numberPrefix":"RNAV-","workflowEnabled":true}'::jsonb),
  ('media', '{"maxUploadBytes":20971520,"allowedTypes":["image/jpeg","image/png","image/webp","application/pdf"]}'::jsonb),
  ('maintenance', '{"enabled":false,"message":"系统维护中，请稍后再访问。"}'::jsonb)
ON CONFLICT (key) DO NOTHING;
