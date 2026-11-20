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
  Users,
  CalendarClock,
  Activity,
  Home,
} from 'lucide-react';
import {
  buildNetWorthTimeSeries,
  CATEGORY_COLORS,
  computeHouseholdBreakdown,
  computeNetWorthSummary,
  computePromoStatus,
  currentMonthKey,
  formatCurrency,
  formatMonthLabel,
  formatPercent,
  formatShortDate,
  getOwnerDisplayName,
  getRealAssetType,
  getSignedExpenseAmount,
  ordinalDay,
  OWNER_PROFILES,
  summarizeExpensesList,
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
  allAccounts,
  snapshots,
  expenses,
  recurringBills,
  budgets,
  equityHoldings,
  promos,
  householdScope,
  onChangeHouseholdScope,
  householdNames,
  quotesRefreshing,
  lastQuotesSyncAt,
  onRefreshQuotes,
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
  const householdBreakdown = useMemo(
    () => computeHouseholdBreakdown(allAccounts || accounts),
    [allAccounts, accounts]
  );

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

  const accountMap = useMemo(
    () => new Map((allAccounts || accounts || []).map((a) => [a.id, a])),
    [allAccounts, accounts]
  );

  const equityStats = useMemo(() => {
    if (!equityHoldings || equityHoldings.length === 0) return null;

    let vestedValue = 0;
    let prevVestedValue = 0;
    let unvestedValue = 0;
    const bySymbol = new Map();

    for (const h of equityHoldings) {
      const sym = (h.symbol || '').toUpperCase();
      const shares = toNumber(h.shares);
      const unvested = toNumber(h.unvested_shares);
      const price = toNumber(h.last_price);
      const prev = toNumber(h.prev_close) > 0 ? toNumber(h.prev_close) : price;

      vestedValue += shares * price;
      prevVestedValue += shares * prev;
      unvestedValue += unvested * price;

      if (!bySymbol.has(sym)) {
        bySymbol.set(sym, { symbol: sym, shares: 0, unvested: 0, price, prevClose: prev, value: 0 });
      }
      const entry = bySymbol.get(sym);
      entry.shares += shares;
      entry.unvested += unvested;
      entry.price = price;
      entry.prevClose = prev;
      entry.value += shares * price;
    }

    const dayChange = vestedValue - prevVestedValue;
    const dayPct = prevVestedValue > 0 ? (dayChange / prevVestedValue) * 100 : 0;

    return {
      vestedValue,
      unvestedValue,
      dayChange,
      dayPct,
      tickers: Array.from(bySymbol.values()).sort((a, b) => b.value - a.value),
    };
  }, [equityHoldings]);

  const activePromos = useMemo(() => {
    return (promos || [])
      .filter((p) => !p.is_paid_off && toNumber(p.promo_balance) > 0)
      .map((p) => ({
        ...p,
        account: accountMap.get(p.account_id),
        status: computePromoStatus(p),
      }))
      .sort((a, b) => a.status.daysLeft - b.status.daysLeft);
  }, [promos, accountMap]);

  const curMonth = currentMonthKey();
  const monthStats = useMemo(() => {
    const monthExpenses = (expenses || []).filter((e) =>
      (e.expense_date || '').startsWith(curMonth)
    );
    const expSummary = summarizeExpensesList(monthExpenses);
    const totalSpent = expSummary.netTotal;
    const grossSpent = expSummary.grossTotal;
    const creditsTotal = expSummary.creditsTotal;
    const essentialSpent = expSummary.netNeeds;
    const wantsSpent = expSummary.netWants;
    const topCategories = expSummary.categoriesSorted.slice(0, 5);

    const totalBudgetObj = (budgets || []).find((b) => b.category === '_total_budget');
    const takeHomeObj = (budgets || []).find((b) => b.category === '_monthly_take_home');
    const monthlyBudget = totalBudgetObj ? toNumber(totalBudgetObj.monthly_limit) : 0;
    const monthlyTakeHome = takeHomeObj ? toNumber(takeHomeObj.monthly_limit) : 0;

    const recurringBaseline = Math.max(
      0,
      (recurringBills || [])
        .filter((b) => b.is_active)
        .reduce((s, b) => {
          const amt = getSignedExpenseAmount(b);
          if (b.cadence === 'annual') return s + amt / 12;
          if (b.cadence === 'quarterly') return s + amt / 3;
          return s + amt;
        }, 0)
    );

    const monthlyBurnReference = Math.max(0, totalSpent, monthlyBudget, recurringBaseline);
    const runwayMonths =
      monthlyBurnReference > 0 ? summary.banks / monthlyBurnReference : null;

    return {
      totalSpent,
      grossSpent,
      creditsTotal,
      essentialSpent,
      wantsSpent,
      topCategories,
      monthlyBudget,
      monthlyTakeHome,
      runwayMonths,
      txCount: monthExpenses.length,
    };
  }, [expenses, budgets, recurringBills, curMonth, summary.banks]);

  // Empty Vault Onboarding State (only when the entire vault has zero accounts)
  if (!allAccounts || allAccounts.length === 0) {
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
            Track combined & individual household net worth ({householdNames.primary_name} &{' '}
            {householdNames.spouse_name}), 401(k) & retirement, live RSU/stock holdings, credit card 0% promo
            reminders, active loans, and monthly expenses.
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

  const scopeTitle =
    householdScope === 'combined'
      ? 'Combined Household'
      : getOwnerDisplayName(householdScope, householdNames);

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

      {/* Household Split Switcher Cards (Combined vs Me vs Wife vs Joint) */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/70 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
            <Users className="h-4 w-4 text-emerald-400" />
            <span>Household Net Worth Breakdown</span>
            <span className="text-[11px] text-zinc-500">• Click a card to filter the entire dashboard</span>
          </div>
          {householdBreakdown.spouse.count === 0 && (
            <button
              type="button"
              onClick={() => {
                onChangeHouseholdScope('spouse');
                onOpenNewAccount('retirement_401k');
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/10 px-2.5 py-1 text-[11px] font-medium text-fuchsia-300 hover:bg-fuchsia-500/20"
            >
              <Plus className="h-3 w-3" />
              Add {householdNames.spouse_name}’s Account
            </button>
          )}
        </div>

        <div
          className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${
            householdBreakdown.joint.count > 0 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
          }`}
        >
          {[
            {
              key: 'combined',
              label: 'Combined Household',
              data: householdBreakdown.combined,
              ring: 'border-zinc-500/50 bg-zinc-900/80',
              dot: 'bg-zinc-200',
            },
            {
              key: 'primary',
              label: householdNames.primary_name,
              data: householdBreakdown.primary,
              ring: 'border-emerald-500/50 bg-emerald-500/10',
              dot: 'bg-emerald-400',
            },
            {
              key: 'spouse',
              label: householdNames.spouse_name,
              data: householdBreakdown.spouse,
              ring: 'border-fuchsia-500/50 bg-fuchsia-500/10',
              dot: 'bg-fuchsia-400',
            },
            ...(householdBreakdown.joint.count > 0
              ? [
                  {
                    key: 'joint',
                    label: 'Joint Accounts',
                    data: householdBreakdown.joint,
                    ring: 'border-sky-500/50 bg-sky-500/10',
                    dot: 'bg-sky-400',
                  },
                ]
              : []),
          ].map((card) => {
            const active = householdScope === card.key;
            const share =
              Math.abs(householdBreakdown.combined.netWorth) > 0 && card.key !== 'combined'
                ? (card.data.netWorth / householdBreakdown.combined.netWorth) * 100
                : null;
            return (
              <button
                key={card.key}
                type="button"
                onClick={() => onChangeHouseholdScope(card.key)}
                className={`rounded-xl border p-3.5 text-left transition ${
                  active
                    ? card.ring
                    : 'border-zinc-800/90 bg-zinc-950 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-zinc-200">
                    <span className={`h-2 w-2 rounded-full ${card.dot}`} />
                    {card.label}
                  </span>
                  <span className="text-[11px] text-zinc-500">
                    {card.data.count} acct{card.data.count === 1 ? '' : 's'}
                    {share !== null && Number.isFinite(share) ? ` • ${Math.round(share)}%` : ''}
                  </span>
                </div>
                <div className="mt-1.5 font-mono text-lg font-bold text-zinc-50 tabular-nums">
                  {mask(formatCurrency(card.data.netWorth))}
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-500 tabular-nums">
                  <span>Assets: {mask(formatCurrency(card.data.assets, { compact: true }))}</span>
                  <span>Debt: {mask(formatCurrency(card.data.liabilities, { compact: true }))}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Empty scoped view message (e.g. Wife selected before adding her accounts) */}
      {accounts.length === 0 && (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/60 p-8 text-center">
          <p className="text-xs text-zinc-400">
            No accounts assigned to <strong>{scopeTitle}</strong> yet.
          </p>
          <button
            type="button"
            onClick={() => onOpenNewAccount('retirement_401k')}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Account for {scopeTitle}
          </button>
        </div>
      )}

      {accounts.length > 0 && (
        <>
          {/* 0% Promo Balance Transfer Reminders */}
          {activePromos.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-200">
                  <CalendarClock className="h-4 w-4 text-amber-400" />
                  <span>0% / Promo Balance Transfer Reminders ({activePromos.length})</span>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateTab('accounts', 'credit_card')}
                  className="text-[11px] font-medium text-amber-300 hover:underline"
                >
                  Manage Balance Transfers →
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {activePromos.map((p) => {
                  const st = p.status;
                  const ownerKey = p.account?.owner_profile || 'primary';
                  const ownerBadge = OWNER_PROFILES[ownerKey] || OWNER_PROFILES.primary;
                  const badgeStyle =
                    st.urgency === 'expired'
                      ? 'bg-rose-500/20 text-rose-200 border-rose-500/40'
                      : st.urgency === 'urgent'
                      ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                      : st.urgency === 'warning'
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      : 'bg-sky-500/15 text-sky-300 border-sky-500/30';

                  return (
                    <div
                      key={p.id}
                      className="flex flex-col justify-between rounded-lg border border-zinc-800 bg-zinc-950/90 p-3.5 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-semibold text-zinc-100">{p.label}</span>
                            <span className={`rounded border px-1.5 py-0.5 text-[10px] ${ownerBadge.badgeClass}`}>
                              {getOwnerDisplayName(ownerKey, householdNames)}
                            </span>
                          </div>
                          <div className="mt-0.5 text-[11px] text-zinc-500">
                            {p.account?.name || 'Credit Card'} • {formatPercent(p.promo_apr, 1)} promo APR
                            {p.standard_apr ? ` → ${formatPercent(p.standard_apr, 2)} after` : ''}
                          </div>
                        </div>

                        <span className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold ${badgeStyle}`}>
                          {st.daysLeft < 0
                            ? `Expired ${Math.abs(st.daysLeft)}d ago`
                            : st.daysLeft === 0
                            ? 'Expires today'
                            : `${st.daysLeft}d left`}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-900 pt-2.5 text-[11px]">
                        <div>
                          <span className="text-zinc-400">Remaining: </span>
                          <span className="font-mono font-semibold text-amber-300">
                            {mask(formatCurrency(p.promo_balance))}
                          </span>
                          <span className="text-zinc-500"> • Ends {formatShortDate(p.expires_on)}</span>
                        </div>
                        <div className="font-mono font-medium text-emerald-300">
                          {st.daysLeft <= 0
                            ? `Clear ${mask(formatCurrency(p.promo_balance))} now`
                            : `Pay ${mask(formatCurrency(st.requiredMonthlyPayment, { decimals: 0 }))}/mo`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top Hero KPI Row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {/* 1. Net Worth */}
            <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/80 p-5">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="font-medium">{scopeTitle} Net Worth</span>
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
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400 tabular-nums">
                <span>401(k): {mask(formatCurrency(summary.retirement401k, { compact: true }))}</span>
                <span>Inv: {mask(formatCurrency(summary.investments, { compact: true }))}</span>
                {summary.otherAssets > 0 && (
                  <span className="text-teal-300">
                    Real: {mask(formatCurrency(summary.otherAssets, { compact: true }))}
                  </span>
                )}
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
                <span>Cards: {mask(formatCurrency(summary.creditCards, { compact: true }))}</span>
              </div>
            </div>

            {/* 4. Monthly Spend & Cash Runway */}
            <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/80 p-5">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="font-medium">
                  {monthStats.creditsTotal > 0
                    ? `${formatMonthLabel(curMonth)} Net Spend`
                    : `${formatMonthLabel(curMonth)} Spend`}
                </span>
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
                  {monthStats.monthlyBudget > 0 && householdScope === 'combined'
                    ? `${Math.max(0, Math.round((monthStats.totalSpent / monthStats.monthlyBudget) * 100))}% of ${mask(
                        formatCurrency(monthStats.monthlyBudget, { decimals: 0 })
                      )}`
                    : `${monthStats.txCount} items logged`}
                  {monthStats.creditsTotal > 0 && (
                    <span className="ml-1.5 text-emerald-400">
                      (−{mask(formatCurrency(monthStats.creditsTotal, { decimals: 0 }))} back)
                    </span>
                  )}
                </span>
                {monthStats.runwayMonths !== null && (
                  <span className="text-sky-400">{monthStats.runwayMonths.toFixed(1)} mo cash runway</span>
                )}
              </div>
            </div>
          </div>

          {/* Live Stock & RSU Market Pulse Callout */}
          {equityStats && (
            <div className="rounded-xl border border-sky-500/25 bg-sky-500/5 px-5 py-3.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <div className="flex items-center gap-2 font-semibold text-sky-200">
                    <Activity className="h-4 w-4 text-sky-400" />
                    <span>Live Stock & RSU Holdings</span>
                  </div>
                  <div className="font-mono text-zinc-100 tabular-nums">
                    Vested Value: <strong>{mask(formatCurrency(equityStats.vestedValue))}</strong>
                  </div>
                  <div
                    className={`font-mono text-xs tabular-nums ${
                      equityStats.dayChange >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    Today: {mask(formatCurrency(equityStats.dayChange, { showSign: true }))} (
                    {equityStats.dayPct >= 0 ? '+' : ''}
                    {formatPercent(equityStats.dayPct, 2)})
                  </div>
                  {equityStats.unvestedValue > 0 && (
                    <div className="font-mono text-zinc-400 tabular-nums">
                      Unvested RSU Pipeline: {mask(formatCurrency(equityStats.unvestedValue))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 text-[11px] text-zinc-400">
                  {lastQuotesSyncAt && (
                    <span>Synced {new Date(lastQuotesSyncAt).toLocaleTimeString()}</span>
                  )}
                  <button
                    type="button"
                    disabled={quotesRefreshing}
                    onClick={onRefreshQuotes}
                    className="inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/15 px-2.5 py-1 font-medium text-sky-200 hover:bg-sky-500/25 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3 w-3 ${quotesRefreshing ? 'animate-spin' : ''}`} />
                    {quotesRefreshing ? 'Refreshing…' : 'Refresh Prices'}
                  </button>
                </div>
              </div>

              <div className="mt-2.5 flex flex-wrap gap-2">
                {equityStats.tickers.map((t) => {
                  const pct =
                    t.prevClose > 0 ? ((t.price - t.prevClose) / t.prevClose) * 100 : 0;
                  return (
                    <span
                      key={t.symbol}
                      className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/90 px-2.5 py-1 font-mono text-[11px] text-zinc-300 tabular-nums"
                    >
                      <strong className="text-zinc-100">{t.symbol}</strong>
                      <span>
                        {t.shares.toLocaleString('en-US', { maximumFractionDigits: 3 })} sh @ $
                        {t.price.toFixed(2)}
                      </span>
                      <span className={pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {pct >= 0 ? '+' : ''}
                        {pct.toFixed(2)}%
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

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
                <h2 className="text-sm font-semibold text-zinc-100">
                  {scopeTitle} Net Worth Trajectory
                </h2>
                <p className="text-xs text-zinc-500">
                  Carry-forward historical snapshots + auto-refreshed stock & RSU market valuations
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
                      dataKey="investments"
                      name="Investments & RSUs"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      fillOpacity={0.1}
                      fill="#8b5cf6"
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

          {/* 6 Core Balance Pillars */}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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
              <div className="mt-3 text-xs font-medium text-zinc-400">Stocks, RSUs & Inv.</div>
              <div className="mt-1 font-mono text-lg font-semibold text-zinc-100 tabular-nums">
                {mask(formatCurrency(summary.investments))}
              </div>
              <div className="mt-1 text-[11px] text-zinc-500">
                {equityStats ? 'Auto-synced with live prices' : 'Brokerage, RSUs & equity'}
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigateTab('accounts', 'other_asset')}
              className="group rounded-xl border border-zinc-800/90 bg-zinc-950/70 p-4 text-left transition hover:border-teal-500/40"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400">
                  <Home className="h-4 w-4" />
                </div>
                <ArrowUpRight className="h-3.5 w-3.5 text-zinc-600 transition group-hover:text-teal-400" />
              </div>
              <div className="mt-3 text-xs font-medium text-zinc-400">Property, Gold & Cars</div>
              <div className="mt-1 font-mono text-lg font-semibold text-zinc-100 tabular-nums">
                {mask(formatCurrency(summary.otherAssets))}
              </div>
              <div className="mt-1 text-[11px] text-zinc-500">
                {(accounts || []).some((a) => !a.is_archived && ['gold', 'india_property'].includes(getRealAssetType(a)))
                  ? 'Live Gold & INR FX synced'
                  : 'House, Gold, India & Cars'}
              </div>
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
                  <div className="text-[11px] text-zinc-500">
                    {activePromos.length > 0 ? `${activePromos.length} promo transfer(s)` : 'Revolving balances'}
                  </div>
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
                {activeAccountsSorted.slice(0, 7).map((acc) => {
                  const ownerKey = acc.owner_profile || 'primary';
                  const ownerBadge = OWNER_PROFILES[ownerKey] || OWNER_PROFILES.primary;
                  return (
                    <div key={acc.id} className="flex items-center justify-between py-2.5 text-xs">
                      <div className="min-w-0 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-zinc-200">{acc.name}</span>
                          <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] ${ownerBadge.badgeClass}`}>
                            {getOwnerDisplayName(ownerKey, householdNames)}
                          </span>
                        </div>
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
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/80 p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">
                    {formatMonthLabel(curMonth)} Spending Pulse
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Needs {mask(formatCurrency(monthStats.essentialSpent))} • Wants{' '}
                    {mask(formatCurrency(monthStats.wantsSpent))}
                    {monthStats.creditsTotal > 0 && (
                      <span className="text-emerald-400">
                        {' '}
                        • −{mask(formatCurrency(monthStats.creditsTotal, { decimals: 0 }))} back
                      </span>
                    )}
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
                  {monthStats.topCategories.map(({ category: cat, net, credits }) => {
                    const pct =
                      net > 0 && monthStats.totalSpent > 0
                        ? (net / monthStats.totalSpent) * 100
                        : 0;
                    const color = CATEGORY_COLORS[cat] || '#10b981';
                    return (
                      <div key={cat}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="font-medium text-zinc-300">
                            {cat}
                            {credits > 0 && (
                              <span className="ml-1.5 text-[10px] font-normal text-emerald-400">
                                (−{mask(formatCurrency(credits, { decimals: 0 }))} back)
                              </span>
                            )}
                          </span>
                          <span className="font-mono text-zinc-200 tabular-nums">
                            {net < 0 ? (
                              <span className="text-emerald-300">
                                +{mask(formatCurrency(Math.abs(net)))} back
                              </span>
                            ) : (
                              <>
                                {mask(formatCurrency(net))}{' '}
                                <span className="text-[11px] text-zinc-500">
                                  ({formatPercent(pct, 0)})
                                </span>
                              </>
                            )}
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-900">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${net > 0 ? Math.min(100, Math.max(3, pct)) : 0}%`,
                              backgroundColor: color,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}

                  {monthStats.monthlyTakeHome > 0 && householdScope === 'combined' && (
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
        </>
      )}
    </div>
  );
}
