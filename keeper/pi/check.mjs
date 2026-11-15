// This check prints status only; never keys, receipts, passwords or login URLs.
const origin = 'http://127.0.0.1:4317';
try {
  const read = async route => {
    const response = await fetch(origin + route, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Keeper returned ${response.status}.`);
    return response.json();
  };
  const [app, network] = await Promise.all([read('/api/status'), read('/vpn-api/status')]);
  console.log(`Keeper ${app.version} is running.`);
  if (!network.ready || network.mode !== 'local-direct') throw new Error('The local connection service is not ready.');
  console.log('The garden and directory are local to this Keeper. No public peer port is open.');
  console.log('Use localhost through an authenticated SSH tunnel or your own trusted HTTPS access to open the browser UI.');
  console.log('Games and files pair directly between browsers. No Internet relay is configured.');
  if (process.argv.includes('--require-vpn')) { console.error('--require-vpn is obsolete: this release does not use a VPN.'); process.exitCode = 2; }
} catch (error) {
  console.error(`Keeper check failed: ${error.message}`);
  console.error('On the Pi, run: sudo journalctl -u doodletick-keeper -n 40 --no-pager');
  process.exitCode = 1;
}
