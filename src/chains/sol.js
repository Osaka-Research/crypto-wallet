import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { mnemonicToSeedSync } from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import bs58 from 'bs58';

const RPC_URLS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-rpc.publicnode.com',
];
const PATH = "m/44'/501'/0'/0'";

function getConnection() {
  return new Connection(RPC_URLS[0], 'confirmed');
}

export async function deriveFromMnemonic(mnemonic) {
  const seed = mnemonicToSeedSync(mnemonic.trim());
  const { key } = derivePath(PATH, seed.toString('hex'));
  const keypair = Keypair.fromSeed(key);
  return { address: keypair.publicKey.toBase58(), privateKey: bs58.encode(keypair.secretKey) };
}

export function fromPrivateKey(privateKeyBase58) {
  const secretKey = bs58.decode(privateKeyBase58.trim());
  const keypair = Keypair.fromSecretKey(secretKey);
  return { address: keypair.publicKey.toBase58(), privateKey: privateKeyBase58.trim() };
}

export function isValidAddress(address) {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

export async function getBalance(address) {
  let lastErr;
  for (const url of RPC_URLS) {
    try {
      const connection = new Connection(url, 'confirmed');
      const lamports = await connection.getBalance(new PublicKey(address));
      return String(lamports / LAMPORTS_PER_SOL);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('all SOL RPCs failed');
}

export async function sendTransaction(privateKeyBase58, toAddress, amountSol) {
  const connection = getConnection();
  const keypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58.trim()));
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: new PublicKey(toAddress),
      lamports: Math.round(Number(amountSol) * LAMPORTS_PER_SOL),
    })
  );
  const signature = await sendAndConfirmTransaction(connection, tx, [keypair]);
  return signature;
}
