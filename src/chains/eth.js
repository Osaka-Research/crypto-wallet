import { ethers } from 'ethers';

const RPC_URLS = [
  'https://ethereum.publicnode.com',
  'https://eth.llamarpc.com',
  'https://rpc.ankr.com/eth',
];

const PATH = "m/44'/60'/0'/0/0";

export async function deriveFromMnemonic(mnemonic) {
  const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic.trim(), undefined, PATH);
  return { address: wallet.address, privateKey: wallet.privateKey };
}

export function fromPrivateKey(privateKey) {
  const wallet = new ethers.Wallet(privateKey);
  return { address: wallet.address, privateKey: wallet.privateKey };
}

export function isValidAddress(address) {
  return ethers.isAddress(address);
}

export async function getBalance(address) {
  let lastErr;
  for (const url of RPC_URLS) {
    try {
      const provider = new ethers.JsonRpcProvider(url);
      const wei = await provider.getBalance(address);
      return ethers.formatEther(wei);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('all ETH RPCs failed');
}

export async function sendTransaction(privateKey, toAddress, amountEth) {
  let lastErr;
  for (const url of RPC_URLS) {
    try {
      const provider = new ethers.JsonRpcProvider(url);
      const wallet = new ethers.Wallet(privateKey, provider);
      const tx = await wallet.sendTransaction({
        to: toAddress,
        value: ethers.parseEther(String(amountEth)),
      });
      return tx.hash;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('all ETH RPCs failed');
}
