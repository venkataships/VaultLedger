import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  Briefcase,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  Save,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  IRS_2026_LIMITS,
  PAY_FREQUENCIES,
  computeHouseholdPaystubSummary,
  formatCurrency,
  formatPercent,
  normalizePaystubDetails,
  sanitizePaystubDetailsForDb,
  toNumber,
} from '../lib/finance';

function buildInitialForm(taxProfile) {
  return {
    filing_status: taxProfile?.filing_status || 'married_filing_jointly',
    state_code: taxProfile?.state_code || '',
    dependents_count: String(taxProfile?.dependents_count ?? 0),
    primary_base_salary: toNumber(taxProfile?.primary_base_salary)
      ? String(taxProfile.primary_base_salary)
      : '',
    primary_bonus_annual: toNumber(taxProfile?.primary_bonus_annual)
      ? String(taxProfile.primary_bonus_annual)
      : '',
    primary_rsu_annual: toNumber(taxProfile?.primary_rsu_annual)
      ? String(taxProfile.primary_rsu_annual)
      : '',
    primary_401k_ytd: toNumber(taxProfile?.primary_401k_ytd)
      ? String(taxProfile.primary_401k_ytd)
      : '',
    primary_has_mega_backdoor: Boolean(taxProfile?.primary_has_mega_backdoor),
    primary_espp_enrolled: Boolean(taxProfile?.primary_espp_enrolled),
    spouse_base_salary: toNumber(taxProfile?.spouse_base_salary)
      ? String(taxProfile.spouse_base_salary)
      : '',
    spouse_bonus_annual: toNumber(taxProfile?.spouse_bonus_annual)
      ? String(taxProfile.spouse_bonus_annual)
      : '',
    spouse_rsu_annual: toNumber(taxProfile?.spouse_rsu_annual)
      ? String(taxProfile.spouse_rsu_annual)
      : '',
    spouse_401k_ytd: toNumber(taxProfile?.spouse_401k_ytd)
      ? String(taxProfile.spouse_401k_ytd)
      : '',
    spouse_has_mega_backdoor: Boolean(taxProfile?.spouse_has_mega_backdoor),
    spouse_espp_enrolled: Boolean(taxProfile?.spouse_espp_enrolled),
    hsa_plan_type: taxProfile?.hsa_plan_type || 'none',
    hsa_contrib_ytd: toNumber(taxProfile?.hsa_contrib_ytd) ? String(taxProfile.hsa_contrib_ytd) : '',
    risk_tolerance: taxProfile?.risk_tolerance || 'moderate_growth',
    financial_goals: taxProfile?.financial_goals || '',
    paystub_details: normalizePaystubDetails(taxProfile?.paystub_details),
  };
}

function PaycheckMoneyInput({
  label,
  value,
  onChange,
  subtext,
  actionLabel,
  onAction,
  placeholder = '0',
  step = '10',
  max,
}) {
  return (
    <label className="block text-zinc-300">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px]">{label}</span>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="text-[10px] font-medium text-emerald-400 hover:text-emerald-300"
          >
            {actionLabel}
          </button>
        )}
      </div>
      <input
        type="number"
        min="0"
        max={max}
        step={step}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 font-mono text-xs text-zinc-100 focus:border-emerald-500/50 focus:outline-none"
      />
      {subtext && <div className="mt-0.5 text-[10px] text-zinc-500 tabular-nums">{subtext}</div>}
    </label>
  );
}

function HeadroomBar({ title, current, limit, subtitle, colorClass = 'bg-emerald-500', mask }) {
  const safeLimit = Math.max(1, limit);
  const pct = Math.min(100, (current / safeLimit) * 100);
  const remaining = Math.max(0, limit - current);
  const isOver = current > limit + 1;

  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/70 p-3">
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="font-medium text-zinc-200">{title}</span>
        <span className="font-mono text-zinc-300 tabular-nums">
          {mask(formatCurrency(current, { decimals: 0 }))}{' '}
          <span className="text-zinc-500">/ {mask(formatCurrency(limit, { decimals: 0 }))}</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all ${isOver ? 'bg-rose-500' : colorClass}`}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-zinc-500 tabular-nums">
        <span>{subtitle}</span>
        <span className={isOver ? 'font-semibold text-rose-300' : 'text-zinc-400'}>
          {isOver
            ? `Over by ${mask(formatCurrency(current - limit, { decimals: 0 }))}`
            : `${mask(formatCurrency(remaining, { decimals: 0 }))} left`}
        </span>
      </div>
    </div>
  );
}

function PersonPaystubPanel({
  personKey,
  personLabel,
  profileForm,
  setProfileForm,
  setIsDirty,
  personStats,
  mask,
}) {
  const isPrimary = personKey === 'primary';
  const stub = profileForm.paystub_details[personKey];

  const borderAccent = isPrimary ? 'border-emerald-500/25' : 'border-fuchsia-500/25';
  const bgAccent = isPrimary ? 'bg-emerald-500/5' : 'bg-fuchsia-500/5';
  const textAccent = isPrimary ? 'text-emerald-300' : 'text-fuchsia-300';
  const checkAccent = isPrimary ? 'text-emerald-500' : 'text-fuchsia-500';

  const setAnnualField = (suffix, val) => {
    setIsDirty(true);
    setProfileForm((prev) => ({
      ...prev,
      [`${personKey}_${suffix}`]: val,
    }));
  };

  const setStubField = (field, val) => {
    setIsDirty(true);
    setProfileForm((prev) => ({
      ...prev,
      paystub_details: {
        ...prev.paystub_details,
        [personKey]: {
          ...prev.paystub_details[personKey],
          [field]: val,
        },
      },
    }));
  };

  const fillMaxTrad401kPerCheck = () => {
    const remainingTarget = Math.max(
      0,
      IRS_2026_LIMITS.employee401k / personStats.periods - personStats.roth401k
    );
    setStubField('trad_401k_per_check', String(Number(remainingTarget.toFixed(2))));
  };

  const pctOfBase = (annualAmt) => {
    if (personStats.annualBaseWithOther <= 0 || annualAmt <= 0) return null;
    return `${((annualAmt / personStats.annualBaseWithOther) * 100).toFixed(1)}% of base`;
  };

  const subFmt = (annualAmt, extra = '') => {
    const parts = [];
    if (annualAmt > 0) parts.push(`${mask(formatCurrency(annualAmt, { decimals: 0 }))}/yr`);
    const basePct = pctOfBase(annualAmt);
    if (basePct) parts.push(basePct);
    if (extra) parts.push(extra);
    return parts.join(' • ');
  };

  return (
    <div className="space-y-4">
      {/* Top Banner */}
      <div
        className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border ${borderAccent} ${bgAccent} px-4 py-3`}
      >
        <div>
          <h3 className={`text-xs font-semibold ${textAccent}`}>
            {personLabel} — Paycheck & Annual Compensation Details
          </h3>
          <p className="text-[11px] text-zinc-400">
            Copy per-paycheck line items straight from a recent W-2 paystub. Leave unused items blank.
          </p>
        </div>
        <div className="text-right font-mono text-xs tabular-nums">
          <div className="text-zinc-200">
            Gross / Check: <strong>{mask(formatCurrency(personStats.grossPerPaycheck))}</strong>
          </div>
          <div className="text-[11px] text-zinc-400">
            Total w/ Benefits:{' '}
            <span className={textAccent}>
              {mask(formatCurrency(personStats.totalCompWithEmployerBenefits, { decimals: 0 }))}/yr
            </span>
          </div>
        </div>
      </div>

      {/* Section A: Annual Comp, Schedule & Employer Benefits */}
      <div className="rounded-xl border border-zinc-800/90 bg-zinc-900/35 p-4 space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          Annual Compensation, Pay Schedule & Employer Match
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <PaycheckMoneyInput
            label="Base Salary ($/yr)"
            step="1000"
            value={profileForm[`${personKey}_base_salary`]}
            onChange={(v) => setAnnualField('base_salary', v)}
            subtext={
              personStats.basePerPaycheck > 0
                ? `${mask(formatCurrency(personStats.basePerPaycheck))}/check`
                : undefined
            }
          />
          <label className="block text-zinc-300">
            <span className="text-[11px]">Pay Frequency</span>
            <select
              value={stub.pay_frequency}
              onChange={(e) => setStubField('pay_frequency', e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-100"
            >
              {PAY_FREQUENCIES.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <PaycheckMoneyInput
            label="Other Pay / Check ($)"
            step="10"
            value={stub.other_earnings_per_check}
            onChange={(v) => setStubField('other_earnings_per_check', v)}
            subtext="Stipend / WFH / GTL"
          />
          <PaycheckMoneyInput
            label="Annual Bonus ($)"
            step="500"
            value={profileForm[`${personKey}_bonus_annual`]}
            onChange={(v) => setAnnualField('bonus_annual', v)}
          />
          <PaycheckMoneyInput
            label="Bonus Fed W/H (%)"
            step="1"
            max="55"
            placeholder="22"
            value={stub.bonus_withholding_pct}
            onChange={(v) => setStubField('bonus_withholding_pct', v)}
            subtext="Statutory US = 22%"
          />
          <PaycheckMoneyInput
            label="Annual RSU Vest ($)"
            step="1000"
            value={profileForm[`${personKey}_rsu_annual`]}
            onChange={(v) => setAnnualField('rsu_annual', v)}
          />
          <PaycheckMoneyInput
            label="RSU Sell-to-Cover W/H (%)"
            step="1"
            max="55"
            placeholder="22"
            value={stub.rsu_withholding_pct}
            onChange={(v) => setStubField('rsu_withholding_pct', v)}
            subtext="Statutory US = 22%"
          />
          <PaycheckMoneyInput
            label="401(k) Contributed YTD ($)"
            step="100"
            value={profileForm[`${personKey}_401k_ytd`]}
            onChange={(v) => setAnnualField('401k_ytd', v)}
            subtext={`Left to $24.5k: ${mask(formatCurrency(personStats.remaining401kByYtd, { decimals: 0 }))}`}
          />
          <PaycheckMoneyInput
            label="Employer 401(k) Match ($/yr)"
            step="100"
            value={stub.employer_401k_match_annual}
            onChange={(v) => setStubField('employer_401k_match_annual', v)}
            subtext="Counts toward $72k 415(c)"
          />
          <PaycheckMoneyInput
            label="Employer HSA Seed ($/yr)"
            step="50"
            value={stub.employer_hsa_annual}
            onChange={(v) => setStubField('employer_hsa_annual', v)}
            subtext="Counts toward IRS HSA cap"
          />
        </div>

        <div className="flex flex-wrap gap-5 pt-1 text-[11px] text-zinc-300">
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={Boolean(profileForm[`${personKey}_has_mega_backdoor`])}
              onChange={(e) => setAnnualField('has_mega_backdoor', e.target.checked)}
              className={`rounded border-zinc-700 bg-zinc-900 ${checkAccent}`}
            />
            Plan allows Mega Backdoor Roth
          </label>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={Boolean(profileForm[`${personKey}_espp_enrolled`])}
              onChange={(e) => setAnnualField('espp_enrolled', e.target.checked)}
              className={`rounded border-zinc-700 bg-zinc-900 ${checkAccent}`}
            />
            ESPP enrolled / available
          </label>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={Boolean(stub.has_401k_true_up)}
              onChange={(e) => setStubField('has_401k_true_up', e.target.checked)}
              className={`rounded border-zinc-700 bg-zinc-900 ${checkAccent}`}
            />
            Employer offers 401(k) match true-up
          </label>
        </div>
      </div>

      {/* Sections B, C, D: Per-Paycheck Deductions Grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* B: Pre-Tax Deductions */}
        <div className="rounded-xl border border-zinc-800/90 bg-zinc-900/35 p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <span className="text-xs font-semibold text-emerald-300">
              Pre-Tax Deductions / Check
            </span>
            <span className="font-mono text-[11px] text-zinc-300 tabular-nums">
              {mask(formatCurrency(personStats.preTaxPerPaycheck))}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <PaycheckMoneyInput
              label="Traditional 401(k)"
              value={stub.trad_401k_per_check}
              onChange={(v) => setStubField('trad_401k_per_check', v)}
              actionLabel={`Max $${Math.round(personStats.maxPerCheck401kTarget)}`}
              onAction={fillMaxTrad401kPerCheck}
              subtext={subFmt(personStats.annualTrad401k)}
            />
            <PaycheckMoneyInput
              label="Medical Insurance"
              value={stub.medical_per_check}
              onChange={(v) => setStubField('medical_per_check', v)}
              subtext={subFmt(personStats.annualMedical)}
            />
            <PaycheckMoneyInput
              label="Dental + Vision"
              value={stub.dental_vision_per_check}
              onChange={(v) => setStubField('dental_vision_per_check', v)}
              subtext={subFmt(personStats.annualDentalVision)}
            />
            <PaycheckMoneyInput
              label="Employee HSA"
              value={stub.hsa_employee_per_check}
              onChange={(v) => setStubField('hsa_employee_per_check', v)}
              subtext={subFmt(personStats.annualHsaEmployee)}
            />
            <PaycheckMoneyInput
              label="Health / LPFSA"
              value={stub.health_fsa_per_check}
              onChange={(v) => setStubField('health_fsa_per_check', v)}
              subtext={subFmt(personStats.annualHealthFsa, '$3,400 cap')}
            />
            <PaycheckMoneyInput
              label="Dependent Care FSA"
              value={stub.dep_care_fsa_per_check}
              onChange={(v) => setStubField('dep_care_fsa_per_check', v)}
              subtext={subFmt(personStats.annualDepCareFsa)}
            />
          </div>
          <PaycheckMoneyInput
            label="Other Pre-Tax (Commuter / Transit / Parking)"
            value={stub.other_pretax_per_check}
            onChange={(v) => setStubField('other_pretax_per_check', v)}
            subtext={subFmt(personStats.annualOtherPreTax)}
          />
        </div>

        {/* C: Taxes Withheld */}
        <div className="rounded-xl border border-zinc-800/90 bg-zinc-900/35 p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <span className="text-xs font-semibold text-amber-300">
              Taxes Withheld / Check
            </span>
            <span className="font-mono text-[11px] text-zinc-300 tabular-nums">
              {mask(formatCurrency(personStats.taxesPerPaycheck))}
            </span>
          </div>
          <div className="space-y-2.5">
            <PaycheckMoneyInput
              label="Federal Income Tax Withheld ($)"
              value={stub.fed_tax_per_check}
              onChange={(v) => setStubField('fed_tax_per_check', v)}
              subtext={subFmt(personStats.annualFedTaxFromBase)}
            />
            <PaycheckMoneyInput
              label="State + Local / SDI Tax ($)"
              value={stub.state_tax_per_check}
              onChange={(v) => setStubField('state_tax_per_check', v)}
              subtext={subFmt(personStats.annualStateTaxFromBase)}
            />
            <PaycheckMoneyInput
              label="FICA (Social Security + Medicare) ($)"
              value={stub.fica_per_check}
              onChange={(v) => setStubField('fica_per_check', v)}
              actionLabel={
                personStats.estimatedFicaPerPaycheck > 0
                  ? `Est. $${Math.round(personStats.estimatedFicaPerPaycheck)}`
                  : undefined
              }
              onAction={
                personStats.estimatedFicaPerPaycheck > 0
                  ? () => setStubField('fica_per_check', String(personStats.estimatedFicaPerPaycheck))
                  : undefined
              }
              subtext={
                personStats.annualFicaFromBase > 0
                  ? subFmt(personStats.annualFicaFromBase)
                  : personStats.estimatedFicaPerPaycheck > 0
                  ? `Avg w/ $184.5k SS cap ≈ ${mask(formatCurrency(personStats.estimatedFicaPerPaycheck))}/check`
                  : undefined
              }
            />
          </div>
          <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/70 p-2.5 text-[11px] text-zinc-400">
            Taxable Wages / Check:{' '}
            <span className="font-mono text-zinc-200 tabular-nums">
              {mask(formatCurrency(personStats.taxablePerPaycheck))}
            </span>
            {personStats.effectiveWithholdingPct > 0 && (
              <span className="ml-2 font-mono text-amber-300">
                ({formatPercent(personStats.effectiveWithholdingPct)} withheld)
              </span>
            )}
          </div>
        </div>

        {/* D: Post-Tax Deductions */}
        <div className="rounded-xl border border-zinc-800/90 bg-zinc-900/35 p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <span className="text-xs font-semibold text-sky-300">
              Post-Tax & Equity / Check
            </span>
            <span className="font-mono text-[11px] text-zinc-300 tabular-nums">
              {mask(formatCurrency(personStats.postTaxPerPaycheck))}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <PaycheckMoneyInput
              label="Roth 401(k)"
              value={stub.roth_401k_per_check}
              onChange={(v) => setStubField('roth_401k_per_check', v)}
              subtext={subFmt(personStats.annualRoth401k)}
            />
            <PaycheckMoneyInput
              label="After-Tax 401(k) (MBDR)"
              value={stub.after_tax_401k_per_check}
              onChange={(v) => setStubField('after_tax_401k_per_check', v)}
              subtext={subFmt(personStats.annualAfterTax401k)}
            />
            <PaycheckMoneyInput
              label="ESPP Deduction ($)"
              value={stub.espp_per_check}
              onChange={(v) => setStubField('espp_per_check', v)}
              subtext={subFmt(personStats.annualEsppContribution)}
            />
            <PaycheckMoneyInput
              label="ESPP Discount (%)"
              step="1"
              max="50"
              placeholder="15"
              value={stub.espp_discount_pct}
              onChange={(v) => setStubField('espp_discount_pct', v)}
              subtext={
                personStats.annualEsppImpliedGain > 0
                  ? `+${mask(formatCurrency(personStats.annualEsppImpliedGain, { decimals: 0 }))}/yr gain`
                  : `Cap ≈ ${mask(formatCurrency(personStats.esppMaxCashContrib, { decimals: 0 }))}/yr`
              }
            />
          </div>
          <PaycheckMoneyInput
            label="Other Post-Tax (Life / Legal / LTD / Garnishment)"
            value={stub.other_posttax_per_check}
            onChange={(v) => setStubField('other_posttax_per_check', v)}
            subtext={subFmt(personStats.annualOtherPostTax)}
          />
        </div>
      </div>

      {/* Section E: Single Paycheck Reconciliation Strip */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] tabular-nums">
            <span className="text-zinc-300">
              Gross <strong>{mask(formatCurrency(personStats.grossPerPaycheck))}</strong>
            </span>
            <span className="text-zinc-600">−</span>
            <span className="text-emerald-300">
              Pre-Tax {mask(formatCurrency(personStats.preTaxPerPaycheck))}
            </span>
            <span className="text-zinc-600">−</span>
            <span className="text-amber-300">
              Taxes {mask(formatCurrency(personStats.taxesPerPaycheck))}
            </span>
            <span className="text-zinc-600">−</span>
            <span className="text-sky-300">
              Post-Tax {mask(formatCurrency(personStats.postTaxPerPaycheck))}
            </span>
            <span className="text-zinc-500">=</span>
            <span className="rounded-md border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-emerald-200">
              Net Deposit / Check: <strong>{mask(formatCurrency(personStats.netPerPaycheck))}</strong>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-400 tabular-nums">
            <span>
              Avg Monthly Net:{' '}
              <strong className="font-mono text-zinc-100">
                {mask(formatCurrency(personStats.avgMonthlyNetBase, { decimals: 0 }))}/mo
              </strong>
            </span>
            {personStats.payFrequency === 'biweekly' && personStats.netPerPaycheck > 0 && (
              <span>
                (2-check mo:{' '}
                <strong className="font-mono text-zinc-200">
                  {mask(formatCurrency(personStats.typicalTwoCheckMonthlyNet, { decimals: 0 }))}
                </strong>
                )
              </span>
            )}
            <span>
              Wealth Saved:{' '}
              <strong className={`font-mono ${textAccent}`}>
                {mask(formatCurrency(personStats.totalAnnualWealthBuilding, { decimals: 0 }))}/yr
              </strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PaystubProfileCard({
  supabase,
  session,
  taxProfile,
  budgets,
  householdNames,
  ccEligibleLots,
  privacyMode,
  onTaxProfileSaved,
}) {
  const [profileOpen, setProfileOpen] = useState(
    !taxProfile ||
      (toNumber(taxProfile.primary_base_salary) === 0 && toNumber(taxProfile.spouse_base_salary) === 0)
  );
  const [activeSubTab, setActiveSubTab] = useState('household'); // 'household' | 'primary' | 'spouse'
  const [profileForm, setProfileForm] = useState(() => buildInitialForm(taxProfile));
  const [isDirty, setIsDirty] = useState(false);
  const lastProfileVersionRef = useRef(taxProfile?.updated_at || null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [syncingTakeHome, setSyncingTakeHome] = useState(false);
  const [profileNotice, setProfileNotice] = useState('');
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    if (!taxProfile) return;
    const nextVersion = taxProfile.updated_at || null;
    if (nextVersion !== lastProfileVersionRef.current || !isDirty) {
      lastProfileVersionRef.current = nextVersion;
      setProfileForm(buildInitialForm(taxProfile));
      setIsDirty(false);
    }
  }, [taxProfile, isDirty]);

  const mask = (str) => (privacyMode ? '••••••' : str);

  const summary = useMemo(
    () => computeHouseholdPaystubSummary(profileForm, householdNames),
    [profileForm, householdNames]
  );

  const syncedTakeHome = useMemo(() => {
    const row = (budgets || []).find((b) => b.category === '_monthly_take_home');
    return row ? toNumber(row.monthly_limit) : 0;
  }, [budgets]);

  const hasSpouseData =
    summary.spouse.annualCashAndEquityComp > 0 ||
    summary.spouse.annualEmployee401kProjected > 0 ||
    summary.spouse.ytd401k > 0 ||
    summary.spouse.hasPaystubDeductions;

  const setHouseholdField = (field, val) => {
    setIsDirty(true);
    setProfileForm((prev) => ({ ...prev, [field]: val }));
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileError('');
    setProfileNotice('');

    try {
      const sanitizedPaystub = sanitizePaystubDetailsForDb(profileForm.paystub_details);
      const payload = {
        user_id: session.user.id,
        filing_status: profileForm.filing_status,
        state_code: profileForm.state_code.trim().toUpperCase().slice(0, 10),
        dependents_count: Math.max(
          0,
          Math.min(20, parseInt(profileForm.dependents_count || '0', 10) || 0)
        ),
        primary_base_salary: Math.max(0, toNumber(profileForm.primary_base_salary)),
        primary_bonus_annual: Math.max(0, toNumber(profileForm.primary_bonus_annual)),
        primary_rsu_annual: Math.max(0, toNumber(profileForm.primary_rsu_annual)),
        primary_401k_ytd: Math.max(0, toNumber(profileForm.primary_401k_ytd)),
        primary_has_mega_backdoor: Boolean(profileForm.primary_has_mega_backdoor),
        primary_espp_enrolled: Boolean(profileForm.primary_espp_enrolled),
        spouse_base_salary: Math.max(0, toNumber(profileForm.spouse_base_salary)),
        spouse_bonus_annual: Math.max(0, toNumber(profileForm.spouse_bonus_annual)),
        spouse_rsu_annual: Math.max(0, toNumber(profileForm.spouse_rsu_annual)),
        spouse_401k_ytd: Math.max(0, toNumber(profileForm.spouse_401k_ytd)),
        spouse_has_mega_backdoor: Boolean(profileForm.spouse_has_mega_backdoor),
        spouse_espp_enrolled: Boolean(profileForm.spouse_espp_enrolled),
        hsa_plan_type: profileForm.hsa_plan_type,
        hsa_contrib_ytd: Math.max(0, toNumber(profileForm.hsa_contrib_ytd)),
        risk_tolerance: profileForm.risk_tolerance,
        financial_goals: profileForm.financial_goals.trim().slice(0, 2000),
        paystub_details: sanitizedPaystub,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('tax_comp_profiles')
        .upsert(payload, { onConflict: 'user_id' });
      if (error) throw error;

      setIsDirty(false);
      setProfileNotice(
        'Paystub & Tax Profile saved under AAL2 RLS. Claude CFO will use these exact numbers immediately.'
      );
      if (onTaxProfileSaved) await onTaxProfileSaved();
    } catch (err) {
      setProfileError(err?.message || 'Failed to save Paystub & Tax Profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSyncMonthlyTakeHome = async () => {
    if (!summary.hasAnyTaxWithholding || summary.combinedAvgMonthlyNetBase <= 0) return;
    setSyncingTakeHome(true);
    setProfileError('');
    setProfileNotice('');

    try {
      const targetTakeHome = Number(summary.combinedAvgMonthlyNetBase.toFixed(2));
      const { error } = await supabase.from('monthly_budgets').upsert(
        {
          user_id: session.user.id,
          category: '_monthly_take_home',
          monthly_limit: targetTakeHome,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,category' }
      );
      if (error) throw error;

      setProfileNotice(
        `Synced Combined Monthly Net Take-Home (${formatCurrency(targetTakeHome, {
          decimals: 0,
        })}/mo) to Expenses Tab for accurate Savings Rate.`
      );
      if (onTaxProfileSaved) await onTaxProfileSaved();
    } catch (err) {
      setProfileError(err?.message || 'Failed to sync Monthly Net Take-Home.');
    } finally {
      setSyncingTakeHome(false);
    }
  };

  // Base Paycheck Waterfall segments (annualized from base paychecks)
  const totalBaseGrossAnnual =
    summary.primary.annualBaseWithOther + summary.spouse.annualBaseWithOther;
  const waterfallSegments = [
    {
      label: 'Pre-Tax',
      value: summary.combinedAnnualPreTax,
      barClass: 'bg-emerald-500',
      textClass: 'text-emerald-300',
    },
    {
      label: 'Taxes',
      value: summary.combinedAnnualTaxesFromBase,
      barClass: 'bg-amber-500',
      textClass: 'text-amber-300',
    },
    {
      label: 'Post-Tax',
      value: summary.combinedAnnualPostTax,
      barClass: 'bg-sky-500',
      textClass: 'text-sky-300',
    },
    {
      label: 'Net Deposit',
      value: Math.max(0, summary.combinedAnnualNetBase),
      barClass: 'bg-indigo-500',
      textClass: 'text-indigo-300',
    },
  ];

  return (
    <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/80">
      {/* Collapsible Header Bar */}
      <button
        type="button"
        onClick={() => setProfileOpen(!profileOpen)}
        className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-left"
      >
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <SlidersHorizontal className="h-4 w-4 text-emerald-400" />
          <span className="text-sm font-semibold text-zinc-100">
            Household Paystub, Compensation & Tax Engine (Zero-PII)
          </span>

          {summary.combinedTotalCompWithBenefits > 0 ? (
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] text-emerald-300 tabular-nums">
              Total Comp: {mask(formatCurrency(summary.combinedTotalCompWithBenefits, { decimals: 0 }))}/yr
            </span>
          ) : (
            <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-400">
              Optional — unlocks exact paycheck, W-2 & 401(k)/HSA/ESPP math
            </span>
          )}

          {summary.hasAnyTaxWithholding && summary.combinedAvgMonthlyNetBase > 0 && (
            <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 font-mono text-[11px] text-sky-300 tabular-nums">
              Net Base: {mask(formatCurrency(summary.combinedAvgMonthlyNetBase, { decimals: 0 }))}/mo
            </span>
          )}

          {summary.combinedGrossComp > 0 && summary.fedTax.marginalRatePct > 0 && (
            <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 font-mono text-[11px] text-violet-300 tabular-nums">
              Est. {summary.fedTax.marginalRatePct}% Fed Bracket
            </span>
          )}

          {ccEligibleLots.length > 0 && (
            <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 font-mono text-[10px] text-sky-300">
              CC-Eligible: {ccEligibleLots.map((l) => `${l.symbol} (${l.contracts}x)`).join(', ')}
            </span>
          )}

          {isDirty && (
            <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-200">
              Unsaved edits
            </span>
          )}
        </div>

        <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
          {profileOpen ? 'Hide' : 'Edit Paystub & Tax Profile'}
          {profileOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {profileOpen && (
        <form
          onSubmit={handleSaveProfile}
          className="space-y-4 border-t border-zinc-800/80 p-5 text-xs"
        >
          {/* Zero-PII & Inner Sub-Tab Switcher Row */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-900/70 p-1">
              <button
                type="button"
                onClick={() => setActiveSubTab('household')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition ${
                  activeSubTab === 'household'
                    ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/40'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                Household Summary & Tax
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab('primary')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition ${
                  activeSubTab === 'primary'
                    ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/40'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Calculator className="h-3.5 w-3.5" />
                {householdNames.primary_name} Paystub
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab('spouse')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition ${
                  activeSubTab === 'spouse'
                    ? 'bg-fuchsia-500/20 text-fuchsia-200 ring-1 ring-fuchsia-500/40'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Calculator className="h-3.5 w-3.5" />
                {householdNames.spouse_name} Paystub
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
              <span>
                Zero-PII: <strong className="text-zinc-200">never enter SSN, address, or account #</strong>
              </span>
              <span className="rounded bg-zinc-900 px-2 py-0.5 font-mono text-emerald-400">
                AAL2 RLS
              </span>
            </div>
          </div>

          {profileError && (
            <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-rose-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{profileError}</span>
            </div>
          )}
          {profileNotice && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>{profileNotice}</span>
            </div>
          )}

          {/* SUB-TAB 1: HOUSEHOLD SUMMARY & TAX */}
          {activeSubTab === 'household' && (
            <div className="space-y-4">
              {/* Filing, State, Dependents, HSA & Goals */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="block text-zinc-300">
                  Tax Filing Status
                  <select
                    value={profileForm.filing_status}
                    onChange={(e) => setHouseholdField('filing_status', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100"
                  >
                    <option value="married_filing_jointly">Married Filing Jointly (MFJ)</option>
                    <option value="married_filing_separately">Married Filing Separately</option>
                    <option value="single">Single</option>
                    <option value="head_of_household">Head of Household</option>
                  </select>
                </label>

                <label className="block text-zinc-300">
                  US State (2-letter)
                  <input
                    type="text"
                    maxLength={10}
                    placeholder="e.g., TX, CA, WA, NJ"
                    value={profileForm.state_code}
                    onChange={(e) =>
                      setHouseholdField('state_code', e.target.value.toUpperCase())
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100"
                  />
                </label>

                <label className="block text-zinc-300">
                  Dependents
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={profileForm.dependents_count}
                    onChange={(e) => setHouseholdField('dependents_count', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100"
                  />
                </label>

                <label className="block text-zinc-300">
                  Risk Tolerance
                  <select
                    value={profileForm.risk_tolerance}
                    onChange={(e) => setHouseholdField('risk_tolerance', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100"
                  >
                    <option value="conservative">Conservative (Capital Preservation)</option>
                    <option value="moderate_growth">Moderate Growth (Balanced)</option>
                    <option value="aggressive">Aggressive Growth</option>
                  </select>
                </label>

                <label className="block text-zinc-300">
                  HSA Eligibility
                  <select
                    value={profileForm.hsa_plan_type}
                    onChange={(e) => setHouseholdField('hsa_plan_type', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100"
                  >
                    <option value="none">No HDHP / HSA</option>
                    <option value="self">Self-Only HDHP ($4,400)</option>
                    <option value="family">Family HDHP ($8,750)</option>
                  </select>
                </label>

                <label className="block text-zinc-300">
                  HSA Contributed YTD ($)
                  <input
                    type="number"
                    min="0"
                    step="50"
                    disabled={profileForm.hsa_plan_type === 'none'}
                    placeholder="0"
                    value={profileForm.hsa_contrib_ytd}
                    onChange={(e) => setHouseholdField('hsa_contrib_ytd', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 disabled:opacity-40"
                  />
                </label>

                <label className="block text-zinc-300 sm:col-span-2">
                  Goals & Strategy Focus (optional)
                  <input
                    type="text"
                    placeholder="e.g., Maximize NW, clear 0% promos, conservative CC/CSP income"
                    value={profileForm.financial_goals}
                    onChange={(e) => setHouseholdField('financial_goals', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100"
                  />
                </label>
              </div>

              {/* 4 KPI Summary Cards */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {/* KPI 1: Total Comp */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/45 p-3.5">
                  <div className="text-[11px] text-zinc-400">Total Comp (w/ Match & Benefits)</div>
                  <div className="mt-1 font-mono text-lg font-semibold text-emerald-300 tabular-nums">
                    {mask(formatCurrency(summary.combinedTotalCompWithBenefits, { decimals: 0 }))}
                    <span className="text-xs font-normal text-zinc-500">/yr</span>
                  </div>
                  <div className="mt-1 text-[10px] text-zinc-400 tabular-nums">
                    Gross Cash + RSU: {mask(formatCurrency(summary.combinedGrossComp, { decimals: 0 }))}
                  </div>
                </div>

                {/* KPI 2: Monthly Net Base + Sync Button */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/45 p-3.5">
                  <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-400">
                    <span>Est. Monthly Net Base</span>
                    <button
                      type="button"
                      disabled={
                        syncingTakeHome ||
                        !summary.hasAnyTaxWithholding ||
                        summary.combinedAvgMonthlyNetBase <= 0
                      }
                      onClick={handleSyncMonthlyTakeHome}
                      title={
                        summary.hasAnyTaxWithholding
                          ? 'Update _monthly_take_home in the Expenses Tab for accurate Savings Rate'
                          : 'Enter paycheck tax & deduction numbers on a Paystub tab first'
                      }
                      className="inline-flex items-center gap-1 rounded-md border border-sky-500/35 bg-sky-500/15 px-2 py-0.5 text-[10px] font-medium text-sky-200 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ArrowRightLeft className="h-2.5 w-2.5" />
                      {syncingTakeHome ? 'Syncing…' : 'Sync to Expenses'}
                    </button>
                  </div>
                  <div className="mt-1 font-mono text-lg font-semibold text-sky-300 tabular-nums">
                    {summary.hasAnyTaxWithholding
                      ? mask(formatCurrency(summary.combinedAvgMonthlyNetBase, { decimals: 0 }))
                      : '—'}
                    <span className="text-xs font-normal text-zinc-500">/mo</span>
                  </div>
                  <div className="mt-1 text-[10px] text-zinc-400 tabular-nums">
                    {summary.hasAnyTaxWithholding &&
                    Math.abs(summary.combinedTypicalMonthlyNet - summary.combinedAvgMonthlyNetBase) > 10
                      ? `2-check mo: ${mask(
                          formatCurrency(summary.combinedTypicalMonthlyNet, { decimals: 0 })
                        )} • Expenses: `
                      : 'Synced in Expenses: '}
                    <span className="text-zinc-300">
                      {syncedTakeHome > 0
                        ? mask(formatCurrency(syncedTakeHome, { decimals: 0 }))
                        : 'Not set'}
                    </span>
                  </div>
                </div>

                {/* KPI 3: Annual Tax-Advantaged + ESPP */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/45 p-3.5">
                  <div className="text-[11px] text-zinc-400">Annual Tax-Advantaged + ESPP</div>
                  <div className="mt-1 font-mono text-lg font-semibold text-fuchsia-300 tabular-nums">
                    {mask(formatCurrency(summary.combinedWealthBuildingAnnual, { decimals: 0 }))}
                    <span className="text-xs font-normal text-zinc-500">/yr</span>
                  </div>
                  <div className="mt-1 text-[10px] text-zinc-400 tabular-nums">
                    401(k) + Match + MBDR + HSA + ESPP
                  </div>
                </div>

                {/* KPI 4: Est. 2026 Federal Tax */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/45 p-3.5">
                  <div className="text-[11px] text-zinc-400">Est. 2026 Federal Tax</div>
                  <div className="mt-1 flex items-baseline gap-2 font-mono text-lg font-semibold text-amber-300 tabular-nums">
                    <span>
                      {summary.combinedGrossComp > 0
                        ? `${summary.fedTax.marginalRatePct}% Marginal`
                        : '—'}
                    </span>
                    {summary.combinedGrossComp > 0 && (
                      <span className="text-[11px] font-normal text-zinc-400">
                        ({formatPercent(summary.fedTax.effectiveRatePct)} eff)
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[10px] text-zinc-400 tabular-nums">
                    {summary.estFedWithholdingDiff !== null ? (
                      <span
                        className={
                          summary.estFedWithholdingDiff >= 0 ? 'text-emerald-300' : 'text-amber-300'
                        }
                      >
                        Est. W/H{' '}
                        {summary.estFedWithholdingDiff >= 0 ? 'surplus' : 'shortfall'}:{' '}
                        {mask(
                          formatCurrency(Math.abs(summary.estFedWithholdingDiff), { decimals: 0 })
                        )}
                      </span>
                    ) : summary.estSupplementalWithholdingGap >= 500 ? (
                      <span className="text-amber-300">
                        Supp. W/H gap ≈{' '}
                        {mask(formatCurrency(summary.estSupplementalWithholdingGap, { decimals: 0 }))}
                      </span>
                    ) : (
                      <span>
                        Est. liability:{' '}
                        {mask(formatCurrency(summary.fedTax.estimatedTax, { decimals: 0 }))}/yr
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Combined Base Paycheck Waterfall Bar */}
              {totalBaseGrossAnnual > 0 && (
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/35 p-3.5 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="font-semibold text-zinc-200">
                      Combined Base Paycheck Waterfall (Annualized Base Gross:{' '}
                      <span className="font-mono text-zinc-100">
                        {mask(formatCurrency(totalBaseGrossAnnual, { decimals: 0 }))}/yr
                      </span>
                      )
                    </span>
                    <span className="text-zinc-500">
                      Bonuses & RSU vests tracked separately above
                    </span>
                  </div>

                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-zinc-800">
                    {waterfallSegments.map((seg) => {
                      const pct =
                        totalBaseGrossAnnual > 0 ? (seg.value / totalBaseGrossAnnual) * 100 : 0;
                      if (pct <= 0) return null;
                      return (
                        <div
                          key={seg.label}
                          title={`${seg.label}: ${formatCurrency(seg.value, { decimals: 0 })} (${pct.toFixed(1)}%)`}
                          className={`${seg.barClass} transition-all`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] tabular-nums">
                    {waterfallSegments.map((seg) => {
                      const pct =
                        totalBaseGrossAnnual > 0 ? (seg.value / totalBaseGrossAnnual) * 100 : 0;
                      return (
                        <span key={seg.label} className="inline-flex items-center gap-1.5 text-zinc-300">
                          <span className={`h-2 w-2 rounded-full ${seg.barClass}`} />
                          <span>{seg.label}:</span>
                          <strong className={`font-mono ${seg.textClass}`}>
                            {mask(formatCurrency(seg.value, { decimals: 0 }))}
                          </strong>
                          <span className="text-zinc-500">({pct.toFixed(1)}%)</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 2026 IRS Cap & Headroom Progress Bars */}
              <div className="space-y-2.5 rounded-xl border border-zinc-800/80 bg-zinc-900/35 p-3.5">
                <div className="flex items-center gap-2 text-[11px] font-semibold text-zinc-200">
                  <Briefcase className="h-3.5 w-3.5 text-emerald-400" />
                  2026 IRS Caps & Payroll Run-Rate Headroom (Under Age 50 Standard Limits)
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  <HeadroomBar
                    title={`${householdNames.primary_name} 401(k) Elective`}
                    current={
                      summary.primary.annualEmployee401kProjected > 0
                        ? summary.primary.annualEmployee401kProjected
                        : summary.primary.ytd401k
                    }
                    limit={IRS_2026_LIMITS.employee401k}
                    subtitle={
                      summary.primary.annualEmployee401kProjected > 0
                        ? `Run rate (${summary.primary.periods}x) • YTD ${mask(
                            formatCurrency(summary.primary.ytd401k, { decimals: 0 })
                          )}`
                        : 'YTD contributed so far'
                    }
                    colorClass="bg-emerald-500"
                    mask={mask}
                  />

                  {hasSpouseData && (
                    <HeadroomBar
                      title={`${householdNames.spouse_name} 401(k) Elective`}
                      current={
                        summary.spouse.annualEmployee401kProjected > 0
                          ? summary.spouse.annualEmployee401kProjected
                          : summary.spouse.ytd401k
                      }
                      limit={IRS_2026_LIMITS.employee401k}
                      subtitle={
                        summary.spouse.annualEmployee401kProjected > 0
                          ? `Run rate (${summary.spouse.periods}x) • YTD ${mask(
                              formatCurrency(summary.spouse.ytd401k, { decimals: 0 })
                            )}`
                          : 'YTD contributed so far'
                      }
                      colorClass="bg-fuchsia-500"
                      mask={mask}
                    />
                  )}

                  {(summary.primary.hasMegaBackdoor || summary.primary.annualAfterTax401k > 0) && (
                    <HeadroomBar
                      title={`${householdNames.primary_name} 415(c) Mega Backdoor`}
                      current={summary.primary.total401k415cProjected}
                      limit={IRS_2026_LIMITS.total401k415c}
                      subtitle="Employee + Match + After-Tax"
                      colorClass="bg-emerald-400"
                      mask={mask}
                    />
                  )}

                  {(summary.spouse.hasMegaBackdoor || summary.spouse.annualAfterTax401k > 0) && (
                    <HeadroomBar
                      title={`${householdNames.spouse_name} 415(c) Mega Backdoor`}
                      current={summary.spouse.total401k415cProjected}
                      limit={IRS_2026_LIMITS.total401k415c}
                      subtitle="Employee + Match + After-Tax"
                      colorClass="bg-fuchsia-400"
                      mask={mask}
                    />
                  )}

                  {summary.hsaLimit > 0 && (
                    <HeadroomBar
                      title={`Household HSA (${profileForm.hsa_plan_type === 'family' ? 'Family' : 'Self'})`}
                      current={
                        summary.hsaProjectedTotal > 0 ? summary.hsaProjectedTotal : summary.hsaYtd
                      }
                      limit={summary.hsaLimit}
                      subtitle={
                        summary.hsaProjectedTotal > 0
                          ? `Emp + Employer seed • YTD ${mask(
                              formatCurrency(summary.hsaYtd, { decimals: 0 })
                            )}`
                          : 'YTD contributed so far'
                      }
                      colorClass="bg-sky-500"
                      mask={mask}
                    />
                  )}

                  {(summary.depCareFsaProjectedTotal > 0 ||
                    Number(profileForm.dependents_count) > 0) && (
                    <HeadroomBar
                      title="Dependent Care FSA"
                      current={summary.depCareFsaProjectedTotal}
                      limit={summary.depCareFsaLimit}
                      subtitle="Household pre-tax childcare cap"
                      colorClass="bg-violet-500"
                      mask={mask}
                    />
                  )}

                  {(summary.primary.esppEnrolled || summary.primary.annualEsppContribution > 0) && (
                    <HeadroomBar
                      title={`${householdNames.primary_name} ESPP §423 (${summary.primary.esppDiscountPct}% off)`}
                      current={summary.primary.annualEsppContribution}
                      limit={summary.primary.esppMaxCashContrib}
                      subtitle={
                        summary.primary.annualEsppImpliedGain > 0
                          ? `Est. gain +${mask(
                              formatCurrency(summary.primary.annualEsppImpliedGain, { decimals: 0 })
                            )}/yr`
                          : '$25k FMV cash ceiling'
                      }
                      colorClass="bg-cyan-500"
                      mask={mask}
                    />
                  )}

                  {(summary.spouse.esppEnrolled || summary.spouse.annualEsppContribution > 0) && (
                    <HeadroomBar
                      title={`${householdNames.spouse_name} ESPP §423 (${summary.spouse.esppDiscountPct}% off)`}
                      current={summary.spouse.annualEsppContribution}
                      limit={summary.spouse.esppMaxCashContrib}
                      subtitle={
                        summary.spouse.annualEsppImpliedGain > 0
                          ? `Est. gain +${mask(
                              formatCurrency(summary.spouse.annualEsppImpliedGain, { decimals: 0 })
                            )}/yr`
                          : '$25k FMV cash ceiling'
                      }
                      colorClass="bg-cyan-400"
                      mask={mask}
                    />
                  )}
                </div>
              </div>

              {/* Smart Paystub & Tax Alerts */}
              {summary.alerts.length > 0 && (
                <div className="space-y-2">
                  {summary.alerts.map((al, idx) => {
                    const palette =
                      al.level === 'danger'
                        ? 'border-rose-500/35 bg-rose-500/10 text-rose-100'
                        : al.level === 'warn'
                        ? 'border-amber-500/35 bg-amber-500/10 text-amber-100'
                        : 'border-sky-500/30 bg-sky-500/10 text-sky-100';
                    const IconComp =
                      al.level === 'danger'
                        ? ShieldAlert
                        : al.level === 'warn'
                        ? AlertTriangle
                        : Info;
                    return (
                      <div key={idx} className={`flex items-start gap-2.5 rounded-xl border p-3 ${palette}`}>
                        <IconComp className="mt-0.5 h-4 w-4 shrink-0" />
                        <div className="text-[11px] leading-relaxed">
                          <div className="font-semibold">{al.title}</div>
                          <div className="opacity-90">{al.detail}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SUB-TAB 2: PRIMARY PAYSTUB */}
          {activeSubTab === 'primary' && (
            <PersonPaystubPanel
              personKey="primary"
              personLabel={householdNames.primary_name}
              profileForm={profileForm}
              setProfileForm={setProfileForm}
              setIsDirty={setIsDirty}
              personStats={summary.primary}
              mask={mask}
            />
          )}

          {/* SUB-TAB 3: SPOUSE PAYSTUB */}
          {activeSubTab === 'spouse' && (
            <PersonPaystubPanel
              personKey="spouse"
              personLabel={householdNames.spouse_name}
              profileForm={profileForm}
              setProfileForm={setProfileForm}
              setIsDirty={setIsDirty}
              personStats={summary.spouse}
              mask={mask}
            />
          )}

          {/* Persistent Save Footer across all 3 sub-tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-[11px]">
            <div className="flex flex-wrap items-center gap-3 text-zinc-400">
              <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
              <span>
                Claude CFO reads all paycheck deductions, withholdings, employer match & IRS caps on every prompt.
              </span>
            </div>

            <div className="flex items-center gap-2">
              {isDirty && taxProfile && (
                <button
                  type="button"
                  onClick={() => {
                    setProfileForm(buildInitialForm(taxProfile));
                    setIsDirty(false);
                    setProfileError('');
                    setProfileNotice('');
                  }}
                  className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  Discard Changes
                </button>
              )}
              <button
                type="submit"
                disabled={savingProfile}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                {savingProfile ? 'Saving…' : 'Save Paystub & Tax Profile'}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
