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
    id: 'claude-haiku-5-5',
    provider: 'anthropic',
    label: 'Claude Haiku 5.5',
    badge: 'Default • Anthropic',
    description: 'Latest Claude Haiku — fast, crisp financial & tax analysis',
  },
  {
    id: 'claude-haiku-4-5',
    provider: 'anthropic',
    label: 'Claude Haiku 4.5',
    badge: 'Fallback • Anthropic',
    description: 'Previous-gen Claude Haiku fallback',
  },
  {
    id: 'claude-sonnet-5-5',
    provider: 'anthropic',
    label: 'Claude Sonnet 5.5',
    badge: 'Deep CFO • Anthropic',
    description: 'Flagship Anthropic reasoning for complex tax & wealth strategy',
  },
  {
    id: 'gemini-4-hydrogen',
    provider: 'gemini',
    label: 'Gemini 4 Hydrogen',
    badge: 'Free Backup',
    description: 'Free-tier Gemini 4 backup model',
  },
  {
    id: 'gemini-3.8-flash',
    provider: 'gemini',
    label: 'Gemini 3.8 Flash',
    badge: 'Free Backup',
    description: 'Fast Gemini 3.8 Flash model on Free Tier',
  },
  {
    id: 'gemini-3.5-flash-lite',
    provider: 'gemini',
    label: 'Gemini 3.5 Flash-Lite',
    badge: 'Free Backup',
    description: 'High-quota fast workhorse on Free Tier (500 req/day)',
  },
  {
    id: 'gemini-3.1-flash-lite',
    provider: 'gemini',
    label: 'Gemini 3.1 Flash-Lite',
    badge: 'Free Backup',
    description: 'Secondary high-quota fast fallback on Free Tier (500 req/day)',
  },
  {
    id: 'gemma-4-31b-it',
    provider: 'gemini',
    label: 'Gemma 4 31B',
    badge: 'Free Backup',
    description: 'Open 31B backup model with ultra-high Free Tier quota (14.4K req/day)',
  },
] as const;

const ALLOWED_MODEL_IDS = new Set<string>(ALLOWED_MODELS.map((m) => m.id));

async function callAnthropicModel(
  apiKey: string,
  targetModel: string,
  systemInstruction: string,
  cleanedMessages: Array<{ role: string; text: string }>
) {
  // Normalize into strictly alternating user/assistant turns starting with user
  const normalized: Array<{ role: 'user' | 'assistant'; text: string }> = [];
  for (const m of cleanedMessages) {
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    const text = m.text.trim();
    if (!text) continue;
    if (normalized.length === 0 && role === 'assistant') {
      continue;
    }
    const prev = normalized[normalized.length - 1];
    if (prev && prev.role === role) {
      prev.text = `${prev.text}\n\n${text}`;
    } else {
      normalized.push({ role, text });
    }
  }

  if (normalized.length === 0) {
    throw new Error('Please include at least one user message.');
  }

  const anthropicMessages = normalized.map((m) => ({
    role: m.role,
    content: [{ type: 'text', text: m.text }],
  }));

  const isClaude55 = targetModel.includes('-5-5');
  const reqPayload: Record<string, unknown> = {
    model: targetModel,
    max_tokens: isClaude55 ? 16384 : 8192,
    system: [{ type: 'text', text: systemInstruction }],
    messages: anthropicMessages,
  };
  if (isClaude55) {
    reqPayload.thinking = { type: 'adaptive' };
    reqPayload.output_config = { effort: 'medium' };
  }

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2026-10-21',
    },
    body: JSON.stringify(reqPayload),
    signal: AbortSignal.timeout(55000),
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const errMsg =
      (json as { error?: { message?: string } })?.error?.message ||
      resp.statusText ||
      'Anthropic API request failed';
    throw new Error(`${resp.status} ${errMsg}`);
  }

  const contentBlocks = Array.isArray((json as { content?: unknown }).content)
    ? ((json as { content: Array<{ type?: string; text?: string }> }).content)
    : [];
  const replyText = contentBlocks
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text!)
    .join('\n')
    .trim();

  const rawUsage = (json as { usage?: Record<string, unknown> })?.usage || {};
  const inputTokens = Number(rawUsage.input_net_tokens ?? rawUsage.input_tokens ?? 0);
  const outputTokens = Number(rawUsage.output_tokens ?? 0);

  if (!replyText) {
    const stopReason = (json as { stop_reason?: string })?.stop_reason;
    console.warn(
      '[finance-advisor] Empty Anthropic text:',
      JSON.stringify({
        model: targetModel,
        stop_reason: stopReason,
        blockTypes: contentBlocks.map((b) => b?.type),
        usage: rawUsage,
      })
    );
    if (stopReason === 'max_tokens') {
      throw new Error(
        `Claude (${targetModel}) hit max_tokens (${reqPayload.max_tokens}) during internal reasoning before emitting a final response. Please retry.`
      );
    }
  }

  return {
    reply: replyText,
    usage: {
      total_tokens: inputTokens + outputTokens,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    },
  };
}

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
    jsonContext: JSON.stringify(summaryBlock),
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
    const anthropicKey = (Deno.env.get('ANTHROPIC_API_KEY') || '').trim();
    const geminiKey = (Deno.env.get('GEMINI_API_KEY') || '').trim();

    // Quick status check so the UI knows which provider secrets are wired up
    if (body?.action === 'status') {
      return jsonResp({
        configured: Boolean(anthropicKey || geminiKey),
        providers: {
          anthropic: Boolean(anthropicKey),
          gemini: Boolean(geminiKey),
        },
        defaultModel: 'claude-haiku-5-5',
        models: ALLOWED_MODELS,
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

    const requestedModel = String(body?.model || 'claude-haiku-5-5');
    const model = ALLOWED_MODEL_IDS.has(requestedModel) ? requestedModel : 'claude-haiku-5-5';
    const provider = model.startsWith('claude-') ? 'anthropic' : 'gemini';
    const scope = String(body?.scope || 'combined');
    const includeNotes = Boolean(body?.includeNotes);

    if (provider === 'anthropic' && !anthropicKey) {
      return jsonResp({
        configured: false,
        missingProvider: 'anthropic',
        error:
          'ANTHROPIC_API_KEY is not configured yet in Supabase Edge Function Secrets.',
      });
    }

    if (provider === 'gemini' && !geminiKey) {
      return jsonResp({
        configured: false,
        missingProvider: 'gemini',
        error:
          'GEMINI_API_KEY is not configured in Supabase Edge Function Secrets.',
      });
    }

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

    if (provider === 'anthropic') {
      let usedModel = model;
      let fallbackNote = '';
      let result: { reply: string; usage: { total_tokens: number; input_tokens: number; output_tokens: number } } | null = null;
      const attempts: Array<{ model: string; error: string }> = [];

      try {
        result = await callAnthropicModel(anthropicKey, model, systemInstruction, cleanedMessages);
      } catch (primaryErr) {
        const primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
        console.error(`[finance-advisor] Primary Anthropic model ${model} failed:`, primaryMsg);
        attempts.push({ model, error: primaryMsg });

        const shouldFallback =
          /404|429|500|502|503|504|529|overloaded|not_found|not found|timeout|timed out|AbortError/i.test(
            primaryMsg
          );

        if (shouldFallback && model !== 'claude-haiku-4-5') {
          try {
            result = await callAnthropicModel(
              anthropicKey,
              'claude-haiku-4-5',
              systemInstruction,
              cleanedMessages
            );
            usedModel = 'claude-haiku-4-5';
            fallbackNote = `${model} was temporarily unavailable or unsupported on this endpoint. Answered automatically using claude-haiku-4-5.`;
          } catch (fbErr) {
            const fbMsg = fbErr instanceof Error ? fbErr.message : String(fbErr);
            console.error('[finance-advisor] Fallback claude-haiku-4-5 failed:', fbMsg);
            attempts.push({ model: 'claude-haiku-4-5', error: fbMsg });
          }
        }

        if (!result) {
          const detailText =
            attempts.length > 1
              ? 'Anthropic API error across models:\n' +
                attempts.map((a) => `• ${a.model}: ${a.error}`).join('\n')
              : `Anthropic API error (${model}): ${primaryMsg}`;
          return jsonResp({
            configured: true,
            ok: false,
            error: detailText,
          });
        }
      }

      return jsonResp({
        configured: true,
        ok: true,
        reply: result.reply || 'No response text was returned by Claude.',
        model: usedModel,
        requestedModel: model,
        fallbackNote: fallbackNote || undefined,
        usage: result.usage,
        contextStats: stats,
      });
    }

    // Build stateless multi-turn Interactions API steps (store: false) for Gemini backup
    const steps = cleanedMessages.map((m) => ({
      type: m.role === 'assistant' ? ('model_output' as const) : ('user_input' as const),
      content: [{ type: 'text' as const, text: m.text }],
    }));

    const ai = new GoogleGenAI({ apiKey: geminiKey });

    const callModel = async (targetModel: string) => {
      return await ai.interactions.create(
        {
          model: targetModel,
          store: false,
          system_instruction: systemInstruction,
          input: steps,
        },
        { maxRetries: 0, timeout: 25000 }
      );
    };

    let interaction;
    let usedModel = model;
    let fallbackNote = '';
    const attempts: Array<{ model: string; error: string }> = [];

    try {
      interaction = await callModel(model);
    } catch (primaryErr) {
      const primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      console.error(`[finance-advisor] Primary model ${model} failed:`, primaryMsg);
      attempts.push({ model, error: primaryMsg });

      const shouldFallback =
        /429|500|502|503|504|RESOURCE_EXHAUSTED|quota|limit:\s*0|high demand|overloaded|timeout|timed out|AbortError|not found|404|permission|403/i.test(
          primaryMsg
        );

      const fallbackChain = [
        'gemini-4-hydrogen',
        'gemini-3.8-flash',
        'gemini-3.5-flash-lite',
        'gemini-3.1-flash-lite',
        'gemma-4-31b-it',
      ].filter((m) => m !== model);

      if (shouldFallback && fallbackChain.length > 0) {
        for (const fbModel of fallbackChain) {
          try {
            interaction = await callModel(fbModel);
            usedModel = fbModel;
            fallbackNote = `${model} was temporarily unavailable or busy. Answered automatically using ${fbModel}.`;
            break;
          } catch (fbErr) {
            const fbMsg = fbErr instanceof Error ? fbErr.message : String(fbErr);
            console.error(`[finance-advisor] Fallback model ${fbModel} failed:`, fbMsg);
            attempts.push({ model: fbModel, error: fbMsg });
          }
        }

        if (!interaction) {
          return jsonResp({
            configured: true,
            ok: false,
            error:
              'All free-tier models are currently unavailable or busy:\n' +
              attempts.map((a) => `• ${a.model}: ${a.error}`).join('\n'),
          });
        }
      } else {
        return jsonResp({
          configured: true,
          ok: false,
          error: `Gemini API error (${model}): ${primaryMsg}`,
        });
      }
    }

    const reply =
      interaction.output_text ||
      'No response text was returned by Gemini. Please try rephrasing or switching models.';

    return jsonResp({
      configured: true,
      ok: true,
      reply,
      model: usedModel,
      requestedModel: model,
      fallbackNote: fallbackNote || undefined,
      usage: interaction.usage || null,
      contextStats: stats,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Advisor request failed';
    console.error('[finance-advisor] Unhandled error:', message);
    return jsonResp({ configured: true, ok: false, error: message }, 200);
  }
});
