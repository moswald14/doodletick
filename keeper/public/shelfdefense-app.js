/* ShelfDEFENSE — interface and accessible controls. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const types = ['pencil','glue','band','knight','lamp'];
  const names = {pencil:'Pencil Patrol',glue:'Sticky Situation',band:'Rubber Ranger',knight:'Pocket Knight',lamp:'Laser Lamp'};
  const descriptions = {
    pencil:'A trusty all-rounder. Quick, precise shots keep the little troublemakers in check.',
    glue:'A sticky little bottleneck. Slows a whole group so your other defenders can do their thing.',
    band:'Snap, crackle, chaos. Splash damage makes short work of tightly packed dust bunnies.',
    knight:'A tiny hero with a very big sword. Heavy close-range damage and excellent corner coverage.',
    lamp:'Light up the big ones. Long-range energy attacks cut through stubborn armor.'
  };
  const maps = ['The Reading Room','The Greenhouse','The Midnight Archive'];
  const icons = {pencil:'✎',glue:'◒',band:'⋔',knight:'♞',lamp:'◈'};
  let state = null, game = null, toastTimer, inspectorKey = '', previousPhase = '', lastWave = -1;
  let sound = false;
  // A saved preference never starts sound on page load. Enable it explicitly.
  const setText = (id,value) => {const el=$(id);if(el&&el.textContent!==String(value))el.textContent=value;};
  const safe = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function toast(message,kind='info') {
    const el=$('toast');if(!el)return;el.textContent=message;el.dataset.kind=kind;el.classList.add('visible');
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3400);
  }
  function modal(id,open) {const el=$(id);if(!el)return;el.hidden=!open;el.setAttribute('aria-hidden',String(!open));if(open){el.querySelector('button')?.focus();}else if(id==='welcome-overlay'){$('start-btn')?.focus();}}
  function definition(type){return game?.defs?.[type]||window.ShelfDefense.TowerDefs?.[type]||{};}
  function upgradeButton(branch,data,coins,locked=false){
    if(!data||data.available===false)return '';return `<button type="button" class="upgrade-btn" data-upgrade="${branch}" ${coins<data.cost||locked?'disabled':''}><span><strong>Upgrade: ${safe(data.name||'Next level')}</strong><small>${safe(data.description||'Improve this defender.')}${coins<data.cost?` Need ${data.cost-coins} more coins.`:''}</small></span><b>${safe(data.cost)}<span> coins</span></b></button>`;
  }
  function skillWeb(t,s){
    const web=t.skillWeb;if(!web?.nodes)return `<div class="upgrade-options">${upgradeButton('a',t.upgradeA,s.coins)}${upgradeButton('b',t.upgradeB,s.coins)}</div>`;
    const positions=Object.fromEntries(web.nodes.map(n=>[n.id,n]));
    const edges=web.edges.map(([a,b])=>{const p=positions[a],q=positions[b];if(!p||!q)return '';return `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" class="${p.status==='owned'&&q.status==='owned'?'learned':''}"/>`;}).join('');
    return `<p class="skill-instruction">Choose a main path. Add utility skills. Click a green node to learn it.</p><div class="skill-web"><svg class="skill-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${edges}</svg>${web.nodes.map(n=>{const disabled=n.status!=='available'||s.coins<n.cost||['paused','won','lost'].includes(s.phase);return `<button type="button" class="skill-node ${safe(n.status)}" data-skill="${safe(n.id)}" ${disabled?'disabled':''} style="left:${n.x}%;top:${n.y}%" title="${safe(n.description)}${n.cost?` (${n.cost} coins)`:''}" aria-label="${safe(n.name)}, ${safe(n.status)}${n.cost?`, ${n.cost} coins`:''}"><strong>${safe(n.name)}</strong><small>${n.status==='owned'?'LEARNED':n.status==='blocked'?'OTHER PATH':n.status==='locked'?'LOCKED':`${n.cost} coins`}</small></button>`;}).join('')}</div><details class="skill-notes"><summary>Read skill effects</summary><dl>${web.nodes.filter(n=>n.id!=='core').map(n=>`<dt>${safe(n.name)}</dt><dd>${safe(n.description)}</dd>`).join('')}</dl></details>`;
  }
  function inspector(s){
    const t=s.selectedTower,type=t?.type||s.armedType;
    const key=JSON.stringify([t?.id,type,t?.level,t?.branch,t?.spent,t?.skills,t?.waveSignature,s.coins,s.phase]);if(key===inspectorKey)return;inspectorKey=key;
    const el=$('inspector');if(!el)return;
    if(!type){
      el.innerHTML='<div class="inspector-empty"><div class="empty-emblem"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 50h40M18 48V26l14-9 14 9v22M25 45V32h14v13M32 7v10M27 12h10" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="32" cy="36" r="3" fill="currentColor"/></svg></div><span class="eyebrow">A PLACE FOR EVERY HERO</span><h3>Your shelf. Your strategy.</h3><p>Pick a defender, then click a round build pad. Click a placed defender to open its upgrades.</p><div class="tactical-tip"><b>Grow your tiny army</b> Every tower has two upgrade paths and four levels.</div></div>';
      return;
    }
    const d=definition(type),cost=d.cost||({pencil:70,glue:85,band:125,knight:160,lamp:220}[type]);
    const title=names[type]||d.name||type;
    let stats='';if(t){stats=`<div class="tower-stats"><div><small>POWER</small><b>${safe(t.damage??d.damage??'—')}</b></div><div><small>RANGE</small><b>${Math.round(t.range??d.range??0)}</b></div><div><small>LEVEL</small><b>${safe(t.level||1)}<em>/4</em></b></div></div>`;}
    const locked=['paused','won','lost'].includes(s.phase);
    el.innerHTML=`<div class="inspector-detail"><div class="selected-type ${safe(type)}"><span>${icons[type]}</span><small>${t?'DEFENDER SELECTED':'READY TO BUILD'}</small></div><h3>${safe(title)}</h3><p>${safe(descriptions[type])}</p>${stats}${t?`<h4 class="upgrade-title">Tower upgrades <span>SKILL WEB</span></h4><p class="upgrade-branch">${t.level===1?'Choose one path. Keep upgrading it to level 4.':safe(t.branchName)}</p>${s.phase==='paused'?'<p class="upgrade-locked">Resume the battle to upgrade or sell.</p>':''}${skillWeb(t,s)}<button class="sell-btn" type="button" id="sell-btn" ${locked?'disabled':''}>Sell defender <b>+${safe(t.sellValue??Math.round(cost*.7))}</b></button>`:`<div class="placement-note"><span class="pulse-dot"></span> Click an empty build pad <b>${cost} coins</b></div><button class="sell-btn" type="button" id="cancel-build-btn">Cancel placement <kbd>ESC</kbd></button>`}</div>`;
    if(t){el.innerHTML=el.innerHTML.replace('<button class="sell-btn"',`<div class="wave-equipped"><small>ATTACK SIGNAL</small><strong>${safe(t.waveName||'Stock attack')}</strong>${t.waveSignature?`<code>${safe(t.waveSignature)}</code>`:''}<button type="button" id="open-wave-lab-btn">Shape attack in Dot Wave</button></div><button class="sell-btn"`);$('open-wave-lab-btn')?.addEventListener('click',()=>window.ShelfWaveLab?.open());}
    el.querySelectorAll('[data-upgrade]').forEach(b=>b.addEventListener('click',()=>game.upgrade(b.dataset.upgrade)));
    el.querySelectorAll('[data-skill]').forEach(b=>b.addEventListener('click',()=>game.buySkill(b.dataset.skill)));
    $('sell-btn')?.addEventListener('click',()=>game.sell());
    $('cancel-build-btn')?.addEventListener('click',()=>game.selectBuild(null));
  }
  function render(s){
    state=s;setText('wave-value',`${String(s.wave).padStart(2,'0')} / ${s.endless?'∞':s.maxWaves||20}`);
    setText('best-value',`${Number(s.best?.score||0).toLocaleString()} points`);
    setText('coins-value',s.coins);setText('lives-value',s.lives);setText('score-value',Number(s.score||0).toLocaleString());
    const paused=s.phase==='paused',active=s.phase==='wave';
    $('pause-btn').disabled=['won','lost','build'].includes(s.phase);
    $('pause-btn').setAttribute('aria-label',paused?'Resume game':'Pause game');
    $('pause-btn').setAttribute('aria-pressed',String(paused));
    $('pause-btn').innerHTML=paused?'<span aria-hidden="true">▶</span> Resume':'<span aria-hidden="true">Ⅱ</span> Pause';
    setText('speed-btn',`${s.speed||1}× speed`);
    const start=$('start-btn');start.disabled=s.phase!=='build';
    start.classList.toggle('boss-next',s.phase==='build'&&(s.wave+1)%5===0);
    start.innerHTML=active?'<span>Wave in progress</span><span class="live-dot" aria-hidden="true"></span>':paused?'<span>Game paused</span><span>Ⅱ</span>':s.phase==='won'?'<span>Shelf defended!</span><span>✓</span>':s.phase==='lost'?'<span>Another story awaits</span>':`<span>Send wave ${String(s.wave+1).padStart(2,'0')}</span><span aria-hidden="true">↗</span>`;
    const cool=Math.ceil(s.abilityCooldown||0),ability=$('ability-btn');ability.disabled=!active||cool>0;
    setText('ability-status',cool>0?`Ready in ${cool}s`:active?'Ready · clear a little space':'Ready during a wave');
    ability.setAttribute('aria-label',cool>0?`The Big Sweep, ready in ${cool} seconds`:'Use the Big Sweep emergency ability');
    document.querySelectorAll('[data-tower]').forEach(el=>{const t=el.dataset.tower;el.classList.toggle('armed',s.armedType===t);el.setAttribute('aria-pressed',String(s.armedType===t));el.classList.toggle('unaffordable',s.coins<(definition(t).cost||Number(el.dataset.cost)||0));});
    document.querySelectorAll('[data-map]').forEach(el=>{el.classList.toggle('active',Number(el.dataset.map)===(s.mapIndex||0));el.setAttribute('aria-pressed',String(Number(el.dataset.map)===(s.mapIndex||0)));});
    for(const shelf of s.shelves||[]){
      const el=document.querySelector(`[data-map="${shelf.mapIndex}"]`);el?.classList.toggle('running',shelf.phase==='wave');
      el?.setAttribute('aria-label',`${shelf.name}: wave ${shelf.wave}, ${shelf.lives} health, ${shelf.phase}`);
      setText(`shelf-stat-${shelf.mapIndex}`,`W${String(shelf.wave).padStart(2,'0')} / ${shelf.lives} HP`);
    }
    setText('all-shelves-btn',s.allPaused?'Resume running shelves':'Pause all shelves');
    setText('map-title',maps[s.mapIndex||0]);
    setText('chapter-label',`CHAPTER 0${(s.mapIndex||0)+1}`);
    if(s.phase==='build'&&(s.wave+1)%5===0)start.innerHTML=`<span>Send boss wave ${String(s.wave+1).padStart(2,'0')}</span><span aria-hidden="true">!</span>`;
    const boss=s.boss;
    if($('boss-bar')){
      $('boss-bar').hidden=!boss;
      $('battlefield')?.classList.toggle('boss-active',!!boss);
      if(boss){const percent=Math.max(0,Math.min(100,boss.hp/boss.maxHp*100));setText('boss-name',boss.name);setText('boss-health',`${Math.ceil(boss.hp)} / ${Math.ceil(boss.maxHp)} HP`);$('boss-meter').value=percent;$('boss-meter').setAttribute('aria-valuetext',`${Math.ceil(percent)} percent health`);}
    }
    setText('save-status',s.unreadSave?'The unread browser save is protected. Current play is temporary.':s.persistenceAvailable===false?'Shelves kept for this session. Browser storage is unavailable.':'All three shelves save here. Started battles keep running when you switch.');
    const warning=$('shelf-save-warning');
    if(warning){warning.hidden=!s.unreadSave;warning.textContent=s.unreadSave?'Your saved shelves could not be fully opened. Nothing has overwritten them. Export the unread save before importing a replacement; current play stays in this tab.':'';}
    setText('shelf-export-save',s.unreadSave?'Export unread shelf save':'Export shelf save');
    setText('board-hint-text',s.armedType?'Click a build pad to place your defender.':s.selectedTower?'Tower selected. Choose an upgrade in Shelf Command.':s.phase==='paused'?'Battle saved and paused. Press Resume when ready.':'Place a defender, then click it to upgrade.');
    setText('forecast-wave',String(Math.min(s.wave+1,s.endless?Infinity:20)).padStart(2,'0'));
    if(s.nextWave){const next=s.wave+1,nextBoss=Math.ceil(next/5)*5;setText('forecast',s.phase==='won'?'Campaign complete. Endless mode awaits.':next%5===0?`BOSS WAVE ${next}: The Shelf Wrecker. Upgrade your defenders before sending it.`:`${s.nextWave}. Next boss: wave ${nextBoss}.`);}
    else if(s.wave!==lastWave){setText('forecast',s.wave===0?'A few curious dust bunnies. A good time to get your pencils in position.':(s.wave+1)%5===0?'A boss is approaching. Upgrade your strongest defenders.':'More trouble is on the way. Mix slowing and splash damage.');}
    lastWave=s.wave;inspector(s);
    if(s.phase!==previousPhase){
      if(s.phase==='won'||s.phase==='lost'){
        setText('result-title',s.phase==='won'?'A shelf worth saving.':'Every hero gets a sequel.');
        setText('result-copy',s.phase==='won'?`All ${s.maxWaves||20} waves defeated. ${s.kills||0} troublemakers stopped. ${Number(s.score||0).toLocaleString()} points. Try another shelf for a fresh challenge.`:`You held out through wave ${s.wave}. Move your defenders closer to bends, add some glue, and give the shelf another chance.`);
        $('next-map-btn').hidden=s.phase!=='won';$('endless-btn').hidden=s.phase!=='won';modal('result-overlay',true);
      }
      previousPhase=s.phase;
    }
  }
  function syncSound(persist=true){game?.setSound(sound);$('sound-btn').setAttribute('aria-pressed',String(sound));$('sound-btn').setAttribute('aria-label',sound?'Mute sound':'Enable sound');$('sound-btn').innerHTML=`<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="none" stroke="currentColor" stroke-width="1.5"/>${sound?'<path d="M16 8q5 4 0 8m3-11q7 7 0 14" fill="none" stroke="currentColor" stroke-width="1.5"/>':'<path d="m17 9 5 6m0-6-5 6" fill="none" stroke="currentColor" stroke-width="1.5"/>'}</svg><span>Sound ${sound?'on':'off'}</span>`;if(persist)try{localStorage.setItem('shelfdefense-sound',String(sound));}catch{}}
  const endlessButton=document.createElement('button');endlessButton.type='button';endlessButton.id='endless-btn';endlessButton.className='secondary-button';endlessButton.textContent='Play endless';endlessButton.hidden=true;
  $('next-map-btn').parentElement.append(endlessButton);
  const footnote=document.querySelector('.command-footnote p');if(footnote)footnote.innerHTML='Your best on this shelf<br><strong id="best-value">0 points</strong>';
  game=new window.ShelfDefense($('game-canvas'),{onUpdate:render,onEvent:toast});
  // Kept available for reproducible local playtests and accessibility tools.
  window.shelfGame=game;
  syncSound(false);render(game.getSnapshot());
  $('shelf-export-save').addEventListener('click',()=>{
    const unread=game.getSnapshot().unreadSave;
    const blob=new Blob([game.exportProgress()],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=unread?'ShelfDEFENSE-unread-save.json':'ShelfDEFENSE-shelves.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    setText('shelf-import-status',unread?'Unread save exported unchanged.':'All three shelves exported. Keep this file to move or back up your game.');
  });
  $('shelf-import-save').addEventListener('change',async event=>{
    const input=event.target,file=input.files?.[0];if(!file)return;
    try{
      if(file.size>5*1024*1024)throw new Error('Choose a shelf save smaller than 5 MB.');
      const candidate=JSON.parse(await file.text());
      if(!window.ShelfDefense.validSave(candidate))throw new Error('That shelf save is invalid or unsupported. Your current game has not changed.');
      if(!window.confirm('Replace this browser’s three shelf battles with this save? Export your current shelf save first if you want to keep it. Your Keeper vault, garden and DVC are separate.'))return;
      game.importProgress(candidate);sound=false;syncSound(false);inspectorKey='';previousPhase='';modal('result-overlay',false);render(game.getSnapshot());
      setText('shelf-import-status','Shelf save imported. Battles and sound are paused until you choose to play.');
    }catch(error){setText('shelf-import-status',error.message||'The save could not be imported.');}
    finally{input.value='';}
  });
  document.querySelectorAll('[data-tower]').forEach(el=>el.addEventListener('click',()=>game.selectBuild(el.dataset.tower)));
  $('start-btn').addEventListener('click',()=>game.startWave());
  $('pause-btn').addEventListener('click',()=>game.togglePause());
  $('speed-btn').addEventListener('click',()=>game.setSpeed(state.speed===1?2:state.speed===2?3:1));
  $('ability-btn').addEventListener('click',()=>game.useAbility());
  $('sound-btn').addEventListener('click',()=>{sound=!sound;syncSound();});
  window.addEventListener('shelf-sound-enabled',()=>{sound=true;syncSound();});
  $('play-btn').addEventListener('click',()=>{modal('welcome-overlay',false);syncSound();try{sessionStorage.setItem('shelfdefense-welcomed','yes');}catch{}});
  function guide(open){if(open&&state.phase==='wave')game.togglePause();modal('guide-overlay',open);}
  $('guide-open').addEventListener('click',()=>guide(true));
  document.querySelectorAll('[data-guide]').forEach(el=>el.addEventListener('click',()=>{modal('welcome-overlay',false);guide(true);}));
  $('guide-close').addEventListener('click',()=>guide(false));
  function restart(map){modal('result-overlay',false);inspectorKey='';previousPhase='';game.restart(map);toast(`A fresh start in ${maps[map]}. Make it yours.`);}
  function switchShelf(map){modal('result-overlay',false);inspectorKey='';previousPhase='';game.switchMap(map);toast(`${maps[map]} opened. Each shelf keeps its own defense.`);}
  $('retry-btn').addEventListener('click',()=>restart(state.mapIndex||0));
  $('next-map-btn').addEventListener('click',()=>switchShelf(((state.mapIndex||0)+1)%3));
  $('all-shelves-btn')?.addEventListener('click',()=>game.toggleAllPause());
  endlessButton.addEventListener('click',()=>{modal('result-overlay',false);game.continueEndless();toast('The story continues. How long can your shelf stand?');});
  document.querySelectorAll('[data-map]').forEach(el=>el.addEventListener('click',()=>{if(Number(el.dataset.map)!==(state.mapIndex||0))switchShelf(Number(el.dataset.map));}));
  document.addEventListener('keydown',e=>{
    if(e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName))return;
    const modalOpen=['welcome-overlay','guide-overlay','result-overlay','wave-lab-overlay'].some(id=>$(id)&&!$(id).hidden);
    if(modalOpen){if(e.key==='Escape'&&!$('guide-overlay').hidden)guide(false);return;}
    if(/^[1-5]$/.test(e.key)){game.selectBuild(types[Number(e.key)-1]);e.preventDefault();}
    if(e.code==='Space'){if(e.repeat)return;e.preventDefault();if(state.phase==='build')game.startWave();else if(['wave','paused'].includes(state.phase))game.togglePause();}
    if(e.key.toLowerCase()==='p')game.togglePause();
    if(e.key.toLowerCase()==='f')game.useAbility();
    if(e.key==='Escape')game.selectBuild(null);
  });
  function pausePage(){game.pauseAll();sound=false;syncSound(false);game.saveProgress();}
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pausePage();});
  window.addEventListener('pagehide',pausePage);
  for(const id of ['shelf-back-keeper','shelf-open-idle'])$(id)?.addEventListener('click',pausePage);
  // Escape closes the guide. Tab stays inside the open dialog.
  document.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const dialog=['result-overlay','guide-overlay','welcome-overlay'].map($).find(el=>!el.hidden);if(!dialog)return;const buttons=[...dialog.querySelectorAll('button:not([hidden]):not(:disabled)')];if(!buttons.length)return;const first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}});
  try{if(sessionStorage.getItem('shelfdefense-welcomed')==='yes')modal('welcome-overlay',false);}catch{}
})();
