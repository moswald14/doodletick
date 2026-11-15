import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { makeRendezvous } from '../rendezvous.mjs';
import { newIdentity, sign, hash } from '../public/core.mjs';
import { createLobbyServer } from '../lobby-server.mjs';
test('rendezvous authorizes hosts and joiners, binds signed answers, hides private rooms and expires abandoned rooms', async () => {
  let time = Date.now(); const handler = makeRendezvous({ now: () => time }), server = http.createServer(async (req,res) => { try { await handler(req,res,new URL(req.url,'http://localhost')); } catch(e) { res.writeHead(500);res.end(e.message); } }); await new Promise(r => server.listen(0,'127.0.0.1',r));
  const base = 'http://127.0.0.1:' + server.address().port + '/arcade-api/'; const request = async (path, method='GET', body, token) => { const res = await fetch(base + path, { method, headers: { ...(body !== undefined ? { 'Content-Type':'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }); return { status: res.status, data: await res.json() }; };
  try {
    assert.equal((await request('rooms','POST',null)).status,400); const hidden = await request('rooms','POST',{title:'Private clearing',host:'host_one',game:'four'}); assert.equal(hidden.status,201); const open = await request('rooms','POST',{title:'Open clearing',host:'host_two',game:'dash',discoverable:true}); assert.equal((await request('rooms')).data.rooms.length,1);
    const id=hidden.data.id; assert.equal((await request('rooms/'+id+'/inbox')).status,403); assert.equal((await request('rooms/'+id,'DELETE',undefined,'invalid')).status,403);
    const guest=await newIdentity('lobby_guest'), host=await newIdentity('lobby_host'); const offerRecord={format:'doodletick-arcade-signal-v2',type:'offer',role:'guest',room:id,session:'aaaaaaaaaaaaaaaaaaaaaa',expires:Date.now()+60000,username:guest.username,publicKey:guest.publicKey,vpn:{ format: 'doodletick-vpn-v1', network: 'test.ts.net', ip: '100.64.0.1', port: 4318, channel: 'a'.repeat(32), token: 'b'.repeat(43), label: 'doodleverse-v1' },replyTo:null}; const offer={record:offerRecord,signature:await sign(offerRecord,guest.privateKey)}; const joined=await request('rooms/'+id+'/join','POST',{offer:JSON.stringify(offer)}); assert.equal(joined.status,201); const route='rooms/'+id+'/join/'+joined.data.id;
    assert.equal((await request(route)).status,403); assert.equal((await request('rooms/'+id+'/inbox','GET',undefined,hidden.data.token)).data.offers.length,1);
    const answerRecord={...offerRecord,type:'answer',role:'host',username:host.username,publicKey:host.publicKey,replyTo:await hash(offer)}; const answer={record:answerRecord,signature:await sign(answerRecord,host.privateKey)};
    assert.equal((await request(route,'POST',{answer:JSON.stringify(answer)},joined.data.token)).status,403); assert.equal((await request(route,'POST',{answer:JSON.stringify(answer)},hidden.data.token)).status,200); assert.equal((await request(route,'GET',undefined,joined.data.token)).data.answer,JSON.stringify(answer));
    answerRecord.vpn={...answerRecord.vpn,channel:'z'.repeat(32)}; answer.signature=await sign(answerRecord,host.privateKey); assert.equal((await request(route,'POST',{answer:JSON.stringify(answer)},hidden.data.token)).status,409);
    assert.equal((await request('rooms/'+open.data.id,'DELETE',undefined,open.data.token)).status,200); time+=46000; assert.equal((await request('rooms/'+id)).status,404); assert.equal((await request('rooms')).data.rooms.length,0);
  } finally { await new Promise(r=>server.close(r)); }
});
test('public standalone lobby is disabled in the private edition', async () => { await assert.rejects(createLobbyServer({ port: 0, origins: ['https://public.test'] }), /private VPN/); });
