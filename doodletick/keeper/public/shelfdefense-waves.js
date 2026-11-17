/* ShelfDEFENSE waveform model. Shared by the tone preview and combat designer. */
(() => {
  'use strict';
  const SCHEMA='shelfdefense.wave.v1',TAU=Math.PI*2;
  const SHAPES=Object.freeze(['sine','square','triangle','saw','rsaw','pulse','noise','custom']);
  const prepared=new WeakSet(),analysisCache=new WeakMap();
  const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
  const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
  const number=(value,fallback,min,max)=>typeof value==='number'&&Number.isFinite(value)?clamp(value,min,max):fallback;
  const defaultPoints=()=>Array.from({length:64},(_,i)=>Math.sin(i/64*TAU));
  function normalize(input={}){
    if(input&&typeof input==='object'&&prepared.has(input))return input;
    const v=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
    const rawPhase=own(v,'phase')?v.phase:typeof v.p==='number'?v.p*360:0;
    const points=Array.isArray(v.custom)&&[32,64].includes(v.custom.length)&&v.custom.every(x=>typeof x==='number'&&Number.isFinite(x))?v.custom.map(x=>clamp(x,-1,1)):defaultPoints();
    const result={schema:SCHEMA,name:typeof v.name==='string'?v.name.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,40)||'Untitled waveform':'Untitled waveform',
      waveA:SHAPES.includes(v.waveA)?v.waveA:'sine',waveB:v.waveB==='off'||SHAPES.includes(v.waveB)?v.waveB:'off',
      cycles:number(v.cycles??v.cy,2,.5,8),amp:number(v.amp??v.a,.9,.1,1),phase:number(rawPhase,0,0,360),duty:number(v.duty??v.d,.3,.05,.95),
      ratio:number(v.ratio??v.r,3,.25,8),mix:number(v.mix??v.m,.25,0,1),frequency:number(v.frequency,220,80,1200),envelope:number(v.envelope,.18,.08,.65),
      custom:Object.freeze(points),seed:Math.floor(number(v.seed,1,0,0xffffffff))};
    Object.freeze(result);prepared.add(result);return result;
  }
  function noise(cell,seed){let n=(cell|0)^seed;n=Math.imul(n^(n>>>16),0x7feb352d);n=Math.imul(n^(n>>>15),0x846ca68b);return ((n^(n>>>16))>>>0)/0xffffffff*2-1;}
  function oscillator(type,t,d){
    const u=((t%1)+1)%1;
    switch(type){
      case 'sine':return Math.sin(t*TAU);
      case 'square':return u<.5?1:-1;
      case 'triangle':return 1-4*Math.abs(u-.5);
      case 'saw':return 2*u-1;
      case 'rsaw':return 1-2*u;
      case 'pulse':return u<d.duty?1:-1;
      case 'noise':return noise(Math.floor(t*97),d.seed);
      case 'custom':{const p=u*d.custom.length,i=Math.floor(p),f=p-i;return d.custom[i]*(1-f)+d.custom[(i+1)%d.custom.length]*f;}
      default:return 0;
    }
  }
  function sample(input,t){const d=normalize(input),time=(Number.isFinite(t)?t:0)+d.phase/360;const a=oscillator(d.waveA,time,d)*d.amp;return clamp(d.waveB==='off'?a:(a+oscillator(d.waveB,time*d.ratio,d)*d.mix)/(1+d.mix),-1,1);}
  function samples(input,count=128){const d=normalize(input),length=Math.floor(number(count,128,16,4096));return Array.from({length},(_,i)=>sample(d,i/length*d.cycles));}
  function signature(input){
    const d=normalize(input),fields={...d};delete fields.name;if(d.waveA!=='custom'&&d.waveB!=='custom')delete fields.custom;if(d.waveA!=='noise'&&d.waveB!=='noise')delete fields.seed;
    const source=JSON.stringify(fields);let hash=2166136261;for(let i=0;i<source.length;i++)hash=Math.imul(hash^source.charCodeAt(i),16777619);return (hash>>>0).toString(16).padStart(8,'0');
  }
  function analyze(input){
    const d=normalize(input);if(analysisCache.has(d))return analysisCache.get(d);
    const values=samples(d,256);let power=0,peak=0,area=0,first=0,second=0,crossings=0,turns=0;
    for(let i=0;i<values.length;i++){
      const v=values[i],previous=values[(i+values.length-1)%values.length],before=values[(i+values.length-2)%values.length];power+=v*v;area+=Math.abs(v);peak=Math.max(peak,Math.abs(v));first+=Math.abs(v-previous);second+=Math.abs(v-2*previous+before);if((v>=0)!==(previous>=0))crossings++;if((v-previous)*(previous-before)<0)turns++;
    }
    const rms=Math.sqrt(power/values.length),crest=peak/Math.max(.0001,rms),roughness=clamp(second/Math.max(.0001,first*1.8),0,1),crestShape=clamp((crest-1)/2,0,1),centroid=clamp(turns/values.length,0,1);
    const splashAdd=Math.round(22*roughness*(.7+.3*rms)),range=clamp(.94+.14*(1-roughness),.9,1.12),projectileSpeed=clamp(.9+.28*roughness+.05*Math.min(1,crossings/32),.8,1.25);
    let rate=clamp(.82+.28*crestShape+.12*roughness,.75,1.3),damage=clamp(1.16+.12*crestShape-.18*roughness,.75,1.3);
    // A shared budget pays for additional coverage. No waveform gains free DPS,
    // range, and splash at once, and amplitude is expressive rather than a cheat.
    const coverage=(1+splashAdd/110)*Math.max(1,range)*Math.max(1,1+(projectileSpeed-1)*.12);
    damage=clamp(Math.min(damage,rate/coverage),.75,1.3);if(damage/rate*coverage>1)rate=clamp(damage*coverage,.75,1.3);
    const combat=Object.freeze({damage,rate,range,projectileSpeed,splashAdd,slow:1});
    const result=Object.freeze({rms,roughness,zeroCrossings:crossings,peak,crest,area:area/values.length,centroid,combat,fingerprint:signature(d)});analysisCache.set(d,result);return result;
  }
  function exportPreset(input){return JSON.stringify(normalize(input),null,2);}
  function importPreset(source){
    if(typeof source==='string'&&source.length>16384)throw new Error('Wave preset is too large.');
    let v;try{v=typeof source==='string'?JSON.parse(source):source;}catch{throw new Error('Choose a valid waveform JSON preset.');}
    if(!v||typeof v!=='object'||Array.isArray(v)||v.schema!==SCHEMA||!SHAPES.includes(v.waveA))throw new Error('This is not a ShelfDEFENSE waveform preset.');
    if(Object.keys(v).some(k=>['__proto__','constructor','prototype'].includes(k)))throw new Error('Preset contains an invalid field.');
    if(v.waveB!==undefined&&v.waveB!=='off'&&!SHAPES.includes(v.waveB))throw new Error('Preset has an unknown second oscillator.');
    if(v.name!==undefined&&typeof v.name!=='string')throw new Error('Preset name must be text.');
    for(const key of ['cycles','amp','phase','duty','ratio','mix','frequency','envelope','seed'])if(v[key]!==undefined&&(typeof v[key]!=='number'||!Number.isFinite(v[key])))throw new Error(`Preset ${key} must be a finite number.`);
    if(v.custom!==undefined&&(!Array.isArray(v.custom)||![32,64].includes(v.custom.length)||!v.custom.every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=-1&&x<=1)))throw new Error('Drawn waves need 32 or 64 points between -1 and 1.');
    if((v.waveA==='custom'||v.waveB==='custom')&&!v.custom)throw new Error('The hand-drawn waveform points are missing.');
    return normalize(v);
  }
  const arc=Array.from({length:64},(_,i)=>{const u=i/64;return Math.sin(u*TAU)*(.45+.55*Math.abs(Math.sin(u*TAU*2)));});
  const presets=Object.freeze([
    {id:'velvet',name:'Velvet Pulse',description:'A smooth pulse with long reach and gentle oscillation.',wave:normalize({name:'Velvet Pulse',waveA:'sine',waveB:'sine',ratio:2,mix:.22,frequency:220,envelope:.24})},
    {id:'needle',name:'Needle Saw',description:'A sharp, elastic saw mix with a quick travelling shot.',wave:normalize({name:'Needle Saw',waveA:'saw',waveB:'pulse',ratio:2,duty:.18,mix:.3,frequency:410,envelope:.11})},
    {id:'glass',name:'Glass Triangle',description:'A clean triangular tone for precise, controlled patterns.',wave:normalize({name:'Glass Triangle',waveA:'triangle',waveB:'off',frequency:660,envelope:.18})},
    {id:'static',name:'Static Bloom',description:'Seeded noise trades direct damage for a wider impact.',wave:normalize({name:'Static Bloom',waveA:'noise',waveB:'sine',ratio:3,mix:.18,seed:531,frequency:150,envelope:.3})},
    {id:'arc',name:'Hand-drawn Arc',description:'A sculpted contour with alternating broad and narrow peaks.',wave:normalize({name:'Hand-drawn Arc',waveA:'custom',custom:arc,waveB:'off',frequency:330,envelope:.21})}
  ].map(Object.freeze));
  window.ShelfWaves=Object.freeze({schema:SCHEMA,shapes:SHAPES,normalize,sample,samples,analyze,signature,presets,exportPreset,importPreset});
})();
