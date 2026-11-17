import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { readPrivateBundle, createPrivateRoomStore, privateFramePolicy, fetchPrivateRoomNews } from '../private-rooms.mjs';
import { createKeeperServer } from '../server.mjs';
import { createIngressServer } from '../../doodletick/gateway.mjs';
import vm from 'node:vm';
import { validateUpgradeState } from '../public/mozcorp-upgrades.mjs';
const scope={module:{exports:{}},TextEncoder,crypto:globalThis.crypto};
vm.runInNewContext(await readFile(new URL('../public/doodle-bridge.js',import.meta.url),'utf8'),scope);
const B=scope.module.exports;
const sha=data=>createHash('sha256').update(data).digest('hex');

// Tiny synthetic ZIP fixture. No private station source or user saves belong in public tests.
function zip(entries){
  const locals=[],central=[];let offset=0;
  for(const [name,value]of entries){
    const n=Buffer.from(name),data=Buffer.from(value),l=Buffer.alloc(30),c=Buffer.alloc(46);
    l.writeUInt32LE(0x04034b50);l.writeUInt16LE(20,4);l.writeUInt32LE(data.length,18);l.writeUInt32LE(data.length,22);l.writeUInt16LE(n.length,26);
    c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);
    locals.push(l,n,data);central.push(c,n);offset+=l.length+n.length+data.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,directory,end]);
}
function fixture({html='<h1>Private fixture</h1><script nonce="__MOZCORP_NONCE__">void 0</script>',framePath='frames/fixture.html',extra=false,inventoryHash}={}){
  const file=Buffer.from(html),manifest={format:'mozcorp-private-bundle',version:1,private:true,noncePlaceholder:'__MOZCORP_NONCE__',protocol:'doodle-mozcorp/v1',
    stations:[{id:'fixture',title:'Private fixture',file:framePath,canonical:'fixture',startAnchor:'',private:true}],files:[{path:framePath,bytes:file.length,sha256:inventoryHash||sha(file)}],originalUpgradesUrl:'https://private.example/upgrades'};
  const bytes=zip([['manifest.json',JSON.stringify(manifest)],[framePath,file],...(extra?[['extra.txt','not listed']]:[])]);
  return{bytes,expected:{name:'Private fixture',bytes:bytes.length,sha256:sha(bytes)}};
}
async function temporary(fn){const dir=await mkdtemp(path.join(os.tmpdir(),'keeper-private-test-'));try{return await fn(dir);}finally{assert.equal(path.dirname(dir),os.tmpdir());assert(path.basename(dir).startsWith('keeper-private-test-'));await rm(dir,{recursive:true,force:true});}}
async function install(store,bytes){const start=await store.begin();let offset=0;while(offset<bytes.length){const chunk=bytes.subarray(offset,offset+262144);await store.append(start.uploadId,offset,chunk);offset+=chunk.length;}return store.finish(start.uploadId);}

test('private bundle requires the pinned whole file and verified inventory before activation',()=>{
  const f=fixture();assert.equal(readPrivateBundle(f.bytes,f.expected).stations[0].id,'fixture');
  const changed=Buffer.from(f.bytes);changed[55]^=1;assert.throws(()=>readPrivateBundle(changed,f.expected),/approved/);
  assert.throws(()=>readPrivateBundle(f.bytes.subarray(0,-1),f.expected),/approved/);
  for(const options of [{framePath:'../fixture.html'},{extra:true},{inventoryHash:'0'.repeat(64)},{html:'<script>void 0</script>'},{html:'<script nonce="__MOZCORP_NONCE__" src="https://external.example/x.js"></script>'}]){
    const invalid=fixture(options);assert.throws(()=>readPrivateBundle(invalid.bytes,invalid.expected),/Unsafe|unlisted|content check|executable/);
  }
});

test('failed chunks and replacement leave an installed bundle intact across restart',()=>temporary(async dir=>{
  const f=fixture(),store=await createPrivateRoomStore({dataDir:dir,expected:f.expected});assert.equal(store.status().installed,false);
  await install(store,f.bytes);const saved=await readFile(path.join(dir,'private-stations','bundle.zip'));
  const before=store.frame('fixture');assert.match(before.html,/<h1>Private fixture/);assert(!before.html.includes('__MOZCORP_NONCE__'));assert(!before.csp.includes('allow-same-origin'));assert.equal(before.csp,privateFramePolicy(before.csp.match(/nonce-([^']+)/)[1]));
  assert.notEqual(before.csp,store.frame('fixture').csp);assert.throws(()=>store.frame('../fixture'),/not installed/);
  const upload=await store.begin();await assert.rejects(store.append(upload.uploadId,1,Buffer.from([0])),/position/);
  const wrong=Buffer.from(f.bytes);wrong[55]^=1;await store.append(upload.uploadId,0,wrong);await assert.rejects(store.finish(upload.uploadId),/approved/);
  assert.equal(store.status().installed,true);assert.deepEqual(await readFile(path.join(dir,'private-stations','bundle.zip')),saved);
  const restarted=await createPrivateRoomStore({dataDir:dir,expected:f.expected});assert.equal(restarted.status().installed,true);
  const newer=await createPrivateRoomStore({dataDir:dir,expected:{...f.expected,sha256:'f'.repeat(64)}});assert.equal(newer.status().installed,false);assert.match(newer.status().error,/verified copy/);
}));

test('private upload and opaque frame policy survive authenticated ingress without opening other routes',()=>temporary(async dir=>{
  const f=fixture(),keeper=await createKeeperServer({dataDir:dir,port:0,privateRoomOptions:{expected:f.expected},vpnOptions:{readStatus:async()=>{throw new Error('isolated');}}});
  const gateway=createIngressServer({keeperPort:keeper.port,control:{status:async()=>({ready:true})},ingressIP:'127.0.0.1'});
  await new Promise(r=>gateway.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+gateway.address().port,local='http://127.0.0.1:'+keeper.port;
  try{
    const identity=await(await fetch(local+'/api/status')).json();
    const post=(route,body,headers={})=>fetch(base+route,{method:'POST',headers:{'X-Keeper-Request':'1',...headers},body});
    assert.equal((await fetch(base+'/api/mozcorp/install/start',{method:'POST',body:'{}'})).status,403);
    assert.equal((await fetch(local+'/api/mozcorp/install/start',{method:'POST',headers:{origin:'null'},body:'{}'})).status,403);
    const start=await(await post('/api/mozcorp/install/start','{}')).json();
    assert.equal((await post('/api/mozcorp/install/chunk?upload='+start.uploadId+'&offset=0',f.bytes,{'Content-Type':'text/plain'})).status,415);
    assert.equal((await post('/api/mozcorp/install/chunk?upload='+start.uploadId+'&offset=0',f.bytes,{'Content-Type':'application/octet-stream'})).status,200);
    assert.equal((await post('/api/mozcorp/install/finish?upload='+start.uploadId,'{}')).status,200);
    const frame=await fetch(base+'/mozcorp/frame/fixture');assert.equal(frame.status,200);assert.match(await frame.text(),/Private fixture/);
    const policy=frame.headers.get('content-security-policy');assert.match(policy,/sandbox allow-scripts allow-forms allow-modals allow-downloads$/);assert(!policy.includes('allow-same-origin'));assert.match(policy,/connect-src 'none'/);assert.equal(frame.headers.get('cache-control'),'no-store');
    const page=await fetch(base+'/');assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);assert(!page.headers.get('content-security-policy').includes('nonce-'));
    const service = async (area, payload) => {
      const response = payload ? await post('/api/mozcorp/' + area, JSON.stringify(payload), { 'Content-Type': 'application/json' }) : await fetch(base + '/api/mozcorp/' + area);
      const result = await response.json(); return { response, result };
    };
    const cloud = await service('cloud'); assert.equal(cloud.response.status, 200); assert.equal(cloud.result.slots.length, 0);
    const saved = await service('cloud', { action: 'save', slotName: 'Fixture savepoint', kind: 'machine', payload: { format: 'fixture', seed: '  exact source  ' } });
    assert.equal(saved.response.status, 200); assert.equal(saved.result.slots.length, 1); assert.equal(JSON.parse(saved.result.slots[0].payload).seed, '  exact source  ');
    const stale = await service('cloud', { action: 'delete', scope: cloud.result.scope, revision: cloud.result.revision, id: saved.result.id }); assert.equal(stale.response.status, 409);
    const removed = await service('cloud', { action: 'delete', scope: saved.result.scope, revision: saved.result.revision, id: saved.result.id }); assert.equal(removed.response.status, 200);
    const fullShelf = Array.from({ length: 24 }, (_, index) => ({ slotName: 'Quoted fixture ' + index, kind: 'machine', payload: JSON.stringify({ seed: '"'.repeat(50000) }) }));
    const imported = await service('cloud', { action: 'import', scope: removed.result.scope, revision: removed.result.revision, slots: fullShelf });
    assert.equal(imported.response.status, 200, 'A full escaped export survives the gateway and real storage bounds.'); assert.equal(imported.result.slots.length, 24);
    const feed = await service('hope'); assert.equal(feed.result.enabled, false);
    const enabled = await service('hope', { action: 'settings', scope: feed.result.scope, generation: feed.result.generation, enabled: true });
    const seeded = await service('hope', { action: 'seed', scope: enabled.result.scope, generation: enabled.result.generation, sourceAt: Date.now(), kind: 'persona', profile: { name: 'Fixture moth', pronouns: 'they/them', role: 'Fictional lamp keeper', place: 'Paper moon', bio: 'A disposable invented test character.', theme: 'deep' } });
    assert.equal(seeded.response.status, 200); assert.equal(seeded.result.outcome, 'saved');
    const desk = await service('upgrades'); assert.equal(desk.result.configured, false); validateUpgradeState(desk.result);
    const proposal = await service('upgrades', { action: 'propose_manual', scope: desk.result.scope, revision: desk.result.revision, moduleId: 'world_shell', baseRelease: 'fixture-release', instruction: 'Make the fictional room navigation clearer.', proposal: { title: 'Fixture navigation', summary: 'Clarify fictional room labels for a disposable test.', proposedChanges: [{ area: 'Navigation', change: 'Use clearer labels.', rationale: 'Help visitors choose a room.' }], privacyImpact: 'No extra content collected.', reviewChecklist: ['Review room labels.'], rollbackPlan: 'Restore the earlier labels.', riskLevel: 'LOW' } });
    assert.equal(proposal.response.status, 200); assert.equal(validateUpgradeState(proposal.result).proposals[0].currentVersion, 1);
    for (const file of ['mozcorp-cloud.mjs', 'mozcorp-upgrades.mjs']) assert.equal((await fetch(base + '/' + file)).status, 200);
    for(const route of ['/private-stations/bundle.zip','/private-stations/upload.part','/mozcorp/frame/unknown','/mozcorp/frame/fixture/extra'])assert.equal((await fetch(base+route)).status,404);
    const after=await(await fetch(local+'/api/status')).json();assert.equal(after.publicKey,identity.publicKey);assert.equal(after.receipts,identity.receipts);
  }finally{gateway.closeAllConnections();await new Promise(r=>gateway.close(r));await keeper.close();}
}));

test('gateway fails closed if an upstream private frame weakens the isolation policy',async()=>{
  const upstream=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html','Content-Security-Policy':privateFramePolicy('a'.repeat(24))+'; connect-src *'});res.end('unsafe');});
  await new Promise(r=>upstream.listen(0,'127.0.0.1',r));const gateway=createIngressServer({keeperPort:upstream.address().port,control:{},ingressIP:'127.0.0.1'});await new Promise(r=>gateway.listen(0,'127.0.0.1',r));
  try{assert.equal((await fetch('http://127.0.0.1:'+gateway.address().port+'/mozcorp/frame/fixture')).status,502);}finally{gateway.closeAllConnections();upstream.closeAllConnections();await Promise.all([new Promise(r=>gateway.close(r)),new Promise(r=>upstream.close(r))]);}
});

test('manual news fetch is bounded, uses the fixed RSS source and rejects executable links',async()=>{
  let requested;const fetcher=async(url,options)=>{requested={url,options};return new Response('<rss><channel><item><title>Paper &amp; moon</title><source>Local press</source><pubDate>Tue, 17 Nov 2026 00:00:00 GMT</pubDate><link>javascript:evil()</link></item><item><title><![CDATA[Moon &amp; moth]]></title><source>Paper</source><pubDate>Today</pubDate><link>https://news.example/article</link></item></channel></rss>');};
  const data=await fetchPrivateRoomNews({query:'moths',limit:2,fetcher});assert.equal(requested.url.hostname,'news.google.com');assert.equal(requested.url.searchParams.get('q'),'moths');assert.equal(requested.options.redirect,'error');assert.deepEqual(data.items,[{title:'Moon & moth',source:'Paper',publishedAt:'Today',link:'https://news.example/article'}]);
  await assert.rejects(fetchPrivateRoomNews({limit:13,fetcher}),/1 and 12/);
  await assert.rejects(fetchPrivateRoomNews({fetcher:async()=>new Response('x'.repeat(600001))}),/exceeded/);
});

test('legacy imports preserve all inert fields and route to the correct engine',()=>{
  const p=B.make('Synthetic legacy world');p.machine={engine:'mozcorp-bug-world-v2',mozcorp:{version:1,station:'bug-world'},legacy:{format:'mozcorp-bugworld-package-v1',state:{fields:{seed:'held original',unused:'preserved'},bugWorld:{bits:6,randomBugs:[{script:'throw new Error("must stay data")'}]}}}};
  const checked=B.validate(p);assert.deepEqual(JSON.parse(JSON.stringify(checked.machine)),p.machine);assert.equal(B.route(checked),'./?mozcorp='+p.id+'#mozcorp');const old=B.make();assert.equal(B.route(old),'./telephone.html?project='+old.id);
  const invalid=structuredClone(p);invalid.machine.mozcorp.world={format:'wrong',state:{}};assert.throws(()=>B.validate(invalid),/Bug World/);
});
