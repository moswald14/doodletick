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

function boot({unavailable=false,modelAvailable=true,realModel=false}={}){
  const contexts=[],sources=[],gains=[];
  function param(){return {value:0,events:[],setValueAtTime(value,time){this.value=value;this.events.push({kind:'set',value,time});},linearRampToValueAtTime(value,time){this.events.push({kind:'linear',value,time});},exponentialRampToValueAtTime(value,time){this.events.push({kind:'exp',value,time});},setTargetAtTime(value){this.value=value;}};}
  class Node{
    constructor(type){this.type=type;this.frequency=param();this.gain=param();this.Q=param();this.playbackRate=param();}
    connect(node){return node;}
    disconnect(){}
    start(at=0){this.started=at;sources.push(this);}
    stop(at=0){this.stopped=at;}
  }
  class AudioContext{
    constructor(){this.currentTime=0;this.sampleRate=24000;this.state='running';this.destination={};contexts.push(this);}
    createGain(){const node=new Node('gain');gains.push(node);return node;}
    createOscillator(){return new Node('oscillator');}
    createBiquadFilter(){return new Node('filter');}
    createBuffer(channels,length,rate){const data=new Float32Array(length);return {length,sampleRate:rate,duration:length/rate,getChannelData:()=>data};}
    createBufferSource(){return new Node('buffer');}
  }
  const model={normalize(d){return {...d,frequency:d.frequency??300,envelope:d.envelope??.2,cycles:d.cycles??2};},samples(d,n){return Array.from({length:n},(_,i)=>d.waveA==='square'?(i<n/2?.6:-.6):.6*Math.sin(i/n*Math.PI*2));}};
  const window=unavailable?{}:{AudioContext};if(modelAvailable)window.ShelfWaves=model;
  const sandbox=vm.createContext({window,Math,Set,Map,console});
  if(realModel)vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../public/shelfdefense-waves.js'),'utf8'),sandbox);
  vm.runInContext(fs.readFileSync(filename,'utf8'),sandbox);
  return {audio:window.ShelfAudio,contexts,sources,gains,model:window.ShelfWaves};
}

test('custom waveform previews remain silent until sound is enabled',()=>{
  const {audio,contexts,sources}=boot();assert.equal(typeof audio.previewWave,'function');
  assert.equal(audio.previewWave({waveA:'sine'}),false);assert.equal(contexts.length,0);assert.equal(sources.length,0);
  audio.setEnabled(true);assert.equal(audio.previewWave({waveA:'sine'}),true);assert.equal(sources.length,1);
});
test('custom attack audio uses the supplied waveform samples instead of the stock tower cue',()=>{
  const first=boot(),second=boot();first.audio.setEnabled(true);second.audio.setEnabled(true);
  assert.equal(first.audio.play('shot',{type:'pencil',wave:{waveA:'sine',frequency:400,cycles:2}}),true);
  assert.equal(second.audio.play('shot',{type:'pencil',wave:{waveA:'square',frequency:400,cycles:2}}),true);
  assert.equal(first.sources.length,1);assert.equal(first.sources[0].type,'buffer');assert(first.sources[0].loop);
  const sine=first.sources[0].buffer.getChannelData(0),square=second.sources[0].buffer.getChannelData(0);
  assert.notDeepEqual([...sine],[...square]);assert(sine.every(Number.isFinite));assert(square.every(x=>Math.abs(x)<=1));
  assert(Math.abs(first.sources[0].playbackRate.value-400*(sine.length/24000)/2)<1e-8);
});
test('waveform audio clamps duration and pitch, fades its envelope and stops immediately when muted',()=>{
  const {audio,sources,gains}=boot();audio.setEnabled(true);
  assert.equal(audio.previewWave({waveA:'square',frequency:1e9,envelope:99,cycles:2}),true);
  const source=sources[0],data=source.buffer.getChannelData(0);
  assert(source.stopped-source.started<=.6751);
  assert(source.playbackRate.value<=1200*(data.length/24000)/2);
  const events=gains.flatMap(g=>g.gain.events);assert(events.some(e=>e.kind==='linear'&&e.value<=.08));assert(events.some(e=>e.kind==='exp'&&e.value<=.0001));
  audio.setEnabled(false);assert.equal(source.stopped,0);assert.equal(audio.previewWave({waveA:'sine'}),false);
});
test('custom shots share tower throttling and unavailable waveform/audio support fails safely',()=>{
  const {audio,contexts,sources}=boot();audio.setEnabled(true);assert(audio.play('shot',{type:'lamp',wave:{waveA:'sine'}}));const count=sources.length;
  assert.equal(audio.play('shot',{type:'lamp',wave:{waveA:'square'}}),false);assert.equal(sources.length,count);
  contexts[0].currentTime=.2;assert(audio.play('shot',{type:'lamp',wave:{waveA:'square'}}));
  const absent=boot({modelAvailable:false});absent.audio.setEnabled(true);assert.equal(absent.audio.previewWave({waveA:'sine'}),false);assert.equal(absent.audio.play('shot',{type:'lamp',wave:{waveA:'sine'}}),true);
  const unavailable=boot({unavailable:true});unavailable.audio.setEnabled(true);assert.equal(unavailable.audio.previewWave({waveA:'sine'}),false);
});
test('the real mixed-wave descriptor drives the audio buffer with its waveform and pitch',()=>{
  const {audio,model,sources}=boot({realModel:true});
  const descriptor=model.normalize({name:'Mixed shape',waveA:'sine',waveB:'triangle',ratio:2.5,mix:.4,frequency:330,cycles:3,amp:.7,phase:45,envelope:.24});
  audio.setEnabled(true);assert.equal(audio.play('shot',{type:'band',wave:descriptor}),true);assert.equal(sources.length,1);
  const expected=model.samples(descriptor,256),mean=expected.reduce((sum,n)=>sum+n,0)/expected.length,peak=Math.max(...expected.map(n=>Math.abs(n-mean))),scale=1/Math.max(1,peak);
  const actual=sources[0].buffer.getChannelData(0);for(let i=0;i<actual.length;i++)assert(Math.abs(actual[i]-(expected[i]-mean)*scale)<1e-6);
  assert(Math.abs(sources[0].playbackRate.value-330*(actual.length/24000)/3)<1e-8);
});
