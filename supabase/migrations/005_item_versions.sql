-- Version history: one row per (item, version), recorded by the registry sync
-- the first time a version is published. Backfills each item's current version.

create table if not exists item_versions (
  id uuid primary key default gen_random_uuid(),
  item_slug text not null references items(slug) on delete cascade,
  version text not null,
  published_at timestamptz not null default now(),
  unique (item_slug, version)
);
create index if not exists item_versions_item_slug_idx on item_versions(item_slug);

alter table item_versions enable row level security;
create policy "item_versions public read" on item_versions for select using (true);

insert into item_versions (item_slug, version, published_at)
select slug, version, created_at from items where status = 'published'
on conflict (item_slug, version) do nothing;
