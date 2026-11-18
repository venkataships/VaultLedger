export const ACCOUNT_CATEGORIES = {
  retirement_401k: {
    key: 'retirement_401k',
    label: '401(k) & Retirement',
    shortLabel: '401(k) / IRA',
    isLiability: false,
    accent: 'emerald',
    colorHex: '#10b981',
    subtypes: [
      'Traditional 401(k)',
      'Roth 401(k)',
      'Roth IRA',
      'Traditional IRA',
      'HSA (Health Savings)',
      '403(b) / 457(b)',
      'SEP / Solo 401(k)',
      'Pension',
    ],
  },
  bank: {
    key: 'bank',
    label: 'Banks & Cash',
    shortLabel: 'Banks',
    isLiability: false,
    accent: 'sky',
    colorHex: '#0ea5e9',
    subtypes: [
      'Checking',
      'High-Yield Savings (HYSA)',
      'Emergency Fund',
      'Savings',
      'Money Market',
      'Certificate of Deposit (CD)',
      'Cash / Treasury Money Market',
    ],
  },
  investment: {
    key: 'investment',
    label: 'Investments & Equity',
    shortLabel: 'Investments',
    isLiability: false,
    accent: 'violet',
    colorHex: '#8b5cf6',
    subtypes: [
      'Taxable Brokerage',
      'Treasuries / I-Bonds',
      'Employer RSUs / ESPP',
      'Real Estate Equity',
      '529 Education Plan',
      'Crypto / Digital Assets',
    ],
  },
  credit_card: {
    key: 'credit_card',
    label: 'Credit Cards',
    shortLabel: 'Credit Cards',
    isLiability: true,
    accent: 'amber',
    colorHex: '#f59e0b',
    subtypes: [
      'Rewards Card',
      'Travel Card',
      'Cash Back Card',
      '0% Intro APR Card',
      'Charge Card',
      'Business Card',
    ],
  },
  loan: {
    key: 'loan',
    label: 'Active Loans',
    shortLabel: 'Loans',
    isLiability: true,
    accent: 'rose',
    colorHex: '#f43f5e',
    subtypes: [
      'Mortgage',
      'Auto Loan',
      'Student Loan',
      'Personal Loan',
      'HELOC',
      'Home Improvement Loan',
    ],
  },
  other_asset: {
    key: 'other_asset',
    label: 'Other Assets',
    shortLabel: 'Other Assets',
    isLiability: false,
    accent: 'teal',
    colorHex: '#14b8a6',
    subtypes: ['Vehicle Equity', 'Security Deposit', 'Receivable', 'Other Asset'],
  },
  other_liability: {
    key: 'other_liability',
    label: 'Other Liabilities',
    shortLabel: 'Other Debt',
    isLiability: true,
    accent: 'orange',
    colorHex: '#f97316',
    subtypes: ['Tax Payable', 'Medical Installment', 'BNPL Plan', 'Other Liability'],
  },
};

export const EXPENSE_CATEGORIES = [
  'Housing',
  'Groceries',
  'Dining & Coffee',
  'Utilities & Internet',
  'Transportation & Gas',
  'Insurance',
  'Healthcare',
  'Debt & Loan Payments',
  'Subscriptions & Software',
  'Shopping & Household',
  'Entertainment',
  'Travel',
  'Fitness & Wellness',
  'Education',
  'Taxes & Fees',
  'Gifts & Charity',
  'Other',
];

export const CATEGORY_COLORS = {
  Housing: '#10b981',
  Groceries: '#0ea5e9',
  'Dining & Coffee': '#f59e0b',
  'Utilities & Internet': '#6366f1',
  'Transportation & Gas': '#14b8a6',
  Insurance: '#8b5cf6',
  Healthcare: '#ec4899',
  'Debt & Loan Payments': '#f43f5e',
  'Subscriptions & Software': '#a855f7',
  'Shopping & Household': '#eab308',
  Entertainment: '#f97316',
  Travel: '#06b6d4',
  'Fitness & Wellness': '#22c55e',
  Education: '#3b82f6',
  'Taxes & Fees': '#64748b',
  'Gifts & Charity': '#d946ef',
  Other: '#71717a',
};

export function toNumber(val) {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

export function formatCurrency(value, { compact = false, showSign = false, decimals = 2 } = {}) {
  const num = toNumber(value);
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : showSign && num > 0 ? '+' : '';

  if (compact) {
    if (abs >= 1_000_000) {
      return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
    }
    if (abs >= 10_000) {
      return `${sign}$${(abs / 1_000).toFixed(1)}k`;
    }
  }

  return `${sign}$${abs.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function formatPercent(value, decimals = 1) {
  const num = toNumber(value);
  return `${num.toFixed(decimals)}%`;
}

export function todayIsoDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function currentMonthKey() {
  return todayIsoDate().slice(0, 7);
}

export function shiftMonthKey(monthKey, deltaMonths) {
  const [yStr, mStr] = monthKey.split('-');
  const d = new Date(Number(yStr), Number(mStr) - 1 + deltaMonths, 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function formatMonthLabel(monthKey) {
  const [yStr, mStr] = monthKey.split('-');
  const d = new Date(Number(yStr), Number(mStr) - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function formatShortDate(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

export function ordinalDay(day) {
  const n = Number(day);
  if (!n) return '';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

export function computeNetWorthSummary(accounts) {
  const active = (accounts || []).filter((a) => !a.is_archived);

  let retirement401k = 0;
  let banks = 0;
  let investments = 0;
  let otherAssets = 0;
  let creditCards = 0;
  let loans = 0;
  let otherLiabilities = 0;

  let totalCardLimit = 0;
  let totalLoanOriginal = 0;
  let monthlyMinDebtService = 0;
  let weightedDebtNumerator = 0;
  let weightedDebtDenominator = 0;
  let weightedBankApyNumerator = 0;

  for (const acc of active) {
    const bal = toNumber(acc.current_balance);
    const rate = toNumber(acc.interest_rate);
    const minPay = toNumber(acc.minimum_payment);

    switch (acc.category) {
      case 'retirement_401k':
        retirement401k += bal;
        break;
      case 'bank':
        banks += bal;
        if (bal > 0 && rate > 0) weightedBankApyNumerator += bal * rate;
        break;
      case 'investment':
        investments += bal;
        break;
      case 'other_asset':
        otherAssets += bal;
        break;
      case 'credit_card':
        creditCards += bal;
        totalCardLimit += toNumber(acc.credit_limit);
        monthlyMinDebtService += minPay;
        if (bal > 0 && rate > 0) {
          weightedDebtNumerator += bal * rate;
          weightedDebtDenominator += bal;
        }
        break;
      case 'loan':
        loans += bal;
        totalLoanOriginal += toNumber(acc.original_principal) || bal;
        monthlyMinDebtService += minPay;
        if (bal > 0 && rate > 0) {
          weightedDebtNumerator += bal * rate;
          weightedDebtDenominator += bal;
        }
        break;
      case 'other_liability':
        otherLiabilities += bal;
        monthlyMinDebtService += minPay;
        break;
      default:
        break;
    }
  }

  const totalAssets = retirement401k + banks + investments + otherAssets;
  const totalLiabilities = creditCards + loans + otherLiabilities;
  const netWorth = totalAssets - totalLiabilities;

  const creditUtilizationPct =
    totalCardLimit > 0 ? Math.min(999, (creditCards / totalCardLimit) * 100) : null;

  const loanPaidOffPct =
    totalLoanOriginal > 0
      ? Math.max(0, Math.min(100, ((totalLoanOriginal - loans) / totalLoanOriginal) * 100))
      : null;

  const weightedDebtApr =
    weightedDebtDenominator > 0 ? weightedDebtNumerator / weightedDebtDenominator : 0;

  const weightedCashApy = banks > 0 ? weightedBankApyNumerator / banks : 0;

  return {
    totalAssets,
    totalLiabilities,
    netWorth,
    retirement401k,
    banks,
    investments,
    otherAssets,
    creditCards,
    loans,
    otherLiabilities,
    totalCardLimit,
    creditUtilizationPct,
    totalLoanOriginal,
    loanPaidOffPct,
    monthlyMinDebtService,
    weightedDebtApr,
    weightedCashApy,
    activeCount: active.length,
  };
}

/**
 * Builds an accurate carry-forward time series across all snapshot dates + live balances.
 */
export function buildNetWorthTimeSeries(accounts, snapshots) {
  if (!accounts || accounts.length === 0) return [];

  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const validSnaps = (snapshots || [])
    .filter((s) => accountMap.has(s.account_id) && s.snapshot_date)
    .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));

  const dateSet = new Set(validSnaps.map((s) => s.snapshot_date));
  const today = todayIsoDate();
  dateSet.add(today);

  const sortedDates = Array.from(dateSet).sort();

  // Group snapshots by date
  const snapsByDate = new Map();
  for (const s of validSnaps) {
    if (!snapsByDate.has(s.snapshot_date)) snapsByDate.set(s.snapshot_date, []);
    snapsByDate.get(s.snapshot_date).push(s);
  }

  const latestByAccount = new Map();
  const points = [];

  for (const dt of sortedDates) {
    const daySnaps = snapsByDate.get(dt) || [];
    for (const s of daySnaps) {
      latestByAccount.set(s.account_id, toNumber(s.balance));
    }

    // On today's point, reflect live current_balance for all non-archived accounts
    if (dt === today) {
      for (const acc of accounts) {
        if (!acc.is_archived) {
          latestByAccount.set(acc.id, toNumber(acc.current_balance));
        } else if (latestByAccount.has(acc.id)) {
          latestByAccount.set(acc.id, toNumber(acc.current_balance));
        }
      }
    }

    let assets = 0;
    let liabilities = 0;
    let retirement401k = 0;
    let banks = 0;
    let investments = 0;
    let loans = 0;
    let creditCards = 0;

    for (const [accId, bal] of latestByAccount.entries()) {
      const acc = accountMap.get(accId);
      if (!acc) continue;
      if (acc.is_liability) {
        liabilities += bal;
        if (acc.category === 'loan') loans += bal;
        if (acc.category === 'credit_card') creditCards += bal;
      } else {
        assets += bal;
        if (acc.category === 'retirement_401k') retirement401k += bal;
        if (acc.category === 'bank') banks += bal;
        if (acc.category === 'investment') investments += bal;
      }
    }

    points.push({
      date: dt,
      label: formatShortDate(dt),
      assets: Number(assets.toFixed(2)),
      liabilities: Number(liabilities.toFixed(2)),
      netWorth: Number((assets - liabilities).toFixed(2)),
      retirement401k: Number(retirement401k.toFixed(2)),
      banks: Number(banks.toFixed(2)),
      investments: Number(investments.toFixed(2)),
      loans: Number(loans.toFixed(2)),
      creditCards: Number(creditCards.toFixed(2)),
    });
  }

  return points;
}

/**
 * Standard amortization payoff estimate for an active loan.
 */
export function estimateLoanPayoff(balance, annualRatePct, monthlyPayment) {
  const P = toNumber(balance);
  const M = toNumber(monthlyPayment);
  const apr = toNumber(annualRatePct);

  if (P <= 0) {
    return { months: 0, totalInterest: 0, payoffDateLabel: 'Paid off', warning: null };
  }
  if (M <= 0) {
    return { months: null, totalInterest: null, payoffDateLabel: 'Set monthly payment', warning: null };
  }

  const r = apr / 100 / 12;
  if (r === 0) {
    const months = Math.ceil(P / M);
    const dt = new Date();
    dt.setMonth(dt.getMonth() + months);
    return {
      months,
      totalInterest: 0,
      payoffDateLabel: dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      warning: null,
    };
  }

  const monthlyInterest = P * r;
  if (M <= monthlyInterest) {
    return {
      months: null,
      totalInterest: null,
      payoffDateLabel: 'Payment < interest',
      warning: `Monthly interest is ${formatCurrency(monthlyInterest)} — payment must exceed this to reduce principal.`,
    };
  }

  const exactMonths = -Math.log(1 - (r * P) / M) / Math.log(1 + r);
  const months = Math.ceil(exactMonths);
  const totalPaid = exactMonths * M;
  const totalInterest = Math.max(0, totalPaid - P);

  const dt = new Date();
  dt.setMonth(dt.getMonth() + months);

  return {
    months,
    totalInterest,
    payoffDateLabel: dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    warning: null,
  };
}

export const OWNER_PROFILES = {
  primary: {
    key: 'primary',
    defaultLabel: 'Me',
    badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  },
  spouse: {
    key: 'spouse',
    defaultLabel: 'Wife',
    badgeClass: 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300',
  },
  joint: {
    key: 'joint',
    defaultLabel: 'Joint',
    badgeClass: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  },
};

export const HOLDING_TYPES = {
  rsu: { key: 'rsu', label: 'RSU' },
  stock: { key: 'stock', label: 'Stock' },
  etf: { key: 'etf', label: 'ETF' },
  espp: { key: 'espp', label: 'ESPP' },
};

export function getOwnerDisplayName(ownerProfile, householdNames) {
  const key = ownerProfile || 'primary';
  if (key === 'primary') return householdNames?.primary_name || 'Me';
  if (key === 'spouse') return householdNames?.spouse_name || 'Wife';
  if (key === 'joint') return 'Joint';
  return householdNames?.primary_name || 'Me';
}

export function filterByHouseholdScope(items, scope) {
  if (!items) return [];
  if (!scope || scope === 'combined') return items;
  return items.filter((item) => (item.owner_profile || 'primary') === scope);
}

export function computeHouseholdBreakdown(accounts) {
  const buckets = {
    primary: { assets: 0, liabilities: 0, netWorth: 0, count: 0 },
    spouse: { assets: 0, liabilities: 0, netWorth: 0, count: 0 },
    joint: { assets: 0, liabilities: 0, netWorth: 0, count: 0 },
    combined: { assets: 0, liabilities: 0, netWorth: 0, count: 0 },
  };

  for (const acc of accounts || []) {
    if (acc.is_archived) continue;
    const owner = buckets[acc.owner_profile] ? acc.owner_profile : 'primary';
    const bal = toNumber(acc.current_balance);

    if (acc.is_liability) {
      buckets[owner].liabilities += bal;
      buckets.combined.liabilities += bal;
    } else {
      buckets[owner].assets += bal;
      buckets.combined.assets += bal;
    }
    buckets[owner].count += 1;
    buckets.combined.count += 1;
  }

  for (const key of Object.keys(buckets)) {
    buckets[key].netWorth = buckets[key].assets - buckets[key].liabilities;
  }
  return buckets;
}

export function computePromoStatus(promo) {
  const promoBalance = toNumber(promo?.promo_balance);
  const originalAmount = toNumber(promo?.original_amount);

  if (!promo?.expires_on) {
    return {
      daysLeft: 0,
      monthsLeft: 1,
      requiredMonthlyPayment: promoBalance,
      paidOffPct: 0,
      urgency: promo?.is_paid_off || promoBalance <= 0 ? 'paid' : 'ok',
    };
  }

  const [ey, em, ed] = promo.expires_on.split('-').map(Number);
  const expDate = new Date(ey, em - 1, ed);
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysLeft = Math.ceil((expDate.getTime() - todayMidnight.getTime()) / 86400000);

  const monthsLeft = Math.max(1, daysLeft / 30.4375);
  const isPaid = Boolean(promo.is_paid_off) || promoBalance <= 0;
  const requiredMonthlyPayment = isPaid
    ? 0
    : daysLeft <= 0
    ? promoBalance
    : promoBalance / monthsLeft;

  const paidOffPct =
    originalAmount > 0
      ? Math.max(0, Math.min(100, ((originalAmount - promoBalance) / originalAmount) * 100))
      : 0;

  let urgency = 'ok';
  if (isPaid) urgency = 'paid';
  else if (daysLeft < 0) urgency = 'expired';
  else if (daysLeft <= 45) urgency = 'urgent';
  else if (daysLeft <= 90) urgency = 'warning';

  return {
    daysLeft,
    monthsLeft,
    requiredMonthlyPayment,
    paidOffPct,
    urgency,
  };
}

export function computeAccountEquitySummary(account, holdingsForAccount) {
  const holdings = holdingsForAccount || [];
  const cashBalance = toNumber(account?.cash_balance);

  if (holdings.length === 0) {
    return {
      hasHoldings: false,
      vestedValue: 0,
      unvestedValue: 0,
      dayChangeValue: 0,
      dayChangePct: 0,
      cashBalance,
      computedBalance: toNumber(account?.current_balance),
      lastPriceAt: null,
    };
  }

  let vestedValue = 0;
  let unvestedValue = 0;
  let prevVestedValue = 0;
  let lastPriceAt = null;

  for (const h of holdings) {
    const shares = toNumber(h.shares);
    const unvested = toNumber(h.unvested_shares);
    const price = toNumber(h.last_price);
    const prev = toNumber(h.prev_close) > 0 ? toNumber(h.prev_close) : price;

    vestedValue += shares * price;
    unvestedValue += unvested * price;
    prevVestedValue += shares * prev;

    if (h.last_price_at && (!lastPriceAt || h.last_price_at > lastPriceAt)) {
      lastPriceAt = h.last_price_at;
    }
  }

  const dayChangeValue = vestedValue - prevVestedValue;
  const dayChangePct = prevVestedValue > 0 ? (dayChangeValue / prevVestedValue) * 100 : 0;

  return {
    hasHoldings: true,
    vestedValue: Number(vestedValue.toFixed(2)),
    unvestedValue: Number(unvestedValue.toFixed(2)),
    dayChangeValue: Number(dayChangeValue.toFixed(2)),
    dayChangePct: Number(dayChangePct.toFixed(2)),
    cashBalance,
    computedBalance: Number((cashBalance + vestedValue).toFixed(2)),
    lastPriceAt,
  };
}

