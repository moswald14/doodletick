import { LICENSES, createManifest, verifyFile, canUse, adaptationLicenses, attributionText, MAX_FILE, safeName } from './licenses.mjs';
import { FileStore, LIBRARY_LIMIT } from './file-store.mjs';
import { PeerLink } from './peers.mjs';
import { zip, unzip } from './archive.mjs';
const $ = id => document.getElementById(id), dec = new TextDecoder('utf-8', { fatal: true });
const size = bytes => bytes < 1024 ? bytes + ' B' : bytes < 1048576 ? (bytes / 1024).toFixed(1) + ' KiB' : (bytes / 1048576).toFixed(1) + ' MiB';
const node = (tag, text, cls) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; return el; };
function download(name, blob) { const url = URL.createObjectURL(blob), a = node('a'); a.download = name; a.href = url; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 3000); }
export function createFilesUI({ toast, onUnlockRequest, onActivity }) {
  let identity = null, store = null, entries = [], selected = null, parent = null, generation = 0, refreshing = 0, peers = [], pendingOffer = null, renderTimer, sent = 0, received = 0;
  const active = () => { if (!store || !identity) throw new Error('Unlock your vault first.'); return store; };
  const run = async (button, fn) => { if (button.disabled) return; button.disabled = true; try { await fn(); } catch (error) { toast(error.message || 'This action could not be completed.'); } finally { button.disabled = false; } };
  const broadcast = () => { for (const peer of peers) peer.broadcast().catch(e => toast(e.message)); };
  function updateStats() { $('p2p-sent').textContent = size(sent); $('p2p-received').textContent = size(received); $('peer-count').textContent = peers.filter(p => p.channel?.readyState === 'open').length; }
  async function refresh() {
    if (!store) return;
    const current = generation, order = ++refreshing, library = store;
    const list = await library.list(); if (current !== generation || order !== refreshing) return;
    entries = list; $('stored-files').textContent = `${list.length} ${list.length === 1 ? 'file' : 'files'} · ${size(list.reduce((n, e) => n + e.bytes, 0))} / 100 MiB`;
    const container = $('file-list'); container.replaceChildren();
    const query = $('file-search').value.toLowerCase(), shown = list.filter(e => (e.manifest.record.credits.title + ' ' + e.manifest.record.file.name).toLowerCase().includes(query));
    if (!shown.length) { container.append(node('div', list.length ? 'No files match your search.' : 'Your browser is a tiny library. Add a file, or keep one from a connected peer.', 'files-empty')); }
    for (const item of shown) {
      const r = item.manifest.record, button = node('button', undefined, 'stored-file'); button.dataset.fileId = item.id;
      const icon = node('span', r.file.mime.startsWith('image/') ? '▧' : '◇', 'file-symbol');
      const info = node('div'); info.append(node('strong', r.credits.title), node('span', `${r.file.name} · ${size(r.file.size)}`), node('small', `${LICENSES[r.license].label} · ${item.shared ? 'Available to connected peers' : 'Not being shared'}`));
      button.append(icon, info, node('span', '↗')); button.addEventListener('click', () => inspect(item)); container.append(button);
    }
    const estimate = await navigator.storage?.estimate?.().catch(() => null);
    if (current === generation && estimate) $('browser-storage').textContent = `Browser estimate: ${size(estimate.usage || 0)} used of ${size(estimate.quota || 0)} available to this site. Backups still matter.`;
  }
  function schedulePeers() { clearTimeout(renderTimer); renderTimer = setTimeout(renderPeers, 100); updateStats(); }
  function renderPeers() {
    const root = $('peer-list'); root.replaceChildren(); if (!identity) return;
    const visible = peers.filter(p => !p.closed);
    if (!visible.length) root.append(node('div', 'No peers connected. Exchange connection codes to open a direct link.', 'files-empty'));
    for (const peer of visible) {
      const card = node('article', undefined, 'peer-card'), top = node('div', undefined, 'peer-card-top');
      const title = node('div'); title.append(node('strong', peer.remote ? '@' + peer.remote.username : 'Your invitation'), node('span', peer.state));
      const stop = node('button', 'Disconnect', 'text-button'); stop.addEventListener('click', () => { peer.close(); if (pendingOffer === peer) pendingOffer = null; renderPeers(); });
      top.append(title, stop); card.append(top);
      if (peer.remote) { const details = node('details'), summary = node('summary', 'Compare creator fingerprint'); details.append(summary, node('p', peer.remote.fingerprint, 'fingerprint')); card.append(details); }
      if (peer.waiting) card.append(node('p', `Receiving ${size(peer.incoming?.received || 0)}${peer.incoming ? ' / ' + size(peer.incoming.manifest.record.file.size) : '…'}`, 'transfer-progress'));
      for (const manifest of peer.catalog.values()) {
        const r = manifest.record, row = node('div', undefined, 'peer-file'), info = node('div');
        info.append(node('strong', r.credits.title), node('span', `${r.credits.creator} · ${LICENSES[r.license].label} · ${size(r.file.size)}`));
        const get = node('button', entries.some(e => e.id === manifest.id) ? 'Keep again' : 'Keep file', 'button quiet');
        get.disabled = Boolean(peer.waiting) || !canUse(manifest, $('planned-use').value); get.title = get.disabled && !peer.waiting ? 'This NonCommercial license does not permit the selected use.' : 'Save a verified, encrypted local copy';
        get.addEventListener('click', () => { try { peer.request(manifest.id, $('planned-use').value, $('help-share').checked); schedulePeers(); } catch (error) { toast(error.message); } });
        const licenseLink = node('a', 'License ↗'); licenseLink.href = LICENSES[r.license].url; licenseLink.target = '_blank'; licenseLink.rel = 'noopener noreferrer';
        info.append(licenseLink); row.append(info, get); card.append(row);
      }
      if (peer.auth?.verified && peer.channel?.readyState === 'open' && !peer.catalog.size) card.append(node('p', 'This peer has not made any files available.', 'fine-print'));
      if (peer.copies.size) card.append(node('p', `This peer reports keeping ${peer.copies.size} of your offered files. This is not a durability guarantee.`, 'fine-print'));
      root.append(card);
    }
    updateStats();
  }
  function addPeer() {
    active(); if (peers.filter(p => !p.closed).length >= 4) throw new Error('This edition supports four direct peers at a time. Disconnect one first.');
    const current = generation;
    const peer = new PeerLink({ identity, store, onChange: () => { if (generation === current) schedulePeers(); }, onError: message => { if (generation === current) toast(message); }, onActivity, onBytes: (direction, bytes) => { if (generation !== current) return; direction === 'sent' ? sent += bytes : received += bytes; updateStats(); }, onStored: async () => { if (generation !== current) return; toast('File verified and stored in your encrypted library.'); try { await refresh(); broadcast(); } catch (error) { toast(error.message); } } });
    peers.push(peer); return peer;
  }
  function licenseOptions(source = null) {
    const select = $('file-license'); select.replaceChildren(new Option('Choose a license…', ''));
    for (const id of adaptationLicenses(source)) select.add(new Option(LICENSES[id].label, id));
    if (source && LICENSES[source.record.license].sa) select.value = source.record.license;
    updateLicense();
  }
  function updateLicense() {
    const license = LICENSES[$('file-license').value], target = $('license-explanation');
    if (!license) { target.textContent = 'Choose the permissions you want to grant. Sharing a licensed copy grants lasting permissions; stopping your own sharing does not revoke them.'; $('license-link').hidden = true; return; }
    target.textContent = license.id === 'CC0-1.0' ? 'Dedicate the work to the public domain to the extent allowed by law. Attribution is not required by CC0.' : `Credit and a license link must travel with the work.${license.nc ? ' Commercial use is not granted.' : ' Commercial use is allowed.'}${license.nd ? ' Adapted versions may not be shared under this license.' : license.sa ? ' Shared adaptations must keep the same or a CC-designated compatible license.' : ' Adaptations are allowed; source attribution remains.'}`;
    $('license-link').href = license.url; $('license-link').textContent = 'Read ' + license.label + ' ↗'; $('license-link').hidden = false;
  }
  function openAdd(source = null) {
    active(); parent = source; $('file-form').reset(); $('file-creator').value = identity.username; $('file-form-error').textContent = '';
    $('file-form-heading').textContent = source ? 'Carry the story forward.' : 'Add a little to the library.';
    $('file-parent').hidden = !source; $('file-parent').textContent = source ? `Adaptation of “${source.record.credits.title}”. Its signed credits and source license will stay attached.` : '';
    $('file-changes').required = Boolean(source); licenseOptions(source); $('file-editor-dialog').showModal();
  }
  function inspect(item) {
    selected = item; const r = item.manifest.record;
    $('file-detail-title').textContent = r.credits.title; $('file-detail-summary').textContent = `${r.file.name} · ${size(r.file.size)} · ${LICENSES[r.license].label}`;
    $('file-credit').textContent = attributionText(item.manifest); $('toggle-file-share').textContent = item.shared ? 'Stop sharing this copy' : 'Make available to peers';
    $('adapt-file').disabled = !adaptationLicenses(item.manifest).length; $('nd-note').hidden = !LICENSES[r.license].nd;
    $('file-detail-dialog').showModal();
  }
  $('open-files-vault').addEventListener('click', onUnlockRequest);
  $('add-file').addEventListener('click', () => { try { openAdd(); } catch (e) { toast(e.message); } });
  $('file-license').addEventListener('change', updateLicense);
  $('close-file-editor').addEventListener('click', () => $('file-editor-dialog').close()); $('close-file-detail').addEventListener('click', () => $('file-detail-dialog').close());
  $('new-file').addEventListener('change', () => { if (!$('file-title').value && $('new-file').files[0]) $('file-title').value = $('new-file').files[0].name.slice(0, 140); });
  $('file-form').addEventListener('submit', event => { event.preventDefault(); run($('save-file'), async () => {
    const library = active(), current = generation, signer = identity, source = parent, file = $('new-file').files[0];
    if (!file || file.size > MAX_FILE) throw new Error('Choose a file up to 20 MiB.');
    if (!$('license-rights').checked || !LICENSES[$('file-license').value]) throw new Error('Choose a license and confirm you have permission to grant it.');
    const credits = { title: $('file-title').value, creator: $('file-creator').value, source: $('file-source').value, notices: $('file-notices').value, changes: $('file-changes').value };
    const license = $('file-license').value, shared = $('publish-file').checked, data = await file.arrayBuffer();
    const manifest = await createManifest(signer, data, file, credits, license, source); if (current !== generation) throw new Error('Vault locked. Unlock and try again.');
    await library.put(manifest, data, shared); if (current !== generation) return;
    $('file-editor-dialog').close(); await refresh(); broadcast(); toast(shared ? 'File stored. Its signed license is now available to connected peers.' : 'File stored and encrypted. Sharing is off until you choose it.');
  }).catch(e => toast(e.message)); });
  $('file-search').addEventListener('input', () => refresh().catch(e => toast(e.message)));
  $('download-file').addEventListener('click', () => run($('download-file'), async () => {
    const item = await active().get(selected.id); if (!canUse(item.manifest, $('planned-use').value)) throw new Error('This file has a NonCommercial condition. Select a permitted use, or obtain separate permission.');
    const archive = zip([['files/' + safeName(item.manifest.record.file.name), item.data], ['ATTRIBUTION.txt', attributionText(item.manifest)], ['doodletick.json', JSON.stringify(item.manifest, null, 2)]]);
    download(safeName(item.manifest.record.file.name) + '.licensed.zip', archive); toast('File, attribution, and signed license downloaded together.');
  }));
  $('copy-file-credit').addEventListener('click', () => run($('copy-file-credit'), async () => { await navigator.clipboard.writeText(attributionText(selected.manifest)); toast('Credit and license links copied.'); }));
  $('toggle-file-share').addEventListener('click', () => run($('toggle-file-share'), async () => {
    const id = selected.id, shared = !selected.shared; await active().setShared(id, shared); await refresh(); broadcast(); selected = entries.find(e => e.id === id); if (selected) $('toggle-file-share').textContent = selected.shared ? 'Stop sharing this copy' : 'Make available to peers';
    toast(shared ? 'Available to connected peers while this Keeper stays unlocked.' : 'This copy is no longer offered. Existing recipients keep their licensed copies.');
  }));
  $('adapt-file').addEventListener('click', () => { try { const source = selected.manifest; if (!adaptationLicenses(source).length) throw new Error('Sharing adaptations is not offered for NoDerivatives files.'); $('file-detail-dialog').close(); openAdd(source); } catch (e) { toast(e.message); } });
  $('remove-file').addEventListener('click', () => run($('remove-file'), async () => { if (!confirm('Remove this encrypted local file copy? Download a backup first if you need it. Other peers keep their copies and licenses.')) return; await active().remove(selected.id); $('file-detail-dialog').close(); selected = null; await refresh(); broadcast(); toast('Local file copy removed.'); }));
  $('backup-files').addEventListener('click', () => run($('backup-files'), async () => { const archive = await active().backup(); download('doodletick-files-encrypted.zip', archive); toast('Encrypted file backup downloaded. Keep your identity vault backup too.'); }));
  $('import-bundle').addEventListener('click', () => $('bundle-input').click());
  $('bundle-input').addEventListener('change', event => run($('import-bundle'), async () => {
    const file = event.target.files[0]; event.target.value = ''; if (!file) return; const library = active();
    if (file.size > LIBRARY_LIMIT + 5 * 1024 * 1024) throw new Error('That bundle is too large.');
    const buffer = await file.arrayBuffer(), parts = unzip(buffer);
    if (parts.has('index.json')) { const count = await library.restore(buffer); toast(`Restored ${count} encrypted file copies. Sharing is off.`); }
    else {
      const manifestBytes = parts.get('doodletick.json'); if (!manifestBytes || manifestBytes.length > 24000 || parts.size !== 3) throw new Error('Choose a licensed bundle or encrypted file backup exported by Doodle Tick.');
      const manifest = JSON.parse(dec.decode(manifestBytes)), bytes = parts.get('files/' + safeName(manifest.record.file.name));
      if (!bytes || !parts.has('ATTRIBUTION.txt') || !await verifyFile(manifest, bytes)) throw new Error('The file or its signed license has changed. Nothing was imported.');
      if (!canUse(manifest, $('planned-use').value)) throw new Error('NonCommercial license: the selected commercial use is not permitted.');
      await library.put(manifest, bytes, false); toast('Licensed file verified and stored. Original attribution preserved.');
    }
    await refresh(); broadcast();
  }));
  $('persist-files').addEventListener('click', () => run($('persist-files'), async () => {
    active(); const granted = await navigator.storage?.persist?.(); $('persistence-state').textContent = granted ? 'Persistent storage granted by this browser. Keep backups for loss or manual deletion.' : 'The browser did not grant persistent storage. It may remove files under storage pressure; keep backups.';
  }));
  $('create-invite').addEventListener('click', () => run($('create-invite'), async () => {
    if (pendingOffer && !pendingOffer.closed && pendingOffer.channel?.readyState !== 'open') pendingOffer.close();
    const peer = addPeer(); pendingOffer = peer; $('pair-output').value = 'Preparing direct connection…';
    try { const code = await peer.offer(); if (peer.closed) return; $('pair-output').value = code; $('pair-instructions').textContent = '1. Send this invitation code to your peer. 2. They choose Answer invitation and send their answer back. 3. Paste that answer here and choose Finish pairing.'; } catch (error) { peer.close(); throw error; }
  }));
  $('answer-invite').addEventListener('click', () => run($('answer-invite'), async () => {
    const input = $('pair-input').value; if (!input.trim()) throw new Error('Paste the other person’s invitation code first.');
    const peer = addPeer(); $('pair-output').value = 'Preparing your answer…';
    try { const code = await peer.answer(input); if (peer.closed) return; $('pair-output').value = code; $('pair-instructions').textContent = 'Send this answer code back to the person who invited you. They paste it and choose Finish pairing. Keep this tab open.'; } catch (error) { peer.close(); throw error; }
  }));
  $('finish-pair').addEventListener('click', () => run($('finish-pair'), async () => { if (!pendingOffer) throw new Error('Create an invitation first, then paste the answer to that invitation.'); await pendingOffer.finish($('pair-input').value); $('pair-instructions').textContent = 'Connecting. Compare fingerprints with your peer before requesting files.'; }));
  $('copy-pair').addEventListener('click', () => run($('copy-pair'), async () => { if (!$('pair-output').value.startsWith('{')) throw new Error('Create a connection code first.'); await navigator.clipboard.writeText($('pair-output').value); toast('Connection code copied. Send it through a channel you trust.'); }));
  $('planned-use').addEventListener('change', renderPeers);
  $('disconnect-all').addEventListener('click', () => { peers.forEach(p => p.close()); pendingOffer = null; $('pair-input').value = ''; $('pair-output').value = ''; renderPeers(); });
  return {
    async refresh() { if (store) { await refresh(); broadcast(); renderPeers(); } },
    async unlock(nextIdentity, nextKey) {
      this.lock(); identity = nextIdentity; store = new FileStore(identity, nextKey); $('files-locked').hidden = true; $('files-workspace').hidden = false;
      $('my-peer-fingerprint').textContent = identity.fingerprint; await refresh(); renderPeers();
    },
    lock() {
      generation++; peers.forEach(peer => peer.close()); peers = []; pendingOffer = null; store?.close(); store = null; identity = null; entries = []; selected = null; parent = null;
      clearTimeout(renderTimer); $('files-locked').hidden = false; $('files-workspace').hidden = true;
      $('file-editor-dialog').close(); $('file-detail-dialog').close(); $('file-form').reset(); $('file-credit').textContent = ''; $('file-detail-title').textContent = ''; $('file-detail-summary').textContent = ''; $('file-parent').textContent = '';
      $('file-list').replaceChildren(); $('peer-list').replaceChildren(); $('pair-input').value = ''; $('pair-output').value = ''; $('my-peer-fingerprint').textContent = ''; $('file-search').value = ''; $('bundle-input').value = ''; updateStats();
    }
  };
}
