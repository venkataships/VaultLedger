-- Zero-PII Household Pay Structure & Tax Optimization Profile (for Gemini AI Advisor)
-- Strictly numeric compensation & tax parameters — never stores SSN, address, or account numbers.

create table if not exists public.tax_comp_profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  filing_status text not null default 'married_filing_jointly'
    check (filing_status in ('married_filing_jointly', 'married_filing_separately', 'single', 'head_of_household')),
  state_code text not null default '' check (char_length(state_code) <= 10),
  dependents_count integer not null default 0 check (dependents_count >= 0 and dependents_count <= 20),
  primary_base_salary numeric(14,2) not null default 0 check (primary_base_salary >= 0),
  primary_bonus_annual numeric(14,2) not null default 0 check (primary_bonus_annual >= 0),
  primary_rsu_annual numeric(14,2) not null default 0 check (primary_rsu_annual >= 0),
  primary_401k_ytd numeric(14,2) not null default 0 check (primary_401k_ytd >= 0),
  primary_has_mega_backdoor boolean not null default false,
  primary_espp_enrolled boolean not null default false,
  spouse_base_salary numeric(14,2) not null default 0 check (spouse_base_salary >= 0),
  spouse_bonus_annual numeric(14,2) not null default 0 check (spouse_bonus_annual >= 0),
  spouse_rsu_annual numeric(14,2) not null default 0 check (spouse_rsu_annual >= 0),
  spouse_401k_ytd numeric(14,2) not null default 0 check (spouse_401k_ytd >= 0),
  spouse_has_mega_backdoor boolean not null default false,
  spouse_espp_enrolled boolean not null default false,
  hsa_plan_type text not null default 'none' check (hsa_plan_type in ('none', 'self', 'family')),
  hsa_contrib_ytd numeric(14,2) not null default 0 check (hsa_contrib_ytd >= 0),
  risk_tolerance text not null default 'moderate_growth'
    check (risk_tolerance in ('conservative', 'moderate_growth', 'aggressive')),
  financial_goals text not null default '' check (char_length(financial_goals) <= 2000),
  updated_at timestamptz not null default now()
);

alter table public.tax_comp_profiles enable row level security;
alter table public.tax_comp_profiles force row level security;
revoke all on table public.tax_comp_profiles from public, anon;
grant select, insert, update, delete on table public.tax_comp_profiles to authenticated;

create policy "tax_comp_profiles_select_owner" on public.tax_comp_profiles
  for select to authenticated
  using ((select auth.uid()) = user_id and (select private.can_access_vault()));

create policy "tax_comp_profiles_insert_owner" on public.tax_comp_profiles
  for insert to authenticated
  with check ((select auth.uid()) = user_id and (select private.can_access_vault()));

create policy "tax_comp_profiles_update_owner" on public.tax_comp_profiles
  for update to authenticated
  using ((select auth.uid()) = user_id and (select private.can_access_vault()))
  with check ((select auth.uid()) = user_id and (select private.can_access_vault()));

create policy "tax_comp_profiles_delete_owner" on public.tax_comp_profiles
  for delete to authenticated
  using ((select auth.uid()) = user_id and (select private.can_access_vault()));
