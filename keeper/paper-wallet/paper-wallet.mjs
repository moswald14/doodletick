// SPDX-License-Identifier: GPL-3.0-only
import { encryptWallet, generatePrivateKey, privateKeyFromWif, privateKeyIdentity, privateKeyToWif } from '../public/scrypt-wallet-core.mjs';
import { qrcodegen } from './qrcodegen.ts';

const network = 'main';
const el = id => document.getElementById(id);
const make = el('make');
const print = el('print');
const clear = el('clear');
const addressBox = el('address');
const receiveQr = el('address-qr');
const privateBox = el('private-key');
const privateQr = el('private-qr');
const status = el('status');
const recovery = el('recover');
const recoveryForm = el('recover-form');
const backup = el('backup');
const backupForm = el('backup-form');
const backupStatus = el('backup-status');
const localFile = window.top === window && location.protocol === 'file:' && window.isSecureContext &&
  typeof window.crypto?.getRandomValues === 'function' && !!window.crypto.subtle;
let wallet = null;
let saving = false;

function drawQr(container, text, title) {
  const code = qrcodegen.QrCode.encodeText(text, qrcodegen.QrCode.Ecc.MEDIUM);
  const side = code.size + 8;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${side} ${side}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', title);
  svg.setAttribute('shape-rendering', 'crispEdges');
  const background = document.createElementNS(ns, 'rect');
  background.setAttribute('width', side);
  background.setAttribute('height', side);
  background.setAttribute('fill', '#fff');
  const modules = document.createElementNS(ns, 'path');
  const path = [];
  for (let y = 0; y < code.size; y++) {
    for (let x = 0; x < code.size; x++) {
      if (code.getModule(x, y)) path.push(`M${x + 4},${y + 4}h1v1h-1z`);
    }
  }
  modules.setAttribute('d', path.join(''));
  modules.setAttribute('fill', '#000');
  svg.append(background, modules);
  container.replaceChildren(svg);
}

function updateControls() {
  make.disabled = !localFile || !!wallet;
  print.disabled = !wallet || saving;
  clear.disabled = !wallet || saving;
  el('save').disabled = !wallet || saving;
  el('wif').disabled = el('printed-address').disabled = el('read-paper').disabled = make.disabled;
  backup.hidden = !wallet;
}

function loadWallet(secret, printedAddress = '') {
  const { address } = privateKeyIdentity(secret, network);
  if (printedAddress && printedAddress !== address) throw new Error('The private key and printed receiving address do not match.');
  drawQr(receiveQr, address, 'QR code for the receiving address');
  wallet = { secret, address };
  addressBox.textContent = address;
  recovery.open = false;
  updateControls();
}

function clearPrintedSecret() {
  document.documentElement.classList.remove('printing');
  privateBox.textContent = '';
  privateQr.replaceChildren();
}

function clearWallet() {
  wallet?.secret.fill(0);
  wallet = null;
  saving = false;
  clearPrintedSecret();
  receiveQr.replaceChildren();
  addressBox.textContent = 'Your address will appear here.';
  backupStatus.textContent = '';
  backup.open = false;
  backupForm.reset();
  recoveryForm.reset();
  updateControls();
}

make.addEventListener('click', () => {
  if (!localFile || wallet) return;
  let secret;
  try {
    secret = generatePrivateKey();
    loadWallet(secret);
    status.textContent = 'Wallet created. Print it or save an encrypted backup before using the address.';
  } catch {
    secret?.fill(0);
    clearWallet();
    status.textContent = 'This browser could not create a wallet.';
  }
});

recoveryForm.addEventListener('submit', event => {
  event.preventDefault();
  if (!localFile || wallet) return;
  let secret;
  try {
    secret = privateKeyFromWif(el('wif').value, network);
    loadWallet(secret, el('printed-address').value.trim());
    status.textContent = 'Paper wallet loaded. Save an encrypted backup to open it in Keeper.';
    backup.open = true;
    el('password').focus();
  } catch (error) {
    secret?.fill(0);
    clearWallet();
    status.textContent = error.message;
    el('wif').focus();
  } finally {
    recoveryForm.reset();
  }
});

print.addEventListener('click', () => {
  if (!wallet || saving) return;
  try {
    const wif = privateKeyToWif(wallet.secret, network);
    drawQr(privateQr, wif, 'QR code for the private spending key');
    privateBox.textContent = wif;
    document.documentElement.classList.add('printing');
    window.print();
  } catch {
    clearPrintedSecret();
    status.textContent = 'Print preview could not open. Your wallet is still active.';
  }
});
window.addEventListener('afterprint', clearPrintedSecret);

clear.addEventListener('click', () => {
  if (!wallet || saving || !window.confirm('Clear this wallet? First keep its printed key or encrypted backup.')) return;
  clearWallet();
  status.textContent = 'Wallet cleared from this page.';
  make.focus();
});
window.addEventListener('pagehide', clearWallet);

backupForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!wallet || saving) return;
  const password = el('password').value;
  if (password !== el('repeat-password').value) {
    backupStatus.textContent = 'The passwords differ.';
    return;
  }
  const selected = wallet;
  const secret = selected.secret.slice();
  backupForm.reset();
  saving = true;
  updateControls();
  backupStatus.textContent = 'Encrypting the backup…';
  try {
    const record = await encryptWallet(secret, network, password);
    if (wallet !== selected) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2) + '\n'], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `doodleverse-wallet-${record.address}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    backupStatus.textContent = 'Backup ready. Keep the file and password safe.';
  } catch {
    if (wallet === selected) backupStatus.textContent = 'Could not encrypt the backup. Use at least 12 characters and at most 1,024 UTF-8 bytes.';
  } finally {
    secret.fill(0);
    if (wallet === selected) {
      saving = false;
      updateControls();
    }
  }
});

updateControls();
if (localFile) status.textContent = 'Ready. Keys are created here on your device.';
