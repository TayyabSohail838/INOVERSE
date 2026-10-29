-- INOVERSE: people & outreach, Google Calendar, WhatsApp bot.
-- Run once in Supabase → SQL Editor → New query. Safe to run again.
-- Includes the tasks tables too, so you don't need to run tasks.sql separately.

-- ---------- tasks + Google connection (same as tasks.sql) ----------
create table if not exists tasks (
  id          uuid primary key default gen_random_uuid(),
  company     text not null default 'inovix',
  title       text not null,
  notes       text not null default '',
  due_at      timestamptz,
  status      text not null default 'open' check (status in ('open', 'done')),
  source      text not null default 'manual',   -- manual | email | whatsapp
  source_id   text,
  created_at  timestamptz not null default now()
);
create unique index if not exists tasks_company_source_id on tasks (company, source_id) where source_id is not null;
create index if not exists tasks_company_due on tasks (company, status, due_at);

create table if not exists integrations (
  company        text not null default 'inovix',
  provider       text not null,
  account        text not null default '',
  refresh_token  text not null,
  last_synced_at timestamptz,
  created_at     timestamptz not null default now(),
  primary key (company, provider)
);
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
