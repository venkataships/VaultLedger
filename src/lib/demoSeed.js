import { shiftMonthKey, todayIsoDate } from './finance';

export async function seedDemoVaultData(supabase) {
  const today = todayIsoDate();
  const curMonth = today.slice(0, 7);

  // 1. Insert sample accounts across 401(k), Banks, Investments, Credit Cards, and Active Loans
  const accountsPayload = [
    {
      name: 'Fidelity 401(k)',
      institution: 'Fidelity',
      category: 'retirement_401k',
      subtype: 'Traditional 401(k)',
      is_liability: false,
      current_balance: 148500.0,
      interest_rate: 8.5,
      notes: '12% employee contribution + 5% employer match (100% vested)',
      metadata: { contribution_pct: 12, employer_match_pct: 5 },
    },
    {
      name: 'Vanguard Roth IRA',
      institution: 'Vanguard',
      category: 'retirement_401k',
      subtype: 'Roth IRA',
      is_liability: false,
      current_balance: 42300.0,
      interest_rate: 8.5,
      notes: 'Maxed annual contribution — VTI / VXUS',
      metadata: { contribution_pct: 0, employer_match_pct: 0 },
    },
    {
      name: 'Ally Emergency HYSA',
      institution: 'Ally Bank',
      category: 'bank',
      subtype: 'High-Yield Savings (HYSA)',
      is_liability: false,
      current_balance: 32000.0,
      interest_rate: 4.25,
      notes: '6-month liquid emergency reserve',
    },
    {
      name: 'Chase Primary Checking',
      institution: 'Chase',
      category: 'bank',
      subtype: 'Checking',
      is_liability: false,
      current_balance: 8450.0,
      interest_rate: 0.01,
      notes: 'Direct deposit & monthly bill pay hub',
    },
    {
      name: 'Schwab Taxable Brokerage',
      institution: 'Charles Schwab',
      category: 'investment',
      subtype: 'Taxable Brokerage',
      is_liability: false,
      current_balance: 29400.0,
      interest_rate: 7.5,
      notes: 'Index ETFs & T-Bills',
    },
    {
      name: 'Chase Sapphire Preferred',
      institution: 'Chase',
      category: 'credit_card',
      subtype: 'Travel Card',
      is_liability: true,
      current_balance: 1640.0,
      credit_limit: 18000.0,
      interest_rate: 21.49,
      minimum_payment: 45.0,
      due_day: 18,
      notes: 'Paid in full monthly via autopay',
    },
    {
      name: 'Amex Gold Card',
      institution: 'American Express',
      category: 'credit_card',
      subtype: 'Rewards Card',
      is_liability: true,
      current_balance: 890.0,
      credit_limit: 15000.0,
      interest_rate: 22.99,
      minimum_payment: 35.0,
      due_day: 24,
      notes: '4x Groceries & Dining card',
    },
    {
      name: 'Auto Loan — RAV4 Hybrid',
      institution: 'Toyota Financial',
      category: 'loan',
      subtype: 'Auto Loan',
      is_liability: true,
      current_balance: 14200.0,
      original_principal: 28500.0,
      interest_rate: 4.49,
      minimum_payment: 520.0,
      due_day: 12,
      notes: '60-month term, ahead of schedule',
    },
    {
      name: 'Federal Student Loan',
      institution: 'Nelnet',
      category: 'loan',
      subtype: 'Student Loan',
      is_liability: true,
      current_balance: 9800.0,
      original_principal: 24000.0,
      interest_rate: 3.85,
      minimum_payment: 265.0,
      due_day: 5,
      notes: 'Direct Subsidized fixed rate',
    },
  ];

  const normalizedAccounts = accountsPayload.map((acc) => ({
    name: acc.name,
    institution: acc.institution ?? '',
    category: acc.category,
    subtype: acc.subtype ?? '',
    is_liability: Boolean(acc.is_liability),
    current_balance: acc.current_balance ?? 0,
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

  // 2. Insert 6 months of historical balance snapshots so Net Worth chart looks rich immediately
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

  // 3. Insert Recurring Monthly Bills
  const checkingId = byName['Chase Primary Checking']?.id || null;
  const sapphireId = byName['Chase Sapphire Preferred']?.id || null;

  const billsPayload = [
    {
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
      name: 'Student Loan Payment',
      category: 'Debt & Loan Payments',
      amount: 265.0,
      due_day: 5,
      cadence: 'monthly',
      payment_account_id: checkingId,
      is_essential: true,
      autopay: true,
    },
    {
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
      name: 'Auto & Renter Insurance',
      category: 'Insurance',
      amount: 142.0,
      due_day: 20,
      cadence: 'monthly',
      payment_account_id: sapphireId,
      is_essential: true,
      autopay: true,
    },
    {
      name: 'Cloud, Music & Streaming',
      category: 'Subscriptions & Software',
      amount: 48.0,
      due_day: 22,
      cadence: 'monthly',
      payment_account_id: sapphireId,
      is_essential: false,
      autopay: true,
    },
  ];

  const { data: insertedBills, error: billErr } = await supabase
    .from('recurring_bills')
    .insert(billsPayload)
    .select('*');
  if (billErr) throw billErr;

  // 4. Insert sample monthly expenses across current month + last 2 months
  const prev1 = shiftMonthKey(curMonth, -1);
  const prev2 = shiftMonthKey(curMonth, -2);
  const amexId = byName['Amex Gold Card']?.id || null;

  const expensesPayload = [
    ...insertedBills.map((b) => ({
      expense_date: `${curMonth}-${String(Math.min(b.due_day || 1, 28)).padStart(2, '0')}`,
      merchant: b.name,
      category: b.category,
      amount: b.amount,
      payment_account_id: b.payment_account_id,
      recurring_bill_id: b.id,
      is_essential: b.is_essential,
      notes: 'Recurring monthly bill',
    })),
    {
      expense_date: `${curMonth}-04`,
      merchant: 'Trader Joe’s & Whole Foods',
      category: 'Groceries',
      amount: 385.4,
      payment_account_id: amexId,
      is_essential: true,
      notes: 'Weekly groceries',
    },
    {
      expense_date: `${curMonth}-09`,
      merchant: 'Local Coffee & Weekend Dinner',
      category: 'Dining & Coffee',
      amount: 148.25,
      payment_account_id: amexId,
      is_essential: false,
      notes: 'Date night + espresso',
    },
    {
      expense_date: `${curMonth}-11`,
      merchant: 'Shell Station & Transit',
      category: 'Transportation & Gas',
      amount: 84.0,
      payment_account_id: sapphireId,
      is_essential: true,
      notes: 'Fuel fill-up',
    },
    {
      expense_date: `${prev1}-01`,
      merchant: 'Monthly Fixed Housing & Debt',
      category: 'Housing',
      amount: 3240.0,
      payment_account_id: checkingId,
      is_essential: true,
      notes: 'Prior month fixed bills',
    },
    {
      expense_date: `${prev1}-14`,
      merchant: 'Groceries, Dining & Household',
      category: 'Groceries',
      amount: 910.0,
      payment_account_id: amexId,
      is_essential: true,
      notes: 'Prior month variable spend',
    },
    {
      expense_date: `${prev2}-01`,
      merchant: 'Monthly Fixed Housing & Debt',
      category: 'Housing',
      amount: 3240.0,
      payment_account_id: checkingId,
      is_essential: true,
      notes: '2 months ago fixed bills',
    },
    {
      expense_date: `${prev2}-16`,
      merchant: 'Groceries, Travel & Dining',
      category: 'Travel',
      amount: 1120.0,
      payment_account_id: sapphireId,
      is_essential: false,
      notes: 'Weekend trip + groceries',
    },
  ];

  const normalizedExpenses = expensesPayload.map((exp) => ({
    ...exp,
    payment_account_id: exp.payment_account_id ?? null,
    recurring_bill_id: exp.recurring_bill_id ?? null,
    notes: exp.notes ?? '',
  }));

  const { error: expErr } = await supabase.from('expenses').insert(normalizedExpenses);
  if (expErr) throw expErr;

  // 5. Insert Monthly Budget & Take-Home Target
  const { error: budErr } = await supabase.from('monthly_budgets').upsert(
    [
      { category: '_total_budget', monthly_limit: 4600.0 },
      { category: '_monthly_take_home', monthly_limit: 7800.0 },
    ],
    { onConflict: 'user_id,category' }
  );
  if (budErr) throw budErr;
}
