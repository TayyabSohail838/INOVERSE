-- Inovix AI Cofounder: database schema
-- Run this once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- Every table has a `company` column so more companies can use the app later.
-- Row Level Security is ON with no policies: only the server (service role key) can read or write.

create extension if not exists pgcrypto;

create table if not exists company_profile (
  company     text primary key,
  name        text not null,
  about       text not null default '',          -- free text: approach, customers, model, stage, stack
  updated_at  timestamptz not null default now()
);

create table if not exists team_members (
  id          uuid primary key default gen_random_uuid(),
  company     text not null default 'inovix',
  name        text not null,
  role        text not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists products (
  id          uuid primary key default gen_random_uuid(),
  company     text not null default 'inovix',
  name        text not null,
  description text not null default '',
  stage       text not null default 'idea',          -- idea, prototype, pilot, paying, paused
  created_at  timestamptz not null default now()
);

-- What the Investigator is allowed to use: real conversations, prices, competitors, test results
create table if not exists evidence (
  id          uuid primary key default gen_random_uuid(),
  company     text not null default 'inovix',
  kind        text not null default 'other'
              check (kind in ('customer', 'competitor', 'price', 'research', 'test_result', 'other')),
  title       text not null default '',
  content     text not null,
  product     text,
  source      text,
  created_at  timestamptz not null default now()
);

-- Work the weekly review checks: anything with a next action and an owner
create table if not exists commitments (
  id              uuid primary key default gen_random_uuid(),
  company         text not null default 'inovix',
  name            text not null,
  owner           text not null default '',
  next_action     text not null default '',
  status          text not null default 'active'
                  check (status in ('active', 'someday', 'done', 'dropped')),
  last_touched_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create table if not exists messages (
  id          uuid primary key default gen_random_uuid(),
  company     text not null default 'inovix',
  role        text not null check (role in ('user', 'assistant')),
  text        text not null,
  skill       text,
  created_at  timestamptz not null default now()
);

create table if not exists gap_checks (
  id          uuid primary key default gen_random_uuid(),
  company     text not null default 'inovix',
  idea        text not null,
  brief       jsonb,
  panel       jsonb,
  verdict     jsonb,
  test        jsonb,
  write_up    text,
  created_at  timestamptz not null default now()
);

-- The 48-hour tests. Logging a result turns it into evidence for the next gap check.
create table if not exists experiments (
  id            uuid primary key default gen_random_uuid(),
  company       text not null default 'inovix',
  gap_check_id  uuid references gap_checks(id) on delete set null,
  name          text not null,
  plan          text not null default '',
  pass_line     text not null default '',
  status        text not null default 'planned'
                check (status in ('planned', 'running', 'passed', 'failed')),
  result_notes  text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists weekly_reviews (
  id          uuid primary key default gen_random_uuid(),
  company     text not null default 'inovix',
  updates     text not null default '',
  health      jsonb,
  output      jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists evidence_company_created on evidence (company, created_at desc);
create index if not exists messages_company_created on messages (company, created_at desc);
create index if not exists gap_checks_company_created on gap_checks (company, created_at desc);
create index if not exists experiments_company_created on experiments (company, created_at desc);

alter table company_profile enable row level security;
alter table team_members    enable row level security;
alter table products        enable row level security;
alter table evidence        enable row level security;
alter table commitments     enable row level security;
alter table messages        enable row level security;
alter table gap_checks      enable row level security;
alter table experiments     enable row level security;
alter table weekly_reviews  enable row level security;
