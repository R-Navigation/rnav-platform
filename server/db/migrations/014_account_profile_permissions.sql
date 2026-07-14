ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_source text NOT NULL DEFAULT 'admin';

UPDATE users
SET created_source = 'legacy-migration'
WHERE created_source = 'admin'
  AND created_at < CURRENT_TIMESTAMP;

-- Existing normal member accounts were issued migration-time temporary passwords.
UPDATE users
SET must_change_password = true
WHERE base_tier = 'normal'
  AND status = 'active'
  AND password_changed_at IS NULL;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS team_member_id bigint,
  ADD COLUMN IF NOT EXISTS member_category text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bio_zh text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bio_en text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS research_interests_zh text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS research_interests_en text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS homepage_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS github_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS public_fields text[] NOT NULL DEFAULT ARRAY[
    'avatar', 'name_zh', 'name_en', 'title', 'bio', 'research_interests',
    'email', 'homepage', 'github'
  ]::text[],
  ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

INSERT INTO user_profiles (user_id, name_zh, name_en, email)
SELECT users.id, users.display_name, '', COALESCE(users.email, '')
FROM users
WHERE NOT EXISTS (
  SELECT 1 FROM user_profiles WHERE user_profiles.user_id = users.id
);

UPDATE user_profiles
SET email = users.email
FROM users
WHERE users.id = user_profiles.user_id
  AND user_profiles.email = ''
  AND users.email IS NOT NULL;

UPDATE user_profiles
SET team_member_id = team_members.id,
    member_category = COALESCE(NULLIF(team_members.group_key, ''), user_profiles.member_category),
    bio_zh = COALESCE(NULLIF(user_profiles.bio_zh, ''), team_members.bio_zh, ''),
    bio_en = COALESCE(NULLIF(user_profiles.bio_en, ''), team_members.bio_en, ''),
    research_interests_zh = COALESCE(NULLIF(user_profiles.research_interests_zh, ''), team_members.research_zh, team_members.focus_zh, ''),
    research_interests_en = COALESCE(NULLIF(user_profiles.research_interests_en, ''), team_members.research_en, team_members.focus_en, '')
FROM team_members
WHERE user_profiles.team_member_id IS NULL
  AND user_profiles.member_slug IS NOT NULL
  AND team_members.slug = user_profiles.member_slug;

DO $profile_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'user_profiles'::regclass
      AND conname = 'user_profiles_team_member_id_fkey'
  ) THEN
    ALTER TABLE user_profiles
      ADD CONSTRAINT user_profiles_team_member_id_fkey
      FOREIGN KEY (team_member_id) REFERENCES team_members(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'user_profiles'::regclass
      AND conname = 'user_profiles_version_positive'
  ) THEN
    ALTER TABLE user_profiles
      ADD CONSTRAINT user_profiles_version_positive CHECK (version > 0);
  END IF;
END
$profile_constraints$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_team_member_unique
  ON user_profiles(team_member_id)
  WHERE team_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_status_tier_username
  ON users(status, base_tier, username);

CREATE TABLE IF NOT EXISTS permission_templates (
  key text PRIMARY KEY,
  name_zh text NOT NULL,
  name_en text NOT NULL,
  description_zh text NOT NULL DEFAULT '',
  description_en text NOT NULL DEFAULT '',
  is_system boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permission_template_permissions (
  template_key text NOT NULL REFERENCES permission_templates(key) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (template_key, permission_key)
);

CREATE TABLE IF NOT EXISTS user_permission_templates (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_key text NOT NULL REFERENCES permission_templates(key) ON DELETE CASCADE,
  assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, template_key)
);

CREATE TABLE IF NOT EXISTS user_permission_overrides (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('grant', 'revoke')),
  changed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission_key)
);

INSERT INTO permission_templates (
  key, name_zh, name_en, description_zh, description_en, is_system, sort_order
)
VALUES
  ('normal-member', '普通成员', 'Normal member', '课题组成员基础功能。', 'Base capabilities for lab members.', true, 10),
  ('site-editor', '官网编辑', 'Site editor', '维护公开网站内容和成员展示。', 'Maintain public site content and member pages.', true, 20),
  ('asset-manager', '资产管理员', 'Asset manager', '查看并维护实验室资产。', 'Read and maintain laboratory assets.', true, 30),
  ('monitor-manager', '监控管理员', 'Monitor manager', '查看设备并维护监控配置。', 'Inspect devices and maintain monitor settings.', true, 40),
  ('procurement-reviewer', '采购审批', 'Procurement reviewer', '查看并审批全部采购申请。', 'Read and review all procurement requests.', true, 50),
  ('procurement-operator', '采购执行', 'Procurement operator', '执行采购和收货关闭流程。', 'Process purchases and close received requests.', true, 60),
  ('user-manager', '用户管理员', 'User manager', '维护成员账号和权限。', 'Maintain member accounts and permissions.', true, 70)
ON CONFLICT (key) DO UPDATE SET
  name_zh = EXCLUDED.name_zh,
  name_en = EXCLUDED.name_en,
  description_zh = EXCLUDED.description_zh,
  description_en = EXCLUDED.description_en,
  is_system = EXCLUDED.is_system,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

INSERT INTO permission_template_permissions (template_key, permission_key)
VALUES
  ('normal-member', 'console.access'),
  ('normal-member', 'profile.read_own'),
  ('normal-member', 'profile.write_own'),
  ('normal-member', 'lab_assets.read'),
  ('normal-member', 'procurements.create'),
  ('normal-member', 'procurements.read_own'),
  ('site-editor', 'site.content.write'),
  ('site-editor', 'site.members.write'),
  ('site-editor', 'site.media.write'),
  ('asset-manager', 'lab_assets.read'),
  ('asset-manager', 'lab_assets.write'),
  ('monitor-manager', 'monitor.devices.read'),
  ('monitor-manager', 'monitor.devices.write'),
  ('monitor-manager', 'monitor.settings.write'),
  ('procurement-reviewer', 'procurements.read_all'),
  ('procurement-reviewer', 'procurements.review'),
  ('procurement-operator', 'procurements.read_all'),
  ('procurement-operator', 'procurements.purchase'),
  ('procurement-operator', 'procurements.close'),
  ('user-manager', 'users.read'),
  ('user-manager', 'users.write'),
  ('user-manager', 'permissions.write')
ON CONFLICT (template_key, permission_key) DO NOTHING;

INSERT INTO user_permission_overrides (
  user_id, permission_key, decision, changed_by, changed_at
)
SELECT user_id, permission_key, 'grant', granted_by, granted_at
FROM user_permissions
ON CONFLICT (user_id, permission_key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_user_permission_templates_template
  ON user_permission_templates(template_key, user_id);
CREATE INDEX IF NOT EXISTS idx_user_permission_overrides_permission
  ON user_permission_overrides(permission_key, decision, user_id);
