import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createKeeperServer } from '../server.mjs';
import { createIngressServer } from '../../doodletick/gateway.mjs';

const marketOrigins=['https://api.exchange.coinbase.com','https://api.coingecko.com'];
const baseOrigins=["'self'",'https://geocoding-api.open-meteo.com','https://api.open-meteo.com','https://ethereum-rpc.publicnode.com'];
const connections=response=>response.headers.get('content-security-policy').match(/(?:^|;)\s*connect-src ([^;]+)/)[1].split(' ');

test('only the actual Studio document can fetch the two public market feeds through direct Keeper or Home Assistant ingress',async t=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'keeper-studio-policy-'));
  const keeper=await createKeeperServer({dataDir:directory,port:0,vpnOptions:{readStatus:async()=>{throw Error('Disposable direct-pairing fixture');}},mozcorpOptions:{provider:{apiKey:''}}});
  const gateway=createIngressServer({keeperPort:keeper.port,ingressIP:'127.0.0.1',control:{status:async()=>({mode:'fixture'})}});
  await new Promise(resolve=>gateway.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{
    gateway.closeAllConnections();await new Promise(resolve=>gateway.close(resolve));keeper.server.closeAllConnections();await keeper.close();
    assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));assert(path.basename(directory).startsWith('keeper-studio-policy-'));
    await rm(directory,{recursive:true,force:true});
  });
  for(const port of [keeper.port,gateway.address().port]){
    const origin='http://127.0.0.1:'+port;
    for(const route of ['/studio.html','/studio.html?from=keeper']){
      const response=await fetch(origin+route);assert.equal(response.status,200,route);
      assert.deepEqual(new Set(connections(response)),new Set([...baseOrigins,...marketOrigins]));
      assert.equal(response.headers.get('cache-control'),'no-store');
    }
    for(const route of ['/','/index.html','/studio-classic.html','/studio-app.js','/studio-worker.js','/studio.html/other','/jazz.html','/telephone.html','/api/status']){
      const response=await fetch(origin+route);const allowed=connections(response);
      for(const market of marketOrigins)assert(!allowed.includes(market),'Market access leaked to '+route);
      const existing=route==='/jazz.html'?["'self'",'wss://apibackup.vdo.ninja','https://turnservers.vdo.ninja',...baseOrigins.slice(1)]:route==='/telephone.html'?["'self'",'https://api.gdeltproject.org',...baseOrigins.slice(1)]:baseOrigins;
      assert.deepEqual(allowed,existing,'Existing unrelated-page connections remain unchanged: '+route);
      await response.body?.cancel();
    }
  }
});
