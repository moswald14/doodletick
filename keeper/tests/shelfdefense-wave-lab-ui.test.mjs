// Adapted original ShelfDEFENSE regressions against Keeper's shipped assets.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url);
const __dirname=fileURLToPath(new URL('.',import.meta.url));
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const copy=value=>JSON.parse(JSON.stringify(value));

// Exercise the shipped HTML and real app/model/game/lab together. This small DOM
// supplies browser APIs, but does not invent missing IDs, values or controls.
function boot({storage=new Map(),blocked=false}={}){
  let document,window;const draws=[],previews=[],downloads=[],urls=new Map();
  class DOMEvent{
    constructor(type,options={}){this.type=type;this.bubbles=!!options.bubbles;this.defaultPrevented=false;Object.assign(this,options);}
    preventDefault(){this.defaultPrevented=true;}
    stopPropagation(){this.stopped=true;}
  }
  class EventTarget{
    constructor(){this.handlers={};}
    addEventListener(type,handler){(this.handlers[type]??=[]).push(handler);}
    removeEventListener(){}
    dispatchEvent(event){event.target??=this;for(const handler of this.handlers[event.type]||[])handler(event);if(event.bubbles&&!event.stopped)this.parentElement?.dispatchEvent(event);return !event.defaultPrevented;}
    async fire(type,options={}){const event=new DOMEvent(type,{bubbles:true,...options});event.target=this;await Promise.all((this.handlers[type]||[]).map(handler=>handler(event)));return event;}
  }
  function matches(element,selector){
    if(selector.includes(' '))return false;
    const tag=selector.match(/^[\w-]+/);if(tag&&element.tagName!==tag[0].toUpperCase())return false;
    if(selector.includes(':not(:disabled)')&&element.disabled)return false;
    if(selector.includes(':not([hidden])')&&element.hidden)return false;
    const positive=selector.replace(/:not\([^)]*\)/g,'');
    for(const match of positive.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g))if(!(match[1] in element.attributes)||(match[2]!==undefined&&element.attributes[match[1]]!==match[2]))return false;
    return true;
  }
  class Element extends EventTarget{
    constructor(tag='div',attributes={}){
      super();this.tagName=tag.toUpperCase();this.attributes=attributes;this.id=attributes.id||'';this.dataset={};this.children=[];this.parentElement=null;this.style={};this.value=attributes.value??'';this.hidden='hidden' in attributes;this.disabled='disabled' in attributes;this.textContent='';
      for(const [name,value] of Object.entries(attributes))if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;
      const classes=new Set((attributes.class||'').split(/\s+/));this.classList={add:cls=>classes.add(cls),remove:cls=>classes.delete(cls),toggle(cls,force){const value=force??!classes.has(cls);value?classes.add(cls):classes.delete(cls);return value;}};
    }
    set innerHTML(value){this.html=String(value);for(const child of this.children)child.parentElement=null;this.children=[];if(document.activeElement&&!connected(document.activeElement))document.activeElement=document.querySelector('body')||document;parse(this.html,this);}
    get innerHTML(){return this.html||'';}
    append(element){element.parentElement=this;this.children.push(element);}
    setAttribute(name,value){this.attributes[name]=String(value);}
    getAttribute(name){return this.attributes[name]??null;}
    querySelectorAll(selector){const choices=selector.split(',');const found=[];const visit=parent=>{for(const child of parent.children){if(choices.some(choice=>matches(child,choice.trim())))found.push(child);visit(child);}};visit(this);return found;}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    focus(){if(connected(this))document.activeElement=this;}
    click(){if(!this.disabled){if(this.tagName==='A')downloads.push(this);this.dispatchEvent(new DOMEvent('click',{bubbles:true}));}}
    getBoundingClientRect(){return {left:0,top:0,width:Number(this.attributes.width)||760,height:Number(this.attributes.height)||250};}
    setPointerCapture(pointerId){this.captured=pointerId;}
    getContext(){return new Proxy({}, {get(target,key){if(key in target)return target[key];return (...args)=>{for(const value of args)if(typeof value==='number')assert(Number.isFinite(value),`${this.id||'canvas'} ${String(key)} requires finite coordinates`);draws.push([key,...args]);if(key==='createLinearGradient'||key==='createRadialGradient')return {addColorStop(){}};};},set(target,key,value){target[key]=value;return true;}});}
  }
  function connected(element){for(let at=element;at;at=at.parentElement)if(at===document)return true;return false;}
  function parse(html,parent){
    const stack=[parent],voids=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
    for(const token of html.matchAll(/<!--[^]*?-->|<![^>]*>|<\/?([\w-]+)\b([^>]*?)\/?\s*>/g)){
      if(!token[1])continue;const tag=token[1].toLowerCase();
      if(token[0].startsWith('</')){for(let i=stack.length-1;i>0;i--)if(stack[i].tagName===tag.toUpperCase()){stack.length=i;break;}continue;}
      const attributes={};for(const match of token[2].matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+)))?/g))attributes[match[1]]=match[2]??match[3]??match[4]??'';
      const element=new Element(tag,attributes);stack.at(-1).append(element);if(tag==='option'&&element.parentElement.tagName==='SELECT'&&!element.parentElement.value)element.parentElement.value=element.value;
      if(!voids.has(tag)&&!token[0].endsWith('/>'))stack.push(element);
    }
  }
  window=new EventTarget();document=new Element('document');document.parentElement=window;document.createElement=tag=>new Element(tag);document.getElementById=id=>document.querySelectorAll('[id]').find(element=>element.id===id)||null;document.activeElement=null;
  parse(fs.readFileSync(path.join(root,'public/shelfdefense.html'),'utf8'),document);
  // The real first-visit curtain would prevent clicking the app until dismissed.
  const localStorage={getItem:key=>{if(blocked)throw Error('storage unavailable');return storage.get(key)||null;},setItem:(key,value)=>{if(blocked)throw Error('storage unavailable');storage.set(key,String(value));}};
  window.ShelfAudio={setEnabled(){},play(){},previewWave:wave=>{previews.push(copy(wave));return true;}};
  const sandbox=vm.createContext({window,document,localStorage,sessionStorage:{getItem:()=> 'yes',setItem(){}},Event:DOMEvent,Blob,URL:{createObjectURL:blob=>{const url=`blob:test-${urls.size}`;urls.set(url,blob);return url;},revokeObjectURL:url=>urls.delete(url)},requestAnimationFrame:()=>1,cancelAnimationFrame(){},setTimeout:()=>1,clearTimeout(){},Math,console});
  for(const filename of ['shelfdefense-waves.js','shelfdefense-game.js','shelfdefense-app.js','shelfdefense-wave-lab.js'])vm.runInContext(fs.readFileSync(path.join(root,'public',filename),'utf8'),sandbox,{filename});
  return {window,document,game:window.shelfGame,model:window.ShelfWaves,ids:id=>document.getElementById(id),storage,draws,previews,downloads,urls,key(key,options={}){const event=new DOMEvent('keydown',{key,bubbles:true,...options});document.dispatchEvent(event);return event;}};
}

test('the complete app starts with all required lab IDs and correct dependency order',()=>{
  const html=fs.readFileSync(path.join(root,'public/shelfdefense.html'),'utf8'),fragment=html.slice(html.indexOf('<div class="modal-overlay wave-lab-overlay"'));
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);assert.equal(new Set(ids).size,ids.length,'IDs must remain unique');
  for(const match of fragment.matchAll(/\bid="([^"]+)"/g))assert(ids.includes(match[1]),`${match[1]} must ship in shelfdefense.html`);
  const scripts=[...html.matchAll(/<script src="([^"]+)" defer>/g)].map(match=>match[1].replace(/^\.\//,''));for(const [before,after] of [['shelfdefense-waves.js','shelfdefense-game.js'],['shelfdefense-game.js','shelfdefense-app.js'],['shelfdefense-app.js','shelfdefense-wave-lab.js']])assert(scripts.indexOf(before)<scripts.indexOf(after));
  const b=boot();assert(b.window.ShelfWaveLab);assert.equal(b.ids('wave-lab-overlay').hidden,true);b.ids('wave-lab-open').click();assert.equal(b.ids('wave-lab-overlay').hidden,false);assert.equal(b.ids('wave-equip-btn').disabled,true);assert.equal(b.ids('wave-stock-btn').disabled,true);assert.match(b.ids('wave-fingerprint').textContent,/^[a-f0-9]{8}$/);assert(b.draws.some(call=>call[0]==='lineTo'));
});

test('selected-tower entry pauses every running shelf and equips or restores stock without spending',()=>{
  const b=boot(),g=b.game;g.build('pencil',0);g.startWave();g.switchMap(1);g.build('band',0);g.startWave();const coins=g.coins,towerId=g.selectedId;
  b.ids('open-wave-lab-btn').focus();b.ids('open-wave-lab-btn').click();assert(g.getSnapshot().shelves.filter(s=>s.phase==='paused').length>=2);assert.equal(b.ids('wave-equip-btn').disabled,false);assert.match(b.ids('wave-target').textContent,/Rubber Ranger/);
  b.ids('wlab-name').value='My attack';b.ids('wlab-name').dispatchEvent({type:'input'});b.ids('wlab-waveA').value='square';b.ids('wlab-waveA').dispatchEvent({type:'input'});b.ids('wave-equip-btn').click();assert.equal(g.getSnapshot().selectedTower.waveName,'My attack');assert.equal(g.getSnapshot().selectedTower.wave.waveA,'square');assert.equal(g.coins,coins);assert.equal(g.phase,'paused');assert.equal(g.selectedId,towerId);assert.equal(b.ids('wave-stock-btn').disabled,false);
  b.ids('wave-stock-btn').click();assert.equal(g.getSnapshot().selectedTower.wave,null);assert.equal(g.phase,'paused');assert.equal(g.coins,coins);b.ids('wave-lab-close').click();assert.equal(b.ids('wave-lab-overlay').hidden,true);assert(g.getSnapshot().shelves.filter(s=>s.phase==='paused').length>=2);assert(b.document.activeElement===b.ids('open-wave-lab-btn'),'close must return focus to the current inspector button after pause/equip rerenders it');
});

test('presets, live controls, preview sound and JSON export use the same signal',async()=>{
  const b=boot();b.ids('wave-lab-open').click();const preset=b.ids('wave-presets').querySelectorAll('[data-wave-preset]')[2];preset.click();b.ids('wlab-frequency').value='555';b.ids('wlab-frequency').dispatchEvent({type:'input'});assert.equal(b.ids('wlab-frequency-value').textContent,'555 Hz');
  b.ids('wave-preview-btn').click();assert.equal(b.previews.length,1);assert.equal(b.previews[0].frequency,555);assert.equal(b.ids('sound-btn').getAttribute('aria-pressed'),'true');assert.equal(b.storage.get('shelfdefense-sound'),'true');
  b.ids('wave-export-btn').click();assert.equal(b.downloads.length,1);const a=b.downloads[0],json=await b.urls.get(a.href).text(),exported=b.model.importPreset(json);assert.equal(b.model.signature(exported),b.ids('wave-fingerprint').textContent);assert.deepEqual(copy(exported),b.previews[0]);assert.match(a.download,/^dot-wave-[a-f0-9]{8}\.json$/);
});

test('import accepts a 32-point custom drawing, paints finite interpolated samples, and rejects bad files',async()=>{
  const b=boot();b.ids('wave-lab-open').click();const points=Array.from({length:32},(_,i)=>Math.sin(i/32*Math.PI*2));const data=b.model.exportPreset({waveA:'custom',name:'Imported shape',custom:points,cycles:1});const input=b.ids('wave-import-input');input.files=[{size:data.length,text:async()=>data}];await input.fire('change');assert.equal(b.ids('wlab-name').value,'Imported shape');assert.match(b.ids('wave-lab-status').textContent,/imported/);assert.equal(b.ids('wave-fingerprint').textContent,b.model.signature(b.model.importPreset(data)),'importing must preserve the original signal fingerprint');
  const canvas=b.ids('wave-scope');await canvas.fire('pointerdown',{clientX:0,clientY:20,pointerId:1});await canvas.fire('pointermove',{clientX:760,clientY:230,pointerId:1});await canvas.fire('pointerup');const drawn=b.model.importPreset(b.storage.get('shelfdefense.wave-draft.v1'));assert.equal(drawn.custom.length,64);assert(drawn.custom.every(value=>Number.isFinite(value)&&Math.abs(value)<=1));assert(drawn.custom[0]>.9);assert(drawn.custom[63]<-.9);const signature=b.ids('wave-fingerprint').textContent;
  input.files=[{size:100001,text:async()=>{throw Error('must not read an oversized file');}}];await input.fire('change');assert.match(b.ids('wave-lab-status').textContent,/smaller than 100 KB/);assert.equal(b.ids('wave-fingerprint').textContent,signature);
  input.files=[{size:10,text:async()=>'not json'}];await input.fire('change');assert.equal(b.ids('wave-fingerprint').textContent,signature);assert.equal(input.value,'');
});

test('lab keyboard traps both ends, suppresses gameplay shortcuts, and Escape preserves the selected tower',()=>{
  const b=boot();b.game.build('pencil',0);const selected=b.game.selectedId;b.ids('wave-lab-open').focus();b.ids('wave-lab-open').click();assert.equal(b.document.activeElement,b.ids('wave-lab-close'));
  const tab=b.key('Tab',{shiftKey:true});assert(tab.defaultPrevented);assert.equal(b.document.activeElement,b.ids('wave-import-input'));assert(b.key('Tab').defaultPrevented);assert.equal(b.document.activeElement,b.ids('wave-lab-close'));
  b.key('p');b.key('1');b.key(' ',{code:'Space'});assert.equal(b.game.selectedId,selected);assert.equal(b.game.armedType,null);assert.equal(b.game.phase,'build');
  const escape=b.key('Escape');assert(escape.defaultPrevented);assert.equal(b.ids('wave-lab-overlay').hidden,true);assert.equal(b.game.selectedId,selected,'closing the lab must keep the selected defender');assert.equal(b.document.activeElement,b.ids('wave-lab-open'));
});

test('unavailable storage does not prevent opening, controls, equipping or closing',()=>{
  const b=boot({blocked:true});b.game.build('pencil',0);b.ids('wave-lab-open').click();b.ids('wlab-amp').value='.44';b.ids('wlab-amp').dispatchEvent({type:'input'});b.ids('wave-equip-btn').click();assert.equal(b.game.getSnapshot().selectedTower.wave.amp,.44);b.ids('wave-lab-close').click();assert.equal(b.ids('wave-lab-overlay').hidden,true);
});

test('Keeper navigation and hidden-page transitions pause every shelf and mute audio',()=>{
  for(const trigger of ['shelf-back-keeper','shelf-open-idle','pagehide','visibilitychange']){
    const b=boot();b.game.build('pencil',0);b.game.startWave();b.game.switchMap(1);b.game.startWave();
    b.ids('sound-btn').click();assert.equal(b.game.sound,true);
    if(trigger==='pagehide')b.window.dispatchEvent({type:'pagehide'});
    else if(trigger==='visibilitychange'){b.document.hidden=true;b.document.dispatchEvent({type:'visibilitychange'});}
    else b.ids(trigger).click();
    assert.equal(b.game.sound,false);assert.equal(b.ids('sound-btn').getAttribute('aria-pressed'),'false');
    assert.equal(b.game.getSnapshot().shelves.filter(s=>s.phase==='paused').length,2);
    const saved=JSON.parse(b.storage.get('shelfdefense.saves.v1'));
    assert.equal(saved.slots[0].phase,'paused');assert.equal(saved.slots[1].phase,'paused');
  }
});

test('returning with a saved sound preference stays silent until explicitly enabled',()=>{
  const storage=new Map([['shelfdefense-sound','true']]);const b=boot({storage});
  assert.equal(b.game.sound,false);assert.equal(b.ids('sound-btn').getAttribute('aria-pressed'),'false');
  assert.equal(storage.get('shelfdefense-sound'),'true','loading should not discard the earlier preference');
  b.ids('sound-btn').click();assert.equal(b.game.sound,true);
});

test('corrupt browser save is visibly protected, exportable unchanged, and never overwritten by play',async()=>{
  for(const raw of ['{broken',JSON.stringify({version:999,activeMap:0,slots:{}})]){
    const storage=new Map([['shelfdefense.saves.v1',raw]]),b=boot({storage});
    assert.equal(b.ids('shelf-save-warning').hidden,false);assert.match(b.ids('shelf-export-save').textContent,/unread/);
    b.game.build('pencil',0);b.game.startWave();b.game.switchMap(1);b.window.dispatchEvent({type:'pagehide'});
    assert.equal(storage.get('shelfdefense.saves.v1'),raw);
    b.ids('shelf-export-save').click();assert.equal(b.downloads.length,1);
    assert.equal(await b.urls.get(b.downloads[0].href).text(),raw);
  }
});

test('portable shelf import requires confirmation, restores all battles paused, and leaves invalid data untouched',async()=>{
  const first=boot();first.game.build('pencil',0);first.game.startWave();first.game.switchMap(1);first.game.build('glue',1);first.game.startWave();
  first.ids('shelf-export-save').click();const json=await first.urls.get(first.downloads[0].href).text();
  const b=boot(),input=b.ids('shelf-import-save'),original=b.storage.get('shelfdefense.saves.v1');
  b.window.confirm=()=>false;input.files=[{size:json.length,text:async()=>json}];await input.fire('change');
  assert.equal(b.storage.get('shelfdefense.saves.v1'),original);
  b.window.confirm=()=>true;await input.fire('change');assert.equal(b.game.mapIndex,1);assert.equal(b.game.sound,false);
  assert.equal(b.game.getSnapshot().shelves.filter(s=>s.phase==='paused').length,2);assert.equal(b.game.towers[0].type,'glue');
  assert.match(b.ids('shelf-import-status').textContent,/imported/);
  const saved=b.storage.get('shelfdefense.saves.v1');input.files=[{size:20,text:async()=>'{"version":1,"slots":{}}'}];await input.fire('change');
  assert.equal(b.storage.get('shelfdefense.saves.v1'),saved);assert.match(b.ids('shelf-import-status').textContent,/invalid/);
});
