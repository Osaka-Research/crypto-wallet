import * as vault from './vault.js';

let password = null;
let state = { wallets: [] };

export function isUnlocked() {
  return password !== null;
}

export async function unlock(pw) {
  const hasExisting = await vault.hasVault();
  state = hasExisting ? await vault.loadVault(pw) : await vault.createVault(pw);
  password = pw;
  return state;
}

export function lock() {
  password = null;
  state = { wallets: [] };
}

async function persist() {
  await vault.saveVault(password, state);
}

export function listWallets() {
  return state.wallets;
}

export function getWallet(id) {
  return state.wallets.find((w) => w.id === id);
}

export async function addWallet(entry) {
  const wallet = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    ...entry,
  };
  state.wallets.push(wallet);
  await persist();
  return wallet;
}

export async function removeWallet(id) {
  state.wallets = state.wallets.filter((w) => w.id !== id);
  await persist();
}

export async function renameWallet(id, label) {
  const w = getWallet(id);
  if (w) {
    w.label = label;
    await persist();
  }
}
