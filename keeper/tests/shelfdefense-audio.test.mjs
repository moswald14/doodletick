// Adapted original ShelfDEFENSE regressions against Keeper's shipped assets.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url);
const __dirname=fileURLToPath(new URL('.',import.meta.url));
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const filename=path.resolve(__dirname,'../public/shelfdefense-audio.js');

function boot({unavailable=false,suspended=false}={}){
  assert(fs.existsSync(filename),'ShelfDEFENSE needs its standalone audio engine');
  const contexts=[],sources=[];
  function param(){return {value:0,setValueAtTime(value){this.value=value;},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(value){this.value=value;},cancelScheduledValues(){}};}
  class AudioNode{
    constructor(type){this.type=type;this.frequency=param();this.gain=param();this.detune=param();this.Q=param();this.playbackRate=param();this.connections=[];}
    connect(node){this.connections.push(node);return node;}
    disconnect(){}
    start(at=0){this.started=at;sources.push(this);}
    stop(at=0){this.stopped=at;}
  }
  class AudioContext{
    constructor(){this.currentTime=0;this.sampleRate=22050;this.state=suspended?'suspended':'running';this.destination={};this.resumes=0;contexts.push(this);}
    createGain(){return new AudioNode('gain');}
    createOscillator(){return new AudioNode('oscillator');}
    createBiquadFilter(){return new AudioNode('filter');}
    createDynamicsCompressor(){const node=new AudioNode('compressor');for(const key of ['threshold','knee','ratio','attack','release'])node[key]=param();return node;}
    createBuffer(channels,length){const data=new Float32Array(length);return {getChannelData:()=>data};}
    createBufferSource(){return new AudioNode('noise');}
    resume(){this.resumes++;this.state='running';return Promise.resolve();}
  }
  const window=unavailable?{}:{AudioContext};
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{window,Math,Set,Map,console});
  return {audio:window.ShelfAudio,contexts,sources};
}

test('audio stays silent and creates no context until enabled and played',()=>{
  const {audio,contexts,sources}=boot();assert.equal(audio.play('build'),false);assert.equal(contexts.length,0);assert.equal(sources.length,0);
  audio.setEnabled(true);assert.equal(contexts.length,0);assert.equal(audio.play('build'),true);assert.equal(contexts.length,1);assert(sources.length>0);
});
test('each tower has a distinct synthesized attack signature',()=>{
  const signatures=[];
  for(const type of ['pencil','glue','band','knight','lamp']){const {audio,sources}=boot();audio.setEnabled(true);assert.equal(audio.play('shot',{type}),true);signatures.push(sources.map(source=>[source.type,source.frequency.value]).map(JSON.stringify).join('|'));}
  assert.equal(new Set(signatures).size,5);
});
test('rapid attacks are throttled and simultaneous sounds keep a voice ceiling',()=>{
  const {audio,contexts,sources}=boot();audio.setEnabled(true);assert.equal(audio.play('shot',{type:'pencil'}),true);const initial=sources.length;assert.equal(audio.play('shot',{type:'pencil'}),false);assert.equal(sources.length,initial);
  for(const event of audio.events)audio.play(event,{type:'band'});
  assert(sources.length<=24,'a burst of events must not exceed 24 simultaneous voices');
  contexts[0].currentTime=2;assert.equal(audio.play('shot',{type:'pencil'}),true);
});
test('mute stops active sounds; volume clamps and zero volume remains silent',()=>{
  const {audio,sources}=boot();audio.setVolume(9);assert.equal(audio.volume,1);audio.setEnabled(true);audio.play('boss');assert(sources.length>0);audio.setEnabled(false);assert(sources.every(source=>source.stopped!==undefined));const count=sources.length;assert.equal(audio.play('win'),false);assert.equal(sources.length,count);audio.setVolume(-3);assert.equal(audio.volume,0);audio.setEnabled(true);assert.equal(audio.play('build'),false);
});
test('all event cues work and suspended audio resumes without throwing',()=>{
  const {audio,contexts}=boot({suspended:true});audio.setEnabled(true);for(const event of audio.events){if(contexts[0])contexts[0].currentTime+=2;assert.doesNotThrow(()=>audio.play(event,{type:'glue'}));}assert(contexts[0].resumes>0);
  const unavailable=boot({unavailable:true}).audio;unavailable.setEnabled(true);assert.equal(unavailable.play('build'),false);assert.equal(unavailable.play('unknown'),false);
});
