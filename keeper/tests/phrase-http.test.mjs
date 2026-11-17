import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createKeeperServer } from '../server.mjs';
import { createKeeperServer as createAdaptedKeeper } from '../../doodletick/keeper/server.mjs';
import { createIngressServer } from '../../doodletick/gateway.mjs';

test('Phrase lab assets load through the normal local Keeper boundary',async()=>{
  const dataDir=await mkdtemp(path.join(tmpdir(),'keeper-phrase-http-'));
  let keeper;
  try {
    keeper=await createKeeperServer({port:0,dataDir});
    const base='http://127.0.0.1:'+keeper.port;
    for(const file of ['phrase-core.mjs','phrase-store.mjs','phrase-ui.mjs','phrase.css']){
      const response=await fetch(base+'/'+file);assert.equal(response.status,200,file);assert.ok((await response.text()).length>100,file);
    }
    const dictionary=await fetch(base+'/phrase-dictionary.json');assert.equal(dictionary.status,200);const words=await dictionary.json();
    assert.equal(words.format,'doodlekeeper-phrase-dictionary-v1');assert.equal(words.words.length,words.count);assert.ok(words.count>300000);
    const attested=await fetch(base+'/phrase-attestations.json');assert.equal(attested.status,200);const phrases=await attested.json();
    assert.equal(phrases.format,'doodlekeeper-phrase-attestations-v1');assert.ok(phrases.entries.length>1000);
    assert.equal((await fetch(base+'/phrase-dictionary.json',{headers:{Origin:'https://unrelated.example'}})).status,403);
    assert.equal((await fetch(base+'/phrase-dictionary.json',{method:'POST'})).status,405);
    assert.equal((await fetch(base+'/PHRASE-SOURCES.md')).status,404);
  } finally {
    await keeper?.close();
    if(path.dirname(path.resolve(dataDir))!==path.resolve(tmpdir())||!path.basename(dataDir).startsWith('keeper-phrase-http-'))throw new Error('Unsafe temporary test cleanup.');
    await rm(dataDir,{recursive:true,force:true});
  }
});

test('Home Assistant Phrase lab keeps relative asset paths and the existing mutation boundary',async()=>{
  const dataDir=await mkdtemp(path.join(tmpdir(),'keeper-phrase-http-'));
  let keeper,ingress;
  try {
    keeper=await createAdaptedKeeper({port:0,dataDir});
    ingress=createIngressServer({keeperPort:keeper.port,ingressIP:'127.0.0.1',control:{status:async()=>({ok:true})}});
    await new Promise(resolve=>ingress.listen(0,'127.0.0.1',resolve));
    const base='http://127.0.0.1:'+ingress.address().port;
    const page=await(await fetch(base+'/')).text();assert.ok(page.includes('href="./phrase.css"'));assert.ok(page.includes('data-view="phrases"'));
    const app=await(await fetch(base+'/app.mjs')).text();assert.ok(app.includes("fetch('./api/witness'"));assert.ok(app.includes("'X-Keeper-Request': '1'"));
    const ui=await(await fetch(base+'/phrase-ui.mjs')).text();assert.ok(ui.includes("fetch('./' + name)"));
    const dictionary=await(await fetch(base+'/phrase-dictionary.json')).json();assert.equal(dictionary.format,'doodlekeeper-phrase-dictionary-v1');assert.ok(dictionary.count>300000);
    assert.equal((await fetch(base+'/api/witness',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
    assert.equal((await fetch(base+'/sw.mjs')).status,404);
  } finally {
    if(ingress)await new Promise(resolve=>ingress.close(resolve));await keeper?.close();
    if(path.dirname(path.resolve(dataDir))!==path.resolve(tmpdir())||!path.basename(dataDir).startsWith('keeper-phrase-http-'))throw new Error('Unsafe temporary test cleanup.');
    await rm(dataDir,{recursive:true,force:true});
  }
});
