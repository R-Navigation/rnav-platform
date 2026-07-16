SELECT setval(
  pg_get_serial_sequence('lab_platform_types', 'id'),
  COALESCE((SELECT max(id) FROM lab_platform_types), 1),
  EXISTS (SELECT 1 FROM lab_platform_types)
);

SELECT setval(
  pg_get_serial_sequence('lab_platforms', 'id'),
  COALESCE((SELECT max(id) FROM lab_platforms), 1),
  EXISTS (SELECT 1 FROM lab_platforms)
);

SELECT setval(
  pg_get_serial_sequence('lab_assets', 'id'),
  COALESCE((SELECT max(id) FROM lab_assets), 1),
  EXISTS (SELECT 1 FROM lab_assets)
);

SELECT setval(
  pg_get_serial_sequence('lab_platform_notes', 'id'),
  COALESCE((SELECT max(id) FROM lab_platform_notes), 1),
  EXISTS (SELECT 1 FROM lab_platform_notes)
);

SELECT setval(
  pg_get_serial_sequence('lab_asset_notes', 'id'),
  COALESCE((SELECT max(id) FROM lab_asset_notes), 1),
  EXISTS (SELECT 1 FROM lab_asset_notes)
);
