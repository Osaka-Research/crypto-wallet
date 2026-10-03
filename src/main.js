import QRCode from 'qrcode';
import { CHAINS, newMnemonic, deriveFromMnemonic, fromPrivateKey, isValidAddress, getBalance, sendTransaction } from './chains/index.js';
import * as wallets from './wallets.js';
import { hasVault } from './vault.js';

const app = document.getElementById('app');
let balances = {}; // id -> { loading, value, error }

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

function short(addr) {
  if (!addr) return '';
  return addr.length > 14 ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : addr;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied');
  } catch {
    toast('Copy failed');
  }
}

// ---------- Screens ----------

function renderUnlock() {
  app.innerHTML = `
    <div class="center-screen">
      <h2>MultiWallet</h2>
      <p class="hint">ETH · TRON · SOL — self-custody, no accounts, no server.</p>
      <div style="width:100%;display:flex;flex-direction:column;gap:10px;margin-top:10px;">
        <input type="password" id="pw" placeholder="Password" autocomplete="current-password" />
        <input type="password" id="pw2" placeholder="Confirm password" style="display:none" />
        <div class="error-text" id="err"></div>
        <button class="btn" id="unlockBtn">Unlock</button>
      </div>
    </div>
  `;

  (async () => {
    const exists = await hasVault();
    if (!exists) {
      document.getElementById('pw2').style.display = 'block';
      document.getElementById('pw').placeholder = 'Create a password';
      document.getElementById('unlockBtn').textContent = 'Create wallet vault';
    }
    document.getElementById('unlockBtn').onclick = async () => {
      const pw = document.getElementById('pw').value;
      const pw2 = document.getElementById('pw2').value;
      const err = document.getElementById('err');
      err.textContent = '';
      if (!pw || pw.length < 6) {
        err.textContent = 'Password must be at least 6 characters';
        return;
      }
      if (!exists && pw !== pw2) {
        err.textContent = 'Passwords do not match';
        return;
      }
      try {
        await wallets.unlock(pw);
        renderMain();
      } catch (e) {
        err.textContent = e.message === 'wrong password' ? 'Wrong password' : e.message;
      }
    };
  })();
}

function chainBadge(chainKey) {
  const c = CHAINS[chainKey];
  return `<span class="chain-badge" style="background:${c.color}"><span class="chain-dot"></span>${c.label}</span>`;
}

function renderMain() {
  const list = wallets.listWallets();
  app.innerHTML = `
    <div class="topbar">
      <h1>MultiWallet</h1>
      <button class="icon-btn" id="lockBtn" title="Lock">🔒</button>
    </div>
    <div class="screen">
      ${
        list.length === 0
          ? `<div class="empty-state"><p>No wallets yet.</p><p>Tap + to create your first ETH, TRON, or SOL wallet.</p></div>`
          : `<div class="wallet-list" id="walletList"></div>`
      }
    </div>
    <button class="btn fab" id="addBtn">+ Add Wallet</button>
  `;
  document.getElementById('lockBtn').onclick = () => {
    wallets.lock();
    renderUnlock();
  };
  document.getElementById('addBtn').onclick = openAddWalletModal;

  if (list.length) {
    const listEl = document.getElementById('walletList');
    listEl.innerHTML = list.map(walletCardHtml).join('');
    for (const w of list) wireWalletCard(w);
  }
}

function walletCardHtml(w) {
  const b = balances[w.id];
  const balanceHtml = !b
    ? `<span class="spinner"></span>`
    : b.loading
    ? `<span class="spinner"></span>`
    : b.error
    ? `<span style="color:var(--danger);font-size:13px">error</span>`
    : `${Number(b.value).toFixed(6)}<span class="sym">${CHAINS[w.chain].symbol}</span>`;
  return `
    <div class="wallet-card" data-id="${w.id}">
      <div class="wallet-card-top">
        ${chainBadge(w.chain)}
        <div>
          <button class="icon-btn" data-action="refresh" data-id="${w.id}" title="Refresh balance">⟳</button>
          <button class="icon-btn" data-action="remove" data-id="${w.id}" title="Remove">✕</button>
        </div>
      </div>
      <div class="wallet-label">${escapeHtml(w.label)}</div>
      <div class="wallet-balance">${balanceHtml}</div>
      <div class="wallet-address" data-action="copyaddr" data-id="${w.id}">${w.address}</div>
      <div class="wallet-actions">
        <button class="btn secondary" data-action="receive" data-id="${w.id}">Receive</button>
        <button class="btn secondary" data-action="send" data-id="${w.id}">Send</button>
      </div>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function wireWalletCard(w) {
  const card = document.querySelector(`.wallet-card[data-id="${w.id}"]`);
  if (!card) return;
  card.querySelector('[data-action="copyaddr"]').onclick = () => copyText(w.address);
  card.querySelector('[data-action="receive"]').onclick = () => openReceiveModal(w);
  card.querySelector('[data-action="send"]').onclick = () => openSendModal(w);
  card.querySelector('[data-action="remove"]').onclick = () => confirmRemove(w);
  card.querySelector('[data-action="refresh"]').onclick = () => refreshBalance(w);
  refreshBalance(w);
}

async function refreshBalance(w) {
  balances[w.id] = { loading: true };
  updateBalanceInDom(w.id);
  try {
    const value = await getBalance(w.chain, w.address);
    balances[w.id] = { loading: false, value };
  } catch (e) {
    balances[w.id] = { loading: false, error: true };
  }
  updateBalanceInDom(w.id);
}

function updateBalanceInDom(id) {
  const card = document.querySelector(`.wallet-card[data-id="${id}"] .wallet-balance`);
  if (!card) return;
  const w = wallets.getWallet(id);
  const b = balances[id];
  card.innerHTML = b.loading
    ? `<span class="spinner"></span>`
    : b.error
    ? `<span style="color:var(--danger);font-size:13px">error</span>`
    : `${Number(b.value).toFixed(6)}<span class="sym">${CHAINS[w.chain].symbol}</span>`;
}

function confirmRemove(w) {
  openModal(`
    <h3>Remove wallet?</h3>
    <p class="hint">${chainBadge(w.chain)} ${escapeHtml(w.label)}</p>
    <div class="warn-box">Make sure you've backed up the private key / recovery phrase. This cannot be undone.</div>
    <button class="btn danger" id="confirmRemoveBtn">Remove</button>
    <button class="btn secondary" id="cancelBtn">Cancel</button>
  `);
  document.getElementById('confirmRemoveBtn').onclick = async () => {
    await wallets.removeWallet(w.id);
    delete balances[w.id];
    closeModal();
    renderMain();
  };
  document.getElementById('cancelBtn').onclick = closeModal;
}

// ---------- Modal helpers ----------

function openModal(innerHtml) {
  closeModal();
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'modalBackdrop';
  backdrop.innerHTML = `<div class="modal-sheet">${innerHtml}</div>`;
  backdrop.onclick = (e) => {
    if (e.target === backdrop) closeModal();
  };
  document.body.appendChild(backdrop);
}

function closeModal() {
  document.getElementById('modalBackdrop')?.remove();
}

// ---------- Add wallet modal ----------

function openAddWalletModal() {
  let chainKey = 'ETH';
  let mode = 'new';

  function html() {
    return `
      <h3>Add Wallet</h3>
      <div>
        <span class="field-label">Chain</span>
        <div class="chain-choice-row" id="chainRow">
          ${Object.values(CHAINS)
            .map(
              (c) =>
                `<div class="chain-choice ${c.key === chainKey ? 'active' : ''}" data-chain="${c.key}">${c.symbol}</div>`
            )
            .join('')}
        </div>
      </div>
      <div class="mode-tabs" id="modeTabs">
        <div class="mode-tab ${mode === 'new' ? 'active' : ''}" data-mode="new">Generate New</div>
        <div class="mode-tab ${mode === 'import' ? 'active' : ''}" data-mode="import">Import</div>
      </div>
      <div id="modeBody"></div>
      <div class="error-text" id="addErr"></div>
    `;
  }

  function modeBodyHtml() {
    if (mode === 'new') {
      return `
        <span class="field-label">Label</span>
        <input type="text" id="labelInput" placeholder="e.g. ${CHAINS[chainKey].label} main" />
        <button class="btn" id="genBtn" style="margin-top:8px">Generate</button>
      `;
    }
    return `
      <span class="field-label">Label</span>
      <input type="text" id="labelInput" placeholder="e.g. ${CHAINS[chainKey].label} imported" />
      <span class="field-label" style="margin-top:8px">Recovery phrase or private key</span>
      <textarea id="importInput" placeholder="12-word phrase, or raw private key"></textarea>
      <button class="btn" id="importBtn" style="margin-top:8px">Import</button>
    `;
  }

  openModal(html());
  const modeBody = document.getElementById('modeBody');
  modeBody.innerHTML = modeBodyHtml();
  wireModeBody();

  function wireChainRow() {
    document.getElementById('chainRow').querySelectorAll('.chain-choice').forEach((el) => {
      el.onclick = () => {
        chainKey = el.dataset.chain;
        document.getElementById('chainRow').querySelectorAll('.chain-choice').forEach((e2) => e2.classList.remove('active'));
        el.classList.add('active');
        modeBody.innerHTML = modeBodyHtml();
        wireModeBody();
      };
    });
  }

  function wireModeTabs() {
    document.getElementById('modeTabs').querySelectorAll('.mode-tab').forEach((el) => {
      el.onclick = () => {
        mode = el.dataset.mode;
        document.getElementById('modeTabs').querySelectorAll('.mode-tab').forEach((e2) => e2.classList.remove('active'));
        el.classList.add('active');
        modeBody.innerHTML = modeBodyHtml();
        wireModeBody();
      };
    });
  }

  function wireModeBody() {
    document.getElementById('addErr').textContent = '';
    if (mode === 'new') {
      document.getElementById('genBtn').onclick = async () => {
        const label = document.getElementById('labelInput').value.trim() || `${CHAINS[chainKey].label} wallet`;
        const mnemonic = newMnemonic();
        const { address, privateKey } = await deriveFromMnemonic(chainKey, mnemonic);
        showMnemonicConfirm({ chainKey, label, mnemonic, address, privateKey });
      };
    } else {
      document.getElementById('importBtn').onclick = async () => {
        const err = document.getElementById('addErr');
        err.textContent = '';
        const label = document.getElementById('labelInput').value.trim() || `${CHAINS[chainKey].label} wallet`;
        const raw = document.getElementById('importInput').value.trim();
        if (!raw) {
          err.textContent = 'Enter a recovery phrase or private key';
          return;
        }
        try {
          const wordCount = raw.split(/\s+/).length;
          let derived;
          if (wordCount >= 12) {
            derived = await deriveFromMnemonic(chainKey, raw);
          } else {
            derived = fromPrivateKey(chainKey, raw);
          }
          await wallets.addWallet({ chain: chainKey, label, address: derived.address, privateKey: derived.privateKey });
          closeModal();
          renderMain();
          toast('Wallet imported');
        } catch (e) {
          err.textContent = 'Invalid phrase or private key for ' + CHAINS[chainKey].label;
        }
      };
    }
  }

  wireChainRow();
  wireModeTabs();
}

function showMnemonicConfirm({ chainKey, label, mnemonic, address, privateKey }) {
  openModal(`
    <h3>Your recovery phrase</h3>
    <div class="warn-box">Write this down and store it safely. Anyone with this phrase can take your funds. It is never shown again.</div>
    <div class="mnemonic-box">${mnemonic}</div>
    <span class="field-label">Address</span>
    <div class="copy-row">${address}</div>
    <button class="btn" id="savedBtn">I've saved it — Add Wallet</button>
    <button class="btn secondary" id="cancelGenBtn">Cancel</button>
  `);
  document.getElementById('savedBtn').onclick = async () => {
    await wallets.addWallet({ chain: chainKey, label, address, privateKey });
    closeModal();
    renderMain();
    toast('Wallet created');
  };
  document.getElementById('cancelGenBtn').onclick = closeModal;
}

// ---------- Receive modal ----------

async function openReceiveModal(w) {
  openModal(`
    <h3>Receive ${chainBadge(w.chain)}</h3>
    <div class="qr-wrap"><canvas id="qrCanvas"></canvas></div>
    <span class="field-label">${escapeHtml(w.label)}</span>
    <div class="copy-row" id="addrRow">${w.address}</div>
    <button class="btn" id="copyAddrBtn">Copy Address</button>
    <div class="warn-box">Only send ${CHAINS[w.chain].label} (${CHAINS[w.chain].symbol}) assets to this address.</div>
  `);
  document.getElementById('copyAddrBtn').onclick = () => copyText(w.address);
  try {
    await QRCode.toCanvas(document.getElementById('qrCanvas'), w.address, { width: 220, margin: 1 });
  } catch {}
}

// ---------- Send modal ----------

function openSendModal(w) {
  openModal(`
    <h3>Send ${chainBadge(w.chain)}</h3>
    <p class="hint">From: ${short(w.address)} — balance ${balances[w.id] && !balances[w.id].loading && !balances[w.id].error ? Number(balances[w.id].value).toFixed(6) : '…'} ${CHAINS[w.chain].symbol}</p>
    <span class="field-label">To address</span>
    <input type="text" id="toInput" placeholder="Recipient ${CHAINS[w.chain].label} address" />
    <span class="field-label">Amount (${CHAINS[w.chain].symbol})</span>
    <input type="number" id="amountInput" placeholder="0.0" min="0" step="any" />
    <div class="error-text" id="sendErr"></div>
    <button class="btn" id="sendBtn">Send</button>
  `);
  document.getElementById('sendBtn').onclick = async () => {
    const err = document.getElementById('sendErr');
    err.textContent = '';
    const to = document.getElementById('toInput').value.trim();
    const amount = document.getElementById('amountInput').value.trim();
    if (!isValidAddress(w.chain, to)) {
      err.textContent = `Invalid ${CHAINS[w.chain].label} address`;
      return;
    }
    if (!amount || Number(amount) <= 0) {
      err.textContent = 'Enter a valid amount';
      return;
    }
    const btn = document.getElementById('sendBtn');
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Sending…`;
    try {
      const txId = await sendTransaction(w.chain, w.privateKey, to, amount);
      closeModal();
      toast('Sent — tx ' + short(txId));
      refreshBalance(w);
    } catch (e) {
      err.textContent = e?.message || 'Send failed';
      btn.disabled = false;
      btn.textContent = 'Send';
    }
  };
}

// ---------- Boot ----------

renderUnlock();
