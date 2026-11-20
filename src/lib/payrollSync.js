export const DEFAULT_2027_401K_EMPLOYEE_CAP = 24500;
export const DEFAULT_2027_401K_415C_CAP = 72000;
export const DEFAULT_ESPP_FMV_CAP = 25000;

const FREQ_PERIODS = {
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
  weekly: 52,
};

function toNumber(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function todayIsoDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const VALID_FREQS = new Set(['biweekly', 'semimonthly', 'monthly', 'weekly']);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MM_DD_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TICKER_RE = /^[A-Z0-9.\-^=]{1,14}$/;

export function parseIsoDate(iso) {
  if (typeof iso !== 'string' || !ISO_DATE_RE.test(iso)) return null;
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

export function lastDayOfMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function formatIsoDate(y, m, d) {
  const yy = String(y).padStart(4, '0');
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function addDaysIso(iso, days) {
  const p = parseIsoDate(iso);
  if (!p) return '';
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
  return formatIsoDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function daysBetweenIso(fromIso, toIso) {
  const a = parseIsoDate(fromIso);
  const b = parseIsoDate(toIso);
  if (!a || !b) return 0;
  const msA = Date.UTC(a.y, a.m - 1, a.d);
  const msB = Date.UTC(b.y, b.m - 1, b.d);
  return Math.round((msB - msA) / 86400000);
}

export function formatShortDate(iso) {
  const p = parseIsoDate(iso);
  if (!p) return iso || '—';
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
  return dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function getDefaultAnnualEsppCashCap(discountPct = 15) {
  const d = Math.max(0, Math.min(50, toNumber(discountPct))) / 100;
  return Number((DEFAULT_ESPP_FMV_CAP * (1 - d)).toFixed(2));
}

export function createDefaultAutoSyncRule(type = '401k', owner = 'primary', overrides = {}) {
  const uid =
    overrides.id ||
    `${owner}-${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  if (type === 'espp') {
    const discountPct = overrides.discount_pct !== undefined ? toNumber(overrides.discount_pct) : 15;
    return {
      id: uid,
      type: 'espp',
      owner: owner === 'spouse' ? 'spouse' : 'primary',
      label: overrides.label || (owner === 'spouse' ? 'Spouse ESPP Auto-Accrual' : 'Primary ESPP Auto-Accrual'),
      enabled: overrides.enabled !== undefined ? Boolean(overrides.enabled) : true,
      account_id: overrides.account_id ? Number(overrides.account_id) : null,
      pay_frequency: VALID_FREQS.has(overrides.pay_frequency) ? overrides.pay_frequency : 'biweekly',
      start_date: overrides.start_date || '2027-01-08',
      semimonthly_day_1: overrides.semimonthly_day_1 || 15,
      semimonthly_day_2: overrides.semimonthly_day_2 || 31,
      last_synced_date: overrides.last_synced_date || '',
      amount_mode: overrides.amount_mode === 'pct_base' ? 'pct_base' : 'dollar',
      espp_per_check: overrides.espp_per_check !== undefined ? String(overrides.espp_per_check) : '',
      espp_pct_of_base: overrides.espp_pct_of_base !== undefined ? String(overrides.espp_pct_of_base) : '10',
      annual_cash_cap:
        overrides.annual_cash_cap !== undefined
          ? String(overrides.annual_cash_cap)
          : String(getDefaultAnnualEsppCashCap(discountPct)),
      ytd_year: overrides.ytd_year || 2027,
      ytd_espp_contributed: toNumber(overrides.ytd_espp_contributed),
      symbol: String(overrides.symbol || '').trim().toUpperCase(),
      discount_pct: String(discountPct),
      has_lookback: overrides.has_lookback !== undefined ? Boolean(overrides.has_lookback) : true,
      allow_fractional_shares: Boolean(overrides.allow_fractional_shares),
      offering_start_price:
        overrides.offering_start_price !== undefined && toNumber(overrides.offering_start_price) > 0
          ? String(overrides.offering_start_price)
          : '',
      purchase_months_days: Array.isArray(overrides.purchase_months_days)
        ? overrides.purchase_months_days
        : ['06-30', '12-31'],
      accrued_cash: toNumber(overrides.accrued_cash),
      last_purchase_date: overrides.last_purchase_date || '',
    };
  }

  return {
    id: uid,
    type: '401k',
    owner: owner === 'spouse' ? 'spouse' : 'primary',
    label: overrides.label || (owner === 'spouse' ? 'Spouse 401(k) Auto-Invest' : 'Primary 401(k) Auto-Invest'),
    enabled: overrides.enabled !== undefined ? Boolean(overrides.enabled) : true,
    account_id: overrides.account_id ? Number(overrides.account_id) : null,
    pay_frequency: VALID_FREQS.has(overrides.pay_frequency) ? overrides.pay_frequency : 'biweekly',
    start_date: overrides.start_date || '2027-01-08',
    semimonthly_day_1: overrides.semimonthly_day_1 || 15,
    semimonthly_day_2: overrides.semimonthly_day_2 || 31,
    last_synced_date: overrides.last_synced_date || '',
    amount_mode: overrides.amount_mode === 'pct_base' ? 'pct_base' : 'dollar',
    employee_per_check: overrides.employee_per_check !== undefined ? String(overrides.employee_per_check) : '',
    employee_pct_of_base:
      overrides.employee_pct_of_base !== undefined ? String(overrides.employee_pct_of_base) : '',
    after_tax_per_check:
      overrides.after_tax_per_check !== undefined ? String(overrides.after_tax_per_check) : '',
    employer_match_per_check:
      overrides.employer_match_per_check !== undefined ? String(overrides.employer_match_per_check) : '',
    annual_employee_cap:
      overrides.annual_employee_cap !== undefined
        ? String(overrides.annual_employee_cap)
        : String(DEFAULT_2027_401K_EMPLOYEE_CAP),
    annual_415c_cap:
      overrides.annual_415c_cap !== undefined
        ? String(overrides.annual_415c_cap)
        : String(DEFAULT_2027_401K_415C_CAP),
    ytd_year: overrides.ytd_year || 2027,
    ytd_employee_contributed: toNumber(overrides.ytd_employee_contributed),
    ytd_total_contributed: toNumber(overrides.ytd_total_contributed),
    allocations: Array.isArray(overrides.allocations) ? overrides.allocations : [],
  };
}

export function createDefaultPayrollAutoSync() {
  return {
    rules: [],
    history: [],
  };
}

function normalizeAllocationItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const symbol = String(raw.symbol || '').trim().toUpperCase().slice(0, 14);
  const pct =
    raw.pct === '' || raw.pct === null || raw.pct === undefined
      ? ''
      : String(Math.max(0, Math.min(100, toNumber(raw.pct))));
  const label = typeof raw.label === 'string' ? raw.label.slice(0, 80) : '';
  return { symbol, pct, label };
}

export function normalizePayrollAutoSync(raw) {
  if (!raw || typeof raw !== 'object') return createDefaultPayrollAutoSync();

  const numStr = (v, fallback = '') => {
    if (v === '' || v === null || v === undefined) return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? String(n) : fallback;
  };
  const dateStr = (v, fallback = '') =>
    typeof v === 'string' && ISO_DATE_RE.test(v.trim()) ? v.trim() : fallback;

  const rawRules = Array.isArray(raw.rules) ? raw.rules.slice(0, 16) : [];
  const rules = rawRules
    .filter((r) => r && typeof r === 'object' && (r.type === '401k' || r.type === 'espp'))
    .map((r, idx) => {
      const owner = r.owner === 'spouse' ? 'spouse' : 'primary';
      const id =
        typeof r.id === 'string' && r.id.trim()
          ? r.id.trim().slice(0, 64)
          : `${owner}-${r.type}-${idx + 1}`;
      const base = {
        id,
        type: r.type,
        owner,
        label:
          typeof r.label === 'string' && r.label.trim()
            ? r.label.slice(0, 80)
            : r.type === 'espp'
            ? `${owner === 'spouse' ? 'Spouse' : 'Primary'} ESPP Auto-Accrual`
            : `${owner === 'spouse' ? 'Spouse' : 'Primary'} 401(k) Auto-Invest`,
        enabled: r.enabled !== undefined ? Boolean(r.enabled) : true,
        account_id: Number.isFinite(Number(r.account_id)) && Number(r.account_id) > 0 ? Number(r.account_id) : null,
        pay_frequency: VALID_FREQS.has(r.pay_frequency) ? r.pay_frequency : 'biweekly',
        start_date: dateStr(r.start_date, '2027-01-08'),
        semimonthly_day_1: Math.max(1, Math.min(28, Math.floor(toNumber(r.semimonthly_day_1) || 15))),
        semimonthly_day_2: Math.max(1, Math.min(31, Math.floor(toNumber(r.semimonthly_day_2) || 31))),
        last_synced_date: dateStr(r.last_synced_date, ''),
        amount_mode: r.amount_mode === 'pct_base' ? 'pct_base' : 'dollar',
        ytd_year: Math.max(2025, Math.min(2050, Math.floor(toNumber(r.ytd_year) || 2027))),
      };

      if (r.type === 'espp') {
        const discountStr = numStr(r.discount_pct, '15');
        const purchaseDates = Array.isArray(r.purchase_months_days)
          ? r.purchase_months_days
              .map((s) => String(s || '').trim())
              .filter((s) => MM_DD_RE.test(s))
              .slice(0, 4)
          : ['06-30', '12-31'];
        return {
          ...base,
          espp_per_check: numStr(r.espp_per_check),
          espp_pct_of_base: numStr(r.espp_pct_of_base, '10'),
          annual_cash_cap: numStr(
            r.annual_cash_cap,
            String(getDefaultAnnualEsppCashCap(toNumber(discountStr)))
          ),
          ytd_espp_contributed: Math.max(0, toNumber(r.ytd_espp_contributed)),
          symbol: String(r.symbol || '').trim().toUpperCase().slice(0, 14),
          discount_pct: discountStr,
          has_lookback: r.has_lookback !== undefined ? Boolean(r.has_lookback) : true,
          allow_fractional_shares: Boolean(r.allow_fractional_shares),
          offering_start_price: numStr(r.offering_start_price),
          purchase_months_days: purchaseDates.length > 0 ? purchaseDates : ['06-30', '12-31'],
          accrued_cash: Math.max(0, toNumber(r.accrued_cash)),
          last_purchase_date: dateStr(r.last_purchase_date, ''),
        };
      }

      const allocs = Array.isArray(r.allocations)
        ? r.allocations.map(normalizeAllocationItem).filter(Boolean).slice(0, 8)
        : [];
      return {
        ...base,
        employee_per_check: numStr(r.employee_per_check),
        employee_pct_of_base: numStr(r.employee_pct_of_base),
        after_tax_per_check: numStr(r.after_tax_per_check),
        employer_match_per_check: numStr(r.employer_match_per_check),
        annual_employee_cap: numStr(r.annual_employee_cap, String(DEFAULT_2027_401K_EMPLOYEE_CAP)),
        annual_415c_cap: numStr(r.annual_415c_cap, String(DEFAULT_2027_401K_415C_CAP)),
        ytd_employee_contributed: Math.max(0, toNumber(r.ytd_employee_contributed)),
        ytd_total_contributed: Math.max(0, toNumber(r.ytd_total_contributed)),
        allocations: allocs,
      };
    });

  const rawHistory = Array.isArray(raw.history) ? raw.history.slice(0, 80) : [];
  const history = rawHistory
    .filter((h) => h && typeof h === 'object')
    .map((h) => ({
      id: typeof h.id === 'string' ? h.id.slice(0, 64) : `evt-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: typeof h.timestamp === 'string' ? h.timestamp.slice(0, 40) : '',
      action: typeof h.action === 'string' ? h.action.slice(0, 32) : 'payroll_post',
      rule_id: typeof h.rule_id === 'string' ? h.rule_id.slice(0, 64) : '',
      rule_type: h.rule_type === 'espp' ? 'espp' : '401k',
      label: typeof h.label === 'string' ? h.label.slice(0, 100) : '',
      account_id: Number.isFinite(Number(h.account_id)) ? Number(h.account_id) : null,
      paydates: Array.isArray(h.paydates)
        ? h.paydates.filter((d) => typeof d === 'string' && ISO_DATE_RE.test(d)).slice(0, 30)
        : [],
      amount: Number(toNumber(h.amount).toFixed(2)),
      detail: typeof h.detail === 'string' ? h.detail.slice(0, 280) : '',
    }));

  return { rules, history };
}

export function sanitizePayrollAutoSyncForDb(raw) {
  const norm = normalizePayrollAutoSync(raw);
  const rules = norm.rules.map((r) => {
    const common = {
      id: r.id,
      type: r.type,
      owner: r.owner,
      label: r.label.trim().slice(0, 80),
      enabled: Boolean(r.enabled),
      account_id: r.account_id,
      pay_frequency: r.pay_frequency,
      start_date: r.start_date,
      semimonthly_day_1: r.semimonthly_day_1,
      semimonthly_day_2: r.semimonthly_day_2,
      last_synced_date: r.last_synced_date,
      amount_mode: r.amount_mode,
      ytd_year: r.ytd_year,
    };

    if (r.type === 'espp') {
      const discountPct = Math.max(0, Math.min(50, toNumber(r.discount_pct)));
      return {
        ...common,
        espp_per_check: Math.max(0, Number(toNumber(r.espp_per_check).toFixed(2))),
        espp_pct_of_base: Math.max(0, Math.min(50, Number(toNumber(r.espp_pct_of_base).toFixed(2)))),
        annual_cash_cap: Math.max(
          0,
          Number((toNumber(r.annual_cash_cap) || getDefaultAnnualEsppCashCap(discountPct)).toFixed(2))
        ),
        ytd_espp_contributed: Math.max(0, Number(toNumber(r.ytd_espp_contributed).toFixed(2))),
        symbol: r.symbol.trim().toUpperCase().slice(0, 14),
        discount_pct: discountPct,
        has_lookback: Boolean(r.has_lookback),
        allow_fractional_shares: Boolean(r.allow_fractional_shares),
        offering_start_price: Math.max(0, Number(toNumber(r.offering_start_price).toFixed(4))),
        purchase_months_days: r.purchase_months_days,
        accrued_cash: Math.max(0, Number(toNumber(r.accrued_cash).toFixed(2))),
        last_purchase_date: r.last_purchase_date,
      };
    }

    return {
      ...common,
      employee_per_check: Math.max(0, Number(toNumber(r.employee_per_check).toFixed(2))),
      employee_pct_of_base: Math.max(0, Math.min(100, Number(toNumber(r.employee_pct_of_base).toFixed(2)))),
      after_tax_per_check: Math.max(0, Number(toNumber(r.after_tax_per_check).toFixed(2))),
      employer_match_per_check: Math.max(0, Number(toNumber(r.employer_match_per_check).toFixed(2))),
      annual_employee_cap: Math.max(
        0,
        Number((toNumber(r.annual_employee_cap) || DEFAULT_2027_401K_EMPLOYEE_CAP).toFixed(2))
      ),
      annual_415c_cap: Math.max(
        0,
        Number((toNumber(r.annual_415c_cap) || DEFAULT_2027_401K_415C_CAP).toFixed(2))
      ),
      ytd_employee_contributed: Math.max(0, Number(toNumber(r.ytd_employee_contributed).toFixed(2))),
      ytd_total_contributed: Math.max(0, Number(toNumber(r.ytd_total_contributed).toFixed(2))),
      allocations: (r.allocations || [])
        .map((a) => ({
          symbol: String(a.symbol || '').trim().toUpperCase().slice(0, 14),
          pct: Math.max(0, Math.min(100, Number(toNumber(a.pct).toFixed(2)))),
          label: String(a.label || '').trim().slice(0, 80),
        }))
        .filter((a) => a.symbol.length > 0 && a.pct > 0),
    };
  });

  return {
    rules,
    history: norm.history.slice(0, 80),
  };
}

/**
 * Generates all scheduled paydates `d` satisfying:
 *   start_date <= d <= asOfDate  AND  (!last_synced_date || d > last_synced_date)
 */
export function generatePaydatesUpTo(rule, asOfDate = todayIsoDate(), maxCount = 104) {
  const start = parseIsoDate(rule?.start_date);
  const end = parseIsoDate(asOfDate);
  if (!start || !end) return [];
  if (rule.start_date > asOfDate) return [];

  const lastSynced = parseIsoDate(rule.last_synced_date) ? rule.last_synced_date : '';
  const freq = VALID_FREQS.has(rule.pay_frequency) ? rule.pay_frequency : 'biweekly';
  const out = [];

  if (freq === 'biweekly' || freq === 'weekly') {
    const stepDays = freq === 'weekly' ? 7 : 14;
    let cur = rule.start_date;
    // Fast-forward cleanly if lastSynced is far ahead of start_date
    if (lastSynced && lastSynced > cur) {
      const diff = daysBetweenIso(cur, lastSynced);
      if (diff > 0) {
        const jumps = Math.floor(diff / stepDays);
        cur = addDaysIso(cur, jumps * stepDays);
        if (cur <= lastSynced) cur = addDaysIso(cur, stepDays);
      }
    }
    let guard = 0;
    while (cur && cur <= asOfDate && out.length < maxCount && guard < 2000) {
      guard += 1;
      if (!lastSynced || cur > lastSynced) {
        out.push(cur);
      }
      cur = addDaysIso(cur, stepDays);
    }
    return out;
  }

  if (freq === 'monthly') {
    let y = start.y;
    let m = start.m;
    const anchorDay = start.d;
    let guard = 0;
    while (guard < 360 && out.length < maxCount) {
      guard += 1;
      const d = Math.min(anchorDay, lastDayOfMonth(y, m));
      const iso = formatIsoDate(y, m, d);
      if (iso > asOfDate) break;
      if (iso >= rule.start_date && (!lastSynced || iso > lastSynced)) {
        out.push(iso);
      }
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
    return out;
  }

  // semimonthly
  const day1Cfg = Math.max(1, Math.min(28, Math.floor(toNumber(rule.semimonthly_day_1) || 15)));
  const day2Cfg = Math.max(1, Math.min(31, Math.floor(toNumber(rule.semimonthly_day_2) || 31)));
  let y = start.y;
  let m = start.m;
  let guard = 0;
  while (guard < 360 && out.length < maxCount) {
    guard += 1;
    const dim = lastDayOfMonth(y, m);
    const dA = Math.min(day1Cfg, dim);
    const dB = Math.min(day2Cfg, dim);
    const days = dA === dB ? [dA] : [Math.min(dA, dB), Math.max(dA, dB)];
    for (const day of days) {
      const iso = formatIsoDate(y, m, day);
      if (iso > asOfDate) return out;
      if (iso >= rule.start_date && (!lastSynced || iso > lastSynced)) {
        out.push(iso);
        if (out.length >= maxCount) return out;
      }
    }
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/**
 * Returns the next upcoming payday strictly after `afterDate` (and >= rule.start_date & > last_synced_date).
 */
export function getNextPaydate(rule, afterDate = todayIsoDate()) {
  const start = parseIsoDate(rule?.start_date);
  if (!start) return '';
  const floorDate =
    rule.last_synced_date && rule.last_synced_date > afterDate ? rule.last_synced_date : afterDate;
  if (rule.start_date > floorDate) return rule.start_date;

  // Search forward up to 400 days
  const horizon = addDaysIso(floorDate, 400);
  const candidates = generatePaydatesUpTo(
    { ...rule, last_synced_date: floorDate },
    horizon,
    2
  );
  return candidates[0] || '';
}

/**
 * Computes per-paycheck raw amounts for a rule using either fixed dollars or % of base salary.
 */
export function resolveRulePerCheckAmounts(rule, taxProfile) {
  const periods = FREQ_PERIODS[rule.pay_frequency] || 26;
  const ownerPrefix = rule.owner === 'spouse' ? 'spouse' : 'primary';
  const baseSalary = Math.max(0, toNumber(taxProfile?.[`${ownerPrefix}_base_salary`]));
  const basePerCheck = periods > 0 ? baseSalary / periods : 0;

  if (rule.type === 'espp') {
    const rawEspp =
      rule.amount_mode === 'pct_base'
        ? basePerCheck * (Math.max(0, toNumber(rule.espp_pct_of_base)) / 100)
        : Math.max(0, toNumber(rule.espp_per_check));
    return {
      periods,
      baseSalary,
      basePerCheck,
      esppPerCheck: Number(rawEspp.toFixed(2)),
    };
  }

  const rawEmployee =
    rule.amount_mode === 'pct_base'
      ? basePerCheck * (Math.max(0, toNumber(rule.employee_pct_of_base)) / 100)
      : Math.max(0, toNumber(rule.employee_per_check));
  const afterTax = Math.max(0, toNumber(rule.after_tax_per_check));
  const employerMatch = Math.max(0, toNumber(rule.employer_match_per_check));

  return {
    periods,
    baseSalary,
    basePerCheck,
    employeePerCheck: Number(rawEmployee.toFixed(2)),
    afterTaxPerCheck: Number(afterTax.toFixed(2)),
    employerMatchPerCheck: Number(employerMatch.toFixed(2)),
    totalPerCheck: Number((rawEmployee + afterTax + employerMatch).toFixed(2)),
  };
}

/**
 * Finds the most recent ESPP purchase date <= asOfDate that hasn't been executed yet,
 * plus the next upcoming purchase date.
 */
export function evaluateEsppPurchaseSchedule(rule, asOfDate = todayIsoDate()) {
  const asOf = parseIsoDate(asOfDate);
  const start = parseIsoDate(rule?.start_date);
  if (!asOf || !start) return { duePurchaseDate: '', nextPurchaseDate: '' };

  const mmdds = (Array.isArray(rule.purchase_months_days) ? rule.purchase_months_days : ['06-30', '12-31'])
    .filter((s) => MM_DD_RE.test(s))
    .sort();
  if (mmdds.length === 0) return { duePurchaseDate: '', nextPurchaseDate: '' };

  const allDates = [];
  for (let y = Math.min(start.y, asOf.y) - 1; y <= asOf.y + 2; y += 1) {
    for (const mmdd of mmdds) {
      const [mm, dd] = mmdd.split('-').map((n) => parseInt(n, 10));
      const clampedDay = Math.min(dd, lastDayOfMonth(y, mm));
      allDates.push(formatIsoDate(y, mm, clampedDay));
    }
  }
  allDates.sort();

  const lastPurchase = parseIsoDate(rule.last_purchase_date) ? rule.last_purchase_date : '';
  const dueDates = allDates.filter(
    (d) => d >= rule.start_date && d <= asOfDate && (!lastPurchase || d > lastPurchase)
  );
  const nextDates = allDates.filter((d) => d > asOfDate && d >= rule.start_date);

  return {
    duePurchaseDate: dueDates.length > 0 ? dueDates[dueDates.length - 1] : '',
    nextPurchaseDate: nextDates[0] || '',
  };
}

/**
 * Pure computation of all pending payroll contributions & due ESPP purchases up to `asOfDate`.
 * Safe to call for live sync (today) OR future date dry-run simulation (e.g., 2027-06-30).
 */
export function computePendingPayrollBatch(autosyncRaw, taxProfile, accounts = [], asOfDate = todayIsoDate()) {
  const autosync = normalizePayrollAutoSync(autosyncRaw);
  const accMap = new Map(
    (accounts || []).filter((a) => !a.is_archived).map((a) => [Number(a.id), a])
  );

  const dueItems = [];
  const dueEsppPurchases = [];
  const scheduledUpcoming = [];
  let totalDuePaydays = 0;
  let totalDueDollars = 0;

  for (const rule of autosync.rules) {
    if (!rule.enabled) continue;
    const acc = rule.account_id ? accMap.get(Number(rule.account_id)) : null;
    const perCheck = resolveRulePerCheckAmounts(rule, taxProfile);
    const duePaydates = generatePaydatesUpTo(rule, asOfDate);
    const nextPaydate = getNextPaydate(rule, asOfDate);

    if (rule.type === '401k') {
      let runYear = rule.ytd_year;
      let runYtdEmp = Math.max(0, toNumber(rule.ytd_employee_contributed));
      let runYtdTotal = Math.max(0, toNumber(rule.ytd_total_contributed));
      const empCap = Math.max(0, toNumber(rule.annual_employee_cap) || DEFAULT_2027_401K_EMPLOYEE_CAP);
      const totalCap = Math.max(empCap, toNumber(rule.annual_415c_cap) || DEFAULT_2027_401K_415C_CAP);

      const checks = [];
      let sumEmp = 0;
      let sumAfterTax = 0;
      let sumMatch = 0;
      let hitEmpCap = false;
      let hit415cCap = false;

      for (const pd of duePaydates) {
        const y = parseInt(pd.slice(0, 4), 10);
        if (y !== runYear) {
          runYear = y;
          runYtdEmp = 0;
          runYtdTotal = 0;
        }
        const empRoom = Math.max(0, empCap - runYtdEmp);
        const empPosted = Number(Math.min(perCheck.employeePerCheck, empRoom).toFixed(2));
        if (perCheck.employeePerCheck > 0 && empPosted < perCheck.employeePerCheck - 0.01) {
          hitEmpCap = true;
        }

        const matchRoom = Math.max(0, totalCap - runYtdTotal - empPosted);
        const matchPosted = Number(Math.min(perCheck.employerMatchPerCheck, matchRoom).toFixed(2));

        const afterTaxRoom = Math.max(0, totalCap - runYtdTotal - empPosted - matchPosted);
        const afterTaxPosted = Number(Math.min(perCheck.afterTaxPerCheck, afterTaxRoom).toFixed(2));
        if (perCheck.afterTaxPerCheck > 0 && afterTaxPosted < perCheck.afterTaxPerCheck - 0.01) {
          hit415cCap = true;
        }

        const totalCheck = Number((empPosted + afterTaxPosted + matchPosted).toFixed(2));
        runYtdEmp = Number((runYtdEmp + empPosted).toFixed(2));
        runYtdTotal = Number((runYtdTotal + totalCheck).toFixed(2));

        sumEmp += empPosted;
        sumAfterTax += afterTaxPosted;
        sumMatch += matchPosted;

        checks.push({
          paydate: pd,
          employee: empPosted,
          afterTax: afterTaxPosted,
          match: matchPosted,
          total: totalCheck,
        });
      }

      const totalAmount = Number((sumEmp + sumAfterTax + sumMatch).toFixed(2));
      const validAllocs = (rule.allocations || []).filter(
        (a) => TICKER_RE.test(String(a.symbol || '').trim().toUpperCase()) && toNumber(a.pct) > 0
      );
      const allocPctSum = Number(
        validAllocs.reduce((s, a) => s + toNumber(a.pct), 0).toFixed(2)
      );

      if (duePaydates.length > 0 && acc && totalAmount > 0) {
        totalDuePaydays += duePaydates.length;
        totalDueDollars += totalAmount;
        dueItems.push({
          ruleId: rule.id,
          rule,
          account: acc,
          type: '401k',
          paydates: duePaydates,
          checks,
          totalEmployee: Number(sumEmp.toFixed(2)),
          totalAfterTax: Number(sumAfterTax.toFixed(2)),
          totalMatch: Number(sumMatch.toFixed(2)),
          totalAmount,
          nextYtdYear: runYear,
          nextYtdEmployee: runYtdEmp,
          nextYtdTotal: runYtdTotal,
          hitEmpCap,
          hit415cCap,
          allocations: validAllocs,
          allocPctSum,
        });
      } else if (acc) {
        scheduledUpcoming.push({
          ruleId: rule.id,
          rule,
          account: acc,
          type: '401k',
          nextPaydate,
          perCheckTotal: perCheck.totalPerCheck,
        });
      }
    } else if (rule.type === 'espp') {
      let runYear = rule.ytd_year;
      let runYtdEspp = Math.max(0, toNumber(rule.ytd_espp_contributed));
      const discountPct = Math.max(0, Math.min(50, toNumber(rule.discount_pct)));
      const cashCap = Math.max(
        0,
        toNumber(rule.annual_cash_cap) || getDefaultAnnualEsppCashCap(discountPct)
      );

      const checks = [];
      let sumEspp = 0;
      let hitCap = false;

      for (const pd of duePaydates) {
        const y = parseInt(pd.slice(0, 4), 10);
        if (y !== runYear) {
          runYear = y;
          runYtdEspp = 0;
        }
        const room = Math.max(0, cashCap - runYtdEspp);
        const esppPosted = Number(Math.min(perCheck.esppPerCheck, room).toFixed(2));
        if (perCheck.esppPerCheck > 0 && esppPosted < perCheck.esppPerCheck - 0.01) {
          hitCap = true;
        }
        runYtdEspp = Number((runYtdEspp + esppPosted).toFixed(2));
        sumEspp += esppPosted;
        checks.push({ paydate: pd, espp: esppPosted, total: esppPosted });
      }

      const totalAmount = Number(sumEspp.toFixed(2));
      const projectedAccruedCash = Number((toNumber(rule.accrued_cash) + totalAmount).toFixed(2));
      const purchaseSched = evaluateEsppPurchaseSchedule(rule, asOfDate);

      if (duePaydates.length > 0 && acc && totalAmount > 0) {
        totalDuePaydays += duePaydates.length;
        totalDueDollars += totalAmount;
        dueItems.push({
          ruleId: rule.id,
          rule,
          account: acc,
          type: 'espp',
          paydates: duePaydates,
          checks,
          totalAmount,
          nextYtdYear: runYear,
          nextYtdEspp: runYtdEspp,
          projectedAccruedCash,
          hitCap,
        });
      } else if (acc) {
        scheduledUpcoming.push({
          ruleId: rule.id,
          rule,
          account: acc,
          type: 'espp',
          nextPaydate,
          perCheckTotal: perCheck.esppPerCheck,
          nextPurchaseDate: purchaseSched.nextPurchaseDate,
        });
      }

      if (purchaseSched.duePurchaseDate && acc && projectedAccruedCash > 0.01) {
        dueEsppPurchases.push({
          ruleId: rule.id,
          rule,
          account: acc,
          purchaseDate: purchaseSched.duePurchaseDate,
          availableCash: projectedAccruedCash,
          needsPaycheckSyncFirst: duePaydates.length > 0 && totalAmount > 0,
        });
      }
    }
  }

  return {
    asOfDate,
    totalDuePaydays,
    totalDueDollars: Number(totalDueDollars.toFixed(2)),
    dueItems,
    dueEsppPurchases,
    scheduledUpcoming,
    hasDueActions: dueItems.length > 0 || dueEsppPurchases.length > 0,
  };
}

/**
 * Pure ESPP purchase calculation preview (handles lookback, discount, whole vs fractional shares).
 */
export function computeEsppPurchasePreview({
  cashAvailable,
  marketPrice,
  offeringStartPrice = 0,
  discountPct = 15,
  hasLookback = true,
  allowFractionalShares = false,
}) {
  const cash = Math.max(0, toNumber(cashAvailable));
  const mkt = Math.max(0, toNumber(marketPrice));
  const start = Math.max(0, toNumber(offeringStartPrice));
  const disc = Math.max(0, Math.min(50, toNumber(discountPct)));

  if (cash <= 0 || mkt <= 0) {
    return {
      valid: false,
      basePrice: 0,
      effectiveBuyPrice: 0,
      sharesBought: 0,
      cashUsed: 0,
      cashRemainder: cash,
      marketValueBought: 0,
      instantDiscountGain: 0,
      effectiveDiscountPct: 0,
    };
  }

  const basePrice = hasLookback && start > 0 ? Math.min(start, mkt) : mkt;
  const effectiveBuyPrice = Number((basePrice * (1 - disc / 100)).toFixed(4));
  const rawShares = effectiveBuyPrice > 0 ? cash / effectiveBuyPrice : 0;
  const sharesBought = allowFractionalShares
    ? Number(rawShares.toFixed(6))
    : Math.floor(rawShares);
  const cashUsed = Number((sharesBought * effectiveBuyPrice).toFixed(2));
  const cashRemainder = Number(Math.max(0, cash - cashUsed).toFixed(2));
  const marketValueBought = Number((sharesBought * mkt).toFixed(2));
  const instantDiscountGain = Number(Math.max(0, marketValueBought - cashUsed).toFixed(2));
  const effectiveDiscountPct =
    marketValueBought > 0 ? Number(((instantDiscountGain / marketValueBought) * 100).toFixed(1)) : 0;

  return {
    valid: sharesBought > 0,
    basePrice,
    effectiveBuyPrice,
    sharesBought,
    cashUsed,
    cashRemainder,
    marketValueBought,
    instantDiscountGain,
    effectiveDiscountPct,
  };
}

/**
 * Helper to fetch live stock/ETF/mutual-fund quotes via existing `stock-quotes` Edge Function.
 */
async function fetchLiveQuotesMap(supabase, symbols) {
  const unique = Array.from(
    new Set(
      (symbols || [])
        .map((s) => String(s || '').trim().toUpperCase())
        .filter((s) => TICKER_RE.test(s))
    )
  );
  if (unique.length === 0) return {};

  try {
    const { data, error } = await supabase.functions.invoke('stock-quotes', {
      body: { symbols: unique },
    });
    if (error) return {};
    return data?.quotes || {};
  } catch {
    return {};
  }
}

/**
 * Helper to safely persist updated `payroll_autosync` inside `tax_comp_profiles.paystub_details`
 * without disturbing `primary`, `spouse`, or `tax_planning`.
 */
async function persistAutoSyncState(supabase, userId, nextAutoSync, ytdColumnPatches = {}) {
  const { data: existingRow, error: fetchErr } = await supabase
    .from('tax_comp_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;

  const existingDetails =
    existingRow?.paystub_details && typeof existingRow.paystub_details === 'object'
      ? existingRow.paystub_details
      : {};

  const sanitizedSync = sanitizePayrollAutoSyncForDb(nextAutoSync);
  const nextDetails = {
    ...existingDetails,
    payroll_autosync: sanitizedSync,
  };

  if (existingRow) {
    const { error: updErr } = await supabase
      .from('tax_comp_profiles')
      .update({
        ...ytdColumnPatches,
        paystub_details: nextDetails,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
    if (updErr) throw updErr;
  } else {
    const { error: insErr } = await supabase.from('tax_comp_profiles').upsert(
      {
        user_id: userId,
        ...ytdColumnPatches,
        paystub_details: nextDetails,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
    if (insErr) throw insErr;
  }

  return sanitizedSync;
}

/**
 * Executes a batch of due payroll items (401k contributions & ESPP cash accruals) strictly under AAL2 RLS.
 * Supports per-rule dollar overrides or skipping a paycheck (e.g. during parental leave).
 *
 * ZERO-BALANCE-LOSS INVARIANT:
 * If adding the first ticker holding to an account that currently has a flat `current_balance > cash_balance`,
 * the prior flat balance is automatically preserved inside `cash_balance` so no prior balance is ever wiped.
 */
export async function executePayrollSyncBatch({
  supabase,
  userId,
  taxProfile,
  dueItems,
  overridesByRuleId = {},
  skippedRuleIds = new Set(),
}) {
  const currentAutoSync = normalizePayrollAutoSync(taxProfile?.paystub_details?.payroll_autosync);
  const nowIso = new Date().toISOString();
  const today = todayIsoDate();
  const currentYear = parseInt(today.slice(0, 4), 10);

  // Gather all ticker symbols needed for 401(k) allocations
  const symbolsNeeded = [];
  for (const item of dueItems) {
    if (skippedRuleIds.has(item.ruleId)) continue;
    if (item.type === '401k' && item.allocations?.length > 0) {
      for (const a of item.allocations) {
        if (a.symbol) symbolsNeeded.push(a.symbol);
      }
    }
  }
  const quotes = await fetchLiveQuotesMap(supabase, symbolsNeeded);

  const nextRules = currentAutoSync.rules.map((r) => ({ ...r }));
  const newHistory = [];
  const ytdPatches = {};
  const warnings = [];
  let postedCount = 0;
  let skippedCount = 0;
  let totalPostedDollars = 0;

  for (const item of dueItems) {
    const ruleIdx = nextRules.findIndex((r) => r.id === item.ruleId);
    if (ruleIdx < 0) continue;
    const rule = nextRules[ruleIdx];
    const latestPaydate = item.paydates[item.paydates.length - 1];

    if (skippedRuleIds.has(item.ruleId)) {
      nextRules[ruleIdx] = {
        ...rule,
        last_synced_date: latestPaydate,
      };
      newHistory.unshift({
        id: `skip-${rule.id}-${Date.now().toString(36)}`,
        timestamp: nowIso,
        action: 'skipped',
        rule_id: rule.id,
        rule_type: rule.type,
        label: rule.label,
        account_id: rule.account_id,
        paydates: item.paydates,
        amount: 0,
        detail: `Skipped ${item.paydates.length} pay period${item.paydates.length === 1 ? '' : 's'} (e.g. leave/adjustment).`,
      });
      skippedCount += 1;
      continue;
    }

    const overrideVal = overridesByRuleId[item.ruleId];
    const hasOverride =
      overrideVal !== undefined && overrideVal !== '' && Number.isFinite(Number(overrideVal));
    const amountToPost = hasOverride ? Math.max(0, Number(Number(overrideVal).toFixed(2))) : item.totalAmount;

    if (amountToPost <= 0) {
      nextRules[ruleIdx] = {
        ...rule,
        last_synced_date: latestPaydate,
      };
      skippedCount += 1;
      continue;
    }

    // Fetch fresh account + holdings directly from DB to prevent stale-state drift
    const [{ data: acc, error: accErr }, { data: existingHoldings, error: holdErr }] =
      await Promise.all([
        supabase.from('accounts').select('*').eq('id', rule.account_id).single(),
        supabase.from('equity_holdings').select('*').eq('account_id', rule.account_id),
      ]);
    if (accErr || !acc) throw accErr || new Error(`Linked account not found for ${rule.label}`);
    if (holdErr) throw holdErr;

    const holdings = existingHoldings || [];
    const hadHoldingsBefore = holdings.length > 0;
    const priorBalance = toNumber(acc.current_balance);
    const priorCash = toNumber(acc.cash_balance);

    if (item.type === '401k') {
      const allocs = (item.allocations || []).filter((a) => a.symbol && toNumber(a.pct) > 0);
      const pctSum = allocs.reduce((s, a) => s + toNumber(a.pct), 0);
      const useTickerAlloc = allocs.length > 0 && Math.abs(pctSum - 100) <= 0.5;

      let nextCash = priorCash;
      let nextBalance = priorBalance;
      const detailParts = [];

      if (useTickerAlloc) {
        // ZERO-BALANCE-LOSS GUARD: if transitioning from flat balance (0 holdings) -> holdings,
        // preserve the prior flat balance inside `cash_balance` so no prior balance is lost!
        if (!hadHoldingsBefore && priorBalance > priorCash) {
          nextCash = priorBalance;
          warnings.push(
            `${acc.name}: Preserved pre-existing $${priorBalance.toLocaleString()} balance in cash_balance while buying new shares.`
          );
        }

        const updatedHoldings = holdings.map((h) => ({ ...h }));
        let unpricedCash = 0;

        for (const alloc of allocs) {
          const sym = alloc.symbol.toUpperCase();
          const sliceDollars = Number(((amountToPost * toNumber(alloc.pct)) / pctSum).toFixed(2));
          if (sliceDollars <= 0) continue;

          const existingIdx = updatedHoldings.findIndex(
            (h) => String(h.symbol || '').trim().toUpperCase() === sym
          );
          const existingH = existingIdx >= 0 ? updatedHoldings[existingIdx] : null;
          const liveQ = quotes[sym];
          const price =
            liveQ && Number.isFinite(Number(liveQ.price)) && Number(liveQ.price) > 0
              ? Number(liveQ.price)
              : existingH && toNumber(existingH.last_price) > 0
              ? toNumber(existingH.last_price)
              : 0;

          if (price <= 0) {
            unpricedCash += sliceDollars;
            warnings.push(
              `${acc.name}: Could not fetch live price for ${sym} — parked $${sliceDollars.toFixed(2)} in cash_balance.`
            );
            continue;
          }

          const addedShares = Number((sliceDollars / price).toFixed(6));
          if (existingH) {
            const oldShares = toNumber(existingH.shares);
            const newShares = Number((oldShares + addedShares).toFixed(6));
            const oldBasis =
              existingH.cost_basis_per_share !== null && existingH.cost_basis_per_share !== undefined
                ? toNumber(existingH.cost_basis_per_share)
                : price;
            const blendedBasis =
              newShares > 0
                ? Number(((oldShares * oldBasis + addedShares * price) / newShares).toFixed(4))
                : price;

            const { error: uErr } = await supabase
              .from('equity_holdings')
              .update({
                shares: newShares,
                cost_basis_per_share: blendedBasis,
                last_price: price,
                prev_close:
                  liveQ && Number.isFinite(Number(liveQ.prevClose))
                    ? Number(liveQ.prevClose)
                    : existingH.prev_close,
                last_price_at: nowIso,
              })
              .eq('id', existingH.id);
            if (uErr) throw uErr;

            updatedHoldings[existingIdx] = {
              ...existingH,
              shares: newShares,
              cost_basis_per_share: blendedBasis,
              last_price: price,
            };
          } else {
            const { data: inserted, error: iErr } = await supabase
              .from('equity_holdings')
              .insert({
                user_id: userId,
                account_id: acc.id,
                symbol: sym,
                holding_type: 'etf',
                shares: addedShares,
                unvested_shares: 0,
                cost_basis_per_share: Number(price.toFixed(4)),
                last_price: Number(price.toFixed(4)),
                prev_close:
                  liveQ && Number.isFinite(Number(liveQ.prevClose))
                    ? Number(liveQ.prevClose)
                    : Number(price.toFixed(4)),
                last_price_at: nowIso,
                notes: 'Auto-synced 401(k) allocation',
              })
              .select('*')
              .single();
            if (iErr) throw iErr;
            if (inserted) updatedHoldings.push(inserted);
          }

          detailParts.push(`+${addedShares.toFixed(3)} ${sym} @ $${price.toFixed(2)}`);
        }

        nextCash = Number((nextCash + unpricedCash).toFixed(2));
        const equityTotal = updatedHoldings.reduce(
          (sum, h) => sum + toNumber(h.shares) * toNumber(h.last_price),
          0
        );
        nextBalance = Number((nextCash + equityTotal).toFixed(2));
      } else {
        // Pure cash/flat balance contribution (no tickers configured)
        if (hadHoldingsBefore) {
          nextCash = Number((priorCash + amountToPost).toFixed(2));
          const equityTotal = holdings.reduce(
            (sum, h) => sum + toNumber(h.shares) * toNumber(h.last_price),
            0
          );
          nextBalance = Number((nextCash + equityTotal).toFixed(2));
        } else {
          nextBalance = Number((priorBalance + amountToPost).toFixed(2));
        }
        detailParts.push(`+$${amountToPost.toLocaleString()} balance`);
      }

      const { error: accUpdErr } = await supabase
        .from('accounts')
        .update({
          cash_balance: nextCash,
          current_balance: nextBalance,
          last_updated_at: nowIso,
        })
        .eq('id', acc.id);
      if (accUpdErr) throw accUpdErr;

      await supabase.from('balance_snapshots').upsert(
        {
          account_id: acc.id,
          snapshot_date: today,
          balance: nextBalance,
          note: `Payroll Auto-Sync: ${rule.label}`,
        },
        { onConflict: 'account_id,snapshot_date' }
      );

      // Update YTD counters cleanly (scale proportionally if user overrode total)
      const ratio = item.totalAmount > 0 ? amountToPost / item.totalAmount : 1;
      const empDelta = Number((item.totalEmployee * ratio).toFixed(2));
      const startYearMatch = rule.ytd_year === item.nextYtdYear;
      const updatedYtdEmp = hasOverride
        ? Number(((startYearMatch ? toNumber(rule.ytd_employee_contributed) : 0) + empDelta).toFixed(2))
        : item.nextYtdEmployee;
      const updatedYtdTotal = hasOverride
        ? Number(((startYearMatch ? toNumber(rule.ytd_total_contributed) : 0) + amountToPost).toFixed(2))
        : item.nextYtdTotal;

      nextRules[ruleIdx] = {
        ...rule,
        last_synced_date: latestPaydate,
        ytd_year: item.nextYtdYear,
        ytd_employee_contributed: updatedYtdEmp,
        ytd_total_contributed: updatedYtdTotal,
      };

      // Keep top-level 401(k) YTD field in sync when posting in the current calendar year
      if (item.nextYtdYear === currentYear) {
        ytdPatches[`${rule.owner}_401k_ytd`] = updatedYtdEmp;
      }

      newHistory.unshift({
        id: `post-${rule.id}-${Date.now().toString(36)}`,
        timestamp: nowIso,
        action: '401k_post',
        rule_id: rule.id,
        rule_type: '401k',
        label: rule.label,
        account_id: acc.id,
        paydates: item.paydates,
        amount: amountToPost,
        detail: detailParts.join(', ').slice(0, 260),
      });
      postedCount += 1;
      totalPostedDollars += amountToPost;
    } else if (item.type === 'espp') {
      const nextCash = Number((priorCash + amountToPost).toFixed(2));
      const equityTotal = holdings.reduce(
        (sum, h) => sum + toNumber(h.shares) * toNumber(h.last_price),
        0
      );
      const nextBalance = hadHoldingsBefore
        ? Number((nextCash + equityTotal).toFixed(2))
        : Number((priorBalance + amountToPost).toFixed(2));

      const { error: accUpdErr } = await supabase
        .from('accounts')
        .update({
          cash_balance: nextCash,
          current_balance: nextBalance,
          last_updated_at: nowIso,
        })
        .eq('id', acc.id);
      if (accUpdErr) throw accUpdErr;

      await supabase.from('balance_snapshots').upsert(
        {
          account_id: acc.id,
          snapshot_date: today,
          balance: nextBalance,
          note: `Payroll Auto-Sync: ${rule.label} accrual`,
        },
        { onConflict: 'account_id,snapshot_date' }
      );

      const startYearMatch = rule.ytd_year === item.nextYtdYear;
      const nextYtdEspp = hasOverride
        ? Number(((startYearMatch ? toNumber(rule.ytd_espp_contributed) : 0) + amountToPost).toFixed(2))
        : item.nextYtdEspp;
      const nextAccruedCash = Number((toNumber(rule.accrued_cash) + amountToPost).toFixed(2));

      nextRules[ruleIdx] = {
        ...rule,
        last_synced_date: latestPaydate,
        ytd_year: item.nextYtdYear,
        ytd_espp_contributed: nextYtdEspp,
        accrued_cash: nextAccruedCash,
      };

      newHistory.unshift({
        id: `espp-${rule.id}-${Date.now().toString(36)}`,
        timestamp: nowIso,
        action: 'espp_accrual',
        rule_id: rule.id,
        rule_type: 'espp',
        label: rule.label,
        account_id: acc.id,
        paydates: item.paydates,
        amount: amountToPost,
        detail: `Accrued +$${amountToPost.toFixed(2)} ESPP payroll cash (pool now $${nextAccruedCash.toFixed(2)}).`,
      });
      postedCount += 1;
      totalPostedDollars += amountToPost;
    }
  }

  const nextAutoSync = {
    rules: nextRules,
    history: [...newHistory, ...currentAutoSync.history].slice(0, 80),
  };

  await persistAutoSyncState(supabase, userId, nextAutoSync, ytdPatches);

  return {
    postedCount,
    skippedCount,
    totalPostedDollars: Number(totalPostedDollars.toFixed(2)),
    warnings,
    nextAutoSync,
  };
}

/**
 * Executes an ESPP Offering Period Purchase:
 * Converts accrued ESPP payroll cash into `equity_holdings` (`holding_type: 'espp'`) shares at discounted price,
 * keeps any leftover remainder in `accrued_cash`, updates `accounts` + `balance_snapshots`, and rolls offering_start_price.
 */
export async function executeEsppPurchase({
  supabase,
  userId,
  taxProfile,
  ruleId,
  purchaseDate,
  cashAvailable,
  marketPrice,
  offeringStartPrice,
  discountPct,
  hasLookback,
  allowFractionalShares,
}) {
  const currentAutoSync = normalizePayrollAutoSync(taxProfile?.paystub_details?.payroll_autosync);
  const ruleIdx = currentAutoSync.rules.findIndex((r) => r.id === ruleId && r.type === 'espp');
  if (ruleIdx < 0) throw new Error('ESPP rule not found.');
  const rule = currentAutoSync.rules[ruleIdx];
  const sym = String(rule.symbol || '').trim().toUpperCase();
  if (!TICKER_RE.test(sym)) throw new Error('Please set a valid company stock ticker on this ESPP rule first.');
  if (!rule.account_id) throw new Error('Please link an ESPP account on this rule first.');

  const preview = computeEsppPurchasePreview({
    cashAvailable,
    marketPrice,
    offeringStartPrice,
    discountPct,
    hasLookback,
    allowFractionalShares,
  });
  if (!preview.valid) {
    throw new Error('Not enough accrued cash to purchase at least 1 share (or check market price).');
  }

  const nowIso = new Date().toISOString();
  const today = todayIsoDate();
  const pDate = parseIsoDate(purchaseDate) ? purchaseDate : today;

  const [{ data: acc, error: accErr }, { data: existingHoldings, error: holdErr }] =
    await Promise.all([
      supabase.from('accounts').select('*').eq('id', rule.account_id).single(),
      supabase.from('equity_holdings').select('*').eq('account_id', rule.account_id),
    ]);
  if (accErr || !acc) throw accErr || new Error('Linked ESPP account not found.');
  if (holdErr) throw holdErr;

  const holdings = (existingHoldings || []).map((h) => ({ ...h }));
  const hadHoldingsBefore = holdings.length > 0;
  const priorBalance = toNumber(acc.current_balance);
  const priorCash = toNumber(acc.cash_balance);

  // Zero-balance-loss guard when inserting the first holding on a previously flat-balance account
  const baseCashBeforeSpend =
    !hadHoldingsBefore && priorBalance > priorCash ? priorBalance : priorCash;
  const nextCash = Number(Math.max(0, baseCashBeforeSpend - preview.cashUsed).toFixed(2));

  const existingIdx = holdings.findIndex(
    (h) => String(h.symbol || '').trim().toUpperCase() === sym && h.holding_type === 'espp'
  );
  const fallbackIdx =
    existingIdx >= 0
      ? existingIdx
      : holdings.findIndex((h) => String(h.symbol || '').trim().toUpperCase() === sym);

  if (fallbackIdx >= 0) {
    const h = holdings[fallbackIdx];
    const oldShares = toNumber(h.shares);
    const newShares = Number((oldShares + preview.sharesBought).toFixed(6));
    const oldBasis =
      h.cost_basis_per_share !== null && h.cost_basis_per_share !== undefined
        ? toNumber(h.cost_basis_per_share)
        : preview.effectiveBuyPrice;
    const blendedBasis =
      newShares > 0
        ? Number(
            ((oldShares * oldBasis + preview.sharesBought * preview.effectiveBuyPrice) / newShares).toFixed(4)
          )
        : preview.effectiveBuyPrice;

    const { error: uErr } = await supabase
      .from('equity_holdings')
      .update({
        shares: newShares,
        cost_basis_per_share: blendedBasis,
        last_price: Number(toNumber(marketPrice).toFixed(4)),
        last_price_at: nowIso,
      })
      .eq('id', h.id);
    if (uErr) throw uErr;

    holdings[fallbackIdx] = {
      ...h,
      shares: newShares,
      cost_basis_per_share: blendedBasis,
      last_price: Number(toNumber(marketPrice).toFixed(4)),
    };
  } else {
    const { data: inserted, error: iErr } = await supabase
      .from('equity_holdings')
      .insert({
        user_id: userId,
        account_id: acc.id,
        symbol: sym,
        holding_type: 'espp',
        shares: preview.sharesBought,
        unvested_shares: 0,
        cost_basis_per_share: preview.effectiveBuyPrice,
        last_price: Number(toNumber(marketPrice).toFixed(4)),
        prev_close: Number(toNumber(marketPrice).toFixed(4)),
        last_price_at: nowIso,
        notes: `ESPP Purchase (${pDate}, ${discountPct}% off${hasLookback ? ' w/ lookback' : ''})`,
      })
      .select('*')
      .single();
    if (iErr) throw iErr;
    if (inserted) holdings.push(inserted);
  }

  const equityTotal = holdings.reduce(
    (sum, h) => sum + toNumber(h.shares) * toNumber(h.last_price),
    0
  );
  const nextBalance = Number((nextCash + equityTotal).toFixed(2));

  const { error: accUpdErr } = await supabase
    .from('accounts')
    .update({
      cash_balance: nextCash,
      current_balance: nextBalance,
      last_updated_at: nowIso,
    })
    .eq('id', acc.id);
  if (accUpdErr) throw accUpdErr;

  await supabase.from('balance_snapshots').upsert(
    {
      account_id: acc.id,
      snapshot_date: today,
      balance: nextBalance,
      note: `ESPP Purchase: ${preview.sharesBought} ${sym} @ $${preview.effectiveBuyPrice}`,
    },
    { onConflict: 'account_id,snapshot_date' }
  );

  const nextRules = currentAutoSync.rules.map((r, i) =>
    i === ruleIdx
      ? {
          ...r,
          accrued_cash: preview.cashRemainder,
          last_purchase_date: pDate,
          offering_start_price: String(Number(toNumber(marketPrice).toFixed(4))),
        }
      : r
  );

  const nextAutoSync = {
    rules: nextRules,
    history: [
      {
        id: `espp-buy-${rule.id}-${Date.now().toString(36)}`,
        timestamp: nowIso,
        action: 'espp_purchase',
        rule_id: rule.id,
        rule_type: 'espp',
        label: rule.label,
        account_id: acc.id,
        paydates: [pDate],
        amount: preview.cashUsed,
        detail: `Bought ${preview.sharesBought} ${sym} @ $${preview.effectiveBuyPrice.toFixed(2)} (mkt $${toNumber(marketPrice).toFixed(2)}, +$${preview.instantDiscountGain.toFixed(0)} gain, $${preview.cashRemainder.toFixed(2)} carried fwd).`,
      },
      ...currentAutoSync.history,
    ].slice(0, 80),
  };

  await persistAutoSyncState(supabase, userId, nextAutoSync);

  return { preview, nextBalance, nextAutoSync };
}

/**
 * 1-Click Helper: Converts an existing flat-balance 401(k) account (with 0 holdings yet)
 * into ticker shares matching the rule's allocation so live market quotes track the full balance.
 */
export async function seedExisting401kBalanceIntoTickers({
  supabase,
  userId,
  accountId,
  allocations,
}) {
  const validAllocs = (allocations || []).filter(
    (a) => TICKER_RE.test(String(a.symbol || '').trim().toUpperCase()) && toNumber(a.pct) > 0
  );
  const pctSum = validAllocs.reduce((s, a) => s + toNumber(a.pct), 0);
  if (validAllocs.length === 0 || Math.abs(pctSum - 100) > 0.5) {
    throw new Error('Target fund allocations must sum to 100% with valid ticker symbols.');
  }

  const [{ data: acc, error: accErr }, { data: existingHoldings, error: holdErr }] =
    await Promise.all([
      supabase.from('accounts').select('*').eq('id', accountId).single(),
      supabase.from('equity_holdings').select('*').eq('account_id', accountId),
    ]);
  if (accErr || !acc) throw accErr || new Error('Account not found.');
  if (holdErr) throw holdErr;

  const balanceToAllocate =
    (existingHoldings || []).length > 0 ? toNumber(acc.cash_balance) : toNumber(acc.current_balance);
  if (balanceToAllocate <= 0) {
    throw new Error('No unallocated balance available on this account to invest.');
  }

  const symbols = validAllocs.map((a) => a.symbol.trim().toUpperCase());
  const quotes = await fetchLiveQuotesMap(supabase, symbols);
  const missing = symbols.filter((s) => !quotes[s] || toNumber(quotes[s].price) <= 0);
  if (missing.length > 0) {
    throw new Error(
      `Could not fetch live quote for: ${missing.join(', ')}. Use a public ETF/mutual fund ticker (e.g. FXAIX, VOO, VTI, FTIHX).`
    );
  }

  const nowIso = new Date().toISOString();
  const today = todayIsoDate();
  const holdings = (existingHoldings || []).map((h) => ({ ...h }));

  for (const alloc of validAllocs) {
    const sym = alloc.symbol.trim().toUpperCase();
    const q = quotes[sym];
    const price = Number(q.price);
    const sliceDollars = Number(((balanceToAllocate * toNumber(alloc.pct)) / pctSum).toFixed(2));
    const addedShares = Number((sliceDollars / price).toFixed(6));
    const idx = holdings.findIndex((h) => String(h.symbol || '').trim().toUpperCase() === sym);

    if (idx >= 0) {
      const h = holdings[idx];
      const oldShares = toNumber(h.shares);
      const newShares = Number((oldShares + addedShares).toFixed(6));
      const { error: uErr } = await supabase
        .from('equity_holdings')
        .update({
          shares: newShares,
          last_price: price,
          prev_close: Number.isFinite(Number(q.prevClose)) ? Number(q.prevClose) : h.prev_close,
          last_price_at: nowIso,
        })
        .eq('id', h.id);
      if (uErr) throw uErr;
      holdings[idx] = { ...h, shares: newShares, last_price: price };
    } else {
      const { data: inserted, error: iErr } = await supabase
        .from('equity_holdings')
        .insert({
          user_id: userId,
          account_id: acc.id,
          symbol: sym,
          holding_type: 'etf',
          shares: addedShares,
          unvested_shares: 0,
          cost_basis_per_share: Number(price.toFixed(4)),
          last_price: Number(price.toFixed(4)),
          prev_close: Number.isFinite(Number(q.prevClose))
            ? Number(q.prevClose)
            : Number(price.toFixed(4)),
          last_price_at: nowIso,
          notes: 'Seeded from existing 401(k) balance for live market tracking',
        })
        .select('*')
        .single();
      if (iErr) throw iErr;
      if (inserted) holdings.push(inserted);
    }
  }

  const equityTotal = holdings.reduce(
    (sum, h) => sum + toNumber(h.shares) * toNumber(h.last_price),
    0
  );
  const nextBalance = Number(equityTotal.toFixed(2));

  const { error: accUpdErr } = await supabase
    .from('accounts')
    .update({
      cash_balance: 0,
      current_balance: nextBalance,
      last_updated_at: nowIso,
    })
    .eq('id', acc.id);
  if (accUpdErr) throw accUpdErr;

  await supabase.from('balance_snapshots').upsert(
    {
      account_id: acc.id,
      snapshot_date: today,
      balance: nextBalance,
      note: 'Allocated existing 401(k) balance into target tickers',
    },
    { onConflict: 'account_id,snapshot_date' }
  );

  return { allocatedDollars: balanceToAllocate, nextBalance };
}
