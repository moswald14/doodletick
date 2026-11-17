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
const filename=path.resolve(__dirname,'../public/shelfdefense-waves.js');
function boot(){assert(fs.existsSync(filename),'The shared waveform model must exist');const context={window:{},Math,JSON};vm.createContext(context);vm.runInContext(fs.readFileSync(filename,'utf8'),context);return context.window.ShelfWaves;}
const plain=x=>JSON.parse(JSON.stringify(x));

test('canonical wave settings clamp safely and accept the earlier wave lab aliases',()=>{
  const w=boot(),d=w.normalize({waveA:'triangle',waveB:'sine',cy:3,a:.8,p:.25,d:.2,r:2,m:.4,frequency:1e9,envelope:-1});
  assert.equal(d.schema,'shelfdefense.wave.v1');assert.equal(d.cycles,3);assert.equal(d.phase,90);assert.equal(d.duty,.2);assert.equal(d.frequency,1200);assert.equal(d.envelope,.08);
  const bad=w.normalize({waveA:'script',amp:NaN,phase:Infinity,duty:-50,custom:[NaN]});assert.equal(bad.waveA,'sine');assert(bad.amp>=.1&&bad.amp<=1);assert.equal(bad.duty,.05);
});
test('oscillators are periodic, phase-sensitive, bounded and deterministic including seeded noise',()=>{
  const w=boot();for(const waveA of ['sine','square','triangle','saw','rsaw','pulse','noise','custom']){
    const d=w.normalize({waveA,amp:1,seed:77,cycles:2});const a=w.samples(d,256),b=w.samples(d,256);assert.deepEqual(plain(a),plain(b));assert(a.every(x=>Number.isFinite(x)&&Math.abs(x)<=1));
    if(waveA!=='noise')assert(Math.abs(w.sample(d,.12)-w.sample(d,1.12))<1e-10);
  }
  assert.notEqual(w.sample(w.normalize({waveA:'sine',phase:0}),0),w.sample(w.normalize({waveA:'sine',phase:90}),0));
  assert.notDeepEqual(plain(w.samples({waveA:'noise',seed:1})),plain(w.samples({waveA:'noise',seed:2})));
});
test('hand-drawn points interpolate into the actual attack waveform and mixes change its shape',()=>{
  const w=boot(),points=Array(32).fill(0);points[8]=1;points[24]=-1;
  const d=w.normalize({waveA:'custom',custom:points,amp:1,waveB:'off'});assert.equal(w.sample(d,.25),1);assert.equal(w.sample(d,.75),-1);assert.equal(w.sample(d,.125),0);
  const mixed=w.normalize({...d,waveB:'square',ratio:2,mix:.6});assert.notDeepEqual(plain(w.samples(d)),plain(w.samples(mixed)));
});
test('every preset produces distinct bounded combat tradeoffs from sampled metrics',()=>{
  const w=boot(),fingerprints=new Set();assert.equal(w.presets.length,5);
  for(const preset of w.presets){const a=w.analyze(preset.wave),c=a.combat;fingerprints.add(w.signature(preset.wave));
    assert(a.rms>0&&a.peak<=1&&a.roughness>=0);assert(c.damage>=.75&&c.damage<=1.3);assert(c.rate>=.75&&c.rate<=1.3);assert(c.range>=.9&&c.range<=1.12);assert(c.projectileSpeed>=.8&&c.projectileSpeed<=1.25);assert(c.splashAdd>=0&&c.splashAdd<=22);
    const budget=c.damage/c.rate*(1+c.splashAdd/110)*Math.max(1,c.range)*Math.max(1,1+(c.projectileSpeed-1)*.12);assert(budget<=1.031,`preset ${preset.id} exceeds its attack budget`);
  }
  assert.equal(fingerprints.size,5);assert.notDeepEqual(plain(w.analyze(w.presets[0].wave).combat),plain(w.analyze(w.presets[1].wave).combat));
});
test('portable presets round trip without changing their sound, shape or fingerprint',()=>{
  const w=boot(),d=w.normalize({name:'My pulse',waveA:'pulse',duty:.23,waveB:'sine',mix:.41,ratio:1.5,frequency:333,seed:123});const restored=w.importPreset(w.exportPreset(d));
  assert.deepEqual(plain(restored),plain(d));assert.equal(w.signature(restored),w.signature(d));assert.equal(w.signature({...d,name:'renamed'}),w.signature(d));assert.notEqual(w.signature({...d,duty:.31}),w.signature(d));
});
test('import rejects malformed, unversioned, oversized and executable-looking data',()=>{
  const w=boot(),base=plain(w.normalize({}));
  for(const value of ['not json','x'.repeat(20000),JSON.stringify({...base,schema:'unknown'}),JSON.stringify({schema:base.schema}),JSON.stringify({...base,waveA:'function(){return 1}'}),JSON.stringify({...base,custom:[1,2]}),JSON.stringify({...base,frequency:'440'}),{...base,frequency:NaN}])assert.throws(()=>w.importPreset(value));
});
