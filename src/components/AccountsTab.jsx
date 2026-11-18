import { useEffect, useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Plus,
  RefreshCw,
  Pencil,
  Trash2,
  History,
  X,
  Check,
  AlertTriangle,
  Archive,
  RotateCcw,
  TrendingUp,
  CalendarClock,
  CheckCircle2,
} from 'lucide-react';
import {
  ACCOUNT_CATEGORIES,
  computeAccountEquitySummary,
  computeNetWorthSummary,
  computePromoStatus,
  estimateLoanPayoff,
  formatCurrency,
  formatPercent,
  formatShortDate,
  getOwnerDisplayName,
  HOLDING_TYPES,
  ordinalDay,
  OWNER_PROFILES,
  todayIsoDate,
  toNumber,
} from '../lib/finance';

const FILTER_TABS = [
  { key: 'all', label: 'All Accounts' },
  { key: 'retirement_401k', label: '401(k) & Retirement' },
  { key: 'bank', label: 'Banks & Cash' },
  { key: 'investment', label: 'Investments & RSUs' },
  { key: 'credit_card', label: 'Credit Cards' },
  { key: 'loan', label: 'Active Loans' },
];

export default function AccountsTab({
  supabase,
  accounts,
  snapshots,
  equityHoldings,
  promos,
  householdScope,
  householdNames,
  initialCategoryFilter = 'all',
  privacyMode,
  onDataChanged,
  onRefreshQuotes,
  batchModalOpen,
  setBatchModalOpen,
  newAccountCategory,
  setNewAccountCategory,
}) {
  const [filter, setFilter] = useState(initialCategoryFilter || 'all');
  const [showArchived, setShowArchived] = useState(false);

  // Account Form Modal state
  const [editingAccount, setEditingAccount] = useState(null);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [savingForm, setSavingForm] = useState(false);

  const defaultOwnerForScope = ['primary', 'spouse', 'joint'].includes(householdScope)
    ? householdScope
    : 'primary';

  const [formState, setFormState] = useState({
    owner_profile: defaultOwnerForScope,
    name: '',
    institution: '',
    category: 'retirement_401k',
    subtype: 'Traditional 401(k)',
    current_balance: '',
    cash_balance: '0',
    credit_limit: '',
    original_principal: '',
    interest_rate: '',
    minimum_payment: '',
    due_day: '',
    contribution_pct: '',
    employer_match_pct: '',
    notes: '',
    // Optional inline initial Stock/RSU holdings on creation
    add_initial_holding: false,
    initial_holdings: [{ symbol: '', holding_type: 'stock', shares: '', unvested_shares: '' }],
    // Optional inline 0% Balance Transfer Promo on creation
    add_initial_promo: false,
    promo_label: '',
    promo_balance: '',
    promo_apr: '0',
    standard_apr: '24.99',
    promo_expires_on: '',
  });

  // History Modal state
  const [historyAccount, setHistoryAccount] = useState(null);
  const [newSnapDate, setNewSnapDate] = useState(todayIsoDate());
  const [newSnapBalance, setNewSnapBalance] = useState('');
  const [newSnapNote, setNewSnapNote] = useState('');
  const [savingSnap, setSavingSnap] = useState(false);

  // Batch Check-In state
  const [batchDate, setBatchDate] = useState(todayIsoDate());
  const [batchValues, setBatchValues] = useState({});
  const [batchNote, setBatchNote] = useState('Periodic balance check-in');
  const [savingBatch, setSavingBatch] = useState(false);

  // Stock / RSU Holdings Modal state
  const [holdingsAccount, setHoldingsAccount] = useState(null);
  const [holdingCashInput, setHoldingCashInput] = useState('0');
  const [newSymbol, setNewSymbol] = useState('');
  const [newHoldingType, setNewHoldingType] = useState('rsu');
  const [newVestedShares, setNewVestedShares] = useState('');
  const [newUnvestedShares, setNewUnvestedShares] = useState('');
  const [newCostBasis, setNewCostBasis] = useState('');
  const [newHoldingNotes, setNewHoldingNotes] = useState('');
  const [savingHolding, setSavingHolding] = useState(false);
  const [holdingError, setHoldingError] = useState('');
  const [holdingNotice, setHoldingNotice] = useState('');
  const [editingHoldingId, setEditingHoldingId] = useState(null);
  const [editVestedInput, setEditVestedInput] = useState('');
  const [editUnvestedInput, setEditUnvestedInput] = useState('');

  // Promo Balance Transfer Modal state
  const [promoAccount, setPromoAccount] = useState(null);
  const [promoLabel, setPromoLabel] = useState('');
  const [promoOriginal, setPromoOriginal] = useState('');
  const [promoBalance, setPromoBalance] = useState('');
  const [promoApr, setPromoApr] = useState('0');
  const [promoStdApr, setPromoStdApr] = useState('24.99');
  const [promoFeePct, setPromoFeePct] = useState('3');
  const [promoExpiresOn, setPromoExpiresOn] = useState('');
  const [promoNotes, setPromoNotes] = useState('');
  const [savingPromo, setSavingPromo] = useState(false);
  const [promoError, setPromoError] = useState('');

  const mask = (str) => (privacyMode ? '••••••' : str);

  useEffect(() => {
    if (initialCategoryFilter) setFilter(initialCategoryFilter);
  }, [initialCategoryFilter]);

  useEffect(() => {
    if (newAccountCategory) {
      openCreateModal(newAccountCategory);
      setNewAccountCategory(null);
    }
  }, [newAccountCategory, setNewAccountCategory]);

  useEffect(() => {
    if (batchModalOpen) {
      const init = {};
      for (const acc of accounts.filter((a) => !a.is_archived)) {
        init[acc.id] = String(toNumber(acc.current_balance));
      }
      setBatchValues(init);
      setBatchDate(todayIsoDate());
    }
  }, [batchModalOpen, accounts]);

  // Keep modal account references fresh when parent reloads data
  useEffect(() => {
    if (holdingsAccount) {
      const updated = accounts.find((a) => a.id === holdingsAccount.id);
      if (updated && updated !== holdingsAccount) {
        setHoldingsAccount(updated);
        setHoldingCashInput(String(toNumber(updated.cash_balance)));
      }
    }
    if (promoAccount) {
      const updated = accounts.find((a) => a.id === promoAccount.id);
      if (updated && updated !== promoAccount) setPromoAccount(updated);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts]);

  const holdingsByAccount = useMemo(() => {
    const map = new Map();
    for (const h of equityHoldings || []) {
      if (!map.has(h.account_id)) map.set(h.account_id, []);
      map.get(h.account_id).push(h);
    }
    return map;
  }, [equityHoldings]);

  const promosByAccount = useMemo(() => {
    const map = new Map();
    for (const p of promos || []) {
      if (!map.has(p.account_id)) map.set(p.account_id, []);
      map.get(p.account_id).push(p);
    }
    return map;
  }, [promos]);

  const summary = useMemo(() => computeNetWorthSummary(accounts), [accounts]);

  const visibleAccounts = useMemo(() => {
    return (accounts || [])
      .filter((a) => (showArchived ? true : !a.is_archived))
      .filter((a) => {
        if (filter === 'all') return true;
        if (filter === 'investment') return a.category === 'investment' || a.category === 'other_asset';
        if (filter === 'loan') return a.category === 'loan' || a.category === 'other_liability';
        return a.category === filter;
      })
      .sort((a, b) => {
        if (a.is_liability !== b.is_liability) return a.is_liability ? 1 : -1;
        return Math.abs(toNumber(b.current_balance)) - Math.abs(toNumber(a.current_balance));
      });
  }, [accounts, filter, showArchived]);

  const openCreateModal = (defaultCat = 'retirement_401k') => {
    const cat = ACCOUNT_CATEGORIES[defaultCat] ? defaultCat : 'retirement_401k';
    setEditingAccount(null);
    setFormError('');
    setFormState({
      owner_profile: defaultOwnerForScope,
      name: '',
      institution: '',
      category: cat,
      subtype: ACCOUNT_CATEGORIES[cat].subtypes[0] || '',
      current_balance: '',
      cash_balance: '0',
      credit_limit: '',
      original_principal: '',
      interest_rate: '',
      minimum_payment: '',
      due_day: '',
      contribution_pct: '',
      employer_match_pct: '',
      notes: '',
      add_initial_holding: false,
      initial_holdings: [
        {
          symbol: '',
          holding_type: cat === 'investment' ? 'stock' : 'rsu',
          shares: '',
          unvested_shares: '',
        },
      ],
      add_initial_promo: false,
      promo_label: '',
      promo_balance: '',
      promo_apr: '0',
      standard_apr: '24.99',
      promo_expires_on: '',
    });
    setFormModalOpen(true);
  };

  const openEditModal = (acc) => {
    setEditingAccount(acc);
    setFormError('');
    setFormState({
      owner_profile: acc.owner_profile || 'primary',
      name: acc.name || '',
      institution: acc.institution || '',
      category: acc.category,
      subtype: acc.subtype || '',
      current_balance: String(toNumber(acc.current_balance)),
      cash_balance: String(toNumber(acc.cash_balance)),
      credit_limit: acc.credit_limit !== null && acc.credit_limit !== undefined ? String(acc.credit_limit) : '',
      original_principal:
        acc.original_principal !== null && acc.original_principal !== undefined
          ? String(acc.original_principal)
          : '',
      interest_rate: acc.interest_rate !== null && acc.interest_rate !== undefined ? String(acc.interest_rate) : '',
      minimum_payment:
        acc.minimum_payment !== null && acc.minimum_payment !== undefined ? String(acc.minimum_payment) : '',
      due_day: acc.due_day ? String(acc.due_day) : '',
      contribution_pct: acc.metadata?.contribution_pct !== undefined ? String(acc.metadata.contribution_pct) : '',
      employer_match_pct:
        acc.metadata?.employer_match_pct !== undefined ? String(acc.metadata.employer_match_pct) : '',
      notes: acc.notes || '',
      add_initial_holding: false,
      initial_holdings: [{ symbol: '', holding_type: 'stock', shares: '', unvested_shares: '' }],
      add_initial_promo: false,
      promo_label: '',
      promo_balance: '',
      promo_apr: '0',
      standard_apr: '24.99',
      promo_expires_on: '',
    });
    setFormModalOpen(true);
  };

  const handleCategoryChange = (newCat) => {
    const def = ACCOUNT_CATEGORIES[newCat];
    setFormState((prev) => ({
      ...prev,
      category: newCat,
      subtype: def?.subtypes?.[0] || '',
    }));
  };

  const recomputeAccountBalanceFromHoldings = async (accountId, overrideCashBalance) => {
    const [{ data: acc }, { data: rows }] = await Promise.all([
      supabase.from('accounts').select('*').eq('id', accountId).single(),
      supabase.from('equity_holdings').select('*').eq('account_id', accountId),
    ]);
    if (!acc) return;

    const cashVal =
      overrideCashBalance !== undefined ? toNumber(overrideCashBalance) : toNumber(acc.cash_balance);
    const equityVal = (rows || []).reduce(
      (sum, h) => sum + toNumber(h.shares) * toNumber(h.last_price),
      0
    );
    const nextBalance =
      (rows || []).length > 0 ? Number((cashVal + equityVal).toFixed(2)) : toNumber(acc.current_balance);

    await supabase
      .from('accounts')
      .update({
        cash_balance: cashVal,
        current_balance: nextBalance,
        last_updated_at: new Date().toISOString(),
      })
      .eq('id', accountId);

    await supabase.from('balance_snapshots').upsert(
      {
        account_id: accountId,
        snapshot_date: todayIsoDate(),
        balance: nextBalance,
        note: 'Stock/RSU holdings updated',
      },
      { onConflict: 'account_id,snapshot_date' }
    );
  };

  const handleSaveAccount = async (e) => {
    e.preventDefault();
    setFormError('');
    setSavingForm(true);

    try {
      const catDef = ACCOUNT_CATEGORIES[formState.category];
      if (!catDef) throw new Error('Invalid account category.');

      const hasExistingHoldings =
        editingAccount && (holdingsByAccount.get(editingAccount.id) || []).length > 0;

      let balanceVal = Number(parseFloat(formState.current_balance || '0').toFixed(2));
      if (!Number.isFinite(balanceVal)) balanceVal = 0;

      const cashVal = Number(parseFloat(formState.cash_balance || '0').toFixed(2)) || 0;

      if (hasExistingHoldings) {
        const eqSummary = computeAccountEquitySummary(
          { ...editingAccount, cash_balance: cashVal },
          holdingsByAccount.get(editingAccount.id)
        );
        balanceVal = eqSummary.computedBalance;
      }

      const metadata = {
        ...(editingAccount?.metadata || {}),
      };
      if (formState.category === 'retirement_401k') {
        metadata.contribution_pct = formState.contribution_pct !== '' ? Number(formState.contribution_pct) : null;
        metadata.employer_match_pct =
          formState.employer_match_pct !== '' ? Number(formState.employer_match_pct) : null;
      }

      const payload = {
        owner_profile: formState.owner_profile || 'primary',
        name: formState.name.trim(),
        institution: formState.institution.trim(),
        category: formState.category,
        subtype: formState.subtype.trim(),
        is_liability: catDef.isLiability,
        current_balance: balanceVal,
        cash_balance: catDef.isLiability ? 0 : cashVal,
        credit_limit: formState.credit_limit !== '' ? Number(formState.credit_limit) : null,
        original_principal: formState.original_principal !== '' ? Number(formState.original_principal) : null,
        interest_rate: formState.interest_rate !== '' ? Number(formState.interest_rate) : null,
        minimum_payment: formState.minimum_payment !== '' ? Number(formState.minimum_payment) : null,
        due_day: formState.due_day !== '' ? Number(formState.due_day) : null,
        notes: formState.notes.trim(),
        metadata,
        last_updated_at: new Date().toISOString(),
      };

      let savedAccount = null;
      if (editingAccount) {
        const { data, error } = await supabase
          .from('accounts')
          .update(payload)
          .eq('id', editingAccount.id)
          .select('*')
          .single();
        if (error) throw error;
        savedAccount = data;
      } else {
        const { data, error } = await supabase
          .from('accounts')
          .insert(payload)
          .select('*')
          .single();
        if (error) throw error;
        savedAccount = data;
      }

      // Optional initial Stock/RSU tickers when creating a new asset account
      let addedHolding = false;
      const validInitialHoldings = (formState.initial_holdings || []).filter((h) =>
        (h.symbol || '').trim()
      );
      if (
        !editingAccount &&
        savedAccount &&
        formState.add_initial_holding &&
        validInitialHoldings.length > 0
      ) {
        const uniqueSyms = Array.from(
          new Set(validInitialHoldings.map((h) => h.symbol.trim().toUpperCase()))
        );

        let quotesMap = {};
        const { data: qData, error: qErr } = await supabase.functions.invoke('stock-quotes', {
          body: { symbols: uniqueSyms },
        });
        if (!qErr && qData?.quotes) {
          quotesMap = qData.quotes;
        }

        const rowsToInsert = validInitialHoldings.map((h) => {
          const sym = h.symbol.trim().toUpperCase();
          const q = quotesMap[sym];
          const livePrice = q && Number(q.price) > 0 ? Number(q.price) : 0;
          const prevClose = q && Number(q.prevClose) > 0 ? Number(q.prevClose) : livePrice || null;
          const fetchedAt = q?.fetchedAt || (livePrice > 0 ? new Date().toISOString() : null);

          return {
            account_id: savedAccount.id,
            symbol: sym,
            holding_type: h.holding_type || 'stock',
            shares: Math.max(0, Number(parseFloat(h.shares || '0')) || 0),
            unvested_shares: Math.max(0, Number(parseFloat(h.unvested_shares || '0')) || 0),
            cost_basis_per_share: null,
            last_price: livePrice,
            prev_close: prevClose,
            last_price_at: fetchedAt,
            notes: '',
          };
        });

        const { error: holdInsErr } = await supabase.from('equity_holdings').insert(rowsToInsert);
        if (holdInsErr) throw holdInsErr;

        await recomputeAccountBalanceFromHoldings(savedAccount.id, cashVal);
        addedHolding = true;
      }

      // Optional initial 0% Balance Transfer Promo when creating a credit card
      if (
        !editingAccount &&
        savedAccount &&
        formState.category === 'credit_card' &&
        formState.add_initial_promo &&
        formState.promo_expires_on
      ) {
        const pBal = Number(parseFloat(formState.promo_balance || formState.current_balance || '0')) || 0;
        await supabase.from('credit_card_promos').insert({
          account_id: savedAccount.id,
          label: formState.promo_label.trim() || `${savedAccount.name} Promo`,
          original_amount: pBal,
          promo_balance: pBal,
          promo_apr: Number(parseFloat(formState.promo_apr || '0')) || 0,
          standard_apr: formState.standard_apr ? Number(parseFloat(formState.standard_apr)) : null,
          expires_on: formState.promo_expires_on,
          is_paid_off: false,
          notes: '',
        });
      }

      if (savedAccount && !addedHolding) {
        await supabase.from('balance_snapshots').upsert(
          {
            account_id: savedAccount.id,
            snapshot_date: todayIsoDate(),
            balance: balanceVal,
            note: editingAccount ? 'Balance updated' : 'Initial balance',
          },
          { onConflict: 'account_id,snapshot_date' }
        );
      }

      setFormModalOpen(false);
      await onDataChanged();
    } catch (err) {
      setFormError(err?.message || 'Failed to save account.');
    } finally {
      setSavingForm(false);
    }
  };

  const handleToggleArchive = async (acc) => {
    await supabase
      .from('accounts')
      .update({ is_archived: !acc.is_archived, last_updated_at: new Date().toISOString() })
      .eq('id', acc.id);
    await onDataChanged();
  };

  const handleDeleteAccount = async (acc) => {
    if (!window.confirm(`Permanently delete "${acc.name}" and all of its historical balance snapshots?`)) {
      return;
    }
    await supabase.from('accounts').delete().eq('id', acc.id);
    await onDataChanged();
  };

  const handleSaveBatch = async (e) => {
    e.preventDefault();
    setSavingBatch(true);
    try {
      const activeAccs = accounts.filter((a) => !a.is_archived);
      const snapshotUpserts = [];
      const isLatestDate = batchDate >= todayIsoDate();

      for (const acc of activeAccs) {
        const raw = batchValues[acc.id];
        if (raw === undefined || raw === '') continue;
        const parsed = Number(parseFloat(raw).toFixed(2));
        if (!Number.isFinite(parsed)) continue;

        snapshotUpserts.push({
          account_id: acc.id,
          snapshot_date: batchDate,
          balance: parsed,
          note: batchNote.trim() || 'Batch check-in',
        });

        if (isLatestDate && parsed !== toNumber(acc.current_balance)) {
          await supabase
            .from('accounts')
            .update({ current_balance: parsed, last_updated_at: new Date().toISOString() })
            .eq('id', acc.id);
        }
      }

      if (snapshotUpserts.length > 0) {
        const { error } = await supabase
          .from('balance_snapshots')
          .upsert(snapshotUpserts, { onConflict: 'account_id,snapshot_date' });
        if (error) throw error;
      }

      setBatchModalOpen(false);
      await onDataChanged();
    } finally {
      setSavingBatch(false);
    }
  };

  const accountSnapshots = useMemo(() => {
    if (!historyAccount) return [];
    return (snapshots || [])
      .filter((s) => s.account_id === historyAccount.id)
      .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
  }, [historyAccount, snapshots]);

  const handleAddAccountSnapshot = async (e) => {
    e.preventDefault();
    if (!historyAccount) return;
    const bal = Number(parseFloat(newSnapBalance).toFixed(2));
    if (!Number.isFinite(bal)) return;

    setSavingSnap(true);
    try {
      const { error } = await supabase.from('balance_snapshots').upsert(
        {
          account_id: historyAccount.id,
          snapshot_date: newSnapDate,
          balance: bal,
          note: newSnapNote.trim(),
        },
        { onConflict: 'account_id,snapshot_date' }
      );
      if (error) throw error;

      const latestDate =
        accountSnapshots.length > 0
          ? accountSnapshots[accountSnapshots.length - 1].snapshot_date
          : '0000-00-00';
      if (newSnapDate >= latestDate && newSnapDate >= todayIsoDate()) {
        await supabase
          .from('accounts')
          .update({ current_balance: bal, last_updated_at: new Date().toISOString() })
          .eq('id', historyAccount.id);
      }

      setNewSnapBalance('');
      setNewSnapNote('');
      await onDataChanged();
    } finally {
      setSavingSnap(false);
    }
  };

  const handleDeleteSnapshot = async (snapId) => {
    await supabase.from('balance_snapshots').delete().eq('id', snapId);
    await onDataChanged();
  };

  // --- Stock & RSU Holdings Modal Handlers ---
  const openHoldingsModal = (acc) => {
    setHoldingsAccount(acc);
    setHoldingCashInput(String(toNumber(acc.cash_balance)));
    setHoldingError('');
    setHoldingNotice('');
    setNewSymbol('');
    setNewHoldingType(acc.subtype === 'Employer RSUs / ESPP' ? 'rsu' : 'stock');
    setNewVestedShares('');
    setNewUnvestedShares('');
    setNewCostBasis('');
    setNewHoldingNotes('');
    setEditingHoldingId(null);
  };

  const handleSaveHoldingCash = async () => {
    if (!holdingsAccount) return;
    setSavingHolding(true);
    setHoldingError('');
    setHoldingNotice('');
    try {
      const cashVal = Number(parseFloat(holdingCashInput || '0').toFixed(2)) || 0;
      await recomputeAccountBalanceFromHoldings(holdingsAccount.id, cashVal);
      await onDataChanged();
    } catch (err) {
      setHoldingError(err?.message || 'Failed to save cash sweep balance.');
    } finally {
      setSavingHolding(false);
    }
  };

  const handleAddHolding = async (e) => {
    e.preventDefault();
    if (!holdingsAccount) return;
    const sym = newSymbol.trim().toUpperCase();
    if (!sym) return;

    const vested = Number(parseFloat(newVestedShares || '0')) || 0;
    const unvested = Number(parseFloat(newUnvestedShares || '0')) || 0;
    const basis = newCostBasis !== '' ? Number(parseFloat(newCostBasis)) : null;

    setSavingHolding(true);
    setHoldingError('');
    setHoldingNotice('');
    try {
      let livePrice = 0;
      let prevClose = null;
      let fetchedAt = null;

      const { data: qData, error: fnErr } = await supabase.functions.invoke('stock-quotes', {
        body: { symbols: [sym] },
      });
      if (!fnErr && qData?.quotes?.[sym]) {
        const q = qData.quotes[sym];
        livePrice = Number(q.price) || 0;
        prevClose = Number(q.prevClose) || livePrice;
        fetchedAt = q.fetchedAt || new Date().toISOString();
      }

      const { error: insErr } = await supabase.from('equity_holdings').insert({
        account_id: holdingsAccount.id,
        symbol: sym,
        holding_type: newHoldingType,
        shares: vested,
        unvested_shares: unvested,
        cost_basis_per_share: basis,
        last_price: livePrice,
        prev_close: prevClose,
        last_price_at: fetchedAt,
        notes: newHoldingNotes.trim(),
      });
      if (insErr) throw insErr;

      const cashVal = Number(parseFloat(holdingCashInput || '0').toFixed(2)) || 0;
      await recomputeAccountBalanceFromHoldings(holdingsAccount.id, cashVal);

      setNewSymbol('');
      setNewVestedShares('');
      setNewUnvestedShares('');
      setNewCostBasis('');
      setNewHoldingNotes('');
      setHoldingNotice(
        `Added ${sym} (${vested} sh${livePrice > 0 ? ` @ $${livePrice.toFixed(2)}` : ''}) to ${holdingsAccount.name}`
      );
      await onDataChanged();
    } catch (err) {
      setHoldingError(err?.message || 'Could not add holding.');
    } finally {
      setSavingHolding(false);
    }
  };

  const handleSaveEditedHolding = async (holdingId) => {
    if (!holdingsAccount) return;
    setSavingHolding(true);
    try {
      await supabase
        .from('equity_holdings')
        .update({
          shares: Math.max(0, Number(parseFloat(editVestedInput || '0')) || 0),
          unvested_shares: Math.max(0, Number(parseFloat(editUnvestedInput || '0')) || 0),
        })
        .eq('id', holdingId);
      setEditingHoldingId(null);
      await recomputeAccountBalanceFromHoldings(holdingsAccount.id);
      await onDataChanged();
    } finally {
      setSavingHolding(false);
    }
  };

  const handleDeleteHolding = async (holdingId) => {
    if (!holdingsAccount) return;
    setSavingHolding(true);
    try {
      await supabase.from('equity_holdings').delete().eq('id', holdingId);
      await recomputeAccountBalanceFromHoldings(holdingsAccount.id);
      await onDataChanged();
    } finally {
      setSavingHolding(false);
    }
  };

  // --- Promo Balance Transfer Modal Handlers ---
  const openPromoModal = (acc) => {
    setPromoAccount(acc);
    setPromoLabel('');
    setPromoOriginal(String(toNumber(acc.current_balance) || ''));
    setPromoBalance(String(toNumber(acc.current_balance) || ''));
    setPromoApr('0');
    setPromoStdApr(acc.interest_rate ? String(acc.interest_rate) : '24.99');
    setPromoFeePct('3');
    setPromoExpiresOn('');
    setPromoNotes('');
    setPromoError('');
  };

  const handleAddPromo = async (e) => {
    e.preventDefault();
    if (!promoAccount || !promoExpiresOn) return;
    setSavingPromo(true);
    setPromoError('');
    try {
      const rem = Number(parseFloat(promoBalance || '0').toFixed(2)) || 0;
      const orig = Number(parseFloat(promoOriginal || promoBalance || '0').toFixed(2)) || rem;
      const { error } = await supabase.from('credit_card_promos').insert({
        account_id: promoAccount.id,
        label: promoLabel.trim() || `${promoAccount.name} Promo BT`,
        original_amount: orig,
        promo_balance: rem,
        promo_apr: Number(parseFloat(promoApr || '0')) || 0,
        standard_apr: promoStdApr !== '' ? Number(parseFloat(promoStdApr)) : null,
        transfer_fee_pct: promoFeePct !== '' ? Number(parseFloat(promoFeePct)) : null,
        expires_on: promoExpiresOn,
        is_paid_off: rem <= 0,
        notes: promoNotes.trim(),
      });
      if (error) throw error;

      setPromoLabel('');
      setPromoBalance('');
      setPromoExpiresOn('');
      setPromoNotes('');
      await onDataChanged();
    } catch (err) {
      setPromoError(err?.message || 'Could not save balance transfer promo.');
    } finally {
      setSavingPromo(false);
    }
  };

  const handleUpdatePromoBalance = async (promo) => {
    const nextStr = window.prompt(
      `Enter remaining promo balance for "${promo.label}" ($):`,
      String(toNumber(promo.promo_balance))
    );
    if (nextStr === null) return;
    const nextBal = Math.max(0, Number(parseFloat(nextStr).toFixed(2)) || 0);
    await supabase
      .from('credit_card_promos')
      .update({ promo_balance: nextBal, is_paid_off: nextBal <= 0 })
      .eq('id', promo.id);
    await onDataChanged();
  };

  const handleTogglePromoPaid = async (promo) => {
    const nextPaid = !promo.is_paid_off;
    await supabase
      .from('credit_card_promos')
      .update({
        is_paid_off: nextPaid,
        promo_balance: nextPaid ? 0 : promo.promo_balance,
      })
      .eq('id', promo.id);
    await onDataChanged();
  };

  const handleDeletePromo = async (promoId) => {
    await supabase.from('credit_card_promos').delete().eq('id', promoId);
    await onDataChanged();
  };

  return (
    <div className="space-y-6">
      {/* Top Action & Filter Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTER_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilter(t.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                filter === t.key
                  ? 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                  : 'border border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setBatchModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 hover:border-zinc-600 hover:bg-zinc-800"
          >
            <RefreshCw className="h-3.5 w-3.5 text-emerald-400" />
            Batch Update Balances
          </button>
          <button
            type="button"
            onClick={() => openCreateModal(filter === 'all' ? 'retirement_401k' : filter)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Account
          </button>
        </div>
      </div>

      {/* Category Contextual Metrics Banner */}
      {filter === 'credit_card' && summary.totalCardLimit > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-950/80 px-5 py-3.5 text-xs">
          <div>
            <span className="text-zinc-400">Total Revolving Balance: </span>
            <span className="font-mono font-semibold text-amber-300">{mask(formatCurrency(summary.creditCards))}</span>
            <span className="text-zinc-500"> / {mask(formatCurrency(summary.totalCardLimit, { decimals: 0 }))} total credit limit</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-zinc-400">Aggregate Utilization:</span>
            <span
              className={`rounded-full px-2.5 py-0.5 font-mono font-semibold ${
                summary.creditUtilizationPct <= 10
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : summary.creditUtilizationPct <= 30
                  ? 'bg-amber-500/15 text-amber-300'
                  : 'bg-rose-500/15 text-rose-300'
              }`}
            >
              {formatPercent(summary.creditUtilizationPct, 1)}
            </span>
          </div>
        </div>
      )}

      {filter === 'loan' && summary.loans > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-950/80 px-5 py-3.5 text-xs">
          <div>
            <span className="text-zinc-400">Remaining Loan Principal: </span>
            <span className="font-mono font-semibold text-rose-300">{mask(formatCurrency(summary.loans))}</span>
            {summary.totalLoanOriginal > 0 && (
              <span className="text-zinc-500">
                {' '}
                (Original: {mask(formatCurrency(summary.totalLoanOriginal, { decimals: 0 }))})
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-zinc-400">
              Monthly Debt Service:{' '}
              <strong className="font-mono text-zinc-100">
                {mask(formatCurrency(summary.monthlyMinDebtService))}
              </strong>
            </span>
            {summary.loanPaidOffPct !== null && (
              <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-mono font-semibold text-emerald-300">
                {formatPercent(summary.loanPaidOffPct, 1)} Paid Off
              </span>
            )}
          </div>
        </div>
      )}

      {/* Accounts Grid */}
      {visibleAccounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/50 py-14 text-center text-xs text-zinc-500">
          No accounts in this view yet.
          <div className="mt-3">
            <button
              type="button"
              onClick={() => openCreateModal(filter === 'all' ? 'retirement_401k' : filter)}
              className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 font-medium text-emerald-300 hover:bg-emerald-500/20"
            >
              + Add {FILTER_TABS.find((f) => f.key === filter)?.label || 'Account'}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {visibleAccounts.map((acc) => {
            const catDef = ACCOUNT_CATEGORIES[acc.category] || ACCOUNT_CATEGORIES.other_asset;
            const ownerKey = acc.owner_profile || 'primary';
            const ownerBadge = OWNER_PROFILES[ownerKey] || OWNER_PROFILES.primary;
            const bal = toNumber(acc.current_balance);
            const limit = toNumber(acc.credit_limit);
            const origPrincipal = toNumber(acc.original_principal);
            const utilPct = acc.category === 'credit_card' && limit > 0 ? (bal / limit) * 100 : null;
            const paidPct =
              acc.category === 'loan' && origPrincipal > 0
                ? Math.max(0, Math.min(100, ((origPrincipal - bal) / origPrincipal) * 100))
                : null;

            const payoff =
              acc.category === 'loan' && bal > 0 && toNumber(acc.minimum_payment) > 0
                ? estimateLoanPayoff(bal, acc.interest_rate, acc.minimum_payment)
                : null;

            const accHoldings = holdingsByAccount.get(acc.id) || [];
            const eqSummary = computeAccountEquitySummary(acc, accHoldings);
            const accPromos = (promosByAccount.get(acc.id) || []).filter(
              (p) => !p.is_paid_off && toNumber(p.promo_balance) > 0
            );

            return (
              <div
                key={acc.id}
                className={`flex flex-col justify-between rounded-xl border bg-zinc-950/80 p-5 transition ${
                  acc.is_archived
                    ? 'border-zinc-900 opacity-60'
                    : 'border-zinc-800/90 hover:border-zinc-700'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: catDef.colorHex }}
                        />
                        <h3 className="text-sm font-semibold text-zinc-100">{acc.name}</h3>
                        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${ownerBadge.badgeClass}`}>
                          {getOwnerDisplayName(ownerKey, householdNames)}
                        </span>
                        {acc.is_archived && (
                          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                            Archived
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-500">
                        {[acc.institution, acc.subtype || catDef.label].filter(Boolean).join(' • ')}
                      </div>
                    </div>

                    <div className="text-right">
                      <div
                        className={`font-mono text-lg font-bold tabular-nums ${
                          acc.is_liability ? 'text-rose-300' : 'text-zinc-50'
                        }`}
                      >
                        {acc.is_liability && bal > 0 ? '-' : ''}
                        {mask(formatCurrency(bal))}
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        {eqSummary.hasHoldings ? (
                          <span className={eqSummary.dayChangeValue >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {mask(formatCurrency(eqSummary.dayChangeValue, { showSign: true }))} today
                          </span>
                        ) : (
                          `Updated ${acc.last_updated_at ? formatShortDate(acc.last_updated_at.slice(0, 10)) : 'recently'}`
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Category-specific insight pills & progress bars */}
                  <div className="mt-4 space-y-2.5">
                    {/* Live Stock / RSU Holdings Breakdown */}
                    {eqSummary.hasHoldings && (
                      <div className="space-y-1.5 rounded-lg border border-sky-500/20 bg-sky-500/5 p-3 text-[11px]">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sky-200">
                          <span className="font-medium">Live Stock & RSU Positions</span>
                          <div className="flex items-center gap-2">
                            {eqSummary.cashBalance > 0 && (
                              <span className="font-mono text-zinc-400">
                                + {mask(formatCurrency(eqSummary.cashBalance))} cash
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => openHoldingsModal(acc)}
                              className="inline-flex items-center gap-1 rounded-md border border-sky-500/35 bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold text-sky-200 hover:bg-sky-500/25"
                            >
                              <Plus className="h-3 w-3" />
                              Add Stock
                            </button>
                          </div>
                        </div>
                        <div className="divide-y divide-zinc-800/70">
                          {accHoldings.map((h) => {
                            const mktVal = toNumber(h.shares) * toNumber(h.last_price);
                            const unvestedVal = toNumber(h.unvested_shares) * toNumber(h.last_price);
                            const prev = toNumber(h.prev_close);
                            const dayPct =
                              prev > 0 ? ((toNumber(h.last_price) - prev) / prev) * 100 : 0;

                            return (
                              <div key={h.id} className="flex items-center justify-between py-1.5">
                                <div>
                                  <span className="font-mono font-semibold text-zinc-100">{h.symbol}</span>
                                  <span className="ml-1.5 rounded bg-zinc-800 px-1 py-0.5 text-[9px] uppercase text-zinc-400">
                                    {HOLDING_TYPES[h.holding_type]?.label || h.holding_type}
                                  </span>
                                  <span className="ml-2 text-zinc-400 tabular-nums">
                                    {toNumber(h.shares).toLocaleString('en-US', { maximumFractionDigits: 4 })} sh @ $
                                    {toNumber(h.last_price).toFixed(2)}
                                  </span>
                                  {toNumber(h.unvested_shares) > 0 && (
                                    <span className="ml-2 text-zinc-500">
                                      (+{toNumber(h.unvested_shares)} unvested ≈{' '}
                                      {mask(formatCurrency(unvestedVal, { decimals: 0 }))})
                                    </span>
                                  )}
                                </div>
                                <div className="text-right font-mono tabular-nums">
                                  <div className="font-medium text-zinc-100">
                                    {mask(formatCurrency(mktVal))}
                                  </div>
                                  {prev > 0 && (
                                    <div className={`text-[10px] ${dayPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                      {dayPct >= 0 ? '+' : ''}
                                      {dayPct.toFixed(2)}%
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Credit Card Balance Transfer Promo Reminders */}
                    {accPromos.length > 0 && (
                      <div className="space-y-1.5">
                        {accPromos.map((p) => {
                          const st = computePromoStatus(p);
                          return (
                            <div
                              key={p.id}
                              className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-[11px] ${
                                st.urgency === 'expired' || st.urgency === 'urgent'
                                  ? 'border-rose-500/35 bg-rose-500/10 text-rose-200'
                                  : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                              }`}
                            >
                              <div>
                                <div className="font-medium">
                                  {p.label} ({formatPercent(p.promo_apr, 1)} promo)
                                </div>
                                <div className="text-[10px] opacity-80">
                                  {mask(formatCurrency(p.promo_balance))} left • Ends {formatShortDate(p.expires_on)} (
                                  {st.daysLeft < 0 ? `Expired ${Math.abs(st.daysLeft)}d ago` : `${st.daysLeft}d left`})
                                </div>
                              </div>
                              <div className="font-mono font-semibold text-emerald-300">
                                {st.daysLeft <= 0
                                  ? 'Pay now'
                                  : `${mask(formatCurrency(st.requiredMonthlyPayment, { decimals: 0 }))}/mo`}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Credit Card Utilization */}
                    {utilPct !== null && (
                      <div>
                        <div className="mb-1 flex justify-between text-[11px] text-zinc-400 tabular-nums">
                          <span>
                            Credit Utilization ({mask(formatCurrency(bal, { decimals: 0 }))} /{' '}
                            {mask(formatCurrency(limit, { decimals: 0 }))})
                          </span>
                          <span
                            className={
                              utilPct <= 10
                                ? 'text-emerald-400'
                                : utilPct <= 30
                                ? 'text-amber-400'
                                : 'text-rose-400'
                            }
                          >
                            {formatPercent(utilPct, 1)}
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-900">
                          <div
                            className={`h-full rounded-full ${
                              utilPct <= 10
                                ? 'bg-emerald-500'
                                : utilPct <= 30
                                ? 'bg-amber-500'
                                : 'bg-rose-500'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(2, utilPct))}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Loan Payoff Progress & Projection */}
                    {paidPct !== null && (
                      <div>
                        <div className="mb-1 flex justify-between text-[11px] text-zinc-400 tabular-nums">
                          <span>
                            Principal Paid Off (Orig. {mask(formatCurrency(origPrincipal, { decimals: 0 }))})
                          </span>
                          <span className="text-emerald-400">{formatPercent(paidPct, 1)}</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-900">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: `${Math.max(2, paidPct)}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {payoff && (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-3 py-2 text-[11px] text-zinc-300">
                        <span>Est. Payoff: <strong>{payoff.payoffDateLabel}</strong></span>
                        {payoff.totalInterest !== null && (
                          <span className="font-mono text-zinc-400">
                            Rem. interest: {mask(formatCurrency(payoff.totalInterest, { decimals: 0 }))}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Metadata badges */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[11px]">
                      {acc.interest_rate !== null && acc.interest_rate !== undefined && toNumber(acc.interest_rate) > 0 && (
                        <span className="rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-zinc-300">
                          {formatPercent(acc.interest_rate, 2)} {acc.is_liability ? 'APR' : 'APY'}
                        </span>
                      )}
                      {acc.minimum_payment !== null && toNumber(acc.minimum_payment) > 0 && (
                        <span className="rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-zinc-300">
                          {mask(formatCurrency(acc.minimum_payment, { decimals: 0 }))}/mo pmt
                        </span>
                      )}
                      {acc.due_day && (
                        <span className="rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-zinc-400">
                          Due {ordinalDay(acc.due_day)}
                        </span>
                      )}
                      {acc.metadata?.contribution_pct > 0 && (
                        <span className="rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                          {acc.metadata.contribution_pct}% contrib
                          {acc.metadata?.employer_match_pct > 0
                            ? ` + ${acc.metadata.employer_match_pct}% match`
                            : ''}
                        </span>
                      )}
                    </div>

                    {acc.notes && <p className="text-xs text-zinc-500">{acc.notes}</p>}
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-900 pt-3 text-xs">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryAccount(acc);
                        setNewSnapDate(todayIsoDate());
                        setNewSnapBalance(String(toNumber(acc.current_balance)));
                      }}
                      className="inline-flex items-center gap-1 text-zinc-400 hover:text-emerald-300"
                    >
                      <History className="h-3.5 w-3.5" />
                      History
                    </button>

                    {(acc.category === 'investment' || acc.category === 'retirement_401k') && (
                      <button
                        type="button"
                        onClick={() => openHoldingsModal(acc)}
                        className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300"
                      >
                        <TrendingUp className="h-3.5 w-3.5" />
                        Stocks / RSUs ({accHoldings.length})
                      </button>
                    )}

                    {acc.category === 'credit_card' && (
                      <button
                        type="button"
                        onClick={() => openPromoModal(acc)}
                        className="inline-flex items-center gap-1 text-amber-300 hover:text-amber-200"
                      >
                        <CalendarClock className="h-3.5 w-3.5" />
                        Promo Transfers ({accPromos.length})
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditModal(acc)}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleArchive(acc)}
                      title={acc.is_archived ? 'Restore account' : 'Archive account'}
                      className="rounded p-1 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
                    >
                      {acc.is_archived ? <RotateCcw className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteAccount(acc)}
                      title="Delete account"
                      className="rounded p-1 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Archived Toggle */}
      {accounts.some((a) => a.is_archived) && (
        <div className="text-right">
          <button
            type="button"
            onClick={() => setShowArchived(!showArchived)}
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            {showArchived ? 'Hide archived accounts' : 'Show archived / paid-off accounts'}
          </button>
        </div>
      )}

      {/* MODAL 1: Add / Edit Account */}
      {formModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 className="text-base font-semibold text-zinc-100">
                {editingAccount ? `Edit ${editingAccount.name}` : 'Add Financial Account'}
              </h2>
              <button
                type="button"
                onClick={() => setFormModalOpen(false)}
                className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {formError && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveAccount} className="space-y-4 text-xs">
              {/* Owner Profile Selector */}
              <div>
                <div className="mb-1.5 text-zinc-300">Account Owner</div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'primary', label: householdNames.primary_name },
                    { key: 'spouse', label: householdNames.spouse_name },
                    { key: 'joint', label: 'Joint' },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setFormState({ ...formState, owner_profile: opt.key })}
                      className={`rounded-lg border py-2 font-medium transition ${
                        formState.owner_profile === opt.key
                          ? opt.key === 'spouse'
                            ? 'border-fuchsia-500/60 bg-fuchsia-500/15 text-fuchsia-200'
                            : opt.key === 'joint'
                            ? 'border-sky-500/60 bg-sky-500/15 text-sky-200'
                            : 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200'
                          : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-zinc-300">
                  Account Category
                  <select
                    value={formState.category}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                  >
                    {Object.values(ACCOUNT_CATEGORIES).map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label} ({c.isLiability ? 'Debt' : 'Asset'})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-zinc-300">
                  Account Subtype
                  <select
                    value={formState.subtype}
                    onChange={(e) => setFormState({ ...formState, subtype: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                  >
                    {(ACCOUNT_CATEGORIES[formState.category]?.subtypes || []).map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-zinc-300">
                  Account Nickname *
                  <input
                    type="text"
                    required
                    placeholder="e.g., E*TRADE RSU, Wife Fidelity 401(k)"
                    value={formState.name}
                    onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                  />
                </label>

                <label className="block text-zinc-300">
                  Institution / Issuer
                  <input
                    type="text"
                    placeholder="e.g., Fidelity, E*TRADE, Citi, Chase"
                    value={formState.institution}
                    onChange={(e) => setFormState({ ...formState, institution: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {editingAccount && (holdingsByAccount.get(editingAccount.id) || []).length > 0 ? (
                  <label className="block text-zinc-300">
                    Uninvested Cash Sweep ($)
                    <input
                      type="number"
                      step="0.01"
                      value={formState.cash_balance}
                      onChange={(e) => setFormState({ ...formState, cash_balance: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100"
                    />
                    <span className="mt-1 block text-[10px] text-sky-400">
                      Total balance auto-calculates from cash + live Stocks/RSUs.
                    </span>
                  </label>
                ) : (
                  <label className="block text-zinc-300">
                    {ACCOUNT_CATEGORIES[formState.category]?.isLiability
                      ? 'Current Balance Owed ($) *'
                      : 'Current Balance / Cash ($) *'}
                    <input
                      type="number"
                      step="0.01"
                      required={!formState.add_initial_holding}
                      placeholder="0.00"
                      value={formState.current_balance}
                      onChange={(e) => setFormState({ ...formState, current_balance: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                    />
                  </label>
                )}

                <label className="block text-zinc-300">
                  {ACCOUNT_CATEGORIES[formState.category]?.isLiability
                    ? 'Interest Rate (APR %)'
                    : 'Yield / Expected Return (%)'}
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    placeholder="e.g., 4.25"
                    value={formState.interest_rate}
                    onChange={(e) => setFormState({ ...formState, interest_rate: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                  />
                </label>
              </div>

              {/* Multi-Stock / RSU Setup when creating an Investment / 401k account */}
              {!editingAccount &&
                (formState.category === 'investment' || formState.category === 'retirement_401k') && (
                  <div className="rounded-xl border border-sky-500/25 bg-sky-500/5 p-3.5">
                    <label className="flex cursor-pointer items-center gap-2 font-medium text-sky-200">
                      <input
                        type="checkbox"
                        checked={formState.add_initial_holding}
                        onChange={(e) =>
                          setFormState({ ...formState, add_initial_holding: e.target.checked })
                        }
                        className="rounded border-zinc-700 bg-zinc-900 text-sky-500"
                      />
                      Tie balance to live Stock / RSU ticker prices (auto-updates on page open)
                    </label>

                    {formState.add_initial_holding && (
                      <div className="mt-3 space-y-2">
                        <div className="grid grid-cols-12 gap-2 text-[10px] font-medium text-zinc-400">
                          <span className="col-span-3">Ticker *</span>
                          <span className="col-span-3">Type</span>
                          <span className="col-span-3">Shares *</span>
                          <span className="col-span-3">Unvested</span>
                        </div>
                        {(formState.initial_holdings || []).map((row, idx) => (
                          <div key={idx} className="grid grid-cols-12 items-center gap-2">
                            <input
                              type="text"
                              required={idx === 0}
                              placeholder="NVDA"
                              value={row.symbol}
                              onChange={(e) => {
                                const next = [...formState.initial_holdings];
                                next[idx] = { ...next[idx], symbol: e.target.value.toUpperCase() };
                                setFormState({ ...formState, initial_holdings: next });
                              }}
                              className="col-span-3 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-100"
                            />
                            <select
                              value={row.holding_type}
                              onChange={(e) => {
                                const next = [...formState.initial_holdings];
                                next[idx] = { ...next[idx], holding_type: e.target.value };
                                setFormState({ ...formState, initial_holdings: next });
                              }}
                              className="col-span-3 rounded-lg border border-zinc-800 bg-zinc-900 px-1.5 py-1.5 text-xs text-zinc-100"
                            >
                              <option value="stock">Stock</option>
                              <option value="etf">ETF</option>
                              <option value="rsu">RSU</option>
                              <option value="espp">ESPP</option>
                            </select>
                            <input
                              type="number"
                              step="0.0001"
                              min="0"
                              required={idx === 0 || Boolean(row.symbol.trim())}
                              placeholder="100"
                              value={row.shares}
                              onChange={(e) => {
                                const next = [...formState.initial_holdings];
                                next[idx] = { ...next[idx], shares: e.target.value };
                                setFormState({ ...formState, initial_holdings: next });
                              }}
                              className="col-span-3 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-100"
                            />
                            <div className="col-span-3 flex items-center gap-1">
                              <input
                                type="number"
                                step="0.0001"
                                min="0"
                                placeholder="0"
                                value={row.unvested_shares}
                                onChange={(e) => {
                                  const next = [...formState.initial_holdings];
                                  next[idx] = { ...next[idx], unvested_shares: e.target.value };
                                  setFormState({ ...formState, initial_holdings: next });
                                }}
                                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-100"
                              />
                              {formState.initial_holdings.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = formState.initial_holdings.filter((_, i) => i !== idx);
                                    setFormState({ ...formState, initial_holdings: next });
                                  }}
                                  className="rounded p-1 text-zinc-500 hover:text-rose-400"
                                  title="Remove row"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            setFormState({
                              ...formState,
                              initial_holdings: [
                                ...formState.initial_holdings,
                                {
                                  symbol: '',
                                  holding_type: formState.category === 'investment' ? 'stock' : 'rsu',
                                  shares: '',
                                  unvested_shares: '',
                                },
                              ],
                            })
                          }
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-300 hover:text-sky-200"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add Another Stock / RSU
                        </button>
                      </div>
                    )}
                  </div>
                )}

              {/* Direct access to Stocks/RSUs when editing an existing Investment / 401k account */}
              {editingAccount &&
                (formState.category === 'investment' || formState.category === 'retirement_401k') && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-500/25 bg-sky-500/5 p-3.5">
                    <div className="text-xs">
                      <div className="font-medium text-sky-200">
                        Stock & RSU Positions ({(holdingsByAccount.get(editingAccount.id) || []).length})
                      </div>
                      <div className="mt-0.5 text-[11px] text-zinc-400">
                        {(holdingsByAccount.get(editingAccount.id) || []).length > 0
                          ? (holdingsByAccount.get(editingAccount.id) || [])
                              .map((h) => `${h.symbol} (${toNumber(h.shares)})`)
                              .join(', ')
                          : 'No stock or RSU tickers linked yet.'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const target = editingAccount;
                        setFormModalOpen(false);
                        openHoldingsModal(target);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-500/25"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add / Manage Stocks & RSUs
                    </button>
                  </div>
                )}

              {/* Conditional 401(k) fields */}
              {formState.category === 'retirement_401k' && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block text-zinc-300">
                    Your Contribution (%)
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      placeholder="e.g., 12"
                      value={formState.contribution_pct}
                      onChange={(e) => setFormState({ ...formState, contribution_pct: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                    />
                  </label>
                  <label className="block text-zinc-300">
                    Employer Match (%)
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      placeholder="e.g., 5"
                      value={formState.employer_match_pct}
                      onChange={(e) => setFormState({ ...formState, employer_match_pct: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                    />
                  </label>
                </div>
              )}

              {/* Conditional Credit Card fields + Optional 0% Promo Balance Transfer */}
              {formState.category === 'credit_card' && (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <label className="block text-zinc-300">
                      Credit Limit ($)
                      <input
                        type="number"
                        step="1"
                        min="0"
                        placeholder="15000"
                        value={formState.credit_limit}
                        onChange={(e) => setFormState({ ...formState, credit_limit: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                      />
                    </label>
                    <label className="block text-zinc-300">
                      Min Payment ($)
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="35"
                        value={formState.minimum_payment}
                        onChange={(e) => setFormState({ ...formState, minimum_payment: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                      />
                    </label>
                    <label className="block text-zinc-300">
                      Due Day (1–31)
                      <input
                        type="number"
                        min="1"
                        max="31"
                        placeholder="18"
                        value={formState.due_day}
                        onChange={(e) => setFormState({ ...formState, due_day: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                      />
                    </label>
                  </div>

                  {!editingAccount && (
                    <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3.5">
                      <label className="flex cursor-pointer items-center gap-2 font-medium text-amber-200">
                        <input
                          type="checkbox"
                          checked={formState.add_initial_promo}
                          onChange={(e) =>
                            setFormState({ ...formState, add_initial_promo: e.target.checked })
                          }
                          className="rounded border-zinc-700 bg-zinc-900 text-amber-500"
                        />
                        Track 0% / Free Promo Balance Transfer Expiration Reminder
                      </label>

                      {formState.add_initial_promo && (
                        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                          <input
                            type="text"
                            placeholder="Promo label (e.g., Citi 0% BT)"
                            value={formState.promo_label}
                            onChange={(e) =>
                              setFormState({ ...formState, promo_label: e.target.value })
                            }
                            className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs text-zinc-100"
                          />
                          <label className="block text-[11px] text-zinc-400">
                            Promo Expires On *
                            <input
                              type="date"
                              required
                              value={formState.promo_expires_on}
                              onChange={(e) =>
                                setFormState({ ...formState, promo_expires_on: e.target.value })
                              }
                              className="mt-0.5 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100"
                            />
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Promo Balance ($)"
                            value={formState.promo_balance}
                            onChange={(e) =>
                              setFormState({ ...formState, promo_balance: e.target.value })
                            }
                            className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 font-mono text-xs text-zinc-100"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="number"
                              step="0.01"
                              placeholder="Promo APR %"
                              value={formState.promo_apr}
                              onChange={(e) =>
                                setFormState({ ...formState, promo_apr: e.target.value })
                              }
                              className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-2 font-mono text-xs text-zinc-100"
                            />
                            <input
                              type="number"
                              step="0.01"
                              placeholder="After APR %"
                              value={formState.standard_apr}
                              onChange={(e) =>
                                setFormState({ ...formState, standard_apr: e.target.value })
                              }
                              className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-2 font-mono text-xs text-zinc-100"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Conditional Active Loan fields */}
              {(formState.category === 'loan' || formState.category === 'other_liability') && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="block text-zinc-300">
                    Original Principal ($)
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="28500"
                      value={formState.original_principal}
                      onChange={(e) => setFormState({ ...formState, original_principal: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                    />
                  </label>
                  <label className="block text-zinc-300">
                    Monthly Payment ($)
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="520"
                      value={formState.minimum_payment}
                      onChange={(e) => setFormState({ ...formState, minimum_payment: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                    />
                  </label>
                  <label className="block text-zinc-300">
                    Due Day (1–31)
                    <input
                      type="number"
                      min="1"
                      max="31"
                      placeholder="12"
                      value={formState.due_day}
                      onChange={(e) => setFormState({ ...formState, due_day: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                    />
                  </label>
                </div>
              )}

              <label className="block text-zinc-300">
                Notes (optional)
                <input
                  type="text"
                  placeholder="Allocation, vesting schedule, promo terms…"
                  value={formState.notes}
                  onChange={(e) => setFormState({ ...formState, notes: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                />
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setFormModalOpen(false)}
                  className="rounded-lg border border-zinc-800 px-4 py-2 font-medium text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingForm}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" />
                  {savingForm ? 'Saving…' : editingAccount ? 'Save Changes' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Batch Update Balances */}
      {batchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h2 className="text-base font-semibold text-zinc-100">Batch Balance Check-In</h2>
                <p className="text-xs text-zinc-500">
                  Update balances in one pass and record a net worth snapshot.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBatchModalOpen(false)}
                className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBatch} className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-xs text-zinc-300">
                  Snapshot Date
                  <input
                    type="date"
                    required
                    value={batchDate}
                    onChange={(e) => setBatchDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                  />
                </label>
                <label className="block text-xs text-zinc-300">
                  Check-In Note
                  <input
                    type="text"
                    value={batchNote}
                    onChange={(e) => setBatchNote(e.target.value)}
                    placeholder="e.g., Month-end balances"
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                  />
                </label>
              </div>

              <div className="divide-y divide-zinc-900 rounded-xl border border-zinc-800 bg-zinc-900/30 px-4">
                {accounts
                  .filter((a) => !a.is_archived)
                  .map((acc) => {
                    const prev = toNumber(acc.current_balance);
                    const next = parseFloat(batchValues[acc.id] ?? prev);
                    const diff = Number.isFinite(next) ? next - prev : 0;
                    const ownerKey = acc.owner_profile || 'primary';
                    const ownerBadge = OWNER_PROFILES[ownerKey] || OWNER_PROFILES.primary;
                    const hasHoldings = (holdingsByAccount.get(acc.id) || []).length > 0;

                    return (
                      <div key={acc.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-zinc-200">{acc.name}</span>
                            <span className={`rounded border px-1.5 py-0.5 text-[10px] ${ownerBadge.badgeClass}`}>
                              {getOwnerDisplayName(ownerKey, householdNames)}
                            </span>
                            {hasHoldings && (
                              <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-300">
                                Auto-priced
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-zinc-500">
                            {ACCOUNT_CATEGORIES[acc.category]?.shortLabel} • Current: {formatCurrency(prev)}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {Math.abs(diff) >= 0.01 && (
                            <span
                              className={`font-mono text-[11px] tabular-nums ${
                                (acc.is_liability ? -diff : diff) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {formatCurrency(diff, { showSign: true })}
                            </span>
                          )}
                          <input
                            type="number"
                            step="0.01"
                            value={batchValues[acc.id] ?? ''}
                            onChange={(e) =>
                              setBatchValues((prevMap) => ({ ...prevMap, [acc.id]: e.target.value }))
                            }
                            className="w-36 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-right font-mono text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>

              <div className="flex justify-end gap-2 pt-2 text-xs">
                <button
                  type="button"
                  onClick={() => setBatchModalOpen(false)}
                  className="rounded-lg border border-zinc-800 px-4 py-2 text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingBatch}
                  className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
                >
                  {savingBatch ? 'Recording Snapshots…' : 'Save Balances & Snapshot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Per-Account Snapshot History & Backfill */}
      {historyAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h2 className="text-base font-semibold text-zinc-100">{historyAccount.name} — History</h2>
                <p className="text-xs text-zinc-500">
                  Add past statement balances to backfill your Net Worth chart or edit existing snapshots.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryAccount(null)}
                className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {accountSnapshots.length >= 2 && (
              <div className="mb-5 h-40 w-full rounded-xl border border-zinc-900 bg-zinc-900/30 p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={accountSnapshots.map((s) => ({
                      label: formatShortDate(s.snapshot_date),
                      balance: toNumber(s.balance),
                    }))}
                  >
                    <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis hide domain={['auto', 'auto']} />
                    <Tooltip
                      formatter={(val) => [formatCurrency(val), 'Balance']}
                      contentStyle={{
                        backgroundColor: '#09090b',
                        borderColor: '#27272a',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="balance"
                      stroke={historyAccount.is_liability ? '#f43f5e' : '#10b981'}
                      fillOpacity={0.15}
                      fill={historyAccount.is_liability ? '#f43f5e' : '#10b981'}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            <form onSubmit={handleAddAccountSnapshot} className="mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-4">
              <input
                type="date"
                required
                value={newSnapDate}
                onChange={(e) => setNewSnapDate(e.target.value)}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs text-zinc-100"
              />
              <input
                type="number"
                step="0.01"
                required
                placeholder="Balance ($)"
                value={newSnapBalance}
                onChange={(e) => setNewSnapBalance(e.target.value)}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 font-mono text-xs text-zinc-100"
              />
              <input
                type="text"
                placeholder="Note (optional)"
                value={newSnapNote}
                onChange={(e) => setNewSnapNote(e.target.value)}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs text-zinc-100"
              />
              <button
                type="submit"
                disabled={savingSnap}
                className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                {savingSnap ? 'Saving…' : '+ Record Date'}
              </button>
            </form>

            <div className="divide-y divide-zinc-900 rounded-xl border border-zinc-800/80 px-4">
              {[...accountSnapshots].reverse().map((snap) => (
                <div key={snap.id} className="flex items-center justify-between py-2.5 text-xs">
                  <div>
                    <span className="font-mono text-zinc-300">{snap.snapshot_date}</span>
                    {snap.note && <span className="ml-2 text-zinc-500">• {snap.note}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-medium text-zinc-100 tabular-nums">
                      {mask(formatCurrency(snap.balance))}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteSnapshot(snap.id)}
                      className="text-zinc-600 hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {accountSnapshots.length === 0 && (
                <div className="py-6 text-center text-xs text-zinc-500">No historical snapshots yet.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Manage Stock & RSU Holdings */}
      {holdingsAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h2 className="text-base font-semibold text-zinc-100">
                  {holdingsAccount.name} — Stocks & RSUs
                </h2>
                <p className="text-xs text-zinc-500">
                  Live market prices refresh automatically when you open asfinance and update this account’s balance.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHoldingsAccount(null)}
                className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {holdingError && (
              <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                {holdingError}
              </div>
            )}

            {holdingNotice && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <span>{holdingNotice}</span>
              </div>
            )}

            {/* Uninvested Cash Sweep + Live Refresh */}
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5 text-xs">
              <div className="flex items-end gap-2">
                <label className="block text-zinc-300">
                  Uninvested Cash Sweep ($)
                  <input
                    type="number"
                    step="0.01"
                    value={holdingCashInput}
                    onChange={(e) => setHoldingCashInput(e.target.value)}
                    className="mt-1 block w-40 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 font-mono text-sm text-zinc-100"
                  />
                </label>
                <button
                  type="button"
                  disabled={savingHolding}
                  onClick={handleSaveHoldingCash}
                  className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 font-medium text-zinc-200 hover:bg-zinc-700"
                >
                  Save Cash
                </button>
              </div>

              <button
                type="button"
                onClick={onRefreshQuotes}
                className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/15 px-3 py-2 font-medium text-sky-200 hover:bg-sky-500/25"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh Live Prices Now
              </button>
            </div>

            {/* Add New Ticker Form */}
            <form onSubmit={handleAddHolding} className="mb-5 space-y-2 text-xs">
              <div className="font-semibold text-zinc-300">Add Stock / RSU Grant</div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-6 items-end">
                <label className="block text-[10px] text-zinc-400">
                  Ticker *
                  <input
                    type="text"
                    required
                    placeholder="AAPL"
                    value={newSymbol}
                    onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 font-mono text-xs text-zinc-100"
                  />
                </label>
                <label className="block text-[10px] text-zinc-400">
                  Type
                  <select
                    value={newHoldingType}
                    onChange={(e) => setNewHoldingType(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-2 text-xs text-zinc-100"
                  >
                    <option value="stock">Stock</option>
                    <option value="etf">ETF</option>
                    <option value="rsu">RSU</option>
                    <option value="espp">ESPP</option>
                  </select>
                </label>
                <label className="block text-[10px] text-zinc-400">
                  Vested Shares *
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    required
                    placeholder="50"
                    value={newVestedShares}
                    onChange={(e) => setNewVestedShares(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 font-mono text-xs text-zinc-100"
                  />
                </label>
                <label className="block text-[10px] text-zinc-400">
                  Unvested (opt)
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    placeholder="0"
                    value={newUnvestedShares}
                    onChange={(e) => setNewUnvestedShares(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 font-mono text-xs text-zinc-100"
                  />
                </label>
                <label className="block text-[10px] text-zinc-400">
                  Cost/Share (opt)
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={newCostBasis}
                    onChange={(e) => setNewCostBasis(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 font-mono text-xs text-zinc-100"
                  />
                </label>
                <button
                  type="submit"
                  disabled={savingHolding}
                  className="rounded-lg bg-emerald-500 px-3 py-2 font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
                >
                  {savingHolding ? 'Fetching…' : '+ Add Ticker'}
                </button>
              </div>
            </form>

            {/* Holdings Table */}
            <div className="divide-y divide-zinc-900 rounded-xl border border-zinc-800 px-4">
              {(holdingsByAccount.get(holdingsAccount.id) || []).map((h) => {
                const mktVal = toNumber(h.shares) * toNumber(h.last_price);
                const isEditing = editingHoldingId === h.id;

                return (
                  <div key={h.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-zinc-100">{h.symbol}</span>
                        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase text-zinc-400">
                          {HOLDING_TYPES[h.holding_type]?.label || h.holding_type}
                        </span>
                        <span className="font-mono text-zinc-400">
                          @ ${toNumber(h.last_price).toFixed(2)}
                        </span>
                      </div>

                      {isEditing ? (
                        <div className="mt-2 flex items-center gap-2">
                          <label className="text-[11px] text-zinc-400">
                            Vested:
                            <input
                              type="number"
                              step="0.0001"
                              value={editVestedInput}
                              onChange={(e) => setEditVestedInput(e.target.value)}
                              className="ml-1 w-24 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-zinc-100"
                            />
                          </label>
                          <label className="text-[11px] text-zinc-400">
                            Unvested:
                            <input
                              type="number"
                              step="0.0001"
                              value={editUnvestedInput}
                              onChange={(e) => setEditUnvestedInput(e.target.value)}
                              className="ml-1 w-24 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-zinc-100"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => handleSaveEditedHolding(h.id)}
                            className="rounded bg-emerald-500 px-2.5 py-1 font-semibold text-zinc-950"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingHoldingId(null)}
                            className="text-zinc-500 hover:text-zinc-300"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="mt-0.5 text-[11px] text-zinc-500">
                          {toNumber(h.shares)} vested shares
                          {toNumber(h.unvested_shares) > 0
                            ? ` • ${toNumber(h.unvested_shares)} unvested RSU shares`
                            : ''}
                          {h.cost_basis_per_share ? ` • Cost $${toNumber(h.cost_basis_per_share).toFixed(2)}` : ''}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-semibold text-zinc-100 tabular-nums">
                        {mask(formatCurrency(mktVal))}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingHoldingId(h.id);
                          setEditVestedInput(String(toNumber(h.shares)));
                          setEditUnvestedInput(String(toNumber(h.unvested_shares)));
                        }}
                        className="text-zinc-500 hover:text-zinc-200"
                        title="Edit vested / unvested shares"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteHolding(h.id)}
                        className="text-zinc-500 hover:text-rose-400"
                        title="Remove holding"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {(holdingsByAccount.get(holdingsAccount.id) || []).length === 0 && (
                <div className="py-8 text-center text-xs text-zinc-500">
                  No stock or RSU tickers added to this account yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: Manage 0% / Free Promo Balance Transfers */}
      {promoAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h2 className="text-base font-semibold text-zinc-100">
                  {promoAccount.name} — 0% Promo Balance Transfers
                </h2>
                <p className="text-xs text-zinc-500">
                  Track promo end dates, monthly payoff pace, and post-promo APR spikes so you never miss an expiration.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPromoAccount(null)}
                className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {promoError && (
              <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                {promoError}
              </div>
            )}

            <form onSubmit={handleAddPromo} className="mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-6 text-xs">
              <input
                type="text"
                required
                placeholder="Promo label (e.g., 18-mo 0% BT)"
                value={promoLabel}
                onChange={(e) => setPromoLabel(e.target.value)}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 sm:col-span-2"
              />
              <input
                type="number"
                step="0.01"
                required
                placeholder="Remaining ($)"
                value={promoBalance}
                onChange={(e) => setPromoBalance(e.target.value)}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 font-mono text-zinc-100"
              />
              <input
                type="number"
                step="0.01"
                placeholder="Original ($)"
                value={promoOriginal}
                onChange={(e) => setPromoOriginal(e.target.value)}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 font-mono text-zinc-100"
              />
              <label className="block text-[10px] text-zinc-400 sm:col-span-2">
                Promo Expires On *
                <input
                  type="date"
                  required
                  value={promoExpiresOn}
                  onChange={(e) => setPromoExpiresOn(e.target.value)}
                  className="mt-0.5 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100"
                />
              </label>

              <input
                type="number"
                step="0.01"
                placeholder="Promo APR %"
                value={promoApr}
                onChange={(e) => setPromoApr(e.target.value)}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 font-mono text-zinc-100"
              />
              <input
                type="number"
                step="0.01"
                placeholder="Revert APR %"
                value={promoStdApr}
                onChange={(e) => setPromoStdApr(e.target.value)}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 font-mono text-zinc-100"
              />
              <input
                type="text"
                placeholder="Notes (optional)"
                value={promoNotes}
                onChange={(e) => setPromoNotes(e.target.value)}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 sm:col-span-3"
              />
              <button
                type="submit"
                disabled={savingPromo}
                className="rounded-lg bg-amber-500 px-3 py-2 font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
              >
                {savingPromo ? 'Saving…' : '+ Add Promo'}
              </button>
            </form>

            <div className="divide-y divide-zinc-900 rounded-xl border border-zinc-800 px-4">
              {(promosByAccount.get(promoAccount.id) || []).map((p) => {
                const st = computePromoStatus(p);
                return (
                  <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold ${p.is_paid_off ? 'line-through text-zinc-500' : 'text-zinc-100'}`}>
                          {p.label}
                        </span>
                        <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                          {formatPercent(p.promo_apr, 1)} → {p.standard_apr ? `${formatPercent(p.standard_apr, 2)}` : 'Std APR'}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-zinc-500">
                        Expires {p.expires_on} •{' '}
                        {p.is_paid_off
                          ? 'Paid off'
                          : st.daysLeft < 0
                          ? `Expired ${Math.abs(st.daysLeft)} days ago`
                          : `${st.daysLeft} days left (${formatCurrency(st.requiredMonthlyPayment, { decimals: 0 })}/mo to clear)`}
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => handleUpdatePromoBalance(p)}
                        className="rounded border border-zinc-800 px-2 py-1 font-mono font-semibold text-amber-300 hover:border-zinc-700"
                        title="Click to update remaining balance"
                      >
                        {mask(formatCurrency(p.promo_balance))}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTogglePromoPaid(p)}
                        className={`rounded p-1 ${
                          p.is_paid_off ? 'text-emerald-400' : 'text-zinc-500 hover:text-emerald-400'
                        }`}
                        title={p.is_paid_off ? 'Reopen promo' : 'Mark paid off'}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePromo(p.id)}
                        className="text-zinc-500 hover:text-rose-400"
                        title="Delete promo"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {(promosByAccount.get(promoAccount.id) || []).length === 0 && (
                <div className="py-8 text-center text-xs text-zinc-500">
                  No balance transfer promos recorded on this card yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
