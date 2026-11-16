// SPDX-License-Identifier: GPL-3.0-only
// Isolated native nodes, real PoW and disposable signatures; no owner data.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createDvcNode} from '../dvc-node.mjs';
import {createDvcHttpHandler} from '../dvc-http.mjs';
import {createDvcApi, createDvcRpc, createDvcSync, DVC_READ_METHODS} from '../public/dvc-sync.mjs';
import {genesis, workDigest, createTransferDraft, transferTypedData, attachTransferSignature} from '../public/dvc-core.mjs';
import {SigningKey, computeAddress, TypedDataEncoder} from '../public/recipient-crypto.mjs';

const aliceKey = new SigningKey('0x' + '1'.repeat(64));
const alice = computeAddress(aliceKey.publicKey).toLowerCase();
const bob = computeAddress(new SigningKey('0x' + '2'.repeat(64)).publicKey).toLowerCase();
const otherMiner = computeAddress(new SigningKey('0x' + '3'.repeat(64)).publicKey).toLowerCase();
const fixtureGenesis = name => genesis('doodleverse-regtest-sync-' + name, {founderAddress: alice,
  initialBaseTarget: ((1n << 252n) - 1n).toString(16).padStart(64,'0'),
  maxBaseTarget: ((1n << 254n) - 1n).toString(16).padStart(64,'0')});
const clone = value => structuredClone(value);
const json = value => new Response(JSON.stringify(value), {headers:{'content-type':'application/json'}});
const pending = () => {let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject};};

async function nodeFixture(t, g, {httpApi = false} = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dvc-sync-test-'));
  const node = await createDvcNode({dataDir:directory, genesis:g, now:() => (g.timestamp + 50000) * 1000});
  let server;
  t.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await node.close();
    assert.equal(path.dirname(directory), os.tmpdir());
    assert.match(path.basename(directory), /^dvc-sync-test-/);
    await rm(directory, {recursive:true,force:true});
  });
  const direct = async (method, params = {}, {signal} = {}) => {
    signal?.throwIfAborted();
    try {
      if (method === 'status') return node.status();
      if (method === 'locators') return node.locators();
      if (method === 'locate') return node.locate(params);
      if (method === 'chain') return node.getSegment(params);
      if (method === 'mempool') return node.getMempool();
      if (method === 'segment') return await node.ingestSegment(params);
      if (method === 'transfer') return await node.submitTransfer(params);
      throw Error('Unexpected fixture method.');
    } catch (error) {error.status = ['DVC_NONCE','DVC_BALANCE','DVC_CONFLICT','DVC_ANCESTOR'].includes(error.code) ? 409 : 400; throw error;}
  };
  let api = direct;
  if (httpApi) {
    const handler = createDvcHttpHandler({node,mutationLimit:10000});
    server = http.createServer(async (req,res) => {if (!await handler(req,res)) {res.writeHead(404);res.end();}});
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    const base = `http://127.0.0.1:${server.address().port}/`;
    api = createDvcApi({fetchImpl:(route,options) => fetch(new URL(route,base),options)});
  }
  return {node,api,direct};
}
async function mine(node, {miner = alice, algorithm = 'sha256'} = {}) {
  const job = node.createJob({miner,algorithm});
  for (let nonce=0n; nonce<1000000n; nonce++) {
    const digest = workDigest(job.prefixHex,nonce.toString(),algorithm);
    if (BigInt('0x'+digest) <= BigInt('0x'+job.targetHex)) {
      const block = {...job.block,nonce:nonce.toString(),digest};
      assert.equal((await node.submitBlock(block)).adopted,true); return block;
    }
  }
  throw Error('Fixture exhausted its real proof search.');
}
function signTransfer(g, {nonce='0',amountAtoms='2000',recipient=bob} = {}) {
  const draft = createTransferDraft({sender:alice,recipient,amountAtoms,feeAtoms:'1000',nonce,validUntilHeight:'1000'},{genesis:g});
  const typed = transferTypedData(draft,{genesis:g});
  const signature = aliceKey.sign(TypedDataEncoder.hash(typed.domain,{DoodleverseTransfer:typed.types.DoodleverseTransfer},typed.message)).serialized;
  return attachTransferSignature(draft,signature,{genesis:g});
}
const syncFor = (g, local, remote, options={}) => createDvcSync({local,remote,networkId:g.networkId,genesisHash:g.hash,...options});
function rpcPair(t, a, b) {
  const errors=[]; let left,right;
  const deliver=(peer,packet) => {queueMicrotask(() => peer.receive(clone(packet)).catch(error => errors.push(error)));return true;};
  left=createDvcRpc({local:a,send:packet=>deliver(right,packet),timeoutMs:2000});
  right=createDvcRpc({local:b,send:packet=>deliver(left,packet),timeoutMs:2000});
  t.after(()=>{left.close();right.close();assert.deepEqual(errors,[]);});
  return {fromA:(...args)=>left.request(...args),fromB:(...args)=>right.request(...args)};
}

test('two real HTTP nodes mine, synchronize, relay a signed transfer and independently confirm it', async t => {
  const g=fixtureGenesis('http'), a=await nodeFixture(t,g,{httpApi:true}), b=await nodeFixture(t,g,{httpApi:true});
  const first=await mine(a.node,{algorithm:'sha256d'});
  // RPC delivery is simulated; both APIs and nodes use real loopback HTTP.
  const rpc=rpcPair(t,a.api,b.api);
  const intoB=syncFor(g,b.api,rpc.fromB), intoA=syncFor(g,a.api,rpc.fromA);
  assert.equal((await intoB.round()).converged,true); assert.equal(b.node.status().tip.hash,first.digest);
  const signed=signTransfer(g); assert.equal((await b.node.submitTransfer(signed)).accepted,true);
  assert.equal((await intoA.round()).imported,1); assert.equal(a.node.getMempool().transactions.length,1);
  const second=await mine(a.node,{miner:otherMiner}); assert.equal(second.transactions.length,1);
  assert.equal((await intoB.round()).converged,true);
  for (const {node} of [a,b]) {
    assert.equal(node.account(bob).spendableAtoms,'2000');
    assert.equal(node.account(alice).nextNonce,'1');
    assert.equal(node.account(alice).spendableAtoms,(BigInt(g.founderAtoms)-3000n).toString());
    assert.equal(node.getMempool().transactions.length,0);
  }
});

test('bounded rounds continue a retained fork until greater work wins and then converge', async t => {
  const g=fixtureGenesis('fork'), a=await nodeFixture(t,g), b=await nodeFixture(t,g);
  for (let i=0;i<10;i++) await mine(a.node,{miner:alice});
  for (let i=0;i<20;i++) await mine(b.node,{miner:otherMiner,algorithm:'sha256d'});
  const sync=syncFor(g,a.api,b.api,{maxPages:1}), original=a.node.status().tip.hash;
  const first=await sync.round(); assert.equal(first.received,8); assert.equal(first.converged,false); assert.equal(a.node.status().tip.hash,original);
  assert.equal(a.node.status().bestCandidate.height,'8');
  const second=await sync.round(); assert.equal(second.received,8); assert.equal(second.height,'16'); assert.equal(second.converged,false);
  const third=await sync.round(); assert.equal(third.received,4); assert.equal(third.converged,true);
  assert.equal(a.node.status().tip.hash,b.node.status().tip.hash); assert.equal(a.node.status().metrics.reorganizations,1);
});

test('an equal-work competing branch stays a candidate until its next real block arrives', async t => {
  const g=fixtureGenesis('tie'), a=await nodeFixture(t,g), b=await nodeFixture(t,g);
  await mine(a.node); await mine(b.node,{miner:otherMiner});
  const old=a.node.status().tip.hash, sync=syncFor(g,a.api,b.api);
  assert.equal((await sync.round()).converged,false); assert.equal(a.node.status().tip.hash,old);
  await mine(b.node,{miner:otherMiner});
  assert.equal((await sync.round()).converged,true); assert.notEqual(a.node.status().tip.hash,old);
});

test('different genesis and malformed blocks never mutate the local verified history', async t => {
  const g=fixtureGenesis('bad-peer'), a=await nodeFixture(t,g), b=await nodeFixture(t,g);
  await mine(b.node);
  const before=a.node.status().tip;
  await assert.rejects(syncFor(g,a.api,async method => method==='status' ? {...b.node.status(),networkId:'f'.repeat(64)} : b.api(method)).round(),/different or invalid/);
  const remote=async (method,params,options) => {
    const answer=await b.api(method,params,options);
    if (method==='chain') {answer.blocks[0].digest='0'.repeat(64);}
    return answer;
  };
  await assert.rejects(syncFor(g,a.api,remote).round()); assert.deepEqual(a.node.status().tip,before);
});

test('successive bounded rounds relay more than the first eight pending transfers', async t => {
  const g=fixtureGenesis('pool'), a=await nodeFixture(t,g), b=await nodeFixture(t,g);
  for (let i=0;i<12;i++) await b.node.submitTransfer(signTransfer(g,{nonce:String(i)}));
  const sync=syncFor(g,a.api,b.api);
  for (let i=0;i<3;i++) await sync.round();
  assert.equal(a.node.getMempool().transactions.length,12);
  assert.equal(a.node.account(alice).nextNonce,'12');
});

test('a cancelled history read cannot dispatch a later local mutation even if the reader resolves', async t => {
  const g=fixtureGenesis('cancel'), a=await nodeFixture(t,g), b=await nodeFixture(t,g);
  await mine(b.node); const blocked=pending(), entered=pending(), controller=new AbortController(); let mutations=0;
  const local=async (method,params,options) => {if (['segment','transfer'].includes(method)) mutations++; return a.api(method,params,options);};
  const remote=async (method,params,options) => {if (method==='chain') {entered.resolve(); await blocked.promise; return b.node.getSegment(params);} return b.api(method,params,options);};
  const round=syncFor(g,local,remote).round({signal:controller.signal});
  const rejected=assert.rejects(round); await entered.promise; controller.abort(); blocked.resolve(); await rejected;
  assert.equal(mutations,0); assert.equal(a.node.status().tip.height,'0');
});

test('one sync controller rejects overlapping rounds and honors a pre-aborted signal', async t => {
  const g=fixtureGenesis('parallel'), a=await nodeFixture(t,g), gate=pending(); let reads=0;
  const local=async (...args) => {reads++; if(reads===1) await gate.promise; return a.api(...args);};
  const sync=syncFor(g,local,a.api), first=sync.round();
  await assert.rejects(sync.round(),/already running/); gate.resolve(); await first;
  const controller=new AbortController(); controller.abort(); const before=reads;
  await assert.rejects(sync.round({signal:controller.signal})); assert.equal(reads,before);
});

test('same-origin API fixes routes, methods and credentials and rejects ambiguous or oversized replies', async () => {
  const calls=[];
  const api=createDvcApi({fetchImpl:async (route,options) => {calls.push({route,options}); return json({ok:true});}});
  await api('chain',{from:'1',limit:8});
  assert.equal(calls[0].route,'./dvc/chain?from=1&limit=8'); assert.equal(calls[0].options.method,'GET');
  assert.equal(calls[0].options.credentials,'same-origin'); assert.equal(calls[0].options.redirect,'error'); assert.equal(calls[0].options.headers['X-Keeper-Request'],'1');
  await assert.rejects(api('https://attacker.invalid')); await assert.rejects(api('chain',{from:'01',limit:8})); await assert.rejects(api('chain',{from:'1',limit:9})); assert.equal(calls.length,1);
  for (const text of ['{"a":1,"a":2}', 'x'.repeat(600001)]) {
    const invalid=createDvcApi({fetchImpl:async () => new Response(text,{headers:{'content-type':'application/json'}})});
    await assert.rejects(invalid('status'));
  }
  const html=createDvcApi({fetchImpl:async () => new Response('<h1>Login</h1>',{headers:{'content-type':'text/html'}})});
  await assert.rejects(html('status'),/DVC data/);
});

test('peer RPC permits only public read methods and bounds packets, outstanding requests and cancellation', async () => {
  const sent=[], calls=[];
  const rpc=createDvcRpc({send:async packet => {sent.push(packet);return true;},local:async (...args) => {calls.push(args);return {ok:true};},timeoutMs:1000});
  assert.deepEqual(DVC_READ_METHODS,['status','locators','locate','chain','mempool']);
  for (const method of ['transfer','segment','block','job','eth_sendTransaction']) {
    await assert.rejects(rpc.request(method));
    await assert.rejects(rpc.receive({type:'dvc-rpc-v1',kind:'request',id:'1',method,params:{}}));
  }
  assert.equal(calls.length,0); assert.equal(sent.length,0);
  await assert.rejects(rpc.receive({type:'dvc-rpc-v1',kind:'request',id:'1',method:'status',params:{junk:'x'.repeat(600001)}}));
  const active=Array.from({length:4},()=>rpc.request('status')); const observed=active.map(p=>assert.rejects(p,/disconnected/));
  await assert.rejects(rpc.request('status')); rpc.close(); await Promise.all(observed);
  const control=new AbortController(), other=createDvcRpc({send:async()=>true,local:async()=>({}),timeoutMs:1000});
  const aborted=other.request('status',{}, {signal:control.signal}), rejection=assert.rejects(aborted,/stopped/); control.abort(); await rejection; other.close();
});

test('peer RPC read budget resets in its time window and never forwards private failures', async () => {
  let now=0, calls=0; const sent=[];
  const rpc=createDvcRpc({send:async packet=>{sent.push(packet);return true;},local:async()=>{calls++;throw Error('PRIVATE fixture diagnostic');},now:()=>now});
  for (let i=1;i<=120;i++) await rpc.receive({type:'dvc-rpc-v1',kind:'request',id:String(i),method:'status',params:{}});
  await assert.rejects(rpc.receive({type:'dvc-rpc-v1',kind:'request',id:'121',method:'status',params:{}}),/limit/);
  assert.equal(calls,120); assert.equal(JSON.stringify(sent).includes('PRIVATE'),false);
  now=60000; await rpc.receive({type:'dvc-rpc-v1',kind:'request',id:'122',method:'status',params:{}}); assert.equal(calls,121); rpc.close();
});

