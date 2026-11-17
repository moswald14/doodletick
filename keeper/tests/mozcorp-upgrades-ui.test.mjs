import test from 'node:test';
import assert from 'node:assert/strict';
import {createMozCorpUpgrades,validateUpgradeState,makeUpgradeExport} from '../public/mozcorp-upgrades.mjs';

class Element {
  constructor(tag,doc){this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];this.parentNode=null;this.dataset={};this.attributes={};this.listeners=new Map();this.value='';this.checked=false;this.hidden=false;this.disabled=false;this.required=false;this.className='';this._text='';}
  set textContent(value){this._text=String(value);this.replaceChildren();}
  get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
  set innerHTML(_){throw new Error('Proposal data must never be rendered as HTML.');}
  append(...nodes){for(const n of nodes){n.parentNode=this;this.children.push(n);}}
  replaceChildren(...nodes){for(const child of this.children)child.parentNode=null;this.children=[];this.append(...nodes);}
  setAttribute(name,value){this.attributes[name]=String(value);}
  addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(fn);}
  removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)||[]).filter(f=>f!==fn));}
  querySelectorAll(selector){const tags=selector.split(',').map(x=>x.trim().toUpperCase());return walk(this).filter(n=>n!==this&&tags.includes(n.tagName));}
  remove(){if(this.parentNode){this.parentNode.children=this.parentNode.children.filter(x=>x!==this);this.parentNode=null;}}
  focus(){this.focused=true;}
  emit(type){const event={type,target:this,preventDefault(){this.defaultPrevented=true;}};for(const fn of this.listeners.get(type)||[])fn(event);}
}
function walk(node){return[node,...node.children.flatMap(walk)];}
const copy=value=>structuredClone(value);
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const field=(root,name)=>walk(root).find(x=>x.dataset.upField===name);
const action=(root,name)=>walk(root).find(x=>x.dataset.upAction===name);
const formFor=el=>{let current=el;while(current&&current.tagName!=='FORM')current=current.parentNode;assert(current,'Form exists');return current;};
const proposal=()=>({title:'Clearer proposal labels',summary:'Explain the review steps clearly before a release is recorded.',proposedChanges:[{area:'Proposal labels',change:'Use concrete review labels.',rationale:'Make the distinction from deployment visible.'}],privacyImpact:'No existing world or private desk data is read.',reviewChecklist:['Verify each action names the saved version.'],rollbackPlan:'Restore the previous label set.',riskLevel:'LOW'});
function version(number=1,changes={}){return{id:'version-'+number,proposalId:'proposal-1',version:number,requestText:'Improve the proposal desk labels for review.',requestHash:'fixture-hash',baseRelease:'0.11b',proposal:proposal(),model:'manual',providerRequestId:null,createdAt:'2026-11-17T12:00:00Z',...changes};}
function savedProposal(changes={}){return{id:'proposal-1',moduleId:'upgrade_studio',baseRelease:'0.11b',status:'PENDING_REVIEW',currentVersion:1,approvedVersion:null,deploymentReference:null,rollbackReference:null,createdAt:'2026-11-17T12:00:00Z',updatedAt:'2026-11-17T12:00:00Z',versions:[version()],...changes};}
function initial(changes={}){return{scope:'fixture-upgrade-scope',revision:0,generation:'fixture-generation',settings:{enabled:false,consentAt:null,updatedAt:null},configured:false,model:'fixture-model',dailyLimit:8,consentVersion:'BTW-AI-UPGRADE-CONSENT-1',modules:[{id:'world_shell',label:'Navigation',boundary:'Only the requested navigation proposal.'},{id:'upgrade_studio',label:'Review desk',boundary:'Only the proposal workflow.'}],proposals:[],audit:[],...changes};}
function setup(start=initial(),onWrite){
  const doc={createElement(tag){return new Element(tag,doc);}},container=new Element('div',doc),calls=[],statuses=[];
  let state=copy(start);
  const request=async(method,payload)=>{calls.push({method,payload:copy(payload)});if(method==='GET')return copy(state);assert.equal(payload.scope,state.scope);assert.equal(payload.revision,state.revision);state=onWrite?await onWrite(copy(state),copy(payload)):{...state,revision:state.revision+1,settings:{...state.settings,enabled:payload.enabled}};return copy(state);};
  const ui=createMozCorpUpgrades({container,request,setStatus:(text,error)=>statuses.push({text,error})});
  return{container,ui,calls,statuses,setState(value){state=copy(value);},getState:()=>copy(state)};
}
function fillManual(root){
  const values={instruction:'Improve labels in the proposal workflow.',baseRelease:'0.11b',title:'Clearer proposal labels',summary:'Explain each proposal review step before recording a release.','change-area':'Proposal labels','change-change':'Use concrete review labels.','change-rationale':'Show which saved version is being reviewed.',privacyImpact:'No private work or credentials are read.',reviewChecklist:'Check the pending version label.\nCheck that deployment remains a separate step.',rollbackPlan:'Restore the previous labels.',riskLevel:'LOW'};
  for(const [name,value]of Object.entries(values)){const input=field(root,name);assert(input,'Field '+name+' exists');input.value=value;}
}

test('opening is read-only and a complete manual proposal works while AI is unconfigured and disabled',async()=>{
  const f=setup(initial(),(state,body)=>{assert.equal(body.action,'propose_manual');return{...state,revision:1,proposals:[savedProposal({moduleId:body.moduleId,versions:[version(1,{requestText:body.instruction,baseRelease:body.baseRelease,proposal:body.proposal})]})]};});
  assert.equal(f.calls.length,0);f.ui.setVisible(false);assert.equal(f.calls.length,0);await f.ui.refresh();assert.match(f.container.textContent,/AI is not configured/);assert.equal(field(f.container,'mode').children[1].disabled,true);
  fillManual(f.container);formFor(field(f.container,'instruction')).emit('submit');await settle();
  const writes=f.calls.filter(c=>c.method==='POST');assert.equal(writes.length,1);const payload=writes[0].payload;
  assert.equal(payload.action,'propose_manual');assert.equal(payload.scope,'fixture-upgrade-scope');assert.equal(payload.revision,0);assert.equal(payload.proposal.proposedChanges[0].change,'Use concrete review labels.');assert.equal(payload.proposal.reviewChecklist.length,2);assert(!Object.hasOwn(payload,'consent'));assert.match(f.container.textContent,/Awaiting review/);assert.match(f.container.textContent,/No AI provider was contacted/);
});

test('external AI needs configured key, persisted opt-in and fresh per-request consent; manual fields never enter its payload',async()=>{
  const f=setup(initial({configured:true}),(state,body)=>body.action==='settings'?{...state,revision:state.revision+1,settings:{...state.settings,enabled:body.enabled}}:{...state,revision:state.revision+1,proposals:[savedProposal({versions:[version(1,{model:state.model})]})]});
  await f.ui.refresh();fillManual(f.container);field(f.container,'title').value='ManualOnlyPrivateSentinel';
  const mode=field(f.container,'mode'),consent=field(f.container,'consent');mode.value='ai';mode.emit('change');consent.checked=true;
  formFor(field(f.container,'instruction')).emit('submit');await settle();assert.equal(f.calls.filter(c=>c.method==='POST').length,0);
  field(f.container,'enabled').checked=true;formFor(field(f.container,'enabled')).emit('submit');await settle();assert.equal(f.calls.at(-1).payload.action,'settings');assert.equal(consent.checked,false);
  consent.checked=true;consent.emit('change');field(f.container,'instruction').emit('input');assert.equal(consent.checked,false);formFor(field(f.container,'instruction')).emit('submit');await settle();assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
  consent.checked=true;consent.emit('change');formFor(field(f.container,'instruction')).emit('submit');await settle();
  const payload=f.calls.filter(c=>c.method==='POST').at(-1).payload;assert.deepEqual(Object.keys(payload).sort(),['action','baseRelease','consent','instruction','moduleId','revision','scope']);assert.equal(payload.action,'propose');assert.deepEqual(payload.consent,{version:'BTW-AI-UPGRADE-CONSENT-1',sendInstruction:true,dataScope:'instruction-only'});assert(!JSON.stringify(payload).includes('ManualOnlyPrivateSentinel'));assert.equal(consent.checked,false);
});

test('review, deployment and rollback requests identify the real current version and remain separate records',async()=>{
  const p=savedProposal({currentVersion:2,versions:[version(1),version(2)]});
  const f=setup(initial({revision:7,proposals:[p]}),(state,body)=>{const current=state.proposals[0];if(body.action==='approve')return{...state,revision:8,proposals:[{...current,status:'APPROVED',approvedVersion:2}]};if(body.action==='record_deployment')return{...state,revision:9,proposals:[{...current,status:'DEPLOYED',deploymentReference:body.deploymentReference}]};return{...state,revision:10,proposals:[{...current,status:'ROLLED_BACK',rollbackReference:body.rollbackReference}]};});
  await f.ui.refresh();assert.match(action(f.container,'approve').textContent,/version 2/);action(f.container,'approve').emit('click');await settle();
  let body=f.calls.at(-1).payload;assert.equal(body.action,'approve');assert.equal(body.version,2);assert.equal(body.revision,7);assert.equal(action(f.container,'approve'),undefined);
  const deploy=field(f.container,'deploymentReference');assert(deploy);deploy.value='manual-release-0.11.1';formFor(deploy).emit('submit');await settle();body=f.calls.at(-1).payload;assert.equal(body.action,'record_deployment');assert.equal(body.version,2);assert.equal(body.revision,8);
  const rollback=field(f.container,'rollbackReference');rollback.value='restored-release-0.11b';formFor(rollback).emit('submit');await settle();body=f.calls.at(-1).payload;assert.equal(body.action,'record_rollback');assert.equal(body.rollbackReference,'restored-release-0.11b');assert.equal(body.revision,9);assert.match(f.container.textContent,/Rollback recorded/);
});

test('revisions retain every authored change and send a new instruction for the same persisted proposal',async()=>{
  const q=proposal();q.proposedChanges.push({area:'Release records',change:'Keep release references visible.',rationale:'Support later review of an actual release.'});
  const p=savedProposal({status:'APPROVED',approvedVersion:1,versions:[version(1,{proposal:q})]});
  const before=copy(p);
  const f=setup(initial({proposals:[p]}),(state,body)=>({...state,revision:1,proposals:[{...state.proposals[0],status:'PENDING_REVIEW',currentVersion:2,approvedVersion:null,versions:[...state.proposals[0].versions,version(2,{requestText:body.instruction,proposal:body.proposal})]}]}));
  await f.ui.refresh();action(f.container,'revise').emit('click');await settle();assert.equal(field(f.container,'instruction').value,'');assert.equal(walk(f.container).filter(n=>n.dataset.upField==='change-area').length,2);
  field(f.container,'instruction').value='Revise the existing proposal without dropping its changes.';formFor(field(f.container,'instruction')).emit('submit');await settle();const body=f.calls.at(-1).payload;
  assert.equal(body.action,'propose_manual');assert.equal(body.proposalId,p.id);assert.deepEqual(body.proposal.proposedChanges,q.proposedChanges);assert.deepEqual(p,before);assert.match(f.container.textContent,/Awaiting review · version 2/);
});

test('stale writes are not retried and leave the full draft available while a refresh updates its revision',async()=>{
  const f=setup(initial(),()=>{throw new Error('This proposal changed in another tab. Refresh before saving.');});await f.ui.refresh();fillManual(f.container);
  formFor(field(f.container,'instruction')).emit('submit');await settle();assert.equal(f.calls.filter(c=>c.method==='POST').length,1);assert.equal(field(f.container,'title').value,'Clearer proposal labels');assert.equal(field(f.container,'instruction').value,'Improve labels in the proposal workflow.');assert.equal(f.statuses.at(-1).error,true);
  f.setState(initial({revision:4}));await f.ui.refresh();assert.equal(field(f.container,'instruction').value,'Improve labels in the proposal workflow.');assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
});

test('saved proposal strings remain literal text, including markup in titles, changes and instructions',async()=>{
  const q=proposal();q.title='<img src=x onerror=alert(1)>';q.proposedChanges[0].change='<script>never execute</script>';
  const f=setup(initial({proposals:[savedProposal({versions:[version(1,{requestText:'<script>instruction remains text</script>',proposal:q})]})]}));await f.ui.refresh();
  assert(f.container.textContent.includes(q.title));assert(f.container.textContent.includes(q.proposedChanges[0].change));assert(!walk(f.container).some(n=>['IMG','SCRIPT'].includes(n.tagName)));
});

test('destroy ignores late reads and synchronous request failures can be refreshed again',async()=>{
  const doc={createElement(tag){return new Element(tag,doc);}},container=new Element('div',doc);let resolve;
  const ui=createMozCorpUpgrades({container,request:()=>new Promise(done=>{resolve=done;})});const pending=ui.refresh();await Promise.resolve();ui.destroy();resolve(initial());await pending;assert.equal(container.children.length,0);await ui.refresh();
  let calls=0;const second=createMozCorpUpgrades({container,request(){if(++calls===1)throw new Error('Temporary read error');return initial();}});await assert.rejects(second.refresh(),/Temporary/);await second.refresh();assert.equal(calls,2);second.destroy();
});

test('malformed saved versions fail closed before rendering or offering a review action',()=>{
  const state=initial({proposals:[savedProposal({currentVersion:2})]});assert.throws(()=>validateUpgradeState(state),/incomplete/);
  const invalid=initial({proposals:[savedProposal()]});invalid.proposals[0].versions[0].proposal.proposedChanges=[null];assert.throws(()=>validateUpgradeState(invalid),/Invalid saved change/);
});

test('explicit versioned export preserves proposals and audit references while excluding configuration secrets',async()=>{
  const state=initial({proposals:[savedProposal()],audit:[{id:'audit-1',proposalId:'proposal-1',versionId:'version-1',eventType:'proposal.approved',createdAt:'2026-11-17T12:00:00Z',metadata:{version:1,deploymentReference:'manual-release',apiKey:'PrivateNestedKeyQ7'}},{id:'audit-2',proposalId:'removed-proposal',versionId:null,eventType:'proposal.deleted',createdAt:'2026-11-17T12:00:00Z',metadata:{retained:'audit metadata only'}}]});
  state.apiKey='PrivateTopKeyQ7';state.settings.apiKey='PrivateSettingsKeyQ7';state.proposals[0].versions[0].providerApiKey='PrivateVersionKeyQ7';state.proposals[0].versions[0].proposal.secret='PrivateProposalKeyQ7';
  const exported=makeUpgradeExport(state),raw=JSON.stringify(exported);assert.equal(exported.version,1);assert.equal(exported.format,'doodletick-mozcorp-upgrade-export');assert(!raw.includes('Private'));assert.equal(exported.state.proposals[0].versions[0].requestText,state.proposals[0].versions[0].requestText);assert.equal(exported.state.audit[0].metadata.version,1);assert.equal(exported.state.audit[0].metadata.deploymentReference,'manual-release');assert.equal(exported.state.audit[1].metadata.retained,'audit metadata only');
  const f=setup(state);await f.ui.refresh();assert.equal(action(f.container,'export').textContent,'Export proposals');assert.equal(f.calls.filter(call=>call.method==='POST').length,0);
  const empty=makeUpgradeExport(initial());assert.deepEqual(empty.state.proposals,[]);assert.deepEqual(empty.state.audit,[]);
});
