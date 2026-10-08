-- ResearchMate Database Schema
-- Section 2.2: PostgreSQL Database Schema Contract

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  status text not null default 'pending', -- pending | searching | analyzing | comparing | gap_finding | reporting | done | error
  current_step text default 'Initializing...',
  error_message text,
  created_at timestamptz default now()
);

create table if not exists papers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  title text not null,
  authors text[],
  year int,
  source text,                          -- 'openalex' | 'semanticscholar'
  doi text,
  pdf_url text,
  oa_status boolean default false,
  raw_text text
);

create table if not exists paper_analysis (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid references papers(id) on delete cascade,
  problem text,
  methodology text,
  dataset text,
  results text,
  limitations text,
  future_work text,
  model_used text
);

create table if not exists comparisons (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  dimension text,                       -- 'methodology' | 'dataset' | 'results'
  summary text
);

create table if not exists gaps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  title text not null,
  description text not null,
  suggested_direction text not null,
  supporting_paper_ids uuid[]
);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  content_markdown text not null,
  created_at timestamptz default now()
);

-- Live agent activity log (powers the tracker console)
create table if not exists project_events (
  id serial primary key,
  project_id uuid not null references projects(id) on delete cascade,
  agent text not null,
  level text not null default 'info',  -- info | success | warn | error
  message text not null,
  created_at timestamptz default now()
);

create index if not exists project_events_project_idx on project_events(project_id, id);

-- Additive migrations for databases created by earlier versions
alter table projects add column if not exists completed_at timestamptz;
alter table papers add column if not exists relevance_score double precision;
alter table papers add column if not exists text_source text;
alter table gaps add column if not exists severity text;
