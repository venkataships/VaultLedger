import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Coins,
  Download,
  History,
  Layers,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { PAY_FREQUENCIES, formatCurrency, todayIsoDate, toNumber } from '../lib/finance';
import {
  DEFAULT_2027_401K_415C_CAP,
  DEFAULT_2027_401K_EMPLOYEE_CAP,
  computeEsppPurchasePreview,
  computePendingPayrollBatch,
  createDefaultAutoSyncRule,
  daysBetweenIso,
  evaluateEsppPurchaseSchedule,
  executeEsppPurchase,
  executePayrollSyncBatch,
  formatShortDate,
  getDefaultAnnualEsppCashCap,
  getNextPaydate,
  resolveRulePerCheckAmounts,
  seedExisting401kBalanceIntoTickers,
} from '../lib/payrollSync';

const ALLOC_PRESETS = [
  { label: '100% VFIAX', rows: [{ symbol: 'VFIAX', pct: '100', label: 'Vanguard 500 Index' }] },
  { label: '100% VOO', rows: [{ symbol: 'VOO', pct: '100', label: 'Vanguard S&P 500 ETF' }] },
  { label: '100% FXAIX', rows: [{ symbol: 'FXAIX', pct: '100', label: 'Fidelity 500 Index' }] },
  {
    label: '80/20 VTI/VXUS',
    rows: [
      { symbol: 'VTI', pct: '80', label: 'Total US Market' },
      { symbol: 'VXUS', pct: '20', label: 'Total International' },
    ],
  },
];

const ESPP_DATE_PRESETS = [
  { label: 'Jun 30 & Dec 31', dates: ['06-30', '12-31'] },
  { label: 'May 31 & Nov 30', dates: ['05-31', '11-30'] },
  { label: 'Apr 30 & Oct 31', dates: ['04-30', '10-31'] },
  { label: 'Feb 28 & Aug 31', dates: ['02-28', '08-31'] },
];

function format401kBreakdown(emp, match, mbdr, mask) {
  const parts = [];
  if (emp > 0) parts.push(`Emp ${mask(formatCurrency(emp, { decimals: 0 }))}`);
  if (match > 0) parts.push(`Match ${mask(formatCurrency(match, { decimals: 0 }))}`);
  if (mbdr > 0) parts.push(`MBDR ${mask(formatCurrency(mbdr, { decimals: 0 }))}`);
  return parts.length > 0 ? parts.join(' + ') : '$0';
}

export default function PayrollAutoSyncPanel({
  supabase,
  session,
  taxProfile,
  profileForm,
  setProfileForm,
  setIsDirty,
  isDirty,
  accounts = [],
  equityHoldings = [],
  householdNames,
  mask,
  onDataChanged,
}) {
  const autosync = profileForm.paystub_details.payroll_autosync || { rules: [], history: [] };
  const rules = autosync.rules || [];
  const history = autosync.history || [];

  const activeAssetAccounts = useMemo(
    () => (accounts || []).filter((a) => !a.is_archived && !a.is_liability),
    [accounts]
  );

  const holdingsCountByAccount = useMemo(() => {
    const map = new Map();
    for (const h of equityHoldings || []) {
      map.set(Number(h.account_id), (map.get(Number(h.account_id)) || 0) + 1);
    }
    return map;
  }, [equityHoldings]);

  const ownerName = (owner) =>
    owner === 'spouse' ? householdNames.spouse_name : householdNames.primary_name;

  const today = todayIsoDate();

  // Live due batch (for real posting when a payday or ESPP purchase date is due today)
  const liveBatch = useMemo(
    () => computePendingPayrollBatch(autosync, profileForm, accounts, today),
    [autosync, profileForm, accounts, today]
  );

  // Collapsible card & advanced-settings state (rules start compact; newly added rules auto-expand)
  const [expandedRuleIds, setExpandedRuleIds] = useState(() => new Set());
  const [advancedRuleIds, setAdvancedRuleIds] = useState(() => new Set());

  // Per-rule overrides & skip toggles in the Due Sync Queue
  const [overridesByRuleId, setOverridesByRuleId] = useState({});
  const [skippedRuleIds, setSkippedRuleIds] = useState(() => new Set());
  const [postingBatch, setPostingBatch] = useState(false);
  const [syncNotice, setSyncNotice] = useState('');
  const [syncError, setSyncError] = useState('');

  // Live quote check cache for ticker verification
  const [verifiedQuotes, setVerifiedQuotes] = useState({});
  const [verifyingRuleId, setVerifyingRuleId] = useState('');

  // Seeding existing flat 401(k) balance confirmation
  const [confirmSeedRuleId, setConfirmSeedRuleId] = useState('');
  const [seedingRuleId, setSeedingRuleId] = useState('');

  // ESPP Purchase converter drawer state
  const [purchaseModalRuleId, setPurchaseModalRuleId] = useState('');
  const [purchaseForm, setPurchaseForm] = useState({
    purchaseDate: today,
    cashAvailable: '',
    marketPrice: '',
    offeringStartPrice: '',
    discountPct: '15',
    hasLookback: true,
    allowFractionalShares: false,
  });
  const [loadingEsppPrice, setLoadingEsppPrice] = useState(false);
  const [executingPurchase, setExecutingPurchase] = useState(false);

  // 2027 Dry-Run Simulator state (default to full year Dec 31, 2027)
  const [simDate, setSimDate] = useState('2027-12-31');
  const [simOpen, setSimOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);

  const simBatch = useMemo(
    () => computePendingPayrollBatch(autosync, profileForm, accounts, simDate),
    [autosync, profileForm, accounts, simDate]
  );

  // Summary strip totals across enabled rules
  const summaryStats = useMemo(() => {
    let projected401k = 0;
    let projected401kEmp = 0;
    let projected401kMatch = 0;
    let projected401kMbdr = 0;
    let projectedEsppNew = 0;
    let esppPurchaseCount = 0;

    for (const item of simBatch.dueItems) {
      if (item.type === '401k') {
        projected401k += item.totalAmount;
        projected401kEmp += item.totalEmployee;
        projected401kMatch += item.totalMatch;
        projected401kMbdr += item.totalAfterTax;
      } else {
        projectedEsppNew += item.totalAmount;
        esppPurchaseCount += (item.simulatedPurchaseEvents || []).length;
      }
    }

    let earliestNext = '';
    for (const r of rules) {
      if (!r.enabled) continue;
      const np = getNextPaydate(r, today);
      if (np && (!earliestNext || np < earliestNext)) earliestNext = np;
    }

    return {
      enabledCount: rules.filter((r) => r.enabled).length,
      projected401k,
      projected401kEmp,
      projected401kMatch,
      projected401kMbdr,
      projectedEsppNew,
      esppPurchaseCount,
      totalProjected: projected401k + projectedEsppNew,
      earliestNext,
      daysUntilNext: earliestNext ? daysBetweenIso(today, earliestNext) : null,
    };
  }, [simBatch, rules, today]);

  const toggleExpanded = (ruleId) => {
    setExpandedRuleIds((prev) => {
      const next = new Set(prev);
      if (next.has(ruleId)) next.delete(ruleId);
      else next.add(ruleId);
      return next;
    });
  };

  const toggleAdvanced = (ruleId) => {
    setAdvancedRuleIds((prev) => {
      const next = new Set(prev);
      if (next.has(ruleId)) next.delete(ruleId);
      else next.add(ruleId);
      return next;
    });
  };

  const updateRules = (updater) => {
    setIsDirty(true);
    setProfileForm((prev) => {
      const prevSync = prev.paystub_details.payroll_autosync || { rules: [], history: [] };
      const nextRules = typeof updater === 'function' ? updater(prevSync.rules || []) : updater;
      return {
        ...prev,
        paystub_details: {
          ...prev.paystub_details,
          payroll_autosync: {
            ...prevSync,
            rules: nextRules,
          },
        },
      };
    });
  };

  const updateOneRule = (ruleId, patch) => {
    updateRules((prevRules) =>
      prevRules.map((r) => (r.id === ruleId ? { ...r, ...patch } : r))
    );
  };

  const deleteRule = (ruleId) => {
    updateRules((prevRules) => prevRules.filter((r) => r.id !== ruleId));
    setExpandedRuleIds((prev) => {
      const next = new Set(prev);
      next.delete(ruleId);
      return next;
    });
  };

  const pickBestAccountId = (type, owner) => {
    const owned = activeAssetAccounts.filter((a) => a.owner_profile === owner);
    const pool = owned.length > 0 ? owned : activeAssetAccounts;
    if (type === '401k') {
      const hit =
        pool.find((a) => a.category === 'retirement_401k' && /401/i.test(`${a.name} ${a.subtype}`)) ||
        pool.find((a) => a.category === 'retirement_401k');
      return hit ? hit.id : null;
    }
    const hit =
      pool.find((a) => /espp/i.test(`${a.name} ${a.subtype}`)) ||
      pool.find((a) => a.category === 'investment');
    return hit ? hit.id : null;
  };

  const handleAddPresetRule = (type, owner) => {
    setSyncError('');
    setSyncNotice('');
    const stub = profileForm.paystub_details?.[owner] || {};
    const freq = stub.pay_frequency || 'biweekly';
    const periods = PAY_FREQUENCIES[freq]?.periods || 26;
    const accountId = pickBestAccountId(type, owner);
    const linkedAcc = activeAssetAccounts.find((a) => Number(a.id) === Number(accountId));
    const labelName = ownerName(owner);

    if (type === 'espp') {
      const esppPerCheck = toNumber(stub.espp_per_check);
      const disc = toNumber(stub.espp_discount_pct) || 15;
      const newRule = createDefaultAutoSyncRule('espp', owner, {
        label: `${labelName} ESPP Auto-Accrual (2027)`,
        account_id: accountId,
        pay_frequency: freq,
        start_date: '2027-01-08',
        amount_mode: esppPerCheck > 0 ? 'dollar' : 'pct_base',
        espp_per_check: esppPerCheck > 0 ? String(esppPerCheck) : '',
        espp_pct_of_base: '10',
        discount_pct: String(disc),
        annual_cash_cap: String(getDefaultAnnualEsppCashCap(disc)),
        has_lookback: true,
        allow_fractional_shares: false,
        purchase_months_days: ['06-30', '12-31'],
      });
      updateRules((prev) => [...prev, newRule]);
      setExpandedRuleIds((prev) => new Set(prev).add(newRule.id));
    } else {
      const rawEmpCheck = Number(
        (toNumber(stub.trad_401k_per_check) + toNumber(stub.roth_401k_per_check)).toFixed(2)
      );
      const ytd401k =
        owner === 'spouse'
          ? toNumber(profileForm.spouse_401k_ytd)
          : toNumber(profileForm.primary_401k_ytd);

      // Avoid copying a maxed-out late-year residual (e.g., $50/check) into next year's schedule
      const looksCappedResidual = rawEmpCheck * periods < 5000 && ytd401k >= 18000;
      const empCheck =
        rawEmpCheck > 0 && !looksCappedResidual
          ? rawEmpCheck
          : Number((DEFAULT_2027_401K_EMPLOYEE_CAP / periods).toFixed(2));

      const afterTaxCheck = toNumber(stub.after_tax_401k_per_check);
      let matchCheck =
        toNumber(stub.employer_401k_match_annual) > 0
          ? Number((toNumber(stub.employer_401k_match_annual) / periods).toFixed(2))
          : 0;
      // If employer match equals 50% of 2026 $24,500 cap ($12,250), bump to 50% of 2027 $25,500 cap ($12,750)
      if (matchCheck > 0 && Math.abs(matchCheck * periods - 12250) < 25) {
        matchCheck = Number(((DEFAULT_2027_401K_EMPLOYEE_CAP * 0.5) / periods).toFixed(2));
      }

      const isVanguard = /vanguard/i.test(`${linkedAcc?.name || ''} ${linkedAcc?.institution || ''}`);
      const defaultAlloc = isVanguard
        ? [{ symbol: 'VFIAX', pct: '100', label: 'Vanguard 500 Index (edit to match fund)' }]
        : [{ symbol: 'FXAIX', pct: '100', label: 'S&P 500 Index (edit to match fund)' }];

      const newRule = createDefaultAutoSyncRule('401k', owner, {
        label: `${labelName} 401(k) Auto-Invest (2027)`,
        account_id: accountId,
        pay_frequency: freq,
        start_date: '2027-01-08',
        amount_mode: 'dollar',
        employee_per_check: String(empCheck),
        after_tax_per_check: afterTaxCheck > 0 ? String(afterTaxCheck) : '',
        employer_match_per_check: matchCheck > 0 ? String(matchCheck) : '',
        annual_employee_cap: String(DEFAULT_2027_401K_EMPLOYEE_CAP),
        annual_415c_cap: String(DEFAULT_2027_401K_415C_CAP),
        allocations: defaultAlloc,
      });
      updateRules((prev) => [...prev, newRule]);
      setExpandedRuleIds((prev) => new Set(prev).add(newRule.id));
    }
  };

  const handleMax2027 = (rule, includeMbdr = false) => {
    const periods = PAY_FREQUENCIES[rule.pay_frequency]?.periods || 26;
    const empCap = DEFAULT_2027_401K_EMPLOYEE_CAP; // $25,500 (IRS Notice 2026-66)
    const totalCap = DEFAULT_2027_401K_415C_CAP; // $75,000
    const empPerCheck = Number((empCap / periods).toFixed(2));

    let matchPerCheck = Math.max(0, toNumber(rule.employer_match_per_check));
    // Auto-adjust 2026 50% match ($12,250/yr) -> 2027 50% match ($12,750/yr)
    if (matchPerCheck > 0 && Math.abs(matchPerCheck * periods - 12250) < 25) {
      matchPerCheck = Number(((empCap * 0.5) / periods).toFixed(2));
    }

    const patch = {
      amount_mode: 'dollar',
      employee_per_check: String(empPerCheck),
      employer_match_per_check: matchPerCheck > 0 ? String(matchPerCheck) : rule.employer_match_per_check,
      annual_employee_cap: String(empCap),
      annual_415c_cap: String(totalCap),
    };

    if (includeMbdr) {
      const annualMatch = matchPerCheck * periods;
      const mbdrRoom = Math.max(0, totalCap - empCap - annualMatch);
      patch.after_tax_per_check = String(Number((mbdrRoom / periods).toFixed(2)));
    }

    updateOneRule(rule.id, patch);
  };

  const handlePullFromPaystub = (rule) => {
    const stub = profileForm.paystub_details?.[rule.owner] || {};
    const freq = stub.pay_frequency || rule.pay_frequency || 'biweekly';
    const periods = PAY_FREQUENCIES[freq]?.periods || 26;

    if (rule.type === 'espp') {
      const disc = toNumber(stub.espp_discount_pct) || 15;
      const amt = toNumber(stub.espp_per_check);
      updateOneRule(rule.id, {
        pay_frequency: freq,
        amount_mode: amt > 0 ? 'dollar' : rule.amount_mode,
        espp_per_check: amt > 0 ? String(amt) : rule.espp_per_check,
        discount_pct: String(disc),
        annual_cash_cap: String(getDefaultAnnualEsppCashCap(disc)),
      });
    } else {
      const empCheck = Number(
        (toNumber(stub.trad_401k_per_check) + toNumber(stub.roth_401k_per_check)).toFixed(2)
      );
      const afterTaxCheck = toNumber(stub.after_tax_401k_per_check);
      const matchCheck =
        toNumber(stub.employer_401k_match_annual) > 0
          ? Number((toNumber(stub.employer_401k_match_annual) / periods).toFixed(2))
          : 0;
      updateOneRule(rule.id, {
        pay_frequency: freq,
        amount_mode: 'dollar',
        employee_per_check: empCheck > 0 ? String(empCheck) : rule.employee_per_check,
        after_tax_per_check: afterTaxCheck > 0 ? String(afterTaxCheck) : rule.after_tax_per_check,
        employer_match_per_check:
          matchCheck > 0 ? String(matchCheck) : rule.employer_match_per_check,
      });
    }
  };

  const handleVerifyTickers = async (ruleId, symbols) => {
    const cleaned = Array.from(
      new Set((symbols || []).map((s) => String(s || '').trim().toUpperCase()).filter(Boolean))
    );
    if (cleaned.length === 0) return;
    setVerifyingRuleId(ruleId);
    setSyncError('');
    try {
      const { data, error } = await supabase.functions.invoke('stock-quotes', {
        body: { symbols: cleaned },
      });
      if (error) throw error;
      const quotes = data?.quotes || {};
      setVerifiedQuotes((prev) => {
        const next = { ...prev };
        for (const sym of cleaned) {
          next[sym] = quotes[sym] ? { ok: true, ...quotes[sym] } : { ok: false };
        }
        return next;
      });
    } catch (err) {
      setSyncError(err?.message || 'Failed to verify tickers via live quotes.');
    } finally {
      setVerifyingRuleId('');
    }
  };

  const handleSeedExistingBalance = async (rule) => {
    setSeedingRuleId(rule.id);
    setSyncError('');
    setSyncNotice('');
    try {
      const res = await seedExisting401kBalanceIntoTickers({
        supabase,
        userId: session.user.id,
        accountId: rule.account_id,
        allocations: rule.allocations,
      });
      setConfirmSeedRuleId('');
      setSyncNotice(
        `Allocated ${formatCurrency(res.allocatedDollars)} into target tickers on ${rule.label}. Live quotes will now move your full 401(k) balance.`
      );
      if (onDataChanged) await onDataChanged();
    } catch (err) {
      setSyncError(err?.message || 'Failed to allocate existing 401(k) balance.');
    } finally {
      setSeedingRuleId('');
    }
  };

  const handlePostDueBatch = async () => {
    if (isDirty) {
      setSyncError(
        'Please click "Save Paystub & Tax Profile" below first so your latest rule edits are saved before posting.'
      );
      return;
    }
    if (liveBatch.dueItems.length === 0) return;

    setPostingBatch(true);
    setSyncError('');
    setSyncNotice('');
    try {
      const result = await executePayrollSyncBatch({
        supabase,
        userId: session.user.id,
        taxProfile,
        dueItems: liveBatch.dueItems,
        overridesByRuleId,
        skippedRuleIds,
      });
      setOverridesByRuleId({});
      setSkippedRuleIds(new Set());
      const warnSuffix = result.warnings.length > 0 ? ` Note: ${result.warnings.join(' ')}` : '';
      setSyncNotice(
        `Synced ${result.postedCount} payroll rule${result.postedCount === 1 ? '' : 's'} (+${formatCurrency(result.totalPostedDollars)})${
          result.skippedCount > 0 ? `, skipped ${result.skippedCount}` : ''
        }.${warnSuffix}`
      );
      if (onDataChanged) await onDataChanged();
    } catch (err) {
      setSyncError(err?.message || 'Failed to post payroll auto-sync.');
    } finally {
      setPostingBatch(false);
    }
  };

  const openEsppPurchaseConverter = async (rule, defaultDate = today) => {
    setExpandedRuleIds((prev) => new Set(prev).add(rule.id));
    setPurchaseModalRuleId(rule.id);
    setSyncError('');
    setSyncNotice('');
    const sym = String(rule.symbol || '').trim().toUpperCase();
    const initialCash = toNumber(rule.accrued_cash);
    setPurchaseForm({
      purchaseDate: defaultDate,
      cashAvailable: initialCash > 0 ? String(initialCash) : '',
      marketPrice: verifiedQuotes[sym]?.ok ? String(verifiedQuotes[sym].price) : '',
      offeringStartPrice:
        toNumber(rule.offering_start_price) > 0 ? String(rule.offering_start_price) : '',
      discountPct: String(toNumber(rule.discount_pct) || 15),
      hasLookback: Boolean(rule.has_lookback),
      allowFractionalShares: Boolean(rule.allow_fractional_shares),
    });

    if (sym) {
      setLoadingEsppPrice(true);
      try {
        const { data } = await supabase.functions.invoke('stock-quotes', {
          body: { symbols: [sym] },
        });
        const liveP = Number(data?.quotes?.[sym]?.price);
        if (Number.isFinite(liveP) && liveP > 0) {
          setPurchaseForm((prev) => ({ ...prev, marketPrice: String(liveP) }));
        }
      } catch {
        // User can still enter price manually
      } finally {
        setLoadingEsppPrice(false);
      }
    }
  };

  const handleConfirmEsppPurchase = async (rule) => {
    if (isDirty) {
      setSyncError('Please save your rule edits below before executing an ESPP purchase.');
      return;
    }
    setExecutingPurchase(true);
    setSyncError('');
    setSyncNotice('');
    try {
      const res = await executeEsppPurchase({
        supabase,
        userId: session.user.id,
        taxProfile,
        ruleId: rule.id,
        purchaseDate: purchaseForm.purchaseDate,
        cashAvailable: toNumber(purchaseForm.cashAvailable),
        marketPrice: toNumber(purchaseForm.marketPrice),
        offeringStartPrice: toNumber(purchaseForm.offeringStartPrice),
        discountPct: toNumber(purchaseForm.discountPct),
        hasLookback: Boolean(purchaseForm.hasLookback),
        allowFractionalShares: Boolean(purchaseForm.allowFractionalShares),
      });
      setPurchaseModalRuleId('');
      setSyncNotice(
        `ESPP Purchase executed: +${res.preview.sharesBought} ${rule.symbol} @ ${formatCurrency(
          res.preview.effectiveBuyPrice
        )} (+${formatCurrency(res.preview.instantDiscountGain, { decimals: 0 })} discount gain; ${formatCurrency(
          res.preview.cashRemainder
        )} remainder carried forward).`
      );
      if (onDataChanged) await onDataChanged();
    } catch (err) {
      setSyncError(err?.message || 'Failed to execute ESPP purchase.');
    } finally {
      setExecutingPurchase(false);
    }
  };

  const purchasePreview = useMemo(
    () =>
      computeEsppPurchasePreview({
        cashAvailable: purchaseForm.cashAvailable,
        marketPrice: purchaseForm.marketPrice,
        offeringStartPrice: purchaseForm.offeringStartPrice,
        discountPct: purchaseForm.discountPct,
        hasLookback: purchaseForm.hasLookback,
        allowFractionalShares: purchaseForm.allowFractionalShares,
      }),
    [purchaseForm]
  );

  return (
    <div className="space-y-4">
      {/* Compact Header & Quick-Add Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-500/25 bg-cyan-500/5 px-4 py-3">
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-cyan-200">
            <CalendarClock className="h-4 w-4 text-cyan-400" />
            <span>Payroll Auto-Sync (2027+)</span>
            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] font-normal text-cyan-300">
              2027 IRS Caps: $25.5k / $75k
            </span>
          </div>
          <p className="text-[11px] text-zinc-400">
            Tracks future 401(k) & ESPP paychecks — never edits balances until you review & click Post.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleAddPresetRule('401k', 'primary')}
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/35 bg-emerald-500/15 px-2.5 py-1.5 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/25"
          >
            <Plus className="h-3.5 w-3.5" />
            {householdNames.primary_name} 401(k)
          </button>
          <button
            type="button"
            onClick={() => handleAddPresetRule('401k', 'spouse')}
            className="inline-flex items-center gap-1 rounded-lg border border-sky-500/35 bg-sky-500/15 px-2.5 py-1.5 text-[11px] font-medium text-sky-200 hover:bg-sky-500/25"
          >
            <Plus className="h-3.5 w-3.5" />
            {householdNames.spouse_name} 401(k)
          </button>
          <button
            type="button"
            onClick={() => handleAddPresetRule('espp', 'spouse')}
            className="inline-flex items-center gap-1 rounded-lg border border-fuchsia-500/35 bg-fuchsia-500/15 px-2.5 py-1.5 text-[11px] font-medium text-fuchsia-200 hover:bg-fuchsia-500/25"
          >
            <Plus className="h-3.5 w-3.5" />
            {householdNames.spouse_name} ESPP
          </button>
        </div>
      </div>

      {/* Compact 3-Tile Projection Strip */}
      {rules.length > 0 && (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-800/90 bg-zinc-900/40 px-3.5 py-2.5">
            <div className="text-[10px] text-zinc-400">
              Projected 401(k) through {formatShortDate(simDate)}
            </div>
            <div className="mt-0.5 font-mono text-base font-semibold text-emerald-300 tabular-nums">
              +{mask(formatCurrency(summaryStats.projected401k, { decimals: 0 }))}
            </div>
            <div className="mt-0.5 text-[10px] text-zinc-500 tabular-nums">
              {format401kBreakdown(
                summaryStats.projected401kEmp,
                summaryStats.projected401kMatch,
                summaryStats.projected401kMbdr,
                mask
              )}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800/90 bg-zinc-900/40 px-3.5 py-2.5">
            <div className="text-[10px] text-zinc-400">
              Projected ESPP Payroll through {formatShortDate(simDate)}
            </div>
            <div className="mt-0.5 font-mono text-base font-semibold text-fuchsia-300 tabular-nums">
              +{mask(formatCurrency(summaryStats.projectedEsppNew, { decimals: 0 }))}
            </div>
            <div className="mt-0.5 text-[10px] text-zinc-500 tabular-nums">
              {summaryStats.esppPurchaseCount > 0
                ? `${summaryStats.esppPurchaseCount} scheduled stock purchase${
                    summaryStats.esppPurchaseCount === 1 ? '' : 's'
                  }`
                : 'No ESPP purchases in window'}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800/90 bg-zinc-900/40 px-3.5 py-2.5">
            <div className="text-[10px] text-zinc-400">Sync Status ({summaryStats.enabledCount} active)</div>
            <div className="mt-0.5 font-mono text-base font-semibold text-zinc-100 tabular-nums">
              {liveBatch.hasDueActions ? (
                <span className="text-amber-300">
                  {liveBatch.totalDuePaydays} Due Now
                </span>
              ) : summaryStats.earliestNext ? (
                formatShortDate(summaryStats.earliestNext)
              ) : (
                'Paused'
              )}
            </div>
            <div className="mt-0.5 text-[10px] text-zinc-500">
              {liveBatch.hasDueActions
                ? 'Review & click Post below'
                : summaryStats.daysUntilNext !== null && summaryStats.daysUntilNext > 0
                ? `Next paycheck sync in ${summaryStats.daysUntilNext} days`
                : 'Up to date'}
            </div>
          </div>
        </div>
      )}

      {syncError && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-500/35 bg-rose-500/10 p-3 text-[11px] text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{syncError}</span>
        </div>
      )}
      {syncNotice && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-3 text-[11px] text-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <span>{syncNotice}</span>
        </div>
      )}

      {/* LIVE DUE SYNC QUEUE (Only renders when paydays or ESPP purchases are due today) */}
      {liveBatch.hasDueActions && (
        <div className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-200">
                <RefreshCw className="h-4 w-4 text-amber-300" />
                Ready to Sync ({liveBatch.totalDuePaydays} due pay period
                {liveBatch.totalDuePaydays === 1 ? '' : 's'}
                {liveBatch.dueEsppPurchases.length > 0
                  ? ` • ${liveBatch.dueEsppPurchases.length} ESPP purchase due`
                  : ''}
                )
              </div>
              <p className="text-[11px] text-amber-100/80">
                Review amounts below — override a dollar amount or click Skip (e.g., parental leave) before posting.
              </p>
            </div>
            {liveBatch.dueItems.length > 0 && (
              <button
                type="button"
                disabled={postingBatch}
                onClick={handlePostDueBatch}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3.5 py-2 text-xs font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
              >
                <Play className="h-3.5 w-3.5" />
                {postingBatch ? 'Posting & Buying Shares…' : 'Post Selected to Accounts'}
              </button>
            )}
          </div>

          {liveBatch.dueItems.length > 0 && (
            <div className="space-y-2">
              {liveBatch.dueItems.map((item) => {
                const isSkipped = skippedRuleIds.has(item.ruleId);
                const overrideVal = overridesByRuleId[item.ruleId] ?? '';
                return (
                  <div
                    key={item.ruleId}
                    className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-[11px] ${
                      isSkipped
                        ? 'border-zinc-700 bg-zinc-950/60 opacity-60'
                        : 'border-amber-500/30 bg-zinc-950/80'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2 font-semibold text-zinc-100">
                        <span>{item.rule.label}</span>
                        <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] font-normal text-zinc-300">
                          → {item.account.name}
                        </span>
                      </div>
                      <div className="text-[10px] text-zinc-400">
                        Paydates:{' '}
                        <span className="font-mono text-zinc-300">
                          {item.paydates.map(formatShortDate).join(', ')}
                        </span>
                        {item.type === '401k' && (
                          <span>
                            {' '}
                            • {format401kBreakdown(item.totalEmployee, item.totalMatch, item.totalAfterTax, mask)}
                          </span>
                        )}
                        {item.hitEmpCap && (
                          <span className="ml-1.5 rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-300">
                            Capped at IRS limit
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <label className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                        <span>Amount ($):</span>
                        <input
                          type="number"
                          min="0"
                          step="10"
                          disabled={isSkipped}
                          placeholder={String(item.totalAmount)}
                          value={overrideVal}
                          onChange={(e) =>
                            setOverridesByRuleId((prev) => ({
                              ...prev,
                              [item.ruleId]: e.target.value,
                            }))
                          }
                          className="w-24 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100 disabled:opacity-40"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setSkippedRuleIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(item.ruleId)) next.delete(item.ruleId);
                            else next.add(item.ruleId);
                            return next;
                          })
                        }
                        className={`rounded-md border px-2 py-1 text-[10px] font-medium ${
                          isSkipped
                            ? 'border-amber-500/40 bg-amber-500/15 text-amber-200'
                            : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {isSkipped ? 'Skipped (Undo)' : 'Skip (Leave)'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {liveBatch.dueEsppPurchases.length > 0 && (
            <div className="space-y-2 border-t border-amber-500/20 pt-2.5">
              {liveBatch.dueEsppPurchases.map((p) => (
                <div
                  key={p.ruleId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-fuchsia-500/35 bg-fuchsia-500/10 px-3 py-2 text-[11px]"
                >
                  <div>
                    <span className="font-semibold text-fuchsia-200">
                      ESPP Purchase Ready ({p.rule.symbol || 'Set Ticker'}):
                    </span>{' '}
                    <span className="text-zinc-200">
                      {formatShortDate(p.purchaseDate)} • Pool{' '}
                      <strong className="font-mono">{mask(formatCurrency(p.availableCash))}</strong>
                    </span>
                    {p.needsPaycheckSyncFirst && (
                      <span className="ml-2 text-[10px] text-amber-200">
                        (Post due paychecks above first to include latest accrual)
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => openEsppPurchaseConverter(p.rule, p.purchaseDate)}
                    className="inline-flex items-center gap-1 rounded-lg bg-fuchsia-500 px-3 py-1.5 text-[11px] font-semibold text-zinc-950 hover:bg-fuchsia-400"
                  >
                    <ShoppingBag className="h-3.5 w-3.5" />
                    Convert Cash → Shares
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* EMPTY STATE */}
      {rules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/25 p-6 text-center space-y-2.5">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
            <Layers className="h-5 w-5" />
          </div>
          <div className="text-xs font-semibold text-zinc-200">
            No 401(k) or ESPP Auto-Sync Schedules Yet
          </div>
          <p className="mx-auto max-w-xl text-[11px] text-zinc-400">
            Click a button above to set up automatic 2027 401(k) investing (with 1-click $25.5k / $75k IRS max presets) or ESPP accrual.
          </p>
        </div>
      ) : (
        /* CLEAN COLLAPSIBLE RULE CARDS */
        <div className="space-y-3">
          {rules.map((rule) => {
            const isEspp = rule.type === 'espp';
            const isExpanded = expandedRuleIds.has(rule.id) || purchaseModalRuleId === rule.id;
            const isAdvancedOpen = advancedRuleIds.has(rule.id);
            const linkedAcc = activeAssetAccounts.find(
              (a) => Number(a.id) === Number(rule.account_id)
            );
            const linkedHoldingCount = linkedAcc
              ? holdingsCountByAccount.get(Number(linkedAcc.id)) || 0
              : 0;
            const perCheck = resolveRulePerCheckAmounts(rule, profileForm);
            const nextPd = getNextPaydate(rule, today);
            const daysUntilNext = nextPd ? daysBetweenIso(today, nextPd) : null;
            const esppSched = isEspp ? evaluateEsppPurchaseSchedule(rule, today) : null;
            const allocSum = !isEspp
              ? Number(
                  (rule.allocations || []).reduce((s, a) => s + toNumber(a.pct), 0).toFixed(2)
                )
              : 0;
            const hasAllocs = !isEspp && (rule.allocations || []).length > 0;
            const allocValid = !hasAllocs || Math.abs(allocSum - 100) <= 0.5;
            const accentBorder = isEspp
              ? 'border-fuchsia-500/30'
              : rule.owner === 'spouse'
              ? 'border-sky-500/30'
              : 'border-emerald-500/30';

            const unallocatedDollars =
              !isEspp && linkedAcc
                ? linkedHoldingCount === 0
                  ? toNumber(linkedAcc.current_balance)
                  : toNumber(linkedAcc.cash_balance)
                : 0;

            const annualEmp = perCheck.employeePerCheck * perCheck.periods;
            const annualMatch = perCheck.employerMatchPerCheck * perCheck.periods;
            const annualMbdr = perCheck.afterTaxPerCheck * perCheck.periods;
            const empCap = toNumber(rule.annual_employee_cap) || DEFAULT_2027_401K_EMPLOYEE_CAP;
            const cap415c = toNumber(rule.annual_415c_cap) || DEFAULT_2027_401K_415C_CAP;
            const cappedAnnualEmp = Math.min(annualEmp, empCap);
            const cappedAnnualTotal = Math.min(
              cappedAnnualEmp + annualMatch + annualMbdr,
              cap415c
            );
            const remaining415cRoom = Math.max(0, cap415c - cappedAnnualTotal);
            const looksLowEmp = !isEspp && perCheck.employeePerCheck > 0 && annualEmp < 5000;
            const freqShort = PAY_FREQUENCIES[rule.pay_frequency]?.label?.split(' ')[0] || 'Bi-Weekly';

            return (
              <div
                key={rule.id}
                className={`rounded-xl border ${accentBorder} bg-zinc-900/40 transition ${
                  rule.enabled ? '' : 'opacity-65'
                }`}
              >
                {/* ALWAYS-VISIBLE COMPACT SUMMARY HEADER */}
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex cursor-pointer items-center">
                        <input
                          type="checkbox"
                          checked={Boolean(rule.enabled)}
                          onChange={(e) => updateOneRule(rule.id, { enabled: e.target.checked })}
                          className="h-3.5 w-3.5 rounded border-zinc-700 bg-zinc-950 text-emerald-500"
                        />
                        <span className="sr-only">Enable rule</span>
                      </label>
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase ${
                          isEspp
                            ? 'bg-fuchsia-500/20 text-fuchsia-200'
                            : rule.owner === 'spouse'
                            ? 'bg-sky-500/20 text-sky-200'
                            : 'bg-emerald-500/20 text-emerald-200'
                        }`}
                      >
                        {isEspp ? 'ESPP' : '401(k)'}
                      </span>
                      <span className="text-xs font-semibold text-zinc-100">{rule.label}</span>
                      <span className="text-[11px] text-zinc-400">
                        → {linkedAcc ? linkedAcc.name : 'Select account'}
                      </span>
                      {looksLowEmp && (
                        <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-200">
                          Low 2027 rate — click Edit to Max
                        </span>
                      )}
                      {!linkedAcc && (
                        <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-200">
                          Account needed
                        </span>
                      )}
                    </div>

                    {/* Single scannable metrics line */}
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-zinc-400 tabular-nums">
                      <span>{freqShort}</span>
                      <span>•</span>
                      {!isEspp ? (
                        <>
                          <span className="font-mono font-medium text-zinc-200">
                            {mask(formatCurrency(perCheck.totalPerCheck))}/chk
                          </span>
                          <span>
                            (Est.{' '}
                            <strong className="font-mono text-emerald-300">
                              {mask(formatCurrency(cappedAnnualTotal, { decimals: 0 }))}/yr
                            </strong>
                            : {format401kBreakdown(cappedAnnualEmp, annualMatch, annualMbdr, mask)})
                          </span>
                          {hasAllocs && (
                            <>
                              <span>•</span>
                              <span className="font-mono text-[10px] text-zinc-300">
                                {(rule.allocations || [])
                                  .filter((a) => a.symbol)
                                  .map((a) => `${a.symbol} ${a.pct}%`)
                                  .join(', ')}
                              </span>
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="font-mono font-medium text-fuchsia-200">
                            {rule.amount_mode === 'pct_base'
                              ? `${rule.espp_pct_of_base || 0}% (${mask(
                                  formatCurrency(perCheck.esppPerCheck)
                                )}/chk)`
                              : `${mask(formatCurrency(perCheck.esppPerCheck))}/chk`}
                          </span>
                          <span>•</span>
                          <span>
                            Pool:{' '}
                            <strong className="font-mono text-zinc-200">
                              {mask(formatCurrency(rule.accrued_cash))}
                            </strong>
                          </span>
                          {esppSched?.nextPurchaseDate && (
                            <>
                              <span>•</span>
                              <span>
                                Next Buy:{' '}
                                <strong className="font-mono text-zinc-200">
                                  {formatShortDate(esppSched.nextPurchaseDate)}
                                </strong>
                              </span>
                            </>
                          )}
                          {rule.symbol && (
                            <>
                              <span>•</span>
                              <span className="font-mono text-zinc-200">{rule.symbol}</span>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right Actions */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {nextPd && (
                      <span className="rounded-full border border-zinc-700 bg-zinc-950 px-2.5 py-1 font-mono text-[10px] text-zinc-300">
                        Next: {formatShortDate(nextPd)}
                        {daysUntilNext !== null && daysUntilNext > 0 ? ` (${daysUntilNext}d)` : ''}
                      </span>
                    )}
                    {isEspp && (
                      <button
                        type="button"
                        onClick={() => openEsppPurchaseConverter(rule, today)}
                        className="inline-flex items-center gap-1 rounded-lg border border-fuchsia-500/40 bg-fuchsia-500/15 px-2.5 py-1 text-[10px] font-semibold text-fuchsia-200 hover:bg-fuchsia-500/25"
                      >
                        <ShoppingBag className="h-3 w-3" />
                        Buy Shares
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleExpanded(rule.id)}
                      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
                        isExpanded
                          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                          : 'border-zinc-700 bg-zinc-950 text-zinc-200 hover:border-zinc-500'
                      }`}
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp className="h-3.5 w-3.5" />
                          Done
                        </>
                      ) : (
                        <>
                          <Pencil className="h-3 w-3" />
                          Edit
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteRule(rule.id)}
                      title="Delete schedule"
                      className="rounded-lg border border-zinc-800 p-1 text-zinc-500 hover:border-rose-500/40 hover:text-rose-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* EXPANDED CLEAN EDITOR */}
                {isExpanded && (
                  <div className="space-y-4 border-t border-zinc-800/80 px-4 py-4">
                    {/* Rule Name, Owner & Quick-Fill Presets */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={rule.label}
                          onChange={(e) => updateOneRule(rule.id, { label: e.target.value })}
                          className="w-60 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs font-semibold text-zinc-100 focus:border-emerald-500/50 focus:outline-none"
                        />
                        <select
                          value={rule.owner}
                          onChange={(e) => updateOneRule(rule.id, { owner: e.target.value })}
                          className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-300"
                        >
                          <option value="primary">{householdNames.primary_name}</option>
                          <option value="spouse">{householdNames.spouse_name}</option>
                        </select>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {!isEspp && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleMax2027(rule, false)}
                              title="Set Employee Pre-Tax/Roth to $25,500/yr ($980.77 bi-weekly) with 2027 IRS caps"
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-500/25"
                            >
                              <Sparkles className="h-3 w-3" />
                              Max 2027 Pre-Tax ($25.5k)
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMax2027(rule, true)}
                              title="Max Employee ($25.5k) + auto-fill After-Tax MBDR to hit the full $75,000 2027 415(c) cap"
                              className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-2.5 py-1 text-[10px] font-semibold text-cyan-200 hover:bg-cyan-500/25"
                            >
                              <Sparkles className="h-3 w-3" />
                              Max 2027 Full + MBDR ($75k)
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => handlePullFromPaystub(rule)}
                          title="Copy pay frequency & per-check amounts from the Paystub tab"
                          className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-[10px] font-medium text-zinc-300 hover:border-zinc-500"
                        >
                          <Download className="h-3 w-3" />
                          Pull from Paystub
                        </button>
                      </div>
                    </div>

                    {looksLowEmp && (
                      <div className="flex items-center gap-2 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          Your Employee deferral ({mask(formatCurrency(annualEmp, { decimals: 0 }))}/yr) looks like a capped end-of-year paystub residual. Click{' '}
                          <strong>Max 2027 Pre-Tax ($25.5k)</strong> or <strong>Max 2027 Full + MBDR ($75k)</strong> above to set 2027 rates.
                        </span>
                      </div>
                    )}

                    {/* CORE ROW 1: Account & Schedule */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <label className="block text-zinc-300">
                        <span className="text-[11px]">Target Vault Account</span>
                        <select
                          value={rule.account_id || ''}
                          onChange={(e) =>
                            updateOneRule(rule.id, {
                              account_id: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-100"
                        >
                          <option value="">— Select an Account —</option>
                          {activeAssetAccounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name} ({ownerName(a.owner_profile)} •{' '}
                              {mask(formatCurrency(a.current_balance, { decimals: 0 }))})
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block text-zinc-300">
                        <span className="text-[11px]">Pay Frequency</span>
                        <select
                          value={rule.pay_frequency}
                          onChange={(e) => updateOneRule(rule.id, { pay_frequency: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-100"
                        >
                          {Object.values(PAY_FREQUENCIES).map((f) => (
                            <option key={f.key} value={f.key}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block text-zinc-300">
                        <span className="text-[11px]">First Payday to Auto-Sync</span>
                        <input
                          type="date"
                          value={rule.start_date}
                          onChange={(e) => updateOneRule(rule.id, { start_date: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 font-mono text-xs text-zinc-100"
                        />
                      </label>
                    </div>

                    {/* CORE ROW 2: 401(k) Contributions */}
                    {!isEspp && (
                      <>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <label className="block text-zinc-300">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px]">
                                {rule.amount_mode === 'pct_base'
                                  ? 'Employee Pre-Tax/Roth (% Base)'
                                  : 'Employee Pre-Tax/Roth ($/chk)'}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  updateOneRule(rule.id, {
                                    amount_mode: rule.amount_mode === 'pct_base' ? 'dollar' : 'pct_base',
                                  })
                                }
                                className="text-[10px] text-sky-300 hover:text-sky-200"
                              >
                                {rule.amount_mode === 'pct_base' ? 'Use $/chk' : 'Use % base'}
                              </button>
                            </div>
                            {rule.amount_mode === 'pct_base' ? (
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.5"
                                placeholder="10"
                                value={rule.employee_pct_of_base}
                                onChange={(e) =>
                                  updateOneRule(rule.id, { employee_pct_of_base: e.target.value })
                                }
                                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 font-mono text-xs text-zinc-100"
                              />
                            ) : (
                              <input
                                type="number"
                                min="0"
                                step="10"
                                placeholder="980.77"
                                value={rule.employee_per_check}
                                onChange={(e) =>
                                  updateOneRule(rule.id, { employee_per_check: e.target.value })
                                }
                                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 font-mono text-xs text-zinc-100"
                              />
                            )}
                            <div className="mt-0.5 text-[10px] text-zinc-500 tabular-nums">
                              {rule.amount_mode === 'pct_base'
                                ? `≈ ${mask(formatCurrency(perCheck.employeePerCheck))}/chk • `
                                : ''}
                              {mask(formatCurrency(cappedAnnualEmp, { decimals: 0 }))}/yr of{' '}
                              {mask(formatCurrency(empCap, { decimals: 0 }))} cap
                            </div>
                          </label>

                          <label className="block text-zinc-300">
                            <span className="text-[11px]">Employer Match ($/chk)</span>
                            <input
                              type="number"
                              min="0"
                              step="10"
                              placeholder="0"
                              value={rule.employer_match_per_check}
                              onChange={(e) =>
                                updateOneRule(rule.id, { employer_match_per_check: e.target.value })
                              }
                              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 font-mono text-xs text-zinc-100"
                            />
                            <div className="mt-0.5 text-[10px] text-zinc-500 tabular-nums">
                              {mask(formatCurrency(annualMatch, { decimals: 0 }))}/yr employer match
                            </div>
                          </label>

                          <label className="block text-zinc-300">
                            <span className="text-[11px]">After-Tax MBDR ($/chk)</span>
                            <input
                              type="number"
                              min="0"
                              step="10"
                              placeholder="0"
                              value={rule.after_tax_per_check}
                              onChange={(e) =>
                                updateOneRule(rule.id, { after_tax_per_check: e.target.value })
                              }
                              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 font-mono text-xs text-zinc-100"
                            />
                            <div className="mt-0.5 text-[10px] text-zinc-500 tabular-nums">
                              {mask(formatCurrency(annualMbdr, { decimals: 0 }))}/yr
                              {remaining415cRoom > 10
                                ? ` • ${mask(formatCurrency(remaining415cRoom, { decimals: 0 }))} left under ${mask(
                                    formatCurrency(cap415c, { decimals: 0 })
                                  )}`
                                : ' • At 415(c) cap ✓'}
                            </div>
                          </label>
                        </div>

                        {/* 401(k) Target Broker Fund Allocations */}
                        <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/60 p-3 space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-zinc-200">
                              <span>Investment Funds (Live Quotes)</span>
                              {hasAllocs ? (
                                <span
                                  className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                                    allocValid
                                      ? 'bg-emerald-500/15 text-emerald-300'
                                      : 'bg-amber-500/15 text-amber-300'
                                  }`}
                                >
                                  {allocSum}% {allocValid ? '✓' : '(must total 100%)'}
                                </span>
                              ) : (
                                <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                                  Flat balance mode
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                              {ALLOC_PRESETS.map((pr) => (
                                <button
                                  key={pr.label}
                                  type="button"
                                  onClick={() => updateOneRule(rule.id, { allocations: pr.rows })}
                                  className="rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-400 hover:border-emerald-500/40 hover:text-emerald-200"
                                >
                                  {pr.label}
                                </button>
                              ))}
                              <button
                                type="button"
                                disabled={!hasAllocs || verifyingRuleId === rule.id}
                                onClick={() =>
                                  handleVerifyTickers(
                                    rule.id,
                                    (rule.allocations || []).map((a) => a.symbol)
                                  )
                                }
                                className="inline-flex items-center gap-1 rounded border border-sky-500/35 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-200 hover:bg-sky-500/20 disabled:opacity-40"
                              >
                                <RefreshCw
                                  className={`h-2.5 w-2.5 ${
                                    verifyingRuleId === rule.id ? 'animate-spin' : ''
                                  }`}
                                />
                                Verify
                              </button>
                            </div>
                          </div>

                          <div className="space-y-2">
                            {(rule.allocations || []).map((alloc, aIdx) => {
                              const sym = String(alloc.symbol || '').trim().toUpperCase();
                              const qInfo = sym ? verifiedQuotes[sym] : null;
                              const perCheckSlice =
                                perCheck.totalPerCheck > 0 && allocSum > 0
                                  ? (perCheck.totalPerCheck * toNumber(alloc.pct)) / allocSum
                                  : 0;

                              return (
                                <div
                                  key={aIdx}
                                  className="grid grid-cols-12 items-center gap-2 text-xs"
                                >
                                  <input
                                    type="text"
                                    placeholder="VFIAX"
                                    value={alloc.symbol}
                                    onChange={(e) => {
                                      const next = [...(rule.allocations || [])];
                                      next[aIdx] = {
                                        ...next[aIdx],
                                        symbol: e.target.value.toUpperCase(),
                                      };
                                      updateOneRule(rule.id, { allocations: next });
                                    }}
                                    className="col-span-3 sm:col-span-2 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 font-mono text-xs uppercase text-zinc-100"
                                  />
                                  <div className="col-span-3 sm:col-span-2 flex items-center gap-1">
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="1"
                                      placeholder="100"
                                      value={alloc.pct}
                                      onChange={(e) => {
                                        const next = [...(rule.allocations || [])];
                                        next[aIdx] = { ...next[aIdx], pct: e.target.value };
                                        updateOneRule(rule.id, { allocations: next });
                                      }}
                                      className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-100"
                                    />
                                    <span className="text-[11px] text-zinc-500">%</span>
                                  </div>
                                  <input
                                    type="text"
                                    placeholder="Fund note (optional)"
                                    value={alloc.label || ''}
                                    onChange={(e) => {
                                      const next = [...(rule.allocations || [])];
                                      next[aIdx] = { ...next[aIdx], label: e.target.value };
                                      updateOneRule(rule.id, { allocations: next });
                                    }}
                                    className="col-span-5 sm:col-span-5 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[11px] text-zinc-200"
                                  />
                                  <div className="col-span-10 sm:col-span-2 text-right font-mono text-[10px] tabular-nums">
                                    {qInfo ? (
                                      qInfo.ok ? (
                                        <span className="text-emerald-300">
                                          ${Number(qInfo.price).toFixed(2)} ✓
                                        </span>
                                      ) : (
                                        <span className="text-rose-300">No quote ✗</span>
                                      )
                                    ) : perCheckSlice > 0 ? (
                                      <span className="text-zinc-400">
                                        {mask(formatCurrency(perCheckSlice))}/chk
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="col-span-2 sm:col-span-1 flex justify-end">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const next = (rule.allocations || []).filter(
                                          (_, i) => i !== aIdx
                                        );
                                        updateOneRule(rule.id, { allocations: next });
                                      }}
                                      className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-rose-300"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}

                            <button
                              type="button"
                              onClick={() =>
                                updateOneRule(rule.id, {
                                  allocations: [
                                    ...(rule.allocations || []),
                                    { symbol: '', pct: '', label: '' },
                                  ],
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[11px] text-zinc-300 hover:border-emerald-500/40 hover:text-emerald-200"
                            >
                              <Plus className="h-3 w-3" />
                              Add Fund
                            </button>
                          </div>

                          {/* Safe Existing-Balance Allocation Helper */}
                          {linkedAcc && hasAllocs && allocValid && unallocatedDollars > 100 && (
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[11px]">
                              <div className="text-emerald-100">
                                Existing{' '}
                                <span className="font-mono font-semibold">
                                  {mask(formatCurrency(unallocatedDollars, { decimals: 0 }))}
                                </span>{' '}
                                is tracked as a flat balance (always kept safe). Convert into these tickers if you want live market quotes to move the full balance.
                              </div>

                              {confirmSeedRuleId === rule.id ? (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={seedingRuleId === rule.id}
                                    onClick={() => handleSeedExistingBalance(rule)}
                                    className="rounded-md bg-emerald-500 px-2.5 py-1 text-[10px] font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
                                  >
                                    {seedingRuleId === rule.id ? 'Allocating…' : 'Confirm Split'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmSeedRuleId('')}
                                    className="rounded-md border border-zinc-700 px-2 py-1 text-[10px] text-zinc-300"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmSeedRuleId(rule.id)}
                                  className="shrink-0 rounded-md border border-emerald-400/40 bg-emerald-500/20 px-2.5 py-1 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-500/30"
                                >
                                  Convert Balance to Tickers
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {/* CORE ROW 2: ESPP Essential Settings */}
                    {isEspp && (
                      <>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <label className="block text-zinc-300">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px]">
                                {rule.amount_mode === 'pct_base'
                                  ? 'ESPP % of Base Salary'
                                  : 'ESPP Withheld ($/chk)'}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  updateOneRule(rule.id, {
                                    amount_mode:
                                      rule.amount_mode === 'pct_base' ? 'dollar' : 'pct_base',
                                  })
                                }
                                className="text-[10px] text-sky-300 hover:text-sky-200"
                              >
                                {rule.amount_mode === 'pct_base' ? 'Use $/chk' : 'Use % base'}
                              </button>
                            </div>
                            {rule.amount_mode === 'pct_base' ? (
                              <input
                                type="number"
                                min="0"
                                max="50"
                                step="0.5"
                                placeholder="10"
                                value={rule.espp_pct_of_base}
                                onChange={(e) =>
                                  updateOneRule(rule.id, { espp_pct_of_base: e.target.value })
                                }
                                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 font-mono text-xs text-zinc-100"
                              />
                            ) : (
                              <input
                                type="number"
                                min="0"
                                step="10"
                                placeholder="500"
                                value={rule.espp_per_check}
                                onChange={(e) =>
                                  updateOneRule(rule.id, { espp_per_check: e.target.value })
                                }
                                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 font-mono text-xs text-zinc-100"
                              />
                            )}
                            <div className="mt-0.5 text-[10px] text-fuchsia-300 tabular-nums">
                              ≈ {mask(formatCurrency(perCheck.esppPerCheck))}/chk •{' '}
                              {mask(
                                formatCurrency(perCheck.esppPerCheck * perCheck.periods, {
                                  decimals: 0,
                                })
                              )}
                              /yr
                            </div>
                          </label>

                          <label className="block text-zinc-300">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px]">Company Ticker</span>
                              {rule.symbol && (
                                <button
                                  type="button"
                                  onClick={() => handleVerifyTickers(rule.id, [rule.symbol])}
                                  className="text-[10px] text-sky-300 hover:text-sky-200"
                                >
                                  {verifyingRuleId === rule.id ? '…' : 'Check Price'}
                                </button>
                              )}
                            </div>
                            <input
                              type="text"
                              placeholder="e.g. CSCO"
                              value={rule.symbol}
                              onChange={(e) =>
                                updateOneRule(rule.id, { symbol: e.target.value.toUpperCase() })
                              }
                              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 font-mono text-xs uppercase text-zinc-100"
                            />
                            {rule.symbol && verifiedQuotes[rule.symbol] && (
                              <div
                                className={`mt-0.5 font-mono text-[10px] ${
                                  verifiedQuotes[rule.symbol].ok
                                    ? 'text-emerald-300'
                                    : 'text-rose-300'
                                }`}
                              >
                                {verifiedQuotes[rule.symbol].ok
                                  ? `Live: $${Number(verifiedQuotes[rule.symbol].price).toFixed(2)}`
                                  : 'Ticker not found'}
                              </div>
                            )}
                          </label>

                          <div className="flex flex-col justify-between">
                            <label className="block text-zinc-300">
                              <span className="text-[11px]">In-Flight Accrued ESPP Cash ($)</span>
                              <div className="mt-1 flex items-center gap-2">
                                <input
                                  type="number"
                                  min="0"
                                  step="10"
                                  value={rule.accrued_cash}
                                  onChange={(e) =>
                                    updateOneRule(rule.id, {
                                      accrued_cash: Math.max(0, toNumber(e.target.value)),
                                    })
                                  }
                                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 font-mono text-xs text-fuchsia-200"
                                />
                                <button
                                  type="button"
                                  onClick={() => openEsppPurchaseConverter(rule, today)}
                                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-fuchsia-500/40 bg-fuchsia-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-fuchsia-200 hover:bg-fuchsia-500/25"
                                >
                                  <ShoppingBag className="h-3.5 w-3.5" />
                                  Buy →
                                </button>
                              </div>
                            </label>
                            {esppSched?.nextPurchaseDate && (
                              <div className="mt-0.5 text-[10px] text-zinc-500">
                                Next Purchase: {formatShortDate(esppSched.nextPurchaseDate)}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* INLINE ESPP PURCHASE CONVERTER */}
                        {purchaseModalRuleId === rule.id && (
                          <div className="space-y-3 rounded-xl border border-fuchsia-500/40 bg-zinc-950/80 p-3.5">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 text-xs font-semibold text-fuchsia-200">
                                <Coins className="h-3.5 w-3.5 text-fuchsia-400" />
                                Convert Accrued ESPP Cash → {rule.symbol || 'Stock'} Shares
                              </div>
                              <button
                                type="button"
                                onClick={() => setPurchaseModalRuleId('')}
                                className="text-[11px] text-zinc-400 hover:text-zinc-200"
                              >
                                Close
                              </button>
                            </div>

                            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                              <label className="block text-zinc-300">
                                <span className="text-[10px]">Purchase Date</span>
                                <input
                                  type="date"
                                  value={purchaseForm.purchaseDate}
                                  onChange={(e) =>
                                    setPurchaseForm((p) => ({ ...p, purchaseDate: e.target.value }))
                                  }
                                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs"
                                />
                              </label>
                              <label className="block text-zinc-300">
                                <span className="text-[10px]">Accrued Cash ($)</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="10"
                                  value={purchaseForm.cashAvailable}
                                  onChange={(e) =>
                                    setPurchaseForm((p) => ({
                                      ...p,
                                      cashAvailable: e.target.value,
                                    }))
                                  }
                                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs"
                                />
                              </label>
                              <label className="block text-zinc-300">
                                <span className="text-[10px]">
                                  Offering Start ($){purchaseForm.hasLookback ? '' : ' (off)'}
                                </span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  disabled={!purchaseForm.hasLookback}
                                  value={purchaseForm.offeringStartPrice}
                                  onChange={(e) =>
                                    setPurchaseForm((p) => ({
                                      ...p,
                                      offeringStartPrice: e.target.value,
                                    }))
                                  }
                                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs disabled:opacity-40"
                                />
                              </label>
                              <label className="block text-zinc-300">
                                <span className="text-[10px]">
                                  Market Price ($) {loadingEsppPrice ? '…' : ''}
                                </span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={purchaseForm.marketPrice}
                                  onChange={(e) =>
                                    setPurchaseForm((p) => ({ ...p, marketPrice: e.target.value }))
                                  }
                                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs"
                                />
                              </label>
                              <label className="block text-zinc-300">
                                <span className="text-[10px]">Discount (%)</span>
                                <input
                                  type="number"
                                  min="0"
                                  max="50"
                                  step="0.5"
                                  value={purchaseForm.discountPct}
                                  onChange={(e) =>
                                    setPurchaseForm((p) => ({ ...p, discountPct: e.target.value }))
                                  }
                                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs"
                                />
                              </label>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-[11px] tabular-nums">
                              {purchasePreview.valid ? (
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-zinc-300">
                                  <span>
                                    Buy Price:{' '}
                                    <strong className="font-mono text-zinc-100">
                                      ${purchasePreview.effectiveBuyPrice.toFixed(2)}
                                    </strong>
                                  </span>
                                  <span>
                                    Shares:{' '}
                                    <strong className="font-mono text-fuchsia-300">
                                      {purchasePreview.sharesBought} {rule.symbol}
                                    </strong>
                                  </span>
                                  <span>
                                    Cash Used:{' '}
                                    <strong className="font-mono">
                                      {mask(formatCurrency(purchasePreview.cashUsed))}
                                    </strong>
                                  </span>
                                  <span>
                                    Carryover:{' '}
                                    <strong className="font-mono text-zinc-400">
                                      {mask(formatCurrency(purchasePreview.cashRemainder))}
                                    </strong>
                                  </span>
                                  <span className="text-emerald-300">
                                    Instant Gain:{' '}
                                    <strong className="font-mono">
                                      +
                                      {mask(
                                        formatCurrency(purchasePreview.instantDiscountGain, {
                                          decimals: 0,
                                        })
                                      )}{' '}
                                      ({purchasePreview.effectiveDiscountPct}%)
                                    </strong>
                                  </span>
                                </div>
                              ) : (
                                <span className="text-zinc-500">
                                  Enter accrued cash & market price to preview shares bought.
                                </span>
                              )}

                              <button
                                type="button"
                                disabled={!purchasePreview.valid || executingPurchase}
                                onClick={() => handleConfirmEsppPurchase(rule)}
                                className="rounded-lg bg-fuchsia-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-fuchsia-400 disabled:opacity-40"
                              >
                                {executingPurchase ? 'Executing…' : 'Confirm & Add ESPP Shares'}
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* COLLAPSIBLE ADVANCED SETTINGS */}
                    <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40">
                      <button
                        type="button"
                        onClick={() => toggleAdvanced(rule.id)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[11px] text-zinc-400 hover:text-zinc-200"
                      >
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          <SlidersHorizontal className="h-3 w-3 text-zinc-500" />
                          <strong className="font-medium text-zinc-300">Advanced Settings</strong>
                          <span className="text-[10px] text-zinc-500">
                            {!isEspp
                              ? `• Caps ${mask(formatCurrency(empCap, { decimals: 0 }))} / ${mask(
                                  formatCurrency(cap415c, { decimals: 0 })
                                )} • Last synced: ${
                                  rule.last_synced_date
                                    ? formatShortDate(rule.last_synced_date)
                                    : 'Not yet'
                                }`
                              : `• ${rule.discount_pct || 15}% discount • ${
                                  rule.has_lookback
                                    ? `Lookback${
                                        toNumber(rule.offering_start_price) > 0
                                          ? ` ($${rule.offering_start_price})`
                                          : ''
                                      }`
                                    : 'No lookback'
                                } • Buys: ${(rule.purchase_months_days || []).join(', ')}`}
                          </span>
                        </span>
                        {isAdvancedOpen ? (
                          <ChevronUp className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                        )}
                      </button>

                      {isAdvancedOpen && (
                        <div className="space-y-3 border-t border-zinc-800/80 p-3">
                          {!isEspp ? (
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                              <label className="block text-zinc-300">
                                <span className="text-[11px]">Annual Emp Cap ($)</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="500"
                                  value={rule.annual_employee_cap}
                                  onChange={(e) =>
                                    updateOneRule(rule.id, { annual_employee_cap: e.target.value })
                                  }
                                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 font-mono text-xs text-zinc-100"
                                />
                                <div className="mt-0.5 text-[10px] text-zinc-500">
                                  2027 IRS limit: $25,500
                                </div>
                              </label>

                              <label className="block text-zinc-300">
                                <span className="text-[11px]">415(c) Total Cap ($)</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="500"
                                  value={rule.annual_415c_cap}
                                  onChange={(e) =>
                                    updateOneRule(rule.id, { annual_415c_cap: e.target.value })
                                  }
                                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 font-mono text-xs text-zinc-100"
                                />
                                <div className="mt-0.5 text-[10px] text-zinc-500">
                                  2027 IRS limit: $75,000 • YTD ({rule.ytd_year}):{' '}
                                  {mask(formatCurrency(rule.ytd_employee_contributed, { decimals: 0 }))}
                                </div>
                              </label>

                              <label className="block text-zinc-300">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px]">Last Synced Payday</span>
                                  {rule.last_synced_date && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateOneRule(rule.id, { last_synced_date: '' })
                                      }
                                      className="text-[10px] text-zinc-500 hover:text-amber-300"
                                    >
                                      Reset
                                    </button>
                                  )}
                                </div>
                                <input
                                  type="date"
                                  value={rule.last_synced_date}
                                  onChange={(e) =>
                                    updateOneRule(rule.id, { last_synced_date: e.target.value })
                                  }
                                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 font-mono text-xs text-zinc-100"
                                />
                                <div className="mt-0.5 text-[10px] text-zinc-500">
                                  Prevents double-posting past checks
                                </div>
                              </label>
                            </div>
                          ) : (
                            <>
                              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                <label className="block text-zinc-300">
                                  <span className="text-[11px]">ESPP Discount (%)</span>
                                  <input
                                    type="number"
                                    min="0"
                                    max="50"
                                    step="0.5"
                                    value={rule.discount_pct}
                                    onChange={(e) => {
                                      const nextDisc = e.target.value;
                                      updateOneRule(rule.id, {
                                        discount_pct: nextDisc,
                                        annual_cash_cap: String(
                                          getDefaultAnnualEsppCashCap(nextDisc)
                                        ),
                                      });
                                    }}
                                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 font-mono text-xs text-zinc-100"
                                  />
                                </label>

                                <label className="block text-zinc-300">
                                  <span className="text-[11px]">Offering Start Price ($)</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="For lookback"
                                    value={rule.offering_start_price}
                                    onChange={(e) =>
                                      updateOneRule(rule.id, {
                                        offering_start_price: e.target.value,
                                      })
                                    }
                                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 font-mono text-xs text-zinc-100"
                                  />
                                </label>

                                <label className="block text-zinc-300">
                                  <span className="text-[11px]">§423 Cash Cap ($/yr)</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="250"
                                    value={rule.annual_cash_cap}
                                    onChange={(e) =>
                                      updateOneRule(rule.id, { annual_cash_cap: e.target.value })
                                    }
                                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 font-mono text-xs text-zinc-100"
                                  />
                                </label>

                                <label className="block text-zinc-300">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px]">Last Synced Payday</span>
                                    {rule.last_synced_date && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateOneRule(rule.id, { last_synced_date: '' })
                                        }
                                        className="text-[10px] text-zinc-500 hover:text-amber-300"
                                      >
                                        Reset
                                      </button>
                                    )}
                                  </div>
                                  <input
                                    type="date"
                                    value={rule.last_synced_date}
                                    onChange={(e) =>
                                      updateOneRule(rule.id, { last_synced_date: e.target.value })
                                    }
                                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 font-mono text-xs text-zinc-100"
                                  />
                                </label>
                              </div>

                              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                                <div className="flex flex-wrap items-center gap-4 text-[11px] text-zinc-300">
                                  <label className="inline-flex cursor-pointer items-center gap-1.5">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(rule.has_lookback)}
                                      onChange={(e) =>
                                        updateOneRule(rule.id, { has_lookback: e.target.checked })
                                      }
                                      className="h-3.5 w-3.5 rounded border-zinc-700 bg-zinc-900"
                                    />
                                    <span>Lookback (lower of start/end price)</span>
                                  </label>

                                  <label className="inline-flex cursor-pointer items-center gap-1.5">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(rule.allow_fractional_shares)}
                                      onChange={(e) =>
                                        updateOneRule(rule.id, {
                                          allow_fractional_shares: e.target.checked,
                                        })
                                      }
                                      className="h-3.5 w-3.5 rounded border-zinc-700 bg-zinc-900"
                                    />
                                    <span>Allow fractional shares</span>
                                  </label>
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                                  <span className="text-zinc-500">Purchase Dates:</span>
                                  {ESPP_DATE_PRESETS.map((pr) => {
                                    const active =
                                      JSON.stringify(rule.purchase_months_days) ===
                                      JSON.stringify(pr.dates);
                                    return (
                                      <button
                                        key={pr.label}
                                        type="button"
                                        onClick={() =>
                                          updateOneRule(rule.id, { purchase_months_days: pr.dates })
                                        }
                                        className={`rounded border px-2 py-0.5 ${
                                          active
                                            ? 'border-fuchsia-500/50 bg-fuchsia-500/20 text-fuchsia-200'
                                            : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                                        }`}
                                      >
                                        {pr.label}
                                      </button>
                                    );
                                  })}
                                  <input
                                    type="text"
                                    title="Custom purchase dates (comma-separated MM-DD, e.g. 05-15, 11-15)"
                                    placeholder="06-30, 12-31"
                                    defaultValue={(rule.purchase_months_days || []).join(', ')}
                                    key={`${rule.id}-${(rule.purchase_months_days || []).join(',')}`}
                                    onBlur={(e) => {
                                      const parsed = e.target.value
                                        .split(',')
                                        .map((s) => s.trim())
                                        .filter((s) =>
                                          /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s)
                                        )
                                        .slice(0, 4);
                                      if (parsed.length > 0) {
                                        updateOneRule(rule.id, { purchase_months_days: parsed });
                                      }
                                    }}
                                    className="w-24 rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-[10px] text-zinc-200"
                                  />
                                </div>
                              </div>
                            </>
                          )}

                          {rule.pay_frequency === 'semimonthly' && (
                            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3 py-2 text-[11px] text-zinc-300">
                              <span className="font-medium text-zinc-400">Semimonthly Paydays:</span>
                              <label className="inline-flex items-center gap-1.5">
                                <span>Day 1</span>
                                <input
                                  type="number"
                                  min="1"
                                  max="28"
                                  value={rule.semimonthly_day_1}
                                  onChange={(e) =>
                                    updateOneRule(rule.id, {
                                      semimonthly_day_1: parseInt(e.target.value || '15', 10),
                                    })
                                  }
                                  className="w-16 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono text-xs"
                                />
                              </label>
                              <label className="inline-flex items-center gap-1.5">
                                <span>Day 2 (31 = month-end)</span>
                                <input
                                  type="number"
                                  min="1"
                                  max="31"
                                  value={rule.semimonthly_day_2}
                                  onChange={(e) =>
                                    updateOneRule(rule.id, {
                                      semimonthly_day_2: parseInt(e.target.value || '31', 10),
                                    })
                                  }
                                  className="w-16 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono text-xs"
                                />
                              </label>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* CLEAN 2027 DRY-RUN SIMULATOR (Cycle-by-Cycle ESPP + Full MBDR Breakdown) */}
      {rules.length > 0 && (
        <div className="rounded-xl border border-zinc-800/90 bg-zinc-900/35 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setSimOpen(!simOpen)}
              className="flex items-center gap-2 text-left text-xs font-semibold text-zinc-200"
            >
              <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
              <span>2027 Preview Simulator (Read-Only)</span>
              {simOpen ? (
                <ChevronUp className="h-3.5 w-3.5 text-zinc-500" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
              )}
            </button>

            <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
              {[
                { label: 'Jun 30, 2027', date: '2027-06-30' },
                { label: 'Dec 31, 2027', date: '2027-12-31' },
              ].map((p) => (
                <button
                  key={p.date}
                  type="button"
                  onClick={() => {
                    setSimDate(p.date);
                    setSimOpen(true);
                  }}
                  className={`rounded-md border px-2 py-1 font-mono ${
                    simDate === p.date
                      ? 'border-cyan-500/45 bg-cyan-500/15 text-cyan-200'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <input
                type="date"
                value={simDate}
                onChange={(e) => setSimDate(e.target.value)}
                className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-0.5 font-mono text-[11px] text-zinc-200"
              />
            </div>
          </div>

          {simOpen && (
            <div className="space-y-2">
              {simBatch.dueItems.length === 0 ? (
                <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/60 px-3 py-2.5 text-[11px] text-zinc-400">
                  No scheduled contributions by {formatShortDate(simDate)}. Make sure each enabled rule has a Target Account and per-check amount.
                </div>
              ) : (
                <>
                  {simBatch.dueItems.map((item) => (
                    <div
                      key={item.ruleId}
                      className="space-y-1.5 rounded-lg border border-zinc-800/80 bg-zinc-950/70 px-3.5 py-2.5 text-[11px] tabular-nums"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-semibold text-zinc-100">{item.rule.label}</span>
                          <span className="ml-2 text-zinc-500">→ {item.account.name}</span>
                          <div className="text-[10px] text-zinc-400">
                            {item.paydates.length} paychecks ({formatShortDate(item.paydates[0])} –{' '}
                            {formatShortDate(item.paydates[item.paydates.length - 1])})
                            {item.type === '401k' && item.allocations?.length > 0 && (
                              <span>
                                {' '}
                                •{' '}
                                {item.allocations
                                  .map(
                                    (a) =>
                                      `${a.symbol} ${mask(
                                        formatCurrency(
                                          (item.totalAmount * toNumber(a.pct)) /
                                            Math.max(1, item.allocPctSum),
                                          { decimals: 0 }
                                        )
                                      )}`
                                  )
                                  .join(', ')}
                              </span>
                            )}
                            {item.hitEmpCap && (
                              <span className="ml-1.5 text-emerald-300">• Hits Emp IRS cap</span>
                            )}
                            {item.hit415cCap && (
                              <span className="ml-1.5 text-cyan-300">• Hits 415(c) cap</span>
                            )}
                            {item.hitCap && (
                              <span className="ml-1.5 text-fuchsia-300">• Hits §423 ESPP cap</span>
                            )}
                          </div>
                        </div>

                        <div className="text-right font-mono">
                          <div className="font-semibold text-cyan-300">
                            +{mask(formatCurrency(item.totalAmount, { decimals: 0 }))}
                          </div>
                          <div className="text-[10px] text-zinc-400">
                            {item.type === '401k'
                              ? format401kBreakdown(
                                  item.totalEmployee,
                                  item.totalMatch,
                                  item.totalAfterTax,
                                  mask
                                )
                              : item.endingAccruedCash > 0.01
                              ? `Ending uninvested pool: ${mask(
                                  formatCurrency(item.endingAccruedCash, { decimals: 0 })
                                )}`
                              : 'All accrued cash converted on purchase dates'}
                          </div>
                        </div>
                      </div>

                      {/* Per-cycle ESPP purchase resets */}
                      {item.type === 'espp' && (item.simulatedPurchaseEvents || []).length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 border-t border-zinc-800/70 pt-1.5 text-[10px] text-fuchsia-200">
                          <span className="text-zinc-400">Purchase cycles (resets pool each buy):</span>
                          {item.simulatedPurchaseEvents.map((ev) => (
                            <span
                              key={ev.purchaseDate}
                              className="rounded border border-fuchsia-500/30 bg-fuchsia-500/10 px-2 py-0.5 font-mono"
                            >
                              {formatShortDate(ev.purchaseDate)}:{' '}
                              <strong>{mask(formatCurrency(ev.cashToConvert, { decimals: 0 }))}</strong> →{' '}
                              {item.rule.symbol || 'Shares'}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cyan-500/25 bg-cyan-500/5 px-3.5 py-2 text-[11px] tabular-nums">
                    <span className="font-medium text-zinc-300">
                      Total Projected New Contributions through {formatShortDate(simDate)}
                    </span>
                    <span className="font-mono font-semibold text-cyan-200">
                      +{mask(formatCurrency(summaryStats.totalProjected, { decimals: 0 }))}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* SYNC AUDIT LOG */}
      {history.length > 0 && (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-3.5">
          <button
            type="button"
            onClick={() => setHistoryOpen(!historyOpen)}
            className="flex w-full items-center justify-between text-left text-[11px] font-semibold text-zinc-300"
          >
            <span className="inline-flex items-center gap-1.5">
              <History className="h-3.5 w-3.5 text-zinc-400" />
              Payroll Auto-Sync Audit Log ({history.length} recent events)
            </span>
            {historyOpen ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>

          {historyOpen && (
            <div className="mt-2.5 space-y-1.5">
              {history.slice(0, 20).map((evt) => (
                <div
                  key={evt.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800/70 bg-zinc-950/60 px-3 py-1.5 text-[10px]"
                >
                  <div>
                    <span className="font-semibold text-zinc-200">{evt.label}</span>
                    <span className="ml-2 font-mono text-zinc-500">
                      {(evt.paydates || []).join(', ')}
                    </span>
                    {evt.detail && <div className="text-zinc-400">{evt.detail}</div>}
                  </div>
                  <div className="font-mono font-semibold text-emerald-300 tabular-nums">
                    {evt.action === 'skipped'
                      ? 'SKIPPED'
                      : `+${mask(formatCurrency(evt.amount))}`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
