import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { GoogleGenAI } from 'npm:@google/genai@^3.2.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWED_MODELS = [
  {
    id: 'gemini-4-neon',
    label: 'Gemini 4 Neon',
    badge: 'Latest Flagship',
    description: 'Newest Gemini 4 reasoning model for tax optimization, RSU math, debt & options strategy',
  },
  {
    id: 'gemini-4-argon',
    label: 'Gemini 4 Argon',
    badge: 'Balanced CFO',
    description: 'Efficient frontier reasoning for interactive financial & tax planning',
  },
  {
    id: 'gemini-4-hydrogen',
    label: 'Gemini 4 Hydrogen',
    badge: 'Fast',
    description: 'Fast interactive Q&A on balances, spending & quick calculations',
  },
] as const;

const ALLOWED_MODEL_IDS = new Set<string>(ALLOWED_MODELS.map((m) => m.id));

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function usd(v: number): string {
  const sign = v < 0 ? '-' : '';
  return `${sign}$${Math.abs(v).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function buildSanitizedFinancialContext(params: {
  accounts: Array<Record<string, unknown>>;
  holdings: Array<Record<string, unknown>>;
  promos: Array<Record<string, unknown>>;
  expenses: Array<Record<string, unknown>>;
  bills: Array<Record<string, unknown>>;
  budgets: Array<Record<string, unknown>>;
  household: Record<string, unknown> | null;
  taxProfile: Record<string, unknown> | null;
  scope: string;
  includeNotes: boolean;
}) {
  const {
    accounts,
    holdings,
    promos,
    expenses,
    bills,
    budgets,
    household,
    taxProfile,
    scope,
    includeNotes,
  } = params;

  const primaryName = String(household?.primary_name || 'Primary');
  const spouseName = String(household?.spouse_name || 'Spouse');
  const ownerLabel = (profile: unknown) => {
    if (profile === 'spouse') return spouseName;
    if (profile === 'joint') return 'Joint';
    return primaryName;
  };

  const activeAccounts = accounts.filter((a) => !a.is_archived);
  const accMap = new Map<number, Record<string, unknown>>();
  for (const a of activeAccounts) accMap.set(Number(a.id), a);

  const byOwner: Record<string, { assets: number; liabilities: number; netWorth: number }> = {
    primary: { assets: 0, liabilities: 0, netWorth: 0 },
    spouse: { assets: 0, liabilities: 0, netWorth: 0 },
    joint: { assets: 0, liabilities: 0, netWorth: 0 },
    combined: { assets: 0, liabilities: 0, netWorth: 0 },
  };

  const byCategory: Record<string, number> = {};
  for (const a of activeAccounts) {
    const bal = num(a.current_balance);
    const owner = byOwner[String(a.owner_profile)] ? String(a.owner_profile) : 'primary';
    const cat = String(a.category || 'other_asset');
    byCategory[cat] = (byCategory[cat] || 0) + bal;
    if (a.is_liability) {
      byOwner[owner].liabilities += bal;
      byOwner.combined.liabilities += bal;
    } else {
      byOwner[owner].assets += bal;
      byOwner.combined.assets += bal;
    }
  }
  for (const k of Object.keys(byOwner)) {
    byOwner[k].netWorth = byOwner[k].assets - byOwner[k].liabilities;
  }

  // Accounts list (PII-scrubbed: no VINs, no user_id, optional notes)
  const sanitizedAccounts = activeAccounts.map((a) => {
    const meta = (a.metadata || {}) as Record<string, unknown>;
    const linkedLoanId = Number(meta.linked_loan_id || 0);
    const linkedLoan = linkedLoanId ? accMap.get(linkedLoanId) : null;

    const item: Record<string, unknown> = {
      name: a.name,
      owner: ownerLabel(a.owner_profile),
      category: a.category,
      subtype: a.subtype,
      institution: a.institution || undefined,
      is_liability: Boolean(a.is_liability),
      balance_usd: Number(num(a.current_balance).toFixed(2)),
    };

    if (!a.is_liability && num(a.cash_balance) > 0) {
      item.uninvested_cash_usd = Number(num(a.cash_balance).toFixed(2));
    }
    if (num(a.interest_rate) > 0) item.rate_pct = num(a.interest_rate);
    if (num(a.credit_limit) > 0) item.credit_limit_usd = num(a.credit_limit);
    if (num(a.original_principal) > 0) item.original_principal_usd = num(a.original_principal);
    if (num(a.minimum_payment) > 0) item.monthly_payment_usd = num(a.minimum_payment);

    if (meta.real_asset_type === 'gold') {
      item.real_asset_details = {
        type: 'physical_gold',
        weight: meta.gold_weight,
        unit: meta.gold_unit,
        purity: meta.gold_purity,
        spot_usd_per_oz: meta.last_gold_oz_price,
      };
    } else if (meta.real_asset_type === 'india_property') {
      item.real_asset_details = {
        type: 'india_property',
        inr_amount: meta.inr_amount,
        inr_unit: meta.inr_unit,
        usd_inr_rate: meta.last_usd_inr_rate,
        city: meta.property_location || undefined,
      };
    } else if (meta.real_asset_type === 'real_estate') {
      item.real_asset_details = {
        type: 'us_real_estate',
        city: meta.property_location || undefined,
        purchase_price_usd: meta.purchase_price || undefined,
        linked_mortgage: linkedLoan ? linkedLoan.name : undefined,
        net_equity_usd: linkedLoan
          ? Number((num(a.current_balance) - num(linkedLoan.current_balance)).toFixed(2))
          : undefined,
      };
    } else if (meta.real_asset_type === 'vehicle') {
      // Deliberately omit VIN from LLM prompt for privacy
      item.real_asset_details = {
        type: 'vehicle',
        vehicle: [meta.vehicle_year, meta.vehicle_make, meta.vehicle_model, meta.vehicle_trim]
          .filter(Boolean)
          .join(' '),
        linked_auto_loan: linkedLoan ? linkedLoan.name : undefined,
        net_equity_usd: linkedLoan
          ? Number((num(a.current_balance) - num(linkedLoan.current_balance)).toFixed(2))
          : undefined,
      };
    }

    if (includeNotes && a.notes) item.notes = a.notes;
    return item;
  });

  // Equity holdings + Covered Call (100+ shares) eligibility & CSP cash capacity
  const sanitizedHoldings = holdings
    .filter((h) => accMap.has(Number(h.account_id)))
    .map((h) => {
      const acc = accMap.get(Number(h.account_id))!;
      const vested = num(h.shares);
      const unvested = num(h.unvested_shares);
      const price = num(h.last_price);
      return {
        account: acc.name,
        owner: ownerLabel(acc.owner_profile),
        account_category: acc.category,
        symbol: h.symbol,
        type: h.holding_type,
        vested_shares: vested,
        unvested_shares: unvested,
        price_usd: price,
        vested_value_usd: Number((vested * price).toFixed(2)),
        unvested_value_usd: Number((unvested * price).toFixed(2)),
        cost_basis_per_share: h.cost_basis_per_share !== null ? num(h.cost_basis_per_share) : undefined,
        covered_call_contracts_eligible: Math.floor(vested / 100),
      };
    });

  // Active 0% Balance Transfer Promos
  const today = new Date().toISOString().slice(0, 10);
  const activePromos = promos
    .filter((p) => !p.is_paid_off && num(p.promo_balance) > 0)
    .map((p) => {
      const acc = accMap.get(Number(p.account_id));
      return {
        card: acc?.name || 'Credit Card',
        owner: acc ? ownerLabel(acc.owner_profile) : primaryName,
        label: p.label,
        promo_balance_usd: num(p.promo_balance),
        promo_apr_pct: num(p.promo_apr),
        revert_apr_pct: p.standard_apr !== null ? num(p.standard_apr) : undefined,
        expires_on: p.expires_on,
      };
    });

  // Monthly Expenses summary (last 3 months grouped)
  const monthlySpend: Record<string, { total: number; essential: number; byCategory: Record<string, number> }> = {};
  for (const e of expenses) {
    const mk = String(e.expense_date || '').slice(0, 7);
    if (!mk) continue;
    if (!monthlySpend[mk]) monthlySpend[mk] = { total: 0, essential: 0, byCategory: {} };
    const amt = num(e.amount);
    monthlySpend[mk].total += amt;
    if (e.is_essential) monthlySpend[mk].essential += amt;
    const cat = String(e.category || 'Other');
    monthlySpend[mk].byCategory[cat] = (monthlySpend[mk].byCategory[cat] || 0) + amt;
  }
  const recentMonths = Object.entries(monthlySpend)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 3)
    .map(([month, data]) => ({
      month,
      total_spent_usd: Number(data.total.toFixed(2)),
      essential_spent_usd: Number(data.essential.toFixed(2)),
      top_categories: Object.entries(data.byCategory)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([c, amt]) => ({ category: c, usd: Number(amt.toFixed(2)) })),
    }));

  const recurringMonthlyTotal = bills
    .filter((b) => b.is_active)
    .reduce((sum, b) => {
      const amt = num(b.amount);
      if (b.cadence === 'annual') return sum + amt / 12;
      if (b.cadence === 'quarterly') return sum + amt / 3;
      return sum + amt;
    }, 0);

  const budgetMap: Record<string, number> = {};
  for (const b of budgets) {
    budgetMap[String(b.category)] = num(b.monthly_limit);
  }

  const brokerageCashForCsp = activeAccounts
    .filter((a) => a.category === 'investment')
    .reduce((sum, a) => sum + num(a.cash_balance), 0);

  const summaryBlock = {
    as_of_date: today,
    active_ui_scope: scope,
    household_names: { primary: primaryName, spouse: spouseName },
    net_worth_split: {
      combined: {
        assets: usd(byOwner.combined.assets),
        liabilities: usd(byOwner.combined.liabilities),
        net_worth: usd(byOwner.combined.netWorth),
      },
      [primaryName]: {
        assets: usd(byOwner.primary.assets),
        liabilities: usd(byOwner.primary.liabilities),
        net_worth: usd(byOwner.primary.netWorth),
      },
      [spouseName]: {
        assets: usd(byOwner.spouse.assets),
        liabilities: usd(byOwner.spouse.liabilities),
        net_worth: usd(byOwner.spouse.netWorth),
      },
      ...(byOwner.joint.assets > 0 || byOwner.joint.liabilities > 0
        ? {
            joint: {
              assets: usd(byOwner.joint.assets),
              liabilities: usd(byOwner.joint.liabilities),
              net_worth: usd(byOwner.joint.netWorth),
            },
          }
        : {}),
    },
    category_totals_usd: Object.fromEntries(
      Object.entries(byCategory).map(([k, v]) => [k, Number(v.toFixed(2))])
    ),
    accounts: sanitizedAccounts,
    equity_and_rsu_holdings: sanitizedHoldings,
    options_income_readiness: {
      uninvested_brokerage_cash_usd: Number(brokerageCashForCsp.toFixed(2)),
      liquid_bank_cash_usd: Number((byCategory.bank || 0).toFixed(2)),
      covered_call_eligible_lots: sanitizedHoldings
        .filter((h) => h.covered_call_contracts_eligible >= 1)
        .map((h) => ({
          account: h.account,
          symbol: h.symbol,
          shares: h.vested_shares,
          max_contracts: h.covered_call_contracts_eligible,
          price_usd: h.price_usd,
        })),
    },
    active_zero_pct_promos: activePromos,
    recent_monthly_expenses: recentMonths,
    recurring_bills_monthly_baseline_usd: Number(recurringMonthlyTotal.toFixed(2)),
    budgets: Object.keys(budgetMap).length > 0 ? budgetMap : undefined,
    tax_and_comp_profile: taxProfile
      ? {
          filing_status: taxProfile.filing_status,
          state_code: taxProfile.state_code || 'Not specified',
          dependents_count: taxProfile.dependents_count,
          primary_comp: {
            base_salary: num(taxProfile.primary_base_salary),
            annual_bonus: num(taxProfile.primary_bonus_annual),
            annual_rsu: num(taxProfile.primary_rsu_annual),
            contrib_401k_ytd: num(taxProfile.primary_401k_ytd),
            has_mega_backdoor_roth: Boolean(taxProfile.primary_has_mega_backdoor),
            espp_enrolled: Boolean(taxProfile.primary_espp_enrolled),
          },
          spouse_comp: {
            base_salary: num(taxProfile.spouse_base_salary),
            annual_bonus: num(taxProfile.spouse_bonus_annual),
            annual_rsu: num(taxProfile.spouse_rsu_annual),
            contrib_401k_ytd: num(taxProfile.spouse_401k_ytd),
            has_mega_backdoor_roth: Boolean(taxProfile.spouse_has_mega_backdoor),
            espp_enrolled: Boolean(taxProfile.spouse_espp_enrolled),
          },
          hsa_plan_type: taxProfile.hsa_plan_type,
          hsa_contrib_ytd: num(taxProfile.hsa_contrib_ytd),
          risk_tolerance: taxProfile.risk_tolerance,
          financial_goals: taxProfile.financial_goals || undefined,
        }
      : 'Not filled in yet — remind user they can fill in the zero-PII Pay & Tax Profile panel for exact tax-bracket and contribution headroom math.',
  };

  return {
    jsonContext: JSON.stringify(summaryBlock, null, 2),
    stats: {
      accountCount: activeAccounts.length,
      holdingCount: sanitizedHoldings.length,
      promoCount: activePromos.length,
      hasTaxProfile: Boolean(
        taxProfile &&
          (num(taxProfile.primary_base_salary) > 0 || num(taxProfile.spouse_base_salary) > 0)
      ),
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return jsonResp({ error: 'Missing Authorization header' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonResp({ error: 'Supabase environment not configured' }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonResp({ error: 'Unauthorized session' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const apiKey = (Deno.env.get('GEMINI_API_KEY') || '').trim();

    // Quick status check so the UI knows whether GEMINI_API_KEY is wired up
    if (body?.action === 'status') {
      return jsonResp({
        configured: Boolean(apiKey),
        defaultModel: 'gemini-4-neon',
        models: ALLOWED_MODELS,
      });
    }

    if (!apiKey) {
      return jsonResp({
        configured: false,
        error:
          'GEMINI_API_KEY is not configured yet. Add it as a Supabase Edge Function Secret to activate the Gemini 4 AI Advisor.',
      });
    }

    const rawMessages = Array.isArray(body?.messages) ? body.messages : [];
    const cleanedMessages = rawMessages
      .filter(
        (m: unknown): m is { role: string; text: string } =>
          Boolean(m) &&
          typeof (m as { text?: unknown }).text === 'string' &&
          (m as { text: string }).text.trim().length > 0
      )
      .slice(-16);

    if (cleanedMessages.length === 0) {
      return jsonResp({ error: 'Please send at least one message.' }, 400);
    }

    const requestedModel = String(body?.model || 'gemini-4-neon');
    const model = ALLOWED_MODEL_IDS.has(requestedModel) ? requestedModel : 'gemini-4-neon';
    const scope = String(body?.scope || 'combined');
    const includeNotes = Boolean(body?.includeNotes);

    // Pull live vault records strictly under the caller's JWT (single-owner + AAL2 RLS enforced)
    const [accRes, holdRes, promoRes, expRes, billRes, budRes, hhRes, taxRes] = await Promise.all([
      supabase.from('accounts').select('*').order('id', { ascending: true }),
      supabase.from('equity_holdings').select('*').order('id', { ascending: true }),
      supabase.from('credit_card_promos').select('*').order('expires_on', { ascending: true }),
      supabase.from('expenses').select('*').order('expense_date', { ascending: false }).limit(500),
      supabase.from('recurring_bills').select('*').order('due_day', { ascending: true }),
      supabase.from('monthly_budgets').select('*'),
      supabase.from('household_settings').select('*').maybeSingle(),
      supabase.from('tax_comp_profiles').select('*').maybeSingle(),
    ]);

    if (accRes.error) {
      return jsonResp({ error: `Vault RLS check failed: ${accRes.error.message}` }, 403);
    }

    const { jsonContext, stats } = buildSanitizedFinancialContext({
      accounts: accRes.data || [],
      holdings: holdRes.data || [],
      promos: promoRes.data || [],
      expenses: expRes.data || [],
      bills: billRes.data || [],
      budgets: budRes.data || [],
      household: hhRes.data || null,
      taxProfile: taxRes.data || null,
      scope,
      includeNotes,
    });

    const systemInstruction = [
      'You are the private Family CFO, US Tax Optimization Strategist, and Portfolio Risk Advisor inside the user’s private "asfinance" household vault.',
      'Guidelines:',
      '1. Ground EVERY answer in the exact numbers from the LIVE HOUSEHOLD FINANCIAL SNAPSHOT below. Do not invent balances or accounts that are not listed.',
      '2. Be concrete, quantitative, and structured: use clear Markdown headings, bullet points, exact dollar figures, percentages, and prioritized action steps.',
      '3. Tax Optimization ("tax cheat codes"): Analyze 2026 IRS caps (401k employee limit $24,500 if applicable or note current-year cap clearly, Mega Backdoor Roth up to ~$72,000 total 415(c) limit, HSA self/family, Backdoor Roth IRA, ESPP qualifying disposition, RSU 22% supplemental withholding gap vs. higher marginal bracket, tax-loss harvesting, and US/India cross-border reporting reminders like FBAR/Form 8938 when India assets exist).',
      '4. Debt & 0% Promos: Always flag upcoming 0% balance transfer expirations and compute exact monthly payoff cash needed vs. liquid cash runway, and compare mortgage/auto loan APRs against after-tax risk-free yield.',
      '5. Covered Calls (CC) & Cash-Secured Puts (CSP): When asked about options income, ONLY reference eligible 100-share lots or actual available cash, and emphasize strict risk management (position sizing, avoiding earnings week, 20–30 delta OTM strikes, 30–45 DTE, assignment tax consequences on low-basis RSUs/stocks, and never risking emergency fund cash).',
      '6. Privacy & Safety: Never ask for SSN, home street address, full account numbers, or passwords. Include a brief one-line reminder on major tax/legal strategies to verify with a CPA when executing.',
      '',
      '=== LIVE HOUSEHOLD FINANCIAL SNAPSHOT (ANONYMIZED, RLS-VERIFIED) ===',
      jsonContext,
    ].join('\n');

    // Build stateless multi-turn Interactions API steps (store: false)
    const steps = cleanedMessages.map((m) => ({
      type: m.role === 'assistant' ? ('model_output' as const) : ('user_input' as const),
      content: [{ type: 'text' as const, text: m.text }],
    }));

    const ai = new GoogleGenAI({ apiKey });
    const interaction = await ai.interactions.create({
      model,
      store: false,
      system_instruction: systemInstruction,
      input: steps,
    });

    const reply =
      interaction.output_text ||
      'No response text was returned by Gemini. Please try rephrasing or switching models.';

    return jsonResp({
      configured: true,
      reply,
      model,
      usage: interaction.usage || null,
      contextStats: stats,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Advisor request failed';
    return jsonResp({ error: message }, 500);
  }
});
