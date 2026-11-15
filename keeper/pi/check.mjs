// This check prints status only; never keys, receipts, passwords or login URLs.
const origin = 'http://127.0.0.1:4317';
try {
  const read = async route => {
    const response = await fetch(origin + route, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Keeper returned ${response.status}.`);
    return response.json();
  };
  const [app, vpn] = await Promise.all([read('/api/status'), read('/vpn-api/status')]);
  console.log(`Keeper ${app.version} is running.`);
  if (vpn.ready) {
    console.log(`Private directory: ${vpn.ip}:4318`);
    console.log(`Other online computers: ${vpn.peers.length}`);
    console.log('On your PC, select this Pi under Invite friends before opening a room.');
  } else {
    console.log(`Private network is not ready: ${vpn.message || 'Connect Tailscale.'}`);
    console.log('Sign the Pi into the same Tailscale network as your PC.');
    if (process.argv.includes('--require-vpn')) process.exitCode = 2;
  }
} catch (error) {
  console.error(`Keeper check failed: ${error.message}`);
  console.error('On the Pi, run: sudo journalctl -u doodletick-keeper -n 40 --no-pager');
  process.exitCode = 1;
}
