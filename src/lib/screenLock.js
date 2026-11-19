// Device-local Screen Lock, Auto-Lock Preferences & WebAuthn Platform Biometrics (Touch ID / Face ID)

const LOCK_SETTINGS_KEY = 'asfinance.lock_settings.v1';
const LOCK_STATE_KEY = 'asfinance.screen_locked.v1';
const BIOMETRIC_CRED_KEY = 'asfinance.biometric_cred.v1';

export const DEFAULT_LOCK_SETTINGS = {
  timeoutMinutes: 5, // 1, 2, 5, 10, 15, 30, or 0 (Off)
  lockOnTabHide: false,
};

function bufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToUint8Array(base64Url) {
  const padded = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + '='.repeat(padLen));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function loadLockSettings() {
  try {
    const raw = localStorage.getItem(LOCK_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_LOCK_SETTINGS };
    const parsed = JSON.parse(raw);
    const timeout = Number(parsed.timeoutMinutes);
    return {
      timeoutMinutes: Number.isFinite(timeout) && timeout >= 0 ? timeout : DEFAULT_LOCK_SETTINGS.timeoutMinutes,
      lockOnTabHide: Boolean(parsed.lockOnTabHide),
    };
  } catch {
    return { ...DEFAULT_LOCK_SETTINGS };
  }
}

export function saveLockSettings(settings) {
  const clean = {
    timeoutMinutes: Number(settings.timeoutMinutes) >= 0 ? Number(settings.timeoutMinutes) : 5,
    lockOnTabHide: Boolean(settings.lockOnTabHide),
  };
  localStorage.setItem(LOCK_SETTINGS_KEY, JSON.stringify(clean));
  return clean;
}

export function isPersistedScreenLocked() {
  try {
    return localStorage.getItem(LOCK_STATE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setPersistedScreenLocked(locked) {
  try {
    if (locked) {
      localStorage.setItem(LOCK_STATE_KEY, '1');
    } else {
      localStorage.removeItem(LOCK_STATE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export async function isPlatformBiometricSupported() {
  try {
    if (
      typeof window === 'undefined' ||
      !window.isSecureContext ||
      typeof window.PublicKeyCredential !== 'function'
    ) {
      return false;
    }
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function getSavedBiometricCredential(userId) {
  try {
    const raw = localStorage.getItem(BIOMETRIC_CRED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.credentialId) return null;
    if (userId && parsed.userId && parsed.userId !== userId) return null;
    if (parsed.rpId && parsed.rpId !== window.location.hostname) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function removeSavedBiometricCredential() {
  try {
    localStorage.removeItem(BIOMETRIC_CRED_KEY);
  } catch {
    // Ignore
  }
}

export async function registerDeviceBiometric(user) {
  const supported = await isPlatformBiometricSupported();
  if (!supported) {
    throw new Error('Touch ID / platform biometrics are not available in this browser.');
  }

  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);
  const rpId = window.location.hostname;
  const userIdBytes = new TextEncoder().encode(user.id || user.email || 'asfinance-owner');

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: {
        name: 'asfinance',
        id: rpId,
      },
      user: {
        id: userIdBytes,
        name: user.email || 'owner@asfinance',
        displayName: user.email || 'Owner',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256 (Apple Touch ID / Face ID)
        { type: 'public-key', alg: -257 }, // RS256 fallback
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
      attestation: 'none',
    },
  });

  if (!credential || !credential.rawId) {
    throw new Error('Biometric registration was cancelled.');
  }

  const saved = {
    credentialId: bufferToBase64Url(credential.rawId),
    userId: user.id,
    email: user.email,
    rpId,
    createdAt: new Date().toISOString(),
  };

  localStorage.setItem(BIOMETRIC_CRED_KEY, JSON.stringify(saved));
  return saved;
}

export async function verifyDeviceBiometric(userId) {
  const saved = getSavedBiometricCredential(userId);
  if (!saved) {
    throw new Error('Touch ID is not set up on this browser yet.');
  }

  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);
  const expectedChallengeB64 = bufferToBase64Url(challenge.buffer);

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId: saved.rpId || window.location.hostname,
      allowCredentials: [
        {
          id: base64UrlToUint8Array(saved.credentialId),
          type: 'public-key',
          transports: ['internal'],
        },
      ],
      userVerification: 'required',
      timeout: 60000,
    },
  });

  if (!assertion || !assertion.response?.signature || assertion.response.signature.byteLength === 0) {
    throw new Error('Touch ID verification failed.');
  }

  // Validate clientDataJSON challenge & origin
  const clientDataText = new TextDecoder().decode(assertion.response.clientDataJSON);
  const clientData = JSON.parse(clientDataText);
  if (
    clientData.type !== 'webauthn.get' ||
    clientData.challenge !== expectedChallengeB64 ||
    clientData.origin !== window.location.origin
  ) {
    throw new Error('Biometric challenge verification mismatch.');
  }

  return true;
}
