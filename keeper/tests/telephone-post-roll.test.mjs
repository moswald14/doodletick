import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const context=vm.createContext({});
vm.runInContext(await readFile(new URL('../public/telephone-post-roll.js',import.meta.url),'utf8'),context);
vm.runInContext('Math.random=()=>{throw new Error("Post-roll must not use randomness");};Date.now=()=>{throw new Error("Post-roll must not use the clock");};',context);
const make=context.TelephonePostRoll.make;
const base=overrides=>({mode:'fiction',name:'CastFixtureQ7',job:'RoleFixtureQ7',activeStages:['WORD GEN','POEM GEN','TELEPHONE','HIVEMIND'],clips:[{stage:'POEM GEN',text:'PoemFixtureQ7 is a real pre-story take.'},{stage:'TELEPHONE',text:'TelephoneFixtureQ7 is the actual surviving signal.'},{stage:'HIVEMIND',text:'HiveFixtureQ7 is the actual merged take.'}],creditsOn:true,bloopersOn:true,creditsLevel:100,bloopersLevel:100,...overrides});
const takes=value=>[...value.matchAll(/^TAKE \d{2} \/\/ ([^\n]+)\n([^\n]*)/gm)].map(([,stage,excerpt])=>({stage,excerpt}));
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}

test('held source modes skip credits and bloopers before reading private cast or trace fields',()=>{
  for(const mode of ['personal','observer','talky']){
    const config={mode};
    for(const field of ['name','job','activeStages','clips'])Object.defineProperty(config,field,{get(){throw new Error('Held private field must not be read: '+field);}});
    const result=make(config);assert.equal(typeof result.credits,'string');assert.equal(typeof result.bloopers,'string');assert.equal(takes(result.bloopers).length,0);
    const hidden=make(base({mode,name:'PrivateCastSecretQ9',job:'PrivateRoleSecretQ9',clips:[{stage:'POEM GEN',text:'PrivateTraceSecretQ9'}]}));
    assert.doesNotMatch(hidden.credits+'\n'+hidden.bloopers,/Private(?:Cast|Role|Trace)SecretQ9/);
  }
});

test('credits identify the fictional cast and actual active crew without duplicating post-roll stages',()=>{
  const result=make(base({activeStages:['WORD GEN','POEM GEN','HIVEMIND','HIVEMIND','CREDITS','BLOOPER REEL']}));
  assert.match(result.credits,/CastFixtureQ7/);assert.match(result.credits,/RoleFixtureQ7/);
  const crew=result.credits.split('\n').find(line=>line.startsWith('MACHINE CREW // '));
  assert(crew);for(const stage of ['WORD GEN','POEM GEN','HIVEMIND'])assert(crew.includes(stage));
  assert.equal(crew.match(/HIVEMIND/g)?.length,1);assert(!crew.includes('TELEPHONE'));assert(!crew.includes('CREDITS'));assert(!crew.includes('BLOOPER REEL'));
});

test('blooper takes use only exact approved pre-story stage names and literal supplied excerpts',()=>{
  const clips=[...base().clips,{stage:'STORY // EXIT',text:'FinalEndingSecretZ1'},{stage:'SOURCE',text:'OriginalInputSecretZ2'},{stage:'CHARACTER GEN',text:'CharacterSecretZ3'},{stage:'telephone',text:'WrongCaseSecretZ4'},{stage:'TELEPHONE ',text:'TrailingStageSecretZ5'},null,{stage:'HIVEMIND',text:42}];
  const result=make(base({clips})),out=takes(result.bloopers);
  assert.equal(out.length,3);assert.doesNotMatch(result.bloopers,/FinalEndingSecretZ1|OriginalInputSecretZ2|CharacterSecretZ3|WrongCaseSecretZ4|TrailingStageSecretZ5/);
  for(const item of out){assert(['POEM GEN','TELEPHONE','HIVEMIND'].includes(item.stage));assert(clips.some(clip=>clip?.stage===item.stage&&clip.text===item.excerpt),'Every take must be an actual supplied trace excerpt.');}
});

test('disabled cards reveal neither cast nor trace and do not change the other enabled card',()=>{
  const enabled=make(base()),noCredits=make(base({creditsOn:false})),noBloopers=make(base({bloopersOn:false}));
  assert.doesNotMatch(noCredits.credits,/CastFixtureQ7|RoleFixtureQ7|WORD GEN/);assert.equal(noCredits.bloopers,enabled.bloopers);
  assert.equal(takes(noBloopers.bloopers).length,0);assert.doesNotMatch(noBloopers.bloopers,/PoemFixtureQ7|TelephoneFixtureQ7|HiveFixtureQ7/);assert.equal(noBloopers.credits,enabled.credits);
});

test('intensity bounds take count, excerpt length and crew count without creating replacement text',()=>{
  const clips=Array.from({length:20},(_,i)=>({stage:['POEM GEN','TELEPHONE','HIVEMIND'][i%3],text:('Trace'+i+'Q8-').repeat(180)}));
  const activeStages=Array.from({length:16},(_,i)=>'CrewStage'+i+'Q8');
  const low=make(base({clips,activeStages,creditsLevel:0,bloopersLevel:0})),high=make(base({clips,activeStages,creditsLevel:100,bloopersLevel:100}));
  const lowTakes=takes(low.bloopers),highTakes=takes(high.bloopers);
  assert.equal(lowTakes.length,1);assert.equal(highTakes.length,8);assert(lowTakes.every(x=>x.excerpt.length<=161));assert(highTakes.every(x=>x.excerpt.length<=501));
  for(const item of [...lowTakes,...highTakes]){const excerpt=item.excerpt.replace(/…$/,'');assert(clips.some(clip=>clip.stage===item.stage&&clip.text.startsWith(excerpt)),'A shortened take must remain a prefix of a real trace.');}
  assert((low.credits.match(/CrewStage\d+Q8/g)||[]).length<(high.credits.match(/CrewStage\d+Q8/g)||[]).length);
  assert.equal(make(base({clips,bloopersLevel:-200})).bloopers,make(base({clips,bloopersLevel:0})).bloopers);
  assert.equal(make(base({clips,bloopersLevel:999})).bloopers,high.bloopers);
});

test('blank, bypassed and duplicate takes are excluded without inventing outtakes',()=>{
  const result=make(base({clips:[{stage:'POEM GEN',text:'   '},{stage:'TELEPHONE',text:'[ TELEPHONE BYPASSED ]'},{stage:'HIVEMIND',text:'One actual take.'},{stage:'POEM GEN',text:'One   actual\n take.'}]}));
  assert.deepEqual(takes(result.bloopers),[{stage:'HIVEMIND',excerpt:'One actual take.'}]);
  const empty=make(base({clips:[]}));assert.equal(takes(empty.bloopers).length,0);assert.doesNotMatch(empty.bloopers,/PoemFixtureQ7|TelephoneFixtureQ7|HiveFixtureQ7/);
});

test('large traces stay bounded and post-roll generation is deterministic without mutating source data',()=>{
  const config=base({activeStages:Array.from({length:1000},(_,i)=>'Stage'+i+' '+'.'.repeat(400)),clips:Array.from({length:3000},(_,i)=>({stage:['POEM GEN','TELEPHONE','HIVEMIND'][i%3],text:'Trace'+i+' '+'.'.repeat(2000)}))});
  const before=JSON.stringify(config);freeze(config);
  const first=make(config),second=make(config);assert.equal(first.credits,second.credits);assert.equal(first.bloopers,second.bloopers);assert.equal(JSON.stringify(config),before);
  assert(first.credits.length<5000);assert(first.bloopers.length<6000);assert(takes(first.bloopers).length<=8);
});
