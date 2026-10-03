import { Preferences } from '@capacitor/preferences';

const STORAGE_KEY = 'vault_blob_v1';
const PBKDF2_ITERATIONS = 200_000;

function b64(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function unb64(str) {
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function hasVault() {
  const { value } = await Preferences.get({ key: STORAGE_KEY });
  return !!value;
}

export async function createVault(password) {
  const empty = { wallets: [] };
  await saveVault(password, empty);
  return empty;
}

export async function saveVault(password, vaultData) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const enc = new TextEncoder();
  const plaintext = enc.encode(JSON.stringify(vaultData));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  const blob = {
    salt: b64(salt),
    iv: b64(iv),
    iterations: PBKDF2_ITERATIONS,
    data: b64(new Uint8Array(ciphertext)),
  };
  await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(blob) });
}

export async function loadVault(password) {
  const { value } = await Preferences.get({ key: STORAGE_KEY });
  if (!value) throw new Error('no vault stored');
  const blob = JSON.parse(value);
  const salt = unb64(blob.salt);
  const iv = unb64(blob.iv);
  const key = await deriveKey(password, salt);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      unb64(blob.data)
    );
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new Error('wrong password');
  }
}

export async function wipeVault() {
  await Preferences.remove({ key: STORAGE_KEY });
}
