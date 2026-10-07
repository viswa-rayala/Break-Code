-- ==============================================================================
-- BreakCode Supabase Database Schema
-- Run this in your Supabase SQL Editor: Dashboard -> SQL Editor -> New Query
-- ==============================================================================

-- Enable pgcrypto extension for UUID generation
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. Users Table
-- Stores user accounts, authentication credentials, and metadata.
-- ------------------------------------------------------------------------------
create table if not exists public.users (
    id text primary key default gen_random_uuid()::text,
    name text not null,
    email text not null unique,
    password_hash text not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_users_email on public.users (email);

-- ------------------------------------------------------------------------------
-- 2. Courses Table
-- Stores learning tracks, categories, hours, lessons, and published status.
-- ------------------------------------------------------------------------------
create table if not exists public.courses (
    id text primary key default gen_random_uuid()::text,
    title text not null,
    description text not null,
    category text not null check (category in ('web', 'data', 'tools')),
    level text not null check (level in ('Beginner', 'Intermediate', 'All levels')),
    hours integer not null check (hours >= 1),
    lessons integer not null check (lessons >= 1),
    published boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_courses_published on public.courses (published, updated_at desc, created_at desc);

-- ------------------------------------------------------------------------------
-- 3. Enrollments Table
-- Tracks student enrollment, total lessons, completed lessons, and timestamps.
-- ------------------------------------------------------------------------------
create table if not exists public.enrollments (
    id text primary key default gen_random_uuid()::text,
    user_id text not null references public.users(id) on delete cascade,
    course_id text not null references public.courses(id) on delete cascade,
    enrolled_at timestamptz not null default now(),
    lesson_count integer not null default 0,
    lessons_completed integer not null default 0,
    updated_at timestamptz not null default now(),
    last_practiced_at timestamptz,
    unique (user_id, course_id)
);

create index if not exists idx_enrollments_user_id on public.enrollments (user_id);
create index if not exists idx_enrollments_course_id on public.enrollments (course_id);

-- ------------------------------------------------------------------------------
-- 4. Practice Sessions Table
-- Logs daily practice minutes per user for calculating streaks & heatmaps.
-- ------------------------------------------------------------------------------
create table if not exists public.practice_sessions (
    id text primary key default gen_random_uuid()::text,
    user_id text not null references public.users(id) on delete cascade,
    date text not null,
    minutes integer not null default 0,
    updated_at timestamptz not null default now(),
    unique (user_id, date)
);

create index if not exists idx_practice_sessions_user_date on public.practice_sessions (user_id, date);

-- ------------------------------------------------------------------------------
-- 5. Site Content Table
-- Stores dynamic announcements and configuration settings.
-- ------------------------------------------------------------------------------
create table if not exists public.site_content (
    key text primary key,
    value text not null default '',
    updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------------------
-- 6. Password Resets Table
-- Stores one-time password (OTP) hashes for password reset flows.
-- ------------------------------------------------------------------------------
create table if not exists public.password_resets (
    id text primary key default gen_random_uuid()::text,
    email text not null,
    otp_hash text not null,
    expires_at timestamptz not null,
    created_at timestamptz not null default now(),
    used boolean not null default false
);

create index if not exists idx_password_resets_lookup on public.password_resets (email, used, expires_at);

-- ------------------------------------------------------------------------------
-- Row Level Security (RLS)
-- Enables security policies on all public tables.
-- ------------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.courses enable row level security;
alter table public.enrollments enable row level security;
alter table public.practice_sessions enable row level security;
alter table public.site_content enable row level security;
alter table public.password_resets enable row level security;

-- Policies for service_role (used by Express server with SUPABASE_SERVICE_ROLE_KEY)
drop policy if exists "Service role full access to users" on public.users;
create policy "Service role full access to users" on public.users for all to service_role using (true) with check (true);

drop policy if exists "Service role full access to courses" on public.courses;
create policy "Service role full access to courses" on public.courses for all to service_role using (true) with check (true);

drop policy if exists "Service role full access to enrollments" on public.enrollments;
create policy "Service role full access to enrollments" on public.enrollments for all to service_role using (true) with check (true);

drop policy if exists "Service role full access to practice_sessions" on public.practice_sessions;
create policy "Service role full access to practice_sessions" on public.practice_sessions for all to service_role using (true) with check (true);

drop policy if exists "Service role full access to site_content" on public.site_content;
create policy "Service role full access to site_content" on public.site_content for all to service_role using (true) with check (true);

drop policy if exists "Service role full access to password_resets" on public.password_resets;
create policy "Service role full access to password_resets" on public.password_resets for all to service_role using (true) with check (true);

-- Public read access for published courses
drop policy if exists "Public read published courses" on public.courses;
create policy "Public read published courses" on public.courses for select using (published = true);

-- ------------------------------------------------------------------------------
-- Initial Seed Data
-- Default courses and announcement banner
-- ------------------------------------------------------------------------------
insert into public.courses (id, title, description, category, level, hours, lessons, published)
values
    ('6ac1569cc79fb32f99e92dfe', 'HTML & CSS essentials', 'Build polished pages from the ground up.', 'web', 'Beginner', 6, 24, true),
    ('6ac1569cc79fb32f99e92dff', 'React in practice', 'Turn ideas into fast, flexible interfaces.', 'web', 'Intermediate', 9, 31, true),
    ('6ac1569cc79fb32f99e92e00', 'Python for data thinking', 'Learn to explore, shape and explain data.', 'data', 'Beginner', 7, 20, true),
    ('6ac1569cc79fb32f99e92e01', 'Git & GitHub workflow', 'Make version control part of your rhythm.', 'tools', 'All levels', 3, 12, true),
    ('6ac1569cc79fb32f99e92e02', 'Machine learning basics', 'Understand models without the mystery.', 'data', 'Intermediate', 10, 28, true),
    ('6ac1569cc79fb32f99e92e03', 'SQL from zero', 'Ask better questions of your data.', 'tools', 'Beginner', 4, 15, true),
    ('6ac1569cc79fb32f99e92e04', 'JavaScript foundations', 'Functions, arrays and the logic behind interactive experiences.', 'web', 'Beginner', 8, 12, true)
on conflict (id) do nothing;

insert into public.site_content (key, value)
values ('announcement', '')
on conflict (key) do nothing;
