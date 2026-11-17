import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as core from '../public/scrypt-wallet-core.mjs';
const source = await readFile(new URL('../public/scrypt-wallet-ui.mjs',import.meta.url),'utf8');
const html = await readFile(new URL('../public/scrypt-wallet.html',import.meta.url),'utf8');
const controller = source.replace(/^import \{[\s\S]+?\} from '\.\/scrypt-wallet-core\.mjs';\n/m,'');
assert.doesNotMatch(controller,/^\s*(?:import|export)\s/m,'New UI imports need an explicit fixture binding.');
const key = number => {const value=new Uint8Array(32);value[31]=number;return value;};
const password='disposable UI password only';
const records={main:await core.encryptWallet(key(8),'main',password),regtest:await core.encryptWallet(key(2),'regtest',password),other:await core.encryptWallet(key(3),'regtest',password)};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {resolve,reject,promise};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(check){for(let i=0;i<200;i++){if(check())return;await tick();}assert.ok(check(),'Expected wallet UI state did not arrive.');}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
class Element extends EventTarget{
  constructor(tag,attrs=''){super();this.tagName=tag.toUpperCase();this.value='';this.textContent='';this.hidden=/(?:^|\s)hidden(?:\s|$)/.test(attrs);this.disabled=/(?:^|\s)disabled(?:\s|$)/.test(attrs);this.checked=false;this.files=[];this.attrs={};}
  setAttribute(key,value){this.attrs[key]=value;}
  fire(type){const event=new Event(type,{cancelable:true});this.dispatchEvent(event);return event;}
  click(){if(this.disabled)return false;return this.fire('click');}
}
function walletBalance(address=records.regtest.address){
  const script=Buffer.from(core.addressScript(address,'regtest'),'hex'),amount=Buffer.alloc(8);amount.writeBigUInt64LE(5000000000n);
  const raw=Buffer.concat([Buffer.from('0100000001'+'00'.repeat(32)+'ffffffff020101ffffffff01','hex'),amount,Buffer.from([script.length]),script,Buffer.alloc(4)]);
  const sha=bytes=>createHash('sha256').update(bytes).digest(),txid=sha(sha(raw)).reverse().toString('hex');
  return {network:'regtest',genesis:core.WALLET_NETWORKS.regtest.genesis,height:31,tip:'ab'.repeat(32),address,syncing:false,confirmedAtoms:'5000000000',immatureAtoms:'0',utxos:[{txid,vout:0,valueAtoms:'5000000000',scriptPubKey:script.toString('hex'),confirmations:31,coinbase:true}],transactions:{[txid]:raw.toString('hex')}};
}
function fixture({founder=false,saved=null,connected=true,encrypt,decrypt,hook}={}){
  const elements=new Map(),store=new Map(),calls=[],downloads=[],timerMap=new Map(),signatures=[],founderSignatures=[];let timerId=0;
  for(const match of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){assert.ok(!elements.has(match[3]));const element=new Element(match[1],match[2]);element.value=match[2].match(/\bvalue="([^"]*)"/)?.[1]||'';elements.set(match[3],element);}
  if(saved)store.set('doodleverse.native-wallet.v1.'+saved.network,JSON.stringify(saved));
  const doc=new EventTarget(),win=new EventTarget();doc.hidden=false;doc.getElementById=id=>{assert.ok(elements.has(id),'Missing shipped ID: '+id);return elements.get(id);};
  doc.createElement=tag=>{const element=new Element(tag);element.click=()=>downloads.push({url:element.href,name:element.download});return element;};
  const blobs=new Map(),node={connected,network:'regtest',genesis:core.WALLET_NETWORKS.regtest.genesis,height:31,peers:1,mainnetEnabled:false};
  const fetchImpl=async(url,options={})=>{
    assert.match(url,/^\.\/scrypt\/(status|wallet\/(balance|broadcast))$/);const path=url.slice('./scrypt/'.length),body=options.body?JSON.parse(options.body):null;calls.push({path,body,options});
    if(hook){const result=hook({path,body,options});if(result!==undefined)return result;}
    if(path==='status')return json(node);
    if(path==='wallet/balance')return json(walletBalance(body.address));
    if(path==='wallet/broadcast')return json({accepted:true,network:'regtest',txid:body.expectedTxid});
  };
  const context=vm.createContext({...core,generatePrivateKey:()=>key(founder?8:2),
    encryptWallet:encrypt|| (async(secret,network,entered)=>{assert.equal(entered,password);return structuredClone(records[network]);}),
    decryptWallet:decrypt|| (async(record,entered)=>{assert.equal(entered,password);return key(record.network==='main'?8:2);}),
    signTransactionPlan:(plan,secret)=>{signatures.push({plan,address:core.privateKeyIdentity(secret,plan.network).address});return core.signTransactionPlan(plan,secret);},
    createFounderRecipientRecord:secret=>{founderSignatures.push(core.privateKeyIdentity(secret,'main').address);return core.createFounderRecipientRecord(secret);},
    // Imported protocol functions run in this test's realm. JSON responses must
    // have its ordinary object prototype, as they do in the actual browser.
    document:doc,window:win,location:{hash:founder?'#founder':''},navigator:{clipboard:{writeText:async()=>{}}},fetch:fetchImpl,Response,AbortController,AbortSignal,TextDecoder,Uint8Array,Blob,JSON,
    localStorage:{getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)},
    URL:{createObjectURL:blob=>{const value='blob:'+blobs.size;blobs.set(value,blob);return value;},revokeObjectURL:()=>{}},
    setTimeout:(fn,delay)=>{const id=++timerId;timerMap.set(id,{fn,delay});return id;},clearTimeout:id=>timerMap.delete(id)});
  vm.runInContext(controller,context);
  return {elements,doc,win,store,calls,downloads,blobs,timerMap,signatures,founderSignatures,node,context,
    element:id=>elements.get(id),submit:id=>elements.get(id).fire('submit'),click:id=>elements.get(id).click(),
    async ready(){await until(()=>elements.get('node-status').textContent.includes(connected?'network':'No matching'));},
    async unlock(){elements.get('unlock-password').value=password;elements.get('unlock-wallet-form').fire('submit');await until(()=>elements.get('wallet-status').textContent.includes('Wallet unlocked'));},
    async create(){elements.get('new-password').value=password;elements.get('repeat-password').value=password;elements.get('create-wallet-form').fire('submit');await until(()=>elements.get('wallet-status').textContent.includes('Wallet created'));},
  };
}

test('founder mode is offline mainnet setup with no automatic signature or mining',async()=>{
  const f=fixture({founder:true,connected:false});await f.ready();assert.equal(f.element('wallet-network').value,'main');assert.equal(f.element('wallet-network').disabled,true);assert.equal(f.element('founder-intro').hidden,false);assert.equal(f.element('export-founder').disabled,true);assert.deepEqual(f.calls.map(call=>call.path),['status']);assert.equal(f.founderSignatures.length,0);assert.equal(f.signatures.length,0);
});
test('password mismatch never creates or persists a native wallet',async()=>{
  const f=fixture({founder:true});await f.ready();f.element('new-password').value=password;f.element('repeat-password').value='something different';f.submit('create-wallet-form');assert.equal(f.store.size,0);assert.match(f.element('wallet-status').textContent,/do not match/);assert.equal(f.element('new-password').value,'');assert.equal(f.element('repeat-password').value,'');
});
test('founder record needs explicit backup, confirmation and signing with only ciphertext saved',async()=>{
  const f=fixture({founder:true,connected:false});await f.ready();await f.create();assert.equal(f.element('create-section').hidden,true);assert.equal(f.element('export-founder').disabled,true);assert.equal(f.founderSignatures.length,0);
  const stored=[...f.store.values()].join('');assert.ok(!stored.includes(password));assert.ok(!stored.includes(core.hex(key(8))));assert.equal(JSON.parse(stored).cipher.name,'AES-GCM');
  f.element('backup-confirmed').checked=true;f.element('backup-confirmed').fire('change');assert.equal(f.element('export-founder').disabled,true);
  f.click('backup-wallet');assert.equal(f.downloads.length,1);assert.match(f.downloads[0].name,/encrypted-wallet\.json$/);assert.equal(f.element('export-founder').disabled,false);assert.equal(f.founderSignatures.length,0);
  f.click('export-founder');assert.equal(f.founderSignatures.length,1);assert.equal(f.downloads.length,2);const proof=JSON.parse(await f.blobs.get(f.downloads[1].url).text());assert.equal(core.verifyFounderRecipientRecord(proof).address,records.main.address);
  assert.deepEqual(f.calls.map(call=>call.path),['status']);assert.equal(f.element('send-section').hidden,true);
});
test('late unlock cannot reopen a wallet after hiding the page',async()=>{
  const waiting=deferred(),returnedKey=key(2),f=fixture({saved:records.regtest,decrypt:()=>waiting.promise});await f.ready();f.element('unlock-password').value=password;f.submit('unlock-wallet-form');assert.equal(f.element('unlock-password').value,'');f.doc.hidden=true;f.doc.dispatchEvent(new Event('visibilitychange'));waiting.resolve(returnedKey);await tick();await tick();assert.deepEqual(returnedKey,new Uint8Array(32));assert.equal(f.element('unlock-wallet-form').hidden,false);assert.equal(f.element('review-payment').disabled,true);assert.match(f.element('wallet-status').textContent,/hidden/);
});
test('late create is discarded after locking and cannot overwrite a newer wallet',async()=>{
  const waiting=deferred(),f=fixture({founder:true,encrypt:()=>waiting.promise});await f.ready();f.element('new-password').value=password;f.element('repeat-password').value=password;f.submit('create-wallet-form');f.click('lock-wallet');waiting.resolve(records.main);await tick();await tick();assert.equal(f.store.size,0);assert.equal(f.element('create-section').hidden,false);
});
test('restore refuses to replace an existing different encrypted wallet',async()=>{
  const f=fixture({saved:records.regtest});await f.ready();const before=f.store.get('doodleverse.native-wallet.v1.regtest');f.element('restore-wallet').files=[{size:JSON.stringify(records.other).length,text:async()=>JSON.stringify(records.other)}];f.element('restore-wallet').fire('change');await until(()=>f.element('wallet-status').textContent.includes('different encrypted wallet'));assert.equal(f.store.get('doodleverse.native-wallet.v1.regtest'),before);assert.equal(f.element('receiving-address').value,records.regtest.address);
});
test('review does not sign or broadcast; explicit send submits only the reviewed signed transaction',async()=>{
  const f=fixture({saved:records.regtest});await f.ready();await f.unlock();f.element('send-address').value=records.other.address;f.element('send-amount').value='7';f.submit('send-form');await until(()=>!f.element('payment-review').hidden);assert.equal(f.signatures.length,0);assert.equal(f.calls.filter(call=>call.path==='wallet/broadcast').length,0);assert.equal(f.element('review-fee').textContent,'0.00226000 DVC');
  await until(()=>!f.element('send-payment').disabled);f.click('send-payment');f.click('send-payment');await until(()=>f.element('payment-status').textContent.includes('accepted by the node'));assert.equal(f.signatures.length,1);const broadcasts=f.calls.filter(call=>call.path==='wallet/broadcast');assert.equal(broadcasts.length,1);assert.deepEqual(Object.keys(broadcasts[0].body).sort(),['expectedTxid','rawTransaction']);assert.ok(!JSON.stringify(f.calls).includes(password));assert.ok(!JSON.stringify(f.calls).includes(core.hex(key(2))));assert.equal(f.element('payment-review').hidden,true);
});
test('changed coins between review and send prevent signing or submission',async()=>{
  let reads=0;const f=fixture({saved:records.regtest,hook:({path,body})=>{if(path==='wallet/balance'&&++reads===2)return json({...walletBalance(body.address),confirmedAtoms:'0',utxos:[],transactions:{}});}});await f.ready();await f.unlock();f.element('send-address').value=records.other.address;f.element('send-amount').value='7';f.submit('send-form');await until(()=>!f.element('send-payment').disabled);f.click('send-payment');await until(()=>f.element('payment-status').textContent.includes('changed'));assert.equal(f.signatures.length,0);assert.equal(f.calls.filter(call=>call.path==='wallet/broadcast').length,0);
});
test('editing the recipient invalidates an earlier payment review',async()=>{
  const f=fixture({saved:records.regtest});await f.ready();await f.unlock();f.element('send-address').value=records.other.address;f.element('send-amount').value='7';f.submit('send-form');await until(()=>!f.element('send-payment').disabled);f.element('send-address').value=records.regtest.address;f.element('send-address').fire('input');assert.equal(f.element('payment-review').hidden,true);assert.equal(f.element('send-payment').disabled,true);assert.equal(f.signatures.length,0);
});
test('idle timer locks and the already exposed public receive address still works',async()=>{
  const f=fixture({saved:records.regtest});await f.ready();await f.unlock();const timer=[...f.timerMap.values()].find(item=>item.delay===300000);assert.ok(timer);timer.fn();assert.match(f.element('wallet-status').textContent,/five minutes/);assert.equal(f.element('unlock-wallet-form').hidden,false);assert.equal(f.element('receiving-address').value,records.regtest.address);assert.equal(f.element('mine-link').href,'./scrypt.html#address='+records.regtest.address);assert.equal(f.element('review-payment').disabled,true);
});
test('submission errors retain transaction ID and never retry automatically',async()=>{
  const f=fixture({saved:records.regtest,hook:({path})=>{if(path==='wallet/broadcast')throw Error('connection lost');}});await f.ready();await f.unlock();f.element('send-address').value=records.other.address;f.element('send-amount').value='7';f.submit('send-form');await until(()=>!f.element('send-payment').disabled);f.click('send-payment');await until(()=>f.element('payment-status').textContent.includes('unknown'));assert.equal(f.calls.filter(call=>call.path==='wallet/broadcast').length,1);assert.match(f.element('last-transaction').textContent,/Transaction: [0-9a-f]{64}/);assert.ok(f.store.has('doodleverse.native-wallet.v1.regtest.last-payment'));
});
test('hiding after submission keeps the pending transaction warning without claiming cancellation',async()=>{
  const waiting=deferred();const f=fixture({saved:records.regtest,hook:({path})=>{if(path==='wallet/broadcast')return waiting.promise;}});await f.ready();await f.unlock();f.element('send-address').value=records.other.address;f.element('send-amount').value='7';f.submit('send-form');await until(()=>!f.element('send-payment').disabled);f.click('send-payment');await until(()=>f.calls.some(call=>call.path==='wallet/broadcast'));f.doc.hidden=true;f.doc.dispatchEvent(new Event('visibilitychange'));assert.match(f.element('payment-status').textContent,/result may be pending/);const sent=f.calls.find(call=>call.path==='wallet/broadcast');waiting.resolve(json({accepted:true,network:'regtest',txid:sent.body.expectedTxid}));await tick();await tick();assert.match(f.element('payment-status').textContent,/result may be pending/);assert.equal(f.element('unlock-wallet-form').hidden,false);assert.equal(f.calls.filter(call=>call.path==='wallet/broadcast').length,1);
});
test('clearing wallet storage in another tab locks the current signing session',async()=>{
  const f=fixture({saved:records.regtest});await f.ready();await f.unlock();f.store.clear();const event=new Event('storage');Object.defineProperty(event,'key',{value:null});f.win.dispatchEvent(event);assert.equal(f.element('create-section').hidden,false);assert.equal(f.element('send-section').hidden,true);assert.equal(f.element('review-payment').disabled,true);assert.match(f.element('wallet-status').textContent,/changed in another tab/);
});
test('manual network choice is not silently reset by a successful node refresh',async()=>{
  const f=fixture();await f.ready();f.element('wallet-network').value='main';f.element('wallet-network').fire('change');await tick();await tick();assert.equal(f.element('wallet-network').value,'main');assert.match(f.element('node-status').textContent,/matching network/);assert.equal(f.element('review-payment').disabled,true);
});
