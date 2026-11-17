/* ShelfDEFENSE — deterministic local simulation and canvas controller. */
(() => {
  'use strict';
  const W = 1200, H = 700, TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const COLORS = { pencil: '#ffc66d', glue: '#91dcb4', band: '#dba6f4', knight: '#86bcea', lamp: '#ffe9a5' };
  const DEFS = {
    pencil: { name: 'Pencil Patrol', role: 'Fast, reliable sharpshooter', cost: 70, color: COLORS.pencil, range: 154, damage: 19, rate: .67, projectileSpeed: 720, icon: '\u270f\ufe0f' },
    glue: { name: 'Sticky Situation', role: 'Sticky splash, slows groups', cost: 85, color: COLORS.glue, range: 147, damage: 8, rate: 1.18, projectileSpeed: 380, splash: 67, slow: .48, slowTime: 2.8, icon: '\ud83e\uddf4' },
    band: { name: 'Rubber Ranger', role: 'Long range, bouncing bursts', cost: 125, color: COLORS.band, range: 204, damage: 43, rate: 1.22, projectileSpeed: 670, splash: 52, icon: '\ud83c\udfaf' },
    knight: { name: 'Pocket Knight', role: 'Close-range crowd control', cost: 160, color: COLORS.knight, range: 105, damage: 53, rate: .81, melee: true, splash: 75, icon: '\ud83d\udee1\ufe0f' },
    lamp: { name: 'Laser Lamp', role: 'Armor-piercing beam', cost: 220, color: COLORS.lamp, range: 218, damage: 12, rate: .16, laser: true, ignoreArmor: true, icon: '\ud83d\udca1' }
  };
  const UPGRADES = {
    pencil: [
      { name: 'Sharp Thinking', description: 'Heavy graphite hits harder and punches through armor.', damage: 1.65, range: 1.08, armorPierce: .65 },
      { name: 'Doodle Storm', description: 'A lightning-fast sketching hand fires 60% faster.', rate: .61, damage: 1.08, range: 1.05 }
    ],
    glue: [
      { name: 'Super Sticky', description: 'Longer, stronger slows keep the whole swarm in range.', slow: .30, slowTime: 4.2, splash: 1.25, damage: 1.2 },
      { name: 'Acid Arts', description: 'Corrosive glue deals triple damage and melts armor.', damage: 3.1, rate: .9, armorPierce: 1, slow: .58 }
    ],
    band: [
      { name: 'Ricochet Club', description: 'Rubber shots bounce to two nearby enemies.', bounces: 2, damage: 1.3, range: 1.1 },
      { name: 'Big Stretch', description: 'Huge elastic impacts burst across a wider area.', damage: 1.65, splash: 1.9, rate: 1.02 }
    ],
    knight: [
      { name: 'Round Table', description: 'A wide heroic sweep protects more of the shelf.', range: 1.45, damage: 1.35, splash: 1.3 },
      { name: 'Dragon Slayer', description: 'Heavy blows ignore armor and deal bonus boss damage.', damage: 1.85, bossBonus: 1.8, armorPierce: 1 }
    ],
    lamp: [
      { name: 'Prism Party', description: 'Split the beam between three nearby targets.', multi: 3, damage: 1.08, range: 1.1 },
      { name: 'Midnight Sun', description: 'A focused hot beam doubles damage and reach.', damage: 2.1, range: 1.24, rate: .93 }
    ]
  };
  const SKILLS = {
    pencil:{focus:{name:'Fresh Lead',description:'25% more damage from sharper graphite.',cost:55,damage:1.25},reach:{name:'Long Scribble',description:'20% more reach across the shelf.',cost:60,range:1.2}},
    glue:{focus:{name:'Slow Cure',description:'Sticky puddles slow enemies 60% longer.',cost:60,slowTime:1.6},reach:{name:'Wide Spill',description:'35% wider splash catches more invaders.',cost:70,splash:1.35}},
    band:{focus:{name:'Double Knot',description:'30% wider rubber-band splash.',cost:75,splash:1.3},reach:{name:'Long Elastic',description:'22% more range for trick shots.',cost:85,range:1.22}},
    knight:{focus:{name:'Brave Boots',description:'22% more reach for heroic sweeps.',cost:90,range:1.22},reach:{name:'Quick Draw',description:'25% faster sword swings.',cost:95,rate:.8}},
    lamp:{focus:{name:'Bright Idea',description:'24% more beam damage.',cost:110,damage:1.24},reach:{name:'Long Light',description:'20% more reach for the laser beam.',cost:120,range:1.2}}
  };
  const MAPS = [
    { name: 'The Reading Room', subtitle: 'A cozy corner. An uncozy invasion.', path: [[-30,143],[235,143],[235,340],[490,340],[490,175],[745,175],[745,510],[1025,510],[1025,345],[1230,345]], pads: [[100,240],[140,75],[330,220],[140,430],[365,425],[410,130],[590,270],[590,85],[650,425],[860,270],[860,600],[1025,600],[1115,440],[1115,250],[895,435],[50,60],[485,65]] },
    { name: 'The Greenhouse', subtitle: 'The shortest route is rarely the safest.', path: [[-30,240],[265,240],[265,510],[535,510],[535,150],[835,150],[835,430],[1060,430],[1060,250],[1230,250]], pads: [[110,150],[140,335],[350,335],[165,510],[355,600],[435,420],[445,170],[630,245],[665,65],[740,340],[635,535],[930,245],[940,530],[1125,530],[1145,340],[970,100],[145,440]] },
    { name: 'The Midnight Archive', subtitle: 'One last stand after lights out.', path: [[-30,540],[205,540],[205,170],[470,170],[470,430],[725,430],[725,210],[985,210],[985,540],[1230,540]], pads: [[95,430],[105,620],[120,250],[295,260],[300,80],[385,345],[560,255],[590,520],[630,335],[805,115],[855,310],[845,505],[1090,350],[1090,620],[1120,115],[425,585],[50,90]] }
  ];
  const ENEMIES = {
    dust: { name: 'Dust Bunny', hp: 39, speed: 53, reward: 8, radius: 14, armor: 0, leak: 1 },
    fast: { name: 'Silverfish', hp: 29, speed: 91, reward: 9, radius: 12, armor: 0, leak: 1 },
    bookworm: { name: 'Bookworm', hp: 73, speed: 44, reward: 12, radius: 17, armor: .08, leak: 1 },
    armored: { name: 'Tin Beetle', hp: 156, speed: 37, reward: 18, radius: 19, armor: .43, leak: 2 },
    boss: { name: 'The Shelf Wrecker', hp: 560, speed: 25, reward: 105, radius: 32, armor: .2, leak: 5 },
    moth: { name: 'Paper Moth', hp: 44, speed: 72, reward: 12, radius: 15, armor: 0, leak: 1, flying: true },
    inkling: { name: 'Inkling', hp: 92, speed: 45, reward: 15, radius: 17, armor: .04, leak: 1 },
    binder: { name: 'Binder Bug', hp: 150, speed: 34, reward: 21, radius: 20, armor: .12, leak: 2, shield: 95 },
    nurse: { name: 'Mender Mite', hp: 110, speed: 39, reward: 20, radius: 18, armor: 0, leak: 1 },
    crumb: { name: 'Ink Crumb', hp: 15, speed: 91, reward: 3, radius: 8, armor: 0, leak: 1 }
  };
  const WAVE_NAMES = ['Dust at Dawn','The Wiggle Brigade','Fast & Fluffy','Tin Trouble','The First Wrecker','Under the Bookends','Paper Chase','Heavy Reading','A Very Bad Bookmark','Wrecker Returns','Dust Never Sleeps','The Silverfish Express','Armored Delivery','Glue or Glory','The Grand Dust-up','A Little Shelf Control','No Quiet in the Library','Everything Must Glow','The Last Page','THE SHELF WRECKER'];
  const SAVE_KEY = 'shelfdefense.saves.v1';
  const SAVE_FIELDS = ['coins','lives','wave','phase','previousPhase','speed','kills','score','endless','uid','towers','enemies','projectiles','queue','spawnTimer','waveEnemyCount','abilityCooldown'];
  const LIVE_FIELDS = [...SAVE_FIELDS,'mapIndex','path','pads','segments','pathLength','particles','floaters','beams','selectedId','armedType','shake','bookDrop','hover','queuedTime'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const finite = (value,min=-1e15,max=1e15) => typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
  const whole = (value,min=0,max=1e9) => finite(value,min,max)&&Number.isInteger(value);
  const own = (object,key) => typeof key==='string'&&Object.prototype.hasOwnProperty.call(object,key);
  const mapNumber = value => Number.isInteger(Number(value))?clamp(Number(value),0,MAPS.length-1):0;
  const WAVE_ANALYSIS=new WeakMap();
  const WAVE_TYPES=['sine','square','triangle','saw','rsaw','pulse','noise','custom'];
  function validWave(value) {
    if(!value||typeof value!=='object'||Array.isArray(value)||value.schema!=='shelfdefense.wave.v1'||typeof value.name!=='string'||value.name.length>40||!WAVE_TYPES.includes(value.waveA)||!['off',...WAVE_TYPES].includes(value.waveB))return false;
    if(!finite(value.cycles,.5,8)||!finite(value.amp,.1,1)||!finite(value.phase,0,360)||!finite(value.duty,.05,.95)||!finite(value.ratio,.25,8)||!finite(value.mix,0,1)||!finite(value.frequency,80,1200)||!finite(value.envelope,.08,.65)||!whole(value.seed,0,4294967295))return false;
    if(!Array.isArray(value.custom)||![32,64].includes(value.custom.length)||!value.custom.every(n=>finite(n,-1,1)))return false;
    if(window.ShelfWaves?.importPreset){try{window.ShelfWaves.importPreset(value);}catch(_){return false;}}
    return true;
  }
  function waveInfo(value) {
    if(!value||!window.ShelfWaves)return null;
    if(WAVE_ANALYSIS.has(value))return WAVE_ANALYSIS.get(value);
    try{const info={signature:window.ShelfWaves.signature(value),analysis:window.ShelfWaves.analyze(value)};WAVE_ANALYSIS.set(value,info);return info;}catch(_){return null;}
  }
  function safeTree(value,depth=0) {
    if(depth>12)return false;
    if(value===null||typeof value==='boolean'||typeof value==='string')return true;
    if(typeof value==='number')return Number.isFinite(value);
    if(Array.isArray(value))return value.length<=5000&&value.every(v=>safeTree(v,depth+1));
    if(value&&typeof value==='object')return Object.keys(value).length<100&&Object.entries(value).every(([k,v])=>k!=='__proto__'&&k!=='constructor'&&k!=='prototype'&&safeTree(v,depth+1));
    return false;
  }
  function validSave(s,mapIndex) {
    if(!s||typeof s!=='object'||Array.isArray(s)||!safeTree(s))return false;
    if(!whole(s.coins)||!whole(s.lives,0,20)||!whole(s.wave,0,1e6)||!whole(s.kills)||!whole(s.score,0,1e15)||!whole(s.uid,1)||![1,2,3].includes(s.speed)||typeof s.endless!=='boolean')return false;
    if(!['build','wave','paused','won','lost'].includes(s.phase)||!['build','wave'].includes(s.previousPhase)||!finite(s.spawnTimer,-10,100)||!finite(s.abilityCooldown,0,1000)||!whole(s.waveEnemyCount,0,10000))return false;
    if(!Array.isArray(s.towers)||s.towers.length>MAPS[mapIndex].pads.length||!Array.isArray(s.enemies)||s.enemies.length>1000||!Array.isArray(s.projectiles)||s.projectiles.length>2000||!Array.isArray(s.queue)||s.queue.length>1000)return false;
    const towerPads=new Set(),ids=new Set();
    const entityId = e => {if(!whole(e.id,1)||ids.has(e.id)||e.id>=s.uid)return false;ids.add(e.id);return true;};
    for(const t of s.towers){
      if(!t||!own(DEFS,t.type)||!whole(t.padId,0,MAPS[mapIndex].pads.length-1)||towerPads.has(t.padId)||!entityId(t)||!whole(t.level,1,4)||![null,0,1].includes(t.branch)||(t.level===1?t.branch!==null:t.branch===null))return false;
      const pad=MAPS[mapIndex].pads[t.padId];if(t.x!==pad[0]||t.y!==pad[1]||!whole(t.spent)||!whole(t.kills)||!finite(t.damageDealt,0)||!finite(t.cooldown)||!finite(t.angle)||!finite(t.kick,0,1))return false;towerPads.add(t.padId);
      if(t.skills!==undefined&&(!Array.isArray(t.skills)||t.skills.length>2||new Set(t.skills).size!==t.skills.length||!t.skills.every(id=>id==='focus'||id==='reach')||(t.skills.length&&t.branch===null)))return false;
      if(t.wave!==undefined&&t.wave!==null&&!validWave(t.wave))return false;
    }
    for(const e of s.enemies){
      if(!e||!own(ENEMIES,e.type)||!entityId(e)||!finite(e.x,-100,1400)||!finite(e.y,-100,800)||!finite(e.hp)||!finite(e.maxHp,.01)||e.hp>e.maxHp||!finite(e.distance,0,10000)||!finite(e.speed,.01,10000)||!whole(e.reward)||!finite(e.r,1,100)||!finite(e.armor,0,1)||!whole(e.leak,1,20)||!finite(e.slow,0,1)||!finite(e.slowTimer,0,100)||!finite(e.flash,0,1)||!finite(e.wobble)||!finite(e.angle)||typeof e.dead!=='boolean'||typeof e.name!=='string')return false;
      if(e.flying!==undefined&&typeof e.flying!=='boolean'||e.hasSplit!==undefined&&typeof e.hasSplit!=='boolean'||e.shieldHp!==undefined&&!finite(e.shieldHp,0)||e.maxShieldHp!==undefined&&!finite(e.maxShieldHp,0)||e.healCooldown!==undefined&&!finite(e.healCooldown,-1,100)||e.healFlash!==undefined&&!finite(e.healFlash,0,1)||(e.shieldHp||0)>(e.maxShieldHp||0))return false;
    }
    for(const p of s.projectiles){
      if(!p||!own(DEFS,p.type)||!whole(p.target,1)||!whole(p.towerId,1)||!finite(p.x,-1000,2200)||!finite(p.y,-1000,1700)||!finite(p.tx,-1000,2200)||!finite(p.ty,-1000,1700)||!finite(p.speed,.01,10000)||!finite(p.damage,0)||!finite(p.life,-1,10)||typeof p.dead!=='boolean'||typeof p.color!=='string'||!p.stats||!finite(p.stats.damage,0)||!finite(p.stats.range,1)||!finite(p.stats.rate,.001)||!finite(p.stats.slow,0,1)||!finite(p.stats.slowTime,0)||!finite(p.stats.splash,0))return false;
      if(p.wave!==undefined&&p.wave!==null&&!validWave(p.wave))return false;
    }
    if(!s.queue.every(q=>q&&own(ENEMIES,q.type)&&finite(q.delay,.001,100)))return false;
    return true;
  }
  function validEnvelope(value) {
    if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1||!whole(value.activeMap,0,MAPS.length-1))return false;
    if(!value.slots||typeof value.slots!=='object'||Array.isArray(value.slots))return false;
    const entries=Object.entries(value.slots);
    return entries.length>0&&entries.length<=MAPS.length&&entries.every(([index,state])=>/^[0-2]$/.test(index)&&validSave(state,Number(index)));
  }
  class ShelfDefense {
    constructor(canvas, options = {}) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      canvas.width = W; canvas.height = H;
      this.onUpdate = options.onUpdate || (() => {}); this.onEvent = options.onEvent || (() => {});
      this.defs = DEFS; this.maps = MAPS; this.maxWaves = 20; this.hover = null;
      this.sound = false; this.audio = null; this.audioLast = 0; this.clock = 0;
      this._listeners = [];this._initializing=true;this.persistenceAvailable=true;this.saveClock=0;
      this._rawStorage=new Map();this._unreadStorage=new Map();
      this.best = this.readStorage('shelfdefense.records', {});
      if(!this.best||typeof this.best!=='object'||Array.isArray(this.best)){this.protectStorage('shelfdefense.records');this.best={};}
      this._slots=Object.create(null);this._liveShelves=Object.create(null);this._resumeShelves=new Set();this._backgroundTick=false;this._advancing=false;this._pendingSave=false;
      const envelope=this.readStorage(SAVE_KEY,null);
      if(this._rawStorage.has(SAVE_KEY)&&!validEnvelope(envelope))this.protectStorage(SAVE_KEY);
      if(envelope&&envelope.version===1&&envelope.slots&&typeof envelope.slots==='object'&&!Array.isArray(envelope.slots))for(let i=0;i<MAPS.length;i++)if(validSave(envelope.slots[i],i))this._slots[i]=clone(envelope.slots[i]);
      const initial=Object.prototype.hasOwnProperty.call(options,'mapIndex')?mapNumber(options.mapIndex):envelope&&envelope.version===1?mapNumber(envelope.activeMap):0;
      // Hydrate every saved shelf once. A page reload pauses battles safely;
      // ordinary tab switches below retain the live running phase instead.
      for(let i=0;i<MAPS.length;i++)if(this._slots[i]){this.resetState(i);this.restoreState(this._slots[i]);this._liveShelves[i]=this.captureLiveState();}
      if(this._liveShelves[initial])this.applyLiveState(this._liveShelves[initial]);
      else{this.resetState(initial);this._liveShelves[initial]=this.captureLiveState();}
      this._initializing=false;this.emit();
      this.bindInput();
      this.lastTime = null;
      const frame = (now) => {
        if (this.destroyed) return;
        const elapsed = this.lastTime === null ? 0 : Math.min((now - this.lastTime) / 1000, .08);
        this.lastTime = now;
        this.clock += elapsed;
        this.advanceAll(elapsed);
        this.draw();
        this.uiClock += elapsed;
        if (this.uiClock >= .1) { this.uiClock = 0; this.emit(false); }
        this.saveClock+=elapsed;if(this.saveClock>=1){this.saveClock=0;this.saveProgress();}
        this.raf = requestAnimationFrame(frame);
      };
      this.raf = requestAnimationFrame(frame);
    }
    protectStorage(key) {if(this._rawStorage.has(key))this._unreadStorage.set(key,this._rawStorage.get(key));}
    readStorage(key, fallback) {
      let raw;try{raw=localStorage.getItem(key);}catch(_){this.persistenceAvailable=false;return fallback;}
      if(raw===null)return fallback;
      this._rawStorage.set(key,raw);
      try{return JSON.parse(raw);}catch(_){this.protectStorage(key);return fallback;}
    }
    writeStorage(key, value) {
      if(this._unreadStorage.has(key))return false;
      try{localStorage.setItem(key,JSON.stringify(value));return true;}catch(_){this.persistenceAvailable=false;return false;}
    }
    exportProgress() {
      if(this._unreadStorage.has(SAVE_KEY))return this._unreadStorage.get(SAVE_KEY);
      this.saveProgress();
      return JSON.stringify({version:1,activeMap:this.mapIndex,slots:this._slots},null,2);
    }
    importProgress(value) {
      if(!validEnvelope(value))throw new Error('This shelf save is invalid or from an unsupported version. Your current game has not changed.');
      const incoming=clone(value);
      for(const state of Object.values(incoming.slots))if(state.phase==='wave'){state.phase='paused';state.previousPhase='wave';}
      // Commit only a complete, validated save. A failed write leaves play intact.
      try{localStorage.setItem(SAVE_KEY,JSON.stringify(incoming));}catch(_){throw new Error('This browser could not save the imported shelves. Your current game has not changed.');}
      this._unreadStorage.delete(SAVE_KEY);this._rawStorage.set(SAVE_KEY,JSON.stringify(incoming));this.persistenceAvailable=true;
      this._initializing=true;this._slots=Object.assign(Object.create(null),incoming.slots);this._liveShelves=Object.create(null);this._resumeShelves.clear();
      for(let i=0;i<MAPS.length;i++)if(this._slots[i]){this.resetState(i);this.restoreState(this._slots[i]);this._liveShelves[i]=this.captureLiveState();}
      if(this._liveShelves[incoming.activeMap])this.applyLiveState(this._liveShelves[incoming.activeMap]);
      else{this.resetState(incoming.activeMap);this.rememberLiveState();}
      this.lastTime=null;this.setSound(false);this._initializing=false;this.emit(false);return this.getSnapshot();
    }
    resetState(mapIndex) {
      this.mapIndex = mapNumber(mapIndex);
      const map = MAPS[this.mapIndex];
      this.path = map.path.map(([x,y]) => ({ x,y })); this.pads = map.pads.map(([x,y],id) => ({ x,y,id }));
      this.segments = []; this.pathLength = 0;
      for (let i=1;i<this.path.length;i++) { const a=this.path[i-1],b=this.path[i],len=dist(a,b); this.segments.push({ a,b,len,start:this.pathLength }); this.pathLength+=len; }
      this.coins = 300; this.lives = 20; this.wave = 0; this.phase = 'build'; this.previousPhase = 'build'; this.speed = 1;
      this.kills = 0; this.score = 0; this.towers = []; this.enemies = []; this.projectiles = []; this.particles = []; this.floaters = []; this.beams = [];
      this.queue = []; this.spawnTimer = 0;this.waveEnemyCount=0; this.selectedId = null; this.armedType = null; this.abilityCooldown = 0; this.uid = 1; this.uiClock = 0; this.shake = 0; this.endless = false;this.bookDrop=0;this.lastTime=null;this.hover=null;
    }
    captureState() {const state={};for(const key of SAVE_FIELDS)state[key]=this[key];return clone(state);}
    captureLiveState() {const state={};for(const key of LIVE_FIELDS)state[key]=this[key];return state;}
    applyLiveState(state) {for(const key of LIVE_FIELDS)this[key]=state[key];}
    rememberLiveState() {if(this._liveShelves&&this.mapIndex!==undefined)this._liveShelves[this.mapIndex]=this.captureLiveState();}
    restoreState(state) {
      const restored=clone(state);for(const key of SAVE_FIELDS)this[key]=restored[key];
      for(const t of this.towers){if(!t.skills)t.skills=[];if(t.wave===undefined)t.wave=null;}
      for(const e of this.enemies){if(e.flying===undefined)e.flying=!!ENEMIES[e.type].flying;if(e.hasSplit===undefined)e.hasSplit=false;if(e.shieldHp===undefined)e.shieldHp=0;if(e.maxShieldHp===undefined)e.maxShieldHp=e.shieldHp;if(e.healCooldown===undefined)e.healCooldown=e.type==='nurse'?3.6:0;if(e.healFlash===undefined)e.healFlash=0;}
      if(this.phase==='wave'){this.previousPhase='wave';this.phase='paused';}
      this.selectedId=null;this.armedType=null;this.lastTime=null;
    }
    saveProgress() {
      if(this._initializing||!this._slots||this.mapIndex===undefined)return false;
      if(this._advancing){this._pendingSave=true;return false;}
      this.rememberLiveState();
      for(const [index,live] of Object.entries(this._liveShelves)){const state={};for(const key of SAVE_FIELDS)state[key]=live[key];this._slots[index]=clone(state);}
      return this.writeStorage(SAVE_KEY,{version:1,activeMap:this.mapIndex,slots:this._slots});
    }
    switchMap(index) {
      const next=mapNumber(index);if(next===this.mapIndex){this.saveProgress();return this.getSnapshot();}
      this.rememberLiveState();this._initializing=true;
      if(this._liveShelves[next])this.applyLiveState(this._liveShelves[next]);
      else{this.resetState(next);if(this._slots[next])this.restoreState(this._slots[next]);this.rememberLiveState();}
      this.lastTime=null;
      this._initializing=false;this.emit();return this.getSnapshot();
    }
    restart(index = this.mapIndex || 0) {
      const next=mapNumber(index);this.rememberLiveState();
      this._initializing=true;this.resetState(next);this.rememberLiveState();this._resumeShelves.delete(next);this._initializing=false;this.emit();return this.getSnapshot();
    }
    advanceAll(realDt) {
      if(!finite(realDt,0,10)||realDt===0||this._advancing)return;
      this.rememberLiveState();const viewed=this.mapIndex;this._advancing=true;
      try{
        for(const index of Object.keys(this._liveShelves)){
          this.applyLiveState(this._liveShelves[index]);this._backgroundTick=this.mapIndex!==viewed;
          if(this.phase==='wave'){
            const total=realDt*this.speed,steps=Math.max(1,Math.ceil(total/.025));
            for(let i=0;i<steps;i++)this.update(total/steps);
          }else if(this.phase!=='paused')this.updateEffects(realDt);
          this.rememberLiveState();
        }
      }finally{
        this._backgroundTick=false;this._advancing=false;this.applyLiveState(this._liveShelves[viewed]);
      }
      if(this._pendingSave){this._pendingSave=false;this.saveProgress();}
    }
    shelfSummaries() {
      return MAPS.map((map,mapIndex)=>{
        const state=mapIndex===this.mapIndex?this:this._liveShelves[mapIndex]||this._slots[mapIndex];
        return {mapIndex,name:map.name,wave:state?.wave||0,lives:state?.lives??20,coins:Math.floor(state?.coins??300),towerCount:state?.towers?.length||0,phase:state?.phase||'build',isActive:mapIndex===this.mapIndex};
      });
    }
    pauseAll() {
      this.rememberLiveState();const running=Object.entries(this._liveShelves).filter(([,live])=>live.phase==='wave');
      // A visibility event can repeat after the user already pressed Pause all.
      // Retain the original resume group until something is actually running.
      if(running.length){this._resumeShelves.clear();for(const [index,live] of running){live.previousPhase='wave';live.phase='paused';this._resumeShelves.add(Number(index));}}
      this.applyLiveState(this._liveShelves[this.mapIndex]);this.emit();return this.getSnapshot();
    }
    toggleAllPause() {
      this.rememberLiveState();
      if(Object.values(this._liveShelves).some(live=>live.phase==='wave'))return this.pauseAll();
      const resume=this._resumeShelves.size?[...this._resumeShelves]:Object.keys(this._liveShelves).map(Number);
      for(const index of resume){const live=this._liveShelves[index];if(live?.phase==='paused'&&live.previousPhase==='wave')live.phase='wave';}
      this._resumeShelves.clear();this.applyLiveState(this._liveShelves[this.mapIndex]);this.emit();return this.getSnapshot();
    }
    bindInput() {
      const on = (el,event,fn,options) => { if(el && el.addEventListener){el.addEventListener(event,fn,options);this._listeners.push([el,event,fn,options]);} };
      const point = e => { const r=this.canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*H/r.height}; };
      on(this.canvas,'pointermove',e=>{ this.hover=point(e); });
      on(this.canvas,'pointerleave',()=>{this.hover=null;});
      on(this.canvas,'pointerdown',e=>{if(e.button===2)return; const p=point(e);this.pointer(p.x,p.y);});
      on(this.canvas,'contextmenu',e=>{e.preventDefault();this.selectBuild(null);});
      on(typeof window!=='undefined'?window:null,'keydown',e=>{if(e.key==='Escape'){this.armedType=null;this.selectedId=null;this.emit();}});
      const leave=()=>{this.pauseAll();this.setSound(false);this.saveProgress();};
      on(typeof window!=='undefined'?window:null,'pagehide',leave);
      on(typeof window!=='undefined'?window:null,'beforeunload',leave);
    }
    destroy() { this.saveProgress();this.destroyed=true;if(typeof cancelAnimationFrame==='function')cancelAnimationFrame(this.raf);this._listeners.forEach(([el,e,fn,opts])=>el.removeEventListener(e,fn,opts)); }
    event(message,kind='info') {if(!this._backgroundTick)this.onEvent(message,kind);}
    emit(persist=true) {if(this._backgroundTick){if(persist)this._pendingSave=true;return;}if(persist)this.saveProgress();this.onUpdate(this.getSnapshot());}
    getSnapshot() {
      const tower=this.towers.find(t=>t.id===this.selectedId),boss=this.enemies.find(e=>e.type==='boss'&&!e.dead);
      const shelves=this.shelfSummaries(),allPaused=!shelves.some(s=>s.phase==='wave')&&Object.values(this._liveShelves).some(s=>s.phase==='paused'&&s.previousPhase==='wave');
      return { coins:Math.floor(this.coins),lives:this.lives,wave:this.wave,maxWaves:this.maxWaves,phase:this.phase,speed:this.speed,kills:this.kills,score:this.score,shelves,allPaused,
        selectedTower:tower?this.towerSnapshot(tower):null,armedType:this.armedType,abilityCooldown:Math.ceil(this.abilityCooldown),abilityReady:this.abilityCooldown<=0,
        nextWave:WAVE_NAMES[Math.min(this.wave,19)] || 'Encore',mapIndex:this.mapIndex,mapName:MAPS[this.mapIndex].name,remaining:this.queue.length+this.enemies.length,
        bossWave:(this.wave+1)%5===0,boss:boss?{name:boss.name,hp:Math.max(0,boss.hp),maxHp:boss.maxHp}:null,best:this.best[this.mapIndex]||{wave:0,score:0},endless:this.endless,towerCount:this.towers.length,persistenceAvailable:this.persistenceAvailable,
        unreadSave:this._unreadStorage.has(SAVE_KEY),
        progress:this.phase==='wave'?Math.max(0,1-(this.queue.length+this.enemies.length)/this.waveEnemyCount):0,
        message:this.wave===0?'Place your first defenders, then send the dust bunnies.':this.phase==='build'?'Spend your coins. Prepare the next defense.':'' };
    }
    towerSnapshot(t) {
      const s=this.stats(t); const choice=UPGRADES[t.type];const next=t.level<4;
      const options=choice.map((u,i)=>({ name:t.level===1?u.name:`${u.name} ${['','', 'II','III','IV'][t.level]||''}`.trim(),cost:this.upgradeCost(t),description:t.level===1?u.description:`Boost damage, range, and firing speed. ${t.level===3?'Final upgrade.':''}`,branch:i===0?'a':'b',available:next&&(t.branch===null||t.branch===i) }));
      const wave=waveInfo(t.wave);
      return {...t,name:DEFS[t.type].name,color:DEFS[t.type].color,role:DEFS[t.type].role,range:Math.round(s.range),damage:Math.round(s.damage),rate:Number((1/s.rate).toFixed(1)),dps:Math.round(s.damage/s.rate),sellValue:Math.floor(t.spent*.7),canUpgrade:next,upgradeA:options[0].available?options[0]:null,upgradeB:options[1].available?options[1]:null,branchName:t.branch===null?'Choose an upgrade path':choice[t.branch].name,skillWeb:this.skillWeb(t),wave:t.wave||null,waveName:t.wave?.name||'Factory attack',waveSignature:wave?.signature||null,waveCombat:wave?.analysis.combat||null};
    }
    skillWeb(t) {
      const owned=t.skills||[],chosen=t.branch!==null,branch=UPGRADES[t.type],utilities=SKILLS[t.type];
      const nodes=[{id:'core',name:'Shelf Duty',description:'Your defender is ready for the shelf.',cost:0,status:'owned',x:50,y:7},
        ...branch.map((u,i)=>({id:i?'b':'a',name:u.name,description:u.description,cost:Math.round(DEFS[t.type].cost*.82/5)*5,status:t.branch===i?'owned':chosen?'blocked':'available',x:i?75:25,y:27})),
        ...['focus','reach'].map((id,i)=>({...utilities[id],id,status:owned.includes(id)?'owned':chosen?'available':'locked',x:i?75:25,y:50})),
        {id:'mastery',name:'Mastery',description:'Boost your chosen path: more power, range and speed.',cost:Math.round(DEFS[t.type].cost*1.18/5)*5,status:t.level>=3?'owned':chosen?'available':'locked',x:50,y:72},
        {id:'legend',name:'Shelf Legend',description:'The final power boost for your chosen specialization.',cost:Math.round(DEFS[t.type].cost*1.7/5)*5,status:t.level>=4?'owned':t.level>=3?'available':'locked',x:50,y:93}];
      return {nodes,edges:[['core','a'],['core','b'],['a','focus'],['a','reach'],['b','focus'],['b','reach'],['a','mastery'],['b','mastery'],['mastery','legend']]};
    }
    buySkill(id) {
      if(['paused','lost','won'].includes(this.phase))return false;
      const t=this.towers.find(t=>t.id===this.selectedId);if(!t)return false;
      const node=this.skillWeb(t).nodes.find(n=>n.id===id);if(!node||node.status!=='available')return false;
      if(id==='a'||id==='b')return this.upgrade(id);
      if(id==='mastery'||id==='legend')return this.upgrade(t.branch===0?'a':'b');
      if(this.coins<node.cost){this.event(`Need ${node.cost-this.coins} more coins for ${node.name}.`,'warning');return false;}
      this.coins-=node.cost;t.spent+=node.cost;if(!t.skills)t.skills=[];t.skills.push(id);this.burst(t.x,t.y,DEFS[t.type].color,22);this.float(t.x,t.y-45,node.name,DEFS[t.type].color);this.sfx('skill',{type:t.type,id});this.event(`${node.name} learned.`,'success');this.emit();return true;
    }
    stats(t) {
      const b=DEFS[t.type], s={...b,slow:b.slow||1,slowTime:b.slowTime||0,splash:b.splash||0,armorPierce:0,bossBonus:1,multi:1,bounces:0};
      if(t.branch!==null){const u=UPGRADES[t.type][t.branch];for(const k of ['damage','range','rate','splash'])if(u[k])s[k]*=u[k];for(const k of ['slow','slowTime','armorPierce','multi','bounces','bossBonus'])if(u[k]!==undefined)s[k]=u[k];}
      if(t.level>2){const levels=t.level-2;s.damage*=Math.pow(1.37,levels);s.range*=1+levels*.055;s.rate*=Math.pow(.88,levels);if(s.splash)s.splash*=1+levels*.075;}
      for(const id of t.skills||[]){const skill=SKILLS[t.type][id];if(skill)for(const key of ['damage','range','rate','splash','slowTime'])if(skill[key])s[key]*=skill[key];}
      const profile=waveInfo(t.wave)?.analysis.combat;
      if(profile){s.damage*=clamp(profile.damage,.75,1.3);s.rate*=clamp(profile.rate,.75,1.3);s.range*=clamp(profile.range,.9,1.12);if(s.projectileSpeed)s.projectileSpeed*=clamp(profile.projectileSpeed,.8,1.25);if(!s.melee&&!s.laser)s.splash+=clamp(profile.splashAdd,0,22);}
      return s;
    }
    equipWave(descriptor) {
      if(['won','lost'].includes(this.phase))return false;
      const tower=this.towers.find(t=>t.id===this.selectedId);if(!tower){this.event('Select a placed defender before assigning a waveform.','hint');return false;}
      if(!window.ShelfWaves?.importPreset){this.event('The waveform designer is not ready.','warning');return false;}
      let wave;try{wave=window.ShelfWaves.importPreset(descriptor);if(!validWave(wave))throw Error('Invalid waveform');}catch(_){this.event('That waveform preset is invalid.','warning');return false;}
      tower.wave=clone(wave);waveInfo(tower.wave);this.burst(tower.x,tower.y,DEFS[tower.type].color,16);this.sfx('skill',{type:tower.type});this.event(`${wave.name} assigned to ${DEFS[tower.type].name}.`,'success');this.emit();return true;
    }
    clearWave() {
      if(['won','lost'].includes(this.phase))return false;
      const tower=this.towers.find(t=>t.id===this.selectedId);if(!tower)return false;
      tower.wave=null;this.event(`${DEFS[tower.type].name} restored its factory attack.`,'success');this.emit();return true;
    }
    upgradeCost(t) { return Math.round(DEFS[t.type].cost*(t.level===1?.82:t.level===2?1.18:1.7)/5)*5; }
    selectBuild(type) {
      if(type!==null&&!DEFS[type])return false;
      if(this.phase==='lost'||this.phase==='won')return false;
      this.armedType=this.armedType===type?null:type;this.selectedId=null;this.emit();return true;
    }
    pointer(x,y) {
      if(this.phase==='paused'||this.phase==='lost'||this.phase==='won')return;
      const tower=this.towers.find(t=>Math.hypot(t.x-x,t.y-y)<35);
      if(tower){this.selectedId=tower.id;this.armedType=null;this.emit();this.tone(450,.04,'sine',.015);return;}
      if(this.armedType){
        const pad=this.pads.find(p=>Math.hypot(p.x-x,p.y-y)<35);
        if(!pad){this.event('Place a defender on a glowing build spot.','hint');return;}
        this.build(this.armedType,pad.id);
      }else{this.selectedId=null;this.emit();}
    }
    build(type,padId) {
      if(!DEFS[type]||this.phase==='paused'||this.phase==='won'||this.phase==='lost')return false;
      const pad=this.pads.find(p=>p.id===padId);if(!pad||this.towers.some(t=>t.padId===padId))return false;
      const d=DEFS[type];if(this.coins<d.cost){this.event(`Need ${d.cost-this.coins} more coins for ${d.name}.`,'warning');this.tone(120,.12,'sawtooth',.015);return false;}
      const tower={id:this.uid++,type,x:pad.x,y:pad.y,padId,level:1,branch:null,skills:[],wave:null,spent:d.cost,kills:0,damageDealt:0,cooldown:.15,angle:-Math.PI/2,kick:0};
      this.coins-=d.cost;this.towers.push(tower);this.selectedId=tower.id;this.armedType=null;
      this.burst(pad.x,pad.y,d.color,16);this.float(pad.x,pad.y-45,`-${d.cost}`,d.color);this.sfx('build',{type});this.tone(650,.09,'triangle',.035);this.event(`${d.name} reporting for shelf duty.`,'success');this.emit();return true;
    }
    upgrade(branch='a') {
      if(['paused','lost','won'].includes(this.phase))return false;
      const t=this.towers.find(t=>t.id===this.selectedId);if(!t||t.level>=4)return false;
      const index=branch==='b'||branch===1?1:0;if(t.branch!==null&&t.branch!==index)return false;
      const cost=this.upgradeCost(t);if(this.coins<cost){this.event(`Need ${cost-this.coins} more coins to upgrade.`,'warning');return false;}
      this.coins-=cost;t.spent+=cost;t.level++;t.branch=index;this.burst(t.x,t.y,DEFS[t.type].color,24);this.float(t.x,t.y-45,`LEVEL ${t.level}`,DEFS[t.type].color);this.sfx('upgrade',{type:t.type,level:t.level});this.tone(820,.14,'triangle',.04);this.event(`${UPGRADES[t.type][index].name} unlocked.`,'success');this.emit();return true;
    }
    sell() {
      if(['paused','lost','won'].includes(this.phase))return false;
      const i=this.towers.findIndex(t=>t.id===this.selectedId);if(i<0)return false;
      const t=this.towers[i],refund=Math.floor(t.spent*.7);this.coins+=refund;this.towers.splice(i,1);this.selectedId=null;this.float(t.x,t.y-20,`+${refund}`,'#ffe0a5');this.sfx('sell',{type:t.type});this.event(`${DEFS[t.type].name} packed up. ${refund} coins returned.`);this.emit();return true;
    }
    setSpeed(n) { this.speed=[1,2,3].includes(Number(n))?Number(n):1;this.emit();return this.speed; }
    togglePause() { if(this.phase==='wave'||this.phase==='build'){this.previousPhase=this.phase;this.phase='paused';}else if(this.phase==='paused')this.phase=this.previousPhase;this.emit();return this.phase; }
    setSound(value) {this.sound=!!value;try{if(window.ShelfAudio&&window.ShelfAudio.setEnabled)window.ShelfAudio.setEnabled(this.sound);}catch(_){}if(this.sound)this.tone(520,.12,'triangle',.035);return this.sound;}
    sfx(event,details={}) {if(!this.sound||this._backgroundTick)return;try{if(window.ShelfAudio&&window.ShelfAudio.play)window.ShelfAudio.play(event,details);}catch(_){} }
    startWave() {
      if(this.phase!=='build')return false;
      if(this.wave>=20&&!this.endless)return false;
      this.wave++;this.phase='wave';this.armedType=null;this.queue=this.makeWave(this.wave);this.waveEnemyCount=this.queue.length;this.spawnTimer=.4;this.queuedTime=0;
      this.event(this.wave%5===0?`Wave ${this.wave}: a Shelf Wrecker is coming!`:`Wave ${this.wave}: ${WAVE_NAMES[(this.wave-1)%20]}.`,this.wave%5===0?'warning':'info');this.sfx('wave',{wave:this.wave});this.tone(300,.12,'triangle',.025);this.emit();return true;
    }
    continueEndless() {if(this.phase!=='won')return false;this.endless=true;this.phase='build';this.event('The story continues. Endless mode unlocked.','success');this.emit();return true;}
    makeWave(wave) {
      const list=[],count=Math.min(65,7+wave*2),spacing=Math.max(.29,.86-wave*.023);
      for(let i=0;i<count;i++){
        let type='dust';
        if(wave>=2&&i%4===2)type='bookworm';
        if(wave>=3&&i%5===3)type='fast';
        if(wave>=4&&i%6===4)type='armored';
        if(wave>=8&&i%7===1)type='fast';
        if(wave>=12&&i%5===0)type='armored';
        if(wave>=4&&i%7===3)type='moth';
        if(wave>=6&&i%9===5)type='inkling';
        if(wave>=8&&i%11===8)type='binder';
        if(wave>=11&&i%13===6)type='nurse';
        list.push({type,delay:spacing});
      }
      if(wave%5===0)list.splice(Math.floor(list.length*.58),0,{type:'boss',delay:2});
      if(wave>=25&&wave%5===0)list.push({type:'boss',delay:1.5});
      return list;
    }
    spawnEnemy(type,distance=0) {
      const def=ENEMIES[type],scale=1+(this.wave-1)*.145;
      const hp=type==='boss'?(def.hp+this.wave*61)*(1+Math.max(0,this.wave-10)*.035):def.hp*scale;
      const pos=this.atDistance(distance),shield=(def.shield||0)*scale;
      const e={id:this.uid++,type,name:def.name,x:pos.x,y:pos.y,distance,hp,maxHp:hp,speed:def.speed*(1+Math.min(.35,(this.wave-1)*.008)),reward:def.reward+(this.wave>=10?2:0),r:def.radius,armor:def.armor,leak:def.leak,slow:1,slowTimer:0,flash:0,wobble:Math.random()*TAU,dead:false,angle:pos.angle,flying:!!def.flying,shieldHp:shield,maxShieldHp:shield,hasSplit:false,healCooldown:type==='nurse'?3.6:0,healFlash:0};
      this.enemies.push(e);if(type==='boss'){this.shake=8;this.event('The Shelf Wrecker has arrived. Protect your collection!','warning');this.sfx('boss',{type});this.tone(95,.5,'sawtooth',.035);}return e;
    }
    atDistance(value) {
      const s=this.segments.find(s=>value<=s.start+s.len)||this.segments[this.segments.length-1],t=clamp((value-s.start)/s.len,0,1);
      return {x:s.a.x+(s.b.x-s.a.x)*t,y:s.a.y+(s.b.y-s.a.y)*t,angle:Math.atan2(s.b.y-s.a.y,s.b.x-s.a.x)};
    }
    update(dt) {
      if(this.phase!=='wave')return;
      dt=clamp(dt,0,.25);this.abilityCooldown=Math.max(0,this.abilityCooldown-dt);
      this.spawnTimer-=dt;
      while(this.queue.length&&this.spawnTimer<=0){const next=this.queue.shift();this.spawnEnemy(next.type);this.spawnTimer+=next.delay;}
      for(const e of this.enemies){
        if(e.dead)continue;e.slowTimer=Math.max(0,e.slowTimer-dt);if(!e.slowTimer)e.slow=1;e.flash=Math.max(0,e.flash-dt*6);e.healFlash=Math.max(0,(e.healFlash||0)-dt);
        e.distance+=e.speed*e.slow*dt;const pos=this.atDistance(e.distance);e.x=pos.x;e.y=pos.y;e.angle=pos.angle;
        if(e.distance>=this.pathLength){e.dead=true;this.lives=Math.max(0,this.lives-e.leak);this.shake=7;this.float(W-75,345,`-${e.leak} \u2665`,'#ff8e8d');this.tone(130,.14,'sawtooth',.025);if(this.lives<=0){this.finish(false);return;}}
        if(!e.dead&&e.type==='nurse'){
          e.healCooldown=(e.healCooldown===undefined?3.6:e.healCooldown)-dt;
          if(e.healCooldown<=0){e.healCooldown=3.6;let healed=false;for(const ally of this.enemies)if(ally!==e&&!ally.dead&&ally.hp<ally.maxHp&&dist(e,ally)<=170){ally.hp=Math.min(ally.maxHp,ally.hp+17+this.wave*1.5);ally.healFlash=.65;healed=true;this.burst(ally.x,ally.y,'#a3e2b7',4);}if(healed){this.sfx('heal',{type:e.type});e.healFlash=.65;}}
        }
      }
      for(const t of this.towers){
        t.cooldown-=dt;t.kick=Math.max(0,t.kick-dt*4);const s=this.stats(t);
        const targets=this.enemies.filter(e=>!e.dead&&!(s.melee&&e.flying)&&dist(t,e)<=s.range+e.r*.4).sort((a,b)=>b.distance-a.distance);
        if(targets.length){t.angle=Math.atan2(targets[0].y-t.y,targets[0].x-t.x);if(t.cooldown<=0){this.fire(t,targets,s);t.cooldown+=s.rate;t.kick=1;}}else t.cooldown=Math.max(0,t.cooldown);
      }
      for(const p of this.projectiles){
        if(p.dead)continue;p.life-=dt;
        const target=this.enemies.find(e=>e.id===p.target&&!e.dead);
        if(target){p.tx=target.x;p.ty=target.y;}
        const d=Math.hypot(p.tx-p.x,p.ty-p.y),move=p.speed*dt;
        if(d<=move+5){p.x=p.tx;p.y=p.ty;p.dead=true;this.impact(p,target);}else{p.x+=(p.tx-p.x)/d*move;p.y+=(p.ty-p.y)/d*move;}
        if(p.life<=0)p.dead=true;
      }
      this.enemies=this.enemies.filter(e=>!e.dead);this.projectiles=this.projectiles.filter(p=>!p.dead);this.updateEffects(dt);
      if(!this.queue.length&&!this.enemies.length){
        this.projectiles=[];
        const bonus=32+this.wave*4;this.coins+=bonus;this.score+=this.wave*50+this.lives*3;
        this.record();this.event(`Shelf secure! +${bonus} coins. Time to upgrade.`,'success');this.tone(770,.14,'triangle',.03);
        if(this.wave===20&&!this.endless)this.finish(true);else{this.phase='build';this.abilityCooldown=Math.max(0,this.abilityCooldown-12);this.emit();}
      }
    }
    fire(t,targets,s) {
      if(s.melee)targets=targets.filter(e=>!e.flying);if(!targets.length)return;
      const first=targets[0];
      this.sfx('shot',{type:t.type,wave:t.wave||null});
      if(s.melee){
        this.beams.push({x:t.x,y:t.y,tx:first.x,ty:first.y,color:s.color,life:.18,maxLife:.18,melee:true,radius:s.range});
        const hit=targets.filter(e=>dist(first,e)<=s.splash+e.r).slice(0,5);for(const e of hit)this.damage(e,s.damage,t,s);this.tone(220,.035,'triangle',.012);return;
      }
      if(s.laser){
        for(const target of targets.slice(0,s.multi)){this.beams.push({x:t.x,y:t.y-14,tx:target.x,ty:target.y,color:s.color,life:.105,maxLife:.105,wave:t.wave||null});this.damage(target,s.damage,t,s);}
        this.tone(950,.025,'sine',.004);return;
      }
      this.projectiles.push({x:t.x,y:t.y-14,tx:first.x,ty:first.y,target:first.id,type:t.type,color:s.color,speed:s.projectileSpeed,stats:s,towerId:t.id,damage:s.damage,life:4,dead:false,wave:t.wave||null});
      this.tone(t.type==='glue'?210:t.type==='band'?360:560,.025,'triangle',.009);
    }
    impact(p,target) {
      const s=p.stats,t=this.towers.find(t=>t.id===p.towerId),primary=target&&!target.dead?target:null;
      if(s.splash){
        const hits=this.enemies.filter(e=>!e.dead&&Math.hypot(e.x-p.x,e.y-p.y)<=s.splash+e.r);
        for(const e of hits){this.damage(e,p.damage*(e===primary?1:.68),t,s);if(s.slow<1){e.slow=Math.min(e.slow,s.slow);e.slowTimer=Math.max(e.slowTimer,s.slowTime);}}
        this.particles.push({x:p.x,y:p.y,vx:0,vy:0,life:.32,maxLife:.32,color:p.color,size:s.splash,ring:true});
      }else if(primary)this.damage(primary,p.damage,t,s);
      if(s.bounces&&primary){
        const bounceTargets=this.enemies.filter(e=>!e.dead&&e.id!==primary.id&&dist(e,primary)<165).sort((a,b)=>dist(a,primary)-dist(b,primary)).slice(0,s.bounces);
        let prev={x:p.x,y:p.y};for(const e of bounceTargets){this.beams.push({x:prev.x,y:prev.y,tx:e.x,ty:e.y,color:p.color,life:.15,maxLife:.15});this.damage(e,p.damage*.65,t,s);prev=e;}
      }
      this.burst(p.x,p.y,p.color,p.type==='glue'?5:3);
    }
    damage(e,amount,t,s={}) {
      if(e.dead||(e.flying&&s.melee))return;
      const armor=s.ignoreArmor?0:e.armor*(1-(s.armorPierce||0));let dealt=amount*(1-armor)*(e.type==='boss'?(s.bossBonus||1):1),absorbed=0;
      if(e.shieldHp>0){absorbed=Math.min(e.shieldHp,dealt);e.shieldHp-=absorbed;dealt-=absorbed;this.sfx('shield',{type:e.type,broken:e.shieldHp<=0});if(e.shieldHp<=0)this.burst(e.x,e.y,'#9ed1ec',12);}
      const actual=Math.min(dealt,Math.max(0,e.hp))+absorbed;e.hp-=dealt;e.flash=.8;if(t)t.damageDealt+=actual;this.sfx('hit',{type:e.type});
      if(e.hp<=0){
        e.dead=true;this.coins+=e.reward;this.kills++;this.score+=e.reward*10;if(t)t.kills++;this.burst(e.x,e.y,e.type==='boss'?'#ffc66d':'#ded4c0',e.type==='boss'?32:7);this.float(e.x,e.y-20,`+${e.reward}`,'#f7cf84');this.sfx('kill',{type:e.type});
        if(e.type==='inkling'&&!e.hasSplit){e.hasSplit=true;for(let i=0;i<2;i++){const child=this.spawnEnemy('crumb',e.distance);child.x=e.x;child.y=e.y;child.angle=e.angle;if(i)child.speed*=1.1;}this.waveEnemyCount+=2;this.sfx('split',{type:e.type});this.burst(e.x,e.y,'#9f8fce',12);}
        if(e.type==='boss'){this.shake=10;this.event('Shelf Wrecker down! A heroic bit of housekeeping.','success');this.tone(680,.25,'triangle',.045);}
      }
    }
    useAbility() {
      if(this.phase!=='wave'){this.event('Save The Big Sweep for an active wave.','hint');return false;}
      if(this.abilityCooldown>0){this.event(`The Big Sweep recharges in ${Math.ceil(this.abilityCooldown)}s.`,'hint');return false;}
      if(!this.enemies.length){this.event('Wait until the invaders reach the shelf.','hint');return false;}
      this.abilityCooldown=38;this.shake=18;this.bookDrop=.8;
      for(const e of [...this.enemies]){if(!e.dead){this.damage(e,170+this.wave*8,null,{ignoreArmor:true});e.slow=Math.min(e.slow,.25);e.slowTimer=2.5;this.burst(e.x,e.y,'#ffe3a1',8);}}
      this.event('THE BIG SWEEP! Every invader takes damage and slows.','success');this.sfx('ability');this.tone(80,.32,'sawtooth',.06);this.emit();return true;
    }
    record() {const old=this.best[this.mapIndex]||{wave:0,score:0};this.best[this.mapIndex]={wave:Math.max(old.wave,this.wave),score:Math.max(old.score,this.score)};this.writeStorage('shelfdefense.records',this.best);}
    finish(won) {this.phase=won?'won':'lost';this.armedType=null;this.selectedId=null;this.queue=[];this.projectiles=[];this.record();this.sfx(won?'win':'lose');if(won){this.event('ALL 20 WAVES CLEARED. Your shelf is legendary.','success');for(let i=0;i<12;i++)this.burst(100+Math.random()*1000,80+Math.random()*480,['#ffc66d','#91dcb4','#dba6f4'][i%3],24);}else this.event('The shelf fell. Every good story deserves another try.','warning');this.emit();}
    burst(x,y,color,count=6) {for(let i=0;i<count;i++){const angle=Math.random()*TAU,speed=30+Math.random()*105;this.particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-18,life:.35+Math.random()*.35,maxLife:.7,color,size:2+Math.random()*3});}}
    float(x,y,text,color) {this.floaters.push({x,y,text,color,life:1.1});}
    updateEffects(dt) {this.shake=Math.max(0,this.shake-dt*27);this.bookDrop=Math.max(0,(this.bookDrop||0)-dt);for(const p of this.particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;if(!p.ring)p.vy+=125*dt;}this.particles=this.particles.filter(p=>p.life>0);for(const f of this.floaters){f.life-=dt;f.y-=24*dt;}this.floaters=this.floaters.filter(f=>f.life>0);for(const b of this.beams)b.life-=dt;this.beams=this.beams.filter(b=>b.life>0);}
    tone(freq,duration,type='sine',volume=.02) {if(!this.sound||this._backgroundTick||window.ShelfAudio)return;try{if(!this.audio){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;this.audio=new AC();}if(this.audio.state==='suspended')this.audio.resume();const now=this.audio.currentTime;if(now-this.audioLast<.035&&duration<.1)return;this.audioLast=now;const o=this.audio.createOscillator(),g=this.audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,now);o.frequency.exponentialRampToValueAtTime(Math.max(30,freq*.65),now+duration);g.gain.setValueAtTime(volume,now);g.gain.exponentialRampToValueAtTime(.0001,now+duration);o.connect(g);g.connect(this.audio.destination);o.start(now);o.stop(now+duration);}catch(_){} }
    draw() {
      const c=this.ctx,art=window.ShelfArt,time=this.clock;c.clearRect(0,0,W,H);c.save();if(this.shake>0)c.translate((Math.random()-.5)*this.shake,(Math.random()-.5)*this.shake);
      if(art&&art.drawBackground)art.drawBackground(c,{path:this.path,pads:this.pads,mapIndex:this.mapIndex,time});else this.drawFallbackBoard(c);
      const selection=this.towers.find(t=>t.id===this.selectedId),hoverPad=this.hover&&this.pads.find(p=>dist(p,this.hover)<35&&!this.towers.some(t=>t.padId===p.id));
      if(selection){const s=this.stats(selection);this.drawRange(c,selection.x,selection.y,s.range,s.color);}
      if(this.armedType&&hoverPad)this.drawRange(c,hoverPad.x,hoverPad.y,DEFS[this.armedType].range,DEFS[this.armedType].color);
      for(const p of this.pads){const occupied=this.towers.some(t=>t.padId===p.id);if(occupied)continue;const glow=this.armedType&&this.coins>=DEFS[this.armedType].cost;if(art&&art.drawBackground&&!glow)continue;c.save();c.translate(p.x,p.y);c.beginPath();c.ellipse(0,9,26,17,0,0,TAU);c.fillStyle=glow?'rgba(145,220,180,.20)':'rgba(23,20,24,.19)';c.fill();c.strokeStyle=glow?'#b7e7bd':'rgba(255,231,192,.34)';c.lineWidth=glow?2:1;c.setLineDash(glow?[5,4]:[]);c.stroke();c.setLineDash([]);c.fillStyle=glow?'#c3f1c7':'rgba(255,231,192,.4)';c.font='20px sans-serif';c.textAlign='center';c.fillText('+',0,15);c.restore();}
      const drawItems=[...this.towers.map(entity=>({kind:'tower',entity})),...this.enemies.map(entity=>({kind:'enemy',entity}))].sort((a,b)=>a.entity.y-b.entity.y);
      for(const item of drawItems){const e=item.entity;if(item.kind==='tower'){
        if(art&&art.drawTower)art.drawTower(c,e,{selected:e.id===this.selectedId,hover:this.hover&&dist(e,this.hover)<32,time});else this.drawFallbackTower(c,e);
        if(e.level>1){c.fillStyle='#191d2b';c.beginPath();c.arc(e.x+22,e.y+18,11,0,TAU);c.fill();c.fillStyle=DEFS[e.type].color;c.font='bold 12px sans-serif';c.textAlign='center';c.fillText(e.level,e.x+22,e.y+22);}
      }else{
        if(art&&art.drawEnemy)art.drawEnemy(c,e,{time});else this.drawFallbackEnemy(c,e,time);
        if(e.hp<e.maxHp||e.type==='boss'){const width=e.type==='boss'?70:35,x=e.x-width/2,y=e.y-e.r-15;c.fillStyle='rgba(15,18,28,.8)';this.roundRect(c,x-2,y-2,width+4,8,4);c.fill();c.fillStyle=e.type==='boss'?'#ef987f':'#a7dba9';this.roundRect(c,x,y,width*Math.max(0,e.hp/e.maxHp),4,2);c.fill();}
        if(e.shieldHp>0){c.fillStyle='#172837';this.roundRect(c,e.x-19,e.y-e.r-22,38,5,2);c.fill();c.fillStyle='#9ed1ec';this.roundRect(c,e.x-18,e.y-e.r-21,36*e.shieldHp/e.maxShieldHp,3,1);c.fill();}
        if(e.slow<1){c.strokeStyle='#a3e1d0';c.lineWidth=2;c.beginPath();c.ellipse(e.x,e.y+e.r*.65,e.r+5,5,0,0,TAU);c.stroke();}
      }}
      for(const p of this.projectiles){c.save();c.translate(p.x,p.y);c.rotate(Math.atan2(p.ty-p.y,p.tx-p.x));c.shadowBlur=10;c.shadowColor=p.color;c.fillStyle=p.color;if(p.wave&&window.ShelfWaves){c.strokeStyle=p.color;c.lineWidth=2;this.waveLine(c,p.wave,-48,0,0,0,time,7);c.stroke();}if(p.type==='pencil'){this.roundRect(c,-10,-2,18,4,2);c.fill();}else if(p.type==='band'){c.strokeStyle=p.color;c.lineWidth=3;c.beginPath();c.ellipse(0,0,7,4,0,0,TAU);c.stroke();}else{c.beginPath();c.arc(0,0,5,0,TAU);c.fill();}c.restore();}
      for(const b of this.beams){c.save();c.globalAlpha=clamp(b.life/b.maxLife,0,1);c.strokeStyle=b.color;c.shadowColor=b.color;c.shadowBlur=13;c.lineWidth=b.melee?7:3;c.lineCap='round';c.beginPath();if(b.melee)c.arc(b.x,b.y,b.radius*.75,Math.atan2(b.ty-b.y,b.tx-b.x)-.7,Math.atan2(b.ty-b.y,b.tx-b.x)+.7);else if(b.wave&&window.ShelfWaves)this.waveLine(c,b.wave,b.x,b.y,b.tx,b.ty,time,9);else{c.moveTo(b.x,b.y);c.lineTo(b.tx,b.ty);}c.stroke();if(!b.melee){c.lineWidth=1;c.strokeStyle='#fff9e8';c.stroke();}c.restore();}
      for(const p of this.particles){c.save();c.globalAlpha=clamp(p.life/p.maxLife,0,1);if(p.ring){c.strokeStyle=p.color;c.lineWidth=3;c.beginPath();c.ellipse(p.x,p.y,p.size*(1-p.life/p.maxLife),p.size*.5*(1-p.life/p.maxLife),0,0,TAU);c.stroke();}else{c.fillStyle=p.color;c.fillRect(p.x,p.y,p.size,p.size);}c.restore();}
      for(const f of this.floaters){c.save();c.globalAlpha=clamp(f.life,0,1);c.fillStyle=f.color;c.strokeStyle='#292332';c.lineWidth=3;c.font='bold 14px sans-serif';c.textAlign='center';c.strokeText(f.text,f.x,f.y);c.fillText(f.text,f.x,f.y);c.restore();}
      if(art&&art.drawBase)art.drawBase(c,{x:1157,y:this.path[this.path.length-1].y,lives:this.lives,time});
      if(this.bookDrop>0){c.fillStyle=`rgba(255,228,175,${this.bookDrop*.25})`;c.fillRect(0,0,W,H);c.save();c.translate(600,180-(this.bookDrop-.4)*350);c.rotate(-.08);c.fillStyle='#8aaf98';c.strokeStyle='#e9d5ae';c.lineWidth=7;this.roundRect(c,-80,-55,160,110,9);c.fill();c.stroke();c.fillStyle='#fff0c7';c.font='bold 18px Georgia';c.textAlign='center';c.fillText('THE END',0,7);c.restore();}
      if(this.armedType&&this.hover&&!hoverPad){c.save();c.strokeStyle='rgba(255,169,147,.65)';c.lineWidth=2;c.beginPath();c.arc(this.hover.x,this.hover.y,19,0,TAU);c.stroke();c.beginPath();c.moveTo(this.hover.x-9,this.hover.y-9);c.lineTo(this.hover.x+9,this.hover.y+9);c.stroke();c.restore();}
      c.restore();
      if(this.phase==='paused'){c.fillStyle='rgba(16,19,30,.56)';c.fillRect(0,0,W,H);c.fillStyle='#f5e7ca';c.textAlign='center';c.font='bold 47px Georgia';c.fillText('A little shelf-care.',W/2,H/2-10);c.font='17px sans-serif';c.fillStyle='#c1bdc2';c.fillText('Paused · press P or the pause button to return',W/2,H/2+30);}
    }
    waveLine(c,wave,x,y,tx,ty,time,amplitude=8){
      const dx=tx-x,dy=ty-y,length=Math.hypot(dx,dy)||1,nx=-dy/length,ny=dx/length;
      c.beginPath();for(let i=0;i<=40;i++){const u=i/40,offset=clamp(window.ShelfWaves.sample(wave,u*wave.cycles+time*.8),-1,1)*Math.min(10,amplitude)*Math.sin(u*Math.PI);const px=x+dx*u+nx*offset,py=y+dy*u+ny*offset;if(i)c.lineTo(px,py);else c.moveTo(px,py);}
    }
    drawRange(c,x,y,range,color){c.save();c.fillStyle=color+'12';c.strokeStyle=color+'80';c.lineWidth=1.5;c.setLineDash([5,6]);c.beginPath();c.arc(x,y,range,0,TAU);c.fill();c.stroke();c.restore();}
    roundRect(c,x,y,w,h,r){if(c.roundRect){c.beginPath();c.roundRect(x,y,w,h,r);}else{c.beginPath();c.rect(x,y,w,h);}}
    drawFallbackBoard(c){c.fillStyle='#65503f';c.fillRect(0,0,W,H);c.lineCap='round';c.lineJoin='round';c.strokeStyle='#b29369';c.lineWidth=65;c.beginPath();this.path.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.stroke();}
    drawFallbackTower(c,t){c.fillStyle=DEFS[t.type].color;c.beginPath();c.arc(t.x,t.y,23,0,TAU);c.fill();c.fillStyle='#292432';c.font='20px sans-serif';c.textAlign='center';c.fillText(DEFS[t.type].icon,t.x,t.y+7);}
    drawFallbackEnemy(c,e,time){c.fillStyle=e.type==='boss'?'#c3967c':e.type==='armored'?'#8ba0ac':'#b9b0ad';c.beginPath();c.ellipse(e.x,e.y,e.r,e.r*.8,Math.sin(time*5+e.wobble)*.1,0,TAU);c.fill();c.fillStyle='#242637';c.beginPath();c.arc(e.x-5,e.y-2,2.5,0,TAU);c.arc(e.x+5,e.y-2,2.5,0,TAU);c.fill();}
  }
  ShelfDefense.TowerDefs=DEFS;ShelfDefense.Maps=MAPS;ShelfDefense.EnemyDefs=ENEMIES;ShelfDefense.UpgradeDefs=UPGRADES;ShelfDefense.TowerSkillDefs=SKILLS;ShelfDefense.validSave=validEnvelope;
  window.ShelfDefense=ShelfDefense;
})();
