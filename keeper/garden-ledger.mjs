import { readFile, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { hash, sign, checkSignature, EPOCH, random, b64 } from './public/core.mjs';
import { recipe, mushroomId, gardenHour, pendingCoins, verifyGardenRequest, DECORATIONS, GARDEN_FORMAT, HOUR } from './public/mushroom-core.mjs';
import { MINING_FORMAT, MINING_RULES, verifyMiningWork } from './public/mushroom-mining.mjs';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const amount = n => Number.isSafeInteger(n) && n > 0 && n <= 1000000000;
const owns = (state, id, owner) => {
  const m = state.mushrooms[id];
  if (!m || m.owner !== owner) throw fail('This mushroom is not in your garden.', 403);
  return m;
};
const ownedCount = (s, owner) => Object.values(s.mushrooms).filter(m => m.owner === owner).length;
const fresh = () => ({ balance: 0, sequence: 0, lastRequest: null, lastReceipt: null });

// One Keeper is the authority for one garden. Atomic, signed snapshots and a
// serialized mutation queue prevent concurrent payments and retries double-spending.
// No consensus, cross-Keeper exchange, cash redemption or trusted external clock.
export async function createGardenLedger({ dataDir, identity, now = Date.now, writeSnapshot } = {}) {
  const file = path.join(dataDir, 'garden-ledger.json');
  let state = { format: GARDEN_FORMAT, issuer: identity.fingerprint, revision: 0, lastTime: 0, minted: 0, spent: 0, accounts: {}, mushrooms: {}, history: [] };
  try {
    const envelope = JSON.parse(await readFile(file, 'utf8'));
    if (!await checkSignature(envelope.record, envelope.signature, identity.publicKey) || envelope.record.issuer !== identity.fingerprint || envelope.record.format !== GARDEN_FORMAT) throw Error('Garden ledger signature failed. Restore its matching Keeper backup.');
    state = envelope.record;
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  let queue = Promise.resolve();
  const signed = async record => ({ record, publicKey: identity.publicKey, signature: await sign(record, identity.privateKey) });
  async function save(next) {
    const bytes = JSON.stringify(await signed(next));
    if (writeSnapshot) return writeSnapshot(bytes);
    const temp = file + '.next';
    const handle = await open(temp, 'w', 0o600);
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    try { await rename(temp, file); } catch (e) { await unlink(temp).catch(() => {}); throw e; }
  }
  function clock(s) {
    const time = now();
    if (!Number.isSafeInteger(time) || time < EPOCH) throw fail('The Keeper clock needs correcting.', 503);
    return Math.max(time, s.lastTime); // A backward clock never awards the same hour twice.
  }
  function settle(s, owner, time) {
    let coins = 0;
    for (const m of Object.values(s.mushrooms)) if (m.owner === owner) {
      const due = pendingCoins(m, time); coins += due;
      if (due) m.paidThrough = gardenHour(time);
    }
    if (!Number.isSafeInteger(s.minted + coins) || !Number.isSafeInteger(s.accounts[owner].balance + coins)) throw fail('The garden reached its coin limit.');
    s.accounts[owner].balance += coins; s.minted += coins;
    return coins;
  }
  async function info() {
    return signed({ format: GARDEN_FORMAT, issuer: identity.fingerprint, kind: 'info', time: now(), rate: 1, hourMs: HOUR,
      currency: 'Doodle Coins', maxMushrooms: 100, decorations: DECORATIONS,
      mining: { algorithm: MINING_FORMAT, reward: MINING_RULES.reward, difficulty: MINING_RULES.difficulty, lifetimeMs: MINING_RULES.lifetimeMs } });
  }
  function view(owner, requestId) {
    const time = clock(state), account = state.accounts[owner] || fresh();
    const mushrooms = Object.values(state.mushrooms).filter(m => m.owner === owner);
    return signed({ format: GARDEN_FORMAT, issuer: identity.fingerprint, requestId, kind: 'account', owner, time,
      revision: state.revision, joined: Boolean(state.accounts[owner]), balance: account.balance, sequence: account.sequence,
      pending: mushrooms.reduce((n, m) => n + pendingCoins(m, time), 0), mushrooms,
      mining: { lastClaimedHour: account.lastMiningHour ?? null,
        challenge: account.miningChallenge?.record.expiresAt > time ? account.miningChallenge : null,
        reward: MINING_RULES.reward, difficulty: MINING_RULES.difficulty },
      market: Object.values(state.mushrooms).filter(m => m.price !== null).slice(0, 200),
      history: state.history.filter(e => e.record.owner === owner || e.record.result.to === owner).slice(-30).reverse() });
  }
  async function process(proof, readOnly) {
    if (!await verifyGardenRequest(proof, identity.fingerprint)) throw fail('The player signature or garden identity does not match.', 403);
    const r = proof.record, owner = r.owner, id = await hash(r);
    if (readOnly && r.action !== 'account') throw fail('Invalid account request.');
    if (!readOnly && r.action === 'account') throw fail('Use the account endpoint.');
    const account = state.accounts[owner];
    // An exact retry is safe even after expiry. A changed payload at the same
    // sequence never counts as a retry, and older sequences cannot be replayed.
    if (!readOnly && account?.lastRequest === id) return account.lastReceipt;
    if (Math.abs(now() - r.createdAt) > 300000) throw fail('Request expired. Refresh the garden and try again.', 409);
    if (readOnly) return view(owner, id);
    if (r.sequence !== (account?.sequence || 0) + 1) throw fail('Your balance changed in another tab. Refresh before trying again.', 409);
    if (!account && r.action !== 'join') throw fail('Join this garden first.');
    if (state.revision >= 100000) throw fail('This garden reached its 100,000-action limit. Export a Keeper backup.', 503);
    const next = structuredClone(state), time = clock(next), a = r.args;
    if (!next.accounts[owner]) {
      if (Object.keys(next.accounts).length >= 1000) throw fail('This garden has reached its 1,000-player limit.');
      next.accounts[owner] = fresh();
    }
    const wallet = next.accounts[owner];
    let earned = settle(next, owner, time), result = { action: r.action, earned };
    if (r.action === 'join') {
      if (account) throw fail('You already joined this garden.');
    } else if (r.action === 'plant') {
      if (ownedCount(next, owner) >= 100 || Object.keys(next.mushrooms).length >= 2000) throw fail('Garden capacity reached (100 per player; 2,000 total).');
      const normalized = recipe(a.recipe), mid = await mushroomId(normalized);
      if (next.mushrooms[mid]) throw fail('That exact mushroom already has a generator in this garden. Renaming or copying it cannot make another.', 409);
      if (a.rightsConfirmed !== true || typeof a.credit !== 'string' || !a.credit.trim() || a.credit.length > 200) throw fail('Confirm your right to use this recipe and keep its creator credit.');
      // First full UTC tick after planting: no coins for a partially owned hour.
      next.mushrooms[mid] = { id: mid, recipe: normalized, owner, creator: owner, credit: a.credit.trim(), plantedAt: time,
        paidThrough: Math.ceil((time - EPOCH) / HOUR), decorations: [], price: null };
      result.mushroom = mid;
    } else if (r.action === 'harvest') {
      if (!earned) throw fail('No completed mushroom hours to collect yet.');
    } else if (r.action === 'mining-challenge') {
      const m = owns(next, a.id, owner), hour = gardenHour(time);
      if (wallet.lastMiningHour >= hour || m.lastMiningHour >= hour) throw fail('This player or mushroom already mined its bonus this UTC hour.', 409);
      const active = wallet.miningChallenge?.record;
      if (!active || active.mushroom !== m.id || active.ownershipRevision !== (m.ownershipRevision || 0) || active.expiresAt <= time) {
        wallet.miningChallenge = await signed({ format: GARDEN_FORMAT, issuer: identity.fingerprint, kind: 'mining-challenge',
          algorithm: MINING_FORMAT, owner, mushroom: m.id, ownershipRevision: m.ownershipRevision || 0,
          challengeId: b64(random(16)), hour, issuedAt: time,
          expiresAt: Math.min(time + MINING_RULES.lifetimeMs, EPOCH + (hour + 1) * HOUR),
          difficulty: MINING_RULES.difficulty, reward: MINING_RULES.reward });
      }
      result = { ...result, challenge: wallet.miningChallenge };
    } else if (r.action === 'mining-claim') {
      const challenge = wallet.miningChallenge?.record;
      if (!challenge || a.challengeId !== challenge.challengeId) throw fail('This mining challenge was used, replaced or belongs to another player.', 409);
      const m = owns(next, challenge.mushroom, owner), hour = gardenHour(time);
      if (challenge.owner !== owner || challenge.issuer !== identity.fingerprint || challenge.ownershipRevision !== (m.ownershipRevision || 0)) throw fail('Mushroom ownership changed. Start a new mining attempt.', 409);
      if (time >= challenge.expiresAt || hour !== challenge.hour) throw fail('This mining challenge expired. Start a new attempt.', 409);
      if (wallet.lastMiningHour >= hour || m.lastMiningHour >= hour) throw fail('This player or mushroom already mined its bonus this UTC hour.', 409);
      if (!await verifyMiningWork(challenge, a.nonce)) throw fail('The mining proof did not meet its signed target.');
      const reward = MINING_RULES.reward;
      if (!Number.isSafeInteger(wallet.balance + reward) || !Number.isSafeInteger(next.minted + reward) || !Number.isSafeInteger((next.mined || 0) + reward)) throw fail('The garden reached its coin limit.');
      wallet.balance += reward; next.minted += reward; next.mined = (next.mined || 0) + reward;
      wallet.lastMiningHour = hour; m.lastMiningHour = hour; wallet.miningChallenge = null;
      result = { ...result, mined: reward, mushroom: m.id };
    } else if (r.action === 'send') {
      if (!amount(a.amount) || !/^[\w-]{43}$/.test(a.to || '') || a.to === owner || !next.accounts[a.to]) throw fail('Choose another player who has joined this garden and a whole positive coin amount.');
      if (wallet.balance < a.amount) throw fail('Not enough coins.');
      if (!Number.isSafeInteger(next.accounts[a.to].balance + a.amount)) throw fail('Recipient balance limit reached.');
      wallet.balance -= a.amount; next.accounts[a.to].balance += a.amount;
      result = { ...result, amount: a.amount, to: a.to };
    } else if (r.action === 'decorate') {
      const m = owns(next, a.id, owner), item = Object.hasOwn(DECORATIONS, a.item) ? DECORATIONS[a.item] : null;
      if (!item || m.decorations.includes(a.item)) throw fail('Choose a decoration this mushroom does not already own.');
      if (wallet.balance < item.price) throw fail('Not enough coins.');
      wallet.balance -= item.price; next.spent += item.price; m.decorations.push(a.item);
      result = { ...result, amount: item.price, mushroom: a.id, item: a.item };
    } else if (r.action === 'list') {
      const m = owns(next, a.id, owner);
      if (a.price !== null && !amount(a.price)) throw fail('Use a whole positive price, or remove the listing.');
      m.price = a.price; result = { ...result, mushroom: a.id, amount: a.price };
    } else if (r.action === 'buy') {
      const m = next.mushrooms[a.id];
      if (!m || m.owner === owner || m.price === null || a.price !== m.price || a.seller !== m.owner) throw fail('That listing changed. Refresh the market.', 409);
      if (ownedCount(next, owner) >= 100) throw fail('Your garden is full.');
      if (wallet.balance < m.price) throw fail('Not enough coins.');
      const seller = m.owner;
      settle(next, seller, time);
      if (!Number.isSafeInteger(next.accounts[seller].balance + m.price)) throw fail('Seller balance limit reached.');
      wallet.balance -= m.price; next.accounts[seller].balance += m.price;
      result = { ...result, mushroom: a.id, amount: m.price, to: seller };
      m.owner = owner; m.price = null;
      m.ownershipRevision = (m.ownershipRevision || 0) + 1;
      m.paidThrough = Math.ceil((time - EPOCH) / HOUR);
    } else throw fail('Unknown garden action.');
    wallet.sequence = r.sequence; next.revision++; next.lastTime = time;
    const receipt = await signed({ format: GARDEN_FORMAT, issuer: identity.fingerprint, requestId: id, kind: 'receipt', owner,
      sequence: r.sequence, revision: next.revision, time, balance: wallet.balance, result });
    wallet.lastRequest = id; wallet.lastReceipt = receipt;
    next.history.push(receipt);
    // Recent activity is bounded; balances and all generator paidThrough counters
    // remain authoritative. Downloaded signed receipts are independently checkable.
    if (next.history.length > 2000) next.history = next.history.slice(-2000);
    const balances = Object.values(next.accounts).reduce((n, v) => n + v.balance, 0);
    if (!Number.isSafeInteger(balances) || balances + next.spent !== next.minted) throw Error('Coin conservation check failed.');
    await save(next); state = next;
    return receipt;
  }
  function dispatch(proof, readOnly = false) {
    const job = queue.then(() => process(proof, readOnly)); queue = job.catch(() => {}); return job;
  }
  return { info, dispatch, idle: () => queue };
}
