// Adapted original ShelfDEFENSE regressions against Keeper's shipped assets.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url);
const __dirname=fileURLToPath(new URL('.',import.meta.url));
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function boot(values=new Map()){
  const updates=[],events=[];
  const window={addEventListener(){},removeEventListener(){}};
  const sandbox=vm.createContext({window,localStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value))},requestAnimationFrame:()=>1,cancelAnimationFrame(){},console,Math});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/shelfdefense-game.js'),'utf8'),sandbox);
  const canvas={getContext:()=>({}),addEventListener(){},removeEventListener(){},getBoundingClientRect:()=>({left:0,top:0,width:1200,height:700})};
  const game=new window.ShelfDefense(canvas,{onUpdate:s=>updates.push(s),onEvent:(message,kind)=>events.push({message,kind})});
  return {game,values,updates,events};
}
function advance(game,seconds){assert.equal(typeof game.advanceAll,'function','one clock must advance every started shelf');for(let t=0;t<seconds;t+=.025)game.advanceAll(.025);}
function battle(game){return JSON.parse(JSON.stringify({coins:game.coins,lives:game.lives,wave:game.wave,kills:game.kills,score:game.score,towers:game.towers,enemies:game.enemies,projectiles:game.projectiles,queue:game.queue,spawnTimer:game.spawnTimer,abilityCooldown:game.abilityCooldown}));}
function summaries(game){return JSON.parse(JSON.stringify(game.getSnapshot().shelves));}

test('started waves keep running after changing shelves and both advance on one clock',()=>{
  const {game}=boot();game.startWave();advance(game,1);const firstDistance=game.enemies[0].distance;
  game.switchMap(1);game.startWave();advance(game,1);
  assert.equal(game.mapIndex,1);assert(game.enemies[0].distance>0);const secondDistance=game.enemies[0].distance;
  game.switchMap(0);assert.equal(game.phase,'wave');assert(game.enemies[0].distance>firstDistance);
  game.switchMap(1);assert.equal(game.enemies[0].distance,secondDistance);
  const shelves=summaries(game);assert.equal(shelves.length,3);assert.equal(shelves[0].phase,'wave');assert.equal(shelves[1].phase,'wave');assert.equal(shelves[2].phase,'build');
});

test('hidden shelves earn their own coins and kills without changing the viewed shelf economy',()=>{
  const {game}=boot();game.build('pencil',0);game.build('pencil',1);game.startWave();
  game.switchMap(1);game.startWave();advance(game,5);
  assert.equal(game.mapIndex,1);assert.equal(game.coins,300);assert.equal(game.kills,0);
  game.switchMap(0);assert(game.kills>0);assert(game.coins>160);assert.equal(game.towers.length,2);
});

test('pause all freezes every active battle and resumes only previously running shelves',()=>{
  const {game}=boot();game.startWave();game.switchMap(1);game.startWave();advance(game,1);game.switchMap(2);
  assert.equal(typeof game.toggleAllPause,'function');game.toggleAllPause();assert.equal(game.getSnapshot().allPaused,true);
  game.switchMap(0);const first=battle(game);assert.equal(game.phase,'paused');game.switchMap(1);const second=battle(game);assert.equal(game.phase,'paused');
  advance(game,1);assert.deepEqual(battle(game),second);game.switchMap(0);assert.deepEqual(battle(game),first);
  game.toggleAllPause();assert.equal(game.getSnapshot().allPaused,false);assert.equal(game.phase,'wave');advance(game,.1);assert.notDeepEqual(battle(game),first);
  game.switchMap(2);assert.equal(game.phase,'build','global resume must not start untouched shelves');
});

test('background victory and defeat do not replace the foreground interface or emit its result',()=>{
  for(const outcome of ['won','lost']){
    const {game,updates,events}=boot();
    if(outcome==='won'){game.wave=19;game.startWave();game.queue=[];game.enemies=[];}
    else{game.startWave();game.queue=[];game.enemies=[];game.lives=1;const enemy=game.spawnEnemy('dust');enemy.distance=game.pathLength-.1;}
    game.switchMap(1);updates.length=0;events.length=0;advance(game,.05);
    assert.equal(game.mapIndex,1);assert.equal(game.phase,'build');assert.equal(summaries(game)[0].phase,outcome);
    assert(!updates.some(s=>s.mapIndex===0),'hidden results must not drive foreground UI');assert.equal(events.length,0,'hidden battle toasts stay quiet');
  }
});

test('saving and reloading retains all concurrent battles and pauses them safely',()=>{
  const first=boot();first.game.build('pencil',0);first.game.startWave();first.game.switchMap(1);first.game.build('glue',0);first.game.startWave();first.game.switchMap(2);first.game.build('band',0);advance(first.game,1);first.game.saveProgress();
  const expected=summaries(first.game),second=boot(first.values);assert.equal(second.game.mapIndex,2);
  const restored=summaries(second.game);assert.equal(restored[0].phase,'paused');assert.equal(restored[1].phase,'paused');assert.equal(restored[2].phase,'build');
  for(let i=0;i<3;i++){assert.equal(restored[i].coins,expected[i].coins);assert.equal(restored[i].wave,expected[i].wave);assert.equal(restored[i].towerCount,1);}
  second.game.switchMap(0);const saved=battle(second.game);advance(second.game,1);assert.deepEqual(battle(second.game),saved);second.game.togglePause();advance(second.game,.1);assert.notDeepEqual(battle(second.game),saved);
});

test('retry on one shelf preserves another running battle',()=>{
  const {game}=boot();game.build('pencil',0);game.startWave();advance(game,1);game.switchMap(1);game.build('glue',0);game.startWave();game.restart(1);
  assert.equal(game.phase,'build');assert.equal(game.coins,300);advance(game,.1);game.switchMap(0);assert.equal(game.phase,'wave');assert.equal(game.towers.length,1);assert(game.enemies.length>0);
});
test('repeated global pause preserves the resume group and leaves individually paused shelves alone',()=>{
  const {game}=boot();game.startWave();game.togglePause();game.switchMap(1);game.startWave();
  game.pauseAll();game.pauseAll();game.toggleAllPause();assert.equal(game.phase,'wave');
  game.switchMap(0);assert.equal(game.phase,'paused');
});
