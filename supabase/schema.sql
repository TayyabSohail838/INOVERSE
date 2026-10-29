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
  stage       text not null default 'idea',          -- idea, prototype, pilot, live, paying, paused
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

-- which Google permissions were granted (Gmail, Calendar), so the app knows when to ask again
alter table integrations add column if not exists scopes text not null default '';

-- ---------- people you're talking to: leads, clients, partners ----------
create table if not exists contacts (
  id                uuid primary key default gen_random_uuid(),
  company           text not null default 'inovix',
  name              text not null,
  phone             text not null default '',   -- with country code, e.g. 923001234567
  org               text not null default '',   -- their business
  role              text not null default '',
  stage             text not null default 'lead'
                    check (stage in ('lead', 'contacted', 'meeting', 'proposal', 'client', 'closed')),
  next_followup_at  timestamptz,
  last_contacted_at timestamptz,
  notes             text not null default '',
  source            text not null default 'manual',  -- manual | whatsapp
  created_at        timestamptz not null default now()
);
create index if not exists contacts_company_followup on contacts (company, next_followup_at);

-- ---------- WhatsApp bot: every message in and out (also stops double-handling) ----------
create table if not exists whatsapp_log (
  id          text primary key,           -- WhatsApp message id
  company     text not null default 'inovix',
  direction   text not null check (direction in ('in', 'out')),
  text        text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists whatsapp_log_company_created on whatsapp_log (company, created_at desc);

alter table tasks        enable row level security;
alter table integrations enable row level security;
alter table contacts     enable row level security;
alter table whatsapp_log enable row level security;
