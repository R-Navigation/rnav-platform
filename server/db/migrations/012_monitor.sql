CREATE TABLE IF NOT EXISTS device_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_zh text NOT NULL DEFAULT '',
  name_en text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  category_id uuid REFERENCES device_categories(id) ON DELETE SET NULL,
  name_zh text NOT NULL DEFAULT '',
  name_en text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT '',
  serial_number text NOT NULL DEFAULT '',
  protocol_type text NOT NULL DEFAULT 'http',
  auth_token_hash text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  is_public boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  description_zh text NOT NULL DEFAULT '',
  description_en text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS devices
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS device_current_state (
  device_id uuid PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
  is_online boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz,
  last_heartbeat_at timestamptz,
  mode text,
  mission_status text,
  battery_pct numeric(5,2),
  signal_pct numeric(5,2),
  speed_mps numeric(8,2),
  heading_deg numeric(6,2),
  altitude_m numeric(10,2),
  raw_coord_system text,
  raw_lng double precision,
  raw_lat double precision,
  display_coord_system text,
  display_lng double precision,
  display_lat double precision,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS device_telemetry (
  id bigserial PRIMARY KEY,
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  reported_at timestamptz NOT NULL,
  mode text,
  mission_status text,
  battery_pct numeric(5,2),
  signal_pct numeric(5,2),
  speed_mps numeric(8,2),
  heading_deg numeric(6,2),
  altitude_m numeric(10,2),
  raw_coord_system text,
  raw_lng double precision,
  raw_lat double precision,
  display_coord_system text,
  display_lng double precision,
  display_lat double precision,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS device_events (
  id bigserial PRIMARY KEY,
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  level text NOT NULL DEFAULT 'info',
  event_type text NOT NULL,
  title text NOT NULL,
  description text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS device_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  severity text NOT NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open',
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  acknowledged_by uuid,
  acknowledged_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE IF EXISTS device_alerts
  ADD COLUMN IF NOT EXISTS legacy_acknowledged_by uuid;

UPDATE device_alerts a
SET legacy_acknowledged_by = a.acknowledged_by,
    acknowledged_by = NULL
WHERE a.acknowledged_by IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = a.acknowledged_by);

DO $monitor_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'device_alerts'::regclass
      AND conname = 'device_alerts_acknowledged_by_users_fkey'
  ) THEN
    ALTER TABLE device_alerts
      ADD CONSTRAINT device_alerts_acknowledged_by_users_fkey
      FOREIGN KEY (acknowledged_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END
$monitor_constraints$;

CREATE TABLE IF NOT EXISTS monitor_service_status (
  service_key text PRIMARY KEY,
  service_name text NOT NULL,
  is_online boolean NOT NULL DEFAULT false,
  status_text text,
  last_check_at timestamptz NOT NULL DEFAULT now(),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS dashboard_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  default_center_lng double precision NOT NULL DEFAULT 114.361111,
  default_center_lat double precision NOT NULL DEFAULT 30.540833,
  default_zoom numeric(5,2) NOT NULL DEFAULT 13.20,
  map_provider text NOT NULL DEFAULT 'maplibre',
  theme text NOT NULL DEFAULT 'nightwatch',
  refresh_hint_seconds integer NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_devices_public_sort ON devices (is_public, is_enabled, sort_order, code);
CREATE INDEX IF NOT EXISTS idx_device_telemetry_device_reported_at ON device_telemetry (device_id, reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_telemetry_reported_at ON device_telemetry (reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_events_device_occurred_at ON device_events (device_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_events_occurred_at ON device_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_alerts_status_started_at ON device_alerts (status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_alerts_device_status ON device_alerts (device_id, status);

INSERT INTO dashboard_settings (default_center_lng, default_center_lat, default_zoom, map_provider, theme, refresh_hint_seconds)
SELECT 114.361111, 30.540833, 13.20, 'maplibre', 'nightwatch', 5
WHERE NOT EXISTS (SELECT 1 FROM dashboard_settings);
