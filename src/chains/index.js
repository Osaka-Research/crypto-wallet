import { generateMnemonic } from 'bip39';
import * as eth from './eth.js';
import * as tron from './tron.js';
import * as sol from './sol.js';

export const CHAINS = {
  ETH: { key: 'ETH', label: 'Ethereum', symbol: 'ETH', color: '#627EEA', mod: eth },
  TRON: { key: 'TRON', label: 'Tron', symbol: 'TRX', color: '#EF0027', mod: tron },
  SOL: { key: 'SOL', label: 'Solana', symbol: 'SOL', color: '#14F195', mod: sol },
};

export function newMnemonic() {
  return generateMnemonic(128); // 12 words
}

export function deriveFromMnemonic(chainKey, mnemonic) {
  return CHAINS[chainKey].mod.deriveFromMnemonic(mnemonic);
}

export function fromPrivateKey(chainKey, privateKey) {
  return CHAINS[chainKey].mod.fromPrivateKey(privateKey);
}

export function isValidAddress(chainKey, address) {
  return CHAINS[chainKey].mod.isValidAddress(address);
}

export function getBalance(chainKey, address) {
  return CHAINS[chainKey].mod.getBalance(address);
}

export function sendTransaction(chainKey, privateKey, toAddress, amount) {
  return CHAINS[chainKey].mod.sendTransaction(privateKey, toAddress, amount);
}
