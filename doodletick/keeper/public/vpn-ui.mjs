import { networkStatus } from './vpn-transport.mjs';
export function createVpnUI() {
  const panel = document.createElement('section'); panel.className = 'vpn-panel'; panel.setAttribute('aria-label', 'Direct connections');
  panel.innerHTML = `<div><span class="eyebrow">YOUR DOODLEVERSE CONNECTION</span><h2 id="vpn-title">Checking this Keeper…</h2><p id="vpn-message" role="status">Your saved garden stays with this Keeper.</p></div><div class="vpn-actions"><button id="vpn-refresh" class="button quiet">Check connection ↻</button><details><summary>Pair with a friend</summary><ol><li>Use HTTPS or localhost in a browser that supports WebRTC.</li><li>Create an invitation, have your friend answer it, then paste their answer.</li><li>Compare both spirographs and every code group over a trusted call or in person.</li></ol><p>Game and file channels are encrypted. Invitations contain connection addresses: send them only to the intended friend. Direct reachability is required, usually on the same local network; this release has no Internet relay. Room directory codes work only through the same Keeper.</p></details></div>`;
  document.querySelector('main').insertBefore(panel, document.querySelector('main .topbar').nextSibling);
  let busy = false;
  async function refresh() {
    if (busy) return; busy = true;
    try {
      const state = await networkStatus(), supported = typeof globalThis.RTCPeerConnection === 'function' && globalThis.isSecureContext && Boolean(globalThis.crypto?.subtle);
      document.getElementById('vpn-title').textContent = supported ? 'Ready to make a direct invitation.' : 'Open a secure, WebRTC-capable browser.';
      document.getElementById('vpn-message').textContent = supported ? state.message : 'Use HTTPS or localhost for signed pairing. Local garden records remain saved.';
      panel.classList.toggle('connected', state.ready && supported);
      const select = document.getElementById('arc-broker');
      if (select) select.replaceChildren(new Option('This Home Assistant Keeper only', 'self'));
    } catch { document.getElementById('vpn-title').textContent = 'This Keeper is unavailable.'; document.getElementById('vpn-message').textContent = 'Reopen the app Web UI and check the Your always-on Keeper panel. Your saved work has not been changed.'; panel.classList.remove('connected'); }
    finally { busy = false; }
  }
  document.getElementById('vpn-refresh').onclick = refresh;
  const timer = setInterval(() => { if (!document.hidden) refresh(); }, 15000);
  window.addEventListener('pagehide', () => clearInterval(timer), { once: true }); refresh();
}
