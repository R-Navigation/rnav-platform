CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  email text UNIQUE,
  password_hash text NOT NULL,
  base_tier text NOT NULL DEFAULT 'normal' CHECK (base_tier IN ('normal', 'super')),
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'invited')),
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name_zh text NOT NULL DEFAULT '',
  name_en text NOT NULL DEFAULT '',
  member_slug text,
  title_zh text NOT NULL DEFAULT '',
  title_en text NOT NULL DEFAULT '',
  avatar_asset_id uuid,
  phone text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS permissions (
  key text PRIMARY KEY,
  name_zh text NOT NULL,
  name_en text NOT NULL,
  description_zh text NOT NULL,
  description_en text NOT NULL,
  category text NOT NULL,
  is_advanced boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
  granted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission_key)
);

CREATE TABLE IF NOT EXISTS session_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO permissions (key, name_zh, name_en, description_zh, description_en, category, is_advanced)
VALUES
  ('console.access', '访问控制台', 'Access console', '登录后访问控制台。', 'Access the authenticated console.', 'base', false),
  ('profile.read_own', '查看个人资料', 'Read own profile', '查看自己的个人资料。', 'Read own profile.', 'base', false),
  ('profile.write_own', '编辑个人资料', 'Edit own profile', '编辑自己的个人资料。', 'Edit own profile.', 'base', false),
  ('lab_assets.read', '查看实验室资产', 'Read lab assets', '查看实验室内部资产。', 'Read internal lab assets.', 'lab-assets', false),
  ('procurements.create', '创建采购申请', 'Create procurement requests', '创建自己的采购申请。', 'Create own procurement requests.', 'procurement', false),
  ('procurements.read_own', '查看自己的采购申请', 'Read own procurement requests', '查看自己的采购申请。', 'Read own procurement requests.', 'procurement', false),
  ('site.content.write', '编辑官网内容', 'Edit public site content', '编辑官网页面内容。', 'Edit public website content.', 'site', true),
  ('site.members.write', '编辑成员页面', 'Edit members', '编辑成员资料展示。', 'Edit public member profiles.', 'site', true),
  ('site.media.write', '管理媒体资源', 'Manage media', '上传和清理媒体资源。', 'Upload and clean media assets.', 'site', true),
  ('monitor.devices.read', '查看监控设备', 'Read monitor devices', '查看监控设备详情。', 'Read monitor device details.', 'monitor', true),
  ('monitor.devices.write', '管理监控设备', 'Manage monitor devices', '新增、编辑和停用监控设备。', 'Create, edit, and disable monitor devices.', 'monitor', true),
  ('monitor.settings.write', '管理监控设置', 'Manage monitor settings', '修改监控地图和系统设置。', 'Edit monitor map and system settings.', 'monitor', true),
  ('lab_assets.write', '管理实验室资产', 'Manage lab assets', '编辑实验室资产、平台和备注。', 'Edit lab assets, platforms, and notes.', 'lab-assets', true),
  ('procurements.read_all', '查看所有采购申请', 'Read all procurement requests', '查看全部采购申请。', 'Read every procurement request.', 'procurement', true),
  ('procurements.review', '审批采购申请', 'Review procurement requests', '审批或驳回采购申请。', 'Approve or reject procurement requests.', 'procurement', true),
  ('procurements.purchase', '处理采购流程', 'Process purchases', '更新采购进度。', 'Update purchase progress.', 'procurement', true),
  ('procurements.close', '关闭采购申请', 'Close procurement requests', '确认收货并关闭采购申请。', 'Confirm receipt and close procurement requests.', 'procurement', true),
  ('users.read', '查看用户', 'Read users', '查看用户和权限。', 'Read users and permissions.', 'users', true),
  ('users.write', '管理用户', 'Manage users', '创建、停用和编辑用户。', 'Create, disable, and edit users.', 'users', true),
  ('permissions.write', '管理权限', 'Manage permissions', '授予和撤销用户权限。', 'Grant and revoke user permissions.', 'users', true),
  ('system.settings.write', '管理系统设置', 'Manage system settings', '修改全局系统设置。', 'Edit global system settings.', 'system', true)
ON CONFLICT (key) DO UPDATE SET
  name_zh = EXCLUDED.name_zh,
  name_en = EXCLUDED.name_en,
  description_zh = EXCLUDED.description_zh,
  description_en = EXCLUDED.description_en,
  category = EXCLUDED.category,
  is_advanced = EXCLUDED.is_advanced;
