// Copied without DSP changes from Dot Wave Studio work/wave-export.js.
(function(root){
 'use strict';const node=typeof module!=='undefined'&&module.exports,S=node?require('./studio-dsp.js'):root.StudioDSP,F=node?require('./effects-dsp.js'):root.EffectsDSP,C=node?require('./collision-audio.js'):root.CollisionAudio;
 function render(project,pair,signal,frequency,{rate=48000,duration=2,gain=.1,inverted=false,loop=true}={}){
  if(!Number.isInteger(rate)||rate<8000||rate>192000||!Number.isFinite(duration)||duration<.1||duration>10||!Number.isFinite(frequency)||frequency<20||frequency>20000||!Number.isFinite(gain)||gain<0||gain>1)throw new Error('Invalid waveform export.');
  const warm=loop?Math.ceil((F.tail(project.effects)+2)*rate):0,frames=Math.round(duration*rate),length=frames+warm,sign=inverted?-1:1;let dry;
  if(pair)dry=C.render(project,pair,{rate,duration:length/rate,gain,inverted,fade:loop?0:.015});
  else{const table=S.reconstruct(signal.real,signal.imag,Math.floor(rate*.45/frequency));dry=Float32Array.from({length},(_,i)=>S.sample(table,i/rate*frequency)*gain*sign*(loop?1:Math.min(1,i/(rate*.015),(length-1-i)/(rate*.015))));}
  const wet=F.process(dry,rate,project.effects,{tail:!loop});if(!loop)return wet;
  const out=wet.slice(warm,warm+frames),cross=Math.min(Math.round(rate*.008),Math.floor(frames/4));
  // Crossfade to the samples immediately before the loop head, never to silence.
  for(let i=0;i<cross;i++){const t=(i+1)/cross;out[frames-cross+i]=out[frames-cross+i]*(1-t)+wet[warm-cross+i]*t;}return out;
 }
 const api={render};if(node)module.exports=api;else root.WaveExport=api;
})(typeof globalThis!=='undefined'?globalThis:this);
