import { useCallback, useEffect, useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Mail,
  KeyRound,
  Smartphone,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  LogOut,
  Database,
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export default function AuthVaultGate({ children }) {
  const [phase, setPhase] = useState('loading');
  // phases: 'loading' | 'unconfigured' | 'claim_owner' | 'login' | 'mfa_challenge' | 'password_recovery' | 'ready'

  const [session, setSession] = useState(null);
  const [vaultStatus, setVaultStatus] = useState({ is_claimed: true, is_owner: false });
  const [aalInfo, setAalInfo] = useState({ currentLevel: 'aal1', nextLevel: 'aal1' });
  const [verifiedTotpFactors, setVerifiedTotpFactors] = useState([]);

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetMode, setResetMode] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const evaluateVaultState = useCallback(async (overrideSession) => {
    if (!isSupabaseConfigured || !supabase) {
      setPhase('unconfigured');
      return;
    }

    try {
      const { data: statusData, error: rpcErr } = await supabase.rpc('get_vault_status');
      const vStatus = !rpcErr && statusData ? statusData : { is_claimed: true, is_owner: false };
      setVaultStatus(vStatus);

      const activeSession =
        overrideSession !== undefined
          ? overrideSession
          : (await supabase.auth.getSession()).data?.session || null;

      setSession(activeSession);

      if (!activeSession || activeSession.user?.is_anonymous) {
        if (activeSession?.user?.is_anonymous) {
          await supabase.auth.signOut();
        }
        setPhase(vStatus.is_claimed ? 'login' : 'claim_owner');
        return;
      }

      // Verify ownership via get_vault_status
      const { data: authedStatus } = await supabase.rpc('get_vault_status');
      if (authedStatus && !authedStatus.is_owner) {
        await supabase.auth.signOut();
        setError('Access denied: this private finance vault is permanently locked to its single owner.');
        setPhase('login');
        return;
      }

      // Check MFA Authenticator Assurance Level
      const [{ data: aal }, { data: factors }] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ]);

      const totpVerified = (factors?.totp || []).filter((f) => f.status === 'verified');
      setVerifiedTotpFactors(totpVerified);
      setAalInfo({
        currentLevel: aal?.currentLevel || 'aal1',
        nextLevel: aal?.nextLevel || 'aal1',
      });

      if (aal?.nextLevel === 'aal2' && aal?.currentLevel !== 'aal2') {
        setPhase('mfa_challenge');
        return;
      }

      setPhase('ready');
    } catch (err) {
      setError(err?.message || 'Unable to verify vault security state.');
      setPhase('login');
    }
  }, []);

  useEffect(() => {
    evaluateVaultState();

    if (!supabase) return undefined;
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSession(newSession);
        setPhase('password_recovery');
        return;
      }
      if (event === 'SIGNED_OUT') {
        setSession(null);
        evaluateVaultState(null);
        return;
      }
      if (event === 'SIGNED_IN' || event === 'MFA_CHALLENGE_VERIFIED' || event === 'TOKEN_REFRESHED') {
        evaluateVaultState(newSession);
      }
    });

    return () => listener?.subscription?.unsubscribe();
  }, [evaluateVaultState]);

  const handleClaimOwner = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');

    const cleanEmail = email.trim().toLowerCase();
    if (password.length < 10) {
      setError('Use a strong password of at least 10 characters for your finance vault.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const redirectUrl = `${window.location.origin}${window.location.pathname}`;
      const { data, error: signUpErr } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: { emailRedirectTo: redirectUrl },
      });

      if (signUpErr) throw signUpErr;

      if (data?.session) {
        await evaluateVaultState(data.session);
      } else {
        setVaultStatus({ is_claimed: true, is_owner: false });
        setNotice(
          'Owner account created and vault registration is now permanently sealed! Confirm the link sent to your email, then sign in below.'
        );
        setPassword('');
        setConfirmPassword('');
        setPhase('login');
      }
    } catch (err) {
      setError(err?.message || 'Could not initialize owner account.');
    } finally {
      setBusy(false);
    }
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);

    try {
      const cleanEmail = email.trim().toLowerCase();
      if (resetMode) {
        const redirectUrl = `${window.location.origin}${window.location.pathname}`;
        const { error: resetErr } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: redirectUrl,
        });
        if (resetErr) throw resetErr;
        setNotice('Password recovery link sent to your owner email.');
        setResetMode(false);
      } else {
        const { data, error: loginErr } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (loginErr) throw loginErr;
        await evaluateVaultState(data.session);
      }
    } catch (err) {
      setError(err?.message || 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyMfa = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const factor = verifiedTotpFactors[0];
      if (!factor) throw new Error('No verified TOTP factor found on this account.');

      const { data: challengeData, error: chErr } = await supabase.auth.mfa.challenge({
        factorId: factor.id,
      });
      if (chErr) throw chErr;

      const { error: verErr } = await supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId: challengeData.id,
        code: totpCode.trim(),
      });
      if (verErr) throw verErr;

      setTotpCode('');
      await evaluateVaultState();
    } catch (err) {
      setError(err?.message || 'Invalid 6-digit authenticator code.');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateRecoveredPassword = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 10) {
      setError('Password must be at least 10 characters.');
      return;
    }
    setBusy(true);
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password: newPassword });
      if (updErr) throw updErr;
      setNewPassword('');
      await evaluateVaultState();
    } catch (err) {
      setError(err?.message || 'Failed to update password.');
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut();
    setSession(null);
    setTotpCode('');
    setPassword('');
    setPhase('login');
  };

  if (phase === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090b] text-zinc-400">
        <div className="flex items-center gap-2.5 text-sm">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
          <span>Verifying encrypted vault session…</span>
        </div>
      </div>
    );
  }

  if (phase === 'unconfigured') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090b] p-4">
        <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
          <div className="mb-3 flex items-center gap-2 text-amber-400">
            <Database className="h-5 w-5" />
            <h1 className="text-base font-semibold text-zinc-100">Supabase Configuration Needed</h1>
          </div>
          <p className="mb-4 text-xs leading-relaxed text-zinc-400">
            Set <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-zinc-200">VITE_SUPABASE_URL</code> and{' '}
            <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-zinc-200">VITE_SUPABASE_PUBLISHABLE_KEY</code> in{' '}
            <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-zinc-200">.env</code> (or GitHub Actions Repository
            Variables) and rebuild.
          </p>
        </div>
      </div>
    );
  }

  if (phase === 'ready' && session) {
    return children({
      session,
      aalLevel: aalInfo.currentLevel,
      hasMfaEnrolled: verifiedTotpFactors.length > 0,
      verifiedTotpFactors,
      refreshAuthStatus: () => evaluateVaultState(),
      onSignOut: handleSignOut,
    });
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#09090b] px-4 py-12">
      {/* Subtle radial glow */}
      <div className="pointer-events-none absolute top-1/4 h-96 w-96 -translate-y-1/2 rounded-full bg-emerald-500/5 blur-3xl" />

      <div className="relative w-full max-w-md rounded-2xl border border-zinc-800/90 bg-zinc-950/95 p-7 shadow-2xl">
        {/* Brand Header */}
        <div className="mb-6 flex items-center justify-between border-b border-zinc-800/80 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight text-zinc-100">VaultLedger</div>
              <div className="text-[11px] text-zinc-500">Single-Owner Personal Finance</div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-0.5 text-[10px] font-medium text-zinc-400">
            <Lock className="h-2.5 w-2.5 text-emerald-400" />
            RLS Forced
          </span>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {notice && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <span>{notice}</span>
          </div>
        )}

        {/* 1. First-Time Owner Initialization */}
        {phase === 'claim_owner' && (
          <form onSubmit={handleClaimOwner} className="space-y-4">
            <div>
              <h1 className="text-base font-semibold text-zinc-100">Initialize Owner Vault</h1>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                Create your master owner login. A Postgres trigger permanently seals registration to this single
                account immediately upon creation.
              </p>
            </div>

            <label className="block text-xs font-medium text-zinc-300">
              Owner Email
              <div className="relative mt-1.5">
                <Mail className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@domain.com"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/70 py-2 pl-9 pr-3 text-sm text-zinc-100 placeholder-zinc-600 focus:border-emerald-500/60 focus:outline-none"
                />
              </div>
            </label>

            <label className="block text-xs font-medium text-zinc-300">
              Master Password (min. 10 characters)
              <div className="relative mt-1.5">
                <KeyRound className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                <input
                  type="password"
                  required
                  minLength={10}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/70 py-2 pl-9 pr-3 text-sm text-zinc-100 placeholder-zinc-600 focus:border-emerald-500/60 focus:outline-none"
                />
              </div>
            </label>

            <label className="block text-xs font-medium text-zinc-300">
              Confirm Password
              <div className="relative mt-1.5">
                <KeyRound className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                <input
                  type="password"
                  required
                  minLength={10}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/70 py-2 pl-9 pr-3 text-sm text-zinc-100 placeholder-zinc-600 focus:border-emerald-500/60 focus:outline-none"
                />
              </div>
            </label>

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-50"
            >
              {busy ? 'Sealing Owner Vault…' : 'Claim & Lock Personal Vault'}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </form>
        )}

        {/* 2. Locked Owner Sign-In */}
        {phase === 'login' && (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <h1 className="text-base font-semibold text-zinc-100">
                {resetMode ? 'Recover Owner Password' : 'Owner Sign-In'}
              </h1>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                {resetMode
                  ? 'Enter your registered owner email to receive a password reset link.'
                  : 'Public sign-ups and bank links are disabled. Authenticate with your owner credentials.'}
              </p>
            </div>

            <label className="block text-xs font-medium text-zinc-300">
              Email
              <div className="relative mt-1.5">
                <Mail className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="owner@domain.com"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/70 py-2 pl-9 pr-3 text-sm text-zinc-100 placeholder-zinc-600 focus:border-emerald-500/60 focus:outline-none"
                />
              </div>
            </label>

            {!resetMode && (
              <label className="block text-xs font-medium text-zinc-300">
                Password
                <div className="relative mt-1.5">
                  <KeyRound className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900/70 py-2 pl-9 pr-3 text-sm text-zinc-100 placeholder-zinc-600 focus:border-emerald-500/60 focus:outline-none"
                  />
                </div>
              </label>
            )}

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-50"
            >
              {busy ? 'Authenticating…' : resetMode ? 'Send Recovery Link' : 'Unlock Vault'}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>

            <div className="flex items-center justify-between pt-1 text-[11px] text-zinc-500">
              <button
                type="button"
                onClick={() => {
                  setResetMode(!resetMode);
                  setError('');
                  setNotice('');
                }}
                className="hover:text-zinc-300"
              >
                {resetMode ? '← Back to password sign-in' : 'Forgot password?'}
              </button>
              {!vaultStatus.is_claimed && (
                <button
                  type="button"
                  onClick={() => setPhase('claim_owner')}
                  className="text-emerald-400 hover:text-emerald-300"
                >
                  Initialize owner →
                </button>
              )}
            </div>
          </form>
        )}

        {/* 3. TOTP 2FA Verification Step (aal2) */}
        {phase === 'mfa_challenge' && (
          <form onSubmit={handleVerifyMfa} className="space-y-4">
            <div>
              <div className="mb-1 inline-flex items-center gap-1.5 rounded bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                <Smartphone className="h-3.5 w-3.5" />
                AAL2 Hardware / App 2FA Required
              </div>
              <h1 className="text-base font-semibold text-zinc-100">Two-Factor Verification</h1>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                Enter the 6-digit code from your authenticator app. Postgres RLS blocks all database rows until AAL2 is
                verified.
              </p>
            </div>

            <label className="block text-xs font-medium text-zinc-300">
              6-Digit Authenticator Code
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                autoFocus
                required
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2.5 text-center font-mono text-lg tracking-[0.35em] text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
              />
            </label>

            <button
              type="submit"
              disabled={busy || totpCode.length !== 6}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-50"
            >
              {busy ? 'Verifying TOTP…' : 'Verify & Unlock Vault'}
            </button>

            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center justify-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </form>
        )}

        {/* 4. Password Recovery Update */}
        {phase === 'password_recovery' && (
          <form onSubmit={handleUpdateRecoveredPassword} className="space-y-4">
            <div>
              <h1 className="text-base font-semibold text-zinc-100">Set New Vault Password</h1>
              <p className="mt-1 text-xs text-zinc-400">Choose a strong new password (at least 10 characters).</p>
            </div>
            <input
              type="password"
              required
              minLength={10}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New master password"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              {busy ? 'Updating…' : 'Save New Password'}
            </button>
          </form>
        )}

        <div className="mt-6 border-t border-zinc-900 pt-3 text-center text-[11px] text-zinc-600">
          Zero bank connections • End-to-end Supabase RLS • Hosted statically
        </div>
      </div>
    </div>
  );
}
