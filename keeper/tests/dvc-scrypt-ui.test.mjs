// SPDX-License-Identifier: GPL-3.0-only
// Runs the shipped controller with disposable DOM/RPC/miner fixtures. This tests
// user controls and request boundaries, not GPU execution or node consensus.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../public/scrypt.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('../public/scrypt-ui.mjs', import.meta.url), 'utf8');
const minerImport = "import { mineScryptGpu } from './dvc-scrypt-miner.mjs';";
assert.equal(source.split(minerImport).length, 2, 'The fixture replaces exactly the declared miner import.');
// Only the dependency binding is replaced; all controller logic is executed as
// shipped, in a fresh context, using the repository's existing VM test approach.
const controllerSource = source.replace(minerImport, '');
assert.doesNotMatch(controllerSource, /^\s*(?:import|export)\s/m, 'New module dependencies need an explicit fixture binding.');
const ADDRESS = 'nFXpqKGstGktjrogxmR28tu6ccJCfGSTEk';
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = () => new Promise(resolve => setImmediate(resolve));
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const found = (nonce = 7, attempts = 64) => ({ status: 'found', nonce, attempts, elapsedMs: 100, hash: '42'.repeat(32), header: new Uint8Array(80), backend: 'webgpu', algorithm: 'scrypt' });
const exhausted = attempts => ({ status: 'exhausted', nonce: null, attempts, elapsedMs: 60000, hash: null, header: null });

class Element extends EventTarget {
  constructor(tag = 'div', attributes = '') {
    super(); this.tagName = tag.toUpperCase(); this.value = ''; this.textContent = ''; this.scrollTop = this.scrollHeight = 0;
    this.disabled = /(?:^|\s)disabled(?:\s|$)/.test(attributes); this.checked = /(?:^|\s)checked(?:\s|$)/.test(attributes);
    const classes = new Set(); this.classList = { toggle(name, force) { const enabled = force ?? !classes.has(name); enabled ? classes.add(name) : classes.delete(name); return enabled; }, contains: name => classes.has(name) };
  }
  fire(name) { const event = new Event(name, { cancelable: true }); this.dispatchEvent(event); return event; }
  click() { if (this.disabled) return false; this.fire('click'); return true; }
}

function fixture({ connected = true, serverHook } = {}) {
  const elements = new Map(), calls = [], miners = [], jobs = [], timers = new Map();
  let clock = 0, timerId = 0, hook = serverHook;
  let nodeStatus = { connected, network: 'regtest', height: 1, peers: 0, message: 'No Core node configured.' };
  for (const match of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    assert.equal(elements.has(match[3]), false, 'Shipped element IDs must be unique.');
    const element = new Element(match[1], match[2]), after = html.slice(match.index + match[0].length);
    element.textContent = after.match(/^[^<]*/)[0];
    if (match[1] === 'select') element.value = after.match(/<option\b[^>]*\bvalue="([^"]+)"/)[1];
    else element.value = match[2].match(/\bvalue="([^"]*)"/)?.[1] || '';
    elements.set(match[3], element);
  }
  const doc = new EventTarget(), win = new EventTarget(); doc.hidden = false; doc.body = new Element('body');
  doc.getElementById = id => { assert.ok(elements.has(id), 'Controller requested a missing shipped ID: ' + id); return elements.get(id); };
  // Wallet discovery is forbidden in this address-only UI fixture.
  Object.defineProperty(win, 'ethereum', { get() { assert.fail('Mining must not access an Ethereum wallet.'); } });
  const fetchImpl = async (url, options = {}) => {
    assert.match(url, /^\.\/scrypt\/(status|job|submit)$/);
    const path = url.slice('./scrypt/'.length), body = options.body ? JSON.parse(options.body) : undefined;
    const call = { url, path, body, options }; calls.push(call);
    if (hook) { const reply = hook(call); if (reply !== undefined) return reply; }
    if (path === 'status') return json(nodeStatus);
    if (path === 'job') {
      const sequence = jobs.length + 1;
      const job = { id: sequence.toString(16).padStart(48, '0'), expires: Date.now() + 120000, network: 'regtest',
        header: sequence.toString(16).padStart(2, '0').repeat(80), target: '7f' + 'ff'.repeat(31), height: sequence + 1,
        address: body.address, rewardAtoms: 5000000000, algorithm: 'scrypt-1024-1-1' };
      jobs.push(job); return json(job);
    }
    const job = jobs.find(item => item.id === body.id); assert.ok(job, 'Submission must reference a job from this fixture.');
    return json({ accepted: true, hash: 'ab'.repeat(32), height: job.height, address: job.address, rewardAtoms: job.rewardAtoms, maturity: 30, network: 'regtest' });
  };
  const mineScryptGpu = options => { const pending = deferred(); miners.push({ options, ...pending }); return pending.promise; };
  const context = vm.createContext({ document: doc, window: win, fetch: fetchImpl, mineScryptGpu,
    Uint8Array, AbortController, AbortSignal, DOMException,
    setTimeout(callback, ms) { const id = ++timerId; timers.set(id, { callback, due: clock + ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  vm.runInContext(controllerSource, context, { filename: 'keeper/public/scrypt-ui.mjs' });
  const field = id => doc.getElementById(id);
  const settle = async () => { for (let i = 0; i < 4; i++) await flush(); };
  const until = async predicate => {
    for (let i = 0; i < 100; i++) { if (predicate()) return; await flush(); }
    assert.fail('Controller did not settle: ' + field('mining-status').textContent + '\n' + field('console').textContent);
  };
  return {
    calls, miners, jobs, timers, field, doc, win, until, settle,
    click: id => field(id).click(),
    submit() { return field('mining-form').fire('submit'); },
    command(value) { field('command-input').value = value; return field('command-form').fire('submit'); },
    repeat(enabled) { field('keep-mining').checked = enabled; field('keep-mining').fire('change'); },
    hide() { doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); },
    show() { doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange')); },
    pagehide() { win.dispatchEvent(new Event('pagehide')); },
    hookServer(fn) { hook = fn; },
    status(value) { nodeStatus = { ...nodeStatus, ...value }; },
    finish(result, index = miners.length - 1) { assert.ok(miners[index], 'There must be an active fake miner.'); miners[index].resolve(result); },
    async ready() { await until(() => calls.some(call => call.path === 'status') && field('network').textContent !== 'Checking your node…'); field('address').value = ADDRESS; },
    async advance(ms) {
      clock += ms;
      for (const [id, timer] of [...timers]) if (timer.due <= clock) { timers.delete(id); timer.callback(); }
      await settle();
    },
    async cleanup() { win.dispatchEvent(new Event('pagehide')); for (const miner of miners) miner.resolve({ status: 'stopped', attempts: 0, elapsedMs: 0 }); await settle(); timers.clear(); },
  };
}

test('loading, checking the node and opting into Keep mining never start mining', async () => {
  const f = fixture();
  try {
    await f.ready(); assert.equal(f.field('intensity').value, 'eco'); assert.equal(f.field('algorithm').value, 'scrypt');
    assert.equal(f.miners.length, 0); assert.deepEqual(f.calls.map(call => call.path), ['status']);
    f.repeat(true); f.click('refresh'); await f.settle(); await f.advance(10000);
    assert.equal(f.miners.length, 0); assert.equal(f.calls.some(call => call.path !== 'status'), false);
    assert.equal(f.field('mine').disabled, false); assert.equal(f.field('stop').disabled, true);
  } finally { await f.cleanup(); }
});

test('an address-only job leads to an id-and-nonce-only submission with no wallet access', async () => {
  const f = fixture();
  try {
    await f.ready(); f.field('address').value = '  ' + ADDRESS + '  ';
    const event = f.submit(); assert.equal(event.defaultPrevented, true);
    await f.until(() => f.miners.length === 1);
    assert.deepEqual(f.calls.find(call => call.path === 'job').body, { address: ADDRESS });
    assert.equal(f.field('stop').disabled, false); assert.equal(f.field('mine').disabled, true);
    for (const id of ['address', 'intensity', 'check-gpu', 'refresh']) assert.equal(f.field(id).disabled, true);
    const options = f.miners[0].options;
    assert.equal(Buffer.from(options.header).toString('hex'), f.jobs[0].header);
    assert.equal(options.target, f.jobs[0].target); assert.equal(options.intensity, 'eco'); assert.equal(options.maxSeconds, 60);
    assert.equal(options.signal.aborted, false); assert.equal(options.isVisible(), true);
    f.finish(found(27)); await f.until(() => !f.field('mine').disabled);
    const submission = f.calls.find(call => call.path === 'submit');
    assert.deepEqual(submission.body, { id: f.jobs[0].id, nonce: 27 });
    for (const call of f.calls.filter(call => call.path !== 'status')) {
      assert.equal(call.options.method, 'POST'); assert.equal(call.options.headers['Content-Type'], 'application/json');
      assert.equal(call.options.headers['X-Keeper-Request'], '1'); assert.equal(call.options.cache, 'no-store'); assert.ok(call.options.signal instanceof AbortSignal);
    }
    assert.equal(f.field('accepted').textContent, '1'); assert.match(f.field('mining-status').textContent, /Block 2 accepted/);
    assert.match(f.field('console').textContent, /50\.00000000 test DVC/);
    await f.advance(10000); assert.equal(f.jobs.length, 1); assert.equal(f.miners.length, 1);
  } finally { await f.cleanup(); }
});

test('Keep mining starts only after MINE NOW and gets a fresh job after an accepted round', async () => {
  const f = fixture();
  try {
    await f.ready(); f.repeat(true); await f.advance(10000); assert.equal(f.jobs.length, 0);
    f.submit(); await f.until(() => f.miners.length === 1); f.finish(found());
    await f.until(() => f.field('accepted').textContent === '1' && f.timers.size === 1);
    assert.equal(f.jobs.length, 1); await f.advance(2500); await f.until(() => f.miners.length === 2);
    assert.equal(f.jobs.length, 2); assert.notEqual(f.jobs[0].id, f.jobs[1].id);
    assert.notDeepEqual(f.miners[0].options.header, f.miners[1].options.header);
    f.click('stop'); assert.equal(f.miners[1].options.signal.aborted, true); f.finish(found(9));
    await f.until(() => !f.field('mine').disabled); await f.advance(10000);
    assert.equal(f.calls.filter(call => call.path === 'submit').length, 1); assert.equal(f.jobs.length, 2);
    assert.equal(f.field('accepted').textContent, '1'); assert.match(f.field('mining-status').textContent, /Stopped by you/);
  } finally { await f.cleanup(); }
});

test('Stop preserves the receipt of a block already submitted and never starts another job', async () => {
  const f = fixture(), receipt = deferred();
  try {
    await f.ready(); f.repeat(true);
    f.hookServer(call => call.path === 'submit' ? receipt.promise : undefined);
    f.submit(); await f.until(() => f.miners.length === 1); f.finish(found());
    await f.until(() => f.calls.some(call => call.path === 'submit'));
    const submission = f.calls.find(call => call.path === 'submit');
    f.click('stop');
    assert.equal(f.miners[0].options.signal.aborted, true);
    assert.equal(submission.options.signal.aborted, false, 'the bounded receipt remains readable after GPU cancellation');
    receipt.resolve(json({ accepted: true, hash: 'ab'.repeat(32), height: 2, address: ADDRESS, rewardAtoms: 5000000000, maturity: 30, network: 'regtest' }));
    await f.until(() => !f.field('mine').disabled); await f.advance(10000);
    assert.equal(f.field('accepted').textContent, '1');
    assert.match(f.field('mining-status').textContent, /Mining stopped.*block 2 accepted/);
    assert.match(f.field('network').textContent, /block 2/);
    assert.equal(f.jobs.length, 1); assert.equal(f.miners.length, 1);
  } finally { receipt.resolve(json({})); await f.cleanup(); }
});

for (const action of ['Stop', 'hidden tab', 'page exit', 'Keep mining off']) test(`${action} cancels GPU work and rejects its late result without restarting`, async () => {
  const f = fixture();
  try {
    await f.ready(); f.repeat(true); f.submit(); await f.until(() => f.miners.length === 1);
    if (action === 'Stop') f.click('stop');
    else if (action === 'hidden tab') { f.hide(); assert.equal(f.miners[0].options.isVisible(), false); }
    else if (action === 'page exit') f.pagehide();
    else f.repeat(false);
    assert.equal(f.miners[0].options.signal.aborted, true);
    f.finish(found()); await f.until(() => f.field('stop').disabled); f.show(); await f.advance(10000);
    assert.equal(f.calls.some(call => call.path === 'submit'), false); assert.equal(f.jobs.length, 1); assert.equal(f.miners.length, 1);
    assert.equal(f.field('accepted').textContent, '0'); assert.equal(f.doc.body.classList.contains('mining'), false);
    assert.equal(f.field('mine').disabled, false);
  } finally { await f.cleanup(); }
});

for (const action of ['Stop', 'hidden tab']) test(`${action} during job acquisition cannot start a late GPU round`, async () => {
  const gate = deferred(), f = fixture();
  try {
    await f.ready(); f.repeat(true); f.hookServer(call => call.path === 'job' ? gate.promise : undefined);
    f.submit(); await f.until(() => f.calls.some(call => call.path === 'job'));
    const request = f.calls.find(call => call.path === 'job');
    if (action === 'Stop') f.click('stop'); else f.hide();
    assert.equal(request.options.signal.aborted, true);
    gate.resolve(json({ id: '01'.repeat(24), header: '00'.repeat(80), target: '7f' + 'ff'.repeat(31), height: 2 }));
    await f.until(() => f.field('stop').disabled); f.show(); await f.advance(10000);
    assert.equal(f.miners.length, 0); assert.equal(f.calls.filter(call => call.path === 'job').length, 1);
    assert.equal(f.calls.some(call => call.path === 'submit'), false);
  } finally { gate.resolve(json({})); await f.cleanup(); }
});

test('Stop during the repeat delay cancels the scheduled round and does not resume itself', async () => {
  const f = fixture();
  try {
    await f.ready(); f.repeat(true); f.submit(); await f.until(() => f.miners.length === 1);
    f.finish(exhausted(64)); await f.until(() => f.timers.size === 1);
    f.click('stop'); await f.until(() => f.field('stop').disabled);
    assert.equal(f.timers.size, 0); await f.advance(10000);
    assert.equal(f.jobs.length, 1); assert.equal(f.miners.length, 1); assert.equal(f.calls.some(call => call.path === 'submit'), false);
    f.submit(); await f.until(() => f.miners.length === 2); assert.equal(f.jobs.length, 2, 'Explicit MINE NOW can begin a new round after Stop.');
  } finally { await f.cleanup(); }
});

for (const repeat of [false, true]) test(`stale 409 submissions ${repeat ? 'get fresh work only with Keep mining enabled' : 'stop without requesting fresh work'}`, async () => {
  const f = fixture();
  try {
    await f.ready(); f.repeat(repeat);
    f.hookServer(call => call.path === 'submit' ? json({ error: 'Another block arrived first. Request fresh work.' }, 409) : undefined);
    f.submit(); await f.until(() => f.miners.length === 1); f.finish(found());
    if (repeat) {
      await f.until(() => f.timers.size === 1); assert.equal(f.jobs.length, 1); assert.equal(f.field('accepted').textContent, '0');
      assert.match(f.field('console').textContent, /getting fresh work/);
      await f.advance(2500); await f.until(() => f.miners.length === 2);
      assert.equal(f.jobs.length, 2); assert.notEqual(f.jobs[0].id, f.jobs[1].id);
      assert.equal(Buffer.from(f.miners[1].options.header).toString('hex'), f.jobs[1].header);
      f.click('stop'); f.finish(found()); await f.until(() => f.field('stop').disabled);
      assert.equal(f.calls.filter(call => call.path === 'submit').length, 1);
    } else {
      await f.until(() => !f.field('mine').disabled); await f.advance(10000);
      assert.equal(f.timers.size, 0); assert.equal(f.jobs.length, 1); assert.equal(f.miners.length, 1);
      assert.match(f.field('mining-status').textContent, /Mining stopped.*Another block arrived/);
    }
    assert.equal(f.field('accepted').textContent, '0');
  } finally { await f.cleanup(); }
});

test('a disconnected or rejected node disables MINE NOW and cannot be bypassed by form submission', async () => {
  const f = fixture({ connected: false });
  try {
    await f.ready(); assert.equal(f.field('mine').disabled, true); assert.equal(f.field('check-gpu').disabled, false);
    f.repeat(true); f.submit(); await f.advance(10000);
    assert.equal(f.miners.length, 0); assert.equal(f.calls.some(call => call.path === 'job'), false);
    f.status({ connected: true }); f.click('refresh'); await f.until(() => !f.field('mine').disabled);
    assert.equal(f.miners.length, 0); assert.equal(f.calls.some(call => call.path === 'job'), false);
    f.hookServer(call => call.path === 'status' ? json({ error: 'The connected node is not the pinned Doodleverse test network.' }, 503) : undefined);
    f.click('refresh'); await f.until(() => f.field('mine').disabled);
    f.submit(); await f.settle(); assert.equal(f.miners.length, 0); assert.equal(f.calls.some(call => call.path === 'job'), false);
    assert.match(f.field('network').textContent, /not the pinned/);
  } finally { await f.cleanup(); }
});

for (const intensity of ['eco', 'balanced']) test(`${intensity} GPU check rejects timeout, incomplete work and stopped/unknown results`, async () => {
  const batch = intensity === 'eco' ? 64 : 128;
  for (const result of [exhausted(0), exhausted(batch - 1), { ...exhausted(batch), status: 'stopped' }, { ...exhausted(batch), status: 'unknown' }]) {
    const f = fixture({ connected: false });
    try {
      await f.ready(); f.field('intensity').value = intensity; f.click('check-gpu'); await f.until(() => f.miners.length === 1);
      assert.equal(f.miners[0].options.maxCandidates, batch);
      f.finish(result); await f.until(() => f.field('stop').disabled);
      assert.doesNotMatch(f.field('mining-status').textContent, /self-tests passed|can run this miner/);
      assert.doesNotMatch(f.field('console').textContent, /self-tests passed/);
      assert.equal(f.field('accepted').textContent, '0'); assert.equal(f.calls.some(call => call.path !== 'status'), false);
    } finally { await f.cleanup(); }
  }
});

for (const [intensity, status] of [['eco', 'found'], ['balanced', 'exhausted']]) test(`${intensity} completed GPU check reports success without requesting or submitting a block`, async () => {
  const f = fixture({ connected: false }), batch = intensity === 'eco' ? 64 : 128;
  try {
    await f.ready(); f.field('intensity').value = intensity; f.repeat(true); f.click('check-gpu'); await f.until(() => f.miners.length === 1);
    assert.deepEqual(f.miners[0].options.header, new Uint8Array(80)); assert.equal(f.miners[0].options.maxCandidates, batch);
    f.finish({ ...found(0, batch), status }); await f.until(() => f.field('stop').disabled); await f.advance(10000);
    assert.match(f.field('mining-status').textContent, /GPU Scrypt self-tests passed/);
    assert.equal(f.calls.some(call => call.path !== 'status'), false); assert.equal(f.miners.length, 1); assert.equal(f.field('accepted').textContent, '0');
  } finally { await f.cleanup(); }
});

test('typing a command stays inert until the shared Run/Enter form submission', async () => {
  const f = fixture();
  try {
    await f.ready();
    assert.match(html, /<label for="command-input">Command<\/label>/);
    assert.match(html, /id="command-input"[^>]*maxlength="80"[^>]*aria-describedby="command-help"/);
    assert.match(html, /id="command-run" type="submit"/);
    f.field('command-input').value = 'mine'; f.field('command-input').fire('input');
    await f.advance(10000); assert.equal(f.jobs.length, 0); assert.equal(f.miners.length, 0);
    // Native Enter and the Run submit button both emit this same form event.
    const event = f.field('command-form').fire('submit'); assert.equal(event.defaultPrevented, true);
    await f.until(() => f.miners.length === 1); assert.equal(f.field('command-input').value, '');
    assert.deepEqual(f.calls.find(call => call.path === 'job').body, { address: ADDRESS });
    f.finish(found(34)); await f.until(() => f.field('stop').disabled);
    assert.deepEqual(f.calls.find(call => call.path === 'submit').body, { id: f.jobs[0].id, nonce: 34 });
  } finally { await f.cleanup(); }
});

test('help, status, intensity and Keep commands use the visible settings without starting work', async () => {
  const f = fixture();
  try {
    await f.ready(); f.command(' \t HELP  '); assert.match(f.field('console').textContent, /Commands: help.*check node.*keep off.*intensity balanced.*clear/);
    f.command('  InTensity\tBalanced '); assert.equal(f.field('intensity').value, 'balanced');
    f.command('KeEp\tON'); assert.equal(f.field('keep-mining').checked, true);
    f.command('status'); assert.match(f.field('console').textContent, /Mining: stopped.*balanced.*Keep mining: on/);
    f.command('intensity eco'); f.command('keep off');
    assert.equal(f.field('intensity').value, 'eco'); assert.equal(f.field('keep-mining').checked, false);
    await f.advance(10000); assert.equal(f.miners.length, 0); assert.deepEqual(f.calls.map(call => call.path), ['status']);
  } finally { await f.cleanup(); }
});

test('unknown, multiline, oversized, RPC, address and key commands are cleared without echo or execution', async () => {
  const f = fixture(), secret = 'private-fixture-value-that-must-not-be-logged';
  try {
    await f.ready();
    for (const raw of ['', '   ', 'mine;stop', 'mine\nstop', 'mine\r', 'stop\0', 'keep true', 'intensity fast', 'check wallet',
      'rpc submitblock', 'address ' + ADDRESS, 'importprivkey ' + secret, 'status ' + secret, '<script>private-marker</script>',
      'eval(private-marker)', 'fetch(private-marker)', 'help ' + 'x'.repeat(100000)]) {
      f.command(raw); assert.equal(f.field('command-input').value, ''); assert.match(f.field('console').textContent, /ERROR Unknown command/);
    }
    await f.advance(10000); assert.equal(f.jobs.length, 0); assert.equal(f.miners.length, 0); assert.equal(f.calls.length, 1);
    assert.doesNotMatch(f.field('console').textContent, /private-fixture|private-marker|importprivkey|submitblock|<script>|xxxxxxxx/);
    assert.equal(f.field('console').textContent.includes(ADDRESS), false);
  } finally { await f.cleanup(); }
});

test('mine commands require the same connected node and a receiving address from the visible field', async () => {
  const f = fixture({ connected: false });
  try {
    await f.ready(); f.command('mine'); assert.match(f.field('console').textContent, /Connect your Doodleverse test node before mining/);
    assert.equal(f.jobs.length, 0); assert.equal(f.miners.length, 0);
    f.status({ connected: true }); f.command('check node'); await f.until(() => !f.field('mine').disabled);
    for (const address of ['', '  ', '0x' + '12'.repeat(20), '<invalid-address>']) {
      f.field('address').value = address; f.command('mine'); assert.match(f.field('console').textContent, /Enter a Doodleverse receiving address/);
    }
    await f.settle(); assert.equal(f.jobs.length, 0); assert.equal(f.miners.length, 0);
    f.field('address').value = ADDRESS; f.hide(); f.command('mine'); f.show(); await f.advance(10000);
    assert.equal(f.jobs.length, 0); assert.match(f.field('console').textContent, /Return to this tab/);
  } finally { await f.cleanup(); }
});

test('a pending command node check is bounded to one request and disables the matching button', async () => {
  const gate = deferred(), f = fixture();
  try {
    await f.ready(); f.hookServer(call => call.path === 'status' ? gate.promise : undefined);
    f.command('check node'); await f.until(() => f.calls.length === 2);
    assert.equal(f.field('refresh').disabled, true); assert.equal(f.click('refresh'), false);
    f.command('check node'); f.command('check node');
    assert.equal(f.calls.length, 2); assert.match(f.field('console').textContent, /node check is already running/);
    f.command('status'); assert.equal(f.calls.length, 2);
    gate.resolve(json({ connected: true, network: 'regtest', height: 9, peers: 1 }));
    await f.until(() => !f.field('refresh').disabled); assert.match(f.field('network').textContent, /block 9/); assert.equal(f.miners.length, 0);
  } finally { gate.resolve(json({ connected: false, message: 'Fixture stopped.' })); await f.cleanup(); }
});

test('busy commands cannot change intensity, check the node, or launch extra miners, while Stop stays available', async () => {
  const f = fixture();
  try {
    await f.ready(); f.command('intensity balanced'); f.command('mine'); await f.until(() => f.miners.length === 1);
    assert.equal(f.miners[0].options.intensity, 'balanced');
    for (const command of ['mine', 'check gpu', 'check node', 'intensity eco']) f.command(command);
    assert.equal(f.field('intensity').value, 'balanced'); assert.match(f.field('console').textContent, /Mining is busy/);
    assert.equal(f.miners.length, 1); assert.equal(f.calls.filter(call => call.path === 'status').length, 1); assert.equal(f.jobs.length, 1);
    assert.equal(f.field('command-input').disabled, false); assert.equal(f.field('command-run').disabled, false); assert.equal(f.field('stop').disabled, false);
    f.command('status'); f.command('help'); f.command('stop');
    assert.equal(f.miners[0].options.signal.aborted, true); f.finish(found()); await f.until(() => f.field('stop').disabled);
    await f.advance(10000); assert.equal(f.calls.some(call => call.path === 'submit'), false); assert.equal(f.miners.length, 1);
  } finally { await f.cleanup(); }
});

test('Keep off command cancels a pending repeated round through the same checkbox path', async () => {
  const f = fixture();
  try {
    await f.ready(); f.command('keep on'); assert.equal(f.field('keep-mining').checked, true); assert.equal(f.jobs.length, 0);
    f.command('mine'); await f.until(() => f.miners.length === 1); f.finish(exhausted(64)); await f.until(() => f.timers.size === 1);
    f.command('keep off'); assert.equal(f.field('keep-mining').checked, false); await f.until(() => f.field('stop').disabled);
    assert.equal(f.timers.size, 0); await f.advance(10000); assert.equal(f.jobs.length, 1); assert.equal(f.miners.length, 1);
    assert.match(f.field('mining-status').textContent, /Keep mining turned off/);
  } finally { await f.cleanup(); }
});

test('Stop command interrupts job acquisition and tab hiding cancels a command-started GPU check', async () => {
  const gate = deferred(), f = fixture();
  try {
    await f.ready(); f.hookServer(call => call.path === 'job' ? gate.promise : undefined);
    f.command('mine'); await f.until(() => f.calls.some(call => call.path === 'job')); f.command('stop');
    assert.equal(f.calls.find(call => call.path === 'job').options.signal.aborted, true);
    gate.resolve(json({ id: '01'.repeat(24), header: '00'.repeat(80), target: '7f' + 'ff'.repeat(31), height: 2 }));
    await f.until(() => f.field('stop').disabled); assert.equal(f.miners.length, 0);
    f.command('check gpu'); await f.until(() => f.miners.length === 1);
    assert.equal(f.miners[0].options.maxCandidates, 64); f.hide(); assert.equal(f.miners[0].options.signal.aborted, true);
    f.finish(found()); await f.until(() => f.field('stop').disabled); f.show(); await f.advance(10000);
    assert.equal(f.miners.length, 1); assert.equal(f.calls.some(call => call.path === 'submit'), false);
    assert.doesNotMatch(f.field('console').textContent, /self-tests passed/);
  } finally { gate.resolve(json({})); await f.cleanup(); }
});

test('Clear removes a bounded transcript without changing or canceling active mining', async () => {
  const f = fixture();
  try {
    await f.ready(); for (let i = 0; i < 100; i++) f.command('help');
    assert.equal(f.field('console').textContent.split(/\n(?=\S.*(?:GITTIT|GODDIT|ERROR) )/).length <= 80, true);
    f.command('mine'); await f.until(() => f.miners.length === 1);
    f.command('clear'); assert.match(f.field('console').textContent, /GODDIT Console cleared\.$/);
    assert.doesNotMatch(f.field('console').textContent, /Commands:|MINE NOW|GITTIT/);
    assert.equal(f.miners[0].options.signal.aborted, false); assert.equal(f.field('stop').disabled, false); assert.equal(f.miners.length, 1);
    f.command('stop'); f.finish(found()); await f.until(() => f.field('stop').disabled);
    assert.equal(f.calls.some(call => call.path === 'submit'), false);
  } finally { await f.cleanup(); }
});
