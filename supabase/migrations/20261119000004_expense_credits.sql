-- Additive support for Money Back / Reimbursement Credit entries on expenses & recurring_bills
-- Keeps amount >= 0 intact and defaults all existing rows to 'expense' with zero data loss.
alter table public.expenses
  add column if not exists entry_type text not null default 'expense'
    check (entry_type in ('expense', 'credit'));

alter table public.recurring_bills
  add column if not exists entry_type text not null default 'expense'
    check (entry_type in ('expense', 'credit'));
