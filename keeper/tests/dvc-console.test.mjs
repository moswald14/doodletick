// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDvcConsole, parseDvcCommand } from '../public/dvc-console.mjs';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
function deferred() { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }
class Element extends EventTarget {
  constructor(tag = 'div') { super(); this.tagName = tag; this.children = []; this.dataset = {}; this.attributes = {}; this.value = ''; this.disabled = false; this.scrollTop = this.clientHeight = this.scrollHeight = 0; this._text = ''; this.classes = new Set(); this.classList = { add: value => this.classes.add(value) }; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set innerHTML(_) { throw Error('HTML injection is forbidden in this fixture.'); }
  append(...nodes) { for (const node of nodes) { if (node.parentNode) node.parentNode.removeChild(node); node.parentNode = this; node.attachmentCount = (node.attachmentCount || 0) + 1; this.children.push(node); } }
  removeChild(node) { const index = this.children.indexOf(node); if (index < 0) throw Error('Node is not attached.'); this.children.splice(index, 1); node.parentNode = null; return node; }
  replaceChildren(...nodes) { for (const child of this.children) child.parentNode = null; this.children = []; this._text = ''; this.append(...nodes); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
}
function find(root, predicate) { if (predicate(root)) return root; for (const child of root.children) { const result = find(child, predicate); if (result) return result; } return null; }
function fixture({ execute = parsed => `Finished ${parsed.command}.`, onError } = {}) {
  const doc = { createElement: tag => new Element(tag) }, host = new Element(), calls = [];
  const ui = createDvcConsole(host, { document: doc, execute(parsed) { calls.push(parsed); return execute(parsed); }, onError });
  const field = name => find(host, element => element.dataset.consoleField === name), button = name => find(host, element => element.dataset.consoleAction === name);
  const input = field('input'), log = field('output'), form = find(host, element => element.tagName === 'form'), clear = button('clear');
  function submit(value, keyboard = false) {
    input.value = value;
    const event = new Event(keyboard ? 'keydown' : 'submit', { cancelable: true });
    if (keyboard) Object.defineProperty(event, 'key', { value: 'Enter' });
    (keyboard ? input : form).dispatchEvent(event); return event;
  }
  return { ui, host, calls, field, button, input, log, form, clear, submit, text: () => log.textContent, entries: () => log.children };
}

test('parser accepts only the documented commands and normalizes their allowed values', () => {
  for (const command of ['help', 'status', 'balance', 'wallets', 'connect', 'refresh', 'mine', 'stop', 'clear']) {
    assert.deepEqual(parseDvcCommand('  ' + command.toUpperCase() + '  '), { command, args: [] });
  }
  assert.deepEqual(parseDvcCommand('ALGORITHM\tSHA256D'), { command: 'algorithm', args: ['sha256d'] });
  for (const intensity of ['eco', 'balanced', 'fast']) assert.deepEqual(parseDvcCommand('intensity ' + intensity), { command: 'intensity', args: [intensity] });
  for (const value of ['on', 'off']) assert.deepEqual(parseDvcCommand('repeat ' + value), { command: 'repeat', args: [value] });
  const parsed = parseDvcCommand('algorithm sha256'); assert.ok(Object.isFrozen(parsed)); assert.ok(Object.isFrozen(parsed.args));
});

test('parser rejects shell syntax, multiline input, unsupported arguments, secrets and oversized input without repeating it', () => {
  for (const raw of ['', '   ', 'mine now', 'mine;stop', 'help\nstop', 'status\r', 'stop\0', 'eval(secret)', 'https://example.invalid', 'algorithm sha512', 'algorithm __proto__', 'intensity turbo', 'repeat', 'repeat true', 'repeat on off', 'connect 0xprivate', 'a'.repeat(161), null, {}]) {
    assert.throws(() => parseDvcCommand(raw), error => /Type help/.test(error.message) && !error.message.includes('0xprivate'));
  }
});

test('console starts inert and disabled, with named input and an accessible output log', async () => {
  const f = fixture();
  try {
    assert.match(f.host.textContent, /GITTIT::GODDIT/); assert.equal(f.input.disabled, true); assert.equal(f.button('run').disabled, true);
    assert.equal(f.input.maxLength, 160); assert.equal(f.input.getAttribute('aria-label'), 'GITTIT::GODDIT command'); assert.ok(f.input.getAttribute('aria-describedby'));
    assert.equal(f.log.getAttribute('role'), 'log'); assert.equal(f.log.getAttribute('aria-label'), 'Command output and errors'); assert.equal(f.log.getAttribute('aria-live'), 'polite'); assert.equal(f.log.tabIndex, 0);
    f.submit('mine'); await flush(); assert.equal(f.calls.length, 0);
    f.ui.setEnabled(true); assert.equal(f.input.disabled, false); assert.equal(f.button('run').disabled, false);
    assert.match(f.field('state').textContent, /Ready/);
  } finally { f.ui.destroy(); }
});

test('Enter submits once, clears input and displays distinct normalized input and output', async () => {
  const f = fixture();
  try {
    f.ui.setEnabled(true); const event = f.submit('  ALGORITHM SHA256D  ', true); await flush();
    assert.equal(event.defaultPrevented, true); assert.equal(f.calls.length, 1); assert.deepEqual(f.calls[0], { command: 'algorithm', args: ['sha256d'] }); assert.equal(f.input.value, '');
    assert.ok(f.entries().some(row => row.dataset.level === 'input' && row.textContent === 'INPUTalgorithm sha256d'));
    assert.ok(f.entries().some(row => row.dataset.level === 'output' && row.textContent.includes('Finished algorithm.')));
  } finally { f.ui.destroy(); }
});

test('unknown or oversize input and exception messages never leak into the console', async () => {
  const errors = [], secret = 'wallet-private-fixture-secret';
  const f = fixture({ execute() { throw Error(secret); }, onError: message => errors.push(message) });
  try {
    f.ui.setEnabled(true);
    for (const text of ['connect ' + secret, secret.repeat(20), '<img src=x onerror=secret>', 'mine; ' + secret]) { f.submit(text); await flush(); }
    assert.equal(f.calls.length, 0); assert.equal(f.input.value, ''); assert.doesNotMatch(f.text(), /wallet-private|<img|onerror/);
    f.submit('status'); await flush(); assert.equal(f.calls.length, 1); assert.doesNotMatch(f.text(), /wallet-private/); assert.match(f.text(), /Command could not finish/);
    assert.ok(f.entries().some(row => row.dataset.level === 'error')); assert.ok(errors.every(message => !message.includes(secret)));
  } finally { f.ui.destroy(); }
});

test('known output is rendered as text, not HTML, and strips control characters that could disguise labels', () => {
  const f = fixture();
  try {
    f.ui.write('<img src=x onerror="throw 1">\n<script>danger()</script>\u202eERROR\0', 'error');
    const row = f.entries().at(-1); assert.equal(row.dataset.level, 'error'); assert.match(row.textContent, /<img/); assert.doesNotMatch(row.textContent, /[\u202e\0]/);
    assert.equal(row.children.length, 2); assert.equal(row.children[1].tagName, 'span'); assert.equal(row.children[1].children.length, 0);
    f.ui.write('ordinary', 'error"><img'); assert.equal(f.entries().at(-1).dataset.level, 'output');
  } finally { f.ui.destroy(); }
});

test('output remains bounded by entry count, message size and UTF-8 bytes', () => {
  const f = fixture();
  try {
    for (let i = 0; i < 150; i++) f.ui.write(`line ${i}`);
    assert.equal(f.entries().length, 100); assert.doesNotMatch(f.text(), /line 0(?:OUTPUT|$)/); assert.match(f.text(), /line 149/);
    for (let i = 0; i < 60; i++) f.ui.write('🍄'.repeat(3000));
    const total = f.entries().reduce((sum, row) => sum + new TextEncoder().encode(row.dataset.level + ': ' + row.children[1].textContent).byteLength, 0);
    assert.ok(total <= 24 * 1024); assert.ok(f.entries().every(row => row.children[1].textContent.length <= 2048)); assert.ok(f.entries().length <= 100);
  } finally { f.ui.destroy(); }
});

test('live output appends new rows and removes only evicted entries without reinserting existing messages', () => {
  const f = fixture();
  try {
    const initial = f.entries()[0];
    f.ui.write('first progress'); const first = f.entries()[1];
    f.ui.write('second progress');
    assert.equal(f.entries()[0], initial); assert.equal(f.entries()[1], first);
    assert.equal(initial.attachmentCount, 1); assert.equal(first.attachmentCount, 1);
    for (let i = 0; i < 98; i++) f.ui.write(`later ${i}`);
    assert.equal(initial.parentNode, null); assert.equal(f.entries()[0], first); assert.equal(first.parentNode, f.log);
    assert.equal(first.attachmentCount, 1); assert.ok(f.entries().every(row => row.attachmentCount === 1));
  } finally { f.ui.destroy(); }
});

test('a pending mining command does not queue another action and still permits Stop and bounded status requests', async () => {
  const mine = deferred(), stop = deferred(), status = deferred(), balance = deferred();
  const gates = { mine, stop, status, balance }, f = fixture({ execute: parsed => gates[parsed.command]?.promise ?? 'done' });
  try {
    f.ui.setEnabled(true); f.submit('mine'); f.submit('mine'); f.submit('connect');
    f.submit('status'); f.submit('status'); f.submit('balance'); f.submit('stop'); f.submit('stop');
    assert.deepEqual(f.calls.map(call => call.command), ['mine', 'status', 'balance', 'stop']); assert.equal(f.input.disabled, false); assert.equal(f.button('run').disabled, false);
    f.submit('help'); assert.match(f.text(), /start mining with the current options/); assert.match(f.text(), /repeat on \| off/); assert.equal(f.calls.length, 4);
    stop.resolve('Stopped.'); mine.resolve('Mining stopped.'); status.resolve('Node ready.'); balance.resolve('Balance ready.'); await flush();
    assert.match(f.text(), /Stopped\./); assert.match(f.field('state').textContent, /Ready/);
    assert.equal(f.calls.length, 4, 'Blocked commands must not be replayed after the pending work settles.');
  } finally { for (const gate of Object.values(gates)) gate.resolve(); f.ui.destroy(); }
});

test('repeat off is available during pending mining and a pending repeat on command without starting extra mining', async () => {
  const mine = deferred(), on = deferred(), off = deferred();
  const f = fixture({ execute: parsed => parsed.command === 'mine' ? mine.promise : parsed.args[0] === 'on' ? on.promise : off.promise });
  try {
    f.ui.setEnabled(true); f.submit('mine'); f.submit('repeat on'); f.submit('repeat off'); f.submit('repeat off');
    assert.deepEqual(f.calls, [{ command: 'mine', args: [] }, { command: 'repeat', args: ['on'] }, { command: 'repeat', args: ['off'] }]);
    off.resolve('Keep mining is off.'); on.resolve('Keep mining was enabled.'); mine.resolve('Stopped.'); await flush();
    assert.equal(f.calls.filter(call => call.command === 'mine').length, 1); assert.match(f.text(), /Keep mining is off/); assert.match(f.field('state').textContent, /Ready/);
  } finally { mine.resolve(); on.resolve(); off.resolve(); f.ui.destroy(); }
});

test('clear removes the transcript and pending old command output without canceling the command', async () => {
  const gate = deferred(), f = fixture({ execute: () => gate.promise });
  try {
    f.ui.setEnabled(true); f.submit('refresh'); f.submit('clear'); assert.equal(f.calls.length, 1); assert.equal(f.text(), 'OUTPUTConsole cleared.');
    gate.resolve('old refresh result'); await flush(); assert.doesNotMatch(f.text(), /old refresh/); assert.equal(f.calls.length, 1);
    f.ui.write('next event'); assert.match(f.text(), /next event/); f.clear.dispatchEvent(new Event('click')); assert.equal(f.text(), 'OUTPUTConsole cleared.');
  } finally { gate.resolve(); f.ui.destroy(); }
});

test('disabling clears unsubmitted input and ignores stale completions after reactivation', async () => {
  const gate = deferred(), f = fixture({ execute: () => gate.promise });
  try {
    f.ui.setEnabled(true); f.submit('refresh'); f.input.value = 'discard this'; f.ui.setEnabled(false);
    assert.equal(f.input.value, ''); assert.equal(f.input.disabled, true); f.submit('mine'); assert.equal(f.calls.length, 1);
    f.ui.setEnabled(true); gate.resolve('stale result'); await flush(); assert.doesNotMatch(f.text(), /stale result/); assert.match(f.field('state').textContent, /Ready/);
  } finally { gate.resolve(); f.ui.destroy(); }
});

test('destroy removes input handlers and output, and late failures remain silent', async () => {
  const gate = deferred(), errors = [], f = fixture({ execute: () => gate.promise, onError: message => errors.push(message) });
  f.ui.setEnabled(true); f.submit('mine'); f.ui.destroy(); f.ui.destroy(); assert.equal(f.host.children.length, 0); assert.equal(f.log.children.length, 0);
  f.submit('status'); f.ui.write('not visible'); f.ui.setEnabled(true); gate.reject(Error('private late failure')); await flush();
  assert.equal(f.calls.length, 1); assert.equal(f.host.children.length, 0); assert.equal(errors.length, 0);
});
