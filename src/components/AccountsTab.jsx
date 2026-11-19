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
  Home,
  Car,
  Gem,
  Globe,
  Search,
  Link2,
} from 'lucide-react';
import {
  ACCOUNT_CATEGORIES,
  computeAccountEquitySummary,
  computeGoldUsdValue,
  computeInrToUsdValue,
  computeNetWorthSummary,
  computePromoStatus,
  decodeVehicleVin,
  estimateLoanPayoff,
  formatCurrency,
  formatInrDisplay,
  formatPercent,
  formatShortDate,
  getOwnerDisplayName,
  getRealAssetType,
  GOLD_PURITY_OPTIONS,
  GOLD_UNIT_OPTIONS,
  HOLDING_TYPES,
  INR_UNIT_OPTIONS,
  ordinalDay,
  OWNER_PROFILES,
  subtypeToRealAssetType,
  todayIsoDate,
  toNumber,
} from '../lib/finance';

const FILTER_TABS = [
  { key: 'all', label: 'All Accounts' },
  { key: 'retirement_401k', label: '401(k) & Retirement' },
  { key: 'bank', label: 'Banks & Cash' },
  { key: 'investment', label: 'Investments & RSUs' },
  { key: 'other_asset', label: 'Property, Gold & Cars' },
  { key: 'credit_card', label: 'Credit Cards' },
  { key: 'loan', label: 'Active Loans' },
];

export default function AccountsTab({
  supabase,
  accounts,
  allAccounts,
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
    // Real & International Assets metadata fields
    property_location: '',
    purchase_price: '',
    linked_loan_id: '',
    gold_weight: '',
    gold_unit: 'grams',
    gold_purity: '22k',
    gold_spot_preview: '',
    inr_amount: '',
    inr_unit: 'crores',
    usd_inr_preview: '',
    vin: '',
    vehicle_year: '',
    vehicle_make: '',
    vehicle_model: '',
    vehicle_trim: '',
  });

  // Live VIN decode & live Gold/FX rate helper states inside Account modal
  const [decodingVin, setDecodingVin] = useState(false);
  const [vinStatus, setVinStatus] = useState(null);
  const [fetchingRate, setFetchingRate] = useState(false);

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

  const allAccountMap = useMemo(
    () => new Map((allAccounts || accounts || []).map((a) => [a.id, a])),
    [allAccounts, accounts]
  );

  const availableLoans = useMemo(
    () =>
      (allAccounts || accounts || []).filter(
        (a) => !a.is_archived && (a.category === 'loan' || a.category === 'other_liability')
      ),
    [allAccounts, accounts]
  );

  const summary = useMemo(() => computeNetWorthSummary(accounts), [accounts]);

  const visibleAccounts = useMemo(() => {
    return (accounts || [])
      .filter((a) => (showArchived ? true : !a.is_archived))
      .filter((a) => {
        if (filter === 'all') return true;
        if (filter === 'investment') return a.category === 'investment';
        if (filter === 'other_asset') return a.category === 'other_asset';
        if (filter === 'loan') return a.category === 'loan' || a.category === 'other_liability';
        return a.category === filter;
      })
      .sort((a, b) => {
        if (a.is_liability !== b.is_liability) return a.is_liability ? 1 : -1;
        return Math.abs(toNumber(b.current_balance)) - Math.abs(toNumber(a.current_balance));
      });
  }, [accounts, filter, showArchived]);

  const realAssetsBannerStats = useMemo(() => {
    if (filter !== 'other_asset') return null;
    const totalValue = visibleAccounts.reduce((s, a) => s + toNumber(a.current_balance), 0);
    const seenLoans = new Set();
    let totalLinkedDebt = 0;
    for (const a of visibleAccounts) {
      const lid = Number(a.metadata?.linked_loan_id);
      if (lid && !seenLoans.has(lid)) {
        const loan = allAccountMap.get(lid);
        if (loan && !loan.is_archived) {
          seenLoans.add(lid);
          totalLinkedDebt += toNumber(loan.current_balance);
        }
      }
    }
    return {
      totalValue,
      totalLinkedDebt,
      netEquity: totalValue - totalLinkedDebt,
      linkedLoanCount: seenLoans.size,
    };
  }, [filter, visibleAccounts, allAccountMap]);

  const fetchLiveMarketRateForForm = async (symbol) => {
    setFetchingRate(true);
    try {
      const { data, error } = await supabase.functions.invoke('stock-quotes', {
        body: { symbols: [symbol] },
      });
      if (error) throw error;
      const price = Number(data?.quotes?.[symbol]?.price);
      if (Number.isFinite(price) && price > 0) {
        if (symbol === 'GC=F') {
          setFormState((prev) => ({ ...prev, gold_spot_preview: String(price.toFixed(2)) }));
        } else if (symbol === 'INR=X') {
          setFormState((prev) => ({ ...prev, usd_inr_preview: String(price.toFixed(2)) }));
        }
        return price;
      }
    } catch {
      // Ignore silent prefill error; user can retry or enter rate manually
    } finally {
      setFetchingRate(false);
    }
    return null;
  };

  const handleDecodeVinClick = async () => {
    if (!formState.vin.trim()) return;
    setDecodingVin(true);
    setVinStatus(null);
    try {
      const decoded = await decodeVehicleVin(formState.vin);
      setFormState((prev) => ({
        ...prev,
        vin: decoded.vin,
        vehicle_year: decoded.year,
        vehicle_make: decoded.make,
        vehicle_model: decoded.model,
        vehicle_trim: decoded.trim,
        name: prev.name.trim() ? prev.name : decoded.displayName,
        institution: prev.institution.trim() ? prev.institution : decoded.make,
      }));
      setVinStatus({ type: 'ok', text: `Decoded: ${decoded.displayName}` });
    } catch (err) {
      setVinStatus({ type: 'err', text: err?.message || 'VIN lookup failed.' });
    } finally {
      setDecodingVin(false);
    }
  };

  const openCreateModal = (defaultCat = 'retirement_401k', defaultSubtype = null) => {
    const cat = ACCOUNT_CATEGORIES[defaultCat] ? defaultCat : 'retirement_401k';
    const sub =
      defaultSubtype && (ACCOUNT_CATEGORIES[cat].subtypes || []).includes(defaultSubtype)
        ? defaultSubtype
        : ACCOUNT_CATEGORIES[cat].subtypes[0] || '';
    setEditingAccount(null);
    setFormError('');
    setVinStatus(null);
    setFormState({
      owner_profile: defaultOwnerForScope,
      name: '',
      institution: '',
      category: cat,
      subtype: sub,
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
      property_location: '',
      purchase_price: '',
      linked_loan_id: '',
      gold_weight: '',
      gold_unit: 'grams',
      gold_purity: '22k',
      gold_spot_preview: '',
      inr_amount: '',
      inr_unit: 'crores',
      usd_inr_preview: '',
      vin: '',
      vehicle_year: '',
      vehicle_make: '',
      vehicle_model: '',
      vehicle_trim: '',
    });
    setFormModalOpen(true);

    if (cat === 'other_asset') {
      const rType = subtypeToRealAssetType(sub);
      if (rType === 'gold') fetchLiveMarketRateForForm('GC=F');
      if (rType === 'india_property') fetchLiveMarketRateForForm('INR=X');
    }
  };

  const openEditModal = (acc) => {
    const meta = acc.metadata || {};
    setEditingAccount(acc);
    setFormError('');
    setVinStatus(null);
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
      contribution_pct: meta.contribution_pct !== undefined && meta.contribution_pct !== null ? String(meta.contribution_pct) : '',
      employer_match_pct:
        meta.employer_match_pct !== undefined && meta.employer_match_pct !== null ? String(meta.employer_match_pct) : '',
      notes: acc.notes || '',
      add_initial_holding: false,
      initial_holdings: [{ symbol: '', holding_type: 'stock', shares: '', unvested_shares: '' }],
      add_initial_promo: false,
      promo_label: '',
      promo_balance: '',
      promo_apr: '0',
      standard_apr: '24.99',
      promo_expires_on: '',
      property_location: meta.property_location || '',
      purchase_price:
        meta.purchase_price !== undefined && meta.purchase_price !== null ? String(meta.purchase_price) : '',
      linked_loan_id: meta.linked_loan_id ? String(meta.linked_loan_id) : '',
      gold_weight: meta.gold_weight !== undefined && meta.gold_weight !== null ? String(meta.gold_weight) : '',
      gold_unit: meta.gold_unit || 'grams',
      gold_purity: meta.gold_purity || '22k',
      gold_spot_preview:
        meta.last_gold_oz_price !== undefined && meta.last_gold_oz_price !== null
          ? String(meta.last_gold_oz_price)
          : '',
      inr_amount: meta.inr_amount !== undefined && meta.inr_amount !== null ? String(meta.inr_amount) : '',
      inr_unit: meta.inr_unit || 'crores',
      usd_inr_preview:
        meta.last_usd_inr_rate !== undefined && meta.last_usd_inr_rate !== null
          ? String(meta.last_usd_inr_rate)
          : '',
      vin: meta.vin || '',
      vehicle_year: meta.vehicle_year || '',
      vehicle_make: meta.vehicle_make || '',
      vehicle_model: meta.vehicle_model || '',
      vehicle_trim: meta.vehicle_trim || '',
    });
    setFormModalOpen(true);
  };

  const handleCategoryChange = (newCat) => {
    const def = ACCOUNT_CATEGORIES[newCat];
    const nextSubtype = def?.subtypes?.[0] || '';
    setVinStatus(null);
    setFormState((prev) => ({
      ...prev,
      category: newCat,
      subtype: nextSubtype,
    }));
    if (newCat === 'other_asset') {
      const rType = subtypeToRealAssetType(nextSubtype);
      if (rType === 'gold') fetchLiveMarketRateForForm('GC=F');
      if (rType === 'india_property') fetchLiveMarketRateForForm('INR=X');
    }
  };

  const handleSubtypeChange = (nextSubtype) => {
    setVinStatus(null);
    setFormState((prev) => ({ ...prev, subtype: nextSubtype }));
    if (formState.category === 'other_asset') {
      const rType = subtypeToRealAssetType(nextSubtype);
      if (rType === 'gold' && !formState.gold_spot_preview) {
        fetchLiveMarketRateForForm('GC=F');
      }
      if (rType === 'india_property' && !formState.usd_inr_preview) {
        fetchLiveMarketRateForForm('INR=X');
      }
    }
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

      if (formState.category === 'other_asset') {
        const realAssetType = subtypeToRealAssetType(formState.subtype);
        metadata.real_asset_type = realAssetType;

        if (realAssetType === 'real_estate') {
          metadata.property_location = formState.property_location.trim();
          metadata.purchase_price =
            formState.purchase_price !== '' ? Number(parseFloat(formState.purchase_price)) : null;
          metadata.linked_loan_id = formState.linked_loan_id ? Number(formState.linked_loan_id) : null;
        } else if (realAssetType === 'gold') {
          const weightNum = Math.max(0, Number(parseFloat(formState.gold_weight || '0')) || 0);
          let spotPrice = Number(parseFloat(formState.gold_spot_preview || '0')) || 0;
          if (spotPrice <= 0) {
            const { data: qData } = await supabase.functions.invoke('stock-quotes', {
              body: { symbols: ['GC=F'] },
            });
            const fetched = Number(qData?.quotes?.['GC=F']?.price);
            if (Number.isFinite(fetched) && fetched > 0) spotPrice = fetched;
          }
          metadata.gold_weight = weightNum;
          metadata.gold_unit = formState.gold_unit || 'grams';
          metadata.gold_purity = formState.gold_purity || '22k';
          if (spotPrice > 0) {
            metadata.last_gold_oz_price = Number(spotPrice.toFixed(2));
            metadata.last_fx_at = new Date().toISOString();
            const goldCalc = computeGoldUsdValue(
              weightNum,
              metadata.gold_unit,
              metadata.gold_purity,
              spotPrice
            );
            balanceVal = goldCalc.usdValue;
          }
        } else if (realAssetType === 'india_property') {
          const inrAmt = Math.max(0, Number(parseFloat(formState.inr_amount || '0')) || 0);
          let fxRate = Number(parseFloat(formState.usd_inr_preview || '0')) || 0;
          if (fxRate <= 0) {
            const { data: qData } = await supabase.functions.invoke('stock-quotes', {
              body: { symbols: ['INR=X'] },
            });
            const fetched = Number(qData?.quotes?.['INR=X']?.price);
            if (Number.isFinite(fetched) && fetched > 0) fxRate = fetched;
          }
          if (fxRate <= 0) fxRate = 85;
          metadata.inr_amount = inrAmt;
          metadata.inr_unit = formState.inr_unit || 'crores';
          metadata.property_location = formState.property_location.trim();
          metadata.linked_loan_id = formState.linked_loan_id ? Number(formState.linked_loan_id) : null;
          metadata.last_usd_inr_rate = Number(fxRate.toFixed(4));
          metadata.last_fx_at = new Date().toISOString();
          const inrCalc = computeInrToUsdValue(inrAmt, metadata.inr_unit, fxRate);
          balanceVal = inrCalc.usdValue;
        } else if (realAssetType === 'vehicle') {
          metadata.vin = formState.vin.trim().toUpperCase();
          metadata.vehicle_year = formState.vehicle_year.trim();
          metadata.vehicle_make = formState.vehicle_make.trim();
          metadata.vehicle_model = formState.vehicle_model.trim();
          metadata.vehicle_trim = formState.vehicle_trim.trim();
          metadata.linked_loan_id = formState.linked_loan_id ? Number(formState.linked_loan_id) : null;
        }
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

  const activeRealAssetType =
    formState.category === 'other_asset' ? subtypeToRealAssetType(formState.subtype) : null;
  const isLiveAutoPricedRealAsset =
    activeRealAssetType === 'gold' || activeRealAssetType === 'india_property';

  const goldPreviewCalc =
    activeRealAssetType === 'gold' && toNumber(formState.gold_weight) > 0 && toNumber(formState.gold_spot_preview) > 0
      ? computeGoldUsdValue(
          formState.gold_weight,
          formState.gold_unit,
          formState.gold_purity,
          formState.gold_spot_preview
        )
      : null;

  const inrPreviewCalc =
    activeRealAssetType === 'india_property' &&
    toNumber(formState.inr_amount) > 0 &&
    toNumber(formState.usd_inr_preview) > 0
      ? computeInrToUsdValue(
          formState.inr_amount,
          formState.inr_unit,
          formState.usd_inr_preview
        )
      : null;

  const selectedLinkedLoan = formState.linked_loan_id
    ? allAccountMap.get(Number(formState.linked_loan_id))
    : null;

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

      {filter === 'other_asset' && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-teal-500/25 bg-teal-500/5 px-5 py-3.5 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            {realAssetsBannerStats && realAssetsBannerStats.totalValue > 0 ? (
              <>
                <div>
                  <span className="text-zinc-400">Real Assets Value: </span>
                  <span className="font-mono font-semibold text-teal-200">
                    {mask(formatCurrency(realAssetsBannerStats.totalValue))}
                  </span>
                </div>
                {realAssetsBannerStats.totalLinkedDebt > 0 && (
                  <>
                    <div>
                      <span className="text-zinc-400">Linked Loans: </span>
                      <span className="font-mono font-semibold text-rose-300">
                        -{mask(formatCurrency(realAssetsBannerStats.totalLinkedDebt))}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-400">Net Equity: </span>
                      <span
                        className={`font-mono font-semibold ${
                          realAssetsBannerStats.netEquity >= 0 ? 'text-emerald-300' : 'text-rose-300'
                        }`}
                      >
                        {mask(formatCurrency(realAssetsBannerStats.netEquity))}
                      </span>
                    </div>
                  </>
                )}
              </>
            ) : (
              <span className="text-zinc-300">
                Track US Real Estate, Physical Gold (auto-priced), India Properties (live INR→USD), and Vehicles by VIN.
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => openCreateModal('other_asset', 'US Home / Real Estate')}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] font-medium text-zinc-200 hover:border-teal-500/50 hover:text-teal-200"
            >
              <Home className="h-3 w-3 text-teal-400" />
              + US Home
            </button>
            <button
              type="button"
              onClick={() => openCreateModal('other_asset', 'Physical Gold / Jewelry')}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] font-medium text-zinc-200 hover:border-amber-500/50 hover:text-amber-200"
            >
              <Gem className="h-3 w-3 text-amber-400" />
              + Gold
            </button>
            <button
              type="button"
              onClick={() => openCreateModal('other_asset', 'India Property / Land')}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] font-medium text-zinc-200 hover:border-sky-500/50 hover:text-sky-200"
            >
              <Globe className="h-3 w-3 text-sky-400" />
              + India Property
            </button>
            <button
              type="button"
              onClick={() => openCreateModal('other_asset', 'Vehicle / Car')}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] font-medium text-zinc-200 hover:border-emerald-500/50 hover:text-emerald-200"
            >
              <Car className="h-3 w-3 text-emerald-400" />
              + Car (VIN)
            </button>
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
            const realAssetType = getRealAssetType(acc);
            const meta = acc.metadata || {};
            const linkedLoan =
              meta.linked_loan_id ? allAccountMap.get(Number(meta.linked_loan_id)) : null;
            const linkedLoanBalance =
              linkedLoan && !linkedLoan.is_archived ? toNumber(linkedLoan.current_balance) : 0;
            const netAssetEquity = linkedLoan ? bal - linkedLoanBalance : null;

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
                    {/* Real & International Assets Rich Details */}
                    {realAssetType === 'gold' && toNumber(meta.gold_weight) > 0 && (
                      <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-[11px]">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-amber-200">
                          <span className="inline-flex items-center gap-1.5 font-medium">
                            <Gem className="h-3.5 w-3.5 text-amber-400" />
                            {toNumber(meta.gold_weight).toLocaleString('en-US', {
                              maximumFractionDigits: 2,
                            })}{' '}
                            {GOLD_UNIT_OPTIONS[meta.gold_unit]?.short || 'g'} •{' '}
                            {GOLD_PURITY_OPTIONS[meta.gold_purity]?.label || '22K'}
                          </span>
                          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">
                            Live Gold (GC=F)
                          </span>
                        </div>
                        {toNumber(meta.last_gold_oz_price) > 0 && (
                          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-zinc-400 tabular-nums">
                            <span>
                              Spot: {formatCurrency(meta.last_gold_oz_price, { decimals: 0 })}/oz
                            </span>
                            <span>
                              ~
                              {formatCurrency(
                                computeGoldUsdValue(
                                  1,
                                  'grams',
                                  meta.gold_purity || '22k',
                                  meta.last_gold_oz_price
                                ).perGramUsd
                              )}
                              /g ({GOLD_PURITY_OPTIONS[meta.gold_purity]?.short || '22K'})
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {realAssetType === 'india_property' && toNumber(meta.inr_amount) > 0 && (
                      <div className="rounded-lg border border-sky-500/25 bg-sky-500/5 p-3 text-[11px]">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sky-200">
                          <span className="inline-flex items-center gap-1.5 font-semibold">
                            <Globe className="h-3.5 w-3.5 text-sky-400" />
                            {privacyMode
                              ? '₹••••••'
                              : formatInrDisplay(meta.inr_amount, meta.inr_unit || 'crores')}
                            {meta.property_location ? ` • ${meta.property_location}` : ''}
                          </span>
                          <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-300">
                            Live FX (INR=X)
                          </span>
                        </div>
                        {toNumber(meta.last_usd_inr_rate) > 0 && (
                          <div className="mt-1.5 flex items-center justify-between text-zinc-400 tabular-nums">
                            <span>Converted @ ₹{toNumber(meta.last_usd_inr_rate).toFixed(2)} / $1</span>
                            <span className="font-mono text-zinc-200">{mask(formatCurrency(bal))}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {realAssetType === 'vehicle' &&
                      (meta.vin || meta.vehicle_make || meta.vehicle_model) && (
                        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-[11px]">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 font-medium text-zinc-200">
                              <Car className="h-3.5 w-3.5 text-teal-400" />
                              {[
                                meta.vehicle_year,
                                meta.vehicle_make,
                                meta.vehicle_model,
                                meta.vehicle_trim,
                              ]
                                .filter(Boolean)
                                .join(' ') || acc.name}
                            </span>
                            {meta.vin && (
                              <span className="rounded bg-zinc-950 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                                VIN {meta.vin}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                    {realAssetType === 'real_estate' &&
                      (meta.property_location || toNumber(meta.purchase_price) > 0) && (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-[11px] text-zinc-300">
                          <span className="inline-flex items-center gap-1.5">
                            <Home className="h-3.5 w-3.5 text-teal-400" />
                            {meta.property_location || 'US Real Estate'}
                          </span>
                          {toNumber(meta.purchase_price) > 0 && (
                            <span className="font-mono text-zinc-400 tabular-nums">
                              Bought: {mask(formatCurrency(meta.purchase_price, { decimals: 0 }))}
                              {bal > 0 && (
                                <span
                                  className={`ml-1.5 ${
                                    bal - toNumber(meta.purchase_price) >= 0
                                      ? 'text-emerald-400'
                                      : 'text-rose-400'
                                  }`}
                                >
                                  (
                                  {mask(
                                    formatCurrency(bal - toNumber(meta.purchase_price), {
                                      showSign: true,
                                      decimals: 0,
                                    })
                                  )}
                                  )
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      )}

                    {/* Linked Mortgage / Auto Loan Net Equity Box */}
                    {linkedLoan && netAssetEquity !== null && (
                      <div className="rounded-lg border border-teal-500/25 bg-teal-500/5 p-3 text-[11px]">
                        <div className="flex items-center justify-between text-zinc-400">
                          <span className="inline-flex items-center gap-1.5 text-teal-200">
                            <Link2 className="h-3.5 w-3.5 text-teal-400" />
                            Linked Loan: {linkedLoan.name}
                          </span>
                          <span className="font-mono text-rose-300 tabular-nums">
                            -{mask(formatCurrency(linkedLoanBalance))}
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between border-t border-teal-500/15 pt-1.5">
                          <span className="font-medium text-zinc-200">Net Equity (Value − Loan)</span>
                          <span
                            className={`font-mono text-xs font-bold tabular-nums ${
                              netAssetEquity >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {mask(formatCurrency(netAssetEquity))}
                          </span>
                        </div>
                      </div>
                    )}

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
                    onChange={(e) => handleSubtypeChange(e.target.value)}
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

              {/* Vehicle VIN Auto-Decoder (placed above Nickname so VIN decode can auto-fill Nickname) */}
              {activeRealAssetType === 'vehicle' && (
                <div className="space-y-3 rounded-xl border border-teal-500/25 bg-teal-500/5 p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 font-medium text-teal-200">
                      <Car className="h-3.5 w-3.5 text-teal-400" />
                      Vehicle VIN Auto-Lookup (US NHTSA)
                    </span>
                    <span className="text-[10px] text-zinc-400">Free • Instant decode</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      maxLength={17}
                      placeholder="17-digit VIN (e.g., 2T3P1RFV8PW123456)"
                      value={formState.vin}
                      onChange={(e) =>
                        setFormState({ ...formState, vin: e.target.value.toUpperCase() })
                      }
                      className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 focus:border-teal-500/60 focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={decodingVin || formState.vin.trim().length < 11}
                      onClick={handleDecodeVinClick}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-teal-500/40 bg-teal-500/15 px-3 py-2 text-xs font-semibold text-teal-200 hover:bg-teal-500/25 disabled:opacity-50"
                    >
                      <Search className="h-3.5 w-3.5" />
                      {decodingVin ? 'Decoding…' : 'Decode VIN'}
                    </button>
                  </div>
                  {vinStatus && (
                    <div
                      className={`text-[11px] ${
                        vinStatus.type === 'ok' ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {vinStatus.text}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <input
                      type="text"
                      placeholder="Year"
                      value={formState.vehicle_year}
                      onChange={(e) => setFormState({ ...formState, vehicle_year: e.target.value })}
                      className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100"
                    />
                    <input
                      type="text"
                      placeholder="Make"
                      value={formState.vehicle_make}
                      onChange={(e) => setFormState({ ...formState, vehicle_make: e.target.value })}
                      className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100"
                    />
                    <input
                      type="text"
                      placeholder="Model"
                      value={formState.vehicle_model}
                      onChange={(e) => setFormState({ ...formState, vehicle_model: e.target.value })}
                      className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100"
                    />
                    <input
                      type="text"
                      placeholder="Trim"
                      value={formState.vehicle_trim}
                      onChange={(e) => setFormState({ ...formState, vehicle_trim: e.target.value })}
                      className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-zinc-300">
                  {activeRealAssetType === 'real_estate'
                    ? 'Property Name *'
                    : activeRealAssetType === 'india_property'
                    ? 'India Property Name *'
                    : activeRealAssetType === 'gold'
                    ? 'Gold Holding Name *'
                    : activeRealAssetType === 'vehicle'
                    ? 'Vehicle Nickname *'
                    : 'Account Nickname *'}
                  <input
                    type="text"
                    required
                    placeholder={
                      activeRealAssetType === 'real_estate'
                        ? 'e.g., Primary Residence'
                        : activeRealAssetType === 'india_property'
                        ? 'e.g., Hyderabad Plot / Flat'
                        : activeRealAssetType === 'gold'
                        ? 'e.g., Family 22K Gold / Bars'
                        : activeRealAssetType === 'vehicle'
                        ? 'e.g., 2023 Toyota RAV4 Hybrid'
                        : 'e.g., E*TRADE RSU, Wife Fidelity 401(k)'
                    }
                    value={formState.name}
                    onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                  />
                </label>

                <label className="block text-zinc-300">
                  {activeRealAssetType === 'real_estate' || activeRealAssetType === 'india_property'
                    ? 'Location / City'
                    : activeRealAssetType === 'gold'
                    ? 'Storage / Locker (optional)'
                    : activeRealAssetType === 'vehicle'
                    ? 'Make / Dealer (optional)'
                    : 'Institution / Issuer'}
                  <input
                    type="text"
                    placeholder={
                      activeRealAssetType === 'real_estate'
                        ? 'e.g., Austin, TX'
                        : activeRealAssetType === 'india_property'
                        ? 'e.g., Hyderabad, Telangana'
                        : activeRealAssetType === 'gold'
                        ? 'e.g., Bank Locker / Home Safe'
                        : activeRealAssetType === 'vehicle'
                        ? 'e.g., Toyota, Tesla, Honda'
                        : 'e.g., Fidelity, E*TRADE, Citi, Chase'
                    }
                    value={
                      activeRealAssetType === 'real_estate' || activeRealAssetType === 'india_property'
                        ? formState.property_location
                        : formState.institution
                    }
                    onChange={(e) =>
                      activeRealAssetType === 'real_estate' || activeRealAssetType === 'india_property'
                        ? setFormState({ ...formState, property_location: e.target.value })
                        : setFormState({ ...formState, institution: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                  />
                </label>
              </div>

              {/* Physical Gold Live Spot Pricing Panel */}
              {activeRealAssetType === 'gold' && (
                <div className="space-y-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 font-medium text-amber-200">
                      <Gem className="h-3.5 w-3.5 text-amber-400" />
                      Physical Gold (Auto-Priced via Live Gold Spot)
                    </span>
                    <button
                      type="button"
                      disabled={fetchingRate}
                      onClick={() => fetchLiveMarketRateForForm('GC=F')}
                      className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-200 hover:bg-amber-500/25"
                    >
                      <RefreshCw className={`h-3 w-3 ${fetchingRate ? 'animate-spin' : ''}`} />
                      {fetchingRate ? 'Fetching…' : 'Live Spot'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    <label className="block text-zinc-300">
                      Total Weight *
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        placeholder="e.g., 250"
                        value={formState.gold_weight}
                        onChange={(e) => setFormState({ ...formState, gold_weight: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100"
                      />
                    </label>
                    <label className="block text-zinc-300">
                      Weight Unit
                      <select
                        value={formState.gold_unit}
                        onChange={(e) => setFormState({ ...formState, gold_unit: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-100"
                      >
                        {Object.values(GOLD_UNIT_OPTIONS).map((u) => (
                          <option key={u.key} value={u.key}>
                            {u.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-zinc-300">
                      Purity (Karat)
                      <select
                        value={formState.gold_purity}
                        onChange={(e) => setFormState({ ...formState, gold_purity: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-100"
                      >
                        {Object.values(GOLD_PURITY_OPTIONS).map((p) => (
                          <option key={p.key} value={p.key}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/20 bg-zinc-950/70 px-3 py-2 text-[11px]">
                    <span className="text-zinc-400">
                      {toNumber(formState.gold_spot_preview) > 0
                        ? `Live Gold Spot: ${formatCurrency(formState.gold_spot_preview)}/oz`
                        : 'Live Gold Spot (GC=F) will auto-fetch on save'}
                    </span>
                    {goldPreviewCalc && (
                      <span className="font-mono font-semibold text-amber-300 tabular-nums">
                        ≈ {formatCurrency(goldPreviewCalc.usdValue)} USD
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* India Property Live USD/INR FX Panel */}
              {activeRealAssetType === 'india_property' && (
                <div className="space-y-3 rounded-xl border border-sky-500/25 bg-sky-500/5 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 font-medium text-sky-200">
                      <Globe className="h-3.5 w-3.5 text-sky-400" />
                      India Property Valuation (Live INR → USD FX)
                    </span>
                    <button
                      type="button"
                      disabled={fetchingRate}
                      onClick={() => fetchLiveMarketRateForForm('INR=X')}
                      className="inline-flex items-center gap-1 rounded border border-sky-500/30 bg-sky-500/15 px-2 py-0.5 text-[10px] font-medium text-sky-200 hover:bg-sky-500/25"
                    >
                      <RefreshCw className={`h-3 w-3 ${fetchingRate ? 'animate-spin' : ''}`} />
                      {fetchingRate ? 'Fetching…' : 'Live USD/INR'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <label className="block text-zinc-300">
                      Rough Valuation in INR *
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        placeholder={
                          formState.inr_unit === 'crores'
                            ? 'e.g., 1.5'
                            : formState.inr_unit === 'lakhs'
                            ? 'e.g., 85'
                            : 'e.g., 15000000'
                        }
                        value={formState.inr_amount}
                        onChange={(e) => setFormState({ ...formState, inr_amount: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100"
                      />
                    </label>
                    <label className="block text-zinc-300">
                      INR Unit
                      <select
                        value={formState.inr_unit}
                        onChange={(e) => setFormState({ ...formState, inr_unit: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                      >
                        {Object.values(INR_UNIT_OPTIONS).map((u) => (
                          <option key={u.key} value={u.key}>
                            {u.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-500/20 bg-zinc-950/70 px-3 py-2 text-[11px]">
                    <span className="text-zinc-400">
                      {toNumber(formState.usd_inr_preview) > 0
                        ? `Live Rate: ₹${toNumber(formState.usd_inr_preview).toFixed(2)} = $1 USD`
                        : 'Live USD/INR (INR=X) will auto-fetch on save'}
                    </span>
                    {inrPreviewCalc && (
                      <span className="font-mono font-semibold text-sky-300 tabular-nums">
                        {formatInrDisplay(formState.inr_amount, formState.inr_unit)} ≈{' '}
                        {formatCurrency(inrPreviewCalc.usdValue)}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Standard Balance & Rate Row (Hidden for auto-priced Gold & India Property) */}
              {!isLiveAutoPricedRealAsset && (
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
                        : activeRealAssetType === 'real_estate' || activeRealAssetType === 'vehicle'
                        ? 'Estimated Market Value ($) *'
                        : 'Current Balance / Cash ($) *'}
                      <input
                        type="number"
                        step="0.01"
                        required={!formState.add_initial_holding}
                        placeholder={
                          activeRealAssetType === 'real_estate'
                            ? 'e.g., 650000'
                            : activeRealAssetType === 'vehicle'
                            ? 'e.g., 28000'
                            : '0.00'
                        }
                        value={formState.current_balance}
                        onChange={(e) => setFormState({ ...formState, current_balance: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                      />
                    </label>
                  )}

                  {activeRealAssetType === 'real_estate' ? (
                    <label className="block text-zinc-300">
                      Original Purchase Price ($)
                      <input
                        type="number"
                        step="1"
                        min="0"
                        placeholder="e.g., 540000 (optional)"
                        value={formState.purchase_price}
                        onChange={(e) => setFormState({ ...formState, purchase_price: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                      />
                    </label>
                  ) : activeRealAssetType !== 'vehicle' ? (
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
                  ) : (
                    <div className="flex flex-col justify-end text-[11px] text-zinc-500">
                      Enter a rough KBB / Carvana private-party estimate. You can link your Auto Loan below to see Net Car Equity.
                    </div>
                  )}
                </div>
              )}

              {/* Link to Mortgage / Auto Loan for US Home, India Property, and Vehicles */}
              {(activeRealAssetType === 'real_estate' ||
                activeRealAssetType === 'vehicle' ||
                activeRealAssetType === 'india_property') && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5">
                  <label className="block text-zinc-300">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <Link2 className="h-3.5 w-3.5 text-teal-400" />
                      {activeRealAssetType === 'vehicle'
                        ? 'Link to Auto Loan (for Net Car Equity)'
                        : 'Link to Mortgage / Property Loan (for Net Equity)'}
                    </span>
                    <select
                      value={formState.linked_loan_id}
                      onChange={(e) => setFormState({ ...formState, linked_loan_id: e.target.value })}
                      className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-teal-500/60 focus:outline-none"
                    >
                      <option value="">No loan linked (owned outright / add loan later)</option>
                      {availableLoans.map((loan) => (
                        <option key={loan.id} value={String(loan.id)}>
                          {loan.name} — {formatCurrency(loan.current_balance)} remaining
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedLinkedLoan && (
                    <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-400 tabular-nums">
                      <span>Preview Net Equity (Value − Loan):</span>
                      <span className="font-mono font-semibold text-emerald-300">
                        {formatCurrency(
                          (activeRealAssetType === 'india_property'
                            ? inrPreviewCalc?.usdValue || 0
                            : toNumber(formState.current_balance)) -
                            toNumber(selectedLinkedLoan.current_balance)
                        )}
                      </span>
                    </div>
                  )}
                  {availableLoans.length === 0 && (
                    <p className="mt-1.5 text-[10px] text-zinc-500">
                      Tip: Add your Mortgage or Auto Loan under Active Loans first (or afterwards and come back to Edit to link it).
                    </p>
                  )}
                </div>
              )}

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
                    const isAutoLiveRealAsset = ['gold', 'india_property'].includes(
                      getRealAssetType(acc)
                    );

                    return (
                      <div key={acc.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-zinc-200">{acc.name}</span>
                            <span className={`rounded border px-1.5 py-0.5 text-[10px] ${ownerBadge.badgeClass}`}>
                              {getOwnerDisplayName(ownerKey, householdNames)}
                            </span>
                            {(hasHoldings || isAutoLiveRealAsset) && (
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
