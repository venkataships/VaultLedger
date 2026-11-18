import { useEffect, useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Plus,
  RefreshCw,
  Pencil,
  Trash2,
  History,
  X,
  Check,
  AlertTriangle,
  Archive,
  RotateCcw,
} from 'lucide-react';
import {
  ACCOUNT_CATEGORIES,
  computeNetWorthSummary,
  estimateLoanPayoff,
  formatCurrency,
  formatPercent,
  formatShortDate,
  ordinalDay,
  todayIsoDate,
  toNumber,
} from '../lib/finance';

const FILTER_TABS = [
  { key: 'all', label: 'All Accounts' },
  { key: 'retirement_401k', label: '401(k) & Retirement' },
  { key: 'bank', label: 'Banks & Cash' },
  { key: 'investment', label: 'Investments' },
  { key: 'credit_card', label: 'Credit Cards' },
  { key: 'loan', label: 'Active Loans' },
];

export default function AccountsTab({
  supabase,
  accounts,
  snapshots,
  initialCategoryFilter = 'all',
  privacyMode,
  onDataChanged,
  batchModalOpen,
  setBatchModalOpen,
  newAccountCategory,
  setNewAccountCategory,
}) {
  const [filter, setFilter] = useState(initialCategoryFilter || 'all');
  const [showArchived, setShowArchived] = useState(false);

  // Account Form Modal state
  const [editingAccount, setEditingAccount] = useState(null);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [savingForm, setSavingForm] = useState(false);

  const [formState, setFormState] = useState({
    name: '',
    institution: '',
    category: 'retirement_401k',
    subtype: 'Traditional 401(k)',
    current_balance: '',
    credit_limit: '',
    original_principal: '',
    interest_rate: '',
    minimum_payment: '',
    due_day: '',
    contribution_pct: '',
    employer_match_pct: '',
    notes: '',
  });

  // History Modal state
  const [historyAccount, setHistoryAccount] = useState(null);
  const [newSnapDate, setNewSnapDate] = useState(todayIsoDate());
  const [newSnapBalance, setNewSnapBalance] = useState('');
  const [newSnapNote, setNewSnapNote] = useState('');
  const [savingSnap, setSavingSnap] = useState(false);

  // Batch Check-In state
  const [batchDate, setBatchDate] = useState(todayIsoDate());
  const [batchValues, setBatchValues] = useState({});
  const [batchNote, setBatchNote] = useState('Periodic balance check-in');
  const [savingBatch, setSavingBatch] = useState(false);

  const mask = (str) => (privacyMode ? '••••••' : str);

  useEffect(() => {
    if (initialCategoryFilter) setFilter(initialCategoryFilter);
  }, [initialCategoryFilter]);

  useEffect(() => {
    if (newAccountCategory) {
      openCreateModal(newAccountCategory);
      setNewAccountCategory(null);
    }
  }, [newAccountCategory, setNewAccountCategory]);

  useEffect(() => {
    if (batchModalOpen) {
      const init = {};
      for (const acc of accounts.filter((a) => !a.is_archived)) {
        init[acc.id] = String(toNumber(acc.current_balance));
      }
      setBatchValues(init);
      setBatchDate(todayIsoDate());
    }
  }, [batchModalOpen, accounts]);

  const summary = useMemo(() => computeNetWorthSummary(accounts), [accounts]);

  const visibleAccounts = useMemo(() => {
    return (accounts || [])
      .filter((a) => (showArchived ? true : !a.is_archived))
      .filter((a) => {
        if (filter === 'all') return true;
        if (filter === 'investment') return a.category === 'investment' || a.category === 'other_asset';
        if (filter === 'loan') return a.category === 'loan' || a.category === 'other_liability';
        return a.category === filter;
      })
      .sort((a, b) => {
        if (a.is_liability !== b.is_liability) return a.is_liability ? 1 : -1;
        return Math.abs(toNumber(b.current_balance)) - Math.abs(toNumber(a.current_balance));
      });
  }, [accounts, filter, showArchived]);

  const openCreateModal = (defaultCat = 'retirement_401k') => {
    const cat = ACCOUNT_CATEGORIES[defaultCat] ? defaultCat : 'retirement_401k';
    setEditingAccount(null);
    setFormError('');
    setFormState({
      name: '',
      institution: '',
      category: cat,
      subtype: ACCOUNT_CATEGORIES[cat].subtypes[0] || '',
      current_balance: '',
      credit_limit: '',
      original_principal: '',
      interest_rate: '',
      minimum_payment: '',
      due_day: '',
      contribution_pct: '',
      employer_match_pct: '',
      notes: '',
    });
    setFormModalOpen(true);
  };

  const openEditModal = (acc) => {
    setEditingAccount(acc);
    setFormError('');
    setFormState({
      name: acc.name || '',
      institution: acc.institution || '',
      category: acc.category,
      subtype: acc.subtype || '',
      current_balance: String(toNumber(acc.current_balance)),
      credit_limit: acc.credit_limit !== null && acc.credit_limit !== undefined ? String(acc.credit_limit) : '',
      original_principal:
        acc.original_principal !== null && acc.original_principal !== undefined
          ? String(acc.original_principal)
          : '',
      interest_rate: acc.interest_rate !== null && acc.interest_rate !== undefined ? String(acc.interest_rate) : '',
      minimum_payment:
        acc.minimum_payment !== null && acc.minimum_payment !== undefined ? String(acc.minimum_payment) : '',
      due_day: acc.due_day ? String(acc.due_day) : '',
      contribution_pct: acc.metadata?.contribution_pct !== undefined ? String(acc.metadata.contribution_pct) : '',
      employer_match_pct:
        acc.metadata?.employer_match_pct !== undefined ? String(acc.metadata.employer_match_pct) : '',
      notes: acc.notes || '',
    });
    setFormModalOpen(true);
  };

  const handleCategoryChange = (newCat) => {
    const def = ACCOUNT_CATEGORIES[newCat];
    setFormState((prev) => ({
      ...prev,
      category: newCat,
      subtype: def?.subtypes?.[0] || '',
    }));
  };

  const handleSaveAccount = async (e) => {
    e.preventDefault();
    setFormError('');
    setSavingForm(true);

    try {
      const catDef = ACCOUNT_CATEGORIES[formState.category];
      if (!catDef) throw new Error('Invalid account category.');

      const balanceVal = Number(parseFloat(formState.current_balance || '0').toFixed(2));
      if (!Number.isFinite(balanceVal)) throw new Error('Enter a valid balance amount.');

      const metadata = {
        ...(editingAccount?.metadata || {}),
      };
      if (formState.category === 'retirement_401k') {
        metadata.contribution_pct = formState.contribution_pct !== '' ? Number(formState.contribution_pct) : null;
        metadata.employer_match_pct =
          formState.employer_match_pct !== '' ? Number(formState.employer_match_pct) : null;
      }

      const payload = {
        name: formState.name.trim(),
        institution: formState.institution.trim(),
        category: formState.category,
        subtype: formState.subtype.trim(),
        is_liability: catDef.isLiability,
        current_balance: balanceVal,
        credit_limit: formState.credit_limit !== '' ? Number(formState.credit_limit) : null,
        original_principal: formState.original_principal !== '' ? Number(formState.original_principal) : null,
        interest_rate: formState.interest_rate !== '' ? Number(formState.interest_rate) : null,
        minimum_payment: formState.minimum_payment !== '' ? Number(formState.minimum_payment) : null,
        due_day: formState.due_day !== '' ? Number(formState.due_day) : null,
        notes: formState.notes.trim(),
        metadata,
        last_updated_at: new Date().toISOString(),
      };

      let savedAccount = null;
      if (editingAccount) {
        const { data, error } = await supabase
          .from('accounts')
          .update(payload)
          .eq('id', editingAccount.id)
          .select('*')
          .single();
        if (error) throw error;
        savedAccount = data;
      } else {
        const { data, error } = await supabase
          .from('accounts')
          .insert(payload)
          .select('*')
          .single();
        if (error) throw error;
        savedAccount = data;
      }

      // Automatically record/update today's snapshot so Net Worth history stays synced
      if (savedAccount) {
        await supabase.from('balance_snapshots').upsert(
          {
            account_id: savedAccount.id,
            snapshot_date: todayIsoDate(),
            balance: balanceVal,
            note: editingAccount ? 'Balance updated' : 'Initial balance',
          },
          { onConflict: 'account_id,snapshot_date' }
        );
      }

      setFormModalOpen(false);
      await onDataChanged();
    } catch (err) {
      setFormError(err?.message || 'Failed to save account.');
    } finally {
      setSavingForm(false);
    }
  };

  const handleToggleArchive = async (acc) => {
    await supabase
      .from('accounts')
      .update({ is_archived: !acc.is_archived, last_updated_at: new Date().toISOString() })
      .eq('id', acc.id);
    await onDataChanged();
  };

  const handleDeleteAccount = async (acc) => {
    if (!window.confirm(`Permanently delete "${acc.name}" and all of its historical balance snapshots?`)) {
      return;
    }
    await supabase.from('accounts').delete().eq('id', acc.id);
    await onDataChanged();
  };

  const handleSaveBatch = async (e) => {
    e.preventDefault();
    setSavingBatch(true);
    try {
      const activeAccs = accounts.filter((a) => !a.is_archived);
      const snapshotUpserts = [];
      const isLatestDate = batchDate >= todayIsoDate();

      for (const acc of activeAccs) {
        const raw = batchValues[acc.id];
        if (raw === undefined || raw === '') continue;
        const parsed = Number(parseFloat(raw).toFixed(2));
        if (!Number.isFinite(parsed)) continue;

        snapshotUpserts.push({
          account_id: acc.id,
          snapshot_date: batchDate,
          balance: parsed,
          note: batchNote.trim() || 'Batch check-in',
        });

        if (isLatestDate && parsed !== toNumber(acc.current_balance)) {
          await supabase
            .from('accounts')
            .update({ current_balance: parsed, last_updated_at: new Date().toISOString() })
            .eq('id', acc.id);
        }
      }

      if (snapshotUpserts.length > 0) {
        const { error } = await supabase
          .from('balance_snapshots')
          .upsert(snapshotUpserts, { onConflict: 'account_id,snapshot_date' });
        if (error) throw error;
      }

      setBatchModalOpen(false);
      await onDataChanged();
    } finally {
      setSavingBatch(false);
    }
  };

  const accountSnapshots = useMemo(() => {
    if (!historyAccount) return [];
    return (snapshots || [])
      .filter((s) => s.account_id === historyAccount.id)
      .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
  }, [historyAccount, snapshots]);

  const handleAddAccountSnapshot = async (e) => {
    e.preventDefault();
    if (!historyAccount) return;
    const bal = Number(parseFloat(newSnapBalance).toFixed(2));
    if (!Number.isFinite(bal)) return;

    setSavingSnap(true);
    try {
      const { error } = await supabase.from('balance_snapshots').upsert(
        {
          account_id: historyAccount.id,
          snapshot_date: newSnapDate,
          balance: bal,
          note: newSnapNote.trim(),
        },
        { onConflict: 'account_id,snapshot_date' }
      );
      if (error) throw error;

      // If snapshot is for today or newer than existing snapshots, also sync current_balance
      const latestDate =
        accountSnapshots.length > 0
          ? accountSnapshots[accountSnapshots.length - 1].snapshot_date
          : '0000-00-00';
      if (newSnapDate >= latestDate && newSnapDate >= todayIsoDate()) {
        await supabase
          .from('accounts')
          .update({ current_balance: bal, last_updated_at: new Date().toISOString() })
          .eq('id', historyAccount.id);
      }

      setNewSnapBalance('');
      setNewSnapNote('');
      await onDataChanged();
    } finally {
      setSavingSnap(false);
    }
  };

  const handleDeleteSnapshot = async (snapId) => {
    await supabase.from('balance_snapshots').delete().eq('id', snapId);
    await onDataChanged();
  };

  return (
    <div className="space-y-6">
      {/* Top Action & Filter Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTER_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilter(t.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                filter === t.key
                  ? 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                  : 'border border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setBatchModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 hover:border-zinc-600 hover:bg-zinc-800"
          >
            <RefreshCw className="h-3.5 w-3.5 text-emerald-400" />
            Batch Update Balances
          </button>
          <button
            type="button"
            onClick={() => openCreateModal(filter === 'all' ? 'retirement_401k' : filter)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Account
          </button>
        </div>
      </div>

      {/* Category Contextual Metrics Banner */}
      {filter === 'credit_card' && summary.totalCardLimit > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-950/80 px-5 py-3.5 text-xs">
          <div>
            <span className="text-zinc-400">Total Revolving Balance: </span>
            <span className="font-mono font-semibold text-amber-300">{mask(formatCurrency(summary.creditCards))}</span>
            <span className="text-zinc-500"> / {mask(formatCurrency(summary.totalCardLimit, { decimals: 0 }))} total credit limit</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-zinc-400">Aggregate Utilization:</span>
            <span
              className={`rounded-full px-2.5 py-0.5 font-mono font-semibold ${
                summary.creditUtilizationPct <= 10
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : summary.creditUtilizationPct <= 30
                  ? 'bg-amber-500/15 text-amber-300'
                  : 'bg-rose-500/15 text-rose-300'
              }`}
            >
              {formatPercent(summary.creditUtilizationPct, 1)}
            </span>
          </div>
        </div>
      )}

      {filter === 'loan' && summary.loans > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-950/80 px-5 py-3.5 text-xs">
          <div>
            <span className="text-zinc-400">Remaining Loan Principal: </span>
            <span className="font-mono font-semibold text-rose-300">{mask(formatCurrency(summary.loans))}</span>
            {summary.totalLoanOriginal > 0 && (
              <span className="text-zinc-500">
                {' '}
                (Original: {mask(formatCurrency(summary.totalLoanOriginal, { decimals: 0 }))})
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-zinc-400">
              Monthly Debt Service:{' '}
              <strong className="font-mono text-zinc-100">
                {mask(formatCurrency(summary.monthlyMinDebtService))}
              </strong>
            </span>
            {summary.loanPaidOffPct !== null && (
              <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-mono font-semibold text-emerald-300">
                {formatPercent(summary.loanPaidOffPct, 1)} Paid Off
              </span>
            )}
          </div>
        </div>
      )}

      {/* Accounts Grid */}
      {visibleAccounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/50 py-14 text-center text-xs text-zinc-500">
          No accounts in this category yet.
          <div className="mt-3">
            <button
              type="button"
              onClick={() => openCreateModal(filter === 'all' ? 'retirement_401k' : filter)}
              className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 font-medium text-emerald-300 hover:bg-emerald-500/20"
            >
              + Add {FILTER_TABS.find((f) => f.key === filter)?.label || 'Account'}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {visibleAccounts.map((acc) => {
            const catDef = ACCOUNT_CATEGORIES[acc.category] || ACCOUNT_CATEGORIES.other_asset;
            const bal = toNumber(acc.current_balance);
            const limit = toNumber(acc.credit_limit);
            const origPrincipal = toNumber(acc.original_principal);
            const utilPct = acc.category === 'credit_card' && limit > 0 ? (bal / limit) * 100 : null;
            const paidPct =
              acc.category === 'loan' && origPrincipal > 0
                ? Math.max(0, Math.min(100, ((origPrincipal - bal) / origPrincipal) * 100))
                : null;

            const payoff =
              acc.category === 'loan' && bal > 0 && toNumber(acc.minimum_payment) > 0
                ? estimateLoanPayoff(bal, acc.interest_rate, acc.minimum_payment)
                : null;

            return (
              <div
                key={acc.id}
                className={`flex flex-col justify-between rounded-xl border bg-zinc-950/80 p-5 transition ${
                  acc.is_archived
                    ? 'border-zinc-900 opacity-60'
                    : 'border-zinc-800/90 hover:border-zinc-700'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: catDef.colorHex }}
                        />
                        <h3 className="text-sm font-semibold text-zinc-100">{acc.name}</h3>
                        {acc.is_archived && (
                          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                            Archived
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-500">
                        {[acc.institution, acc.subtype || catDef.label].filter(Boolean).join(' • ')}
                      </div>
                    </div>

                    <div className="text-right">
                      <div
                        className={`font-mono text-lg font-bold tabular-nums ${
                          acc.is_liability ? 'text-rose-300' : 'text-zinc-50'
                        }`}
                      >
                        {acc.is_liability && bal > 0 ? '-' : ''}
                        {mask(formatCurrency(bal))}
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        Updated {acc.last_updated_at ? formatShortDate(acc.last_updated_at.slice(0, 10)) : 'recently'}
                      </div>
                    </div>
                  </div>

                  {/* Category-specific insight pills & progress bars */}
                  <div className="mt-4 space-y-2.5">
                    {/* Credit Card Utilization */}
                    {utilPct !== null && (
                      <div>
                        <div className="mb-1 flex justify-between text-[11px] text-zinc-400 tabular-nums">
                          <span>
                            Credit Utilization ({mask(formatCurrency(bal, { decimals: 0 }))} /{' '}
                            {mask(formatCurrency(limit, { decimals: 0 }))})
                          </span>
                          <span
                            className={
                              utilPct <= 10
                                ? 'text-emerald-400'
                                : utilPct <= 30
                                ? 'text-amber-400'
                                : 'text-rose-400'
                            }
                          >
                            {formatPercent(utilPct, 1)}
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-900">
                          <div
                            className={`h-full rounded-full ${
                              utilPct <= 10
                                ? 'bg-emerald-500'
                                : utilPct <= 30
                                ? 'bg-amber-500'
                                : 'bg-rose-500'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(2, utilPct))}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Loan Payoff Progress & Projection */}
                    {paidPct !== null && (
                      <div>
                        <div className="mb-1 flex justify-between text-[11px] text-zinc-400 tabular-nums">
                          <span>
                            Principal Paid Off (Orig. {mask(formatCurrency(origPrincipal, { decimals: 0 }))})
                          </span>
                          <span className="text-emerald-400">{formatPercent(paidPct, 1)}</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-900">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: `${Math.max(2, paidPct)}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {payoff && (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-3 py-2 text-[11px] text-zinc-300">
                        <span>Est. Payoff: <strong>{payoff.payoffDateLabel}</strong></span>
                        {payoff.totalInterest !== null && (
                          <span className="font-mono text-zinc-400">
                            Rem. interest: {mask(formatCurrency(payoff.totalInterest, { decimals: 0 }))}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Metadata badges */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[11px]">
                      {acc.interest_rate !== null && acc.interest_rate !== undefined && toNumber(acc.interest_rate) > 0 && (
                        <span className="rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-zinc-300">
                          {formatPercent(acc.interest_rate, 2)} {acc.is_liability ? 'APR' : 'APY'}
                        </span>
                      )}
                      {acc.minimum_payment !== null && toNumber(acc.minimum_payment) > 0 && (
                        <span className="rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-zinc-300">
                          {mask(formatCurrency(acc.minimum_payment, { decimals: 0 }))}/mo pmt
                        </span>
                      )}
                      {acc.due_day && (
                        <span className="rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-zinc-400">
                          Due {ordinalDay(acc.due_day)}
                        </span>
                      )}
                      {acc.metadata?.contribution_pct > 0 && (
                        <span className="rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                          {acc.metadata.contribution_pct}% contrib
                          {acc.metadata?.employer_match_pct > 0
                            ? ` + ${acc.metadata.employer_match_pct}% match`
                            : ''}
                        </span>
                      )}
                    </div>

                    {acc.notes && <p className="text-xs text-zinc-500">{acc.notes}</p>}
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="mt-4 flex items-center justify-between border-t border-zinc-900 pt-3 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setHistoryAccount(acc);
                      setNewSnapDate(todayIsoDate());
                      setNewSnapBalance(String(toNumber(acc.current_balance)));
                    }}
                    className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-emerald-300"
                  >
                    <History className="h-3.5 w-3.5" />
                    Balance History
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditModal(acc)}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleArchive(acc)}
                      title={acc.is_archived ? 'Restore account' : 'Archive account'}
                      className="rounded p-1 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
                    >
                      {acc.is_archived ? <RotateCcw className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteAccount(acc)}
                      title="Delete account"
                      className="rounded p-1 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Archived Toggle */}
      {accounts.some((a) => a.is_archived) && (
        <div className="text-right">
          <button
            type="button"
            onClick={() => setShowArchived(!showArchived)}
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            {showArchived ? 'Hide archived accounts' : 'Show archived / paid-off accounts'}
          </button>
        </div>
      )}

      {/* MODAL 1: Add / Edit Account */}
      {formModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 className="text-base font-semibold text-zinc-100">
                {editingAccount ? `Edit ${editingAccount.name}` : 'Add Financial Account'}
              </h2>
              <button
                type="button"
                onClick={() => setFormModalOpen(false)}
                className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {formError && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveAccount} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-zinc-300">
                  Account Category
                  <select
                    value={formState.category}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                  >
                    {Object.values(ACCOUNT_CATEGORIES).map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label} ({c.isLiability ? 'Debt' : 'Asset'})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-zinc-300">
                  Account Subtype
                  <select
                    value={formState.subtype}
                    onChange={(e) => setFormState({ ...formState, subtype: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                  >
                    {(ACCOUNT_CATEGORIES[formState.category]?.subtypes || []).map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-zinc-300">
                  Account Nickname *
                  <input
                    type="text"
                    required
                    placeholder="e.g., Fidelity 401(k), Chase Checking"
                    value={formState.name}
                    onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                  />
                </label>

                <label className="block text-zinc-300">
                  Institution / Issuer
                  <input
                    type="text"
                    placeholder="e.g., Fidelity, Ally, Chase, Amex"
                    value={formState.institution}
                    onChange={(e) => setFormState({ ...formState, institution: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-zinc-300">
                  {ACCOUNT_CATEGORIES[formState.category]?.isLiability
                    ? 'Current Balance Owed ($) *'
                    : 'Current Balance ($) *'}
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={formState.current_balance}
                    onChange={(e) => setFormState({ ...formState, current_balance: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                  />
                </label>

                <label className="block text-zinc-300">
                  {ACCOUNT_CATEGORIES[formState.category]?.isLiability
                    ? 'Interest Rate (APR %)'
                    : 'Yield / Expected Return (%)'}
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    placeholder="e.g., 4.25"
                    value={formState.interest_rate}
                    onChange={(e) => setFormState({ ...formState, interest_rate: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                  />
                </label>
              </div>

              {/* Conditional 401(k) fields */}
              {formState.category === 'retirement_401k' && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block text-zinc-300">
                    Your Contribution (%)
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      placeholder="e.g., 12"
                      value={formState.contribution_pct}
                      onChange={(e) => setFormState({ ...formState, contribution_pct: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                    />
                  </label>
                  <label className="block text-zinc-300">
                    Employer Match (%)
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      placeholder="e.g., 5"
                      value={formState.employer_match_pct}
                      onChange={(e) => setFormState({ ...formState, employer_match_pct: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                    />
                  </label>
                </div>
              )}

              {/* Conditional Credit Card fields */}
              {formState.category === 'credit_card' && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="block text-zinc-300">
                    Credit Limit ($)
                    <input
                      type="number"
                      step="1"
                      min="0"
                      placeholder="15000"
                      value={formState.credit_limit}
                      onChange={(e) => setFormState({ ...formState, credit_limit: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                    />
                  </label>
                  <label className="block text-zinc-300">
                    Min Payment ($)
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="35"
                      value={formState.minimum_payment}
                      onChange={(e) => setFormState({ ...formState, minimum_payment: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                    />
                  </label>
                  <label className="block text-zinc-300">
                    Due Day (1–31)
                    <input
                      type="number"
                      min="1"
                      max="31"
                      placeholder="18"
                      value={formState.due_day}
                      onChange={(e) => setFormState({ ...formState, due_day: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                    />
                  </label>
                </div>
              )}

              {/* Conditional Active Loan fields */}
              {(formState.category === 'loan' || formState.category === 'other_liability') && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="block text-zinc-300">
                    Original Principal ($)
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="28500"
                      value={formState.original_principal}
                      onChange={(e) => setFormState({ ...formState, original_principal: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                    />
                  </label>
                  <label className="block text-zinc-300">
                    Monthly Payment ($)
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="520"
                      value={formState.minimum_payment}
                      onChange={(e) => setFormState({ ...formState, minimum_payment: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                    />
                  </label>
                  <label className="block text-zinc-300">
                    Due Day (1–31)
                    <input
                      type="number"
                      min="1"
                      max="31"
                      placeholder="12"
                      value={formState.due_day}
                      onChange={(e) => setFormState({ ...formState, due_day: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                    />
                  </label>
                </div>
              )}

              <label className="block text-zinc-300">
                Notes (optional)
                <input
                  type="text"
                  placeholder="Allocation, autopay details, vesting notes…"
                  value={formState.notes}
                  onChange={(e) => setFormState({ ...formState, notes: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                />
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setFormModalOpen(false)}
                  className="rounded-lg border border-zinc-800 px-4 py-2 font-medium text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingForm}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" />
                  {savingForm ? 'Saving…' : editingAccount ? 'Save Changes' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Batch Update All Balances (Fast Manual Check-In) */}
      {batchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h2 className="text-base font-semibold text-zinc-100">Batch Balance Check-In</h2>
                <p className="text-xs text-zinc-500">
                  Update all your 401(k), bank, credit card, and loan balances in one pass and record a net worth snapshot.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBatchModalOpen(false)}
                className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBatch} className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-xs text-zinc-300">
                  Snapshot Date
                  <input
                    type="date"
                    required
                    value={batchDate}
                    onChange={(e) => setBatchDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                  />
                </label>
                <label className="block text-xs text-zinc-300">
                  Check-In Note
                  <input
                    type="text"
                    value={batchNote}
                    onChange={(e) => setBatchNote(e.target.value)}
                    placeholder="e.g., Month-end balances"
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                  />
                </label>
              </div>

              <div className="divide-y divide-zinc-900 rounded-xl border border-zinc-800 bg-zinc-900/30 px-4">
                {accounts
                  .filter((a) => !a.is_archived)
                  .map((acc) => {
                    const prev = toNumber(acc.current_balance);
                    const next = parseFloat(batchValues[acc.id] ?? prev);
                    const diff = Number.isFinite(next) ? next - prev : 0;

                    return (
                      <div key={acc.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-zinc-200">{acc.name}</div>
                          <div className="text-[11px] text-zinc-500">
                            {ACCOUNT_CATEGORIES[acc.category]?.shortLabel} • Current: {formatCurrency(prev)}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {Math.abs(diff) >= 0.01 && (
                            <span
                              className={`font-mono text-[11px] tabular-nums ${
                                (acc.is_liability ? -diff : diff) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {formatCurrency(diff, { showSign: true })}
                            </span>
                          )}
                          <input
                            type="number"
                            step="0.01"
                            value={batchValues[acc.id] ?? ''}
                            onChange={(e) =>
                              setBatchValues((prevMap) => ({ ...prevMap, [acc.id]: e.target.value }))
                            }
                            className="w-36 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-right font-mono text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>

              <div className="flex justify-end gap-2 pt-2 text-xs">
                <button
                  type="button"
                  onClick={() => setBatchModalOpen(false)}
                  className="rounded-lg border border-zinc-800 px-4 py-2 text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingBatch}
                  className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
                >
                  {savingBatch ? 'Recording Snapshots…' : 'Save Balances & Snapshot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Per-Account Snapshot History & Backfill */}
      {historyAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h2 className="text-base font-semibold text-zinc-100">{historyAccount.name} — History</h2>
                <p className="text-xs text-zinc-500">
                  Add past statement balances to backfill your Net Worth chart or edit existing snapshots.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryAccount(null)}
                className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {accountSnapshots.length >= 2 && (
              <div className="mb-5 h-40 w-full rounded-xl border border-zinc-900 bg-zinc-900/30 p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={accountSnapshots.map((s) => ({
                      label: formatShortDate(s.snapshot_date),
                      balance: toNumber(s.balance),
                    }))}
                  >
                    <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis hide domain={['auto', 'auto']} />
                    <Tooltip
                      formatter={(val) => [formatCurrency(val), 'Balance']}
                      contentStyle={{
                        backgroundColor: '#09090b',
                        borderColor: '#27272a',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="balance"
                      stroke={historyAccount.is_liability ? '#f43f5e' : '#10b981'}
                      fillOpacity={0.15}
                      fill={historyAccount.is_liability ? '#f43f5e' : '#10b981'}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Add / Upsert Historical Snapshot */}
            <form onSubmit={handleAddAccountSnapshot} className="mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-4">
              <input
                type="date"
                required
                value={newSnapDate}
                onChange={(e) => setNewSnapDate(e.target.value)}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs text-zinc-100"
              />
              <input
                type="number"
                step="0.01"
                required
                placeholder="Balance ($)"
                value={newSnapBalance}
                onChange={(e) => setNewSnapBalance(e.target.value)}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 font-mono text-xs text-zinc-100"
              />
              <input
                type="text"
                placeholder="Note (optional)"
                value={newSnapNote}
                onChange={(e) => setNewSnapNote(e.target.value)}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs text-zinc-100"
              />
              <button
                type="submit"
                disabled={savingSnap}
                className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                {savingSnap ? 'Saving…' : '+ Record Date'}
              </button>
            </form>

            {/* Snapshot List */}
            <div className="divide-y divide-zinc-900 rounded-xl border border-zinc-800/80 px-4">
              {[...accountSnapshots].reverse().map((snap) => (
                <div key={snap.id} className="flex items-center justify-between py-2.5 text-xs">
                  <div>
                    <span className="font-mono text-zinc-300">{snap.snapshot_date}</span>
                    {snap.note && <span className="ml-2 text-zinc-500">• {snap.note}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-medium text-zinc-100 tabular-nums">
                      {mask(formatCurrency(snap.balance))}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteSnapshot(snap.id)}
                      className="text-zinc-600 hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {accountSnapshots.length === 0 && (
                <div className="py-6 text-center text-xs text-zinc-500">No historical snapshots yet.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
