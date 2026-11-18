-- 1. Add owner_profile ('primary' | 'spouse' | 'joint') and cash_balance for stock/RSU accounts
alter table public.accounts
  add column if not exists owner_profile text not null default 'primary'
    check (owner_profile in ('primary', 'spouse', 'joint')),
  add column if not exists cash_balance numeric(14,2) not null default 0;

create index if not exists accounts_user_owner_idx on public.accounts (user_id, owner_profile);

alter table public.expenses
  add column if not exists owner_profile text not null default 'primary'
    check (owner_profile in ('primary', 'spouse', 'joint'));

alter table public.recurring_bills
  add column if not exists owner_profile text not null default 'primary'
    check (owner_profile in ('primary', 'spouse', 'joint'));

-- 2. Household Settings (customizable display names for Primary & Spouse)
create table if not exists public.household_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  primary_name text not null default 'Me' check (char_length(trim(primary_name)) > 0),
  spouse_name text not null default 'Wife' check (char_length(trim(spouse_name)) > 0),
  updated_at timestamptz not null default now()
);

alter table public.household_settings enable row level security;
alter table public.household_settings force row level security;
revoke all on table public.household_settings from public, anon;
grant select, insert, update, delete on table public.household_settings to authenticated;

create policy "household_settings_select_owner" on public.household_settings
  for select to authenticated
  using ((select auth.uid()) = user_id and (select private.can_access_vault()));

create policy "household_settings_insert_owner" on public.household_settings
  for insert to authenticated
  with check ((select auth.uid()) = user_id and (select private.can_access_vault()));

create policy "household_settings_update_owner" on public.household_settings
  for update to authenticated
  using ((select auth.uid()) = user_id and (select private.can_access_vault()))
  with check ((select auth.uid()) = user_id and (select private.can_access_vault()));

create policy "household_settings_delete_owner" on public.household_settings
  for delete to authenticated
  using ((select auth.uid()) = user_id and (select private.can_access_vault()));

-- 3. Equity & RSU Holdings (tied to live stock prices)
create table if not exists public.equity_holdings (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id bigint not null references public.accounts(id) on delete cascade,
  symbol text not null check (char_length(trim(symbol)) > 0),
  holding_type text not null default 'rsu' check (holding_type in ('rsu', 'stock', 'etf', 'espp')),
  shares numeric(16,6) not null check (shares >= 0),
  unvested_shares numeric(16,6) not null default 0 check (unvested_shares >= 0),
  cost_basis_per_share numeric(14,4) check (cost_basis_per_share is null or cost_basis_per_share >= 0),
  last_price numeric(14,4) not null default 0,
  prev_close numeric(14,4),
  last_price_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists equity_holdings_user_id_idx on public.equity_holdings (user_id);
create index if not exists equity_holdings_account_id_idx on public.equity_holdings (account_id);

alter table public.equity_holdings enable row level security;
alter table public.equity_holdings force row level security;
revoke all on table public.equity_holdings from public, anon;
grant select, insert, update, delete on table public.equity_holdings to authenticated;

create policy "holdings_select_owner" on public.equity_holdings
  for select to authenticated
  using ((select auth.uid()) = user_id and (select private.can_access_vault()));

create policy "holdings_insert_owner" on public.equity_holdings
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (select private.can_access_vault())
    and exists (
      select 1 from public.accounts a
      where a.id = account_id and a.user_id = (select auth.uid())
    )
  );

create policy "holdings_update_owner" on public.equity_holdings
  for update to authenticated
  using ((select auth.uid()) = user_id and (select private.can_access_vault()))
  with check (
    (select auth.uid()) = user_id
    and (select private.can_access_vault())
    and exists (
      select 1 from public.accounts a
      where a.id = account_id and a.user_id = (select auth.uid())
    )
  );

create policy "holdings_delete_owner" on public.equity_holdings
  for delete to authenticated
  using ((select auth.uid()) = user_id and (select private.can_access_vault()));

-- 4. Credit Card Balance Transfer Promos & Reminders
create table if not exists public.credit_card_promos (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id bigint not null references public.accounts(id) on delete cascade,
  label text not null check (char_length(trim(label)) > 0),
  original_amount numeric(14,2) not null check (original_amount >= 0),
  promo_balance numeric(14,2) not null check (promo_balance >= 0),
  promo_apr numeric(6,3) not null default 0 check (promo_apr >= 0 and promo_apr <= 100),
  standard_apr numeric(6,3) check (standard_apr is null or (standard_apr >= 0 and standard_apr <= 100)),
  transfer_fee_pct numeric(5,2) check (transfer_fee_pct is null or transfer_fee_pct >= 0),
  start_date date,
  expires_on date not null,
  is_paid_off boolean not null default false,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists credit_card_promos_user_expires_idx on public.credit_card_promos (user_id, expires_on asc);
create index if not exists credit_card_promos_account_id_idx on public.credit_card_promos (account_id);

alter table public.credit_card_promos enable row level security;
alter table public.credit_card_promos force row level security;
revoke all on table public.credit_card_promos from public, anon;
grant select, insert, update, delete on table public.credit_card_promos to authenticated;

create policy "promos_select_owner" on public.credit_card_promos
  for select to authenticated
  using ((select auth.uid()) = user_id and (select private.can_access_vault()));

create policy "promos_insert_owner" on public.credit_card_promos
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (select private.can_access_vault())
    and exists (
      select 1 from public.accounts a
      where a.id = account_id and a.user_id = (select auth.uid())
    )
  );

create policy "promos_update_owner" on public.credit_card_promos
  for update to authenticated
  using ((select auth.uid()) = user_id and (select private.can_access_vault()))
  with check (
    (select auth.uid()) = user_id
    and (select private.can_access_vault())
    and exists (
      select 1 from public.accounts a
      where a.id = account_id and a.user_id = (select auth.uid())
    )
  );

create policy "promos_delete_owner" on public.credit_card_promos
  for delete to authenticated
  using ((select auth.uid()) = user_id and (select private.can_access_vault()));

grant usage, select on all sequences in schema public to authenticated;
