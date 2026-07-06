-- Drop the unused item display fields. Neither was rendered anywhere: the UI
-- uses category glyphs for icons, and READMEs are generated from item fields
-- rather than fetched from readme_url.
ALTER TABLE items DROP COLUMN IF EXISTS icon;
ALTER TABLE items DROP COLUMN IF EXISTS readme_url;
