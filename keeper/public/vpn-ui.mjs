import { vpnStatus } from './vpn-transport.mjs';
export function createVpnUI() {
  const panel = document.createElement('section'); panel.className = 'vpn-panel'; panel.setAttribute('aria-label', 'Private network');
  panel.innerHTML = `<div><span class="eyebrow">YOUR PRIVATE NETWORK</span><h2 id="vpn-title">Checking the connection…</h2><p id="vpn-message" role="status">Games and shared files connect through Tailscale.</p></div><div class="vpn-actions"><button id="vpn-refresh" class="button quiet">Check connection ↻</button><details><summary>Set up the private network</summary><ol><li>Install Tailscale on each computer and sign in.</li><li>Invite your friends into the same Tailscale network.</li><li>Run this Keeper on each computer. Share a room code to play.</li></ol><p>Solo practice and your vault work without a connection.</p><a href="https://tailscale.com/download/windows" target="_blank" rel="noopener noreferrer">Get Tailscale ↗</a> · <a href="https://login.tailscale.com/admin/users" target="_blank" rel="noopener noreferrer">Manage members ↗</a></details></div>`;
  document.querySelector('main').insertBefore(panel, document.querySelector('main .topbar').nextSibling);
  let busy = false;
  async function refresh() {
    if (busy) return; busy = true;
    try {
      const s = await vpnStatus();
      document.getElementById('vpn-title').textContent = s.ready ? 'Your private network is ready.' : 'Connect your private network.';
      document.getElementById('vpn-message').textContent = s.ready ? `${s.name} · ${s.peers.length} other online ${s.peers.length === 1 ? 'computer' : 'computers'} · ${s.network}` : s.message;
      panel.classList.toggle('connected', s.ready);
      const select = document.getElementById('arc-broker');
      if (select) {
        const previous = select.value; select.replaceChildren(new Option('This computer', 'self'));
        for (const p of s.peers || []) select.add(new Option(p.name + ' · ' + p.ip, p.ip));
        if ([...select.options].some(o => o.value === previous)) select.value = previous;
      }
    } catch { document.getElementById('vpn-title').textContent = 'Private network is offline.'; document.getElementById('vpn-message').textContent = 'Start the Keeper on this computer to connect. Solo practice and your saved work are available.'; panel.classList.remove('connected'); }
    finally { busy = false; }
  }
  document.getElementById('vpn-refresh').onclick = refresh;
  const timer = setInterval(() => { if (!document.hidden) refresh(); }, 15000);
  window.addEventListener('pagehide', () => clearInterval(timer), { once: true }); refresh();
}
