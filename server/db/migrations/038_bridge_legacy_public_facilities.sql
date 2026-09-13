-- Bridge the three established public facility cards into asset-backed profiles.
-- Existing profiles and legacy rows are preserved unchanged.
WITH mapping(category_key, platform_code) AS (
  VALUES ('quadrupeds', 'DOG-1'), ('groundVehicles', 'UGV-1'), ('aerialPlatforms', 'UAV-1')
)
INSERT INTO lab_platform_public_profiles (
  platform_id, public_visible, title_zh, title_en, description_zh, description_en,
  image_asset_id, tags, component_display_mode, sort_order
)
SELECT p.id, true, f.title_zh, f.title_en, f.description_zh, f.description_en,
       f.image_asset_id, ARRAY[coalesce(nullif(f.tag_zh, ''), f.category_key)], 'summary', f.sort_order
FROM mapping m
JOIN lab_platforms p ON p.code = m.platform_code
JOIN facility_items f ON f.category_key = m.category_key
WHERE NOT EXISTS (SELECT 1 FROM lab_platform_public_profiles pp WHERE pp.platform_id = p.id)
ON CONFLICT (platform_id) DO NOTHING;

WITH mapping(category_key, platform_code) AS (
  VALUES ('quadrupeds', 'DOG-1'), ('groundVehicles', 'UGV-1'), ('aerialPlatforms', 'UAV-1')
)
UPDATE facility_items f
SET source_platform_id = p.id
FROM mapping m JOIN lab_platforms p ON p.code = m.platform_code
WHERE f.category_key = m.category_key AND f.source_platform_id IS NULL AND f.source_asset_id IS NULL;

WITH mapping(category_key, platform_code) AS (
  VALUES ('quadrupeds', 'DOG-1'), ('groundVehicles', 'UGV-1'), ('aerialPlatforms', 'UAV-1')
)
INSERT INTO lab_platform_specs (platform_id, key, label_zh, label_en, value_zh, value_en, public_visible, sort_order)
SELECT p.id, 'legacy-' || s.id::text, s.label_zh, s.label_en, s.value_zh, s.value_en, true, s.sort_order
FROM mapping m
JOIN lab_platforms p ON p.code = m.platform_code
JOIN facility_items f ON f.category_key = m.category_key
JOIN facility_item_specs s ON s.facility_item_id = f.id
ON CONFLICT (platform_id, key) DO NOTHING;
