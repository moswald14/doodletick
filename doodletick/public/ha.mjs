// Browser security and private-network enrollment are independent requirements.
export function browserSecurity({ isSecureContext, crypto, protocol } = {}) {
  if (isSecureContext !== true) return {
    ready: false, state: 'https-needed', title: 'Secure browser connection needed',
    message: protocol === 'https:'
      ? 'Open the whole Home Assistant page over trusted HTTPS, then reopen Doodle Tick. This embedded page is not in a secure browser context.'
      : 'Open Home Assistant using its configured HTTPS address, then reopen Doodle Tick. Connecting the private network does not change this browser address.'
  };
  if (!crypto?.subtle || typeof crypto.getRandomValues !== 'function') return {
    ready: false, state: 'crypto-unavailable', title: 'Browser signing is unavailable',
    message: 'This page has a secure connection, but this browser cannot provide Web Crypto. Use an up-to-date browser with cryptographic features enabled.'
  };
  return {
    ready: true, state: 'ready', title: 'Secure browser connection ready',
    message: 'This browser can unlock the vault and sign garden actions. Unlock your vault and join the selected garden to plant or trade.'
  };
}

export function safeLoginURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'login.tailscale.com' && !url.username && !url.password && !url.port ? url.href : null;
  } catch { return null; }
}

export function networkView(value) {
  if (!value || typeof value.connected !== 'boolean' || typeof value.state !== 'string') throw Error('Invalid connection status.');
  const hostname = typeof value.hostname === 'string' ? value.hostname.slice(0, 100) : 'This Keeper';
  if (value.connected) return { state: 'connected', message: `${hostname} is connected to the private network. The directory stays online when you close this page.`, loginURL: null, connect: false, busy: false };
  if (value.state === 'NeedsMachineAuth') return { state: 'approval-needed', message: 'This Keeper needs device approval in your Tailscale administration page. Approve it there, then check again.', loginURL: null, connect: false, busy: false };
  const busy = value.connecting === true || value.state === 'Starting';
  return {
    state: busy ? 'connecting' : 'disconnected',
    message: busy ? 'Preparing the private connection. Follow the sign-in link when it appears.' : `${hostname} is not connected. Sign in to the same private Tailscale network as your other Keepers.`,
    loginURL: safeLoginURL(value.loginURL), connect: true, busy
  };
}

// One request at a time prevents a slow older poll from replacing a newer state.
export function createConnectionController({ fetcher, render, timeout = 6000 }) {
  let pending = null, connecting = null, disposed = false, controller;
  const emit = view => { if (!disposed) render(view); };
  const request = connect => {
    if (disposed) return Promise.resolve();
    if (pending) return pending;
    controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    pending = Promise.resolve().then(async () => {
      try {
        if (connect) {
          emit({ state: 'connecting', message: 'Preparing your sign-in link…', loginURL: null, connect: true, busy: true });
          const started = await fetcher('./addon-api/connect', { method: 'POST', headers: { 'X-Keeper-Request': '1' }, signal: controller.signal });
          if (!started.ok) throw Error('Connection request failed.');
        }
        const response = await fetcher('./addon-api/status', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw Error('Connection check failed.');
        emit(networkView(await response.json()));
      } catch {
        emit({ state: 'unavailable', message: 'Connection check unavailable. Reopen Doodle Tick from Home Assistant if your session expired, or check again after the app restarts.', loginURL: null, connect: false, busy: false });
      } finally { clearTimeout(timer); pending = null; }
    });
    return pending;
  };
  return {
    refresh: () => request(false),
    connect() {
      if (!connecting) connecting = (pending || Promise.resolve()).then(() => request(true)).finally(() => { connecting = null; });
      return connecting;
    },
    dispose() { disposed = true; controller?.abort(); }
  };
}

export function mountHomeAssistantPanel({ document, window, fetcher = window.fetch.bind(window) }) {
  const box = document.getElementById('ha-connection');
  if (!box) return;
  // All markup is fixed. Device names and service responses are assigned as text.
  box.innerHTML = `<h2>Your always-on Keeper</h2>
    <div class="ha-checks">
      <section class="ha-check" id="ha-browser-check" aria-labelledby="ha-browser-title">
        <h3 id="ha-browser-title">Browser security</h3>
        <p id="ha-browser-status" class="ha-state" role="status"></p>
        <p id="ha-secure"></p>
      </section>
      <section class="ha-check" id="ha-network-check" aria-labelledby="ha-network-title">
        <h3 id="ha-network-title">Private network</h3>
        <p id="ha-status" role="status">Checking your private connection…</p>
        <button class="button quiet" id="ha-connect" type="button" hidden>Connect private network</button>
        <a id="ha-login" target="_blank" rel="noopener noreferrer" hidden>Sign in to Tailscale ↗</a>
      </section>
    </div>
    <details class="ha-help" id="ha-https-help">
      <summary>Set up a secure browser connection</summary>
      <p>Use the trusted HTTPS address already configured for Home Assistant. This app cannot discover or create that address. Changing “http” to “https” alone does not install a certificate.</p>
      <p>If Home Assistant Cloud remote access is enabled by your home's administrator, use the HTTPS address shown in its Cloud settings, sign in to Home Assistant, then reopen Doodle Tick. Cloud manages that secure connection.</p>
      <p>For access restricted to your VPN, an administrator can put Tailscale Serve in front of Home Assistant. Use Serve, keep Home Assistant sign-in, and reopen this app from its sidebar. Doodle Tick’s included VPN connects peers; it does not automatically provide HTTPS for Home Assistant.</p>
      <p><a href="https://www.home-assistant.io/docs/configuration/remote/" target="_blank" rel="noopener noreferrer">Home Assistant connection guide ↗</a> · <a href="https://tailscale.com/docs/features/tailscale-serve" target="_blank" rel="noopener noreferrer">Private HTTPS with Tailscale Serve ↗</a></p>
      <p>Keep a backup before changing addresses: browser vaults and files stay with their original browser address. Restore your own exports at the new address; do not create a replacement identity for existing balances.</p>
    </details>
    <p class="ha-actions"><button class="button quiet" id="ha-check-again" type="button">Check again</button><span id="ha-preview-note">Recipe previews and the color clock remain available while you finish setup.</span></p>`;
  const element = id => document.getElementById(id);
  const showSecurity = () => {
    const security = browserSecurity({ isSecureContext: window.isSecureContext, crypto: window.crypto, protocol: window.location.protocol });
    element('ha-browser-check').dataset.state = security.state;
    element('ha-browser-status').textContent = security.title;
    element('ha-secure').textContent = security.message;
    element('ha-https-help').hidden = security.ready;
    element('ha-preview-note').hidden = security.ready;
  };
  const control = createConnectionController({ fetcher, render(view) {
    element('ha-network-check').dataset.state = view.state;
    box.dataset.connected = String(view.state === 'connected');
    element('ha-status').textContent = view.message;
    const link = element('ha-login');
    link.hidden = !view.loginURL;
    if (view.loginURL) link.href = view.loginURL; else link.removeAttribute('href');
    element('ha-connect').hidden = !view.connect;
    element('ha-connect').disabled = view.busy;
  } });
  const refresh = () => { showSecurity(); return control.refresh(); };
  element('ha-connect').addEventListener('click', () => void control.connect());
  element('ha-check-again').addEventListener('click', () => void refresh());
  const visible = () => { if (!document.hidden) void refresh(); };
  document.addEventListener('visibilitychange', visible);
  const interval = window.setInterval(visible, 5000);
  const hide = event => { if (!event.persisted) dispose(); };
  const dispose = () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', visible); window.removeEventListener('pagehide', hide); control.dispose(); };
  window.addEventListener('pagehide', hide);
  void refresh();
  return dispose;
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') mountHomeAssistantPanel({ document, window });
