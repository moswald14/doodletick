// Adapted original ShelfDEFENSE regressions against Keeper's shipped assets.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url);
const __dirname=fileURLToPath(new URL('.',import.meta.url));
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const base=path.resolve(__dirname,'..');
function boot(values=new Map(),withWaves=true){
  const shots=[],drawCalls=[];
  const window={addEventListener(){},removeEventListener(){},ShelfAudio:{setEnabled(){},play:(event,details)=>shots.push({event,details})}};
  const sandbox=vm.createContext({window,localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},requestAnimationFrame:()=>1,cancelAnimationFrame(){},Math,console});
  if(withWaves&&fs.existsSync(path.join(base,'public/shelfdefense-waves.js')))vm.runInContext(fs.readFileSync(path.join(base,'public/shelfdefense-waves.js'),'utf8'),sandbox);
  vm.runInContext(fs.readFileSync(path.join(base,'public/shelfdefense-game.js'),'utf8'),sandbox);
  const ctx=new Proxy({}, {get(o,k){if(k in o)return o[k];return (...args)=>{for(const x of args)if(typeof x==='number')assert(Number.isFinite(x),`${String(k)} needs finite coordinates`);drawCalls.push([k,...args]);};},set(o,k,v){o[k]=v;return true;}});
  const canvas={getContext:()=>ctx,addEventListener(){},removeEventListener(){},getBoundingClientRect:()=>({left:0,top:0,width:1200,height:700})};
  return {game:new window.ShelfDefense(canvas),values,model:window.ShelfWaves,shots,drawCalls};
}
function descriptor(model,changes={}){
  const d={schema:'shelfdefense.wave.v1',name:'Test wave',waveA:'sine',waveB:'off',cycles:2,amp:.8,phase:0,duty:.3,ratio:3,mix:.25,frequency:360,envelope:.2,custom:Array.from({length:32},(_,i)=>Math.sin(i/32*Math.PI*2)),seed:42,...changes};
  return model?model.normalize(d):d;
}
function copy(value){return JSON.parse(JSON.stringify(value));}
test('waveform attack profiles change actual tower tradeoffs without charging coins',()=>{
  const {game,model}=boot();game.build('pencil',0);assert.equal(typeof game.equipWave,'function','the selected defender must accept a waveform');
  const normal=game.stats(game.towers[0]),coins=game.coins;
  assert.equal(game.equipWave(descriptor(model)),true);const sine=game.stats(game.towers[0]);
  assert.equal(game.equipWave(descriptor(model,{waveA:'square',duty:.15})),true);const square=game.stats(game.towers[0]);
  assert.notDeepEqual([sine.damage,sine.rate,sine.range,sine.splash],[square.damage,square.rate,square.range,square.splash]);
  for(const stats of [sine,square]){assert(stats.damage/normal.damage>=.75&&stats.damage/normal.damage<=1.3);assert(stats.rate/normal.rate>=.75&&stats.rate/normal.rate<=1.3);assert(stats.range/normal.range>=.9&&stats.range/normal.range<=1.12);assert(stats.splash>=0&&stats.splash<=22);}
  assert.equal(game.coins,coins);assert.equal(game.getSnapshot().selectedTower.waveName,'Test wave');assert.match(game.getSnapshot().selectedTower.waveSignature,/^[a-f0-9]{8}$/i);
});
test('wave configuration retains weapon modes and clearing restores ordinary stats',()=>{
  for(const type of ['pencil','glue','band','knight','lamp']){
    const {game,model}=boot();game.build(type,0);assert.equal(typeof game.equipWave,'function');const normal=game.stats(game.towers[0]);
    game.equipWave(descriptor(model,{waveA:'saw',waveB:'pulse',mix:.4}));const custom=game.stats(game.towers[0]);
    assert.equal(custom.melee,normal.melee);assert.equal(custom.laser,normal.laser);assert.equal(custom.ignoreArmor,normal.ignoreArmor);assert.equal(custom.multi,normal.multi);
    assert.equal(game.clearWave(),true);const cleared=game.stats(game.towers[0]);assert.equal(cleared.damage,normal.damage);assert.equal(cleared.range,normal.range);assert.equal(cleared.rate,normal.rate);assert.equal(cleared.splash,normal.splash);assert.equal(game.getSnapshot().selectedTower.wave,null);
  }
});
test('equipped waveforms persist independently across shelves and a reload',()=>{
  const a=boot();a.game.build('pencil',0);assert.equal(typeof a.game.equipWave,'function');a.game.equipWave(descriptor(a.model,{name:'Shelf one'}));const first=copy(a.game.getSnapshot().selectedTower.wave);
  a.game.switchMap(1);a.game.build('band',0);a.game.equipWave(descriptor(a.model,{name:'Shelf two',waveA:'triangle',phase:70}));const second=copy(a.game.getSnapshot().selectedTower.wave);a.game.saveProgress();
  const b=boot(a.values);assert.equal(b.game.mapIndex,1);assert.deepEqual(copy(b.game.towers[0].wave),second);b.game.switchMap(0);assert.deepEqual(copy(b.game.towers[0].wave),first);
});
test('invalid waveform edits preserve the attack and paused configuration edits never resume combat',()=>{
  const {game,model}=boot();game.build('pencil',0);assert.equal(typeof game.equipWave,'function');game.equipWave(descriptor(model));const before=copy(game.towers[0]);const coins=game.coins;
  assert.equal(game.equipWave({...descriptor(model),frequency:Infinity}),false);assert.equal(game.equipWave({schema:'evil',waveA:'sine'}),false);assert.deepEqual(copy(game.towers[0]),before);assert.equal(game.coins,coins);
  game.togglePause();assert.equal(game.equipWave(descriptor(model,{waveA:'square'})),true);assert.equal(game.phase,'paused');assert.equal(game.coins,coins);assert.equal(game.clearWave(),true);assert.equal(game.phase,'paused');
});
test('each shot carries its own waveform to audio, projectiles and beams',()=>{
  for(const type of ['pencil','lamp']){
    const {game,model,shots,drawCalls}=boot();game.build(type,0);assert.equal(typeof game.equipWave,'function');const wave=descriptor(model,{waveA:'pulse',waveB:'triangle',mix:.5});game.equipWave(wave);game.setSound(true);game.wave=1;const e=game.spawnEnemy('dust',100);e.hp=e.maxHp=1000;game.fire(game.towers[0],[e],game.stats(game.towers[0]));
    const shot=shots.find(s=>s.event==='shot');assert(shot);assert.deepEqual(copy(shot.details.wave),copy(wave));
    const effect=type==='lamp'?game.beams[0]:game.projectiles[0];assert.deepEqual(copy(effect.wave),copy(wave));const hp=e.hp;game.draw();assert.equal(e.hp,hp,'rendering the wave never reapplies combat damage');assert(drawCalls.length>0);
    game.equipWave(descriptor(model,{waveA:'square'}));assert.deepEqual(copy(effect.wave),copy(wave),'an in-flight attack retains the wave it was fired with');
  }
});
test('legacy saves and engines without the waveform module keep ordinary defenses',()=>{
  const a=boot(new Map(),false);a.game.build('pencil',0);assert.equal(typeof a.game.equipWave,'function');assert.equal(a.game.equipWave(descriptor(null)),false);a.game.saveProgress();
  const b=boot(a.values);assert.equal(b.game.towers.length,1);assert.equal(b.game.stats(b.game.towers[0]).damage,b.game.defs.pencil.damage);assert.equal(b.game.getSnapshot().selectedTower,null);
});
