import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createJazzLearning, jazzLearningPassage } from '../jazz-learning.mjs';

const passage = { style:'swing', tonic:0, chords:[{root:2,quality:'m9'},{root:7,quality:'13'},{root:0,quality:'maj9'}] };
async function fixture(t) { const dataDir = await mkdtemp(path.join(os.tmpdir(),'jazz-learning-')); t.after(()=>rm(dataDir,{recursive:true,force:true})); return dataDir; }
test('positive feedback persists, deduplicates by source event, and favors repeated patterns',async t=>{
  const dataDir=await fixture(t), memory=await createJazzLearning({dataDir,now:()=>100});
  assert.deepEqual(await memory.remember({eventId:'name-one',source:'named',passage}),{learned:true,duplicate:false});
  await memory.remember({eventId:'name-one',source:'named',passage});
  await memory.remember({eventId:'save-one',source:'saved',passage});
  assert.equal(memory.status().likes,2); assert.equal(memory.favorites()[0].weight,2);
  await memory.close();
  const restored=await createJazzLearning({dataDir}); t.after(()=>restored.close());
  assert.equal(restored.status().named,1); assert.equal(restored.status().saved,1);
  assert.equal(restored.favorites()[0].chords[2].quality,'maj9');
  const raw=await readFile(path.join(dataDir,'jazz-learning','memory.json'),'utf8');
  assert.equal(raw.includes('name-one'),false,'event identifiers are hashed, not payment capabilities');
});
test('the same progression in another key reinforces one pattern without losing its new tonic',async t=>{
  const dataDir=await fixture(t), memory=await createJazzLearning({dataDir}); t.after(()=>memory.close());
  await memory.remember({eventId:'a',source:'saved',passage});
  await memory.remember({eventId:'b',source:'saved',passage:{...passage,tonic:5,chords:passage.chords.map(c=>({...c,root:(c.root+5)%12}))}});
  assert.equal(memory.status().patterns,1); assert.equal(memory.favorites()[0].weight,2); assert.equal(memory.favorites()[0].tonic,5);
});
test('damaged preference memory is preserved and does not accept replacement writes',async t=>{
  const dataDir=await fixture(t), original=await createJazzLearning({dataDir}); await original.close();
  const file=path.join(dataDir,'jazz-learning','memory.json'); await writeFile(file,'damaged original');
  const memory=await createJazzLearning({dataDir}); t.after(()=>memory.close());
  assert.equal(memory.status().available,false); assert.deepEqual(memory.favorites(),[]);
  await assert.rejects(memory.remember({eventId:'a',source:'saved',passage}),/recovery/);
  assert.equal(await readFile(file,'utf8'),'damaged original');
});
test('musical-only named contexts parse familiar chord symbols and reject injected or invalid chords',()=>{
  assert.deepEqual(jazzLearningPassage({style:'bossa',key:'D minor'},[{text:'Dø7'},{text:'G7♭9'}]),{style:'bossa',tonic:2,chords:[{root:2,quality:'ø7'},{root:7,quality:'7♭9'}]});
  assert.throws(()=>jazzLearningPassage(passage,[{root:12,quality:'m9'}]));
  assert.throws(()=>jazzLearningPassage(passage,[{text:'C<script>'}]));
});
