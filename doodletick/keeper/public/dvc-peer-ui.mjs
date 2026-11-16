import { ArcadeLink } from './arcade-link.mjs';
import { SpirographAuth } from './spirograph-auth.mjs';
import { genesis, MAIN_NETWORK_ID } from './dvc-core.mjs';
import { createDvcApi, createDvcRpc, createDvcSync } from './dvc-sync.mjs';

class DvcLink extends ArcadeLink {
  async authenticate(offer, answer) {
    this.auth = await SpirographAuth.create(offer, answer, {
      peer: this.remote, purpose: 'Doodleverse Coin peer',
      onVerified: () => { if (!this.closed) this.onOpen(this); }, onReject: reason => this.close(reason)
    });
  }
}

export function createDvcPeerUI(container, { getIdentity, onUnlockRequest = () => {}, onActivity = () => {}, local = createDvcApi(), Link = DvcLink } = {}) {
  container.innerHTML = `<details class="dvc-peer"><summary>Connect another Doodleverse node</summary>
    <p>Pair with a friend to exchange mined blocks and signed payments. Each Keeper checks the proof and keeps the chain with the most verified work.</p>
    <p>Both people open their own Keeper, unlock their creator vault, exchange codes, and compare the spirograph. Keep both Coin pages open. Direct connections need a reachable route, such as the same local network; no public relay is configured.</p>
    <div class="arc-actions"><button type="button" class="button primary" data-dvc-offer>Create invitation</button><button type="button" class="button quiet" data-dvc-leave disabled>Disconnect</button></div>
    <label>Your connection code<textarea data-dvc-out readonly rows="3" aria-label="Your DVC connection code"></textarea></label>
    <button type="button" class="button quiet" data-dvc-copy>Copy code</button>
    <label>Friend’s connection code<textarea data-dvc-in rows="3" maxlength="65000" aria-label="Friend’s DVC connection code"></textarea></label>
    <div class="arc-actions"><button type="button" class="button quiet" data-dvc-accept>Accept invitation</button><button type="button" class="button quiet" data-dvc-finish>Use friend’s answer</button></div>
    <p data-dvc-peer-status role="status">No peer connected. Mining here alone creates a local branch until you exchange it with peers.</p>
  </details>`;
  const el = name => container.querySelector(`[data-dvc-${name}]`);
  let link, rpc, controller, timer, active = false, generation = 0, working = false, actionGeneration = 0;
  const status = text => { el('peer-status').textContent = text; };
  function disconnect(reason = 'Peer disconnected.') {
    generation++; clearTimeout(timer); controller?.abort(); controller = null; rpc?.close(); rpc = null;
    const previous = link; link = null; previous?.close(reason); el('leave').disabled = true;
    el('out').value = ''; el('in').value = ''; status(reason);
  }
  async function connected(current, token) {
    if (token !== generation || link !== current) return;
    controller = new AbortController();
    const sync = createDvcSync({ local, remote: (...args) => rpc.request(...args), networkId: MAIN_NETWORK_ID, genesisHash: genesis().hash });
    const round = async () => {
      if (token !== generation) return;
      try {
        const result = await sync.round({ signal: controller.signal });
        if (token !== generation) return;
        status(`Connected to @${current.remote.username}. Your height: ${result.height}. Peer height: ${result.peerHeight}. ${result.converged ? 'Both nodes agree on the tip.' : 'Syncing or checking competing branches.'}`);
        timer = setTimeout(round, 15000);
      } catch (error) { if (token === generation) disconnect('Peer sync stopped: ' + error.message); }
    };
    void round();
  }
  function start(role) {
    if (!active || document.hidden) throw new Error('Open the Coin page before pairing.');
    const identity = getIdentity?.();
    if (!identity) { onUnlockRequest(); throw new Error('Unlock your creator vault to authenticate this peer.'); }
    disconnect('Preparing a signed connection…'); const token = generation;
    actionGeneration = token;
    link = new Link({ identity, role, room: 'dvc-' + MAIN_NETWORK_ID.slice(0, 24),
      onOpen: current => void connected(current, token),
      onPacket: packet => rpc?.receive(packet),
      onError: message => { if (token === generation) status(message); },
      onClose: reason => { if (token === generation) disconnect(reason); }
    });
    const current = link;
    rpc = createDvcRpc({ send: packet => current.send(packet), local }); el('leave').disabled = false;
    return { current, token };
  }
  async function action(run) {
    if (working) return; working = true; actionGeneration = generation; onActivity();
    try { await run(); } catch (error) { if (actionGeneration === generation && active && !document.hidden) status(error.message); }
    finally { working = false; }
  }
  el('offer').onclick = () => action(async () => {
    const { current, token } = start('host'); const code = await current.offer();
    if (token === generation) { el('out').value = code; status('Send your invitation to your friend. Paste their answer below.'); }
  });
  el('accept').onclick = () => action(async () => {
    const code = el('in').value.trim(); if (!code) throw new Error('Paste your friend’s invitation first.');
    const { current, token } = start('guest'); const answer = await current.accept(code);
    if (token === generation) { el('out').value = answer; status('Send this answer to your friend, then compare the spirographs.'); }
  });
  el('finish').onclick = () => action(async () => {
    if (!link || link.role !== 'host') throw new Error('Create an invitation first.');
    const current = link, token = generation;
    await current.finish(el('in').value.trim());
    if (token === generation && current === link) status('Compare the spirograph and every code group with your friend.');
  });
  el('leave').onclick = () => disconnect();
  el('copy').onclick = () => action(async () => { if (!el('out').value) throw new Error('Create a connection code first.'); await navigator.clipboard.writeText(el('out').value); status('Connection code copied.'); });
  const visibility = () => { if (document.hidden && link) disconnect('Peer stopped because this page is hidden. Reconnect when ready.'); };
  document.addEventListener('visibilitychange', visibility);
  return {
    get connected() { return Boolean(link?.auth?.verified && !link.closed && rpc); },
    setActive(value) { active = Boolean(value); if (!active && link) disconnect('Peer stopped because you left the Coin page.'); },
    disconnect,
    destroy() { disconnect(); document.removeEventListener('visibilitychange', visibility); container.replaceChildren(); }
  };
}
