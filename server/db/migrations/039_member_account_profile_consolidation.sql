UPDATE users
SET email = NULL,
    updated_at = now()
WHERE email IS NOT NULL
  AND btrim(email) = '';

UPDATE users
SET email = lower(btrim(email)),
    updated_at = now()
WHERE email IS NOT NULL
  AND email IS DISTINCT FROM lower(btrim(email));

UPDATE user_profiles
SET member_status = 'alumni',
    updated_at = now()
WHERE member_category = 'alumni'
  AND member_status <> 'alumni';

UPDATE user_profiles profile
SET degree_level = CASE profile.member_category
      WHEN 'advisor' THEN 'faculty'
      WHEN 'postdoc' THEN 'postdoc'
      WHEN 'phd' THEN 'phd'
      WHEN 'master' THEN 'master'
      WHEN 'undergrad' THEN 'undergrad'
    END,
    updated_at = now()
FROM users
WHERE users.id = profile.user_id
  AND users.account_kind = 'person'
  AND (profile.degree_level = '' OR profile.degree_level NOT IN ('faculty', 'postdoc', 'phd', 'master', 'undergrad'))
  AND profile.member_category IN ('advisor', 'postdoc', 'phd', 'master', 'undergrad');

WITH normalized AS (
  SELECT profile.user_id,
    ARRAY(
      SELECT allowed.key
      FROM unnest(ARRAY[
        'avatar', 'name_zh', 'name_en', 'academic_stage',
        'enrollment_year', 'graduation_year', 'major', 'research',
        'bio', 'email', 'phone', 'links', 'thesis', 'destination'
      ]::text[]) WITH ORDINALITY AS allowed(key, sort_order)
      WHERE allowed.key = ANY(profile.public_fields)
         OR (
           allowed.key IN ('academic_stage', 'enrollment_year', 'graduation_year')
           AND 'academic' = ANY(profile.public_fields)
         )
         OR (
           allowed.key = 'research'
           AND 'research_interests' = ANY(profile.public_fields)
         )
         OR (
           allowed.key = 'links'
           AND profile.public_fields && ARRAY['homepage', 'github']::text[]
         )
      ORDER BY allowed.sort_order
    ) AS public_fields
  FROM user_profiles profile
)
UPDATE user_profiles profile
SET public_fields = normalized.public_fields,
    updated_at = now()
FROM normalized
WHERE normalized.user_id = profile.user_id
  AND profile.public_fields IS DISTINCT FROM normalized.public_fields;

DO $member_account_profile_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'user_profiles'::regclass
      AND conname = 'user_profiles_public_fields_check'
  ) THEN
    ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_public_fields_check
      CHECK (public_fields <@ ARRAY[
        'avatar', 'name_zh', 'name_en', 'academic_stage',
        'enrollment_year', 'graduation_year', 'major', 'research',
        'bio', 'email', 'phone', 'links', 'thesis', 'destination'
      ]::text[]);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'user_profiles'::regclass
      AND conname = 'user_profiles_public_name_check'
  ) THEN
    ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_public_name_check
      CHECK (
        NOT public_visible
        OR (btrim(name_zh) <> '' AND 'name_zh' = ANY(public_fields))
        OR (btrim(name_en) <> '' AND 'name_en' = ANY(public_fields))
      );
  END IF;
END
$member_account_profile_constraints$;

