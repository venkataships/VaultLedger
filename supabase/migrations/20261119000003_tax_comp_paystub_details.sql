-- Additive zero-PII per-paycheck deductions, withholdings, and employer benefits JSONB
alter table public.tax_comp_profiles
  add column if not exists paystub_details jsonb not null default '{}'::jsonb;
