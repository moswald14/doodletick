import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
export function safeLoginURL(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && u.hostname === 'login.tailscale.com' && !u.username && !u.password && !u.port ? u.href : null; }
  catch { return null; }
}
export function createTailscaleControl(hostname, execute = exec) {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(hostname)) throw new Error('Invalid Tailscale hostname.');
  let connecting = null;
  async function status() {
    let stdout;
    try { ({ stdout } = await execute('tailscale', ['status', '--json'], { timeout: 4000, maxBuffer: 4 * 1024 * 1024 })); }
    catch (e) { stdout = e.stdout; }
    try {
      const s = JSON.parse(stdout);
      return { state: s.BackendState || 'Unavailable', connected: s.BackendState === 'Running' && s.Self?.Online === true,
        loginURL: safeLoginURL(s.AuthURL), hostname, connecting: Boolean(connecting) };
    } catch { return { state: 'Starting', connected: false, loginURL: null, hostname, connecting: Boolean(connecting) }; }
  }
  function connect() {
    if (!connecting) connecting = execute('tailscale', ['up', '--hostname=' + hostname, '--accept-dns=false', '--accept-routes=false', '--ssh=false', '--timeout=15s'],
      { timeout: 20000, maxBuffer: 65536 }).catch(() => {}).finally(() => { connecting = null; });
    return connecting;
  }
  return { status, connect };
}
