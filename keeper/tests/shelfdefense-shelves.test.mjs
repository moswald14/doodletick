// Adapted original ShelfDEFENSE regressions against Keeper's shipped assets.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url);
const __dirname=fileURLToPath(new URL('.',import.meta.url));
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');

function boot(storage=new Map(),blocked=false){
  const ids=new Map(),events=new Map();let document;
  class Element{
    constructor(id=''){this.id=id;this.dataset={};this.handlers={};this.hidden=false;this.disabled=false;this.style={};this.classList={toggle(){},add(){},remove(){}};this.parentElement={append:el=>ids.set(el.id,el)};}
    set innerHTML(value){this.html=value;for(const match of value.matchAll(/\bid="([^"]+)"/g))if(!ids.has(match[1]))ids.set(match[1],new Element(match[1]));}
    get innerHTML(){return this.html||'';}
    setAttribute(k,v){this[k]=v;}
    addEventListener(type,fn){(this.handlers[type]??=[]).push(fn);}
    removeEventListener(){}
    querySelectorAll(){return [];}
    querySelector(){return null;}
    focus(){document.activeElement=this;}
    click(){if(!this.disabled)for(const fn of this.handlers.click||[])fn({});}
  }
  const html=fs.readFileSync(path.join(root,'public/shelfdefense.html'),'utf8');
  for(const match of html.matchAll(/\bid="([^"]+)"/g))ids.set(match[1],new Element(match[1]));
  const maps=[0,1,2].map(n=>{let el=new Element();el.dataset.map=String(n);return el;});
  const towers=['pencil','glue','band','knight','lamp'].map(type=>{let el=new Element();el.dataset.tower=type;return el;});
  const context=new Proxy({}, {get:()=>()=>{},set:()=>true});
  const canvas=ids.get('game-canvas');canvas.getContext=()=>context;canvas.getBoundingClientRect=()=>({left:0,top:0,width:1200,height:700});
  document={getElementById:id=>ids.get(id)||null,querySelectorAll:selector=>selector==='[data-map]'?maps:selector==='[data-tower]'?towers:[],querySelector:()=>null,createElement:()=>new Element(),addEventListener(){},activeElement:null};
  const window={addEventListener(type,fn){(events.get(type)||events.set(type,[]).get(type)).push(fn);},removeEventListener(){}};
  const localStorage={getItem:key=>{if(blocked)throw Error('storage unavailable');return storage.get(key)||null;},setItem:(key,value)=>{if(blocked)throw Error('storage unavailable');storage.set(key,value);}};
  const sandbox={window,document,localStorage,sessionStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame:()=>1,cancelAnimationFrame(){},setTimeout:()=>1,clearTimeout(){},Math,console};
  vm.createContext(sandbox);
  for(const filename of ['shelfdefense-game.js','shelfdefense-app.js'])vm.runInContext(fs.readFileSync(path.join(root,'public',filename),'utf8'),sandbox,{filename});
  return {game:window.shelfGame,maps,storage,ids,leave(){for(const fn of events.get('pagehide')||[])fn();}};
}
function gameplay(game){return JSON.parse(JSON.stringify({coins:game.coins,lives:game.lives,wave:game.wave,kills:game.kills,score:game.score,towers:game.towers,enemies:game.enemies,queue:game.queue,projectiles:game.projectiles,abilityCooldown:game.abilityCooldown,spawnTimer:game.spawnTimer,uid:game.uid,endless:game.endless,speed:game.speed}));}

test('switching shelf tabs preserves each shelf and its upgrades and coins',()=>{
  const {game,maps}=boot();game.build('pencil',0);game.upgrade('a');game.build('glue',1);const original=gameplay(game);
  maps[1].click();assert.equal(game.mapIndex,1);assert.equal(game.coins,300);game.build('band',0);const other=gameplay(game);
  maps[0].click();assert.deepEqual(gameplay(game),original,'returning to the first shelf must restore its defense');
  maps[1].click();assert.deepEqual(gameplay(game),other,'each shelf must keep its own coins and defenders');
});
test('switching shelves retains an in-flight wave and keeps it running',()=>{
  const {game,maps}=boot();game.build('pencil',0);game.build('glue',1);game.startWave();for(let i=0;i<100;i++)game.update(.025);game.setSpeed(3);const battle=gameplay(game);
  assert(game.enemies.length>0);assert(game.queue.length>0);
  maps[2].click();maps[0].click();assert.deepEqual(gameplay(game),battle);assert.equal(game.phase,'wave');
  game.update(.025);assert.notDeepEqual(gameplay(game),battle);
});
test('reload restores the last shelf and its saved battle',()=>{
  const first=boot();first.game.build('pencil',0);first.maps[1].click();first.game.build('glue',2);first.game.startWave();for(let i=0;i<40;i++)first.game.update(.025);const battle=gameplay(first.game);first.leave();
  const second=boot(first.storage);assert.equal(second.game.mapIndex,1);assert.deepEqual(gameplay(second.game),battle);assert.equal(second.game.phase,'paused');second.maps[0].click();assert.equal(second.game.towers.length,1);
});
test('explicit restart clears only the selected shelf',()=>{
  const {game,maps}=boot();game.build('pencil',0);maps[1].click();game.build('band',0);game.restart(1);assert.equal(game.towers.length,0);assert.equal(game.coins,300);maps[0].click();assert.equal(game.towers.length,1);assert.equal(game.coins,230);
});
test('shelf switching remains safe when browser storage is unavailable',()=>{
  const {game,maps}=boot(new Map(),true);game.build('pencil',0);maps[1].click();maps[0].click();assert.equal(game.towers.length,1);assert.equal(game.coins,230);
});
test('placing a defender exposes both named upgrade choices in the command panel',()=>{
  const {game,ids}=boot();game.build('pencil',0);
  assert.match(ids.get('inspector').innerHTML,/Tower upgrades/);
  assert.match(ids.get('inspector').innerHTML,/Sharp Thinking/);
  assert.match(ids.get('inspector').innerHTML,/Doodle Storm/);
  game.upgrade('a');assert.match(ids.get('inspector').innerHTML,/class="skill-node blocked" data-skill="b" disabled/);
});
test('boss-wave warning and live boss health are visible through the interface',()=>{
  const {game,ids}=boot();game.wave=4;game.emit();
  assert.match(ids.get('start-btn').innerHTML,/Send boss wave 05/);
  assert.match(ids.get('forecast').textContent,/BOSS WAVE 5/);
  ids.get('start-btn').click();for(let i=0;i<2000&&!game.getSnapshot().boss;i++)game.update(.025);game.emit();
  assert.equal(ids.get('boss-bar').hidden,false);assert.match(ids.get('boss-health').textContent,/HP/);assert.equal(ids.get('boss-meter').value,100);
});

test('an invalid shelf in an otherwise valid legacy save protects the whole original envelope',()=>{
  const before=boot();before.game.build('pencil',0);before.game.switchMap(1);before.game.build('glue',1);
  const envelope=JSON.parse(before.storage.get('shelfdefense.saves.v1'));envelope.slots[1].coins=-1;
  const raw=JSON.stringify(envelope);before.storage.set('shelfdefense.saves.v1',raw);
  const after=boot(before.storage);assert.equal(after.game.getSnapshot().unreadSave,true);
  after.game.switchMap(0);assert.equal(after.game.towers[0].type,'pencil');
  after.game.build('band',2);after.game.saveProgress();assert.equal(before.storage.get('shelfdefense.saves.v1'),raw);
});

test('a valid imported save cannot replace current play when browser persistence fails',()=>{
  const source=boot();source.game.build('pencil',0);const incoming=JSON.parse(source.game.exportProgress());
  const target=boot(new Map(),true);target.game.build('glue',0);const original=gameplay(target.game);
  assert.throws(()=>target.game.importProgress(incoming),/could not save/);
  assert.deepEqual(gameplay(target.game),original);
});
