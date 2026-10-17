-- Run this in the Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_date date not null,
  description text not null,
  merchant text,
  amount numeric(14,2) not null check (amount >= 0),
  kind text not null check (kind in ('income','expense')),
  category text not null default 'Other',
  source text not null default 'manual' check (source in ('manual','import')),
  created_at timestamptz not null default now()
);

create index if not exists transactions_user_date_idx
  on public.transactions(user_id, transaction_date desc);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  premium_status text not null default 'free' check (premium_status in ('free','active','past_due','cancelled')),
  razorpay_subscription_id text,
  updated_at timestamptz not null default now()
);

alter table public.transactions enable row level security;
alter table public.profiles enable row level security;

create policy "Users can read own transactions" on public.transactions
  for select using (auth.uid() = user_id);
create policy "Users can add own transactions" on public.transactions
  for insert with check (auth.uid() = user_id);
create policy "Users can update own transactions" on public.transactions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own transactions" on public.transactions
  for delete using (auth.uid() = user_id);

create policy "Users can read own profile" on public.profiles
  for select using (auth.uid() = user_id);
-- Profile writes are intentionally server-only. The server uses the service-role key
-- to initialize profiles and later apply verified subscription webhooks. This prevents
-- a client from granting itself premium_status=active.

-- Keep service-role key private. Never place it in public/index.html.
