import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createRequire} from 'node:module';
createRequire(import.meta.url)('../public/doodle-bridge.js');
const B=globalThis.DoodleBridge;
const code=(await readFile(new URL('../public/telephone-1.js',import.meta.url),'utf8')).replaceAll('\r\n','\n');
const postRoll=await readFile(new URL('../public/telephone-post-roll.js',import.meta.url),'utf8');
function harness(){
  const nodes=new Map();
  function element(id=''){
    const classes=new Set(),toggle={disabled:false,attributes:{},setAttribute(k,v){this.attributes[k]=v;}},range={value:'50'};
    return{id,tagName:['seed','masterStoryText','asciiPictureText'].includes(id)?'TEXTAREA':id==='sourceHandling'?'SELECT':'INPUT',value:'',checked:false,textContent:'',children:[],style:{setProperty(){}},classList:{contains:n=>classes.has(n),toggle(n,v){if(v===undefined)v=!classes.has(n);if(v)classes.add(n);else classes.delete(n);return v;},add:n=>classes.add(n),remove:n=>classes.delete(n)},
      set className(v){classes.clear();v.split(/\s+/).forEach(c=>classes.add(c));},get className(){return[...classes].join(' ');},
      set innerHTML(v){this.html=v;const value=v.match(/type="range"[^>]*value="(\d+)"/);if(value)range.value=value[1];},get innerHTML(){return this.html||'';},
      querySelector(s){return s==='input'?range:toggle;},appendChild(el){this.children.push(el);},replaceChildren(...els){this.children=els;},onchange(){},oninput(){},toDataURL:()=> 'data:image/png;base64,YQ==',width:900,height:540,getContext:()=>({clearRect(){},fillRect(){},fillText(){},drawImage(){}})};
  }
  const node=id=>{if(!nodes.has(id))nodes.set(id,element(id));return nodes.get(id);};
  node('sourceHandling').value='fiction';node('seed').value='A paper moon hires a moth.';node('masterStoryText').value='  Kept exactly.\n';node('tone').value='unhinged';node('calls').value='3';node('damage').value='12';node('characterLens').value='open';
  const context=vm.createContext({window:{DoodleBridge:B},document:{querySelector:s=>node(s.slice(1)),querySelectorAll:()=>[],getElementById:node,createElement:()=>element()},
    lastSignal:'',lastPreHive:'',lastStoryContext:null,rootHumanSeed:'',reiterationCount:0,cosmicBest:null,
    damage:node('damage'),characterLens:node('characterLens'),audioCtx:null,updateMasterStatus(){},drawVision(){},learnLanguage(){},renderFour(){},interpretFour:()=>({bus:'observed fictional input'}),
    extract:text=>text.toLowerCase().split(/\W+/).filter(Boolean),pick:a=>a[0],cap:s=>s.charAt(0).toUpperCase()+s.slice(1),glitch:s=>s,
    first:['Moth'],gurlFirst:['Moth'],last:['Moon'],jobs:['telephone operator'],wants:['to answer the lost call'],verbs:['mends'],weird:['backwards'],
    thoughtQueue:[],renderEconomy(){},Image:class{width=1;height=1;async decode(){}},renderHive:signal=>{const line=element();line.textContent='GEN 01 // the moth kept a spare ring';node('hiveLog').replaceChildren(line);return signal+' HIVE // one spare ring.';}});
  vm.runInContext(postRoll,context);
  vm.runInContext(code.slice(0,code.indexOf('    document.querySelectorAll(".chip")')),context);
  vm.runInContext(code.slice(code.indexOf('    const moduleOn='),code.indexOf('\n',code.indexOf('    const moduleLevel='))+1),context);
  vm.runInContext(code.slice(code.indexOf('    function finishStory('),code.indexOf('    function reiterateWorld(')),context);
  vm.runInContext(code.slice(code.indexOf('    function reargueWithThought('),code.indexOf('    function glitch(')),context);
  vm.runInContext(code.slice(code.indexOf('    function commandSetModule('),code.indexOf('    function commandStatus(')),context);
  vm.runInContext(code.slice(code.indexOf('const DV_FIELDS =')),context);
  return{context,node,chain:node('chain'),adapter:context.window.TelephoneMachine,run:()=>vm.runInContext('run(false)',context),render:()=>vm.runInContext('renderPostRoll()',context)};
}

test('delivered machine uses Credits14/Blooper15 while only Exit13 is hardwired',()=>{
  const h=harness();assert.equal(h.chain.children.length,15);assert.match(h.chain.children[13].innerHTML,/14<\/span> CREDITS/);assert.match(h.chain.children[14].innerHTML,/15<\/span> BLOOPER REEL/);
  assert.equal(h.chain.children[12].querySelector('.toggle').disabled,true);assert.equal(h.chain.children[13].querySelector('.toggle').disabled,false);assert.equal(h.chain.children[14].querySelector('.toggle').disabled,false);
  h.chain.children[13].querySelector('.toggle').onclick({currentTarget:h.chain.children[13].querySelector('.toggle')});assert.equal(h.chain.children[13].classList.contains('on'),false);assert.equal(h.chain.children[12].classList.contains('on'),true);
  assert.throws(()=>vm.runInContext('commandSetModule(12,false)',h.context),/hardwired/);vm.runInContext('commandSetModule(14,false)',h.context);assert.equal(h.chain.children[14].classList.contains('on'),false);assert.equal(h.chain.children[12].classList.contains('on'),true);
});

test('successful Hivemind re-arguments refresh the new end cards for the new take',()=>{
  const h=harness();h.run();h.node('creditsOut').textContent='stale cards';h.node('blooperOut').textContent='stale cards';h.context.thoughtQueue.push({text:'Give the moth a spare ring.',score:70,four:'fictional thought'});
  assert.equal(vm.runInContext('reargueWithThought()',h.context),true);assert(!h.node('creditsOut').textContent.includes('stale'));assert(!h.node('blooperOut').textContent.includes('stale'));
  h.node('creditsOut').textContent='stale model cards';h.node('blooperOut').textContent='stale model cards';h.context.document.modelContext={registerTool(tool){h.context.registeredTool=tool;}};
  const start=code.indexOf('Promise.resolve(document.modelContext.registerTool({\n        name:"reiterate_hivemind"'),end=code.indexOf('})).catch(()=>{});',start)+'})).catch(()=>{});'.length;assert(start>0);vm.runInContext(code.slice(start,end),h.context);h.context.registeredTool.execute({brains:7,generations:4,consensus:'interesting'});
  assert(!h.node('creditsOut').textContent.includes('stale'));assert(!h.node('blooperOut').textContent.includes('stale'));assert.equal(h.node('masterStoryText').value,'  Kept exactly.\n');
});

test('a real fiction run populates both end cards without modifying source, master or final story',()=>{
  const h=harness(),source=h.node('seed').value,master=h.node('masterStoryText').value;h.run();
  const story=h.node('storyOut').textContent;assert.match(story,/STORY COMPLETE/);assert.match(h.node('creditsOut').textContent,/Moth Moon/);assert.match(h.node('blooperOut').textContent,/POEM GEN|TELEPHONE|HIVEMIND/);
  h.chain.children[13].classList.toggle('on',false);h.chain.children[14].classList.toggle('on',false);h.render();assert.match(h.node('creditsOut').textContent,/BYPASSED/);assert.match(h.node('blooperOut').textContent,/BYPASSED/);
  assert.equal(h.node('seed').value,source);assert.equal(h.node('masterStoryText').value,master);assert.equal(h.node('storyOut').textContent,story);
  for(const mode of ['personal','observer','talky']){h.node('sourceHandling').value=mode;h.node('seed').value='  Personal words stay exact.\r\n';h.run();assert.match(h.node('creditsOut').textContent,/SOURCE HOLD/);assert.match(h.node('blooperOut').textContent,/SOURCE HOLD/);assert(!h.node('blooperOut').textContent.includes('Personal words'));assert.equal(h.node('seed').value,'  Personal words stay exact.\r\n');assert.equal(h.node('masterStoryText').value,master);}
});

test('new end cards and switches survive capture and an older13-module save clears them safely',async()=>{
  const h=harness();h.run();h.chain.children[14].classList.toggle('on',false);const record=B.make('End-card fixture');record.sourceText=h.node('seed').value;record.masterText=h.node('masterStoryText').value;record.machine=h.adapter.capture();record.storyText=h.node('storyOut').textContent;
  assert.equal(record.machine.state.modules.length,15);assert(B.text(record).includes(h.node('creditsOut').textContent));assert(B.text(record).includes(h.node('blooperOut').textContent));
  h.node('creditsOut').textContent='stale current credits';h.node('blooperOut').textContent='stale current bloopers';await h.adapter.restore(record);assert(!h.node('creditsOut').textContent.includes('stale'));assert.equal(h.chain.children[14].classList.contains('on'),false);
  const older=structuredClone(record);older.machine.state.modules=older.machine.state.modules.slice(0,13);older.machine.state.modules[12].on=false;older.machine.outputs=older.machine.outputs.filter(x=>!['creditsOut','blooperOut'].includes(x.id));
  await h.adapter.restore(older);assert.equal(h.chain.children[12].classList.contains('on'),true);assert.equal(h.chain.children[13].classList.contains('on'),true);assert.equal(h.chain.children[14].classList.contains('on'),true);assert.match(h.node('creditsOut').textContent,/older session/);assert.match(h.node('blooperOut').textContent,/older session/);assert.equal(h.node('storyOut').textContent,record.storyText);
});

test('reiteration never reads credits or bloopers into its input bus',()=>{
  const start=code.indexOf('    function reiterateWorld('),end=code.indexOf('    document.querySelector("#sourceHandling").onchange',start),source=code.slice(start,end);
  assert(source.length>500);const reads=[];const context={document:{querySelector(selector){reads.push(selector);if(['#creditsOut','#blooperOut','#storyOut','#masterStoryText'].includes(selector))throw new Error('Terminal output entered feedback');return{value:'held',textContent:'held',innerHTML:''};}},rootHumanSeed:'paper moon',lastStoryContext:{},lastPreHive:'pre-story only',reiterationCount:0,extract:s=>s.split(/\s+/),run(_extra,seed){context.next=seed;}};
  context.document.querySelector=selector=>{reads.push(selector);if(['#creditsOut','#blooperOut','#storyOut','#masterStoryText'].includes(selector))throw new Error('Terminal output entered feedback');return{value:selector==='#sourceHandling'?'fiction':'paper moon',textContent:'machine scrap',innerHTML:''};};
  vm.runInNewContext(source+';reiterateWorld();',context);assert(context.next.includes('paper moon'));assert(!reads.includes('#creditsOut'));assert(!reads.includes('#blooperOut'));
});
