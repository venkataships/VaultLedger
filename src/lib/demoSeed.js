import { shiftMonthKey, todayIsoDate } from './finance';

function addDaysIso(days) {
  const dt = new Date();
  dt.setDate(dt.getDate() + days);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function seedDemoVaultData(supabase) {
  const today = todayIsoDate();
  const curMonth = today.slice(0, 7);

  // 1. Sample household accounts across Me (primary), Wife (spouse), and Joint
  const accountsPayload = [
    {
      owner_profile: 'primary',
      name: 'Fidelity 401(k)',
      institution: 'Fidelity',
      category: 'retirement_401k',
      subtype: 'Traditional 401(k)',
      is_liability: false,
      current_balance: 148500.0,
      cash_balance: 0,
      interest_rate: 8.5,
      notes: '12% employee contribution + 5% employer match (100% vested)',
      metadata: { contribution_pct: 12, employer_match_pct: 5 },
    },
    {
      owner_profile: 'spouse',
      name: 'Wife Vanguard 401(k)',
      institution: 'Vanguard',
      category: 'retirement_401k',
      subtype: 'Traditional 401(k)',
      is_liability: false,
      current_balance: 92400.0,
      cash_balance: 0,
      interest_rate: 8.2,
      notes: '10% contribution + 4% match',
      metadata: { contribution_pct: 10, employer_match_pct: 4 },
    },
    {
      owner_profile: 'primary',
      name: 'Employer RSU & Stock Account',
      institution: 'E*TRADE',
      category: 'investment',
      subtype: 'Employer RSUs / ESPP',
      is_liability: false,
      current_balance: 54250.0,
      cash_balance: 1250.0,
      interest_rate: null,
      notes: 'Auto-refreshed live on page open from MSFT + NVDA tickers',
      metadata: {},
    },
    {
      owner_profile: 'joint',
      name: 'Joint Ally Emergency HYSA',
      institution: 'Ally Bank',
      category: 'bank',
      subtype: 'High-Yield Savings (HYSA)',
      is_liability: false,
      current_balance: 36000.0,
      cash_balance: 36000.0,
      interest_rate: 4.25,
      notes: '6-month household liquid emergency reserve',
      metadata: {},
    },
    {
      owner_profile: 'primary',
      name: 'Chase Primary Checking',
      institution: 'Chase',
      category: 'bank',
      subtype: 'Checking',
      is_liability: false,
      current_balance: 8450.0,
      cash_balance: 8450.0,
      interest_rate: 0.01,
      notes: 'Direct deposit & bill pay hub',
      metadata: {},
    },
    {
      owner_profile: 'spouse',
      name: 'Wife Capital One HYSA',
      institution: 'Capital One',
      category: 'bank',
      subtype: 'High-Yield Savings (HYSA)',
      is_liability: false,
      current_balance: 19800.0,
      cash_balance: 19800.0,
      interest_rate: 4.1,
      notes: 'Personal savings & travel fund',
      metadata: {},
    },
    {
      owner_profile: 'primary',
      name: 'Citi Simplicity 0% BT Card',
      institution: 'Citi',
      category: 'credit_card',
      subtype: '0% Intro APR Card',
      is_liability: true,
      current_balance: 4800.0,
      cash_balance: 0,
      credit_limit: 16000.0,
      interest_rate: 24.99,
      minimum_payment: 95.0,
      due_day: 21,
      notes: '0% balance transfer promo active — pay off before expiration',
      metadata: {},
    },
    {
      owner_profile: 'primary',
      name: 'Chase Sapphire Preferred',
      institution: 'Chase',
      category: 'credit_card',
      subtype: 'Travel Card',
      is_liability: true,
      current_balance: 1640.0,
      cash_balance: 0,
      credit_limit: 18000.0,
      interest_rate: 21.49,
      minimum_payment: 45.0,
      due_day: 18,
      notes: 'Paid in full monthly via autopay',
      metadata: {},
    },
    {
      owner_profile: 'spouse',
      name: 'Wife Amex Blue Cash',
      institution: 'American Express',
      category: 'credit_card',
      subtype: 'Cash Back Card',
      is_liability: true,
      current_balance: 720.0,
      cash_balance: 0,
      credit_limit: 14000.0,
      interest_rate: 22.99,
      minimum_payment: 35.0,
      due_day: 24,
      notes: 'Groceries & gas rewards card',
      metadata: {},
    },
    {
      owner_profile: 'joint',
      name: 'Auto Loan — RAV4 Hybrid',
      institution: 'Toyota Financial',
      category: 'loan',
      subtype: 'Auto Loan',
      is_liability: true,
      current_balance: 14200.0,
      cash_balance: 0,
      original_principal: 28500.0,
      interest_rate: 4.49,
      minimum_payment: 520.0,
      due_day: 12,
      notes: '60-month term, ahead of schedule',
      metadata: {},
    },
  ];

  const normalizedAccounts = accountsPayload.map((acc) => ({
    owner_profile: acc.owner_profile ?? 'primary',
    name: acc.name,
    institution: acc.institution ?? '',
    category: acc.category,
    subtype: acc.subtype ?? '',
    is_liability: Boolean(acc.is_liability),
    current_balance: acc.current_balance ?? 0,
    cash_balance: acc.cash_balance ?? 0,
    credit_limit: acc.credit_limit ?? null,
    original_principal: acc.original_principal ?? null,
    interest_rate: acc.interest_rate ?? null,
    minimum_payment: acc.minimum_payment ?? null,
    due_day: acc.due_day ?? null,
    notes: acc.notes ?? '',
    metadata: acc.metadata ?? {},
  }));

  const { data: insertedAccounts, error: accErr } = await supabase
    .from('accounts')
    .insert(normalizedAccounts)
    .select('*');
  if (accErr) throw accErr;

  const byName = Object.fromEntries(insertedAccounts.map((a) => [a.name, a]));

  // 2. Sample Live Stock & RSU Holdings (auto-refreshes via stock-quotes immediately)
  const rsuAccountId = byName['Employer RSU & Stock Account']?.id;
  if (rsuAccountId) {
    const holdingsPayload = [
      {
        account_id: rsuAccountId,
        symbol: 'MSFT',
        holding_type: 'rsu',
        shares: 80,
        unvested_shares: 45,
        cost_basis_per_share: 340.0,
        last_price: 420.0,
        prev_close: 416.0,
        notes: 'Annual RSU vest schedule',
      },
      {
        account_id: rsuAccountId,
        symbol: 'NVDA',
        holding_type: 'stock',
        shares: 135,
        unvested_shares: 0,
        cost_basis_per_share: 92.0,
        last_price: 140.0,
        prev_close: 138.0,
        notes: 'Long-term position',
      },
    ];
    const { error: holdErr } = await supabase.from('equity_holdings').insert(holdingsPayload);
    if (holdErr) throw holdErr;
  }

  // 3. Sample 0% Promo Balance Transfer Reminder
  const btCardId = byName['Citi Simplicity 0% BT Card']?.id;
  if (btCardId) {
    const { error: promoErr } = await supabase.from('credit_card_promos').insert([
      {
        account_id: btCardId,
        label: '18-mo 0% Balance Transfer',
        original_amount: 8500.0,
        promo_balance: 4800.0,
        promo_apr: 0.0,
        standard_apr: 24.99,
        transfer_fee_pct: 3.0,
        expires_on: addDaysIso(72),
        is_paid_off: false,
        notes: 'Clear remaining balance before promo expires to avoid retroactive interest',
      },
    ]);
    if (promoErr) throw promoErr;
  }

  // 4. Insert 6 months of historical balance snapshots
  const historyFactors = [
    { monthsAgo: 5, assetMult: 0.87, debtMult: 1.15 },
    { monthsAgo: 4, assetMult: 0.9, debtMult: 1.12 },
    { monthsAgo: 3, assetMult: 0.92, debtMult: 1.09 },
    { monthsAgo: 2, assetMult: 0.95, debtMult: 1.06 },
    { monthsAgo: 1, assetMult: 0.98, debtMult: 1.03 },
    { monthsAgo: 0, assetMult: 1.0, debtMult: 1.0 },
  ];

  const snapshotRows = [];
  for (const step of historyFactors) {
    const snapDate =
      step.monthsAgo === 0 ? today : `${shiftMonthKey(curMonth, -step.monthsAgo)}-01`;

    for (const acc of insertedAccounts) {
      const mult = acc.is_liability ? step.debtMult : step.assetMult;
      const bal = Number((Number(acc.current_balance) * mult).toFixed(2));
      snapshotRows.push({
        account_id: acc.id,
        snapshot_date: snapDate,
        balance: bal,
        note: step.monthsAgo === 0 ? 'Initial live balance' : 'Monthly check-in',
      });
    }
  }

  const { error: snapErr } = await supabase
    .from('balance_snapshots')
    .upsert(snapshotRows, { onConflict: 'account_id,snapshot_date' });
  if (snapErr) throw snapErr;

  // 5. Insert Recurring Monthly Bills (Primary, Spouse, Joint)
  const checkingId = byName['Chase Primary Checking']?.id || null;
  const sapphireId = byName['Chase Sapphire Preferred']?.id || null;
  const wifeCardId = byName['Wife Amex Blue Cash']?.id || null;

  const billsPayload = [
    {
      owner_profile: 'joint',
      name: 'Apartment Rent',
      category: 'Housing',
      amount: 2150.0,
      due_day: 1,
      cadence: 'monthly',
      payment_account_id: checkingId,
      is_essential: true,
      autopay: true,
    },
    {
      owner_profile: 'joint',
      name: 'Auto Loan Payment',
      category: 'Debt & Loan Payments',
      amount: 520.0,
      due_day: 12,
      cadence: 'monthly',
      payment_account_id: checkingId,
      is_essential: true,
      autopay: true,
    },
    {
      owner_profile: 'primary',
      name: '0% BT Paydown Transfer',
      category: 'Debt & Loan Payments',
      amount: 450.0,
      due_day: 21,
      cadence: 'monthly',
      payment_account_id: checkingId,
      is_essential: true,
      autopay: true,
    },
    {
      owner_profile: 'joint',
      name: 'Electric & Fiber Internet',
      category: 'Utilities & Internet',
      amount: 165.0,
      due_day: 15,
      cadence: 'monthly',
      payment_account_id: sapphireId,
      is_essential: true,
      autopay: true,
    },
    {
      owner_profile: 'spouse',
      name: 'Wife Phone & Fitness Membership',
      category: 'Fitness & Wellness',
      amount: 115.0,
      due_day: 18,
      cadence: 'monthly',
      payment_account_id: wifeCardId,
      is_essential: false,
      autopay: true,
    },
  ];

  const { data: insertedBills, error: billErr } = await supabase
    .from('recurring_bills')
    .insert(billsPayload)
    .select('*');
  if (billErr) throw billErr;

  // 6. Insert sample monthly expenses across current month + last 2 months
  const prev1 = shiftMonthKey(curMonth, -1);
  const prev2 = shiftMonthKey(curMonth, -2);

  const expensesPayload = [
    ...insertedBills.map((b) => ({
      owner_profile: b.owner_profile || 'primary',
      expense_date: `${curMonth}-${String(Math.min(b.due_day || 1, 28)).padStart(2, '0')}`,
      merchant: b.name,
      category: b.category,
      amount: b.amount,
      payment_account_id: b.payment_account_id ?? null,
      recurring_bill_id: b.id,
      is_essential: b.is_essential,
      notes: 'Recurring monthly bill',
    })),
    {
      owner_profile: 'spouse',
      expense_date: `${curMonth}-04`,
      merchant: 'Trader Joe’s & Whole Foods',
      category: 'Groceries',
      amount: 385.4,
      payment_account_id: wifeCardId,
      recurring_bill_id: null,
      is_essential: true,
      notes: 'Weekly household groceries',
    },
    {
      owner_profile: 'primary',
      expense_date: `${curMonth}-09`,
      merchant: 'Local Coffee & Weekend Dinner',
      category: 'Dining & Coffee',
      amount: 148.25,
      payment_account_id: sapphireId,
      recurring_bill_id: null,
      is_essential: false,
      notes: 'Date night + espresso',
    },
    {
      owner_profile: 'joint',
      expense_date: `${prev1}-01`,
      merchant: 'Monthly Fixed Housing & Debt',
      category: 'Housing',
      amount: 3120.0,
      payment_account_id: checkingId,
      recurring_bill_id: null,
      is_essential: true,
      notes: 'Prior month fixed bills',
    },
    {
      owner_profile: 'spouse',
      expense_date: `${prev1}-14`,
      merchant: 'Groceries & Household',
      category: 'Groceries',
      amount: 840.0,
      payment_account_id: wifeCardId,
      recurring_bill_id: null,
      is_essential: true,
      notes: 'Prior month groceries',
    },
    {
      owner_profile: 'joint',
      expense_date: `${prev2}-01`,
      merchant: 'Monthly Fixed Housing & Debt',
      category: 'Housing',
      amount: 3120.0,
      payment_account_id: checkingId,
      recurring_bill_id: null,
      is_essential: true,
      notes: '2 months ago fixed bills',
    },
    {
      owner_profile: 'primary',
      expense_date: `${prev2}-16`,
      merchant: 'Weekend Flight & Hotel',
      category: 'Travel',
      amount: 960.0,
      payment_account_id: sapphireId,
      recurring_bill_id: null,
      is_essential: false,
      notes: 'Short getaway',
    },
  ];

  const normalizedExpenses = expensesPayload.map((exp) => ({
    owner_profile: exp.owner_profile ?? 'primary',
    expense_date: exp.expense_date,
    merchant: exp.merchant,
    category: exp.category,
    amount: exp.amount,
    payment_account_id: exp.payment_account_id ?? null,
    recurring_bill_id: exp.recurring_bill_id ?? null,
    is_essential: Boolean(exp.is_essential),
    notes: exp.notes ?? '',
  }));

  const { error: expErr } = await supabase.from('expenses').insert(normalizedExpenses);
  if (expErr) throw expErr;

  // 7. Insert Monthly Budget & Take-Home Target
  const { error: budErr } = await supabase.from('monthly_budgets').upsert(
    [
      { category: '_total_budget', monthly_limit: 5200.0 },
      { category: '_monthly_take_home', monthly_limit: 11200.0 },
    ],
    { onConflict: 'user_id,category' }
  );
  if (budErr) throw budErr;
}
