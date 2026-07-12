-- Additive link variant storage for site-admin round trips.
DO $compatibility$
DECLARE
  actual_type text;
BEGIN
  SELECT columns.udt_name INTO actual_type
  FROM information_schema.columns
  WHERE columns.table_schema = current_schema()
    AND columns.table_name = 'team_member_links'
    AND columns.column_name = 'variant';
  IF actual_type IS NOT NULL AND actual_type <> 'text' THEN
    RAISE EXCEPTION 'Site-admin link variant migration: team_member_links.variant has incompatible type %, expected text', actual_type;
  END IF;

  SELECT columns.udt_name INTO actual_type
  FROM information_schema.columns
  WHERE columns.table_schema = current_schema()
    AND columns.table_name = 'news_items'
    AND columns.column_name = 'link_variant';
  IF actual_type IS NOT NULL AND actual_type <> 'text' THEN
    RAISE EXCEPTION 'Site-admin link variant migration: news_items.link_variant has incompatible type %, expected text', actual_type;
  END IF;
END
$compatibility$;

ALTER TABLE team_member_links
  ADD COLUMN IF NOT EXISTS variant text DEFAULT '';

ALTER TABLE news_items
  ADD COLUMN IF NOT EXISTS link_variant text DEFAULT '';
