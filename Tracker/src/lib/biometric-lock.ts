const LOCK_PREFIX = "spendova_biometric_lock";

type LockRecord = {
  credentialId: string;
  createdAt: string;
};

const bytesToBase64Url = (bytes: Uint8Array) => {
  const binary = Array.from(bytes).map((byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const base64UrlToBytes = (value: string) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const randomChallenge = () => {
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);
  return challenge;
};

const keyForUser = (userId: string) => `${LOCK_PREFIX}:${userId}`;

export function isBiometricLockSupported() {
  return typeof window !== "undefined"
    && window.isSecureContext
    && "PublicKeyCredential" in window
    && Boolean(navigator.credentials);
}

export async function canUsePlatformBiometrics() {
  if (!isBiometricLockSupported()) return false;
  const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.();
  return Boolean(available);
}

export function isBiometricLockEnabled(userId?: string | null) {
  if (!userId) return false;
  return Boolean(localStorage.getItem(keyForUser(userId)));
}

export async function enableBiometricLock(userId: string, email?: string | null, displayName?: string | null) {
  if (!await canUsePlatformBiometrics()) {
    throw new Error("Fingerprint or Face ID lock is not available on this device/browser.");
  }

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: randomChallenge(),
      rp: { name: "Spendova" },
      user: {
        id: new TextEncoder().encode(userId).slice(0, 64),
        name: email || "Spendova user",
        displayName: displayName || email || "Spendova user",
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "preferred",
        userVerification: "required",
      },
      timeout: 60000,
      attestation: "none",
    },
  }) as PublicKeyCredential | null;

  if (!credential) throw new Error("Fingerprint lock setup was cancelled.");

  const record: LockRecord = {
    credentialId: bytesToBase64Url(new Uint8Array(credential.rawId)),
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(keyForUser(userId), JSON.stringify(record));
  return record;
}

export async function unlockWithBiometric(userId: string) {
  const rawRecord = localStorage.getItem(keyForUser(userId));
  if (!rawRecord) return true;

  const record = JSON.parse(rawRecord) as LockRecord;
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: randomChallenge(),
      allowCredentials: [{
        id: base64UrlToBytes(record.credentialId),
        type: "public-key",
        transports: ["internal"],
      }],
      userVerification: "required",
      timeout: 60000,
    },
  });

  return Boolean(credential);
}

export function disableBiometricLock(userId: string) {
  localStorage.removeItem(keyForUser(userId));
}
