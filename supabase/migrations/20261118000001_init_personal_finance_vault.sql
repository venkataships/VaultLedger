-- Personal Finance Vault: Schema, Single-Owner Lock, MFA (aal2) Enforcement & RLS
-- Provisioned automatically on Supabase project ucrbocknokusjjayrgpf

create schema if not exists private;
grant usage on schema private to authenticated, supabase_auth_admin;

create table if not exists private.vault_owner (
  singleton boolean primary key default true check (singleton = true),
  owner_user_id uuid not null unique references auth.users(id) on delete cascade,
  owner_email text not null,
  claimed_at timestamptz not null default now()
);

alter table private.vault_owner enable row level security;
alter table private.vault_owner force row level security;

create or replace function private.enforce_single_owner_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.is_anonymous, false) is true then
    raise exception 'Anonymous sessions are disabled for this private finance vault.';
  end if;

  if exists (select 1 from private.vault_owner) or exists (select 1 from auth.users) then
    raise exception 'Vault registration is locked to the single owner account.';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_single_owner_before_insert() from public, anon, authenticated;
grant execute on function private.enforce_single_owner_before_insert() to supabase_auth_admin;

create or replace function private.register_first_owner_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.is_anonymous, false) is false then
    insert into private.vault_owner (singleton, owner_user_id, owner_email)
    values (true, new.id, coalesce(new.email, ''))
    on conflict (singleton) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.register_first_owner_after_insert() from public, anon, authenticated;
grant execute on function private.register_first_owner_after_insert() to supabase_auth_admin;

create trigger trg_enforce_single_owner_before
  before insert on auth.users
  for each row
  execute function private.enforce_single_owner_before_insert();

create trigger trg_register_first_owner_after
  after insert on auth.users
  for each row
  execute function private.register_first_owner_after_insert();

create or replace function private.can_access_vault()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false) = false
    and exists (
      select 1
      from private.vault_owner vo
      where vo.singleton = true
        and vo.owner_user_id = (select auth.uid())
    )
    and (
      case
        when exists (
          select 1
          from auth.mfa_factors mf
          where mf.user_id = (select auth.uid())
            and mf.status = 'verified'
        )
        then ((select auth.jwt())->>'aal') = 'aal2'
        else coalesce(((select auth.jwt())->>'aal'), 'aal1') in ('aal1', 'aal2')
      end
    );
$$;

revoke all on function private.can_access_vault() from public, anon;
grant execute on function private.can_access_vault() to authenticated;

create or replace function public.get_vault_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'is_claimed', exists (select 1 from private.vault_owner where singleton = true),
    'is_owner', (
      (select auth.uid()) is not null
      and exists (
        select 1
        from private.vault_owner vo
        where vo.singleton = true
          and vo.owner_user_id = (select auth.uid())
      )
    )
  );
$$;

revoke all on function public.get_vault_status() from public;
grant execute on function public.get_vault_status() to anon, authenticated;

create table if not exists public.accounts (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  institution text not null default '',
  category text not null check (
    category in (
      'retirement_401k',
      'bank',
      'investment',
      'credit_card',
      'loan',
      'other_asset',
      'other_liability'
    )
  ),
  subtype text not null default '',
  is_liability boolean not null,
  current_balance numeric(14,2) not null default 0,
  credit_limit numeric(14,2) check (credit_limit is null or credit_limit >= 0),
  original_principal numeric(14,2) check (original_principal is null or original_principal >= 0),
  interest_rate numeric(6,3) check (interest_rate is null or (interest_rate >= 0 and interest_rate <= 100)),
  minimum_payment numeric(14,2) check (minimum_payment is null or minimum_payment >= 0),
  due_day smallint check (due_day is null or (due_day >= 1 and due_day <= 31)),
  notes text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  is_archived boolean not null default false,
  last_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint accounts_category_liability_check check (
    (category in ('credit_card', 'loan', 'other_liability') and is_liability = true)
    or (category in ('retirement_401k', 'bank', 'investment', 'other_asset') and is_liability = false)
  )
);

create index if not exists accounts_user_id_idx on public.accounts (user_id);
create index if not exists accounts_user_category_idx on public.accounts (user_id, category);

create table if not exists public.balance_snapshots (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id bigint not null references public.accounts(id) on delete cascade,
  snapshot_date date not null default current_date,
  balance numeric(14,2) not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  constraint balance_snapshots_account_date_unique unique (account_id, snapshot_date)
);

create index if not exists balance_snapshots_user_id_idx on public.balance_snapshots (user_id);
create index if not exists balance_snapshots_account_id_idx on public.balance_snapshots (account_id);
create index if not exists balance_snapshots_user_date_idx on public.balance_snapshots (user_id, snapshot_date desc);

create table if not exists public.recurring_bills (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  category text not null,
  amount numeric(14,2) not null check (amount >= 0),
  due_day smallint check (due_day is null or (due_day >= 1 and due_day <= 31)),
  cadence text not null default 'monthly' check (cadence in ('monthly', 'quarterly', 'annual')),
  payment_account_id bigint references public.accounts(id) on delete set null,
  is_essential boolean not null default true,
  autopay boolean not null default true,
  is_active boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists recurring_bills_user_id_idx on public.recurring_bills (user_id);
create index if not exists recurring_bills_payment_account_id_idx on public.recurring_bills (payment_account_id);

create table if not exists public.expenses (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  expense_date date not null default current_date,
  merchant text not null check (char_length(trim(merchant)) > 0),
  category text not null,
  amount numeric(14,2) not null check (amount >= 0),
  payment_account_id bigint references public.accounts(id) on delete set null,
  recurring_bill_id bigint references public.recurring_bills(id) on delete set null,
  is_essential boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists expenses_user_date_idx on public.expenses (user_id, expense_date desc);
create index if not exists expenses_payment_account_id_idx on public.expenses (payment_account_id);
create index if not exists expenses_recurring_bill_id_idx on public.expenses (recurring_bill_id);

create table if not exists public.monthly_budgets (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null,
  monthly_limit numeric(14,2) not null check (monthly_limit >= 0),
  updated_at timestamptz not null default now(),
  constraint monthly_budgets_user_category_unique unique (user_id, category)
);

create index if not exists monthly_budgets_user_id_idx on public.monthly_budgets (user_id);

alter table public.accounts enable row level security;
alter table public.accounts force row level security;
alter table public.balance_snapshots enable row level security;
alter table public.balance_snapshots force row level security;
alter table public.recurring_bills enable row level security;
alter table public.recurring_bills force row level security;
alter table public.expenses enable row level security;
alter table public.expenses force row level security;
alter table public.monthly_budgets enable row level security;
alter table public.monthly_budgets force row level security;

revoke all on table
  public.accounts,
  public.balance_snapshots,
  public.recurring_bills,
  public.expenses,
  public.monthly_budgets
from public, anon;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table
  public.accounts,
  public.balance_snapshots,
  public.recurring_bills,
  public.expenses,
  public.monthly_budgets
to authenticated;
grant usage, select on all sequences in schema public to authenticated;

create policy "accounts_select_owner" on public.accounts
  for select to authenticated
  using ((select auth.uid()) = user_id and (select private.can_access_vault()));

create policy "accounts_insert_owner" on public.accounts
  for insert to authenticated
  with check ((select auth.uid()) = user_id and (select private.can_access_vault()));

create policy "accounts_update_owner" on public.accounts
  for update to authenticated
  using ((select auth.uid()) = user_id and (select private.can_access_vault()))
  with check ((select auth.uid()) = user_id and (select private.can_access_vault()));

create policy "accounts_delete_owner" on public.accounts
  for delete to authenticated
  using ((select auth.uid()) = user_id and (select private.can_access_vault()));

create policy "snapshots_select_owner" on public.balance_snapshots
  for select to authenticated
  using ((select auth.uid()) = user_id and (select private.can_access_vault()));

create policy "snapshots_insert_owner" on public.balance_snapshots
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (select private.can_access_vault())
    and exists (
      select 1 from public.accounts a
      where a.id = account_id and a.user_id = (select auth.uid())
    )
  );

create policy "snapshots_update_owner" on public.balance_snapshots
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

create policy "snapshots_delete_owner" on public.balance_snapshots
  for delete to authenticated
  using ((select auth.uid()) = user_id and (select private.can_access_vault()));

create policy "bills_select_owner" on public.recurring_bills
  for select to authenticated
  using ((select auth.uid()) = user_id and (select private.can_access_vault()));

create policy "bills_insert_owner" on public.recurring_bills
  for insert to authenticated
  with check ((select auth.uid()) = user_id and (select private.can_access_vault()));

create policy "bills_update_owner" on public.recurring_bills
  for update to authenticated
  using ((select auth.uid()) = user_id and (select private.can_access_vault()))
  with check ((select auth.uid()) = user_id and (select private.can_access_vault()));

create policy "bills_delete_owner" on public.recurring_bills
  for delete to authenticated
  using ((select auth.uid()) = user_id and (select private.can_access_vault()));

create policy "expenses_select_owner" on public.expenses
  for select to authenticated
  using ((select auth.uid()) = user_id and (select private.can_access_vault()));

create policy "expenses_insert_owner" on public.expenses
  for insert to authenticated
  with check ((select auth.uid()) = user_id and (select private.can_access_vault()));

create policy "expenses_update_owner" on public.expenses
  for update to authenticated
  using ((select auth.uid()) = user_id and (select private.can_access_vault()))
  with check ((select auth.uid()) = user_id and (select private.can_access_vault()));

create policy "expenses_delete_owner" on public.expenses
  for delete to authenticated
  using ((select auth.uid()) = user_id and (select private.can_access_vault()));

create policy "budgets_select_owner" on public.monthly_budgets
  for select to authenticated
  using ((select auth.uid()) = user_id and (select private.can_access_vault()));

create policy "budgets_insert_owner" on public.monthly_budgets
  for insert to authenticated
  with check ((select auth.uid()) = user_id and (select private.can_access_vault()));

create policy "budgets_update_owner" on public.monthly_budgets
  for update to authenticated
  using ((select auth.uid()) = user_id and (select private.can_access_vault()))
  with check ((select auth.uid()) = user_id and (select private.can_access_vault()));

create policy "budgets_delete_owner" on public.monthly_budgets
  for delete to authenticated
  using ((select auth.uid()) = user_id and (select private.can_access_vault()));
