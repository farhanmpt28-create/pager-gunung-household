-- ==============================================================================
-- PAGER GUNUNG HOUSEHOLD: SUPABASE SCHEMA (MULTI-TENANT / MULTI-HOUSEHOLD)
-- ==============================================================================
-- Skema ini mengatur pemisahan data per-household dengan Row Level Security (RLS).
-- Akun 1 dan Akun 2 masing-masing mengelola Rumah Tangga yang berbeda secara terisolasi.

-- 1. EXTENSIONS
create extension if not exists "pgcrypto";

-- 2. TABEL HOUSEHOLDS (RUMAH TANGGA)
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. TABEL HOUSEHOLD_MEMBERS (ANGGOTA RUMAH TANGGA)
create table if not exists public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text default 'owner',
  created_at timestamptz default now(),
  constraint unique_household_member unique (household_id, user_id)
);

-- 4. TABEL KATEGORI (CATEGORIES)
create table if not exists public.categories (
  id bigint not null,
  household_id uuid references public.households(id) on delete cascade not null,
  name text not null,
  type text not null check (type in ('income', 'expense')),
  created_at timestamptz default now(),
  primary key (household_id, id)
);

-- 5. TABEL PESERTA / ANGGOTA KELUARGA (PARTICIPANTS)
create table if not exists public.participants (
  id bigint not null,
  household_id uuid references public.households(id) on delete cascade not null,
  name text not null,
  description text default '',
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (household_id, id)
);

-- 6. TABEL PEMBELIAN (PURCHASES)
create table if not exists public.purchases (
  id bigint not null,
  household_id uuid references public.households(id) on delete cascade not null,
  purchase_number text not null,
  date text not null,
  status text default 'draft',
  transaction_id bigint,
  participant_ids jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (household_id, id)
);

-- 7. TABEL ITEM PEMBELIAN (PURCHASE ITEMS)
create table if not exists public.purchase_items (
  id bigint not null,
  household_id uuid references public.households(id) on delete cascade not null,
  purchase_id bigint not null,
  item_name text not null,
  quantity numeric default 1,
  price numeric default 0,
  primary key (household_id, id)
);

-- 8. TABEL TRANSAKSI (TRANSACTIONS)
create table if not exists public.transactions (
  id bigint not null,
  household_id uuid references public.households(id) on delete cascade not null,
  type text not null check (type in ('income', 'expense')),
  category_id bigint,
  category_name text,
  amount numeric not null default 0,
  date text not null,
  period text not null,
  source text,
  description text,
  purchase_id bigint,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (household_id, id)
);

-- 9. TABEL ANGGARAN (BUDGETS)
create table if not exists public.budgets (
  id bigint not null,
  household_id uuid references public.households(id) on delete cascade not null,
  period text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (household_id, id)
);

-- 10. TABEL SETTINGS
create table if not exists public.settings (
  household_id uuid references public.households(id) on delete cascade not null,
  key text not null,
  value text not null,
  created_at timestamptz default now(),
  primary key (household_id, key)
);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.categories enable row level security;
alter table public.participants enable row level security;
alter table public.transactions enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.budgets enable row level security;
alter table public.settings enable row level security;

-- Helper function: Daftar ID household milik user yang sedang login
create or replace function public.get_my_household_ids()
returns setof uuid
language sql security definer set search_path = public stable as $$
  select household_id from public.household_members where user_id = auth.uid();
$$;

-- RLS: Households
create policy "Users can view own households" on public.households
  for select using (id in (select public.get_my_household_ids()));

create policy "Users can update own households" on public.households
  for update using (id in (select public.get_my_household_ids()));

create policy "Users can insert households" on public.households
  for insert with check (auth.uid() is not null);

-- RLS: Household Members
create policy "Users can view household members" on public.household_members
  for select using (user_id = auth.uid() or household_id in (select public.get_my_household_ids()));

create policy "Owners can manage members" on public.household_members
  for all using (household_id in (select public.get_my_household_ids()));

-- RLS: Categories
create policy "Household categories access" on public.categories
  for all using (household_id in (select public.get_my_household_ids()))
  with check (household_id in (select public.get_my_household_ids()));

-- RLS: Participants
create policy "Household participants access" on public.participants
  for all using (household_id in (select public.get_my_household_ids()))
  with check (household_id in (select public.get_my_household_ids()));

-- RLS: Transactions
create policy "Household transactions access" on public.transactions
  for all using (household_id in (select public.get_my_household_ids()))
  with check (household_id in (select public.get_my_household_ids()));

-- RLS: Purchases
create policy "Household purchases access" on public.purchases
  for all using (household_id in (select public.get_my_household_ids()))
  with check (household_id in (select public.get_my_household_ids()));

-- RLS: Purchase Items
create policy "Household purchase items access" on public.purchase_items
  for all using (household_id in (select public.get_my_household_ids()))
  with check (household_id in (select public.get_my_household_ids()));

-- RLS: Budgets
create policy "Household budgets access" on public.budgets
  for all using (household_id in (select public.get_my_household_ids()))
  with check (household_id in (select public.get_my_household_ids()));

-- RLS: Settings
create policy "Household settings access" on public.settings
  for all using (household_id in (select public.get_my_household_ids()))
  with check (household_id in (select public.get_my_household_ids()));

-- ==============================================================================
-- TRIGGER OTOMATIS SAAT USER BARU DAFTAR (SIGN UP)
-- ==============================================================================
-- Otomatis membuatkan 1 Household baru & Default Kategori untuk setiap user baru
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  new_household_id uuid;
  user_name text;
  current_period text;
begin
  user_name := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));
  current_period := to_char(now(), 'YYYY-MM');
  
  -- 1. Buat Household default untuk user ini
  insert into public.households (name, created_by)
  values ('Rumah Tangga ' || user_name, new.id)
  returning id into new_household_id;

  -- 2. Daftarkan user sebagai owner di household_members
  insert into public.household_members (household_id, user_id, role)
  values (new_household_id, new.id, 'owner');

  -- 3. Isi Kategori Awal Default
  insert into public.categories (id, household_id, name, type)
  values
    (1, new_household_id, 'Salary', 'income'),
    (2, new_household_id, 'Additional Income', 'income'),
    (3, new_household_id, 'Other Income', 'income'),
    (4, new_household_id, 'Food & Beverage', 'expense'),
    (5, new_household_id, 'Transportation', 'expense'),
    (6, new_household_id, 'Household', 'expense'),
    (7, new_household_id, 'Utilities', 'expense'),
    (8, new_household_id, 'Shopping', 'expense'),
    (9, new_household_id, 'Health', 'expense'),
    (10, new_household_id, 'Education', 'expense'),
    (11, new_household_id, 'Entertainment', 'expense'),
    (12, new_household_id, 'Other Expenses', 'expense')
  on conflict do nothing;

  -- 4. Set Periode Berjalan
  insert into public.settings (household_id, key, value)
  values (new_household_id, 'period:' || current_period, current_period)
  on conflict do nothing;

  return new;
end;
$$;

-- Drop trigger lama jika ada, lalu pasang yang baru
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
