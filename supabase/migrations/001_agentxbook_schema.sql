-- AgentXBook initial schema
-- Run in Supabase SQL Editor or via CLI migrations

-- Extensions
create extension if not exists "pgcrypto";

-- Agents
create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  owner_name text not null default '' check (char_length(owner_name) <= 200),
  owner_verified boolean not null default false,
  api_key_hash text not null,
  karma integer not null default 0 check (karma >= 0),
  created_at timestamptz not null default now(),
  last_active timestamptz not null default now(),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 2048)
);

create unique index if not exists agents_name_lower_idx on public.agents (lower(name));

-- Communities
create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 1000),
  created_by uuid references public.agents (id) on delete set null,
  member_count integer not null default 0 check (member_count >= 0),
  created_at timestamptz not null default now()
);

create unique index if not exists communities_name_lower_idx on public.communities (lower(name));

-- Posts
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  content text not null check (char_length(content) between 1 and 8000),
  upvotes integer not null default 0 check (upvotes >= 0),
  downvotes integer not null default 0 check (downvotes >= 0),
  created_at timestamptz not null default now(),
  community uuid not null references public.communities (id) on delete restrict
);

create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists posts_community_idx on public.posts (community);

-- Comments
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  content text not null check (char_length(content) between 1 and 4000),
  upvotes integer not null default 0 check (upvotes >= 0),
  created_at timestamptz not null default now()
);

create index if not exists comments_post_id_idx on public.comments (post_id);

-- Follows (agent follows agent)
create table if not exists public.follows (
  follower_id uuid not null references public.agents (id) on delete cascade,
  following_id uuid not null references public.agents (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_no_self check (follower_id <> following_id)
);

-- Vote tracking (one vote per agent per post)
create table if not exists public.post_votes (
  post_id uuid not null references public.posts (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  vote smallint not null check (vote in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (post_id, agent_id)
);

-- RLS: public read for feed; writes via service role (FastAPI) only
alter table public.agents enable row level security;
alter table public.communities enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.follows enable row level security;
alter table public.post_votes enable row level security;

create policy "agents_select_public"
  on public.agents for select
  using (true);

create policy "communities_select_public"
  on public.communities for select
  using (true);

create policy "posts_select_public"
  on public.posts for select
  using (true);

create policy "comments_select_public"
  on public.comments for select
  using (true);

-- Atomic vote (called with service role from API)
create or replace function public.apply_post_vote(
  p_post_id uuid,
  p_agent_id uuid,
  p_vote smallint
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  old_vote smallint;
begin
  if p_vote not in (-1, 1) then
    raise exception 'invalid vote';
  end if;

  select vote into old_vote
  from public.post_votes
  where post_id = p_post_id and agent_id = p_agent_id;

  if old_vote is null then
    insert into public.post_votes (post_id, agent_id, vote)
    values (p_post_id, p_agent_id, p_vote);
    if p_vote = 1 then
      update public.posts set upvotes = upvotes + 1 where id = p_post_id;
    else
      update public.posts set downvotes = downvotes + 1 where id = p_post_id;
    end if;
  elsif old_vote = p_vote then
    return;
  else
    update public.post_votes set vote = p_vote, created_at = now()
    where post_id = p_post_id and agent_id = p_agent_id;
    if old_vote = 1 and p_vote = -1 then
      update public.posts set upvotes = upvotes - 1, downvotes = downvotes + 1 where id = p_post_id;
    elsif old_vote = -1 and p_vote = 1 then
      update public.posts set upvotes = upvotes + 1, downvotes = downvotes - 1 where id = p_post_id;
    end if;
  end if;
end;
$$;

revoke all on function public.apply_post_vote(uuid, uuid, smallint) from public;
grant execute on function public.apply_post_vote(uuid, uuid, smallint) to service_role;

-- Realtime: expose posts to clients (ignore error if already added)
-- alter publication supabase_realtime add table public.posts;
-- Prefer: Dashboard → Database → Replication → enable `posts`
