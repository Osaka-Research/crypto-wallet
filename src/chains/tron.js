import { ethers } from 'ethers';
import { TronWeb } from 'tronweb';

const FULL_HOST = 'https://api.trongrid.io';
const PATH = "m/44'/195'/0'/0/0";
const SUN_PER_TRX = 1_000_000;

function client(privateKey) {
  return new TronWeb({
    fullHost: FULL_HOST,
    privateKey: privateKey ? privateKey.replace(/^0x/, '') : undefined,
  });
}

// TRON nodes return broadcast failure reasons as hex, not base64.
function decodeTronError(hex) {
  try {
    const bytes = hex.match(/.{1,2}/g).map((b) => parseInt(b, 16));
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch {
    return hex;
  }
}

export async function deriveFromMnemonic(mnemonic) {
  const node = ethers.HDNodeWallet.fromPhrase(mnemonic.trim(), undefined, PATH);
  const privateKey = node.privateKey.replace(/^0x/, '');
  const address = TronWeb.address.fromPrivateKey(privateKey);
  return { address, privateKey };
}

export function fromPrivateKey(privateKeyInput) {
  const privateKey = privateKeyInput.replace(/^0x/, '');
  const address = TronWeb.address.fromPrivateKey(privateKey);
  return { address, privateKey };
}

export function isValidAddress(address) {
  return TronWeb.isAddress(address);
}

export async function getBalance(address) {
  const res = await fetch(`${FULL_HOST}/v1/accounts/${address}`);
  if (!res.ok) throw new Error(`trongrid ${res.status}`);
  const json = await res.json();
  const sun = json?.data?.[0]?.balance ?? 0;
  return String(sun / SUN_PER_TRX);
}

export async function sendTransaction(privateKey, toAddress, amountTrx) {
  const tronWeb = client(privateKey);
  const fromAddress = TronWeb.address.fromPrivateKey(privateKey.replace(/^0x/, ''));
  const sun = Math.round(Number(amountTrx) * SUN_PER_TRX);
  const tx = await tronWeb.transactionBuilder.sendTrx(toAddress, sun, fromAddress);
  const signedTx = await tronWeb.trx.sign(tx, privateKey.replace(/^0x/, ''));
  const receipt = await tronWeb.trx.sendRawTransaction(signedTx);
  if (receipt.result === false || receipt.code) {
    throw new Error(receipt.message ? decodeTronError(receipt.message) : 'TRON broadcast failed');
  }
  return signedTx.txID;
}
