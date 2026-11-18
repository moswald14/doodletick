import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createKeeperServer} from '../server.mjs';
import {newIdentity} from '../public/core.mjs';
import {dotlandsRequest,verifyDotlandsResponse} from '../public/dotlands-protocol.mjs';

test('integrated Keeper serves saved-room assets and authenticates the garden-backed route',async t=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'dotlands-serving-'));
 const keeper=await createKeeperServer({dataDir,port:0});
 t.after(async()=>{await keeper.close();await rm(dataDir,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${keeper.port}`;
 const info=await(await fetch(base+'/api/dotlands/info')).json();
 assert.equal(info.record.available,true);assert.equal(info.record.price,1);
 assert.equal(await verifyDotlandsResponse(info,info.record.issuer),true);
 for(const asset of ['dotlands.html','dotlands-ui.mjs','dotlands-protocol.mjs','dotlands-bridge.js','dotlands-engine.js','dotlands-app.js','dotlands.css']){
  const response=await fetch(base+'/'+asset);assert.equal(response.status,200,asset);
  if(asset==='dotlands.html')assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'self'/);
 }
 const identity=await newIdentity('serving_test');
 const post=async operation=>fetch(base+'/api/dotlands/request',{method:'POST',headers:{'Content-Type':'application/json','X-Keeper-Request':'1'},body:JSON.stringify(await dotlandsRequest(identity,info.record.issuer,operation,operation==='create'?{name:'serving_test',acceptPrice:1}:{}))});
 const list=await post('list');assert.equal(list.status,200);assert.deepEqual((await list.json()).record.data.rooms,[]);
 const create=await post('create');assert.equal(create.status,402);assert.match((await create.json()).record.error,/garden/i);
 const after=await post('list');assert.deepEqual((await after.json()).record.data.rooms,[]);
});
