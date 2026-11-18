import { useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  PiggyBank,
  Landmark,
  CreditCard,
  FileSpreadsheet,
  Receipt,
  ShieldAlert,
  Sparkles,
  Plus,
  RefreshCw,
  ArrowUpRight,
  Briefcase,
} from 'lucide-react';
import {
  buildNetWorthTimeSeries,
  CATEGORY_COLORS,
  computeNetWorthSummary,
  currentMonthKey,
  formatCurrency,
  formatMonthLabel,
  formatPercent,
  ordinalDay,
  toNumber,
} from '../lib/finance';

function ChartTooltip({ active, payload, label, privacyMode }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/95 px-3.5 py-2.5 text-xs shadow-xl">
      <div className="mb-1.5 font-medium text-zinc-300">{label}</div>
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-5 tabular-nums">
            <span className="flex items-center gap-1.5 text-zinc-400">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              {entry.name}
            </span>
            <span className="font-mono font-medium text-zinc-100">
              {privacyMode ? '••••••' : formatCurrency(entry.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OverviewTab({
  accounts,
  snapshots,
  expenses,
  recurringBills,
  budgets,
  privacyMode,
  hasMfaEnrolled,
  onNavigateTab,
  onOpenBatchUpdate,
  onOpenNewAccount,
  onSeedDemo,
  seedingDemo,
}) {
  const [range, setRange] = useState('ALL'); // '3M' | '6M' | '1Y' | 'ALL'
  const [chartMode, setChartMode] = useState('networth'); // 'networth' | 'pillars'

  const mask = (str) => (privacyMode ? '••••••' : str);

  const summary = useMemo(() => computeNetWorthSummary(accounts), [accounts]);
  const fullSeries = useMemo(
    () => buildNetWorthTimeSeries(accounts, snapshots),
    [accounts, snapshots]
  );

  const filteredSeries = useMemo(() => {
    if (range === 'ALL' || fullSeries.length <= 2) return fullSeries;
    const monthsBack = range === '3M' ? 3 : range === '6M' ? 6 : 12;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - monthsBack);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    const sliced = fullSeries.filter((p) => p.date >= cutoffIso);
    return sliced.length >= 2 ? sliced : fullSeries.slice(-2);
  }, [fullSeries, range]);

  const periodDelta = useMemo(() => {
    if (filteredSeries.length < 2) return { diff: 0, pct: null };
    const first = filteredSeries[0].netWorth;
    const last = filteredSeries[filteredSeries.length - 1].netWorth;
    const diff = last - first;
    const pct = Math.abs(first) > 0 ? (diff / Math.abs(first)) * 100 : null;
    return { diff, pct };
  }, [filteredSeries]);

  const curMonth = currentMonthKey();
  const monthStats = useMemo(() => {
    const monthExpenses = (expenses || []).filter((e) =>
      (e.expense_date || '').startsWith(curMonth)
    );
    const totalSpent = monthExpenses.reduce((sum, e) => sum + toNumber(e.amount), 0);
    const essentialSpent = monthExpenses
      .filter((e) => e.is_essential)
      .reduce((sum, e) => sum + toNumber(e.amount), 0);

    const byCat = {};
    for (const e of monthExpenses) {
      byCat[e.category] = (byCat[e.category] || 0) + toNumber(e.amount);
    }
    const topCategories = Object.entries(byCat)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const totalBudgetObj = (budgets || []).find((b) => b.category === '_total_budget');
    const takeHomeObj = (budgets || []).find((b) => b.category === '_monthly_take_home');
    const monthlyBudget = totalBudgetObj ? toNumber(totalBudgetObj.monthly_limit) : 0;
    const monthlyTakeHome = takeHomeObj ? toNumber(takeHomeObj.monthly_limit) : 0;

    // Emergency cash runway in months (using budget or current spend or recurring bills baseline)
    const recurringBaseline = (recurringBills || [])
      .filter((b) => b.is_active)
      .reduce((s, b) => {
        const amt = toNumber(b.amount);
        if (b.cadence === 'annual') return s + amt / 12;
        if (b.cadence === 'quarterly') return s + amt / 3;
        return s + amt;
      }, 0);

    const monthlyBurnReference = Math.max(totalSpent, monthlyBudget, recurringBaseline);
    const runwayMonths =
      monthlyBurnReference > 0 ? summary.banks / monthlyBurnReference : null;

    return {
      totalSpent,
      essentialSpent,
      topCategories,
      monthlyBudget,
      monthlyTakeHome,
      runwayMonths,
      txCount: monthExpenses.length,
    };
  }, [expenses, budgets, recurringBills, curMonth, summary.banks]);

  // Empty Vault Onboarding State
  if (!accounts || accounts.length === 0) {
    return (
      <div className="space-y-6">
        {!hasMfaEnrolled && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
            <div className="flex items-center gap-2.5">
              <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" />
              <span>
                <strong>Security recommendation:</strong> Enroll an Authenticator App (TOTP 2FA) so Postgres RLS enforces AAL2 hardware/app verification on every query.
              </span>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('security')}
              className="rounded-lg border border-amber-400/40 bg-amber-500/20 px-3 py-1.5 font-medium text-amber-100 hover:bg-amber-500/30"
            >
              Enable 2FA →
            </button>
          </div>
        )}

        <div className="rounded-2xl border border-zinc-800/90 bg-zinc-950/70 p-8 text-center sm:p-12">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
            <Landmark className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-100">Your Private Finance Vault is Ready</h2>
          <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-zinc-400">
            Track your 401(k) & retirement accounts, bank cash reserves, credit card utilization, active loans, net
            worth trajectory, and monthly expenses — manually controlled with zero third-party bank links.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => onOpenNewAccount('retirement_401k')}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-400"
            >
              <Plus className="h-4 w-4" />
              Add Your First Account
            </button>
            <button
              type="button"
              disabled={seedingDemo}
              onClick={onSeedDemo}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-xs font-medium text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-800 disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4 text-emerald-400" />
              {seedingDemo ? 'Loading Sample Data…' : 'Load Realistic Sample Data to Explore'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const assetSharePct =
    summary.totalAssets + summary.totalLiabilities > 0
      ? (summary.totalAssets / (summary.totalAssets + summary.totalLiabilities)) * 100
      : 100;

  const activeAccountsSorted = [...accounts]
    .filter((a) => !a.is_archived)
    .sort((a, b) => Math.abs(toNumber(b.current_balance)) - Math.abs(toNumber(a.current_balance)));

  return (
    <div className="space-y-6">
      {/* MFA Prompt Banner if not yet enrolled */}
      {!hasMfaEnrolled && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-200/90">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" />
            <span>
              Tighten your vault: add TOTP 2FA so Postgres RLS requires an Authenticator code (<code className="text-amber-300">aal2</code>) before returning any financial rows.
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('security')}
            className="rounded-md border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-[11px] font-medium text-amber-200 hover:bg-amber-500/25"
          >
            Set up 2FA →
          </button>
        </div>
      )}

      {/* Top Hero KPI Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* 1. Net Worth */}
        <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/80 p-5">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="font-medium">Total Net Worth</span>
            <button
              type="button"
              onClick={onOpenBatchUpdate}
              className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/20"
            >
              <RefreshCw className="h-3 w-3" />
              Check-In
            </button>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-zinc-50 tabular-nums">
            {mask(formatCurrency(summary.netWorth))}
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs tabular-nums">
            {periodDelta.diff >= 0 ? (
              <span className="inline-flex items-center gap-1 text-emerald-400">
                <TrendingUp className="h-3.5 w-3.5" />
                {mask(formatCurrency(periodDelta.diff, { showSign: true }))}
                {periodDelta.pct !== null && ` (${formatPercent(periodDelta.pct)})`}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-rose-400">
                <TrendingDown className="h-3.5 w-3.5" />
                {mask(formatCurrency(periodDelta.diff, { showSign: true }))}
                {periodDelta.pct !== null && ` (${formatPercent(periodDelta.pct)})`}
              </span>
            )}
            <span className="text-zinc-500">in {range}</span>
          </div>
        </div>

        {/* 2. Total Assets */}
        <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/80 p-5">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="font-medium">Total Assets</span>
            <span className="text-[11px] text-emerald-400">
              {summary.weightedCashApy > 0 ? `${formatPercent(summary.weightedCashApy, 2)} Cash APY` : 'Assets'}
            </span>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-emerald-400 tabular-nums">
            {mask(formatCurrency(summary.totalAssets))}
          </div>
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-zinc-400 tabular-nums">
            <span>401(k): {mask(formatCurrency(summary.retirement401k, { compact: true }))}</span>
            <span>Banks: {mask(formatCurrency(summary.banks, { compact: true }))}</span>
          </div>
        </div>

        {/* 3. Total Liabilities (Cards + Active Loans) */}
        <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/80 p-5">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="font-medium">Active Debt & Cards</span>
            <span className="text-[11px] text-rose-300">
              {summary.weightedDebtApr > 0 ? `${formatPercent(summary.weightedDebtApr, 2)} Avg APR` : '0% APR'}
            </span>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-rose-400 tabular-nums">
            {mask(formatCurrency(summary.totalLiabilities))}
          </div>
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-zinc-400 tabular-nums">
            <span>Loans: {mask(formatCurrency(summary.loans, { compact: true }))}</span>
            <span>Min/mo: {mask(formatCurrency(summary.monthlyMinDebtService, { decimals: 0 }))}</span>
          </div>
        </div>

        {/* 4. Monthly Spend & Cash Runway */}
        <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/80 p-5">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="font-medium">{formatMonthLabel(curMonth)} Spend</span>
            <button
              type="button"
              onClick={() => onNavigateTab('expenses')}
              className="inline-flex items-center gap-0.5 text-[11px] text-zinc-400 hover:text-zinc-200"
            >
              Ledger <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-zinc-100 tabular-nums">
            {mask(formatCurrency(monthStats.totalSpent))}
          </div>
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-zinc-400 tabular-nums">
            <span>
              {monthStats.monthlyBudget > 0
                ? `${Math.round((monthStats.totalSpent / monthStats.monthlyBudget) * 100)}% of ${mask(
                    formatCurrency(monthStats.monthlyBudget, { decimals: 0 })
                  )}`
                : `${monthStats.txCount} expenses logged`}
            </span>
            {monthStats.runwayMonths !== null && (
              <span className="text-sky-400">{monthStats.runwayMonths.toFixed(1)} mo cash runway</span>
            )}
          </div>
        </div>
      </div>

      {/* Assets vs Liabilities Ratio Bar */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 px-5 py-3.5">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="text-zinc-400">Balance Sheet Leverage</span>
          <span className="font-mono text-[11px] text-zinc-300 tabular-nums">
            Assets {formatPercent(assetSharePct, 1)} • Liabilities {formatPercent(100 - assetSharePct, 1)}
          </span>
        </div>
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-zinc-900">
          <div
            className="bg-emerald-500 transition-all duration-500"
            style={{ width: `${Math.max(2, assetSharePct)}%` }}
          />
          {summary.totalLiabilities > 0 && (
            <div
              className="bg-rose-500 transition-all duration-500"
              style={{ width: `${Math.max(2, 100 - assetSharePct)}%` }}
            />
          )}
        </div>
      </div>

      {/* Net Worth History Chart */}
      <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/80 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Net Worth & Balance Trajectory</h2>
            <p className="text-xs text-zinc-500">
              Carry-forward historical snapshots across all retirement, bank, card, and loan accounts
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-zinc-800 bg-zinc-900/70 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setChartMode('networth')}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  chartMode === 'networth' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Net Worth vs Debt
              </button>
              <button
                type="button"
                onClick={() => setChartMode('pillars')}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  chartMode === 'pillars' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                401(k) / Cash / Loans
              </button>
            </div>

            <div className="flex rounded-lg border border-zinc-800 bg-zinc-900/70 p-0.5 text-[11px]">
              {['3M', '6M', '1Y', 'ALL'].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={`rounded-md px-2 py-1 font-medium transition ${
                    range === r ? 'bg-zinc-800 text-emerald-300' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {chartMode === 'networth' ? (
              <AreaChart data={filteredSeries} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradNetWorth" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.32} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradDebt" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#18181b" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#71717a', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => (privacyMode ? '•••' : formatCurrency(v, { compact: true, decimals: 0 }))}
                  tick={{ fill: '#71717a', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={68}
                />
                <Tooltip content={<ChartTooltip privacyMode={privacyMode} />} />
                <Area
                  type="monotone"
                  dataKey="assets"
                  name="Total Assets"
                  stroke="#0ea5e9"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  fill="none"
                />
                <Area
                  type="monotone"
                  dataKey="netWorth"
                  name="Net Worth"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fill="url(#gradNetWorth)"
                />
                <Area
                  type="monotone"
                  dataKey="liabilities"
                  name="Total Debt"
                  stroke="#f43f5e"
                  strokeWidth={2}
                  fill="url(#gradDebt)"
                />
              </AreaChart>
            ) : (
              <AreaChart data={filteredSeries} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#18181b" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#71717a', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => (privacyMode ? '•••' : formatCurrency(v, { compact: true, decimals: 0 }))}
                  tick={{ fill: '#71717a', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={68}
                />
                <Tooltip content={<ChartTooltip privacyMode={privacyMode} />} />
                <Area
                  type="monotone"
                  dataKey="retirement401k"
                  name="401(k) & Retirement"
                  stroke="#10b981"
                  strokeWidth={2}
                  fillOpacity={0.12}
                  fill="#10b981"
                />
                <Area
                  type="monotone"
                  dataKey="banks"
                  name="Banks & Cash"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  fillOpacity={0.12}
                  fill="#0ea5e9"
                />
                <Area
                  type="monotone"
                  dataKey="loans"
                  name="Active Loans"
                  stroke="#f43f5e"
                  strokeWidth={2}
                  fillOpacity={0.1}
                  fill="#f43f5e"
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* 5 Core Balance Pillars (Clickable into filtered Accounts Tab) */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
        <button
          type="button"
          onClick={() => onNavigateTab('accounts', 'retirement_401k')}
          className="group rounded-xl border border-zinc-800/90 bg-zinc-950/70 p-4 text-left transition hover:border-emerald-500/40"
        >
          <div className="flex items-center justify-between">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <PiggyBank className="h-4 w-4" />
            </div>
            <ArrowUpRight className="h-3.5 w-3.5 text-zinc-600 transition group-hover:text-emerald-400" />
          </div>
          <div className="mt-3 text-xs font-medium text-zinc-400">401(k) & Retirement</div>
          <div className="mt-1 font-mono text-lg font-semibold text-zinc-100 tabular-nums">
            {mask(formatCurrency(summary.retirement401k))}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            {summary.totalAssets > 0
              ? `${formatPercent((summary.retirement401k / summary.totalAssets) * 100, 0)} of total assets`
              : 'Tax-advantaged'}
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('accounts', 'bank')}
          className="group rounded-xl border border-zinc-800/90 bg-zinc-950/70 p-4 text-left transition hover:border-sky-500/40"
        >
          <div className="flex items-center justify-between">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
              <Landmark className="h-4 w-4" />
            </div>
            <ArrowUpRight className="h-3.5 w-3.5 text-zinc-600 transition group-hover:text-sky-400" />
          </div>
          <div className="mt-3 text-xs font-medium text-zinc-400">Banks & Cash</div>
          <div className="mt-1 font-mono text-lg font-semibold text-zinc-100 tabular-nums">
            {mask(formatCurrency(summary.banks))}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            {summary.weightedCashApy > 0
              ? `~${mask(formatCurrency((summary.banks * summary.weightedCashApy) / 100, { decimals: 0 }))}/yr interest`
              : 'Liquid checking & HYSA'}
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('accounts', 'investment')}
          className="group rounded-xl border border-zinc-800/90 bg-zinc-950/70 p-4 text-left transition hover:border-violet-500/40"
        >
          <div className="flex items-center justify-between">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
              <Briefcase className="h-4 w-4" />
            </div>
            <ArrowUpRight className="h-3.5 w-3.5 text-zinc-600 transition group-hover:text-violet-400" />
          </div>
          <div className="mt-3 text-xs font-medium text-zinc-400">Investments & Other</div>
          <div className="mt-1 font-mono text-lg font-semibold text-zinc-100 tabular-nums">
            {mask(formatCurrency(summary.investments + summary.otherAssets))}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">Brokerage, equity & assets</div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('accounts', 'credit_card')}
          className="group rounded-xl border border-zinc-800/90 bg-zinc-950/70 p-4 text-left transition hover:border-amber-500/40"
        >
          <div className="flex items-center justify-between">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
              <CreditCard className="h-4 w-4" />
            </div>
            <ArrowUpRight className="h-3.5 w-3.5 text-zinc-600 transition group-hover:text-amber-400" />
          </div>
          <div className="mt-3 text-xs font-medium text-zinc-400">Credit Cards</div>
          <div className="mt-1 font-mono text-lg font-semibold text-amber-300 tabular-nums">
            {mask(formatCurrency(summary.creditCards))}
          </div>
          <div className="mt-1.5">
            {summary.creditUtilizationPct !== null ? (
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span>Utilization</span>
                <span
                  className={
                    summary.creditUtilizationPct <= 10
                      ? 'text-emerald-400'
                      : summary.creditUtilizationPct <= 30
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }
                >
                  {formatPercent(summary.creditUtilizationPct, 1)}
                </span>
              </div>
            ) : (
              <div className="text-[11px] text-zinc-500">Revolving balances</div>
            )}
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('accounts', 'loan')}
          className="group rounded-xl border border-zinc-800/90 bg-zinc-950/70 p-4 text-left transition hover:border-rose-500/40"
        >
          <div className="flex items-center justify-between">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400">
              <FileSpreadsheet className="h-4 w-4" />
            </div>
            <ArrowUpRight className="h-3.5 w-3.5 text-zinc-600 transition group-hover:text-rose-400" />
          </div>
          <div className="mt-3 text-xs font-medium text-zinc-400">Active Loans</div>
          <div className="mt-1 font-mono text-lg font-semibold text-rose-300 tabular-nums">
            {mask(formatCurrency(summary.loans + summary.otherLiabilities))}
          </div>
          <div className="mt-1.5">
            {summary.loanPaidOffPct !== null ? (
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span>Principal paid</span>
                <span className="text-emerald-400">{formatPercent(summary.loanPaidOffPct, 0)}</span>
              </div>
            ) : (
              <div className="text-[11px] text-zinc-500">Installment debt</div>
            )}
          </div>
        </button>
      </div>

      {/* Bottom Split: Accounts Snapshot + Monthly Expense Breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: Accounts Overview */}
        <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/80 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Active Accounts</h3>
              <p className="text-xs text-zinc-500">{activeAccountsSorted.length} tracked accounts</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('accounts', 'all')}
              className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
            >
              Manage all →
            </button>
          </div>

          <div className="divide-y divide-zinc-900">
            {activeAccountsSorted.slice(0, 7).map((acc) => (
              <div key={acc.id} className="flex items-center justify-between py-2.5 text-xs">
                <div className="min-w-0 pr-3">
                  <div className="truncate font-medium text-zinc-200">{acc.name}</div>
                  <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                    <span>{acc.institution || acc.subtype || acc.category}</span>
                    {acc.interest_rate !== null && acc.interest_rate !== undefined && toNumber(acc.interest_rate) > 0 && (
                      <span>• {formatPercent(acc.interest_rate, 2)} {acc.is_liability ? 'APR' : 'APY'}</span>
                    )}
                    {acc.due_day && <span>• Due {ordinalDay(acc.due_day)}</span>}
                  </div>
                </div>
                <div
                  className={`shrink-0 font-mono text-sm font-medium tabular-nums ${
                    acc.is_liability ? 'text-rose-300' : 'text-zinc-100'
                  }`}
                >
                  {acc.is_liability && toNumber(acc.current_balance) > 0 ? '-' : ''}
                  {mask(formatCurrency(acc.current_balance))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Current Month Expense Pulse */}
        <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/80 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">
                {formatMonthLabel(curMonth)} Spending Pulse
              </h3>
              <p className="text-xs text-zinc-500">
                Needs {mask(formatCurrency(monthStats.essentialSpent))} • Wants{' '}
                {mask(formatCurrency(Math.max(0, monthStats.totalSpent - monthStats.essentialSpent)))}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('expenses')}
              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300"
            >
              <Receipt className="h-3.5 w-3.5" />
              Open Expenses →
            </button>
          </div>

          {monthStats.topCategories.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-800 py-10 text-center text-xs text-zinc-500">
              No expenses logged for {formatMonthLabel(curMonth)} yet.
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => onNavigateTab('expenses')}
                  className="text-emerald-400 hover:underline"
                >
                  Log expenses or post recurring bills →
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3.5">
              {monthStats.topCategories.map(([cat, amt]) => {
                const pct = monthStats.totalSpent > 0 ? (amt / monthStats.totalSpent) * 100 : 0;
                const color = CATEGORY_COLORS[cat] || '#10b981';
                return (
                  <div key={cat}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium text-zinc-300">{cat}</span>
                      <span className="font-mono text-zinc-200 tabular-nums">
                        {mask(formatCurrency(amt))}{' '}
                        <span className="text-[11px] text-zinc-500">({formatPercent(pct, 0)})</span>
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-900">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.max(3, pct)}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                );
              })}

              {monthStats.monthlyTakeHome > 0 && (
                <div className="mt-4 flex items-center justify-between rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-3.5 py-2.5 text-xs">
                  <span className="text-zinc-400">Implied Monthly Savings Rate</span>
                  <span className="font-mono font-semibold text-emerald-400 tabular-nums">
                    {formatPercent(
                      ((monthStats.monthlyTakeHome - monthStats.totalSpent) / monthStats.monthlyTakeHome) * 100,
                      1
                    )}{' '}
                    ({mask(formatCurrency(monthStats.monthlyTakeHome - monthStats.totalSpent, { showSign: true }))})
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
