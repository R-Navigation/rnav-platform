CREATE TABLE IF NOT EXISTS site_content_revisions (
  module_key text PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO site_content_revisions (module_key)
VALUES
  ('page:site'), ('page:home'), ('page:research_page'), ('page:news_page'),
  ('page:team_page'), ('page:facilities_page'), ('page:contact_page'),
  ('research-items'), ('news-items'), ('team-members'), ('facility-items'), ('contact-items')
ON CONFLICT (module_key) DO NOTHING;
