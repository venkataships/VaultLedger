import { useState } from 'react';
import {
  ShieldCheck,
  Smartphone,
  Lock,
  KeyRound,
  Download,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
} from 'lucide-react';
import { todayIsoDate } from '../lib/finance';

export default function SecurityTab({
  supabase,
  session,
  aalLevel,
  hasMfaEnrolled,
  verifiedTotpFactors,
  refreshAuthStatus,
  accounts,
  snapshots,
  expenses,
  recurringBills,
  budgets,
  equityHoldings,
  creditCardPromos,
  householdNames,
  onDataChanged,
}) {
  // TOTP Enrollment state
  const [enrolling, setEnrolling] = useState(false);
  const [pendingFactor, setPendingFactor] = useState(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [mfaError, setMfaError] = useState('');
  const [mfaNotice, setMfaNotice] = useState('');
  const [mfaBusy, setMfaBusy] = useState(false);

  // Password Change state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwStatus, setPwStatus] = useState({ error: '', success: '' });

  const startTotpEnrollment = async () => {
    setMfaError('');
    setMfaNotice('');
    setEnrolling(true);
    setMfaBusy(true);
    try {
      // Clean up any stale unverified factor first so friendly_name never collides
      const { data: existing } = await supabase.auth.mfa.listFactors();
      const unverified = (existing?.all || []).filter((f) => f.status === 'unverified');
      for (const uf of unverified) {
        await supabase.auth.mfa.unenroll({ factorId: uf.id });
      }

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `asfinance Authenticator (${todayIsoDate()})`,
      });
      if (error) throw error;
      setPendingFactor(data);
    } catch (err) {
      setMfaError(err?.message || 'Could not start TOTP enrollment.');
      setEnrolling(false);
    } finally {
      setMfaBusy(false);
    }
  };

  const confirmTotpEnrollment = async (e) => {
    e.preventDefault();
    if (!pendingFactor) return;
    setMfaError('');
    setMfaBusy(true);

    try {
      const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({
        factorId: pendingFactor.id,
      });
      if (chErr) throw chErr;

      const { error: verErr } = await supabase.auth.mfa.verify({
        factorId: pendingFactor.id,
        challengeId: challenge.id,
        code: verifyCode.trim(),
      });
      if (verErr) throw verErr;

      setPendingFactor(null);
      setEnrolling(false);
      setVerifyCode('');
      setMfaNotice(
        'TOTP 2FA enabled! Postgres RLS now strictly requires AAL2 Authenticator verification before serving any rows.'
      );
      await refreshAuthStatus();
    } catch (err) {
      setMfaError(err?.message || 'Invalid 6-digit verification code.');
    } finally {
      setMfaBusy(false);
    }
  };

  const handleUnenrollFactor = async (factorId) => {
    if (
      !window.confirm(
        'Remove this TOTP 2FA Authenticator factor? Your vault will revert to password-only (AAL1) until another factor is enrolled.'
      )
    ) {
      return;
    }
    setMfaError('');
    setMfaBusy(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      await supabase.auth.refreshSession();
      setMfaNotice('Authenticator factor removed.');
      await refreshAuthStatus();
    } catch (err) {
      setMfaError(err?.message || 'Failed to unenroll factor (ensure your session is AAL2).');
    } finally {
      setMfaBusy(false);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setPwStatus({ error: '', success: '' });
    if (newPassword.length < 10) {
      setPwStatus({ error: 'Password must be at least 10 characters.', success: '' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwStatus({ error: 'Passwords do not match.', success: '' });
      return;
    }
    setPwBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setConfirmPassword('');
      setPwStatus({ error: '', success: 'Master password updated.' });
    } catch (err) {
      setPwStatus({ error: err?.message || 'Could not update password.', success: '' });
    } finally {
      setPwBusy(false);
    }
  };

  const handleExportVaultJson = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      owner_email: session?.user?.email,
      household_settings: householdNames,
      accounts,
      equity_holdings: equityHoldings,
      credit_card_promos: creditCardPromos,
      balance_snapshots: snapshots,
      recurring_bills: recurringBills,
      expenses,
      monthly_budgets: budgets,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `asfinance-backup-${todayIsoDate()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearVaultData = async () => {
    if (
      !window.confirm(
        'Clear ALL accounts, stock/RSU holdings, balance transfers, snapshots, bills, expenses, and budgets from your vault? Your owner login & 2FA remain intact.'
      )
    ) {
      return;
    }
    await supabase.from('expenses').delete().neq('id', 0);
    await supabase.from('recurring_bills').delete().neq('id', 0);
    await supabase.from('credit_card_promos').delete().neq('id', 0);
    await supabase.from('equity_holdings').delete().neq('id', 0);
    await supabase.from('balance_snapshots').delete().neq('id', 0);
    await supabase.from('accounts').delete().neq('id', 0);
    await supabase.from('monthly_budgets').delete().neq('id', 0);
    await onDataChanged();
  };

  return (
    <div className="space-y-6">
      {/* Live Security Posture Matrix */}
      <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/80 p-6">
        <div className="mb-4 flex items-center gap-2.5">
          <ShieldCheck className="h-5 w-5 text-emerald-400" />
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Database & Auth Security Posture</h2>
            <p className="text-xs text-zinc-500">
              Safe for public GitHub Pages hosting — every access control is enforced inside Postgres, never just in UI code.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3.5">
            <div className="text-zinc-400">Single-Owner Lock</div>
            <div className="mt-1 font-semibold text-emerald-400">Active (Postgres Trigger)</div>
            <div className="mt-1 truncate font-mono text-[11px] text-zinc-500">
              {session?.user?.email}
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3.5">
            <div className="text-zinc-400">Row Level Security</div>
            <div className="mt-1 font-semibold text-emerald-400">Enabled + Forced</div>
            <div className="mt-1 text-[11px] text-zinc-500">Anon & 2nd-user access = 0 rows</div>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3.5">
            <div className="text-zinc-400">Session Assurance (JWT)</div>
            <div
              className={`mt-1 font-mono font-semibold uppercase ${
                aalLevel === 'aal2' ? 'text-emerald-400' : 'text-amber-300'
              }`}
            >
              {aalLevel} {aalLevel === 'aal2' ? '(Password + TOTP)' : '(Password Only)'}
            </div>
            <div className="mt-1 text-[11px] text-zinc-500">
              {hasMfaEnrolled ? 'RLS enforces AAL2' : 'Enroll TOTP below for AAL2'}
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3.5">
            <div className="text-zinc-400">External Bank Links</div>
            <div className="mt-1 font-semibold text-emerald-400">Zero (Air-Gapped)</div>
            <div className="mt-1 text-[11px] text-zinc-500">No Plaid / Finicity credentials</div>
          </div>
        </div>
      </div>

      {/* TOTP Multi-Factor Authentication Section */}
      <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/80 p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Smartphone className="h-5 w-5 text-emerald-400" />
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">
                Authenticator App 2FA (TOTP — AAL2)
              </h3>
              <p className="text-xs text-zinc-500">
                Works with 1Password, Apple Passwords, Google Authenticator, or Authy. Once verified, Postgres RLS blocks password-only tokens.
              </p>
            </div>
          </div>

          {!enrolling && (
            <button
              type="button"
              disabled={mfaBusy}
              onClick={startTotpEnrollment}
              className="rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              {hasMfaEnrolled ? '+ Add Backup Authenticator' : 'Enable TOTP 2FA'}
            </button>
          )}
        </div>

        {mfaError && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{mfaError}</span>
          </div>
        )}

        {mfaNotice && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{mfaNotice}</span>
          </div>
        )}

        {/* Active Enrolled Factors */}
        {verifiedTotpFactors.length > 0 && (
          <div className="mb-4 divide-y divide-zinc-900 rounded-xl border border-zinc-800 px-4">
            {verifiedTotpFactors.map((f) => (
              <div key={f.id} className="flex items-center justify-between py-3 text-xs">
                <div>
                  <div className="font-medium text-zinc-200">
                    {f.friendly_name || 'Authenticator App'}
                  </div>
                  <div className="font-mono text-[11px] text-zinc-500">
                    Factor ID: {f.id.slice(0, 8)}… • Status: <span className="text-emerald-400">{f.status}</span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={mfaBusy}
                  onClick={() => handleUnenrollFactor(f.id)}
                  className="rounded border border-zinc-800 px-2.5 py-1 text-zinc-400 hover:border-rose-500/40 hover:text-rose-300"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {/* QR Enrollment Wizard */}
        {enrolling && pendingFactor && (
          <div className="rounded-xl border border-emerald-500/30 bg-zinc-900/50 p-5">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="flex flex-col items-center justify-center rounded-xl border border-zinc-800 bg-white p-4">
                <img
                  src={pendingFactor.totp.qr_code}
                  alt="Scan TOTP QR Code"
                  className="h-44 w-44"
                />
              </div>

              <form onSubmit={confirmTotpEnrollment} className="space-y-4 text-xs">
                <div>
                  <div className="font-semibold text-zinc-100">
                    1. Scan QR Code in your Authenticator App
                  </div>
                  <p className="mt-1 text-zinc-400">
                    Or enter this setup secret manually:
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="flex-1 overflow-x-auto rounded border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 font-mono text-[11px] text-emerald-300">
                      {pendingFactor.totp.secret}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(pendingFactor.totp.secret);
                        setCopiedSecret(true);
                        setTimeout(() => setCopiedSecret(false), 2000);
                      }}
                      className="rounded border border-zinc-700 bg-zinc-900 p-1.5 text-zinc-300 hover:text-white"
                    >
                      {copiedSecret ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                <label className="block text-zinc-200">
                  2. Enter 6-Digit Code to Activate
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    required
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-center font-mono text-base tracking-[0.35em] text-zinc-100 focus:border-emerald-500 focus:outline-none"
                  />
                </label>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await supabase.auth.mfa.unenroll({ factorId: pendingFactor.id });
                      setPendingFactor(null);
                      setEnrolling(false);
                    }}
                    className="rounded-lg border border-zinc-800 px-3 py-2 text-zinc-400 hover:text-zinc-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={mfaBusy || verifyCode.length !== 6}
                    className="flex-1 rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
                  >
                    {mfaBusy ? 'Verifying…' : 'Verify & Enforce AAL2'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Password Rotation & Data Backup */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/80 p-6">
          <div className="mb-4 flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-zinc-100">Rotate Master Password</h3>
          </div>

          <form onSubmit={handleUpdatePassword} className="space-y-3 text-xs">
            {pwStatus.error && (
              <div className="rounded border border-rose-500/30 bg-rose-500/10 p-2.5 text-rose-200">
                {pwStatus.error}
              </div>
            )}
            {pwStatus.success && (
              <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-emerald-200">
                {pwStatus.success}
              </div>
            )}

            <label className="block text-zinc-300">
              New Password (min. 10 characters)
              <input
                type="password"
                minLength={10}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100"
              />
            </label>
            <label className="block text-zinc-300">
              Confirm New Password
              <input
                type="password"
                minLength={10}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100"
              />
            </label>
            <button
              type="submit"
              disabled={pwBusy}
              className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 font-medium text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
            >
              {pwBusy ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-zinc-800/90 bg-zinc-950/80 p-6">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Lock className="h-4 w-4 text-sky-400" />
              <h3 className="text-sm font-semibold text-zinc-100">Data Sovereignty & Portable Backup</h3>
            </div>
            <p className="text-xs leading-relaxed text-zinc-400">
              Export a complete JSON snapshot of all your accounts, historical balance snapshots, recurring bills, and
              expenses anytime for offline cold storage.
            </p>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 text-xs">
            <button
              type="button"
              onClick={handleExportVaultJson}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 py-2 font-medium text-zinc-100 hover:bg-zinc-800"
            >
              <Download className="h-3.5 w-3.5 text-sky-400" />
              Export Full JSON Backup
            </button>

            <button
              type="button"
              onClick={handleClearVaultData}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 font-medium text-rose-300 hover:bg-rose-500/20"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear All Ledger Data
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
