import { useEffect, useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Fingerprint,
  KeyRound,
  LogOut,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import { verifyOwnerPassword } from '../lib/supabase';
import {
  getSavedBiometricCredential,
  isPlatformBiometricSupported,
  verifyDeviceBiometric,
} from '../lib/screenLock';

export default function VaultLockScreen({
  user,
  lockReason,
  onUnlock,
  onFullSignOut,
}) {
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [hasBiometricEnrolled, setHasBiometricEnrolled] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      const supported = await isPlatformBiometricSupported();
      const saved = getSavedBiometricCredential(user?.id);
      if (mounted) {
        setBiometricAvailable(supported);
        setHasBiometricEnrolled(Boolean(supported && saved));
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const handleTouchIdUnlock = async () => {
    setError('');
    setBiometricBusy(true);
    try {
      await verifyDeviceBiometric(user?.id);
      onUnlock();
    } catch (err) {
      if (err?.name === 'NotAllowedError') {
        setError('Touch ID prompt was cancelled or timed out. Try again or use your master password.');
      } else {
        setError(err?.message || 'Touch ID verification failed. Use your master password to unlock.');
      }
    } finally {
      setBiometricBusy(false);
    }
  };

  const handlePasswordUnlock = async (e) => {
    e.preventDefault();
    if (!password) return;
    setError('');
    setBusy(true);
    try {
      await verifyOwnerPassword(user?.email || '', password);
      setPassword('');
      onUnlock();
    } catch (err) {
      setError(err?.message || 'Incorrect master password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#09090b] px-4 py-12 text-zinc-100">
      <div className="pointer-events-none absolute top-1/4 h-96 w-96 -translate-y-1/2 rounded-full bg-emerald-500/5 blur-3xl" />

      <div className="relative w-full max-w-md rounded-2xl border border-zinc-800/90 bg-zinc-950/95 p-7 shadow-2xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between border-b border-zinc-800/80 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight text-zinc-100">asfinance</div>
              <div className="text-[11px] text-zinc-500">Vault Screen Locked</div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-medium text-amber-300">
            <Lock className="h-2.5 w-2.5" />
            Hidden
          </span>
        </div>

        <div className="mb-5">
          <h1 className="text-base font-semibold text-zinc-100">Session Locked</h1>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">
            {lockReason || 'Locked automatically for privacy.'} All financial data has been cleared from view for{' '}
            <span className="font-mono text-zinc-300">{user?.email}</span>.
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Primary MacBook Touch ID / Biometric Button */}
        {hasBiometricEnrolled && (
          <div className="mb-5">
            <button
              type="button"
              disabled={biometricBusy || busy}
              onClick={handleTouchIdUnlock}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-emerald-500 px-4 py-3 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-50"
            >
              <Fingerprint className="h-4 w-4" />
              {biometricBusy ? 'Waiting for Touch ID…' : 'Unlock with Touch ID / Fingerprint'}
            </button>
            <div className="my-4 flex items-center gap-3 text-[11px] text-zinc-600">
              <div className="h-px flex-1 bg-zinc-800/80" />
              <span>or enter master password</span>
              <div className="h-px flex-1 bg-zinc-800/80" />
            </div>
          </div>
        )}

        {/* Master Password Fallback / Primary Unlock */}
        <form onSubmit={handlePasswordUnlock} className="space-y-3.5">
          <label className="block text-xs font-medium text-zinc-300">
            Master Password
            <div className="relative mt-1.5">
              <KeyRound className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
              <input
                type="password"
                required
                autoFocus={!hasBiometricEnrolled}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900/70 py-2 pl-9 pr-3 text-sm text-zinc-100 placeholder-zinc-600 focus:border-emerald-500/60 focus:outline-none"
              />
            </div>
          </label>

          <button
            type="submit"
            disabled={busy || biometricBusy}
            className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold transition disabled:opacity-50 ${
              hasBiometricEnrolled
                ? 'border border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800'
                : 'bg-emerald-500 text-zinc-950 hover:bg-emerald-400'
            }`}
          >
            {busy ? 'Verifying Password…' : 'Unlock with Password'}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </form>

        {biometricAvailable && !hasBiometricEnrolled && (
          <p className="mt-4 rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-3 py-2 text-[11px] text-zinc-400">
            Tip: After unlocking, open <strong>Security &amp; 2FA</strong> to enable 1-tap{' '}
            <strong>MacBook Touch ID</strong> unlock on this browser.
          </p>
        )}

        <div className="mt-5 flex items-center justify-between border-t border-zinc-900 pt-4 text-xs">
          <span className="text-[11px] text-zinc-600">Shortcut: ⌘⇧L to lock anytime</span>
          <button
            type="button"
            onClick={onFullSignOut}
            className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-rose-300"
          >
            <LogOut className="h-3.5 w-3.5" />
            Full Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
