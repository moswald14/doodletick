// Copied without DSP changes from Dot Wave Studio work/mushroom-motion.js.
/* Control motion only: this module never generates audio or touches the DOM.
 * Keeping it separate lets us test motion independently from Web Audio timing.
 * Values are in DSP units (0..1), not the UI slider's 0..100 percentages. */
(function(root){
 'use strict';
 const KEYS=['growth','static','glitch','mix'];

 // Optional recipe metadata. Version-1 recipes without motion remain valid.
 // Do not persist active playback, timer IDs, elapsed time, or audio-node state.
 function settings(value={}){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid mushroom motion settings.');
  const speed=value.speed??1,depth=value.depth??.6;
  if(!Number.isFinite(speed)||speed<.25||speed>2||!Number.isFinite(depth)||depth<0||depth>1)throw Error('Mushroom speed must be 0.25–2 and motion depth 0–100%.');
  return {speed,depth};
 }

 // Reflect at the slider edges instead of clamping. Clamping would leave a
 // slider stuck at 0 or 1 for long stretches and lose the moving-slider sound.
 function reflect(value){const phase=((value%2)+2)%2;return phase<=1?phase:2-phase;}

 function values(anchor,seconds,options){
  const motion=settings(options);
  if(!Number.isFinite(seconds)||seconds<0)throw Error('Invalid mushroom motion time.');
  const result={...anchor},rates=[.83,1.17,1.61,.67];
  for(let i=0;i<KEYS.length;i++){
   const key=KEYS[i],center=anchor[key];
   if(!Number.isFinite(center)||center<0||center>1)throw Error('Invalid mushroom motion anchor.');
   // The spore chooses four independent phases; it does not consume the DSP's
   // random generator. Moving a knob therefore never changes the saved seed.
   const phase=(((Math.imul(anchor.seed||1,31+i*18)>>>0)%6283)/1000);
   const t=seconds*motion.speed*rates[i];
   const travel=(Math.sin(t+phase)-Math.sin(phase))*.32+
    (Math.sin(t*2.3+phase*.7)-Math.sin(phase*.7))*.11;
   // Start exactly at the user's settings and keep zero depth a true hold.
   result[key]=motion.depth===0||seconds===0?center:
    Math.round(reflect(center+travel*motion.depth)*1000)/1000;
  }
  return result;
 }
 const api={KEYS,settings,values};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.MushroomMotion=api;
})(typeof globalThis==='object'?globalThis:this);
