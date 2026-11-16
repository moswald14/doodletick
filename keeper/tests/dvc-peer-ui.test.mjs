// SPDX-License-Identifier: GPL-3.0-only
// DOM/link fixtures cover UI lifecycle; these do not simulate real WebRTC reachability.
import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {createDvcPeerUI} from '../public/dvc-peer-ui.mjs';
import {MAIN_GENESIS, MAIN_NETWORK_ID} from '../public/dvc-core.mjs';

const deferred = () => {let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const publicStatus = () => ({networkId:MAIN_NETWORK_ID,genesis:MAIN_GENESIS,tip:{height:'0',hash:MAIN_GENESIS.hash}});

function harness(t,{delayed=null,identity={username:'fixture',privateKey:'DISPOSABLE FAKE KEY'},remoteName='friend'}={}) {
  const previous=Object.getOwnPropertyDescriptor(globalThis,'document'), events=new EventTarget();
  const document={hidden:false,addEventListener:(...args)=>events.addEventListener(...args),removeEventListener:(...args)=>events.removeEventListener(...args)};
  Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:document});
  const elements=new Map(), instances=[], pending=deferred(), calls={identity:0,local:0,unlock:0,activity:0};
  const element=name=>{
    if(!elements.has(name)) elements.set(name,{value:'',textContent:'',disabled:false,htmlWrites:[],set innerHTML(value){this.htmlWrites.push(value);}});
    return elements.get(name);
  };
  const container={htmlWrites:[],set innerHTML(value){this.htmlWrites.push(value);},querySelector:selector=>element(selector.match(/data-dvc-([^\]]+)/)[1]),replaceChildren(){this.cleared=true;}};
  class Link {
    constructor(options){Object.assign(this,options);this.remote={username:remoteName};this.sent=[];this.closeCalls=0;instances.push(this);}
    offer(){return delayed==='offer'?pending.promise:Promise.resolve('fixture invitation');}
    accept(code){this.acceptedCode=code;return delayed==='accept'?pending.promise:Promise.resolve('fixture answer');}
    finish(code){this.finishedCode=code;return delayed==='finish'?pending.promise:Promise.resolve();}
    send(packet){
      this.sent.push(packet);
      if(packet.kind==='request') queueMicrotask(()=>this.onPacket({type:'dvc-rpc-v1',kind:'response',id:packet.id,
        result:packet.method==='mempool'?{networkId:MAIN_NETWORK_ID,transactions:[]}:publicStatus()}));
      return Promise.resolve(!this.closed);
    }
    close(reason){if(this.closed)return;this.closed=true;this.closeCalls++;this.identity=null;this.onClose(reason);}
  }
  const ui=createDvcPeerUI(container,{
    getIdentity:()=>{calls.identity++;return identity;},
    onUnlockRequest:()=>{calls.unlock++;},onActivity:()=>{calls.activity++;},
    local:async method=>{calls.local++;assert.equal(method,'status');return publicStatus();},Link,
  });
  let destroyed=false;
  const cleanup=()=>{if(destroyed)return;destroyed=true;ui.destroy();if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;};
  t.after(cleanup);
  return {ui,element,container,instances,pending,calls,cleanup,
    hide(){document.hidden=true;events.dispatchEvent(new Event('visibilitychange'));},
    last:()=>instances.at(-1),
  };
}

test('peer UI performs no identity read, connection or network activity until an explicit click',async t=>{
  const f=harness(t);f.ui.setActive(true);await nextTurn();
  assert.equal(f.calls.identity,0);assert.equal(f.calls.local,0);assert.equal(f.instances.length,0);
  await f.element('offer').onclick();
  assert.equal(f.calls.identity,1);assert.equal(f.instances.length,1);assert.equal(f.calls.local,0);
  assert.equal(f.element('out').value,'fixture invitation');assert.equal(f.element('leave').disabled,false);
});

test('inactive, hidden and locked creator states cannot start a peer connection',async t=>{
  {
    const f=harness(t);await f.element('offer').onclick();assert.equal(f.instances.length,0);assert.equal(f.calls.identity,0);
    f.ui.setActive(true);f.hide();await f.element('offer').onclick();assert.equal(f.instances.length,0);assert.equal(f.calls.identity,0);f.cleanup();
  }
  {
    const f=harness(t,{identity:null});f.ui.setActive(true);await f.element('offer').onclick();
    assert.equal(f.instances.length,0);assert.equal(f.calls.unlock,1);assert.equal(f.calls.local,0);assert.match(f.element('peer-status').textContent,/Unlock your creator vault/);
  }
});

test('delayed invitations and answers stay cancelled after disconnect, hide or leaving the page',async t=>{
  for(const method of ['offer','accept']) for(const cancel of ['disconnect','hide','leave']) for(const outcome of ['success','failure']) {
    const f=harness(t,{delayed:method});f.ui.setActive(true);f.element('in').value='friend fixture invitation';
    const work=f.element(method).onclick();assert.equal(f.instances.length,1);
    if(cancel==='disconnect') f.ui.disconnect('Disconnected deliberately.');else if(cancel==='hide') f.hide();else f.ui.setActive(false);
    const stopped=f.element('peer-status').textContent;
    if(outcome==='success')f.pending.resolve('late connection code');else f.pending.reject(Error('late pairing failure'));
    await work;
    assert.equal(f.element('peer-status').textContent,stopped,`${method}/${cancel}/${outcome}`);
    assert.equal(f.element('out').value,'');assert.equal(f.element('in').value,'');assert.equal(f.element('leave').disabled,true);
    assert.equal(f.last().identity,null);assert.equal(f.last().closeCalls,1);assert.equal(f.calls.local,0);f.cleanup();
  }
});

test('late final-answer completion cannot overwrite disconnect or vault-lock status',async t=>{
  for(const outcome of ['success','failure']) {
    const f=harness(t,{delayed:'finish'});f.ui.setActive(true);await f.element('offer').onclick();
    f.element('in').value='friend fixture answer';const work=f.element('finish').onclick();
    f.ui.disconnect('Peer stopped because the creator vault is locked.');
    if(outcome==='success')f.pending.resolve();else f.pending.reject(Error('stale final-answer failure'));
    await work;assert.equal(f.element('peer-status').textContent,'Peer stopped because the creator vault is locked.');
    assert.equal(f.last().identity,null);assert.equal(f.last().finishedCode,'friend fixture answer');f.cleanup();
  }
});

test('a verified-open callback after disconnect cannot revive networking',async t=>{
  const f=harness(t);f.ui.setActive(true);await f.element('offer').onclick();const old=f.last();
  f.ui.disconnect('Stopped.');old.onOpen(old);await nextTurn();
  assert.equal(f.calls.local,0);assert.equal(old.sent.length,0);assert.equal(f.element('peer-status').textContent,'Stopped.');
});

test('peer display names and diagnostics remain plain text and disconnect clears the live identity',async t=>{
  const name='<img src=x onerror=alert(1)>',f=harness(t,{remoteName:name});f.ui.setActive(true);await f.element('offer').onclick();
  const link=f.last();assert.ok(link.identity);link.onOpen(link);await nextTurn();
  assert.ok(f.element('peer-status').textContent.includes('@'+name));assert.ok(f.calls.local>=2);
  const diagnostic='<script>fixture</script>';link.onError(diagnostic);assert.equal(f.element('peer-status').textContent,diagnostic);
  assert.equal(f.container.htmlWrites.length,1);for(const el of f.container.htmlWrites)assert.equal(el.includes(name),false);
  for(const element of [f.element('peer-status'),f.element('out'),f.element('in')])assert.deepEqual(element.htmlWrites,[]);
  f.ui.disconnect('Vault locked.');assert.equal(link.identity,null);assert.equal(link.closeCalls,1);assert.equal(f.element('out').value,'');
});
