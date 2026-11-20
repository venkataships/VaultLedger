import { useEffect, useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  CalendarClock,
  CheckCircle2,
  SlidersHorizontal,
  Trash2,
  Download,
  Search,
  X,
  Pencil,
} from 'lucide-react';
import {
  CATEGORY_COLORS,
  currentMonthKey,
  EXPENSE_CATEGORIES,
  formatCurrency,
  formatMonthLabel,
  formatPercent,
  getOwnerDisplayName,
  getSignedExpenseAmount,
  isCreditEntry,
  ordinalDay,
  OWNER_PROFILES,
  shiftMonthKey,
  summarizeExpensesList,
  todayIsoDate,
  toNumber,
} from '../lib/finance';

export default function ExpensesTab({
  supabase,
  accounts,
  expenses,
  recurringBills,
  budgets,
  householdScope,
  householdNames,
  privacyMode,
  onDataChanged,
}) {
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey());
  const [searchQuery, setSearchQuery] = useState('');
  const [catFilter, setCatFilter] = useState('all');

  const defaultOwner = ['primary', 'spouse', 'joint'].includes(householdScope)
    ? householdScope
    : 'primary';

  // Quick-add expense / credit form
  const [entryType, setEntryType] = useState('expense'); // 'expense' | 'credit'
  const [expDate, setExpDate] = useState(todayIsoDate());
  const [expOwner, setExpOwner] = useState(defaultOwner);
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState('Groceries');
  const [amount, setAmount] = useState('');
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [isEssential, setIsEssential] = useState(true);
  const [addingExpense, setAddingExpense] = useState(false);

  // Edit expense modal
  const [editingExpense, setEditingExpense] = useState(null);

  // Recurring Bills & Credits modal
  const [billModalOpen, setBillModalOpen] = useState(false);
  const [billEntryType, setBillEntryType] = useState('expense'); // 'expense' | 'credit'
  const [billOwner, setBillOwner] = useState(defaultOwner);
  const [billName, setBillName] = useState('');
  const [billCategory, setBillCategory] = useState('Housing');
  const [billAmount, setBillAmount] = useState('');
  const [billDueDay, setBillDueDay] = useState('1');
  const [billCadence, setBillCadence] = useState('monthly');
  const [billAccount, setBillAccount] = useState('');
  const [billEssential, setBillEssential] = useState(true);
  const [savingBill, setSavingBill] = useState(false);
  const [postingBills, setPostingBills] = useState(false);

  useEffect(() => {
    const nextOwner = ['primary', 'spouse', 'joint'].includes(householdScope)
      ? householdScope
      : 'primary';
    setExpOwner(nextOwner);
    setBillOwner(nextOwner);
  }, [householdScope]);

  // Budget & Income modal
  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [takeHomeInput, setTakeHomeInput] = useState('');
  const [savingBudgets, setSavingBudgets] = useState(false);

  const mask = (str) => (privacyMode ? '••••••' : str);

  const accountMap = useMemo(() => {
    const m = new Map();
    for (const a of accounts || []) m.set(a.id, a);
    return m;
  }, [accounts]);

  const monthExpenses = useMemo(() => {
    return (expenses || [])
      .filter((e) => (e.expense_date || '').startsWith(selectedMonth))
      .sort((a, b) => b.expense_date.localeCompare(a.expense_date) || b.id - a.id);
  }, [expenses, selectedMonth]);

  const filteredMonthExpenses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return monthExpenses.filter((e) => {
      if (catFilter !== 'all' && e.category !== catFilter) return false;
      if (q && !`${e.merchant} ${e.category} ${e.notes || ''}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [monthExpenses, catFilter, searchQuery]);

  const metrics = useMemo(() => {
    const expSummary = summarizeExpensesList(monthExpenses);
    let recurringPosted = 0;

    for (const e of monthExpenses) {
      if (e.recurring_bill_id) recurringPosted += getSignedExpenseAmount(e);
    }

    const budgetRow = (budgets || []).find((b) => b.category === '_total_budget');
    const takeHomeRow = (budgets || []).find((b) => b.category === '_monthly_take_home');
    const monthlyBudget = budgetRow ? toNumber(budgetRow.monthly_limit) : 0;
    const monthlyTakeHome = takeHomeRow ? toNumber(takeHomeRow.monthly_limit) : 0;

    // Unposted active monthly recurring bills/credits for selectedMonth
    const postedBillIds = new Set(
      monthExpenses.map((e) => e.recurring_bill_id).filter(Boolean)
    );
    const unpostedMonthlyBills = (recurringBills || []).filter(
      (b) => b.is_active && b.cadence === 'monthly' && !postedBillIds.has(b.id)
    );

    let activeBillsMonthly = 0;
    let activeCreditsMonthly = 0;
    for (const b of recurringBills || []) {
      if (!b.is_active) continue;
      const amt = Math.abs(toNumber(b.amount));
      const mAmt = b.cadence === 'annual' ? amt / 12 : b.cadence === 'quarterly' ? amt / 3 : amt;
      if (isCreditEntry(b)) activeCreditsMonthly += mAmt;
      else activeBillsMonthly += mAmt;
    }

    return {
      total: expSummary.netTotal,
      grossTotal: expSummary.grossTotal,
      creditsTotal: expSummary.creditsTotal,
      essential: expSummary.netNeeds,
      wants: expSummary.netWants,
      expenseCount: expSummary.expenseCount,
      creditCount: expSummary.creditCount,
      recurringPosted,
      categoriesSorted: expSummary.categoriesSorted,
      monthlyBudget,
      monthlyTakeHome,
      unpostedMonthlyBills,
      activeBillsMonthly,
      activeCreditsMonthly,
      netRecurringMonthly: activeBillsMonthly - activeCreditsMonthly,
    };
  }, [monthExpenses, budgets, recurringBills]);

  // 6-Month Spending Trend Chart Data (net of credits)
  const sixMonthSeries = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const mk = shiftMonthKey(selectedMonth, -i);
      const rows = (expenses || []).filter((e) => (e.expense_date || '').startsWith(mk));
      const s = summarizeExpensesList(rows);
      const [y, m] = mk.split('-');
      const shortLabel = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', {
        month: 'short',
        year: '2-digit',
      });
      months.push({
        monthKey: mk,
        label: shortLabel,
        Needs: Number(s.netNeeds.toFixed(2)),
        Wants: Number(s.netWants.toFixed(2)),
        Total: Number(Math.max(0, s.netTotal).toFixed(2)),
      });
    }
    return months;
  }, [expenses, selectedMonth]);

  const handleQuickAddExpense = async (e) => {
    e.preventDefault();
    const amt = Number(parseFloat(amount).toFixed(2));
    if (!merchant.trim() || !Number.isFinite(amt) || amt < 0) return;

    setAddingExpense(true);
    try {
      const { error } = await supabase.from('expenses').insert({
        owner_profile: expOwner || 'primary',
        entry_type: entryType === 'credit' ? 'credit' : 'expense',
        expense_date: expDate,
        merchant: merchant.trim(),
        category,
        amount: amt,
        payment_account_id: paymentAccountId ? Number(paymentAccountId) : null,
        is_essential: isEssential,
      });
      if (error) throw error;

      setMerchant('');
      setAmount('');
      setEntryType('expense');
      // If user added an expense in another month, switch to that month so they see it immediately
      if (expDate.slice(0, 7) !== selectedMonth) {
        setSelectedMonth(expDate.slice(0, 7));
      }
      await onDataChanged();
    } finally {
      setAddingExpense(false);
    }
  };

  const handleSaveEditedExpense = async (e) => {
    e.preventDefault();
    if (!editingExpense) return;
    const amt = Number(parseFloat(editingExpense.amount).toFixed(2));
    if (!Number.isFinite(amt)) return;

    await supabase
      .from('expenses')
      .update({
        owner_profile: editingExpense.owner_profile || 'primary',
        entry_type: editingExpense.entry_type === 'credit' ? 'credit' : 'expense',
        expense_date: editingExpense.expense_date,
        merchant: editingExpense.merchant.trim(),
        category: editingExpense.category,
        amount: amt,
        payment_account_id: editingExpense.payment_account_id
          ? Number(editingExpense.payment_account_id)
          : null,
        is_essential: Boolean(editingExpense.is_essential),
        notes: (editingExpense.notes || '').trim(),
      })
      .eq('id', editingExpense.id);

    setEditingExpense(null);
    await onDataChanged();
  };

  const handleDeleteExpense = async (id) => {
    await supabase.from('expenses').delete().eq('id', id);
    await onDataChanged();
  };

  const handlePostDueBills = async () => {
    if (metrics.unpostedMonthlyBills.length === 0) return;
    setPostingBills(true);
    try {
      const [y, m] = selectedMonth.split('-').map(Number);
      const maxDayInMonth = new Date(y, m, 0).getDate();

      const rows = metrics.unpostedMonthlyBills.map((b) => {
        const day = Math.min(b.due_day || 1, maxDayInMonth);
        const credit = isCreditEntry(b);
        return {
          owner_profile: b.owner_profile || 'primary',
          entry_type: credit ? 'credit' : 'expense',
          expense_date: `${selectedMonth}-${String(day).padStart(2, '0')}`,
          merchant: b.name,
          category: b.category,
          amount: toNumber(b.amount),
          payment_account_id: b.payment_account_id || null,
          recurring_bill_id: b.id,
          is_essential: b.is_essential,
          notes: credit ? 'Recurring credit posted' : 'Recurring bill posted',
        };
      });

      const { error } = await supabase.from('expenses').insert(rows);
      if (error) throw error;
      await onDataChanged();
    } finally {
      setPostingBills(false);
    }
  };

  const handleAddRecurringBill = async (e) => {
    e.preventDefault();
    const amt = Number(parseFloat(billAmount).toFixed(2));
    if (!billName.trim() || !Number.isFinite(amt)) return;

    setSavingBill(true);
    try {
      const { error } = await supabase.from('recurring_bills').insert({
        owner_profile: billOwner || 'primary',
        entry_type: billEntryType === 'credit' ? 'credit' : 'expense',
        name: billName.trim(),
        category: billCategory,
        amount: amt,
        due_day: billDueDay ? Number(billDueDay) : 1,
        cadence: billCadence,
        payment_account_id: billAccount ? Number(billAccount) : null,
        is_essential: billEssential,
        autopay: true,
        is_active: true,
      });
      if (error) throw error;
      setBillName('');
      setBillAmount('');
      setBillEntryType('expense');
      await onDataChanged();
    } finally {
      setSavingBill(false);
    }
  };

  const handleDeleteBill = async (id) => {
    await supabase.from('recurring_bills').delete().eq('id', id);
    await onDataChanged();
  };

  const openBudgetModal = () => {
    setBudgetInput(metrics.monthlyBudget > 0 ? String(metrics.monthlyBudget) : '');
    setTakeHomeInput(metrics.monthlyTakeHome > 0 ? String(metrics.monthlyTakeHome) : '');
    setBudgetModalOpen(true);
  };

  const handleSaveBudgets = async (e) => {
    e.preventDefault();
    setSavingBudgets(true);
    try {
      const upserts = [];
      if (budgetInput !== '') {
        upserts.push({
          category: '_total_budget',
          monthly_limit: Math.max(0, Number(parseFloat(budgetInput).toFixed(2)) || 0),
          updated_at: new Date().toISOString(),
        });
      }
      if (takeHomeInput !== '') {
        upserts.push({
          category: '_monthly_take_home',
          monthly_limit: Math.max(0, Number(parseFloat(takeHomeInput).toFixed(2)) || 0),
          updated_at: new Date().toISOString(),
        });
      }
      if (upserts.length > 0) {
        const { error } = await supabase
          .from('monthly_budgets')
          .upsert(upserts, { onConflict: 'user_id,category' });
        if (error) throw error;
      }
      setBudgetModalOpen(false);
      await onDataChanged();
    } finally {
      setSavingBudgets(false);
    }
  };

  const handleExportCsv = () => {
    const header = [
      'Date',
      'Entry Type',
      'Merchant',
      'Category',
      'Amount',
      'Class',
      'Paid From / Account',
      'Notes',
    ];
    const lines = [header.join(',')];
    for (const e of monthExpenses) {
      const accName = e.payment_account_id ? accountMap.get(e.payment_account_id)?.name || '' : '';
      const row = [
        e.expense_date,
        isCreditEntry(e) ? 'Money Back' : 'Expense',
        `"${(e.merchant || '').replace(/"/g, '""')}"`,
        `"${e.category}"`,
        getSignedExpenseAmount(e).toFixed(2),
        e.is_essential ? 'Need' : 'Want',
        `"${accName.replace(/"/g, '""')}"`,
        `"${(e.notes || '').replace(/"/g, '""')}"`,
      ];
      lines.push(row.join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses-${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const budgetPct =
    metrics.monthlyBudget > 0 ? (Math.max(0, metrics.total) / metrics.monthlyBudget) * 100 : null;

  return (
    <div className="space-y-6">
      {/* Month Navigator & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const prev = shiftMonthKey(selectedMonth, -1);
              setSelectedMonth(prev);
              setExpDate(`${prev}-01`);
            }}
            className="rounded-lg border border-zinc-800 bg-zinc-950 p-2 text-zinc-400 hover:border-zinc-700 hover:text-zinc-100"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-[155px] text-center text-sm font-semibold text-zinc-100">
            {formatMonthLabel(selectedMonth)}
          </div>
          <button
            type="button"
            onClick={() => {
              const next = shiftMonthKey(selectedMonth, 1);
              setSelectedMonth(next);
              setExpDate(next === currentMonthKey() ? todayIsoDate() : `${next}-01`);
            }}
            className="rounded-lg border border-zinc-800 bg-zinc-950 p-2 text-zinc-400 hover:border-zinc-700 hover:text-zinc-100"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {selectedMonth !== currentMonthKey() && (
            <button
              type="button"
              onClick={() => {
                setSelectedMonth(currentMonthKey());
                setExpDate(todayIsoDate());
              }}
              className="ml-1 rounded-md border border-zinc-800 px-2.5 py-1 text-[11px] text-zinc-400 hover:text-zinc-200"
            >
              Today
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {metrics.unpostedMonthlyBills.length > 0 && (
            <button
              type="button"
              disabled={postingBills}
              onClick={handlePostDueBills}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              {postingBills
                ? 'Posting…'
                : `Post ${metrics.unpostedMonthlyBills.length} Recurring Bill${
                    metrics.unpostedMonthlyBills.length > 1 ? 's' : ''
                  }`}
            </button>
          )}
          <button
            type="button"
            onClick={() => setBillModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-medium text-zinc-300 hover:border-zinc-700"
          >
            <CalendarClock className="h-3.5 w-3.5 text-sky-400" />
            Recurring ({(recurringBills || []).length})
          </button>
          <button
            type="button"
            onClick={openBudgetModal}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-medium text-zinc-300 hover:border-zinc-700"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-emerald-400" />
            Budget & Income
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
        </div>
      </div>

      {/* Monthly KPI Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/80 p-4">
          <div className="text-xs text-zinc-400">
            {metrics.creditsTotal > 0 ? 'Net Monthly Spend' : 'Total Monthly Spend'}
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-zinc-50 tabular-nums">
            {mask(formatCurrency(metrics.total))}
          </div>
          <div className="mt-1.5 text-[11px] text-zinc-500 tabular-nums">
            {metrics.creditsTotal > 0 ? (
              <>
                Gross {mask(formatCurrency(metrics.grossTotal, { decimals: 0 }))}{' '}
                <span className="text-emerald-400">
                  − {mask(formatCurrency(metrics.creditsTotal, { decimals: 0 }))} back
                </span>{' '}
                • {monthExpenses.length} items
              </>
            ) : (
              `${monthExpenses.length} logged expense${monthExpenses.length === 1 ? '' : 's'}`
            )}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/80 p-4">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Budget Target</span>
            <button
              type="button"
              onClick={openBudgetModal}
              className="text-[11px] text-emerald-400 hover:underline"
            >
              Edit
            </button>
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-zinc-100 tabular-nums">
            {metrics.monthlyBudget > 0 ? mask(formatCurrency(metrics.monthlyBudget)) : 'Not set'}
          </div>
          {budgetPct !== null && (
            <div className="mt-2">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-900">
                <div
                  className={`h-full rounded-full ${
                    budgetPct <= 85
                      ? 'bg-emerald-500'
                      : budgetPct <= 100
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(2, budgetPct))}%` }}
                />
              </div>
              <div className="mt-1 text-[11px] text-zinc-400 tabular-nums">
                {formatPercent(budgetPct, 0)} used •{' '}
                {mask(formatCurrency(metrics.monthlyBudget - metrics.total, { showSign: true }))} vs cap
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/80 p-4">
          <div className="text-xs text-zinc-400">Needs vs. Wants</div>
          <div className="mt-1.5 font-mono text-lg font-semibold text-zinc-100 tabular-nums">
            {mask(formatCurrency(metrics.essential))} <span className="text-xs font-normal text-zinc-500">needs</span>
          </div>
          <div className="mt-1 text-xs text-zinc-400 tabular-nums">
            Wants: <span className="font-mono text-amber-300">{mask(formatCurrency(metrics.wants))}</span> (
            {metrics.essential + metrics.wants > 0
              ? formatPercent((metrics.wants / (metrics.essential + metrics.wants)) * 100, 0)
              : '0%'}
            )
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/80 p-4">
          <div className="text-xs text-zinc-400">Implied Monthly Savings</div>
          {metrics.monthlyTakeHome > 0 ? (
            <>
              <div
                className={`mt-1.5 font-mono text-2xl font-bold tabular-nums ${
                  metrics.monthlyTakeHome - metrics.total >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {mask(formatCurrency(metrics.monthlyTakeHome - metrics.total, { showSign: true }))}
              </div>
              <div className="mt-1 text-[11px] text-zinc-400 tabular-nums">
                {formatPercent(
                  ((metrics.monthlyTakeHome - metrics.total) / metrics.monthlyTakeHome) * 100,
                  1
                )}{' '}
                savings rate on {mask(formatCurrency(metrics.monthlyTakeHome, { decimals: 0 }))} net pay
              </div>
            </>
          ) : (
            <div className="mt-2 text-xs text-zinc-500">
              <button
                type="button"
                onClick={openBudgetModal}
                className="text-emerald-400 hover:underline"
              >
                Set monthly take-home pay →
              </button>{' '}
              to track net savings rate.
            </div>
          )}
        </div>
      </div>

      {/* Charts Split: 6-Month Trend + Category Breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/80 p-5 lg:col-span-3">
          <h3 className="mb-1 text-sm font-semibold text-zinc-100">6-Month Expense Trend</h3>
          <p className="mb-4 text-xs text-zinc-500">Net essential needs vs. discretionary wants by month</p>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sixMonthSeries} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#18181b" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={(v) => (privacyMode ? '•••' : formatCurrency(v, { compact: true, decimals: 0 }))}
                  tick={{ fill: '#71717a', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={58}
                />
                <Tooltip
                  formatter={(v, name) => [privacyMode ? '••••••' : formatCurrency(v), name]}
                  contentStyle={{
                    backgroundColor: '#09090b',
                    borderColor: '#27272a',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="Needs" stackId="a" fill="#10b981" radius={[0, 0, 4, 4]} />
                <Bar dataKey="Wants" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/80 p-5 lg:col-span-2">
          <h3 className="mb-1 text-sm font-semibold text-zinc-100">Category Split</h3>
          <p className="mb-4 text-xs text-zinc-500">Click any category to filter the ledger below</p>

          {metrics.categoriesSorted.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-500">No spending in this month yet.</div>
          ) : (
            <div className="max-h-56 space-y-3 overflow-y-auto pr-1">
              {metrics.categoriesSorted.map(({ category: cat, net, credits }) => {
                const pct = net > 0 && metrics.total > 0 ? (net / metrics.total) * 100 : 0;
                const active = catFilter === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCatFilter(active ? 'all' : cat)}
                    className={`block w-full rounded-lg p-1.5 text-left transition ${
                      active ? 'bg-zinc-900 ring-1 ring-emerald-500/40' : 'hover:bg-zinc-900/50'
                    }`}
                  >
                    <div className="mb-1 flex justify-between gap-2 text-xs">
                      <span className="font-medium text-zinc-200">
                        {cat}
                        {credits > 0 && (
                          <span className="ml-1.5 text-[10px] font-normal text-emerald-400">
                            (−{mask(formatCurrency(credits, { decimals: 0 }))} back)
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-zinc-300 tabular-nums">
                        {net < 0 ? (
                          <span className="text-emerald-300">
                            +{mask(formatCurrency(Math.abs(net)))} net back
                          </span>
                        ) : (
                          `${mask(formatCurrency(net))} (${formatPercent(pct, 0)})`
                        )}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-900">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${net > 0 ? Math.min(100, Math.max(3, pct)) : 0}%`,
                          backgroundColor: CATEGORY_COLORS[cat] || '#10b981',
                        }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Fast Inline Add Expense / Money Back Bar */}
      <form
        onSubmit={handleQuickAddExpense}
        className={`rounded-xl border p-4 transition ${
          entryType === 'credit'
            ? 'border-emerald-500/35 bg-emerald-500/[0.03]'
            : 'border-zinc-800/90 bg-zinc-950/90'
        }`}
      >
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-zinc-300">
          <div className="flex flex-wrap items-center gap-2.5">
            <span>{entryType === 'credit' ? 'Log Money Back / Reimbursement' : 'Quick Log Expense'}</span>
            <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-0.5 text-[11px] font-medium">
              <button
                type="button"
                onClick={() => setEntryType('expense')}
                className={`rounded-md px-2 py-0.5 transition ${
                  entryType === 'expense'
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Expense
              </button>
              <button
                type="button"
                onClick={() => setEntryType('credit')}
                className={`rounded-md px-2 py-0.5 transition ${
                  entryType === 'credit'
                    ? 'bg-emerald-500/20 text-emerald-200'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Money Back / Credit
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-0.5 text-[11px] font-medium">
            {[
              { key: 'primary', label: householdNames?.primary_name || 'Me' },
              { key: 'spouse', label: householdNames?.spouse_name || 'Wife' },
              { key: 'joint', label: 'Joint' },
            ].map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => setExpOwner(o.key)}
                className={`rounded-md px-2 py-0.5 transition ${
                  expOwner === o.key
                    ? o.key === 'spouse'
                      ? 'bg-fuchsia-500/20 text-fuchsia-200'
                      : o.key === 'joint'
                      ? 'bg-sky-500/20 text-sky-200'
                      : 'bg-emerald-500/20 text-emerald-200'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-12">
          <input
            type="date"
            required
            value={expDate}
            onChange={(e) => setExpDate(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs text-zinc-100 lg:col-span-2"
          />
          <input
            type="text"
            required
            placeholder={
              entryType === 'credit'
                ? 'Source (e.g., Friend stay / rent share, utility split, refund)'
                : "Merchant or description (e.g., Trader Joe's, Electric)"
            }
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 lg:col-span-3"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs text-zinc-100 lg:col-span-2"
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.01"
            min="0"
            required
            placeholder={entryType === 'credit' ? 'Money back ($)' : 'Amount ($)'}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 lg:col-span-2"
          />
          <select
            value={paymentAccountId}
            onChange={(e) => setPaymentAccountId(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs text-zinc-300 lg:col-span-2"
          >
            <option value="">
              {entryType === 'credit' ? 'Received into (optional)' : 'Paid from (optional)'}
            </option>
            {(accounts || [])
              .filter((a) => !a.is_archived && (a.category === 'credit_card' || a.category === 'bank'))
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
          <div className="flex items-center gap-2 lg:col-span-1">
            <button
              type="button"
              onClick={() => setIsEssential(!isEssential)}
              title={
                entryType === 'credit'
                  ? 'Offsets Essential Needs vs. Discretionary Wants'
                  : 'Toggle Essential Need vs Discretionary Want'
              }
              className={`rounded-lg border px-2 py-2 text-[11px] font-medium ${
                isEssential
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
              }`}
            >
              {isEssential ? 'Need' : 'Want'}
            </button>
            <button
              type="submit"
              disabled={addingExpense}
              className="flex flex-1 items-center justify-center rounded-lg bg-emerald-500 p-2 text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
              title={entryType === 'credit' ? 'Add Money Back / Credit' : 'Add Expense'}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </form>

      {/* Itemized Monthly Ledger */}
      <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/80 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-100">Itemized Ledger</h3>
            {catFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setCatFilter('all')}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] text-emerald-300"
              >
                {catFilter} <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search merchant or category…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-1.5 pl-8 pr-3 text-xs text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
            />
          </div>
        </div>

        {filteredMonthExpenses.length === 0 ? (
          <div className="py-10 text-center text-xs text-zinc-500">
            No matching expenses for {formatMonthLabel(selectedMonth)}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-500">
                  <th className="pb-2.5 pr-3 font-medium">Date</th>
                  <th className="pb-2.5 pr-3 font-medium">Merchant / Description</th>
                  <th className="pb-2.5 pr-3 font-medium">Category</th>
                  <th className="pb-2.5 pr-3 font-medium">Paid From</th>
                  <th className="pb-2.5 pr-3 font-medium">Type</th>
                  <th className="pb-2.5 text-right font-medium">Amount</th>
                  <th className="pb-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {filteredMonthExpenses.map((e) => {
                  const paidAcc = e.payment_account_id ? accountMap.get(e.payment_account_id) : null;
                  const ownerKey = e.owner_profile || 'primary';
                  const ownerBadge = OWNER_PROFILES[ownerKey] || OWNER_PROFILES.primary;
                  const credit = isCreditEntry(e);
                  return (
                    <tr
                      key={e.id}
                      className={credit ? 'bg-emerald-500/[0.04] hover:bg-emerald-500/[0.08]' : 'hover:bg-zinc-900/40'}
                    >
                      <td className="whitespace-nowrap py-2.5 pr-3 font-mono text-zinc-400">
                        {e.expense_date}
                      </td>
                      <td className="py-2.5 pr-3 font-medium text-zinc-200">
                        {e.merchant}
                        <span className={`ml-2 rounded border px-1.5 py-0.5 text-[10px] font-normal ${ownerBadge.badgeClass}`}>
                          {getOwnerDisplayName(ownerKey, householdNames)}
                        </span>
                        {credit && (
                          <span className="ml-1.5 rounded border border-emerald-500/35 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-normal text-emerald-300">
                            Money Back
                          </span>
                        )}
                        {e.recurring_bill_id && (
                          <span className="ml-1.5 rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-normal text-sky-300">
                            Recurring
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-zinc-400">{e.category}</td>
                      <td className="py-2.5 pr-3 text-zinc-500">{paidAcc ? paidAcc.name : '—'}</td>
                      <td className="py-2.5 pr-3">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] ${
                            credit
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : e.is_essential
                              ? 'bg-emerald-500/10 text-emerald-300'
                              : 'bg-amber-500/10 text-amber-300'
                          }`}
                        >
                          {credit
                            ? `Credit • ${e.is_essential ? 'Need' : 'Want'}`
                            : e.is_essential
                            ? 'Need'
                            : 'Want'}
                        </span>
                      </td>
                      <td
                        className={`whitespace-nowrap py-2.5 text-right font-mono font-medium tabular-nums ${
                          credit ? 'text-emerald-300' : 'text-zinc-100'
                        }`}
                      >
                        {credit
                          ? mask(formatCurrency(-Math.abs(toNumber(e.amount))))
                          : mask(formatCurrency(e.amount))}
                      </td>
                      <td className="whitespace-nowrap py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setEditingExpense({
                              ...e,
                              entry_type: credit ? 'credit' : 'expense',
                            })
                          }
                          className="mr-2 text-zinc-500 hover:text-zinc-200"
                        >
                          <Pencil className="inline h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteExpense(e.id)}
                          className="text-zinc-500 hover:text-rose-400"
                        >
                          <Trash2 className="inline h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: Edit Expense / Credit */}
      {editingExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-semibold text-zinc-100">
                {editingExpense.entry_type === 'credit' ? 'Edit Money-Back Credit' : 'Edit Expense'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingExpense(null)}
                className="text-zinc-500 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSaveEditedExpense} className="space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <label className="block text-zinc-300">
                  Entry Type
                  <select
                    value={editingExpense.entry_type === 'credit' ? 'credit' : 'expense'}
                    onChange={(e) =>
                      setEditingExpense({ ...editingExpense, entry_type: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-zinc-100"
                  >
                    <option value="expense">Expense (Outflow)</option>
                    <option value="credit">Money Back (Credit)</option>
                  </select>
                </label>
                <label className="block text-zinc-300">
                  Date
                  <input
                    type="date"
                    required
                    value={editingExpense.expense_date}
                    onChange={(e) =>
                      setEditingExpense({ ...editingExpense, expense_date: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100"
                  />
                </label>
                <label className="block text-zinc-300">
                  Amount ($)
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={editingExpense.amount}
                    onChange={(e) => setEditingExpense({ ...editingExpense, amount: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-zinc-100"
                  />
                </label>
              </div>
              <label className="block text-zinc-300">
                Merchant / Description
                <input
                  type="text"
                  required
                  value={editingExpense.merchant}
                  onChange={(e) => setEditingExpense({ ...editingExpense, merchant: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100"
                />
              </label>
              <div className="grid grid-cols-3 gap-3">
                <label className="block text-zinc-300">
                  Owner
                  <select
                    value={editingExpense.owner_profile || 'primary'}
                    onChange={(e) =>
                      setEditingExpense({ ...editingExpense, owner_profile: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100"
                  >
                    <option value="primary">{householdNames?.primary_name || 'Me'}</option>
                    <option value="spouse">{householdNames?.spouse_name || 'Wife'}</option>
                    <option value="joint">Joint</option>
                  </select>
                </label>
                <label className="block text-zinc-300">
                  Category
                  <select
                    value={editingExpense.category}
                    onChange={(e) => setEditingExpense({ ...editingExpense, category: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100"
                  >
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-zinc-300">
                  Classification
                  <select
                    value={editingExpense.is_essential ? 'need' : 'want'}
                    onChange={(e) =>
                      setEditingExpense({
                        ...editingExpense,
                        is_essential: e.target.value === 'need',
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100"
                  >
                    <option value="need">Essential (Need)</option>
                    <option value="want">Discretionary (Want)</option>
                  </select>
                </label>
              </div>
              <label className="block text-zinc-300">
                Notes (optional)
                <input
                  type="text"
                  placeholder="e.g., Friend stay contribution for Nov rent"
                  value={editingExpense.notes || ''}
                  onChange={(e) => setEditingExpense({ ...editingExpense, notes: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100"
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingExpense(null)}
                  className="rounded-lg border border-zinc-800 px-4 py-2 text-zinc-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-zinc-950"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Recurring Bills & Credits Manager */}
      {billModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-base font-semibold text-zinc-100">
                  Recurring Bills & Money-Back Credits
                </h3>
                <p className="text-xs text-zinc-500">
                  Define fixed bills or recurring reimbursements (e.g., friend rent share) once and post into any month’s ledger.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBillModalOpen(false)}
                className="text-zinc-500 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-3 inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-0.5 text-[11px] font-medium">
              <button
                type="button"
                onClick={() => setBillEntryType('expense')}
                className={`rounded-md px-2.5 py-1 transition ${
                  billEntryType === 'expense'
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Bill (Outflow)
              </button>
              <button
                type="button"
                onClick={() => setBillEntryType('credit')}
                className={`rounded-md px-2.5 py-1 transition ${
                  billEntryType === 'credit'
                    ? 'bg-emerald-500/20 text-emerald-200'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Money Back (Credit)
              </button>
            </div>

            <form onSubmit={handleAddRecurringBill} className="mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-6 text-xs">
              <select
                value={billOwner}
                onChange={(e) => setBillOwner(e.target.value)}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-zinc-100 sm:col-span-1"
              >
                <option value="primary">{householdNames?.primary_name || 'Me'}</option>
                <option value="spouse">{householdNames?.spouse_name || 'Wife'}</option>
                <option value="joint">Joint</option>
              </select>
              <input
                type="text"
                required
                placeholder={
                  billEntryType === 'credit'
                    ? 'e.g., Friend Rent Share, Utility Split'
                    : 'Bill name (Rent, Fiber…)'
                }
                value={billName}
                onChange={(e) => setBillName(e.target.value)}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 sm:col-span-2"
              />
              <select
                value={billCategory}
                onChange={(e) => setBillCategory(e.target.value)}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-zinc-100 sm:col-span-2"
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                placeholder={billEntryType === 'credit' ? 'Credit ($)' : 'Amount ($)'}
                value={billAmount}
                onChange={(e) => setBillAmount(e.target.value)}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 font-mono text-zinc-100"
              />
              <input
                type="number"
                min="1"
                max="31"
                placeholder="Due day"
                value={billDueDay}
                onChange={(e) => setBillDueDay(e.target.value)}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 font-mono text-zinc-100"
              />
              <select
                value={billCadence}
                onChange={(e) => setBillCadence(e.target.value)}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-zinc-100"
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
              </select>
              <select
                value={billAccount}
                onChange={(e) => setBillAccount(e.target.value)}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-zinc-300 sm:col-span-2"
              >
                <option value="">
                  {billEntryType === 'credit'
                    ? 'Received into (optional)'
                    : 'Paid from account (optional)'}
                </option>
                {(accounts || [])
                  .filter((a) => !a.is_archived)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                onClick={() => setBillEssential(!billEssential)}
                className={`rounded-lg border px-3 py-2 font-medium ${
                  billEssential
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                }`}
              >
                {billEssential ? 'Need' : 'Want'}
              </button>
              <button
                type="submit"
                disabled={savingBill}
                className="rounded-lg bg-emerald-500 px-3 py-2 font-semibold text-zinc-950 hover:bg-emerald-400"
              >
                {billEntryType === 'credit' ? '+ Add Credit' : '+ Add Bill'}
              </button>
            </form>

            <div className="divide-y divide-zinc-900 rounded-xl border border-zinc-800 px-4">
              {(recurringBills || []).map((b) => {
                const ownerKey = b.owner_profile || 'primary';
                const ownerBadge = OWNER_PROFILES[ownerKey] || OWNER_PROFILES.primary;
                const credit = isCreditEntry(b);
                return (
                <div key={b.id} className="flex items-center justify-between py-3 text-xs">
                  <div>
                    <div className="flex items-center gap-2 font-medium text-zinc-200">
                      <span>{b.name}</span>
                      <span className={`rounded border px-1.5 py-0.5 text-[10px] font-normal ${ownerBadge.badgeClass}`}>
                        {getOwnerDisplayName(ownerKey, householdNames)}
                      </span>
                      {credit && (
                        <span className="rounded border border-emerald-500/35 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-normal text-emerald-300">
                          Money Back
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      {b.category} • {b.cadence} {b.due_day ? `• Due ${ordinalDay(b.due_day)}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`font-mono font-semibold tabular-nums ${
                        credit ? 'text-emerald-300' : 'text-zinc-100'
                      }`}
                    >
                      {credit
                        ? mask(formatCurrency(-Math.abs(toNumber(b.amount))))
                        : mask(formatCurrency(b.amount))}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteBill(b.id)}
                      className="text-zinc-500 hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                );
              })}
              {(!recurringBills || recurringBills.length === 0) && (
                <div className="py-8 text-center text-xs text-zinc-500">
                  No recurring bills or credits configured yet.
                </div>
              )}
            </div>

            {(metrics.activeBillsMonthly > 0 || metrics.activeCreditsMonthly > 0) && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-[11px] tabular-nums">
                <span className="text-zinc-400">
                  Active monthly equivalents: Bills{' '}
                  <strong className="font-mono text-zinc-200">
                    {mask(formatCurrency(metrics.activeBillsMonthly))}/mo
                  </strong>
                  {metrics.activeCreditsMonthly > 0 && (
                    <>
                      {' '}
                      − Credits{' '}
                      <strong className="font-mono text-emerald-300">
                        {mask(formatCurrency(metrics.activeCreditsMonthly))}/mo
                      </strong>
                    </>
                  )}
                </span>
                <span className="font-mono font-semibold text-zinc-100">
                  Net Recurring: {mask(formatCurrency(metrics.netRecurringMonthly))}/mo
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Monthly Budget & Net Take-Home Target */}
      {budgetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-semibold text-zinc-100">Monthly Targets</h3>
              <button
                type="button"
                onClick={() => setBudgetModalOpen(false)}
                className="text-zinc-500 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSaveBudgets} className="space-y-4 text-xs">
              <label className="block text-zinc-300">
                Monthly Spending Cap / Budget ($)
                <input
                  type="number"
                  step="1"
                  min="0"
                  placeholder="e.g., 4500"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100"
                />
              </label>
              <label className="block text-zinc-300">
                Monthly Net Take-Home Pay ($, after 401k & taxes)
                <input
                  type="number"
                  step="1"
                  min="0"
                  placeholder="e.g., 7800"
                  value={takeHomeInput}
                  onChange={(e) => setTakeHomeInput(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100"
                />
                <span className="mt-1 block text-[11px] text-zinc-500">
                  Used to compute your monthly cash savings and savings rate %.
                </span>
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setBudgetModalOpen(false)}
                  className="rounded-lg border border-zinc-800 px-4 py-2 text-zinc-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingBudgets}
                  className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-zinc-950"
                >
                  {savingBudgets ? 'Saving…' : 'Save Targets'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
