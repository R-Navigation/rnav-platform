CREATE TABLE IF NOT EXISTS member_scholarly_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  orcid_id text,
  openalex_author_id text,
  identity_status text NOT NULL DEFAULT 'unconfigured'
    CHECK (identity_status IN ('unconfigured', 'pending', 'verified', 'conflict')),
  sync_enabled boolean NOT NULL DEFAULT false,
  sync_from_year integer CHECK (sync_from_year IS NULL OR sync_from_year BETWEEN 1900 AND 2200),
  sync_to_year integer CHECK (sync_to_year IS NULL OR sync_to_year BETWEEN 1900 AND 2200),
  new_work_policy text NOT NULL DEFAULT 'review'
    CHECK (new_work_policy IN ('review', 'auto')),
  verified_at timestamptz,
  verified_by uuid REFERENCES users(id) ON DELETE SET NULL,
  last_synced_at timestamptz,
  last_sync_status text,
  last_sync_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (sync_to_year IS NULL OR sync_from_year IS NULL OR sync_to_year >= sync_from_year),
  CHECK (NOT sync_enabled OR identity_status = 'verified'),
  CHECK (new_work_policy <> 'auto' OR (identity_status = 'verified' AND (sync_from_year IS NOT NULL OR sync_to_year IS NOT NULL)))
);

CREATE UNIQUE INDEX IF NOT EXISTS member_scholarly_profiles_orcid_unique
  ON member_scholarly_profiles (orcid_id) WHERE orcid_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS member_scholarly_profiles_openalex_unique
  ON member_scholarly_profiles (openalex_author_id) WHERE openalex_author_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS scholarly_works (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL DEFAULT 'openalex'
    CHECK (source_type IN ('manual', 'openalex')),
  openalex_work_id text,
  doi_normalized text,
  decision text NOT NULL DEFAULT 'pending'
    CHECK (decision IN ('pending', 'accepted', 'ignored')),
  research_item_id text REFERENCES research_items(id) ON DELETE SET NULL,
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  managed_fields text[] NOT NULL DEFAULT ARRAY[]::text[],
  provider_hash text,
  provider_updated_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  version bigint NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS scholarly_works_openalex_unique
  ON scholarly_works (openalex_work_id) WHERE openalex_work_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS scholarly_works_doi_unique
  ON scholarly_works (doi_normalized) WHERE doi_normalized IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS scholarly_works_research_item_unique
  ON scholarly_works (research_item_id) WHERE research_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS scholarly_works_decision_seen
  ON scholarly_works (decision, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS scholarly_work_members (
  work_id uuid NOT NULL REFERENCES scholarly_works(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_position integer,
  matched_by text NOT NULL DEFAULT 'openalex_author_id',
  confidence numeric(5,4),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (work_id, user_id)
);
CREATE INDEX IF NOT EXISTS scholarly_work_members_user
  ON scholarly_work_members (user_id, work_id);

CREATE TABLE IF NOT EXISTS scholarly_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_type text NOT NULL CHECK (trigger_type IN ('scheduled', 'manual_all', 'manual_member', 'backfill')),
  triggered_by uuid REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('running', 'success', 'partial', 'failed', 'skipped')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  members_checked integer NOT NULL DEFAULT 0,
  works_seen integer NOT NULL DEFAULT 0,
  candidates_created integer NOT NULL DEFAULT 0,
  works_updated integer NOT NULL DEFAULT 0,
  failures integer NOT NULL DEFAULT 0,
  error_summary jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS scholarly_sync_runs_started
  ON scholarly_sync_runs (started_at DESC);

DO $scholarly_duplicate_doi_guard$
BEGIN
  IF EXISTS (
    WITH normalized AS (
      SELECT research_item_id,
        lower(regexp_replace(regexp_replace(btrim(href), '^https?://(dx\.)?doi\.org/', '', 'i'), '^doi:\s*', '', 'i')) AS doi
      FROM research_item_links
      WHERE lower(icon) = 'doi'
         OR href ~* '^(https?://(dx\.)?doi\.org/|doi:|10\.)'
    )
    SELECT 1 FROM normalized
    WHERE doi ~ '^10\.[0-9]{4,9}/\S+$'
    GROUP BY doi HAVING count(DISTINCT research_item_id) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate DOI values found across research_items; resolve them before scholarly sync migration';
  END IF;
END
$scholarly_duplicate_doi_guard$;

WITH item_dois AS (
  SELECT DISTINCT ON (link.research_item_id)
    link.research_item_id,
    CASE WHEN normalized.doi ~ '^10\.[0-9]{4,9}/\S+$' THEN normalized.doi ELSE NULL END AS doi
  FROM research_item_links link
  CROSS JOIN LATERAL (
    SELECT lower(regexp_replace(regexp_replace(btrim(link.href), '^https?://(dx\.)?doi\.org/', '', 'i'), '^doi:\s*', '', 'i')) AS doi
  ) normalized
  WHERE lower(link.icon) = 'doi'
     OR link.href ~* '^(https?://(dx\.)?doi\.org/|doi:|10\.)'
  ORDER BY link.research_item_id, link.sort_order, link.id
)
INSERT INTO scholarly_works (source_type, doi_normalized, decision, research_item_id, managed_fields)
SELECT 'manual', item_dois.doi, 'accepted', item.id, ARRAY[]::text[]
FROM research_items item
LEFT JOIN item_dois ON item_dois.research_item_id = item.id
ON CONFLICT DO NOTHING;
