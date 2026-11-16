// SPDX-License-Identifier: GPL-3.0-only
// This console accepts only the app commands below. It does not evaluate code,
// invoke a shell, retain command history, or intercept browser/provider errors.
const SIMPLE = new Set(['help', 'status', 'balance', 'wallets', 'connect', 'refresh', 'mine', 'stop', 'clear']);
const VALUES = Object.freeze({ algorithm: Object.freeze(['sha256', 'sha256d']), intensity: Object.freeze(['eco', 'balanced', 'fast']), repeat: Object.freeze(['on', 'off']) });
const INTERRUPTS = new Set(['stop', 'status', 'balance', 'repeat']);
const MAX_INPUT = 160, MAX_ENTRIES = 100, MAX_BYTES = 24 * 1024, MAX_ENTRY = 2048;
const HELP = 'help — show these commands\nstatus — show the node and mining status\nbalance — show your DVC balances\nwallets — find browser wallets\nconnect — connect the selected wallet\nrefresh — refresh the node and balances\nalgorithm sha256 | sha256d — choose the mining algorithm\nintensity eco | balanced | fast — choose GPU intensity\nrepeat on | off — turn Keep mining on or off\nmine — start mining with the current options\nstop — stop the current action and turn Keep mining off\nclear — clear this console';
let nextId = 0;

export function parseDvcCommand(value) {
  if (typeof value !== 'string' || value.length > MAX_INPUT || /[\r\n\x00-\x08\x0b-\x1f\x7f]/.test(value)) throw Error('Enter one short command. Type help for the command list.');
  const normalized = value.trim().toLowerCase();
  if (!normalized) throw Error('Enter a command. Type help for the command list.');
  const [command, ...args] = normalized.split(/[ \t]+/);
  if (SIMPLE.has(command) && args.length === 0) return Object.freeze({ command, args: Object.freeze([]) });
  if (Object.hasOwn(VALUES, command) && args.length === 1 && VALUES[command].includes(args[0])) return Object.freeze({ command, args: Object.freeze(args) });
  throw Error('Command not recognized. Type help for the command list.');
}

export function createDvcConsole(container, { execute, onError = () => {}, document: doc = container.ownerDocument ?? globalThis.document } = {}) {
  if (typeof execute !== 'function' || !doc?.createElement) throw Error('The DVC console needs an app command handler and a document.');
  let enabled = false, destroyed = false, generation = 0, logGeneration = 0, logBytes = 0;
  const entries = [], running = new Map(), encoder = new TextEncoder();
  const element = (tag, text, className) => { const node = doc.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.classList.add(className); return node; };
  const root = element('section', undefined, 'dvc-console'), header = element('div', undefined, 'dvc-console-heading');
  const title = element('h3', 'GITTIT::GODDIT'), clear = element('button', 'Clear output');
  title.id = `dvc-console-title-${++nextId}`; root.setAttribute('aria-labelledby', title.id);
  clear.type = 'button'; clear.dataset.consoleAction = 'clear';
  header.append(title, clear);
  const hint = element('p', 'Type help for commands. Output stays in this page until you clear it or close the page.', 'dvc-console-hint');
  hint.id = `dvc-console-hint-${nextId}`;
  const log = element('div', undefined, 'dvc-console-log');
  log.setAttribute('role', 'log'); log.setAttribute('aria-label', 'Command output and errors'); log.setAttribute('aria-live', 'polite'); log.setAttribute('aria-relevant', 'additions'); log.tabIndex = 0;
  log.dataset.consoleField = 'output';
  const form = element('form', undefined, 'dvc-console-form'), label = element('label', 'Command'), input = element('input'), run = element('button', 'Run');
  input.type = 'text'; input.maxLength = MAX_INPUT; input.autocomplete = 'off'; input.spellcheck = false; input.setAttribute('autocapitalize', 'off'); input.setAttribute('aria-label', 'GITTIT::GODDIT command'); input.setAttribute('aria-describedby', hint.id);
  input.placeholder = 'help'; input.dataset.consoleField = 'input'; run.type = 'submit'; run.dataset.consoleAction = 'run';
  label.append(input); form.append(label, run);
  const state = element('p', 'Open the Coin page to run a command.', 'dvc-console-state'); state.setAttribute('role', 'status'); state.dataset.consoleField = 'state';
  root.append(header, hint, log, form, state); container.replaceChildren(root);

  function render() {
    if (destroyed) return;
    input.disabled = run.disabled = !enabled;
    state.textContent = !enabled ? 'Open the Coin page to run a command.' : running.size ? 'Command running. You can still use stop, repeat off, status, balance or help.' : 'Ready for a command.';
  }
  function write(text, level = 'output') {
    if (destroyed || typeof text !== 'string' || !text) return;
    const kind = level === 'error' ? 'error' : level === 'input' ? 'input' : 'output';
    const clean = text.replace(/[\x00-\x08\x0b-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, '');
    const clipped = clean.length > MAX_ENTRY ? clean.slice(0, MAX_ENTRY - 1) + '…' : clean;
    if (!clipped) return;
    const row = element('div', undefined, 'dvc-console-entry'); row.dataset.level = kind;
    const badge = element('span', kind.toUpperCase(), 'dvc-console-kind'), content = element('span', clipped, 'dvc-console-text'); row.append(badge, content);
    const bytes = encoder.encode(kind + ': ' + clipped).byteLength;
    const follow = log.scrollTop + log.clientHeight >= log.scrollHeight - 32;
    entries.push({ node: row, bytes }); logBytes += bytes;
    while (entries.length > MAX_ENTRIES || logBytes > MAX_BYTES) { const evicted = entries.shift(); logBytes -= evicted.bytes; log.removeChild(evicted.node); }
    // Keep existing rows attached so the live log announces only new output.
    log.append(row);
    if (follow) log.scrollTop = log.scrollHeight;
  }
  function report(message) { write(message, 'error'); try { onError(message); } catch {} }
  function clearOutput() { if (destroyed) return; logGeneration++; entries.length = 0; logBytes = 0; log.replaceChildren(); input.value = ''; write('Console cleared.'); }
  async function submit(event) {
    event?.preventDefault();
    if (destroyed || !enabled) return;
    const raw = input.value; input.value = '';
    let parsed;
    try { parsed = parseDvcCommand(raw); } catch (error) { report(error.message); return; }
    // Echo only the normalized, allowlisted command. Unknown text and extra
    // arguments are discarded rather than copied into output or history.
    const { command, args } = parsed;
    if (command === 'clear') { clearOutput(); return; }
    write([command, ...args].join(' '), 'input');
    if (command === 'help') { write(HELP); return; }
    const runningKey = command === 'repeat' ? `repeat ${args[0]}` : command;
    if (running.has(runningKey) || (running.size && !INTERRUPTS.has(command))) { report('Another command is still running. Use stop or wait for it to finish.'); return; }
    const token = {}, epoch = generation, outputEpoch = logGeneration;
    running.set(runningKey, token); render();
    try {
      const output = await execute(parsed);
      if (!destroyed && enabled && epoch === generation && outputEpoch === logGeneration && typeof output === 'string') write(output);
    } catch {
      // The parent may write a known app error before rejecting. Never expose
      // arbitrary exception messages from a wallet, server or browser.
      if (!destroyed && enabled && epoch === generation && outputEpoch === logGeneration) report('Command could not finish. Check the message above and try again.');
    } finally { if (running.get(runningKey) === token) running.delete(runningKey); render(); }
  }
  const keydown = event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); void submit(event); } };
  const onSubmit = event => { void submit(event); };
  form.addEventListener('submit', onSubmit); input.addEventListener('keydown', keydown); clear.addEventListener('click', clearOutput);
  render(); write('GITTIT::GODDIT ready. Type help to see the commands.');
  return {
    write,
    setEnabled(value) { if (destroyed || enabled === Boolean(value)) return; enabled = Boolean(value); if (!enabled) { generation++; running.clear(); input.value = ''; } render(); },
    destroy() { if (destroyed) return; destroyed = true; enabled = false; generation++; logGeneration++; running.clear(); entries.length = 0; logBytes = 0; input.value = ''; log.replaceChildren(); form.removeEventListener('submit', onSubmit); input.removeEventListener('keydown', keydown); clear.removeEventListener('click', clearOutput); container.replaceChildren(); },
  };
}
