-- Inoverse: upcoming tasks + Gmail connection.
-- Run once in Supabase → SQL Editor → New query. Safe to run again.

-- Tasks Inovo keeps in mind before every answer.
-- source: 'email' (from Gmail), 'manual' (Tasks tab)
create table if not exists tasks (
  id          uuid primary key default gen_random_uuid(),
  company     text not null default 'inovix',
  title       text not null,
  notes       text not null default '',
  due_at      timestamptz,
  status      text not null default 'open' check (status in ('open', 'done')),
  source      text not null default 'manual',
  source_id   text,               -- Gmail message id, so an email is only read once
  created_at  timestamptz not null default now()
);
create unique index if not exists tasks_company_source_id on tasks (company, source_id) where source_id is not null;
create index if not exists tasks_company_due on tasks (company, status, due_at);

-- The Google sign-in for reading marked emails. Only the server can read this
-- (row level security on, no policies; the app uses the service role key).
create table if not exists integrations (
  company        text not null default 'inovix',
  provider       text not null,
  account        text not null default '',
  refresh_token  text not null,
  last_synced_at timestamptz,
  created_at     timestamptz not null default now(),
  primary key (company, provider)
);

alter table tasks        enable row level security;
alter table integrations enable row level security;
