// SPDX-License-Identifier: GPL-3.0-only
import { defaultPack, validatePack } from './game-engine.mjs';

export function telephoneWorld(record) {
  const p = globalThis.DoodleBridge.validate(record);
  if (p.sourceMode !== 'fiction') throw new Error('This source is held. Switch to fiction in Telephone World before generating a fictional map.');
  let seed = 2166136261;
  for (const char of p.sourceText + '\n' + p.storyText) seed = Math.imul(seed ^ char.codePointAt(0), 16777619) >>> 0;
  const pack = defaultPack(); pack.title = p.title.slice(0,60); pack.seed = seed;
  pack.description = ('Telephone World · ' + (p.characterText || p.storyText || p.sourceText).replace(/\s+/g,' ')).slice(0,240);
  pack.theme = ['meadow','midnight','sunset'][seed % 3];
  pack.starCount = 8 + seed % 13;
  for (let y=2;y<16;y++) for(let x=2;x<26;x++) {
    if (x>=11 && x<=17 || y>=8 && y<=12) continue;
    const n = Math.imul((seed ^ (x * 331 + y * 7919)) >>> 0, 1664525) >>> 0;
    pack.tiles[y*28+x] = n % 9 === 0 ? 3 : n % 17 === 0 ? 2 : 0;
  }
  validatePack(pack); return pack;
}

export function createTelephoneKeeper(container, { stageDraft, stageWorld, navigate }) {
  const B=globalThis.DoodleBridge;
  container.innerHTML=`<div class="eyebrow">STORIES / SOUNDS / PLACES</div><h1>The world heard<br><em>something different.</em></h1>
  <p class="page-description">The complete Bullshit Telephone World, your Dot Studio soundtrack, and a little place in your Keeper. Carry one creative project between them.</p>
  <div class="telephone-links"><a class="button primary" href="./telephone.html">＋ Enter Telephone World</a><a class="button quiet" href="./studio.html#telephone">Open Dot Studio ↗</a><button id="telephone-refresh" class="button quiet">Refresh shelf</button></div>
  <p class="telephone-storage-note">Sessions and project exports are unencrypted copies in your creative workspace. Copy text to your unlocked Keeper to save a separate encrypted vault draft. Export a project to move it to another browser or device.</p>
  <div class="telephone-layout"><section class="utility-card"><h2>Your telephone worlds</h2><div id="telephone-shelf"></div></section><section class="utility-card" id="telephone-preview"><h2 id="telephone-title">Choose a session</h2><p id="telephone-meta"></p><div class="telephone-links"><a id="telephone-open" class="button quiet" hidden>Open machine ↗</a><a id="telephone-studio" class="button quiet" hidden>Edit soundtrack ↗</a><button id="telephone-vault" class="button primary" disabled>Copy to vault draft</button><button id="telephone-world" class="button quiet" disabled>Make playable world</button><button id="telephone-export" class="button quiet" disabled>Export project</button></div><p id="telephone-status" role="status">Choose a saved session to see its story.</p><pre id="telephone-text" class="telephone-text"></pre></section></div>`;
  const $=id=>document.getElementById(id);let selected=null,ticket=0,busy=false;
  const status=text=>{$('telephone-status').textContent=text;};
  async function action(fn){if(busy)return;busy=true;try{await fn();}catch(error){status(error.message);}finally{busy=false;}}
  async function select(id){
    const serial=++ticket,p=await B.get(id);if(serial!==ticket)return;
    if(!p)throw new Error('This project is not on this browser’s shelf. Import its exported file in Telephone World.');
    selected=p;$('telephone-title').textContent=p.title;
    $('telephone-meta').textContent=p.sourceMode+' · '+new Date(p.updatedAt).toLocaleString()+' · '+(p.soundtrack?'Studio score attached':'no soundtrack yet');
    $('telephone-text').textContent=B.text(p);
    for(const [id,url] of [['telephone-open','./telephone.html?project='],['telephone-studio','./studio.html?project=']]){$(id).hidden=false;$(id).href=url+encodeURIComponent(p.id)+(id==='telephone-studio'?'#telephone':'');}
    for(const id of ['telephone-vault','telephone-world','telephone-export'])$(id).disabled=false;
    $('telephone-world').disabled=p.sourceMode!=='fiction';
    status(p.sourceMode==='fiction'?'Review your text before copying it to a vault draft or making a playable map.':'Source held exactly. Saving and soundtracks preserve this mode; fictional map generation is disabled.');
  }
  async function refresh(){
    const entries=await B.list();$('telephone-shelf').replaceChildren();
    if(!entries.length)$('telephone-shelf').textContent='No saved sessions yet. Enter Telephone World, make something, then Save session.';
    for(const p of entries){const b=document.createElement('button');b.className='telephone-shelf-item';b.textContent=p.title+(p.hasSoundtrack?' ♫':'');b.onclick=()=>action(()=>select(p.id));$('telephone-shelf').append(b);}
    if(selected)await select(selected.id);
  }
  $('telephone-refresh').onclick=()=>action(refresh);
  $('telephone-vault').onclick=()=>action(async()=>{if(!selected)return;const latest=await B.get(selected.id);await stageDraft(latest);});
  $('telephone-world').onclick=()=>action(async()=>{if(!selected)return;const latest=await B.get(selected.id);await stageWorld(telephoneWorld(latest));status('Fictional map opened in your world workshop. Review it and use the existing Save world control to keep it.');});
  $('telephone-export').onclick=()=>action(async()=>{if(selected)B.download(await B.get(selected.id));});
  B.watch(()=>{refresh().catch(error=>status(error.message));});
  window.addEventListener('keeper-viewchange',event=>{if(event.detail==='telephone')refresh().catch(error=>status(error.message));});
  const params=new URLSearchParams(location.search),requested=params.get('telephone');
  action(async()=>{await refresh();if(requested){await select(requested);navigate('telephone');status(params.get('carry')==='vault'?'Your story is ready below. Unlock your vault, then choose Copy to vault draft.':params.get('carry')==='world'?'Your session is ready below. Choose Make playable world to review its map.':'Your session is ready.');}});
  return {refresh};
}
