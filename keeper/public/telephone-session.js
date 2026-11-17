// SPDX-License-Identifier: GPL-3.0-only
(async function () {
  'use strict';
  const B = DoodleBridge, $ = id => document.getElementById(id);
  let current = null, dirty = false, busy = false, restoring = false, worker = null, source = null, musicGain = null, context = null, audioTicket = 0, cancelRender = null, editGeneration = 0;
  const initialMachine = TelephoneMachine.capture();
  const narrative = p => JSON.stringify([p.sourceText,p.sourceMode,p.storyText,p.poemText,p.characterText,p.masterText,p.asciiText,p.machine]);
  const status = message => { $('dv-status').textContent = message; };
  const capture = base => ({...base, title:$('dv-title').value.trim().slice(0,80) || 'Untitled telephone world', sourceText:$('seed').value, sourceMode:$('sourceHandling').value,
    storyText:$('storyOut').textContent, poemText:$('poemOut').textContent, characterText:$('characterOut').textContent, masterText:$('masterStoryText').value,
    asciiText:$('asciiPictureText').value, machine:TelephoneMachine.capture()});
  function markDirty() { editGeneration++; dirty=true; $('dv-save').textContent='Save session ●'; }
  function clean() { dirty=false; $('dv-save').textContent='Save session'; }
  async function action(fn) {
    if (busy) return;
    setBusy(true);
    try { return await fn(); } catch(error) { status(error.message); }
    finally { setBusy(false); }
  }
  function setBusy(value) { busy=value; for(const id of ['dv-save','dv-load','dv-new','dv-export','dv-import','dv-vault','dv-world','dv-play'])$(id).disabled=value; }
  async function refresh() {
    const selected=$('dv-projects').value, entries=await B.list(); $('dv-projects').replaceChildren(new Option('Saved telephone worlds…',''));
    for (const p of entries) $('dv-projects').append(new Option(p.title + (p.hasSoundtrack?' ♫':''),p.id));
    $('dv-projects').value=selected || current?.id || '';
  }
  async function save() {
    let base=current || B.make($('dv-title').value.trim() || 'Untitled telephone world');
    if (current) {
      const latest=await B.get(current.id);
      if (latest && latest.revision !== current.revision && narrative(latest)!==narrative(current)) throw new Error('Another tab changed this story. Open its saved session, or export your edits before switching.');
      if (latest) base=latest;
    }
    const snapshot=capture(base), savingGeneration=editGeneration;
    current=await B.save(snapshot); await refresh();
    if(editGeneration===savingGeneration)clean();
    history.replaceState(null,'','?project='+encodeURIComponent(current.id)+location.hash);
    status(editGeneration===savingGeneration?'Session saved on this device · source, master, story, character, poem and drawings kept together.':'Earlier version saved. Your newer edits are still unsaved · Save session again to keep them.');
    return current;
  }
  async function load(id) {
    if (dirty && !confirm('Open another session? Export or save your current edits first. Unsaved edits will be replaced.')) return;
    const loadingGeneration=editGeneration;
    const record=await B.get(id); if(!record) throw new Error('That session is not on this browser’s shelf. Import its .telephone.json file to open it here.');
    stopMusic();
    try { await TelephoneMachine.restore(record,()=>{if(editGeneration!==loadingGeneration)throw new Error('Loading canceled because you edited this session. Your current story is unchanged.');restoring=true;}); current=record; $('dv-title').value=record.title; clean(); }
    finally { restoring=false; }
    history.replaceState(null,'','?project='+encodeURIComponent(record.id));
    await refresh(); status('Opened '+record.title+' · '+record.sourceMode+' source handling · '+(record.soundtrack?'soundtrack attached.':'ready for a soundtrack.'));
  }
  function stopMusic() {
    audioTicket++; cancelRender?.();cancelRender=null;worker?.terminate();worker=null;
    try{source?.stop();source?.disconnect();}catch{} source=null;
    musicGain?.disconnect();musicGain=null;
    $('dv-play').disabled=false; $('dv-play').textContent='▶ Soundtrack';
    if(context) context.suspend().catch(()=>{});
  }
  async function playMusic() {
    stopMusic(); const ticket=audioTicket;
    const project=current && await B.get(current.id);
    if(ticket!==audioTicket)return;
    if(!project?.soundtrack) throw new Error('Save this session, open Studio, and attach a soundtrack first.');
    TelephoneMachine.stopSound();
    context ||= new AudioContext(); await context.resume();
    if(ticket!==audioTicket)return;
    $('dv-play').disabled=true; $('dv-play').textContent='Rendering…';
    const audio=await new Promise((resolve,reject)=>{
      const ownWorker=new Worker(new URL('./studio-worker.js',location.href));worker=ownWorker;
      const finish=()=>{clearTimeout(timer);ownWorker.terminate();if(worker===ownWorker)worker=null;cancelRender=null;};
      const timer=setTimeout(()=>{finish();reject(new Error('Soundtrack took too long to render. Shorten it in Studio, then try again.'));},60000);
      cancelRender=()=>{finish();resolve(null);};
      ownWorker.onmessage=event=>{finish();event.data.error?reject(new Error(event.data.error)):resolve(event.data.audio);};
      ownWorker.onerror=()=>{finish();reject(new Error('Could not render the soundtrack. Open Studio and check this project.'));};
      ownWorker.postMessage({id:ticket,project:project.soundtrack,scope:'song',options:{rate:44100}});
    });
    if(ticket!==audioTicket || !audio)return;
    const buffer=context.createBuffer(2,audio.left.length,audio.rate);buffer.copyToChannel(audio.left,0);buffer.copyToChannel(audio.right,1);
    source=context.createBufferSource();source.buffer=buffer;source.loop=true;
    musicGain=context.createGain();musicGain.gain.value=.22;source.connect(musicGain);musicGain.connect(context.destination);source.start();
    $('dv-play').disabled=false;$('dv-play').textContent='♫ Playing';status('Attached Studio soundtrack is looping · Stop music ends playback.');
  }
  $('dv-save').onclick=()=>action(save);
  $('dv-load').onclick=()=>action(()=>{const id=$('dv-projects').value;if(!id)throw new Error('Choose a saved session first.');return load(id);});
  $('dv-new').onclick=()=>action(async()=>{
    if(dirty&&!confirm('Start a new session? Save or export your edits before replacing them.'))return;
    stopMusic();
    try{const p=B.make('New telephone world'),loadingGeneration=editGeneration;p.sourceText='a kid invents a machine that can make anything, but it has one stupid rule';p.machine=structuredClone(initialMachine);await TelephoneMachine.restore(p,()=>{if(editGeneration!==loadingGeneration)throw new Error('New session canceled because you edited the current story.');restoring=true;});current=null;$('dv-title').value=p.title;clean();}
    finally{restoring=false;}
    history.replaceState(null,'',location.pathname);status('New session · your saved shelf is preserved.');
  });
  $('dv-export').onclick=()=>action(async()=>{const p=capture(current||B.make());B.download(p);status('Portable project exported, including its attached Studio score.');});
  $('dv-import').onclick=()=>$('dv-file').click();
  $('dv-file').onchange=event=>action(async()=>{
    const file=event.target.files[0];event.target.value='';if(!file)return;
    if(file.size>B.MAX_BYTES)throw new Error('Choose a Telephone project smaller than 16 MB.');
    const p=B.validate(JSON.parse(await file.text()));p.id=crypto.randomUUID();p.revision=0;p.title=(p.title+' · imported').slice(0,80);
    const saved=await B.save(p);await refresh();await load(saved.id);
  });
  $('dv-studio').onclick=event=>{event.preventDefault();action(async()=>{const p=await save();if(p){stopMusic();location.href='./studio.html?project='+encodeURIComponent(p.id)+'#telephone';}});};
  for(const [id,carry] of [['dv-vault','vault'],['dv-world','world']]) $(id).onclick=()=>action(async()=>{
    const p=await save();if(p){stopMusic();location.href='./?telephone='+encodeURIComponent(p.id)+'&carry='+carry+'#telephone';}
  });
  $('dv-play').onclick=()=>action(playMusic);$('dv-stop').onclick=()=>{stopMusic();status('Soundtrack stopped.');};
  document.addEventListener('input',event=>{if(!event.target.closest('.dv-toolbar'))markDirty();});
  $('dv-title').addEventListener('input',markDirty);
  for(const type of ['pointerdown','pointerup','click'])document.addEventListener(type,event=>{if(event.target.closest('#paintCanvas, #chain'))markDirty();});
  new MutationObserver(()=>{if(!restoring)markDirty();}).observe($('storyOut'),{childList:true,subtree:true,characterData:true});
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopMusic();});
  B.watch(()=>{refresh().catch(error=>status(error.message));});
  setBusy(true);
  try{await refresh();const id=new URLSearchParams(location.search).get('project');if(id)await load(id);else status('Narrative sessions stay in this browser workspace. Use Keeper vault for an encrypted copy.');}
  catch(error){status(error.message);}
  finally{setBusy(false);}
})();
