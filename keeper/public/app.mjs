import { verifyGardenResponse, GARDEN_FORMAT } from './mushroom-core.mjs';
import { createMushroomUI } from './mushroom-ui.mjs';
import { createDoodleverseCoinUI } from './doodleverse-coin-ui.mjs';
import { createDoodleverseRecipientUI } from './doodleverse-recipient-ui.mjs';
import { createClockWheel } from './clock-wheel.mjs';
import { createWeatherUI } from './weather-ui.mjs';
import { createBackgroundMusicUI } from './background-music-ui.mjs';
import { createVpnUI } from './vpn-ui.mjs';
import { newIdentity, random, b64, deriveKey, encryptVault, decryptVault, sealEntry, verifyWitness, verifyEntry, receiptFor, verifyReceipt, tickAt, tetrachromaColor, EPOCH, MAX_TEXT, MAX_BACKUP, validateEnvelope } from './core.mjs';
import { createFilesUI } from './files-ui.mjs';
import { createArcadeUI } from './arcade-ui.mjs';
const $ = id => document.getElementById(id);
const STORAGE = 'doodletick-vault-v1';
const RECOVERY = 'doodletick-tab-recovery-v1';
const blank = () => ({ title: '', body: '', kind: 'Idea', revisionOf: null });
let vault = null, key = null, salt = null, savedRaw = null, pendingBackup = null, selected = null;
let saveTimer, toastTimer, queue = Promise.resolve(), generation = 0, busy = false, lastActive = Date.now();
let changeId = 0;
let arcadeUI;
let recipientUI;
function markDirty() { changeId++; $('save-status').textContent = 'Encrypting your draft…'; }
let storageAvailable = true;
try { savedRaw = localStorage.getItem(STORAGE); } catch { storageAvailable = false; }
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5500); }
function setupThemeControls() {
  const theme = window.KeeperTheme;
  if (!theme) { $('theme-toggle').hidden = true; return; }
  const formatTime = value => { const date = new Date(); date.setHours(Number(value.slice(0, 2)), Number(value.slice(3)), 0, 0); return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
  function updateStatus() {
    const state = theme.getState(), automatic = state.mode === 'auto';
    const label = (state.theme === 'night' ? 'Night' : 'Day') + (automatic ? ' · Auto' : '');
    $('theme-status').textContent = label;
    $('theme-toggle').querySelector('.theme-icon').textContent = state.theme === 'night' ? '☾' : '☀';
    $('theme-toggle').setAttribute('aria-label', `${label}. Open appearance settings.`);
    $('theme-toggle').title = automatic ? `Red night: ${formatTime(state.start)}–${formatTime(state.end)}, local time` : 'Open appearance settings to restore automatic switching';
    $('theme-zone').textContent = 'Uses this device’s local time · ' + Intl.DateTimeFormat().resolvedOptions().timeZone + '. Hours apply in Automatic mode.';
  }
  $('theme-toggle').addEventListener('click', () => {
    const state = theme.getState();
    $('theme-mode').value = state.mode; $('night-start').value = state.start; $('night-end').value = state.end;
    $('theme-error').textContent = ''; updateStatus(); $('theme-dialog').showModal();
  });
  $('close-theme').addEventListener('click', () => $('theme-dialog').close());
  function saved(state) { $('theme-dialog').close(); toast(state.persisted ? 'Appearance saved on this device.' : 'Appearance applied for this visit. Browser storage is unavailable.'); }
  $('theme-form').addEventListener('submit', event => {
    event.preventDefault();
    try { saved(theme.setPreferences({ mode: $('theme-mode').value, start: $('night-start').value, end: $('night-end').value })); }
    catch (error) { $('theme-error').textContent = error.message; }
  });
  $('reset-theme').addEventListener('click', () => saved(theme.reset()));
  window.addEventListener('keeper-themechange', updateStatus);
  updateStatus();
}
setupThemeControls();
const weatherUI = createWeatherUI($('keeper-weather'));
const atmospherePanel = $('keeper-atmosphere');
const updateWeatherVisibility = () => weatherUI.setVisible(atmospherePanel.open);
atmospherePanel.addEventListener('toggle', updateWeatherVisibility);
updateWeatherVisibility();
createBackgroundMusicUI($('keeper-music'), { onChange: state => {
  $('atmosphere-music-status').textContent = state.phase === 'playing' ? (state.muted || state.volume === 0 ? 'Music muted' : 'Music playing') : state.phase === 'starting' ? 'Starting music…' : 'Music paused';
} });
function showView(view) {
  if (!['arcade', 'garden', 'coin', 'vault', 'files', 'verify', 'about'].includes(view)) view = 'arcade';
  for (const section of ['arcade', 'garden', 'coin', 'vault', 'files', 'verify', 'about']) $('view-' + section).hidden = view !== section;
  for (const button of document.querySelectorAll('[data-view]')) { button.classList.toggle('active', button.dataset.view === view); button.setAttribute('aria-current', button.dataset.view === view ? 'page' : 'false'); }
  $('page-name').textContent = { garden: 'MUSHROOM GARDEN', coin: 'DOODLEVERSE COIN', arcade: 'THE DOODLEVERSE', vault: 'MY VAULT', files: 'FILES & PEERS', verify: 'CHECK A RECEIPT', about: 'THE IDEA' }[view];
  arcadeUI?.setVisible(view === 'arcade');
  mushroomUI.setVisible(view === 'garden');
  coinUI.setVisible(view === 'coin');
  recipientUI?.setVisible(view === 'coin');
  history.replaceState(null, '', '#' + view);
}
const fileUI = createFilesUI({ toast, onUnlockRequest: () => showView('vault'), onActivity: () => { lastActive = Date.now(); } });
arcadeUI = createArcadeUI({ toast, onUnlockRequest: () => showView('vault'), onActivity: () => { lastActive = Date.now(); }, onPackStored: () => fileUI.refresh() });
const mushroomUI = createMushroomUI({ toast, onUnlockRequest: () => showView('vault'), onActivity: () => { lastActive = Date.now(); } });
const coinUI = createDoodleverseCoinUI($('view-coin'), { toast, onUnlockRequest: () => showView('vault'), onActivity: () => { lastActive = Date.now(); recipientUI?.stop(); }, onSourceProof: proof => recipientUI?.setSourceProof(proof) });
const recipientPanel = document.createElement('section');
$('view-coin').append(recipientPanel);
recipientUI = createDoodleverseRecipientUI(recipientPanel, { toast, onUnlockRequest: () => showView('vault'), onActivity: () => { lastActive = Date.now(); coinUI.stop(); } });
createVpnUI();
for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => showView(button.dataset.view));
function showLocked() {
  $('onboarding').hidden = false; $('workspace').hidden = true; $('lock').hidden = true; $('lock-top').hidden = true;
  const restoring = Boolean(pendingBackup), exists = Boolean(savedRaw) && !restoring;
  $('username-label').hidden = exists || restoring; $('username').required = !(exists || restoring);
  $('confirm-label').hidden = exists || restoring; $('confirm-password').required = !(exists || restoring);
  $('password').minLength = exists || restoring ? 1 : 12;
  $('password').autocomplete = exists || restoring ? 'current-password' : 'new-password';
  $('password').placeholder = exists || restoring ? 'Your vault password' : 'At least 12 characters';
  $('identity-submit').textContent = restoring ? 'Unlock & restore backup ↗' : exists ? 'Welcome back. Unlock your vault ↗' : 'Create my keeper ↗';
  $('welcome-title').textContent = restoring ? 'Bring your story home.' : exists ? 'Your story is waiting.' : 'Every story needs a keeper.';
  $('welcome-copy').textContent = restoring ? 'Enter the password used for this backup. Its signatures and history will be checked before it replaces anything.' : exists ? 'Unlock your encrypted vault to pick up where you left off. Your password stays on this device.' : 'Choose a name and a password. Your writing stays in an encrypted vault in this browser, on this device.';
  $('restore-caption').hidden = !restoring; $('cancel-restore').hidden = !restoring;
  $('side-identity').textContent = 'Your story starts with you.'; $('nav-count').textContent = '0';
  try { $('recover-tab').hidden = !sessionStorage.getItem(RECOVERY); $('recovery-caption').hidden = $('recover-tab').hidden; } catch {}
  if (!storageAvailable) { $('identity-error').textContent = 'Browser storage is unavailable. Open this address in a regular browser window with storage enabled.'; $('identity-submit').disabled = true; }
}
function draftFromForm() {
  return { title: $('entry-title').value, body: $('entry-body').value, kind: $('entry-kind').value, revisionOf: vault?.draft.revisionOf ?? null };
}
async function persist() {
  const thisGeneration = generation;
  const job = queue.catch(() => {}).then(async () => {
    if (!vault || thisGeneration !== generation) return;
    const savingChange = changeId;
    const envelope = await encryptVault(structuredClone(vault), key, salt);
    const serialized = JSON.stringify(envelope);
    if (!vault || thisGeneration !== generation) return;
    if (!navigator.locks) throw new Error('This browser cannot safely coordinate vault saves. Use a current Chrome, Edge, or Firefox.');
    await navigator.locks.request('doodletick-vault-write', async () => {
      if (!vault || thisGeneration !== generation) return;
      if (localStorage.getItem(STORAGE) !== savedRaw) { await preserveTabAndLock(); throw new Error('The vault changed in another tab. Save this tab’s recovery backup, then unlock the latest copy.'); }
      try { localStorage.setItem(STORAGE, serialized); } catch { throw new Error('The browser could not save this vault. Free browser storage or export a backup now.'); }
      savedRaw = serialized;
    });
    if (vault && savingChange === changeId) $('save-status').textContent = 'Encrypted & saved';
  });
  queue = job; return job;
}
async function flushDraft() { clearTimeout(saveTimer); if (vault) { vault.draft = draftFromForm(); await persist(); } }
function renderDraft() {
  if (!vault) return;
  $('entry-title').value = vault.draft.title; $('entry-body').value = vault.draft.body; $('entry-kind').value = vault.draft.kind;
  $('revision-note').hidden = !vault.draft.revisionOf;
  $('revision-note').textContent = vault.draft.revisionOf ? 'A new revision. Your earlier seal will stay in the trail.' : '';
  wordCount();
}
function wordCount() { const n = $('entry-body').value.trim().split(/\s+/u).filter(Boolean).length; $('word-count').textContent = `${n.toLocaleString()} ${n === 1 ? 'word' : 'words'}`; }
function renderEntries() {
  const list = $('entries'); list.replaceChildren();
  if (!vault) return;
  $('entry-count').textContent = vault.entries.length; $('nav-count').textContent = vault.entries.length;
  const search = $('search').value.toLocaleLowerCase();
  const entries = [...vault.entries].reverse().filter(e => (e.payload.title + '\n' + e.payload.body + '\n' + e.payload.kind).toLocaleLowerCase().includes(search));
  if (!entries.length) {
    const empty = document.createElement('div'); empty.className = 'empty-state';
    const art = document.createElement('span'); art.className = 'empty-art'; art.textContent = '✳';
    const title = document.createElement('strong'); title.textContent = search ? 'No matching thoughts.' : 'Nothing sealed. Yet.';
    const text = document.createElement('p'); text.textContent = search ? 'Try a different word or clear your search.' : 'Your first little mark is all it takes. Write something, then seal the moment.';
    empty.append(art, title, text); list.append(empty); return;
  }
  for (const entry of entries) {
    const button = document.createElement('button'); button.className = 'entry-row';
    const top = document.createElement('span'); top.className = 'entry-row-top';
    const title = document.createElement('strong'); title.textContent = entry.payload.title || 'An untitled thought';
    const dot = document.createElement('span'); dot.className = 'entry-dot'; dot.style.background = entry.proof.record.tick.color;
    top.append(title, dot);
    const text = document.createElement('p'); text.textContent = entry.payload.body.replace(/\s+/g, ' ').slice(0, 100);
    const meta = document.createElement('small'); meta.textContent = `${entry.payload.kind.toUpperCase()} · ${new Date(entry.proof.record.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${entry.witness ? 'WITNESSED' : 'SIGNED LOCALLY'}`;
    button.append(top, text, meta); button.addEventListener('click', () => openEntry(entry)); list.append(button);
  }
}
function showUnlocked() {
  $('onboarding').hidden = true; $('workspace').hidden = false; $('lock').hidden = false; $('lock-top').hidden = false;
  $('save-status').textContent = 'Encrypted & saved';
  $('greeting').textContent = 'A LITTLE SPACE FOR @' + vault.identity.username.toUpperCase();
  $('side-identity').textContent = '@' + vault.identity.username + ' · ' + vault.identity.fingerprint.slice(0, 12);
  $('password').value = ''; $('confirm-password').value = ''; $('username').value = ''; $('password').type = 'password'; $('show-password').textContent = 'Show';
  $('identity-error').textContent = ''; pendingBackup = null; renderDraft(); renderEntries(); lastActive = Date.now();
  mushroomUI.unlock(vault.identity);
  coinUI.unlock(vault.identity);
  recipientUI.unlock(vault.identity);
  fileUI.unlock(vault.identity, key).catch(error => toast(error.message));
  arcadeUI.unlock(vault.identity, key).catch(error => toast(error.message));
}
function clearSession() {
  mushroomUI.lock();
  coinUI.lock();
  recipientUI.lock();
  fileUI.lock();
  arcadeUI.lock();
  generation++; clearTimeout(saveTimer); vault = null; key = null; salt = null; selected = null;
  $('entry-dialog').close(); $('detail-body').textContent = ''; $('detail-title').textContent = ''; $('detail-meta').textContent = ''; $('detail-proof').textContent = ''; $('entries').replaceChildren();
  $('entry-title').value = ''; $('entry-body').value = ''; $('search').value = ''; $('password').value = ''; $('confirm-password').value = ''; $('username').value = ''; $('greeting').textContent = ''; $('revision-note').textContent = '';
  try { savedRaw = localStorage.getItem(STORAGE); } catch {}
  showLocked();
}
async function preserveTabAndLock() {
  if (!vault) return;
  const recovery = encryptVault(structuredClone(vault), key, salt);
  clearSession();
  try {
    const envelope = JSON.stringify(await recovery);
    try { sessionStorage.setItem(RECOVERY, envelope); } catch { download('doodletick-tab-recovery.vault.json', envelope); }
    if (!vault) showLocked();
  } catch { toast('Could not create a recovery copy. Restore your latest downloaded backup.'); }
}
async function withButton(button, action, report = toast) {
  if (busy) { toast('One moment—finishing the current save.'); return; }
  busy = true; button.disabled = true;
  try { await action(); } catch (error) { report(error.message || 'Something went wrong. Please try again.'); }
  finally { busy = false; button.disabled = false; }
}
$('identity-form').addEventListener('submit', e => {
  e.preventDefault();
  withButton($('identity-submit'), async () => {
    $('identity-error').textContent = '';
    const password = $('password').value;
    const sourceRaw = savedRaw, backupToRestore = pendingBackup;
    if (backupToRestore || sourceRaw) {
      const restored = await decryptVault(backupToRestore || JSON.parse(sourceRaw), password);
      if (localStorage.getItem(STORAGE) !== sourceRaw) throw new Error('The vault changed in another tab. Please try unlocking again.');
      if (backupToRestore && sourceRaw && !confirm('Replace the vault in this browser with this backup? Any newer work in the current vault will only be recoverable from a separate backup.')) return;
      ({ vault, key, salt } = restored);
      if (backupToRestore) { try { await persist(); } catch (error) { clearSession(); throw error; } }
    } else {
      if (password.length < 12) throw new Error('Choose a password with at least 12 characters.');
      if (password !== $('confirm-password').value) throw new Error('The passwords do not match.');
      const identity = await newIdentity($('username').value.trim());
      salt = b64(random(16)); key = await deriveKey(password, salt);
      if (localStorage.getItem(STORAGE) !== sourceRaw) { key = null; salt = null; throw new Error('A vault was created in another tab. Unlock that vault instead.'); }
      vault = { version: 1, identity, entries: [], draft: blank(), createdAt: new Date().toISOString() };
      try { await persist(); } catch (error) { clearSession(); throw error; }
    }
    showUnlocked(); toast('Your keeper is ready. This space is yours.');
  }, message => { $('identity-error').textContent = message; });
});
$('show-password').addEventListener('click', () => { const show = $('password').type === 'password'; $('password').type = show ? 'text' : 'password'; $('show-password').textContent = show ? 'Hide' : 'Show'; $('show-password').setAttribute('aria-label', show ? 'Hide password' : 'Show password'); });
for (const id of ['entry-title', 'entry-body', 'entry-kind']) $(id).addEventListener('input', () => {
  if (!vault) return;
  vault.draft = draftFromForm(); wordCount(); markDirty();
  clearTimeout(saveTimer); saveTimer = setTimeout(() => persist().catch(e => { $('save-status').textContent = 'Not saved — back up now'; toast(e.message); }), 450);
});
$('search').addEventListener('input', renderEntries);
$('lock').addEventListener('click', () => withButton($('lock'), async () => { await flushDraft(); clearSession(); toast('Vault locked. See you next tick.'); }));
$('lock-top').addEventListener('click', () => withButton($('lock-top'), async () => { await flushDraft(); clearSession(); toast('Vault locked. See you next tick.'); }));
async function requestWitness(entry) {
  try {
    const response = await fetch('/api/witness', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proof: entry.proof }), signal: AbortSignal.timeout(5000) });
    if (!response.ok) return false;
    const witness = await response.json();
    if (!await verifyWitness(witness, entry.proof.id)) return false;
    entry.witness = witness; return true;
  } catch { return false; }
}
$('seal').addEventListener('click', () => withButton($('seal'), async () => {
  if (!vault) return;
  if (!$('entry-body').value.trim()) throw new Error('Write a little something before sealing this moment.');
  const thisGeneration = generation;
  const fields = ['entry-title', 'entry-body', 'entry-kind', 'open-text'];
  fields.forEach(id => { $(id).disabled = true; });
  try {
    await flushDraft(); if (!vault || thisGeneration !== generation) return;
    const originalDraft = structuredClone(vault.draft);
    const payload = { ...originalDraft, title: originalDraft.title.trim() || 'An untitled thought' };
    const entry = await sealEntry(vault.identity, vault.entries, payload);
    if (!vault || thisGeneration !== generation) return;
    vault.entries.push(entry); vault.draft = blank(); markDirty();
    try { await persist(); } catch (error) { if (vault) { vault.entries.pop(); vault.draft = originalDraft; renderDraft(); } throw error; }
    if (!vault || thisGeneration !== generation) return;
    renderDraft(); renderEntries();
    const witnessed = await requestWitness(entry);
    if (!vault || thisGeneration !== generation) return;
    if (witnessed) { markDirty(); await persist(); renderEntries(); }
    toast(witnessed ? 'Moment sealed. Signature and local witness receipt saved.' : 'Moment sealed locally. You can request a witness receipt later.');
    await refreshWitness();
  } finally { fields.forEach(id => { $(id).disabled = false; }); }
}));
async function openEntry(entry) {
  if (!vault || busy) return;
  selected = entry;
  $('detail-kind').textContent = entry.payload.kind.toUpperCase() + ' / SEAL ' + String(entry.proof.record.sequence).padStart(3, '0');
  $('detail-title').textContent = entry.payload.title;
  $('detail-meta').textContent = new Date(entry.proof.record.createdAt).toLocaleString() + ' · ' + entry.proof.record.tick.color;
  $('detail-body').textContent = entry.payload.body;
  $('detail-proof').textContent = 'Checking signature…';
  $('retry-witness').hidden = Boolean(entry.witness);
  $('entry-dialog').showModal();
  const valid = await verifyEntry(entry);
  if (selected !== entry || !vault) return;
  $('detail-proof').textContent = `${valid ? '✓ Signature & content verified' : '✕ Verification failed'} · ${entry.witness ? 'Local witness receipt attached' : 'Signed on this device'}\nCreator: ${entry.proof.record.author}\nSeal: ${entry.proof.id}`;
}
$('close-entry').addEventListener('click', () => $('entry-dialog').close());
function download(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const filename = title => title.normalize('NFKC').replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 55).replace(/^-+|-+$/g, '') || 'doodle';
$('export-text').addEventListener('click', () => { if (selected && vault) download(filename(selected.payload.title) + '.txt', selected.payload.body, 'text/plain;charset=utf-8'); });
$('export-receipt').addEventListener('click', () => { if (selected && vault) download(filename(selected.payload.title) + '.doodletick-receipt.json', JSON.stringify(receiptFor(selected), null, 2)); });
$('revise').addEventListener('click', () => withButton($('revise'), async () => {
  if (!selected || !vault) return;
  if (($('entry-body').value || $('entry-title').value) && !confirm('Replace your current draft with a revision of this sealed entry? Your sealed entries will stay in the trail.')) return;
  vault.draft = { ...selected.payload, revisionOf: selected.proof.id }; markDirty(); renderDraft(); await persist(); $('entry-dialog').close(); $('entry-title').focus();
}));
$('retry-witness').addEventListener('click', () => withButton($('retry-witness'), async () => {
  const entry = selected; const thisGeneration = generation;
  if (!entry || !vault) return;
  if (!await requestWitness(entry)) throw new Error('The local witness is unavailable. Your signed entry is safe.');
  if (!vault || thisGeneration !== generation) return;
  markDirty(); await persist(); renderEntries(); $('entry-dialog').close(); busy = false; await openEntry(entry); toast('Local witness receipt saved.');
}));
$('backup').addEventListener('click', () => withButton($('backup'), async () => {
  if (!vault) return;
  clearTimeout(saveTimer); vault.draft = draftFromForm();
  // Export directly from memory, so backup still works if browser storage is full.
  const envelope = await encryptVault(structuredClone(vault), key, salt);
  download('doodletick-' + filename(vault.identity.username) + '-' + new Date().toISOString().slice(0, 10) + '.vault.json', JSON.stringify(envelope));
  try { await persist(); } catch (error) { toast('Backup downloaded. ' + error.message); return; }
  toast('Encrypted backup downloaded. Keep it with your password stored separately.');
}));
$('restore').addEventListener('click', () => $('backup-file').click());
$('backup-file').addEventListener('change', async e => {
  try {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > MAX_BACKUP) throw new Error('That backup is too large for this Keeper.');
    const envelope = JSON.parse(await file.text()); validateEnvelope(envelope); pendingBackup = envelope;
    $('password').value = ''; $('identity-error').textContent = ''; $('restore-caption').textContent = 'Selected: ' + file.name; showLocked(); $('password').focus();
  } catch (error) { $('identity-error').textContent = error.message; }
  finally { e.target.value = ''; }
});
$('cancel-restore').addEventListener('click', () => { pendingBackup = null; $('password').value = ''; $('identity-error').textContent = ''; showLocked(); });
$('recover-tab').addEventListener('click', () => { const recovered = sessionStorage.getItem(RECOVERY); if (recovered) { download('doodletick-tab-recovery.vault.json', recovered); toast('Recovery backup downloaded. Restore it with the password you used in this tab.'); } });
$('open-text').addEventListener('click', () => { if (!busy) $('text-file').click(); });
$('text-file').addEventListener('change', e => withButton($('open-text'), async () => {
  const file = e.target.files[0]; e.target.value = ''; if (!file || !vault) return;
  if (file.size > MAX_TEXT * 4) throw new Error('Choose a text file smaller than 1 MB.');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
  if (text.length > MAX_TEXT) throw new Error('Choose a file with fewer than 250,000 characters.');
  if (($('entry-body').value || $('entry-title').value) && !confirm('Replace the current draft with this file? The original file will stay unchanged.')) return;
  vault.draft = { title: file.name.replace(/\.[^.]+$/, '').slice(0, 140), body: text, kind: 'Note', revisionOf: null }; markDirty(); renderDraft(); await persist(); toast('File opened as a draft. Export a text copy after sealing your edits.');
}));
$('verify-button').addEventListener('click', () => withButton($('verify-button'), async () => {
  const result = $('verify-result'); result.hidden = false; result.classList.remove('bad'); result.textContent = 'Checking signatures…';
  try {
    const file = $('receipt-file').files[0]; if (!file) throw new Error('Choose a receipt file first.');
    if (file.size > 100000) throw new Error('That receipt is too large.');
    const receipt = JSON.parse(await file.text());
    if (receipt.record?.format === GARDEN_FORMAT) {
      const r = receipt.record;
      if (r.kind !== 'receipt' || !await verifyGardenResponse(receipt, r.issuer)) throw new Error('The garden receipt signature does not match.');
      result.textContent = `✓ Garden Keeper signature verified.\nAction: ${r.result.action} · ${new Date(r.time).toLocaleString()}\n${r.result.amount ? 'Amount: ' + r.result.amount + ' Doodle Coins\n' : ''}Keeper: ${r.issuer}\nPlayer: ${r.owner}\nThis proves that this Keeper signed the action; it does not establish a current balance or cash value. Trust the Keeper identity separately.`;
      return;
    }
    const original = $('original-file').files[0];
    if (original && original.size > MAX_TEXT * 4) throw new Error('That text file is too large.');
    const verified = await verifyReceipt(receipt, original ? new TextDecoder('utf-8', { fatal: true }).decode(await original.arrayBuffer()) : undefined);
    result.classList.toggle('bad', verified.contentMatches === false);
    result.textContent = `${verified.contentMatches === false ? '✕ The text does not match this seal.' : verified.contentMatches ? '✓ Exact text match. Signature verified.' : '✓ Signature verified. Text not checked.'}\n${verified.witness ? 'Witness signature is valid. Trust its identity separately; a local witness is not an independent time authority.' : 'No witness receipt is attached.'}\nCreator fingerprint: ${verified.fingerprint}\n${verified.contentMatches === null ? 'Add the original text to check the content and disclosed title.' : 'A match establishes integrity, not original authorship or ownership.'}`;
  } catch (error) { result.classList.add('bad'); result.textContent = '✕ ' + error.message; }
}));
const drawClock = createClockWheel($('color-clock'));
const BLACK_FOCUS = 'doodletick-tetrachroma-black-v1';
let blackFocus = 0;
try {
  const savedFocus = localStorage.getItem(BLACK_FOCUS);
  if (/^\d{1,3}$/.test(savedFocus ?? '') && Number(savedFocus) <= 255) blackFocus = Number(savedFocus);
} catch { $('tetra-save').textContent = 'Black focus lasts for this visit; browser storage is unavailable.'; }
function renderTetrachroma(tick = tickAt()) {
  const color = tetrachromaColor(tick.color, blackFocus), pair = color.value.slice(-2);
  $('tick-rgb').textContent = color.rgb; $('tick-black').textContent = pair;
  $('tick-color').title = `Tetrachroma ${color.value} · RGB preview ${color.preview}`;
  $('color-swatch').style.background = color.preview;
  $('black-focus').value = String(blackFocus); $('black-byte').value = pair;
  $('black-percent').textContent = Math.round(blackFocus / 255 * 100) + '%';
  $('black-focus').setAttribute('aria-valuetext', `${blackFocus} of 255; hex ${pair}; ${$('black-percent').textContent} black`);
  $('black-focus').style.setProperty('--focus-rgb', color.rgb);
  drawClock(Date.now(), blackFocus);
}
function setBlackFocus(value) {
  blackFocus = value;
  $('black-byte').removeAttribute('aria-invalid'); $('black-error').textContent = '';
  renderTetrachroma();
  try { localStorage.setItem(BLACK_FOCUS, String(value)); $('tetra-save').textContent = 'Your black focus is saved on this device.'; }
  catch { $('tetra-save').textContent = 'Black focus lasts for this visit; browser storage is unavailable.'; }
}
$('black-focus').addEventListener('input', () => setBlackFocus(Number($('black-focus').value)));
$('black-byte').addEventListener('input', () => {
  const pair = $('black-byte').value;
  if (/^[0-9a-f]{2}$/i.test(pair)) setBlackFocus(parseInt(pair, 16));
  else { $('black-byte').setAttribute('aria-invalid', 'true'); $('black-error').textContent = 'Enter two hex digits, from 00 to FF.'; }
});
$('black-byte').addEventListener('keydown', event => { if (event.key === 'Escape') { $('black-byte').value = blackFocus.toString(16).padStart(2, '0').toUpperCase(); $('black-byte').removeAttribute('aria-invalid'); $('black-error').textContent = ''; } });
$('reset-black').addEventListener('click', () => setBlackFocus(0));
$('copy-tetrachroma').addEventListener('click', async () => {
  const color = tetrachromaColor(tickAt().color, blackFocus);
  try { await navigator.clipboard.writeText('tetrachroma:' + color.value); toast('Copied tetrachroma:' + color.value); }
  catch { toast('Clipboard unavailable. Copy tetrachroma:' + color.value); }
});
let currentTick = -1;
function updateTick() {
  const now = Date.now(), tick = tickAt(now);
  const seconds = Math.max(0, Math.ceil((3600000 - ((now - EPOCH) % 3600000)) / 1000));
  $('next-tick').textContent = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
  drawClock(now, blackFocus);
  if (tick.index === currentTick) return;
  currentTick = tick.index; document.documentElement.style.setProperty('--tick', tick.color); renderTetrachroma(tick);
  $('tick-number').textContent = 'TICK ' + String(tick.index).padStart(6, '0'); $('palette-label').textContent = 'CHAPTER ' + String(tick.cycle + 1).padStart(2, '0') + ' · ALL 16,777,216 HEX COLORS';
}
async function refreshWitness() {
  try { const res = await fetch('/api/status', { signal: AbortSignal.timeout(3000) }); if (!res.ok) throw new Error(); const status = await res.json(); $('witness-status').textContent = '● Local witness online'; $('witness-status').title = `${status.receipts} receipts · ${status.fingerprint}`; }
  catch { $('witness-status').textContent = '○ Witness unavailable'; }
}
window.addEventListener('storage', event => { if (event.key === STORAGE || event.key === null) { if (vault) { preserveTabAndLock().then(() => toast('Vault updated in another tab. A recovery backup preserves this tab’s work.')); } else { savedRaw = localStorage.getItem(STORAGE); showLocked(); } } });
for (const event of ['pointerdown', 'keydown', 'input']) document.addEventListener(event, () => { lastActive = Date.now(); }, { passive: true });
setInterval(async () => { if (vault && !busy && Date.now() - lastActive >= 600000) { busy = true; try { await flushDraft(); clearSession(); toast('Vault locked after 10 minutes of inactivity.'); } catch (error) { toast('Could not auto-lock: ' + error.message); lastActive = Date.now(); } finally { busy = false; } } }, 10000);
document.addEventListener('visibilitychange', () => { if (document.hidden && vault && !busy) flushDraft().catch(error => { $('save-status').textContent = 'Not saved — back up now'; toast(error.message); }); });
window.addEventListener('beforeunload', event => { if (vault && (busy || $('save-status').textContent !== 'Encrypted & saved')) { event.preventDefault(); event.returnValue = ''; } });
if (!crypto.subtle || !navigator.locks) { $('identity-error').textContent = 'Open the Keeper through its local address in a current Chrome, Edge, or Firefox browser.'; $('identity-submit').disabled = true; }
showLocked(); updateTick(); refreshWitness(); setInterval(updateTick, 1000); setInterval(refreshWitness, 60000);
showView(location.hash.slice(1) || 'arcade');
window.addEventListener('hashchange', () => showView(location.hash.slice(1)));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.mjs', { type: 'module' }).catch(() => {});
