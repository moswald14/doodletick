// Copied without DSP changes from Dot Wave Studio work/mushroom-dsp.js.
/*
 * Mushroom Garden's pure, offline texture renderer.
 *
 * Input: mono PCM, a sample rate, and a snapshot of the mushroom sliders/seed.
 * Output: NEW mono PCM of the same length, an event list, and sanitized settings.
 * A zero-filled input produces the garden's "pure static" sound; the UI can also
 * supply a rendered collision, including its amp and effects.
 *
 * This module does NOT own playback, timers, slider automation, files, or Web
 * Audio nodes. mushroom-ui.js owns those and crossfades between rendered buffers.
 * Keeping rendering free of clocks, Math.random(), and shared state is what lets
 * a saved recipe reproduce the same texture for preview, WAV and song placement.
 *
 * Compatibility note: changes to RNG call order, processing order, constants or
 * loop smoothing change the sound of existing recipes. Treat an algorithm change
 * as a recipe-compatibility decision, not merely an implementation refactor.
 */
(function(root){
 'use strict';

 /**
  * Return a fresh whitelist of settings; never mutate a caller's recipe object.
  * Missing/nullish fields receive the original defaults. Explicit invalid values
  * throw instead of being clamped so a damaged recipe can be rejected atomically.
  *
  * All sliders use [0, 1]:
  * - growth: maturity; strengthens texture and raises glitch probability.
  * - static: added white-noise amount, independent of whether a grain glitches.
  * - glitch: chance of a special grain, crush/hold depth, crackles and feedback.
  * - mix: linear dry/wet blend (the UI calls this Strength, not listening volume).
  * seed is an integer in [1, 2^31 - 1] for the local deterministic PRNG.
  * Extra fields are ignored so UI-only settings do not enter the audio algorithm.
  */
 function settings(v={}){
  const out={};
  for(const [k,d]of Object.entries({growth:.15,static:.35,glitch:.5,mix:.65})){
   const x=v[k]??d;
   if(typeof x!=='number'||!Number.isFinite(x)||x<0||x>1)throw Error('Invalid mushroom '+k);
   out[k]=x;
  }
  const seed=v.seed??134;
  if(!Number.isInteger(seed)||seed<1||seed>2147483647)throw Error('Invalid spore seed');
  out.seed=seed;
  return out;
 }

 /**
  * Render one frozen settings snapshot. The UI currently supplies 4 seconds at
  * 24 kHz; the DSP accepts integer rates from 8 to 96 kHz and up to 10 seconds.
  * The 128-frame minimum makes interpolation/loop smoothing well defined.
  *
  * Input is read-only. Finite amplitudes up to +/-4 are accepted for upstream
  * headroom, but the final result is always hard-clipped to nominal +/-0.85.
  * Consequently mix=0 is exact dry bypass ONLY for input already in that range.
  * Float32 storage can represent the nominal ceiling as ~0.850000024; tests of
  * the output bound should allow floating-point rounding.
  */
 function render(input,rate,raw){
  const s=settings(raw);
  if(!Number.isInteger(rate)||rate<8000||rate>96000||!input||input.length<128||input.length>rate*10)throw Error('Invalid mushroom audio');
  for(const x of input)if(!Number.isFinite(x)||Math.abs(x)>4)throw Error('Invalid mushroom sample');

  // All state starts fresh on each render. The unsigned 32-bit LCG's state is
  // deliberately local: retries/exporting must not advance a shared random stream.
  // Conditional RNG calls below are part of the sound; moving them changes it.
  const out=new Float32Array(input.length);
  let seed=s.seed,crackle=0,held=0;
  const rand=()=>{
   seed=(Math.imul(seed,1664525)+1013904223)>>>0;
   return seed/4294967296;
  };

  // Grains are 125 ms. Higher growth*glitch increases sample-and-hold from 1
  // through 24 frames and reduces amplitude precision from 4096 to 16 steps.
  // Hold and crackle decay are frame-based, so timbre varies with sample rate.
  const grain=Math.round(rate*.125),
   hold=1+Math.floor(s.growth*s.glitch*23),
   steps=2**(12-Math.floor(s.growth*s.glitch*8)),
   events=[];
  let mode=0,ratio=1,start=0,blip=220;
  const names=['Soft static','Stutter spores','Pitch sprouts','Crackle bloom'];

  // Wrapped linear interpolation is safe for pitch-up reads beyond the buffer.
  // This is intentionally cheap grain resampling, not a band-limited pitch
  // shifter or a time-stretch algorithm. Aliasing can be part of its glitch sound.
  const sample=p=>{
   p=((p%input.length)+input.length)%input.length;
   const j=Math.floor(p);
   return input[j]*(1-p+j)+input[(j+1)%input.length]*(p-j);
  };

  for(let i=0;i<out.length;i++){
   const local=i%grain;
   if(!local){
    // Each grain chooses ordinary playback or one of three named moments.
    // An event records the grain's selection, not a promise that every source
    // makes that change audible (silence, mix=0 or static can mask it).
    mode=rand()<s.growth*s.glitch?1+Math.floor(rand()*3):0;
    ratio=mode===2?[.5,.75,1.5,2][Math.floor(rand()*4)]:1;
    start=Math.max(0,i-grain*(1+Math.floor(rand()*4)));
    blip=110*2**Math.floor(rand()*5);
    if(mode)events.push({time:i/rate,name:names[mode]});
   }

   // Stutter repeats an eighth-grain slice from 1-4 grains earlier. Pitch mode
   // changes read speed inside this grain only; it does not retune the source.
   // Mode 3 currently uses the normal source read, while shared crackle/crush
   // processing below supplies its texture. Crackles are not exclusive to mode 3.
   let dry=input[i],
    wet=sample(mode===1?start+(local%Math.max(16,Math.round(grain/8))):i-local+local*ratio);

   // Blend special grains back to dry over ~3 ms at either edge. This reduces
   // jumps in source position; subsequent sample-holding intentionally adds grit.
   const edge=Math.min(1,local/(rate*.003),(grain-1-local)/(rate*.003));
   if(mode)wet=wet*edge+dry*(1-edge);

   // Sparse impulses with exponential decay. Probability is per sample, not per
   // second. The normal 24 kHz workflow preserves this character across exports.
   if(rand()<(.0003+s.growth*.002)*s.glitch)crackle=(rand()*2-1)*.25*s.growth;
   crackle*=.92;
   if(i%hold===0)held=Math.round(wet*steps)/steps;

   const noise=(rand()*2-1)*s.static*(.025+.16*s.growth),
    chirp=mode===2?Math.sin(2*Math.PI*blip*local/rate)*Math.sin(Math.PI*local/grain)*.08*s.growth:0;
   wet=held+noise+crackle+chirp;

   // A quiet 90 ms feedback tap reads the already blended/clipped output. It
   // resets at the buffer head and has no separately appended tail. Its maximum
   // feedback multiplier is .16 (and is further scaled by mix at the output).
   const delayed=i>rate*.09?out[i-Math.round(rate*.09)]*.16*s.glitch*s.growth:0;
   out[i]=Math.max(-.85,Math.min(.85,dry*(1-s.mix)+(wet+delayed)*s.mix));
  }

  if(s.mix>0){
   // Replace the final <=8 ms with a ramp toward the first sample. Endpoints then
   // match exactly, avoiding an amplitude jump at the repeat boundary. This only
   // guarantees endpoint continuity, not a matching derivative or periodic echo
   // state. No seam modification is applied in dry-bypass mode.
   const n=Math.min(Math.round(rate*.008),out.length/4|0),head=out[0];
   for(let j=0;j<n;j++){
    const t=(j+1)/n;
    out[out.length-n+j]=out[out.length-n+j]*(1-t)+head*t;
   }
  }
  return {samples:out,events,settings:s};
 }

 // One source serves Node verification and the standalone browser bundle.
 const api={settings,render};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.MushroomDSP=api;
})(typeof globalThis==='object'?globalThis:this);
