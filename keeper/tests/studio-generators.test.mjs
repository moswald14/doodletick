import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Load the actual delivered browser modules, before the app mounts its UI.
const source=(await readFile(new URL('../public/studio-app.js',import.meta.url),'utf8')).replaceAll('\r\n','\n');
const marker="\n(function () {\n  'use strict';\n  const C = DotWave, $ = id => document.getElementById(id);";
const appStart=source.lastIndexOf(marker);assert(appStart>0);
let networkCalls=0;
const scope={URL,URLSearchParams,TextEncoder,TextDecoder,atob,btoa,Buffer,structuredClone,
  location:{search:''},document:{currentScript:{src:'https://keeper.fixture/studio-app.js'}},
  fetch(){networkCalls++;throw Error('The delivered module fixture must stay offline.');}};
scope.window=scope;
vm.runInNewContext(source.slice(0,appStart),scope,{filename:'delivered-studio-generators.js'});
const {DotWave:C,StudioIdeas:Ideas,MarketWave:Market}=scope;
assert.equal(typeof scope.DoodleJazzComposer.DJComposer,'function');
assert.equal(typeof scope.IdeasPanel,'function');assert.equal(typeof scope.MarketPanel,'function');
const plain=value=>JSON.parse(JSON.stringify(value));

test('the delivered Doodle Jazz composer becomes editable patterns and a real rendered song',()=>{
  const p=C.blank(),idea=Ideas.jazz({genre:'swing',bars:4,seed:4271});
  const before=C.serialize(p),result=Ideas.addNotes(C,p,idea.bars,idea.notes,0,true);
  assert.equal(C.serialize(p),before,'Reviewing an idea cannot change the source project.');
  p.melody=result.melody;C.syncTempo(p,idea.bpm);p.melody.root=idea.root;p.melody.mode=idea.mode;
  for(const part of ['melody','chords','bass','rhythm']){assert(result.inserted[part].length>0);const pattern=C.patternFromPart(p,part,null,'Jazz '+part);p.patterns.push(pattern);C.addPattern(p,pattern,0);}
  const restored=C.open(JSON.parse(C.serialize(p)));assert.equal(restored.song.tracks.length,4);
  const phrase=restored.song.tracks[0].phrases[0],keptPitch=restored.patterns[0].notes[0].midi;
  phrase.notes[0].midi++;assert.equal(restored.patterns[0].notes[0].midi,keptPitch,'Placed Jazz copies stay independent.');
  const audio=C.render(restored,'song',8000);assert(audio.left.length>1000);assert(audio.left.some(n=>Math.abs(n)>.001));assert(audio.left.every(Number.isFinite));
  assert.equal(networkCalls,0);
});

test('delivered Random and AI tools preserve existing notes and change only the requested beat measure',()=>{
  const p=C.blank();p.melody.tracks[0].notes=[{start:0,duration:1,midi:64,velocity:.6}];
  const generated=Ideas.randomMelody({root:0,mode:'major',grid:.25,part:'melody',seed:17});
  const result=Ideas.addNotes(C,p,generated.bars,{melody:generated.notes},0);
  assert(result.start>=4);assert.equal(p.melody.tracks[0].notes.length,1);
  assert.equal(result.melody.tracks[0].notes[0].midi,64);
  const pattern=C.D.resizePattern(p.beat.pattern,{bars:2});pattern.tracks[0].steps[0]=.5;
  const old=plain(pattern),beat=Ideas.randomBeat(C.D,pattern,1,9),steps=C.D.stepsPerBar(pattern.meter);
  assert.deepEqual(plain(pattern),old);for(let i=0;i<beat.tracks.length;i++)assert.deepEqual(plain(beat.tracks[i].steps.slice(0,steps)),old.tracks[i].steps.slice(0,steps));
  assert(beat.tracks.some(track=>track.steps.slice(steps).some(n=>n>0)));
  const ai=Ideas.parseAI(JSON.stringify({kind:'dot-studio-idea',version:1,name:'Fixture AI sketch',bars:2,notes:[{start:0,duration:1,midi:60,velocity:.7}]}));
  assert.equal(Ideas.addNotes(C,p,ai.bars,{chords:ai.notes},0).inserted.chords.length,1);
  assert.throws(()=>Ideas.parseAI('{"kind":"dot-studio-idea","version":1,"name":"Invalid","bars":1,"notes":[{"start":5,"duration":1,"midi":60,"velocity":0.7}]}'));
  assert.equal(networkCalls,0);
});

test('delivered Coin Wave CSV creates a kept cyclic patch without any network or changes to the other voice',()=>{
  const start=Date.UTC(2026,0,1),csv='time,price\n'+Array.from({length:25},(_,i)=>new Date(start+i*3600000).toISOString()+','+(100+Math.sin(i/2)*8+i*.1)).join('\n');
  const chart=Market.csv(csv,'Fixture coin day'),p=C.blank(),before=plain(p.patch);
  const next=Market.patch(C,p.patch,chart,'b');assert.deepEqual(plain(p.patch),before);assert.deepEqual(plain(next.project.a),before.project.a);
  assert.equal(chart.through-chart.from,86400000);assert.equal(next.project.b.points.length,32);
  const table=C.S.sourceOutline(next.project.b);assert.equal(C.S.sample(table,0),C.S.sample(table,1));
  p.patch=next;const tone=C.savePatchTone(p,'Fixture market wave'),saved=C.open(JSON.parse(C.serialize(p)));
  assert.deepEqual(plain(saved.library.find(w=>w.id===tone.id).patchTone.patch.project.b.points),plain(chart.wave));
  assert.equal(networkCalls,0);
});

test('the shipped composer source and notices retain the exact upstream revision and full GPL text',async()=>{
  const preferred=(await readFile(new URL('../public/studio-doodle-jazz-source.js',import.meta.url),'utf8')).replaceAll('\r\n','\n');
  const notices=await readFile(new URL('../public/studio-notices.txt',import.meta.url),'utf8');
  assert(source.includes(preferred));assert(preferred.includes('SPDX-License-Identifier: GPL-3.0-only'));
  assert(notices.includes('c1238d9f010c42507ce2efb591dd6d36b725c277'));
  assert(notices.includes('GNU GENERAL PUBLIC LICENSE'));assert(notices.includes('Version 3, 29 June 2007'));
  assert(notices.includes('https://github.com/moswald14/dot-wave-studio'));
});
