// SPDX-License-Identifier: GPL-3.0-only
import { normalizePhrase, wordCount, createEnumerator, createAttestedIndex, assessPhrase, createPhraseBatch } from './phrase-core.mjs';
import { openPhraseStore, MAX_WAITING, MAX_STORED } from './phrase-store.mjs';

const pauseForUI = () => new Promise(resolve => setTimeout(resolve, 0));
const shortNumber = value => { const s = String(value); return s.length > 16 ? `${s[0]}.${s.slice(1, 4)} × 10^${s.length - 1}` : Number(s).toLocaleString(); };
const digest = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(n => n.toString(16).padStart(2, '0')).join('');
const download = (name, data, type) => {
  const url = URL.createObjectURL(new Blob([data], { type })), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export function createPhraseLabUI(container, { postBatch, onUnlockRequest, onActivity = () => {} } = {}) {
  container.innerHTML = `
    <div class="eyebrow">WORDS / MEANINGS / A SAVED TRAIL</div>
    <div class="phrase-heading"><h1>Find a little<br><em>meaning.</em></h1><span class="phrase-badge">PHRASE LAB</span></div>
    <p class="phrase-intro">Search one to eight words, with repeats allowed. Keep dictionary-backed matches in a pile, then seal them into your Keeper in batches.</p>
    <p class="phrase-disclosure">Your pile and progress are saved <strong>unencrypted in this browser</strong>. Posted batches use your encrypted Keeper vault. A dictionary entry is evidence of usage; it does not establish truth, authorship or a new sentence’s meaning.</p>
    <div class="phrase-grid">
      <section class="phrase-card" aria-label="Search settings"><span class="section-kicker">01 / THE SEARCH</span><h2>Pick up where you left off.</h2>
        <p data-field="dictionary">Open Phrase lab to load the bundled dictionary.</p>
        <label>Search order<select data-field="mode"><option value="attested">Known phrases first</option><option value="brute">Literal brute force</option></select></label>
        <div class="phrase-pair"><label>Shortest phrase<select data-field="min">${Array.from({length:8}, (_, i) => `<option>${i + 1}</option>`).join('')}</select></label><label>Longest phrase<select data-field="max">${Array.from({length:8}, (_, i) => `<option ${i===7?'selected':''}>${i + 1}</option>`).join('')}</select></label></div>
        <label class="phrase-check"><input type="checkbox" data-field="friendly" checked> Friendly mode</label>
        <p class="phrase-small">Friendly mode skips entries tagged as vulgar, offensive or derogatory and a conservative list of explicit words. Labels are incomplete; this is not a guarantee that every result suits every audience.</p>
        <label class="phrase-check"><input type="checkbox" data-field="autoqueue" checked> Put qualifying matches in the posting queue</label>
        <div class="phrase-actions"><button type="button" class="button primary" data-action="generate">Start / resume search</button><button type="button" class="button quiet" data-action="pause">Pause search</button></div>
        <p data-field="search-status" role="status">Paused. Nothing runs until you start it.</p>
        <p class="phrase-small" data-field="scope">Known phrases first checks recorded expressions before single words. Literal brute force visits every ordered combination and filters exact dictionary matches. It cannot finish a large dictionary in a practical lifetime and can miss meaningful new sentences.</p>
      </section>
      <section class="phrase-card" aria-label="Posting queue"><span class="section-kicker">02 / THE PILE</span><h2>Give the good ones a home.</h2>
        <div class="phrase-stats"><div><strong data-field="pile-count">0</strong><span>in the pile</span></div><div><strong data-field="queue-count">0</strong><span>queued</span></div><div><strong data-field="posted-count">0</strong><span>sealed phrases</span></div></div>
        <p data-field="vault-status">Unlock your Keeper to post. Searching does not need a vault.</p>
        <div class="phrase-actions"><button type="button" class="button quiet" data-action="queue">Queue qualifying pile</button><button type="button" class="button primary" data-action="post">Post queue to Keeper</button><button type="button" class="button quiet" data-action="stop-post">Pause posting</button></div>
        <button type="button" class="text-button" data-action="unlock">Open my vault ↗</button>
        <p data-field="post-status" role="status">Posting paused. Each seal contains up to 100 phrases with source links.</p>
        <p class="phrase-small">Closing, hiding or leaving this page pauses work. Reopening keeps your checkpoint and requires Start again. A locked or full vault leaves the queue saved. These are local signed notes; there is no public phrase feed in this Keeper.</p>
        <div class="phrase-actions"><button type="button" class="button quiet" data-action="export">Export pile & progress</button><button type="button" class="button quiet" data-action="text">Export phrase text</button></div>
        <p class="phrase-small">Up to ${MAX_WAITING.toLocaleString()} waiting phrases are kept at a time, with up to ${MAX_STORED.toLocaleString()} total retained phrases. Exports are readable snapshots; this version resumes in the same browser and does not import snapshots. Posted history is kept to prevent duplicates.</p>
      </section>
    </div>
    <section class="phrase-card phrase-results" aria-label="Saved phrases"><div class="phrase-result-top"><div><span class="section-kicker">03 / YOUR FINDS</span><h2>A pile of possibilities.</h2></div><label>Show<select data-field="tab"><option value="queued">Posting queue</option><option value="pile">Unqueued pile</option><option value="posted">Sealed phrases</option></select></label></div>
      <ol data-field="results"></ol><div class="phrase-actions"><button class="button quiet" type="button" data-action="previous">Previous page</button><span data-field="page">Page 1</span><button class="button quiet" type="button" data-action="next">Next page</button></div>
    </section><p class="phrase-source"><span data-field="credits"></span> <a href="./phrase-notices.txt" target="_blank" rel="noopener noreferrer">Source credits & licenses ↗</a></p>`;
  const field = name => container.querySelector(`[data-field="${name}"]`);
  const button = name => container.querySelector(`[data-action="${name}"]`);
  let visible = false, unlocked = false, loading = null, store, dictionary, attestations, index, knownWords, blockedWords, ordered;
  let generating = false, posting = false, page = 0, searchStop = false, postStop = false;
  const settings = () => ({ mode: field('mode').value, minWords: Number(field('min').value), maxWords: Number(field('max').value), friendly: field('friendly').checked, autoQueue: field('autoqueue').checked });
  const assess = text => {
    const result = assessPhrase(text, index, { friendly: field('friendly').checked, knownWords, blockedWords, knownWordSource: dictionary.source });
    if (result.accepted && !result.sources.length) result.sources = [dictionary.source];
    if (result.accepted && result.wordCount === 1 && Array.isArray(dictionary.sources)) result.sources = [...new Set([...result.sources, ...dictionary.sources.map(item => item.source)])];
    return result;
  };
  function controls() {
    const ready = !!store && !!dictionary && !!index;
    for (const name of ['generate','queue','export','text']) button(name).disabled = !ready || (name === 'generate' && generating);
    button('pause').disabled = !generating;
    button('post').disabled = !ready || !unlocked || posting;
    button('stop-post').disabled = !posting;
    button('unlock').hidden = unlocked;
    for (const name of ['mode','min','max','friendly','autoqueue']) field(name).disabled = generating || posting;
    field('vault-status').textContent = unlocked ? 'Keeper unlocked. Post adds signed notes while preserving your open draft.' : 'Unlock your Keeper to post. Searching does not need a vault.';
  }
  async function render() {
    controls();
    if (!store) return;
    const counts = await store.stats();
    field('pile-count').textContent = counts.pile.toLocaleString();
    field('queue-count').textContent = counts.queued.toLocaleString();
    field('posted-count').textContent = counts.posted.toLocaleString();
    const rows = await store.list(field('tab').value, 50, page * 50), list = field('results');
    list.replaceChildren();
    if (!rows.length) { const li = document.createElement('li'); li.textContent = 'No phrases on this page yet.'; list.append(li); }
    for (const row of rows) {
      const li = document.createElement('li'), text = document.createElement('span'); text.textContent = row.text;
      const source = document.createElement('a'); source.textContent = 'source ↗'; source.href = row.sources[0] || dictionary.source; source.target = '_blank'; source.rel = 'noopener noreferrer';
      if (row.status !== 'posted' && !assess(row.text).accepted) { const label = document.createElement('small'); label.textContent = 'Held by current filter'; li.append(label); }
      li.prepend(text); li.append(source); list.append(li);
    }
    field('page').textContent = `Page ${page + 1}`; button('previous').disabled = page === 0; button('next').disabled = rows.length < 50;
  }
  async function load() {
    if (loading) return loading;
    loading = (async () => {
      field('dictionary').textContent = 'Loading the bundled dictionary. This may take a moment…';
      const fetchJSON = async name => { const response = await fetch('./' + name); if (!response.ok) throw new Error('The dictionary file is unavailable. Reinstall the complete Keeper package.'); return response.json(); };
      [dictionary, attestations, store] = await Promise.all([fetchJSON('phrase-dictionary.json'), fetchJSON('phrase-attestations.json'), openPhraseStore()]);
      if (dictionary.format !== 'doodlekeeper-phrase-dictionary-v1' || !Array.isArray(dictionary.words) || dictionary.words.length !== dictionary.count || !dictionary.id || attestations.format !== 'doodlekeeper-phrase-attestations-v1' || !attestations.id || !Array.isArray(attestations.entries)) throw new Error('The bundled dictionary has an unsupported format.');
      knownWords = new Set(dictionary.words); blockedWords = new Set(dictionary.friendlyBlockedWords || []);
      index = createAttestedIndex(attestations.entries);
      ordered = [...index.keys()].map(text => ({ text, length: wordCount(text) })).filter(row => row.length > 1)
        .sort((a,b) => a.length-b.length || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0)).map(row => row.text);
      field('dictionary').textContent = `${dictionary.count.toLocaleString()} single words · ${index.size.toLocaleString()} recorded expressions · repeats allowed.`;
      field('credits').textContent = 'Word pool: ESDB / SCOWL and DWYL. Expressions: ESDB and Wiktionary contributors via Kaikki.org. Licenses and filter coverage vary by source.';
      const preference = await store.getPreference();
      if (preference?.settings) {
        const saved = preference.settings;
        if (['attested','brute'].includes(saved.mode)) field('mode').value = saved.mode;
        if (Number.isInteger(saved.minWords) && saved.minWords >= 1 && saved.minWords <= 8) field('min').value = String(saved.minWords);
        if (Number.isInteger(saved.maxWords) && saved.maxWords >= 1 && saved.maxWords <= 8) field('max').value = String(saved.maxWords);
        field('friendly').checked = saved.friendly !== false; field('autoqueue').checked = saved.autoQueue !== false;
      }
      await render();
    })().catch(error => { field('dictionary').textContent = error.message; loading = null; throw error; });
    return loading;
  }
  async function locked(name, action) {
    if (!navigator.locks) throw new Error('This browser cannot coordinate phrase progress. Use a current browser.');
    return navigator.locks.request('doodlekeeper-phrase-' + name, { ifAvailable: true }, lock => {
      if (!lock) throw new Error('Another Keeper tab is doing this work. Pause it before starting here.');
      return action();
    });
  }
  async function generate() {
    if (generating || !visible || document.hidden) return;
    generating = true; searchStop = false; controls();
    try {
      await load();
      const config = settings();
      if (config.minWords > config.maxWords) throw new Error('Shortest phrase must not exceed longest phrase.');
      await store.savePreference(config);
      await locked('search', async () => {
        const signature = JSON.stringify({ ...config, autoQueue: undefined, dictionary: dictionary.id, attestations: attestations.id });
        const id = 'search:' + await digest(signature);
        let job = await store.getJob(id) || { id, dictionaryId: dictionary.id, config, revision: 0, cursor: null, position: 0, examined: '0', found: '0' };
        const enumerator = config.mode === 'brute' ? createEnumerator(dictionary.words, { dictionaryId: dictionary.id, minWords: config.minWords, maxWords: config.maxWords, ...(job.cursor ? { cursor: job.cursor } : {}) }) : null;
        const total = enumerator ? enumerator.total : BigInt(ordered.length + (config.minWords === 1 ? dictionary.words.length : 0));
        let done = false, chunks = 0;
        while (!searchStop && visible && !document.hidden && !done) {
          let texts, nextCursor = job.cursor, nextPosition = job.position;
          if (enumerator) { const chunk = enumerator.next(1000); texts = chunk.phrases; nextCursor = chunk.nextCursor; done = chunk.done; }
          else {
            texts = [];
            for (let i = 0; i < 500 && nextPosition < Number(total); i++, nextPosition++) texts.push(nextPosition < ordered.length ? ordered[nextPosition] : dictionary.words[nextPosition - ordered.length]);
            done = nextPosition >= Number(total);
          }
          const matches = [];
          for (const text of texts) {
            const count = wordCount(text); if (count < config.minWords || count > config.maxWords) continue;
            const result = assess(text);
            if (result.accepted) matches.push({ text: result.phrase || normalizePhrase(text), sources: result.sources, tags: result.tags });
          }
          const next = { ...job, config, cursor: nextCursor, position: nextPosition, examined: String(BigInt(job.examined) + BigInt(texts.length)), done };
          const saved = await store.commitChunk(next, matches, job.revision, config.autoQueue);
          job = saved.job;
          field('search-status').textContent = `${done ? 'Search finished' : 'Searching'} · ${shortNumber(job.examined)} / ${shortNumber(total)} checked. Checkpoint saved.`;
          if (++chunks % 5 === 0 || done) await render();
          await pauseForUI();
        }
        if (!done) field('search-status').textContent = `Paused · ${shortNumber(job.examined)} checked. Checkpoint saved; Start resumes here.`;
      });
    } finally { generating = false; await render(); }
  }
  async function post() {
    if (posting || !visible || document.hidden) return;
    if (!unlocked) { onUnlockRequest?.(); return; }
    posting = true; postStop = false; controls();
    try {
      await load();
      await locked('posting', async () => {
        while (!postStop && visible && !document.hidden && unlocked) {
          let batch = await store.pendingBatch();
          if (!batch) {
            const rows = (await store.list('queued', MAX_WAITING)).filter(row => assess(row.text).accepted).slice(0, 100);
            if (!rows.length) { field('post-status').textContent = 'No qualifying phrases are waiting. Other queued entries may be held by Friendly mode.'; break; }
            batch = { ...await createPhraseBatch(rows, { dictionaryId: dictionary.id }), dictionaryId: dictionary.id }; await store.saveBatch(batch);
          }
          if (batch.phrases.some(row => !assess(row.text || row.phrase || row).accepted)) throw new Error('A pending batch is held by the current filter. Restore its earlier Friendly setting to finish or export the queue.');
          if (postStop || !visible || document.hidden || !unlocked) break;
          field('post-status').textContent = `Sealing ${batch.phrases.length} phrases…`;
          const receipt = await postBatch(batch);
          await store.completeBatch(batch, receipt);
          field('post-status').textContent = `Saved ${batch.phrases.length} phrases · ${receipt.witnessed ? 'signed and witnessed' : 'signed locally'}.`;
          await render(); await pauseForUI();
        }
      });
    } finally { posting = false; await render(); }
  }
  const handle = (name, action, status = 'search-status') => button(name).addEventListener('click', () => {
    onActivity(); Promise.resolve().then(action).catch(error => { field(status).textContent = error.message; controls(); });
  });
  handle('generate', generate); handle('pause', () => { searchStop = true; });
  handle('queue', async () => { await load(); const n = await store.queuePile(row => assess(row.text).accepted); field('post-status').textContent = `${n.toLocaleString()} phrases added to the queue.`; await render(); }, 'post-status');
  handle('post', post, 'post-status'); handle('stop-post', () => { postStop = true; }, 'post-status');
  handle('unlock', () => onUnlockRequest?.());
  handle('export', async () => { await load(); download('doodlekeeper-phrase-pile.json', JSON.stringify({ ...await store.exportWorkspace(), dictionaryId: dictionary.id, attestationId: attestations.id }), 'application/json'); });
  handle('text', async () => { await load(); const workspace = await store.exportWorkspace(); download('doodlekeeper-phrase-pile.txt', 'Dictionary and word-list phrase pile\n\n' + workspace.sourceNotices + '\n\nPHRASES\n\n' + workspace.items.map(row => row.text).join('\n'), 'text/plain;charset=utf-8'); });
  handle('previous', async () => { page = Math.max(0, page - 1); await render(); });
  handle('next', async () => { page++; await render(); });
  field('tab').addEventListener('change', () => { page = 0; render().catch(error => { field('post-status').textContent = error.message; }); });
  for (const name of ['mode','min','max','friendly','autoqueue']) field(name).addEventListener('change', () => {
    field('search-status').textContent = 'Settings saved for this search. Start resumes its matching checkpoint; your other searches remain saved.';
    if (store) store.savePreference(settings()).then(render).catch(error => { field('search-status').textContent = error.message; });
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { searchStop = true; postStop = true; } });
  window.addEventListener('pagehide', () => { searchStop = true; postStop = true; });
  controls();
  return Object.freeze({
    setVisible(value) { visible = !!value; if (!visible) { searchStop = true; postStop = true; } else load().catch(error => { field('search-status').textContent = error.message; }); },
    setUnlocked(value) { unlocked = !!value; if (!unlocked) postStop = true; controls(); },
    pause() { searchStop = true; postStop = true; },
  });
}
