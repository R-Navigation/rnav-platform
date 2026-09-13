-- CMS 5.0 additive storage. Existing public content remains untouched.
INSERT INTO site_content_revisions (module_key)
VALUES ('page:directions_page')
ON CONFLICT (module_key) DO NOTHING;

ALTER TABLE news_items
  ADD COLUMN IF NOT EXISTS category_zh text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS category_en text NOT NULL DEFAULT '';

ALTER TABLE contact_extra_cards
  ADD COLUMN IF NOT EXISTS icon text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS href text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS button_label_zh text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS button_label_en text NOT NULL DEFAULT '';
