// Compatibility entry point: public lobby hosting is intentionally disabled.
export async function createLobbyServer() { throw new Error('Use the Keeper private VPN network. Public standalone lobbies are disabled in version 0.4.'); }
if (process.argv[1]?.endsWith('lobby-server.mjs')) { console.error('Start Keeper instead. Rooms are shared only over its private VPN.'); process.exitCode = 1; }
