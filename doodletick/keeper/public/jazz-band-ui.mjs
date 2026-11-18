// SPDX-License-Identifier: GPL-3.0-only
import { djSuggestKey } from './jazz-settings.mjs';
import { listJazzDotVoices } from './jazz-dot-voices.mjs';
import { JAZZ_BEAT_PATTERNS, JAZZ_METERS, JAZZ_PHRASE_BARS } from './jazz-radio-contract.mjs';

const NOTES=['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];
export function createJazzBandUI({getSettings,getStation,changeSettings,action,request}) {
  const $=id=>document.getElementById(id), make=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const section=make('section');section.id='band-controls';section.className='band-controls';section.setAttribute('aria-label','Rhythm and band memory');
  section.append(make('h2','SET THE GROOVE'));
  const grid=make('div');grid.className='band-control-grid';section.append(grid);
  function select(id,label,options) {
    const box=make('div'), caption=make('label',label), control=make('select');control.id=id;caption.htmlFor=id;
    for(const [value,text]of options){const option=make('option',text);option.value=String(value);control.append(option);}
    box.append(caption,control);grid.append(box);return control;
  }
  const speed=$('tempo'), speedLabel=speed.closest('.feel').querySelector('label'), speedValue=$('tempo-value');
  speedLabel.replaceChildren(document.createTextNode('Speed '),speedValue);speed.setAttribute('aria-label','Speed in beats per minute');grid.append(speed.closest('.feel'));
  const meter=select('beats-per-bar','Beats per bar',JAZZ_METERS.map(n=>[n,`${n} beats`]));
  const phrase=select('phrase-bars','Phrase length',JAZZ_PHRASE_BARS.map(n=>[n,n==='genre'?'Follow the genre':`${n} bars`]));
  const beat=select('beat-pattern','Beat',Object.entries(JAZZ_BEAT_PATTERNS));
  const key=select('key-root','Key',[['auto','Let the band choose'],...NOTES.map((name,index)=>[index,name])]);
  const suggest=make('button','Suggest a key');suggest.type='button';suggest.id='suggest-key';key.after(suggest);
  function toggle(id,label){const row=make('label'),control=make('input');row.className='band-toggle';control.type='checkbox';control.id=id;row.append(control,document.createTextNode(label));section.append(row);return control;}
  const beatOnly=toggle('beat-only','Beat only · just the drums'), favor=toggle('favor-likes','Bring back progressions I like');
  const status=make('p');status.id='band-memory-status';status.setAttribute('role','status');section.append(status);
  const keyStatus=make('p');keyStatus.id='key-suggestion';keyStatus.setAttribute('role','status');section.append(keyStatus);
  $('radio-tools').before(section);
  const change=patch=>{if(!closed&&!working&&!externalBusy)changeSettings(patch);};
  meter.addEventListener('change',()=>change({beatsPerBar:Number(meter.value)}));
  phrase.addEventListener('change',()=>change({phraseBars:phrase.value==='genre'?'genre':Number(phrase.value)}));
  beat.addEventListener('change',()=>change({beatPattern:beat.value}));
  key.addEventListener('change',()=>{if(closed||working||externalBusy)return;keyStatus.textContent='';change({keyRoot:key.value==='auto'?'auto':Number(key.value)});});
  beatOnly.addEventListener('change',()=>change({beatOnly:beatOnly.checked}));favor.addEventListener('change',()=>change({favorLikes:favor.checked}));
  suggest.addEventListener('click',()=>{
    if(closed||working||externalBusy)return;
    const current=getSettings(), audible=getStation().info;
    const seed=crypto.getRandomValues(new Uint32Array(1))[0];
    const choice=djSuggestKey({...current,tonic:audible?.tonic,key:audible?.key},seed);
    change({keyRoot:choice.root});keyStatus.textContent=`${choice.label}: ${choice.reason} Queued for the next bar.`;
  });

  const voiceTest=make('button','Test voice');voiceTest.type='button';voiceTest.id='voice-test';$('voice-status').after(voiceTest);
  const voiceHealth=make('p');voiceHealth.id='voice-check-status';voiceHealth.setAttribute('role','status');voiceTest.after(voiceHealth);
  voiceTest.addEventListener('click',()=>void run(async()=>{await action('voice-test');}));
  const voices=make('section');voices.className='band-voices';voices.setAttribute('aria-label','Dot Wave player voices');
  voices.append(make('h2','GIVE THE PLAYERS A VOICE'),make('p','Choose a sound you kept in Dot Wave. Its editable recipe stays saved with this Keeper.'));
  const tools=make('div');tools.className='jazz-tool-actions';
  const shelf=make('button','Use saved Dot Wave sounds');shelf.type='button';
  const importLabel=make('label','Import sound file'),file=make('input');importLabel.className='voice-file';file.type='file';file.accept='application/json,.json';file.setAttribute('aria-label','Import Dot Wave sound file');importLabel.append(file);
  const studio=make('a','Open Dot Wave ↗');studio.href='./studio.html';studio.target='_blank';studio.rel='noopener noreferrer';tools.append(shelf,importLabel,studio);voices.append(tools);
  const choices=make('div');choices.className='band-voice-choices';
  function voiceSelect(id,label,values){const row=make('label',label),control=make('select');control.id=id;for(const[v,t]of values){const o=make('option',t);o.value=v;control.append(o);}row.append(control);choices.append(row);return control;}
  const part=voiceSelect('dot-voice-player','Player',[['piano','Piano'],['bass','Bass'],['drums','Drums']]);
  const sound=voiceSelect('dot-voice-choice','Sound',[['','Original trio voice']]);
  const assign=make('button','Give voice to player');assign.type='button';const exportVoice=make('button','Export player voice');exportVoice.type='button';choices.append(assign,exportVoice);voices.append(choices);
  const assigned=make('p');assigned.id='player-voices-status';voices.append(assigned);
  const voiceMessage=make('p');voiceMessage.id='dot-voice-status';voiceMessage.setAttribute('role','status');voices.append(voiceMessage);section.after(voices);
  let closed=false,working=false,externalBusy=false,candidates=[];
  function loadCandidates(value){const next=listJazzDotVoices(value);candidates=next;sound.replaceChildren();const original=make('option','Original trio voice');original.value='';sound.append(original);next.forEach((voice,index)=>{const o=make('option',voice.name);o.value=String(index);sound.append(o);});sound.value=next.length?'0':'';voiceMessage.textContent=`${next.length} sound${next.length===1?'':'s'} ready. Choose a player, then give it a voice.`;}
  async function run(fn){if(closed||working||externalBusy)return;working=true;render(getStation(),getSettings());try{await fn();}catch(e){if(!closed)voiceMessage.textContent=e.message||'The voice could not be saved. Your current band is unchanged.';}finally{working=false;if(!closed)render(getStation(),getSettings());}}
  shelf.addEventListener('click',()=>void run(async()=>{const saved=localStorage.getItem('dot-wave-v2-library');if(!saved)throw new Error('No Dot Wave sounds were found at this address. Export your Sound Box in Dot Wave, then import that file here.');loadCandidates(saved);}));
  file.addEventListener('change',()=>void run(async()=>{const chosen=file.files?.[0];if(!chosen)return;if(chosen.size>512*1024)throw new Error('Choose a Dot Wave file smaller than 512 KB.');const text=await chosen.text();if(!closed){loadCandidates(text);file.value='';}}));
  assign.addEventListener('click',()=>void run(async()=>{voiceMessage.textContent='Preparing the sound while the band keeps playing…';await action('player-voice',{part:part.value,voice:sound.value===''?null:candidates[Number(sound.value)]});if(!closed)voiceMessage.textContent='Voice saved. It joins the band on the next bar.';}));
  exportVoice.addEventListener('click',()=>void run(async()=>{const current=await request('voices'),voice=current.assignments[part.value];if(!voice)throw new Error('That player uses the original trio voice. Choose a saved Dot Wave voice to export.');if(closed)return;const url=URL.createObjectURL(new Blob([JSON.stringify(voice,null,2)+'\n'],{type:'application/json'})),link=make('a');link.href=url;link.download=`doodle-jazz-${part.value}-voice.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);voiceMessage.textContent='The editable voice recipe is ready to save.';}));
  function paint(station,settings,busy){
    externalBusy=busy;render(station,settings);
  }
  function render(station,settings){
    if(closed)return;
    const busy=externalBusy;
    const values = [[meter,settings.beatsPerBar??4],[phrase,settings.phraseBars??'genre'],
      [beat,settings.beatPattern??'genre'],[key,settings.keyRoot??'auto']];
    for (const [control, value] of values) {
      if (document.activeElement !== control) control.value = String(value);
      control.disabled = busy || working;
    }
    beatOnly.checked=settings.beatOnly===true;favor.checked=settings.favorLikes!==false;
    for(const control of[beatOnly,favor,suggest,shelf,file,part,sound,assign,exportVoice])control.disabled=busy||working;
    voiceTest.disabled=busy||working||!station.running||!station.voice||station.voiceStatus?.busy;
    const memory=station.learning;status.textContent=memory?.error||(memory?.patterns?`The band remembers ${memory.patterns} liked progression${memory.patterns===1?'':'s'} from ${memory.likes} positive response${memory.likes===1?'':'s'}. Naming a song or choosing “I dig this!” teaches it what to revisit.`:'Name a song or choose “I dig this!” to teach the band which progressions you enjoy.');
    const health=station.voiceStatus;voiceHealth.textContent=health?.currentStage?'Preparing the announcer…':health?.lastSuccessAt?`Voice checked at ${new Date(health.lastSuccessAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}.`:'Use Test voice to check the announcer on this Keeper.';
    const parts=station.playerVoices?.parts||{};assigned.textContent=station.playerVoices?.error||['piano','bass','drums'].map(p=>`${p[0].toUpperCase()+p.slice(1)}: ${parts[p]?.name||'original'}`).join(' · ');
    const dots=document.querySelector('.beat-dots'),count=station.info?.beatsPerBar??4;
    if(dots&&dots.children.length!==count)dots.replaceChildren(...Array.from({length:count},()=>make('i')));
  }
  return {paint,dispose(){closed=true;}};
}
