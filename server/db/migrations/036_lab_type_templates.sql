CREATE TABLE IF NOT EXISTS lab_platform_type_slots (
  id bigserial PRIMARY KEY,
  platform_type_id bigint NOT NULL REFERENCES lab_platform_types(id) ON DELETE CASCADE,
  slot_key text NOT NULL,
  name_zh text NOT NULL DEFAULT '',
  name_en text NOT NULL DEFAULT '',
  device_type_id bigint REFERENCES lab_device_types(id) ON DELETE SET NULL,
  required boolean NOT NULL DEFAULT false,
  min_count integer NOT NULL DEFAULT 0 CHECK(min_count>=0),
  max_count integer CHECK(max_count IS NULL OR max_count>=min_count),
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE(platform_type_id,slot_key)
);

CREATE TABLE IF NOT EXISTS lab_device_type_spec_definitions (
  id bigserial PRIMARY KEY,
  device_type_id bigint NOT NULL REFERENCES lab_device_types(id) ON DELETE CASCADE,
  key text NOT NULL,
  label_zh text NOT NULL DEFAULT '',
  label_en text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE(device_type_id,key)
);

CREATE INDEX IF NOT EXISTS idx_lab_platform_type_slots_sort ON lab_platform_type_slots(platform_type_id,sort_order,id);
CREATE INDEX IF NOT EXISTS idx_lab_device_type_spec_defs_sort ON lab_device_type_spec_definitions(device_type_id,sort_order,id);
