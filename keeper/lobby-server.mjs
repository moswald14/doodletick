// Compatibility entry point: public lobby hosting is intentionally disabled.
export async function createLobbyServer() { throw new Error('Public standalone lobbies are disabled. Use signed direct invitations or the directory inside the same local Keeper.'); }
if (process.argv[1]?.endsWith('lobby-server.mjs')) { console.error('Start Keeper instead. Its directory is local and does not provide Internet discovery.'); process.exitCode = 1; }
