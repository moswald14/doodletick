// Test-only simulated VPN adapter. Production has no environment flag or HTTP
// route that enables it. The peer services and browser traffic remain real HTTP.
import http from 'node:http';
import path from 'node:path';
import { createKeeperServer } from '../server.mjs';
export function statusFixture(ip = '100.64.0.1', ips = ['100.64.0.1', '100.64.0.2', '100.64.0.3']) {
  const peer = address => ({ DNSName: 'keeper-' + address.split('.').at(-1) + '.test.ts.net.', HostName: 'Keeper ' + address.split('.').at(-1), TailscaleIPs: [address], Online: true });
  return { BackendState: 'Running', TUN: true, Self: peer(ip), CurrentTailnet: { MagicDNSSuffix: 'test.ts.net' }, Peer: Object.fromEntries(ips.filter(p => p !== ip).map(p => [p, peer(p)])) };
}
export async function simulatedKeepers(dir, count = 3, intercept = (request, send) => send(request)) {
  const nodes = [], routed = [], lookup = new Map();
  const requestPeer = ({ ip, source, route, method = 'GET', headers, data }) => new Promise((resolve, reject) => {
    routed.push({ ip, source, route });
    const port = lookup.get(ip)?.keeper.vpn.address()?.port;
    if (!port) { reject(new Error('Simulated VPN node disconnected.')); return; }
    const bytes = data === undefined ? null : Buffer.from(JSON.stringify(data));
    const req = http.request({ hostname: '127.0.0.1', port, method, path: route, headers: { host: `${ip}:4318`, 'x-test-ip': source, ...headers, ...(bytes ? { 'content-type': 'application/json', 'content-length': bytes.length } : {}) } }, res => { const chunks = []; res.on('data', b => chunks.push(b)); res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks)) }); } catch (e) { reject(e); } }); }); req.on('error', reject); req.end(bytes);
  });
  try {
    for (let i = 1; i <= count; i++) {
      const ip = '100.64.0.' + i, node = { ip, raw: statusFixture(ip) };
      node.keeper = await createKeeperServer({ port: 0, dataDir: path.join(dir, 'keeper-' + i), vpnOptions: { readStatus: async () => structuredClone(node.raw), interfaces: () => ({ TestAdapter: [{ address: ip, internal: false }] }), listenAddress: () => '127.0.0.1', listenPort: 0, sourceAddress: req => req.headers['x-test-ip'] || req.socket.remoteAddress, requestPeer: request => intercept(request, requestPeer), refreshMs: 3000 } });
      node.base = 'http://127.0.0.1:' + node.keeper.port; lookup.set(ip, node); nodes.push(node);
    }
    return { nodes, routed, requestPeer, close: () => Promise.all(nodes.map(n => n.keeper.close())) };
  } catch (e) { await Promise.all(nodes.map(n => n.keeper.close())); throw e; }
}
