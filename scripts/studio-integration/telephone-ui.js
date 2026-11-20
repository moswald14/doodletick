  function telephoneView() {
    const item = telephone.selected, unavailable = !window.DoodleBridge;
    const selected = item ? `<div class="telephone-project"><span class="eyebrow">${esc(item.sourceMode === 'fiction' ? 'FICTION / REMIX ENABLED IN TELEPHONE' : 'SOURCE HELD / EXACT WORDS PRESERVED')}</span><h2>${esc(item.title)}</h2><p class="telephone-caption">Music is a separate composition. Your source and story stay as written.</p><div class="telephone-actions"><a class="telephone-link" href="${esc(DoodleBridge.route(item))}">Open ${item.machine.mozcorp ? 'MozCorp world' : 'Telephone World'} ↗</a><button data-action="telephone-make" ${telephone.loading?'disabled':''}>Make an editable soundtrack</button><button class="quiet" data-action="telephone-load" ${telephone.loading||!item.soundtrack?'disabled':''}>Load saved soundtrack</button><button class="small-primary" data-action="telephone-save" ${telephone.loading?'disabled':''}>Keep this song with the world</button></div><div class="telephone-texts"><section><h3>Original source</h3><pre>${esc(item.sourceText || 'No source yet.')}</pre></section><section><h3>Story</h3><pre>${esc(item.storyText || 'Run the machine in Telephone World, then save its session.')}</pre></section><section><h3>Character</h3><pre>${esc(item.characterText || 'No generated character.')}</pre></section></div></div>` : '<p class="telephone-empty">Choose a saved session, or open Telephone World to make one. Its source, story, characters and soundtrack can travel together.</p>';
    const shelf = telephone.items.map(record=>`<button class="telephone-tile ${item?.id===record.id?'selected':''}" data-action="telephone-select" data-id="${esc(record.id)}"><strong>${esc(record.title)}</strong><small>${esc(record.sourceMode)} · ${record.hasSoundtrack?'soundtrack saved':'ready for music'}</small></button>`).join('');
    return heading(6,'A story with a sound.','Bring Telephone World and MozCorp into your studio. Keep the words, make the music, carry it all back.')+`<div class="telephone-layout"><aside class="panel telephone-shelf"><div class="panel-head"><h2>YOUR TELEPHONE WORLDS</h2><button data-action="telephone-refresh" class="quiet" ${telephone.loading?'disabled':''}>Refresh</button></div><a class="telephone-link" href="./telephone.html">＋ Open Telephone World</a><a class="telephone-keeper" href="./#telephone">← Back to Keeper</a><p class="telephone-caption">Saved on this browser and address. Export a Telephone project to carry it to another device.</p>${unavailable?'<p role="status">Open this studio from the complete Doodleverse package to connect your Telephone projects.</p>':telephone.loading?'<p role="status">Opening the shared project shelf…</p>':''}${telephone.error?`<p role="alert">${esc(telephone.error)}</p>`:''}<div class="telephone-tiles">${shelf||(!telephone.loading?'<p class="telephone-caption">Your first world starts with a few words.</p>':'')}</div></aside><section class="panel panel-body">${selected}</section></div>`;
  }
  async function refreshTelephone(id) {
    if (!window.DoodleBridge) return;
    const ticket = ++telephone.ticket; telephone.loading = true; telephone.error = '';
    if (ui.step === 'telephone') render();
    try {
      const items = await DoodleBridge.list();
      const target = id || telephone.selected?.id || requestedTelephone || items[0]?.id;
      const selected = target ? await DoodleBridge.get(target) : null;
      if (ticket !== telephone.ticket) return;
      telephone.items = items; telephone.selected = selected ? TelephoneScore.checked(selected) : null;
      if (target && !selected) telephone.error = 'That Telephone session is not saved at this browser address. Open or import it in Telephone World.';
    } catch (error) { if (ticket === telephone.ticket) telephone.error = error.message; }
    finally { if (ticket === telephone.ticket) { telephone.loading = false; telephone.loaded = true; if (ui.step === 'telephone') render(); } }
  }
  function replaceWithTelephone(value, record) {
    const next = shareSounds(C.open(value));
    next.compatibility.telephone = TelephoneScore.provenance(record);
    const occupied = revision > 0 || p.song.tracks.length || p.song.clips.length || p.song.audio.length || p.song.waves.length || (ui.recover && !ui.recovered);
    if (occupied && !window.confirm('Open this Telephone soundtrack in the studio? Your current song will be replaced. Undo restores it; save a project file first to keep a separate copy.')) return false;
    audio.stop(); cancelVoiceCapture(); cancelRecording(); capture.cancel();
    commit(()=>{p=next;Object.assign(ui,{selected:[],clip:null,editTarget:null,cursor:0,beatBar:0,recovered:true,noteBase:48});},'Telephone soundtrack opened. Every sound, note and placement is editable. Playback is stopped.');
    setStep('arrange'); return true;
  }
  function openMatch({ title, prompt, text, score }) {
    const record = { kind: 'doodleverse-telephone-project', version: 1, id: 'shared-match', title,
      sourceMode: 'fiction', sourceText: prompt, storyText: text, characterText: '', poemText: '', masterText: '', asciiText: '' };
    const next = score ? C.open(score) : TelephoneScore.make(record);
    next.compatibility = {};
    audio.stop();
    cancelVoiceCapture();
    cancelRecording();
    capture.cancel();
    p = next;
    undo = [];
    redo = [];
    savedVersion = null;
    Object.assign(ui, { selected: [], clip: null, editTarget: null, cursor: 0, beatBar: 0, recovered: true, noteBase: 48 });
    changed('Match soundtrack ready. Edit the notes and clips, then save from your shared workspace.');
    setStep('arrange');
  }
  function snapshotMatch() {
    C.assert(p.song.audio.length === 0, 'Shared soundtracks use editable notes, beats and synth sounds. Export a project file to keep audio clips.');
    C.assert(Object.keys(p.voiceBank.takes).length === 0, 'Your recorded voice stays in a private project file. Choose a built-in singer for a shared soundtrack.');
    const score = JSON.parse(C.serialize(p));
    score.compatibility = {};
    C.assert(new TextEncoder().encode(JSON.stringify(score)).length <= 800000,
      'This soundtrack exceeds the shared project limit. Export a project file to keep the full score.');
    return score;
  }
  async function telephoneProject(generate) {
    C.assert(telephone.selected, 'Choose a Telephone session first.');
    const record = await DoodleBridge.get(telephone.selected.id);
    C.assert(record, 'This Telephone session is no longer on the shelf.'); TelephoneScore.checked(record);
    if (generate && record.soundtrack && !window.confirm('Make a new soundtrack idea for this world? The saved soundtrack stays on its shelf until you choose Keep this song with the world.')) return;
    const value = generate ? TelephoneScore.make(record) : record.soundtrack;
    C.assert(value, 'This world has no saved soundtrack yet. Make one first.');
    telephone.selected = record; replaceWithTelephone(value, record);
  }
  async function saveTelephoneSoundtrack() {
    C.assert(telephone.selected, 'Choose a Telephone session first.');
    const record = await DoodleBridge.get(telephone.selected.id);
    C.assert(record, 'This Telephone session is no longer on the shelf.'); TelephoneScore.checked(record);
    if (record.soundtrack && !window.confirm('Replace this world’s saved soundtrack with the current Studio song? Its story and original source will stay unchanged.')) return;
    const snapshot = C.open(JSON.parse(C.serialize(p))); snapshot.compatibility.telephone = TelephoneScore.provenance(record);
    record.soundtrack = JSON.parse(C.serialize(snapshot));
    const saved = await DoodleBridge.save(record);
    telephone.selected = saved; await refreshTelephone(saved.id);
    notify('Song kept with '+saved.title+'. Reopen its world to hear it or edit it here again.');
  }
