-- ─────────────────────────────────────────────────────────────
-- Task Management – Supabase Schema
-- Paste this entire file into: Supabase → SQL Editor → Run
-- ─────────────────────────────────────────────────────────────

-- Workspaces
create table if not exists workspaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  owner_id   uuid,
  created_at timestamptz default now()
);

-- Users (we store password_hash ourselves, not using Supabase Auth)
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid references workspaces(id) on delete cascade,
  email         text unique not null,
  name          text not null,
  role          text not null default 'Member',
  password_hash text not null,
  created_at    timestamptz default now()
);

-- Add owner_id FK now that users table exists
alter table workspaces
  add constraint fk_workspace_owner
  foreign key (owner_id) references users(id) on delete set null;

-- Tasks  (id is a client-generated string, not a UUID)
create table if not exists tasks (
  id            text primary key,
  workspace_id  uuid references workspaces(id) on delete cascade,
  title         text not null,
  description   text default '',
  priority      text default 'middle',
  start_date    text,
  due_date      text,
  status        text default 'notstarted',
  progress      integer default 0,
  created_by    uuid references users(id) on delete set null,
  created_at    text default now()
);

-- Invites
create table if not exists invites (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid references workspaces(id) on delete cascade,
  email         text not null,
  token         uuid not null default gen_random_uuid(),
  invited_by    uuid references users(id) on delete set null,
  used          boolean default false,
  created_at    timestamptz default now()
);

-- Indexes for common lookups
create index if not exists idx_users_email          on users(email);
create index if not exists idx_users_workspace      on users(workspace_id);
create index if not exists idx_tasks_workspace      on tasks(workspace_id);
create index if not exists idx_invites_token        on invites(token);
create index if not exists idx_invites_email_ws     on invites(email, workspace_id);

-- Disable RLS (we use the service role key server-side, so RLS is not needed)
alter table workspaces disable row level security;
alter table users      disable row level security;
alter table tasks      disable row level security;
alter table invites    disable row level security;
