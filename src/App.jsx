import { useCallback, useEffect, useState } from 'react';
import {
  ShieldCheck,
  LayoutDashboard,
  Wallet,
  Receipt,
  Lock,
  Eye,
  EyeOff,
  LogOut,
  RefreshCw,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { seedDemoVaultData } from './lib/demoSeed';
import AuthVaultGate from './components/AuthVaultGate';
import OverviewTab from './components/OverviewTab';
import AccountsTab from './components/AccountsTab';
import ExpensesTab from './components/ExpensesTab';
import SecurityTab from './components/SecurityTab';

function AuthenticatedVault({
  session,
  aalLevel,
  hasMfaEnrolled,
  verifiedTotpFactors,
  refreshAuthStatus,
  onSignOut,
}) {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'accounts' | 'expenses' | 'security'
  const [accountCategoryFilter, setAccountCategoryFilter] = useState('all');
  const [privacyMode, setPrivacyMode] = useState(false);

  // Shared cross-tab modals
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [newAccountCategory, setNewAccountCategory] = useState(null);

  // Vault Data
  const [accounts, setAccounts] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [recurringBills, setRecurringBills] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [seedingDemo, setSeedingDemo] = useState(false);

  const loadAllData = useCallback(async () => {
    setLoadError('');
    try {
      const [accRes, snapRes, expRes, billRes, budRes] = await Promise.all([
        supabase.from('accounts').select('*').order('id', { ascending: true }),
        supabase
          .from('balance_snapshots')
          .select('*')
          .order('snapshot_date', { ascending: true }),
        supabase
          .from('expenses')
          .select('*')
          .order('expense_date', { ascending: false })
          .limit(2000),
        supabase.from('recurring_bills').select('*').order('due_day', { ascending: true }),
        supabase.from('monthly_budgets').select('*'),
      ]);

      if (accRes.error) throw accRes.error;
      if (snapRes.error) throw snapRes.error;
      if (expRes.error) throw expRes.error;
      if (billRes.error) throw billRes.error;
      if (budRes.error) throw budRes.error;

      setAccounts(accRes.data || []);
      setSnapshots(snapRes.data || []);
      setExpenses(expRes.data || []);
      setRecurringBills(billRes.data || []);
      setBudgets(budRes.data || []);
    } catch (err) {
      setLoadError(err?.message || 'Failed to load vault records under RLS.');
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const handleNavigateTab = (tab, categoryFilter) => {
    if (categoryFilter) setAccountCategoryFilter(categoryFilter);
    setActiveTab(tab);
  };

  const handleOpenBatchFromAnywhere = () => {
    setActiveTab('accounts');
    setBatchModalOpen(true);
  };

  const handleOpenNewAccountFromAnywhere = (cat = 'retirement_401k') => {
    setAccountCategoryFilter('all');
    setActiveTab('accounts');
    setNewAccountCategory(cat);
  };

  const handleSeedDemo = async () => {
    setSeedingDemo(true);
    try {
      await seedDemoVaultData(supabase);
      await loadAllData();
    } catch (err) {
      setLoadError(err?.message || 'Failed to load sample data.');
    } finally {
      setSeedingDemo(false);
    }
  };

  const navItems = [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard },
    { key: 'accounts', label: 'Accounts & Debt', icon: Wallet },
    { key: 'expenses', label: 'Monthly Expenses', icon: Receipt },
    { key: 'security', label: 'Security & 2FA', icon: Lock },
  ];

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      {/* Top Sticky Command Header */}
      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-[#09090b]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className="flex items-center gap-2.5 text-left"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold tracking-tight text-zinc-100">
                    VaultLedger
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase ${
                      aalLevel === 'aal2'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {aalLevel}
                  </span>
                </div>
                <div className="hidden text-[11px] text-zinc-500 sm:block">
                  Private Net Worth, Debt & Expense Terminal
                </div>
              </div>
            </button>

            <nav className="hidden items-center gap-1 md:flex">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setActiveTab(item.key)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      active
                        ? 'bg-zinc-800/90 text-zinc-100'
                        : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                    }`}
                  >
                    <Icon className={`h-3.5 w-3.5 ${active ? 'text-emerald-400' : ''}`} />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            {accounts.length > 0 && (
              <button
                type="button"
                onClick={handleOpenBatchFromAnywhere}
                className="hidden items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 sm:inline-flex"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Update Balances
              </button>
            )}

            <button
              type="button"
              onClick={() => setPrivacyMode(!privacyMode)}
              title={privacyMode ? 'Show dollar amounts' : 'Mask dollar amounts'}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                privacyMode
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                  : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {privacyMode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{privacyMode ? 'Masked' : 'Privacy'}</span>
            </button>

            <button
              type="button"
              onClick={onSignOut}
              title="Lock & Sign Out"
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-400 hover:border-rose-500/40 hover:text-rose-300"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Lock</span>
            </button>
          </div>
        </div>

        {/* Mobile Nav Strip */}
        <div className="flex items-center gap-1 overflow-x-auto border-t border-zinc-900 px-4 py-2 md:hidden">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveTab(item.key)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
                  active ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${active ? 'text-emerald-400' : ''}`} />
                {item.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content Container */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {loadError && (
          <div className="mb-5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
            {loadError}
          </div>
        )}

        {loadingData ? (
          <div className="flex items-center justify-center py-24 text-xs text-zinc-500">
            <div className="mr-2.5 h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
            Decrypting & loading financial records…
          </div>
        ) : (
          <>
            {activeTab === 'overview' && (
              <OverviewTab
                accounts={accounts}
                snapshots={snapshots}
                expenses={expenses}
                recurringBills={recurringBills}
                budgets={budgets}
                privacyMode={privacyMode}
                hasMfaEnrolled={hasMfaEnrolled}
                onNavigateTab={handleNavigateTab}
                onOpenBatchUpdate={handleOpenBatchFromAnywhere}
                onOpenNewAccount={handleOpenNewAccountFromAnywhere}
                onSeedDemo={handleSeedDemo}
                seedingDemo={seedingDemo}
              />
            )}

            {activeTab === 'accounts' && (
              <AccountsTab
                supabase={supabase}
                accounts={accounts}
                snapshots={snapshots}
                initialCategoryFilter={accountCategoryFilter}
                privacyMode={privacyMode}
                onDataChanged={loadAllData}
                batchModalOpen={batchModalOpen}
                setBatchModalOpen={setBatchModalOpen}
                newAccountCategory={newAccountCategory}
                setNewAccountCategory={setNewAccountCategory}
              />
            )}

            {activeTab === 'expenses' && (
              <ExpensesTab
                supabase={supabase}
                accounts={accounts}
                expenses={expenses}
                recurringBills={recurringBills}
                budgets={budgets}
                privacyMode={privacyMode}
                onDataChanged={loadAllData}
              />
            )}

            {activeTab === 'security' && (
              <SecurityTab
                supabase={supabase}
                session={session}
                aalLevel={aalLevel}
                hasMfaEnrolled={hasMfaEnrolled}
                verifiedTotpFactors={verifiedTotpFactors}
                refreshAuthStatus={refreshAuthStatus}
                accounts={accounts}
                snapshots={snapshots}
                expenses={expenses}
                recurringBills={recurringBills}
                budgets={budgets}
                onDataChanged={loadAllData}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthVaultGate>
      {(authProps) => <AuthenticatedVault {...authProps} />}
    </AuthVaultGate>
  );
}
