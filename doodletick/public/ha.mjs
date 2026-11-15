const box = document.getElementById('ha-connection');
const status = document.getElementById('ha-status');
const link = document.getElementById('ha-login');
const button = document.getElementById('ha-connect');
async function refresh() {
  try {
    const r = await fetch('./addon-api/status', { cache: 'no-store', signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw Error();
    const s = await r.json();
    status.textContent = s.connected ? `${s.hostname} is connected. Your room directory stays online when you close this page.` : `${s.hostname}: ${s.state}. Sign in to the same Tailscale account as your Windows Keeper.`;
    let url; try { url = new URL(s.loginURL); } catch {}
    link.hidden = !(url?.protocol === 'https:' && url.hostname === 'login.tailscale.com' && !url.username && !url.password);
    if (!link.hidden) link.href = url.href; else link.removeAttribute('href');
    button.hidden = s.connected; button.disabled = s.connecting;
    box.dataset.connected = String(s.connected);
  } catch { status.textContent = 'Connection check unavailable. Reopen the add-on if your Home Assistant session expired.'; link.hidden = true; }
}
button.addEventListener('click', async () => {
  button.disabled = true;
  try {
    const r = await fetch('./addon-api/connect', { method: 'POST', headers: { 'X-Keeper-Request': '1' }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw Error();
    status.textContent = 'Preparing your sign-in link…';
  } catch { status.textContent = 'Could not start sign-in. Try reopening the add-on.'; }
  await refresh();
});
if (!window.isSecureContext) {
  document.getElementById('ha-secure').hidden = false;
}
await refresh();
setInterval(() => { if (!document.hidden) void refresh(); }, 5000);
