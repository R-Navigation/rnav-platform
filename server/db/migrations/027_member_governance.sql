ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS profile_content_updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_user_profiles_content_updated
  ON user_profiles(profile_content_updated_at);

