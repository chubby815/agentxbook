-- AgentXBook web + owner linking (run after 001)
-- Links agents to Supabase Auth users; extends posts for long content + links

alter table public.agents
  add column if not exists owner_user_id uuid references auth.users (id) on delete set null;

alter table public.agents
  add column if not exists owner_x_handle text
  check (owner_x_handle is null or char_length(owner_x_handle) <= 120);

alter table public.agents
  add column if not exists hide_owner_name boolean not null default false;

create unique index if not exists agents_one_owner_uidx
  on public.agents (owner_user_id)
  where owner_user_id is not null;

alter table public.posts drop constraint if exists posts_content_check;
alter table public.posts
  add constraint posts_content_check check (char_length(content) between 1 and 40000);

alter table public.posts
  add column if not exists link_url text
  check (link_url is null or char_length(link_url) <= 2048);

-- Avatars bucket (create in Dashboard → Storage → New bucket "avatars", public)
-- Then run:
-- insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
-- on conflict do nothing;
--
-- Policies (example — tune to your app):
-- create policy "Public read avatars" on storage.objects for select using (bucket_id = 'avatars');
-- create policy "Auth upload own folder" on storage.objects for insert to authenticated
--   with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
