-- Additive round-trip storage and compatibility guards for site administration.
DO $compatibility$
DECLARE
  revision_type text;
BEGIN
  SELECT columns.udt_name INTO revision_type
  FROM information_schema.columns
  WHERE columns.table_schema = current_schema()
    AND columns.table_name = 'site_content_revisions'
    AND columns.column_name = 'revision';

  IF revision_type IS DISTINCT FROM 'int8' THEN
    RAISE EXCEPTION 'Site-admin round-trip migration: site_content_revisions.revision has incompatible type %, expected int8', revision_type;
  END IF;

  IF EXISTS (SELECT 1 FROM site_content_revisions WHERE revision < 0) THEN
    RAISE EXCEPTION 'Site-admin round-trip migration: negative revisions require cleanup before migration';
  END IF;
END
$compatibility$;

ALTER TABLE research_item_links
  ADD COLUMN IF NOT EXISTS variant text DEFAULT '';

ALTER TABLE team_member_contacts
  ADD COLUMN IF NOT EXISTS value_zh text DEFAULT '',
  ADD COLUMN IF NOT EXISTS value_en text DEFAULT '';

UPDATE team_member_contacts
SET value_zh = COALESCE(NULLIF(value_zh, ''), value_text, ''),
    value_en = COALESCE(NULLIF(value_en, ''), value_text, '')
WHERE value_text IS NOT NULL;

DO $revision_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'site_content_revisions'::regclass
      AND conname = 'site_content_revisions_revision_nonnegative'
  ) THEN
    ALTER TABLE site_content_revisions
      ADD CONSTRAINT site_content_revisions_revision_nonnegative CHECK (revision >= 0) NOT VALID;
  END IF;
  ALTER TABLE site_content_revisions VALIDATE CONSTRAINT site_content_revisions_revision_nonnegative;
END
$revision_constraint$;
