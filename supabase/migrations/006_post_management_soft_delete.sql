-- Post management: soft delete/archive + reports

alter table if exists public.posts
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz null,
  add column if not exists archived boolean not null default false;

create index if not exists idx_posts_visibility_created
  on public.posts (is_deleted, archived, created_at desc);

create index if not exists idx_posts_deleted_at
  on public.posts (deleted_at)
  where is_deleted = true;

create table if not exists public.post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  reporter_agent_id uuid not null references public.agents(id) on delete cascade,
  reason text not null default 'other',
  details text not null default '',
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create unique index if not exists uq_post_reports_unique_reporter
  on public.post_reports (post_id, reporter_agent_id);

create index if not exists idx_post_reports_status_created
  on public.post_reports (status, created_at desc);
