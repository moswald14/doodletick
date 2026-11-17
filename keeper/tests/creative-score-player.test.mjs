import test from 'node:test';
import assert from 'node:assert/strict';
import {createCreativeScorePlayer} from '../public/creative-score-player.mjs';
function fixture({resume=async()=>{}}={}){
  const workers=[],sources=[],states=[];let contexts=0;
  const context={destination:{},resume,suspend:async()=>states.push('suspend'),createBuffer:()=>({copyToChannel(){}}),createGain:()=>({gain:{},connect(){},disconnect(){}}),createBufferSource:()=>{const source={connect(){},start(){states.push('start');},stop(){states.push('stop');},disconnect(){}};sources.push(source);return source;}};
  const player=createCreativeScorePlayer({createContext:()=>{contexts++;return context;},createWorker:()=>{const worker={postMessage(value){this.sent=value;},terminate(){this.terminated=true;}};workers.push(worker);return worker;}});
  const complete=worker=>worker.onmessage({data:{audio:{left:new Float32Array(8),right:new Float32Array(8),rate:44100}}});
  return{player,workers,sources,states,complete,contexts:()=>contexts};
}
test('opening the listener never creates audio or a render; missing scores are rejected',async()=>{
  const f=fixture();assert.equal(f.contexts(),0);assert.equal(f.workers.length,0);await assert.rejects(f.player.play({}),/Dot Studio/);assert.equal(f.contexts(),0);
});
test('attached score uses Studio song rendering and Stop ends the loop',async()=>{
  const f=fixture(),score={kind:'dot-studio-project',version:2},job=f.player.play({soundtrack:score});await Promise.resolve();assert.equal(f.workers[0].sent.project,score);assert.equal(f.workers[0].sent.scope,'song');f.complete(f.workers[0]);assert.equal(await job,true);assert.equal(f.player.isPlaying(),true);assert.equal(f.sources[0].loop,true);f.player.stop();assert.equal(f.player.isPlaying(),false);assert(f.states.includes('stop'));
});
test('Stop settles a pending worker and discards a late result without audio',async()=>{
  const f=fixture(),job=f.player.play({soundtrack:{}});await Promise.resolve();f.player.stop();assert.equal(await job,false);assert.equal(f.workers[0].terminated,true);f.complete(f.workers[0]);assert.equal(f.sources.length,0);
});
test('Stop during audio resume prevents a worker or later playback',async()=>{
  let resume;const f=fixture({resume:()=>new Promise(r=>{resume=r;})}),job=f.player.play({soundtrack:{}});f.player.stop();resume();assert.equal(await job,false);assert.equal(f.workers.length,0);assert.equal(f.sources.length,0);
});
test('a replacement play cancels the earlier render and only starts the new score',async()=>{
  const f=fixture(),first=f.player.play({soundtrack:{name:'first'}});await Promise.resolve();const second=f.player.play({soundtrack:{name:'second'}});await Promise.resolve();assert.equal(await first,false);f.complete(f.workers[0]);assert.equal(f.sources.length,0);f.complete(f.workers[1]);assert.equal(await second,true);assert.equal(f.sources.length,1);f.player.stop();
});
test('render errors suspend audio and leave the player ready for another attempt',async()=>{
  const f=fixture(),job=f.player.play({soundtrack:{}});await Promise.resolve();f.workers[0].onmessage({data:{error:'Invalid score'}});await assert.rejects(job,/Invalid score/);assert.equal(f.player.isPlaying(),false);assert(f.states.includes('suspend'));
});
test('a queued old worker response cannot remove the new render cancellation',async()=>{
  const f=fixture(),first=f.player.play({soundtrack:{}});await Promise.resolve();const second=f.player.play({soundtrack:{}});await Promise.resolve();assert.equal(await first,false);f.complete(f.workers[0]);f.player.stop();assert.equal(await second,false);assert.equal(f.sources.length,0);
});
