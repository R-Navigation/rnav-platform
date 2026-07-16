ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS public_visible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS member_status text NOT NULL DEFAULT 'current',
  ADD COLUMN IF NOT EXISTS degree_level text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS enrollment_year text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS graduation_year text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS major_zh text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS major_en text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS thesis_zh text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS thesis_en text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS destination_zh text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS destination_en text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS avatar_position_x integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS avatar_position_y integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS avatar_zoom numeric(4,2) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS personal_links jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE user_profiles profile
SET public_visible = true,
    member_status = CASE WHEN profile.member_category = 'alumni' OR team.group_key = 'alumni' THEN 'alumni' ELSE 'current' END,
    degree_level = CASE COALESCE(NULLIF(profile.member_category, ''), team.group_key)
      WHEN 'advisor' THEN 'faculty'
      WHEN 'postdoc' THEN 'postdoc'
      WHEN 'phd' THEN 'phd'
      WHEN 'master' THEN 'master'
      WHEN 'undergrad' THEN 'undergrad'
      WHEN 'alumni' THEN CASE
        WHEN concat_ws(' ', team.degree_zh, team.degree_en, team.graduation_zh, team.graduation_en) ILIKE '%博士%' OR concat_ws(' ', team.degree_zh, team.degree_en) ILIKE '%phd%' THEN 'phd'
        WHEN concat_ws(' ', team.degree_zh, team.degree_en, team.graduation_zh, team.graduation_en) ILIKE '%本科%' OR concat_ws(' ', team.degree_zh, team.degree_en) ILIKE '%bachelor%' THEN 'undergrad'
        ELSE 'master'
      END
      ELSE ''
    END,
    enrollment_year = COALESCE(NULLIF(team.enrollment_year, ''), profile.enrollment_year),
    graduation_year = COALESCE((regexp_match(concat_ws(' ', team.graduation_zh, team.graduation_en), '(20[0-9]{2})'))[1], profile.graduation_year),
    major_zh = COALESCE(NULLIF(team.major_zh, ''), profile.major_zh),
    major_en = COALESCE(NULLIF(team.major_en, ''), profile.major_en),
    thesis_zh = COALESCE(NULLIF(team.thesis_zh, ''), profile.thesis_zh),
    thesis_en = COALESCE(NULLIF(team.thesis_en, ''), profile.thesis_en),
    destination_zh = COALESCE(NULLIF(team.destination_zh, ''), profile.destination_zh),
    destination_en = COALESCE(NULLIF(team.destination_en, ''), profile.destination_en),
    avatar_asset_id = COALESCE(profile.avatar_asset_id, team.image_asset_id),
    personal_links = COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'labelZh', link.label_zh,
        'labelEn', link.label_en,
        'url', link.href
      ) ORDER BY link.sort_order, link.id)
      FROM team_member_links link
      WHERE link.team_member_id = team.id AND link.href ~* '^https?://'
    ), profile.personal_links),
    public_fields = ARRAY[
      'avatar', 'name_zh', 'name_en', 'academic', 'major', 'research',
      'bio', 'email', 'links', 'thesis', 'destination'
    ]::text[]
FROM team_members team
WHERE profile.team_member_id = team.id;

UPDATE user_profiles
SET personal_links = personal_links || jsonb_build_array(jsonb_build_object(
  'labelZh', '个人主页', 'labelEn', 'Homepage', 'url', homepage_url
))
WHERE homepage_url ~* '^https?://'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(personal_links) link
    WHERE link->>'url' = homepage_url
  );

UPDATE user_profiles
SET personal_links = personal_links || jsonb_build_array(jsonb_build_object(
  'labelZh', 'GitHub', 'labelEn', 'GitHub', 'url', github_url
))
WHERE github_url ~* '^https?://'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(personal_links) link
    WHERE link->>'url' = github_url
  );

DO $member_profile_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'user_profiles'::regclass
      AND conname = 'user_profiles_member_status_check'
  ) THEN
    ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_member_status_check
      CHECK (member_status IN ('current', 'alumni'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'user_profiles'::regclass
      AND conname = 'user_profiles_degree_level_check'
  ) THEN
    ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_degree_level_check
      CHECK (degree_level IN ('', 'faculty', 'postdoc', 'undergrad', 'master', 'phd'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'user_profiles'::regclass
      AND conname = 'user_profiles_personal_links_array_check'
  ) THEN
    ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_personal_links_array_check
      CHECK (jsonb_typeof(personal_links) = 'array');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'user_profiles'::regclass
      AND conname = 'user_profiles_avatar_crop_check'
  ) THEN
    ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_avatar_crop_check
      CHECK (avatar_position_x BETWEEN 0 AND 100 AND avatar_position_y BETWEEN 0 AND 100 AND avatar_zoom BETWEEN 1 AND 3);
  END IF;
END
$member_profile_constraints$;

CREATE INDEX IF NOT EXISTS idx_user_profiles_public_members
  ON user_profiles(public_visible, member_status, member_category, user_id);

-- Legacy alumni accounts remain usable so graduates can maintain their public profiles.
UPDATE users
SET status = 'active', updated_at = now()
FROM user_profiles
WHERE user_profiles.user_id = users.id
  AND user_profiles.member_status = 'alumni'
  AND users.status = 'disabled';
