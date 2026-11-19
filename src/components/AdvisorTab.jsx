import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  Send,
  ShieldCheck,
  KeyRound,
  RefreshCw,
  Trash2,
  SlidersHorizontal,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Lock,
  ChevronDown,
  ChevronUp,
  Save,
  TrendingUp,
  Briefcase,
} from 'lucide-react';
import { formatCurrency, toNumber } from '../lib/finance';

const MODELS = [
  {
    id: 'gemini-4-neon',
    label: 'Gemini 4 Neon',
    badge: 'Flagship • Paid',
    desc: 'Newest Gemini 4 reasoning model (requires Paid Tier billing; auto-falls back to Hydrogen on Free Tier)',
  },
  {
    id: 'gemini-4-argon',
    label: 'Gemini 4 Argon',
    badge: 'Balanced • Paid',
    desc: 'Efficient frontier reasoning (requires Paid Tier billing)',
  },
  {
    id: 'gemini-4-hydrogen',
    label: 'Gemini 4 Hydrogen',
    badge: 'Free Tier',
    desc: 'Fast Gemini 4 model — works on Free Tier & Paid Tier',
  },
  {
    id: 'gemini-3.5-flash-lite',
    label: '3.5 Flash-Lite',
    badge: 'Lite • Free',
    desc: 'Ultra-fast lightweight model on Free Tier',
  },
];

// 2026 IRS reference limits (under age 50 standard caps)
const IRS_2026_401K_LIMIT = 24500;
const IRS_2026_HSA_SELF = 4400;
const IRS_2026_HSA_FAMILY = 8750;

const QUICK_PROMPTS = [
  {
    title: 'Full Net Worth & Risk Audit',
    prompt:
      'Give us a sharp executive audit of our combined household net worth, split between us, asset allocation (retirement, stocks/RSUs, cash, real estate, India assets, gold), debt load, and our top 3 actionable priorities right now.',
  },
  {
    title: '2026 Tax Cheat Codes',
    prompt:
      'Based on our pay structure, filing status, state, and accounts, map out our highest-impact tax optimization moves (401k, Mega Backdoor Roth, HSA, Backdoor Roth IRA, ESPP, RSU 22% withholding gap, tax-loss harvesting, and any US/India reporting reminders like FBAR/Form 8938 if relevant).',
  },
  {
    title: '0% Promos & Debt Waterfall',
    prompt:
      'Analyze our active loans, APRs, credit cards, and 0% promo balance transfer expirations. Build a prioritized payoff plan that guarantees we clear promos before revert APR hits without starving our emergency cash runway.',
  },
  {
    title: 'Covered Calls & CSP Plan',
    prompt:
      'Look at our stock positions with 100+ shares and our uninvested brokerage cash. Design a disciplined Covered Call and Cash-Secured Put income strategy with strict risk management (delta targets, 30-45 DTE, earnings avoidance, assignment tax impact, and max capital at risk).',
  },
  {
    title: 'RSU & Concentration Check',
    prompt:
      'Calculate our single-stock and RSU concentration as a percentage of total net worth and liquid net worth, and suggest a practical diversification and sell-to-cover plan.',
  },
  {
    title: 'Where Should Next $10k Go?',
    prompt:
      'Given our current cash runway, debt APRs, upcoming 0% promos, and tax-advantaged headroom, build an exact waterfall showing where our next $10,000 of surplus cash should go.',
  },
];

function renderInlineFormatting(text) {
  // Parse **bold** and `code` cleanly without dangerouslySetInnerHTML
  const parts = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={`b-${key++}`} className="font-semibold text-zinc-100">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={`c-${key++}`}
          className="rounded bg-zinc-800/90 px-1.5 py-0.5 font-mono text-[11px] text-emerald-300"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

function FormattedReply({ text }) {
  const lines = String(text || '').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // Markdown table block
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && i + 1 < lines.length && lines[i + 1].includes('---')) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i].trim());
        i += 1;
      }
      const parseRow = (r) =>
        r
          .slice(1, -1)
          .split('|')
          .map((c) => c.trim());
      const headers = parseRow(tableLines[0]);
      const rows = tableLines.slice(2).map(parseRow);
      blocks.push(
        <div key={`tbl-${i}`} className="my-2 overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900/80 text-zinc-300">
              <tr>
                {headers.map((h, idx) => (
                  <th key={idx} className="px-3 py-2 font-semibold">
                    {renderInlineFormatting(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {rows.map((row, rIdx) => (
                <tr key={rIdx} className="bg-zinc-950/60">
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="px-3 py-2 text-zinc-300 tabular-nums">
                      {renderInlineFormatting(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Headings
    if (trimmed.startsWith('### ')) {
      blocks.push(
        <h4 key={`h3-${i}`} className="mt-3 text-xs font-semibold uppercase tracking-wide text-emerald-300">
          {renderInlineFormatting(trimmed.slice(4))}
        </h4>
      );
      i += 1;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      blocks.push(
        <h3 key={`h2-${i}`} className="mt-3.5 text-sm font-semibold text-zinc-100">
          {renderInlineFormatting(trimmed.slice(3))}
        </h3>
      );
      i += 1;
      continue;
    }
    if (trimmed.startsWith('# ')) {
      blocks.push(
        <h2 key={`h1-${i}`} className="mt-3.5 text-base font-bold text-zinc-50">
          {renderInlineFormatting(trimmed.slice(2))}
        </h2>
      );
      i += 1;
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(trimmed)) {
      blocks.push(<hr key={`hr-${i}`} className="my-3 border-zinc-800" />);
      i += 1;
      continue;
    }

    // Bullet list
    if (/^[-*•]\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*•]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ul key={`ul-${i}`} className="my-1.5 list-disc space-y-1 pl-5 text-zinc-300">
          {items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInlineFormatting(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ol key={`ol-${i}`} className="my-1.5 list-decimal space-y-1 pl-5 text-zinc-300">
          {items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInlineFormatting(item)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Paragraph
    blocks.push(
      <p key={`p-${i}`} className="leading-relaxed text-zinc-300">
        {renderInlineFormatting(trimmed)}
      </p>
    );
    i += 1;
  }

  return <div className="space-y-1.5 text-xs sm:text-[13px]">{blocks}</div>;
}

export default function AdvisorTab({
  supabase,
  session,
  accounts,
  equityHoldings,
  taxProfile,
  householdScope,
  householdNames,
  privacyMode,
  onTaxProfileSaved,
}) {
  const [selectedModel, setSelectedModel] = useState('gemini-4-neon');
  const [includeNotes, setIncludeNotes] = useState(false);
  const [advisorStatus, setAdvisorStatus] = useState({
    checking: true,
    configured: false,
    error: '',
  });

  // Chat state (stateless in memory — cleared on refresh / New Chat)
  const [messages, setMessages] = useState([]);
  const [draftInput, setDraftInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState('');
  const chatEndRef = useRef(null);

  // Zero-PII Pay & Tax Profile form state
  const [profileOpen, setProfileOpen] = useState(
    !taxProfile ||
      (toNumber(taxProfile.primary_base_salary) === 0 && toNumber(taxProfile.spouse_base_salary) === 0)
  );
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState('');
  const [profileError, setProfileError] = useState('');

  const [profileForm, setProfileForm] = useState({
    filing_status: 'married_filing_jointly',
    state_code: '',
    dependents_count: '0',
    primary_base_salary: '',
    primary_bonus_annual: '',
    primary_rsu_annual: '',
    primary_401k_ytd: '',
    primary_has_mega_backdoor: false,
    primary_espp_enrolled: false,
    spouse_base_salary: '',
    spouse_bonus_annual: '',
    spouse_rsu_annual: '',
    spouse_401k_ytd: '',
    spouse_has_mega_backdoor: false,
    spouse_espp_enrolled: false,
    hsa_plan_type: 'none',
    hsa_contrib_ytd: '',
    risk_tolerance: 'moderate_growth',
    financial_goals: '',
  });

  useEffect(() => {
    if (!taxProfile) return;
    setProfileForm({
      filing_status: taxProfile.filing_status || 'married_filing_jointly',
      state_code: taxProfile.state_code || '',
      dependents_count: String(taxProfile.dependents_count ?? 0),
      primary_base_salary: toNumber(taxProfile.primary_base_salary) ? String(taxProfile.primary_base_salary) : '',
      primary_bonus_annual: toNumber(taxProfile.primary_bonus_annual) ? String(taxProfile.primary_bonus_annual) : '',
      primary_rsu_annual: toNumber(taxProfile.primary_rsu_annual) ? String(taxProfile.primary_rsu_annual) : '',
      primary_401k_ytd: toNumber(taxProfile.primary_401k_ytd) ? String(taxProfile.primary_401k_ytd) : '',
      primary_has_mega_backdoor: Boolean(taxProfile.primary_has_mega_backdoor),
      primary_espp_enrolled: Boolean(taxProfile.primary_espp_enrolled),
      spouse_base_salary: toNumber(taxProfile.spouse_base_salary) ? String(taxProfile.spouse_base_salary) : '',
      spouse_bonus_annual: toNumber(taxProfile.spouse_bonus_annual) ? String(taxProfile.spouse_bonus_annual) : '',
      spouse_rsu_annual: toNumber(taxProfile.spouse_rsu_annual) ? String(taxProfile.spouse_rsu_annual) : '',
      spouse_401k_ytd: toNumber(taxProfile.spouse_401k_ytd) ? String(taxProfile.spouse_401k_ytd) : '',
      spouse_has_mega_backdoor: Boolean(taxProfile.spouse_has_mega_backdoor),
      spouse_espp_enrolled: Boolean(taxProfile.spouse_espp_enrolled),
      hsa_plan_type: taxProfile.hsa_plan_type || 'none',
      hsa_contrib_ytd: toNumber(taxProfile.hsa_contrib_ytd) ? String(taxProfile.hsa_contrib_ytd) : '',
      risk_tolerance: taxProfile.risk_tolerance || 'moderate_growth',
      financial_goals: taxProfile.financial_goals || '',
    });
  }, [taxProfile]);

  const checkAdvisorStatus = useCallback(async () => {
    setAdvisorStatus((prev) => ({ ...prev, checking: true, error: '' }));
    try {
      const { data, error } = await supabase.functions.invoke('finance-advisor', {
        body: { action: 'status' },
      });
      if (error) throw error;
      setAdvisorStatus({
        checking: false,
        configured: Boolean(data?.configured),
        error: '',
      });
    } catch (err) {
      setAdvisorStatus({
        checking: false,
        configured: false,
        error: err?.message || 'Unable to reach finance-advisor Edge Function.',
      });
    }
  }, [supabase]);

  useEffect(() => {
    checkAdvisorStatus();
  }, [checkAdvisorStatus]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const mask = (str) => (privacyMode ? '••••••' : str);

  // Live 2026 comp & tax-advantaged headroom calculations
  const compStats = useMemo(() => {
    const pTotal =
      toNumber(profileForm.primary_base_salary) +
      toNumber(profileForm.primary_bonus_annual) +
      toNumber(profileForm.primary_rsu_annual);
    const sTotal =
      toNumber(profileForm.spouse_base_salary) +
      toNumber(profileForm.spouse_bonus_annual) +
      toNumber(profileForm.spouse_rsu_annual);
    const combinedComp = pTotal + sTotal;

    const p401kRem = Math.max(0, IRS_2026_401K_LIMIT - toNumber(profileForm.primary_401k_ytd));
    const s401kRem =
      sTotal > 0 ? Math.max(0, IRS_2026_401K_LIMIT - toNumber(profileForm.spouse_401k_ytd)) : 0;

    const hsaLimit =
      profileForm.hsa_plan_type === 'family'
        ? IRS_2026_HSA_FAMILY
        : profileForm.hsa_plan_type === 'self'
        ? IRS_2026_HSA_SELF
        : 0;
    const hsaRem = Math.max(0, hsaLimit - toNumber(profileForm.hsa_contrib_ytd));

    return { pTotal, sTotal, combinedComp, p401kRem, s401kRem, hsaLimit, hsaRem };
  }, [profileForm]);

  const ccEligibleLots = useMemo(() => {
    const activeIds = new Set((accounts || []).filter((a) => !a.is_archived).map((a) => a.id));
    return (equityHoldings || [])
      .filter((h) => activeIds.has(h.account_id) && toNumber(h.shares) >= 100)
      .map((h) => ({
        id: h.id,
        symbol: h.symbol,
        shares: toNumber(h.shares),
        contracts: Math.floor(toNumber(h.shares) / 100),
      }));
  }, [accounts, equityHoldings]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileError('');
    setProfileNotice('');

    try {
      const payload = {
        user_id: session.user.id,
        filing_status: profileForm.filing_status,
        state_code: profileForm.state_code.trim().toUpperCase().slice(0, 10),
        dependents_count: Math.max(0, Math.min(20, parseInt(profileForm.dependents_count || '0', 10) || 0)),
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
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('tax_comp_profiles')
        .upsert(payload, { onConflict: 'user_id' });
      if (error) throw error;

      setProfileNotice('Pay & Tax Profile saved under AAL2 RLS. Gemini Advisor will use it immediately.');
      if (onTaxProfileSaved) await onTaxProfileSaved();
    } catch (err) {
      setProfileError(err?.message || 'Failed to save Pay & Tax Profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const sendMessage = async (textToSend) => {
    const clean = String(textToSend || '').trim();
    if (!clean || sending) return;

    const nextHistory = [...messages, { role: 'user', text: clean }];
    setMessages(nextHistory);
    setDraftInput('');
    setChatError('');
    setSending(true);

    try {
      const { data, error } = await supabase.functions.invoke('finance-advisor', {
        body: {
          action: 'chat',
          model: selectedModel,
          scope: householdScope,
          includeNotes,
          messages: nextHistory,
        },
      });
      if (error) {
        let detailedMsg = error.message;
        try {
          if (error.context && typeof error.context.json === 'function') {
            const errJson = await error.context.json();
            if (errJson?.error) detailedMsg = errJson.error;
          }
        } catch {
          // Keep default error.message
        }
        throw new Error(detailedMsg);
      }

      if (data?.configured === false) {
        setAdvisorStatus({ checking: false, configured: false, error: '' });
        setChatError(data?.error || 'GEMINI_API_KEY is not configured yet.');
        return;
      }

      if (data?.ok === false || data?.error) {
        throw new Error(data.error || 'Gemini Advisor returned an error.');
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: data?.reply || 'No response returned.',
          model: data?.model || selectedModel,
          fallbackNote: data?.fallbackNote || '',
          usage: data?.usage || null,
        },
      ]);
    } catch (err) {
      setChatError(err?.message || 'Gemini Advisor call failed.');
    } finally {
      setSending(false);
    }
  };

  const handleSubmitChat = (e) => {
    e.preventDefault();
    sendMessage(draftInput);
  };

  return (
    <div className="space-y-5">
      {/* Top Header & Privacy Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800/90 bg-zinc-950/80 p-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <Sparkles className="h-4 w-4" />
            </div>
            <h1 className="text-base font-semibold text-zinc-100">Gemini 4 Family CFO & Tax Advisor</h1>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
              <Lock className="h-2.5 w-2.5" />
              Stateless (store=false)
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-300">
              <ShieldCheck className="h-2.5 w-2.5" />
              Zero PII • VINs & Emails Stripped
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Reads your live AAL2-protected accounts, RSUs, 0% promos, India/US real assets & pay profile server-side via Supabase Edge Functions.
          </p>
        </div>

        {/* Model Selector */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/70 p-1 text-[11px]">
          {MODELS.map((m) => (
            <button
              key={m.id}
              type="button"
              title={m.desc}
              onClick={() => setSelectedModel(m.id)}
              className={`rounded-md px-2.5 py-1.5 font-medium transition ${
                selectedModel === m.id
                  ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/40'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span>{m.label}</span>
              <span className="ml-1.5 hidden text-[10px] opacity-70 sm:inline">• {m.badge}</span>
            </button>
          ))}
        </div>
      </div>

      {/* API Key Setup Card (shown until GEMINI_API_KEY secret is added in Supabase) */}
      {!advisorStatus.checking && !advisorStatus.configured && (
        <div className="rounded-xl border border-amber-500/35 bg-amber-500/5 p-5 text-xs">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/15 text-amber-300">
                <KeyRound className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-amber-200">
                  Connect Your Gemini API Key (2-Minute One-Time Setup)
                </h2>
                <p className="mt-1 max-w-2xl text-zinc-300 leading-relaxed">
                  Your API key is stored exclusively inside <strong>Supabase Edge Function Secrets</strong> — never in GitHub, never in your browser, and always protected behind your single-owner 2FA login.
                </p>

                <ol className="mt-3 list-decimal space-y-1.5 pl-4 text-zinc-300">
                  <li>
                    Generate a Gemini API key at{' '}
                    <a
                      href="https://aistudio.google.com/apikey"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-emerald-300 underline hover:text-emerald-200"
                    >
                      Google AI Studio (aistudio.google.com/apikey)
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </li>
                  <li>
                    Open your{' '}
                    <a
                      href="https://supabase.com/dashboard/project/ucrbocknokusjjayrgpf/functions/secrets"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-sky-300 underline hover:text-sky-200"
                    >
                      Supabase Edge Function Secrets
                      <ExternalLink className="h-3 w-3" />
                    </a>{' '}
                    and add a secret named <code className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-amber-200">GEMINI_API_KEY</code>.
                  </li>
                  <li>Click <strong>Re-check Connection</strong> below — chat unlocks instantly.</li>
                </ol>

                {advisorStatus.error && (
                  <p className="mt-2 text-rose-300">{advisorStatus.error}</p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={checkAdvisorStatus}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-500/20 px-3.5 py-2 font-semibold text-amber-100 hover:bg-amber-500/30"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Re-check Connection
            </button>
          </div>
        </div>
      )}

      {/* Collapsible Zero-PII Pay & Tax Profile Card */}
      <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/80">
        <button
          type="button"
          onClick={() => setProfileOpen(!profileOpen)}
          className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-left"
        >
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <SlidersHorizontal className="h-4 w-4 text-emerald-400" />
            <span className="text-sm font-semibold text-zinc-100">
              Household Pay Structure & Tax Profile (Zero-PII)
            </span>
            {compStats.combinedComp > 0 ? (
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] text-emerald-300 tabular-nums">
                Est. Gross Comp: {mask(formatCurrency(compStats.combinedComp, { decimals: 0 }))}/yr
              </span>
            ) : (
              <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-400">
                Optional — unlocks exact tax bracket & 401(k)/HSA math
              </span>
            )}
            {ccEligibleLots.length > 0 && (
              <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 font-mono text-[10px] text-sky-300">
                CC-Eligible: {ccEligibleLots.map((l) => `${l.symbol} (${l.contracts}x)`).join(', ')}
              </span>
            )}
          </div>
          <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
            {profileOpen ? 'Hide' : 'Edit Profile'}
            {profileOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </button>

        {profileOpen && (
          <form onSubmit={handleSaveProfile} className="space-y-4 border-t border-zinc-800/80 p-5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3.5 py-2 text-[11px] text-zinc-400">
              <span>
                Enter rough annual numbers only — <strong className="text-zinc-200">never enter SSN, street address, employer ID, or account numbers.</strong>
              </span>
              <span className="font-mono text-emerald-400">Protected by AAL2 RLS</span>
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

            {/* Filing & Household Tax Basics */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block text-zinc-300">
                Tax Filing Status
                <select
                  value={profileForm.filing_status}
                  onChange={(e) => setProfileForm({ ...profileForm, filing_status: e.target.value })}
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
                  onChange={(e) => setProfileForm({ ...profileForm, state_code: e.target.value.toUpperCase() })}
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
                  onChange={(e) => setProfileForm({ ...profileForm, dependents_count: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100"
                />
              </label>

              <label className="block text-zinc-300">
                Risk Tolerance
                <select
                  value={profileForm.risk_tolerance}
                  onChange={(e) => setProfileForm({ ...profileForm, risk_tolerance: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100"
                >
                  <option value="conservative">Conservative (Capital Preservation)</option>
                  <option value="moderate_growth">Moderate Growth (Balanced)</option>
                  <option value="aggressive">Aggressive Growth</option>
                </select>
              </label>
            </div>

            {/* Primary & Spouse Comp Split */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Primary */}
              <div className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-emerald-200">
                    {householdNames.primary_name} — Pay & Benefits
                  </span>
                  <span className="font-mono text-[11px] text-emerald-300">
                    Total: {mask(formatCurrency(compStats.pTotal, { decimals: 0 }))}/yr
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="block text-zinc-300">
                    Base Salary ($)
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      placeholder="0"
                      value={profileForm.primary_base_salary}
                      onChange={(e) => setProfileForm({ ...profileForm, primary_base_salary: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 font-mono text-xs text-zinc-100"
                    />
                  </label>
                  <label className="block text-zinc-300">
                    Annual Bonus ($)
                    <input
                      type="number"
                      min="0"
                      step="500"
                      placeholder="0"
                      value={profileForm.primary_bonus_annual}
                      onChange={(e) => setProfileForm({ ...profileForm, primary_bonus_annual: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 font-mono text-xs text-zinc-100"
                    />
                  </label>
                  <label className="block text-zinc-300">
                    Annual RSU Vest ($)
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      placeholder="0"
                      value={profileForm.primary_rsu_annual}
                      onChange={(e) => setProfileForm({ ...profileForm, primary_rsu_annual: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 font-mono text-xs text-zinc-100"
                    />
                  </label>
                  <label className="block text-zinc-300">
                    401(k) YTD Contrib ($)
                    <input
                      type="number"
                      min="0"
                      step="100"
                      placeholder="0"
                      value={profileForm.primary_401k_ytd}
                      onChange={(e) => setProfileForm({ ...profileForm, primary_401k_ytd: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 font-mono text-xs text-zinc-100"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-4 pt-1 text-[11px] text-zinc-300">
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={profileForm.primary_has_mega_backdoor}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, primary_has_mega_backdoor: e.target.checked })
                      }
                      className="rounded border-zinc-700 bg-zinc-900 text-emerald-500"
                    />
                    Plan allows Mega Backdoor Roth
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={profileForm.primary_espp_enrolled}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, primary_espp_enrolled: e.target.checked })
                      }
                      className="rounded border-zinc-700 bg-zinc-900 text-emerald-500"
                    />
                    ESPP available
                  </label>
                </div>
              </div>

              {/* Spouse */}
              <div className="space-y-3 rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-fuchsia-200">
                    {householdNames.spouse_name} — Pay & Benefits
                  </span>
                  <span className="font-mono text-[11px] text-fuchsia-300">
                    Total: {mask(formatCurrency(compStats.sTotal, { decimals: 0 }))}/yr
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="block text-zinc-300">
                    Base Salary ($)
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      placeholder="0"
                      value={profileForm.spouse_base_salary}
                      onChange={(e) => setProfileForm({ ...profileForm, spouse_base_salary: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 font-mono text-xs text-zinc-100"
                    />
                  </label>
                  <label className="block text-zinc-300">
                    Annual Bonus ($)
                    <input
                      type="number"
                      min="0"
                      step="500"
                      placeholder="0"
                      value={profileForm.spouse_bonus_annual}
                      onChange={(e) => setProfileForm({ ...profileForm, spouse_bonus_annual: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 font-mono text-xs text-zinc-100"
                    />
                  </label>
                  <label className="block text-zinc-300">
                    Annual RSU Vest ($)
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      placeholder="0"
                      value={profileForm.spouse_rsu_annual}
                      onChange={(e) => setProfileForm({ ...profileForm, spouse_rsu_annual: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 font-mono text-xs text-zinc-100"
                    />
                  </label>
                  <label className="block text-zinc-300">
                    401(k) YTD Contrib ($)
                    <input
                      type="number"
                      min="0"
                      step="100"
                      placeholder="0"
                      value={profileForm.spouse_401k_ytd}
                      onChange={(e) => setProfileForm({ ...profileForm, spouse_401k_ytd: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 font-mono text-xs text-zinc-100"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-4 pt-1 text-[11px] text-zinc-300">
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={profileForm.spouse_has_mega_backdoor}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, spouse_has_mega_backdoor: e.target.checked })
                      }
                      className="rounded border-zinc-700 bg-zinc-900 text-fuchsia-500"
                    />
                    Plan allows Mega Backdoor Roth
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={profileForm.spouse_espp_enrolled}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, spouse_espp_enrolled: e.target.checked })
                      }
                      className="rounded border-zinc-700 bg-zinc-900 text-fuchsia-500"
                    />
                    ESPP available
                  </label>
                </div>
              </div>
            </div>

            {/* HSA + Goals */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <label className="block text-zinc-300">
                HSA Eligibility
                <select
                  value={profileForm.hsa_plan_type}
                  onChange={(e) => setProfileForm({ ...profileForm, hsa_plan_type: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100"
                >
                  <option value="none">No HDHP / HSA</option>
                  <option value="self">Self-Only HDHP</option>
                  <option value="family">Family HDHP</option>
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
                  onChange={(e) => setProfileForm({ ...profileForm, hsa_contrib_ytd: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 disabled:opacity-40"
                />
              </label>

              <label className="block text-zinc-300 sm:col-span-2">
                Goals & Strategy Focus (optional)
                <input
                  type="text"
                  placeholder="e.g., Maximize NW, pay 0% promos before expiry, conservative CC/CSP income"
                  value={profileForm.financial_goals}
                  onChange={(e) => setProfileForm({ ...profileForm, financial_goals: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100"
                />
              </label>
            </div>

            {/* Live 2026 Tax-Advantaged Headroom Strip */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-[11px]">
              <div className="flex flex-wrap items-center gap-4 tabular-nums">
                <span className="inline-flex items-center gap-1.5 font-medium text-zinc-300">
                  <Briefcase className="h-3.5 w-3.5 text-emerald-400" />
                  2026 Remaining Tax-Advantaged Headroom:
                </span>
                <span className="text-zinc-400">
                  {householdNames.primary_name} 401(k):{' '}
                  <strong className="font-mono text-emerald-300">
                    {mask(formatCurrency(compStats.p401kRem, { decimals: 0 }))}
                  </strong>
                </span>
                {compStats.sTotal > 0 && (
                  <span className="text-zinc-400">
                    {householdNames.spouse_name} 401(k):{' '}
                    <strong className="font-mono text-fuchsia-300">
                      {mask(formatCurrency(compStats.s401kRem, { decimals: 0 }))}
                    </strong>
                  </span>
                )}
                {compStats.hsaLimit > 0 && (
                  <span className="text-zinc-400">
                    HSA:{' '}
                    <strong className="font-mono text-sky-300">
                      {mask(formatCurrency(compStats.hsaRem, { decimals: 0 }))}
                    </strong>
                  </span>
                )}
              </div>

              <button
                type="submit"
                disabled={savingProfile}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                {savingProfile ? 'Saving…' : 'Save Pay & Tax Profile'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Main Gemini Chat Console */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-zinc-800/90 bg-zinc-950/80">
        {/* Chat Sub-Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 bg-zinc-900/40 px-4 py-2.5 text-[11px]">
          <div className="flex flex-wrap items-center gap-3 text-zinc-400">
            <span className="inline-flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${
                  advisorStatus.configured ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
              {advisorStatus.checking
                ? 'Checking Gemini connection…'
                : advisorStatus.configured
                ? `Connected • ${MODELS.find((m) => m.id === selectedModel)?.label}`
                : 'Awaiting GEMINI_API_KEY secret'}
            </span>
            <label className="flex cursor-pointer items-center gap-1.5 text-zinc-400 hover:text-zinc-200">
              <input
                type="checkbox"
                checked={includeNotes}
                onChange={(e) => setIncludeNotes(e.target.checked)}
                className="rounded border-zinc-700 bg-zinc-900 text-emerald-500"
              />
              Include custom account notes
            </label>
          </div>

          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setMessages([]);
                setChatError('');
              }}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-zinc-400 hover:text-zinc-200"
            >
              <Trash2 className="h-3 w-3" />
              New Chat
            </button>
          )}
        </div>

        {/* Messages Feed */}
        <div className="min-h-[380px] max-h-[62vh] overflow-y-auto p-5 space-y-4">
          {messages.length === 0 ? (
            <div className="space-y-4">
              <div className="text-center py-4">
                <div className="mx-auto mb-2.5 flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-semibold text-zinc-100">
                  Ask Anything About Your Family Wealth, Taxes & Options Strategy
                </h3>
                <p className="mx-auto mt-1 max-w-xl text-xs text-zinc-500">
                  Every prompt automatically includes your live combined & individual balances, RSUs, 0% promo deadlines, loans, India/US real assets, and saved Pay & Tax Profile.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {QUICK_PROMPTS.map((q) => (
                  <button
                    key={q.title}
                    type="button"
                    disabled={!advisorStatus.configured || sending}
                    onClick={() => sendMessage(q.prompt)}
                    className="group rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5 text-left transition hover:border-emerald-500/40 hover:bg-zinc-900/80 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <div className="text-xs font-semibold text-zinc-200 group-hover:text-emerald-300">
                      {q.title}
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-zinc-500">
                      {q.prompt}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[90%] rounded-2xl px-4 py-3 sm:max-w-[82%] ${
                    m.role === 'user'
                      ? 'border border-emerald-500/30 bg-emerald-500/15 text-xs text-zinc-100 sm:text-[13px]'
                      : 'border border-zinc-800 bg-zinc-900/70 text-zinc-200'
                  }`}
                >
                  {m.role === 'assistant' && (
                    <div className="mb-2 space-y-1.5 border-b border-zinc-800/80 pb-1.5 text-[10px] text-zinc-500">
                      <div className="flex items-center justify-between gap-4">
                        <span className="inline-flex items-center gap-1 font-medium text-emerald-300">
                          <Sparkles className="h-3 w-3" />
                          {MODELS.find((x) => x.id === m.model)?.label || m.model || 'Gemini 4'}
                        </span>
                        {m.usage?.total_tokens && (
                          <span className="font-mono">{m.usage.total_tokens.toLocaleString()} tokens</span>
                        )}
                      </div>
                      {m.fallbackNote && (
                        <div className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200">
                          {m.fallbackNote}
                        </div>
                      )}
                    </div>
                  )}

                  {m.role === 'user' ? (
                    <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                  ) : (
                    <FormattedReply text={m.text} />
                  )}
                </div>
              </div>
            ))
          )}

          {sending && (
            <div className="flex justify-start">
              <div className="inline-flex items-center gap-2.5 rounded-2xl border border-zinc-800 bg-zinc-900/70 px-4 py-3 text-xs text-zinc-300">
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
                Analyzing your household balance sheet & tax profile with{' '}
                {MODELS.find((m) => m.id === selectedModel)?.label}…
              </div>
            </div>
          )}

          {chatError && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{chatError}</span>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input Composer */}
        <form
          onSubmit={handleSubmitChat}
          className="border-t border-zinc-800/90 bg-zinc-900/30 p-3.5"
        >
          <div className="flex items-end gap-2">
            <textarea
              rows={2}
              disabled={!advisorStatus.configured || sending}
              placeholder={
                advisorStatus.configured
                  ? 'Ask about tax optimization, RSU diversification, 0% promo payoff, mortgage vs. invest, or covered call / CSP sizing…'
                  : 'Connect your GEMINI_API_KEY in Supabase Secrets above to start chatting…'
              }
              value={draftInput}
              onChange={(e) => setDraftInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(draftInput);
                }
              }}
              className="flex-1 resize-none rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-emerald-500/60 focus:outline-none disabled:opacity-50 sm:text-sm"
            />
            <button
              type="submit"
              disabled={!advisorStatus.configured || sending || !draftInput.trim()}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500 px-4 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" />
              Ask CFO
            </button>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center justify-between text-[10px] text-zinc-500">
            <span>Enter to send • Shift+Enter for new line</span>
            <span>Educational financial analysis — verify major tax filings with a CPA.</span>
          </div>
        </form>
      </div>
    </div>
  );
}
