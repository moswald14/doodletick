export const VPN_PORT = 4318;
export function vpnIP(ip) {
  if (typeof ip !== 'string' || !/^100\.(?:\d{1,3}\.){2}\d{1,3}$/.test(ip)) return false;
  const parts = ip.split('.').map(Number);
  return parts[1] >= 64 && parts[1] <= 127 && parts.every(n => n <= 255) && parts.join('.') === ip;
}
export function validVpnDescription(d) {
  return Boolean(d && d.format === 'doodletick-vpn-v1' && vpnIP(d.ip) && d.port === VPN_PORT &&
    typeof d.network === 'string' && /^[a-z0-9][a-z0-9.-]{2,250}$/.test(d.network) &&
    /^[A-Za-z0-9_-]{32}$/.test(d.channel) && /^[A-Za-z0-9_-]{43}$/.test(d.token) &&
    ['doodleverse-v1', 'doodletick-files-v1'].includes(d.label));
}
