import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { WALLET_NETWORKS, WALLET_KDF_ITERATIONS, hex, unhex, privateKeyIdentity, publicKeyAddress, generatePrivateKey,
  addressScript, parseCoins, formatAtoms, encryptWallet, decryptWallet, validateEncryptedWallet, validateWalletBalance,
  createTransactionPlan, signTransactionPlan, verifyPlanStillSpendable, transactionSigningDigest,
  createFounderRecipientRecord, verifyFounderRecipientRecord, verifyPreviousOutput } from '../public/scrypt-wallet-core.mjs';
import { ripemd160 } from '../public/scrypt-wallet-crypto.mjs';

const key = value => { const bytes = new Uint8Array(32); bytes[31] = value; return bytes; };
const identity = privateKeyIdentity(key(2),'regtest'), recipient = privateKeyIdentity(key(3),'regtest');
const sha = value => createHash('sha256').update(value).digest(), hash2 = value => sha(sha(value));
function funded(values=['5000000000']) {
  const script=Buffer.from(addressScript(identity.address,'regtest'),'hex');
  const outputs=values.map(value=>{const amount=Buffer.alloc(8);amount.writeBigUInt64LE(BigInt(value));return Buffer.concat([amount,Buffer.from([script.length]),script]);});
  const raw=Buffer.concat([Buffer.from('0100000001'+'00'.repeat(32)+'ffffffff020101ffffffff','hex'),Buffer.from([outputs.length]),...outputs,Buffer.alloc(4)]),txid=hash2(raw).reverse().toString('hex');
  return {confirmedAtoms:values.reduce((sum,value)=>sum+BigInt(value),0n).toString(),utxos:values.map((valueAtoms,vout)=>({txid,vout,valueAtoms,scriptPubKey:script.toString('hex'),confirmations:31,coinbase:true})),transactions:{[txid]:raw.toString('hex')}};
}
function balance(overrides = {}) { return { network:'regtest',genesis:WALLET_NETWORKS.regtest.genesis,height:31,tip:'ab'.repeat(32),address:identity.address,immatureAtoms:'0',syncing:false,...funded(),...overrides }; }
const plan = (overrides = {}) => createTransactionPlan({ network:'regtest',address:identity.address,recipient:recipient.address,amount:'7',balance:balance(),...overrides });
function decode(raw) {
  const bytes = Buffer.from(raw,'hex'); let cursor = 0;
  const take = count => { const value = bytes.subarray(cursor,cursor+count); cursor += count; assert.ok(cursor<=bytes.length); return value; };
  const version = take(4), count = take(1)[0], inputs = [];
  for (let index=0; index<count; index++) { const outpoint=take(36), length=take(1)[0], script=take(length),sequence=take(4); inputs.push({outpoint,script,sequence}); }
  const outputsAt=cursor, outputCount=take(1)[0],outputs=[];
  for(let index=0;index<outputCount;index++){const amount=take(8).readBigUInt64LE(),size=take(1)[0],script=take(size);outputs.push({amount,script});}
  const outputsBytes=bytes.subarray(outputsAt,cursor),locktime=take(4);assert.equal(cursor,bytes.length);
  return {bytes,version,inputs,outputs,outputsBytes,locktime};
}

test('wallet network parameters match the pinned consensus manifest',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../../doodleverse-core/chain-manifest.json',import.meta.url),'utf8'));
  for(const [network,info] of Object.entries(WALLET_NETWORKS)){assert.equal(info.genesis,manifest.networks[network].hash);assert.equal(info.prefix,manifest.networks[network].pubkey_address_prefix);}
});
test('vendored RIPEMD160 matches standard vectors and independent Node crypto',()=>{
  for(const value of ['', 'a', 'abc', 'message digest', 'a'.repeat(100000)]){const bytes=new TextEncoder().encode(value);assert.equal(hex(ripemd160(bytes)),createHash('ripemd160').update(bytes).digest('hex'));}
});
test('native compressed address matches all three networks and public founder test fixture',()=>{
  assert.equal(privateKeyIdentity(key(1),'regtest').address,'nFXpqKGstGktjrogxmR28tu6ccJCfGSTEk');
  assert.equal(privateKeyIdentity(key(1),'test').address,'TLeUZDGLWnyiJVFcp3m3M1782uBsGWa8uf');
  for(const network of Object.keys(WALLET_NETWORKS)){const actual=privateKeyIdentity(key(2),network);assert.equal(publicKeyAddress(actual.publicKey,network),actual.address);assert.match(addressScript(actual.address,network),/^76a914[0-9a-f]{40}88ac$/);}
  assert.throws(()=>addressScript(identity.address,'main'),/another network/);assert.throws(()=>addressScript(identity.address.slice(0,-1)+'1','regtest'),/checksum/);
  assert.throws(()=>privateKeyIdentity(new Uint8Array(32),'regtest'),/Invalid native/);assert.throws(()=>publicKeyAddress('04'+'00'.repeat(32),'regtest'),/compressed/);
});
test('coin amounts remain exact and reject floats, scientific notation and excess precision',()=>{
  assert.equal(parseCoins('0.00000001'),1n);assert.equal(parseCoins('21000000'),2100000000000000n);assert.equal(formatAtoms('700000001'),'7.00000001');
  for(const value of ['1e3','-1','01','1.000000001','21000001','1.',1,NaN,' 1'])assert.throws(()=>parseCoins(value));
});
test('random wallet keys are native identities without exposing a key in metadata',()=>{
  const first=generatePrivateKey(),second=generatePrivateKey();assert.notDeepEqual(first,second);assert.deepEqual(Object.keys(privateKeyIdentity(first,'test')).sort(),['address','genesis','network','publicKey']);first.fill(0);second.fill(0);
});
test('encrypted wallet roundtrip preserves identity and keeps secret absent from serialization',async()=>{
  const secret=key(23),password='test wallet only 23 !';const encrypted=await encryptWallet(secret,'regtest',password);
  assert.equal(encrypted.kdf.iterations,WALLET_KDF_ITERATIONS);assert.equal(encrypted.cipher.name,'AES-GCM');assert.equal(encrypted.cipher.data.length,96);
  assert.ok(!JSON.stringify(encrypted).includes(hex(secret)));assert.ok(!JSON.stringify(encrypted).includes(password));
  const restored=await decryptWallet(JSON.stringify(encrypted),password,'regtest');assert.deepEqual(restored,secret);restored.fill(0);
  const reordered={...encrypted,kdf:{salt:encrypted.kdf.salt,iterations:encrypted.kdf.iterations,hash:encrypted.kdf.hash,name:encrypted.kdf.name}};
  const stable=await decryptWallet(reordered,password,'regtest');assert.deepEqual(stable,secret);stable.fill(0);
});
test('backup refuses wrong password, tampered encryption and cross-network restore',async()=>{
  const encrypted=await encryptWallet(key(24),'main','test wallet only 24 !');
  await assert.rejects(decryptWallet(encrypted,'test wallet wrong !','main'),/incorrect/);
  const tampered=structuredClone(encrypted);tampered.cipher.data=(tampered.cipher.data.startsWith('00')?'01':'00')+tampered.cipher.data.slice(2);
  await assert.rejects(decryptWallet(tampered,'test wallet only 24 !','main'),/incorrect/);
  assert.throws(()=>validateEncryptedWallet(encrypted,'regtest'),/another network/);
  const weak=structuredClone(encrypted);weak.kdf.iterations=1;assert.throws(()=>validateEncryptedWallet(weak),/password protection/);
  assert.throws(()=>validateEncryptedWallet({...encrypted,privateKey:'never accepted'}),/supported/);
  assert.throws(()=>validateEncryptedWallet(JSON.stringify(encrypted).replace('"version":1','"version":1,"version":1')),/Duplicate/);
  await assert.rejects(encryptWallet(key(24),'main','short'),/12 characters/);
});
test('wallet balance rejects wrong identity, duplicate outputs and false amounts',()=>{
  assert.equal(validateWalletBalance(balance(),identity.address,'regtest').confirmedAtoms,'5000000000');
  for(const changes of [{syncing:true},{genesis:'00'.repeat(32)},{network:'main'},{confirmedAtoms:'1'},{confirmedAtoms:5000000000},{address:recipient.address},{utxos:[...balance().utxos,...balance().utxos]}])assert.throws(()=>validateWalletBalance(balance(changes),identity.address,'regtest'));
  for(const changes of [{confirmations:29},{scriptPubKey:addressScript(recipient.address,'regtest')},{coinbase:'true'},{valueAtoms:'-1'},{vout:-1},{confirmations:0}])assert.throws(()=>validateWalletBalance(balance({utxos:[{...balance().utxos[0],...changes}]}),identity.address,'regtest'));
});
test('previous transaction authentication prevents hidden fees from forged input values',()=>{
  const original=balance(),input=original.utxos[0];
  assert.equal(verifyPreviousOutput(original.transactions[input.txid],input.txid,0).valueAtoms,'5000000000');
  assert.throws(()=>validateWalletBalance({...original,confirmedAtoms:'1000000000',utxos:[{...input,valueAtoms:'1000000000'}]},identity.address,'regtest'),/authenticated/);
  assert.throws(()=>validateWalletBalance({...original,transactions:{}},identity.address,'regtest'),/previous transaction/);
  const tampered={...original.transactions};tampered[input.txid]=tampered[input.txid].slice(0,-2)+'01';
  assert.throws(()=>validateWalletBalance({...original,transactions:tampered},identity.address,'regtest'),/identifier/);
  assert.throws(()=>verifyPreviousOutput(original.transactions[input.txid],input.txid,2),/does not exist/);
});
test('authenticated previous transactions support long unrelated scripts and consensus-sized output counts',()=>{
  const variable=value=>{if(value<253)return Buffer.from([value]);const result=Buffer.alloc(value<=65535?3:5);result[0]=value<=65535?253:254;if(value<=65535)result.writeUInt16LE(value,1);else result.writeUInt32LE(value,1);return result;};
  const script=Buffer.from(addressScript(identity.address,'regtest'),'hex'),amount=Buffer.alloc(8);amount.writeBigUInt64LE(5000000000n);
  const reward=Buffer.concat([amount,variable(script.length),script]),prefix=Buffer.from('0100000001'+'00'.repeat(32)+'ffffffff025100ffffffff','hex');
  const longScript=Buffer.concat([Buffer.from([0x6a]),Buffer.alloc(100000)]);
  const longRaw=Buffer.concat([prefix,variable(2),reward,Buffer.alloc(8),variable(longScript.length),longScript,Buffer.alloc(4)]);
  const manyRaw=Buffer.concat([prefix,variable(100001),reward,Buffer.alloc(9*100000),Buffer.alloc(4)]);
  for(const raw of [longRaw,manyRaw]){
    assert.ok(raw.length<1000000);const txid=hash2(raw).reverse().toString('hex');
    assert.deepEqual(verifyPreviousOutput(raw.toString('hex'),txid,0),{valueAtoms:'5000000000',scriptPubKey:script.toString('hex'),coinbase:true});
    const checked=balance({utxos:[{...balance().utxos[0],txid,vout:0}],transactions:{[txid]:raw.toString('hex')}});
    assert.equal(signTransactionPlan(plan({balance:checked}),key(2)).feeAtoms,'226000');
  }
  const oversized='00'.repeat(1000001);assert.throws(()=>verifyPreviousOutput(oversized,'00'.repeat(32),0),/exceeds wallet limits/);
});
test('review plans calculate explicit fee, own change and exact total debit',()=>{
  const value=plan();assert.equal(value.amountAtoms,'700000000');assert.equal(value.feeAtoms,'226000');assert.equal(value.changeAtoms,'4299774000');assert.equal(value.totalDebitAtoms,'700226000');assert.equal(value.outputs[1].address,identity.address);assert.ok(Object.isFrozen(value));assert.ok(Object.isFrozen(value.inputs));assert.ok(Object.isFrozen(value.outputs[0]));
  assert.throws(()=>plan({amount:'50'}),/not enough/);assert.throws(()=>plan({amount:'0.009'}),/minimum/);assert.throws(()=>plan({recipient:identity.address}),/different recipient/);assert.throws(()=>plan({recipient:privateKeyIdentity(key(3),'main').address}),/another network/);
});
test('sub-dust change is disclosed as fee and no dust output is created',()=>{
  const value=plan({amount:'49.995'});assert.equal(value.outputs.length,1);assert.equal(value.feeAtoms,'500000');assert.equal(value.changeAtoms,'0');
});
test('browser-signed legacy payment has independently verifiable Bitcoin ECDSA preimages',()=>{
  const value=plan(),signed=signTransactionPlan(value,key(2)),tx=decode(signed.rawTransaction);
  assert.equal(tx.version.readUInt32LE(),1);assert.equal(tx.locktime.readUInt32LE(),0);assert.equal(tx.inputs.length,1);assert.equal(tx.outputs.length,2);
  assert.equal(signed.expectedTxid,hash2(tx.bytes).reverse().toString('hex'));assert.equal(tx.outputs[0].amount,700000000n);assert.equal(tx.outputs[1].amount,4299774000n);
  for(let index=0;index<tx.inputs.length;index++){
    const input=tx.inputs[index];assert.equal(input.sequence.toString('hex'),'ffffffff');
    const size=input.script[0],signature=input.script.subarray(1,1+size-1);assert.equal(input.script[size],1);assert.equal(input.script[size+1],33);
    const pubkey=input.script.subarray(size+2);assert.equal(pubkey.toString('hex'),identity.publicKey);
    const preimage=Buffer.concat([tx.version,Buffer.from([tx.inputs.length]),...tx.inputs.map((entry,at)=>{const script=at===index?Buffer.from(value.inputs[at].scriptPubKey,'hex'):Buffer.alloc(0);return Buffer.concat([entry.outpoint,Buffer.from([script.length]),script,entry.sequence]);}),tx.outputsBytes,tx.locktime,Buffer.from('01000000','hex')]);
    assert.equal(hex(transactionSigningDigest(value,index)),hash2(preimage).toString('hex'));
    const spki=Buffer.concat([Buffer.from('3036301006072a8648ce3d020106052b8104000a032200','hex'),pubkey]);
    assert.ok(verify('sha256',sha(preimage),createPublicKey({key:spki,type:'spki',format:'der'}),signature));
  }
  assert.throws(()=>signTransactionPlan({...value},key(2)),/fresh payment/);assert.throws(()=>signTransactionPlan(value,key(3)),/owns these coins/);
});
test('payment cannot be submitted from a changed or no-longer-spendable output',()=>{
  const value=plan();assert.equal(verifyPlanStillSpendable(value,balance()),true);
  assert.throws(()=>verifyPlanStillSpendable(value,balance({confirmedAtoms:'0',utxos:[],transactions:{}})),/changed/);
  assert.throws(()=>verifyPlanStillSpendable(value,balance({confirmedAtoms:'4999999999',utxos:[{...balance().utxos[0],valueAtoms:'4999999999'}]})),/authenticated/);
});
test('multiple inputs sign each preimage separately and enforce selection bounds',()=>{
  const value=plan({balance:balance(funded(['500000000','500000000']))}),signed=signTransactionPlan(value,key(2));
  assert.equal(value.inputs.length,2);assert.equal(value.feeAtoms,'374000');assert.equal(decode(signed.rawTransaction).inputs.length,2);
  assert.throws(()=>plan({amount:'10',balance:balance(funded(Array(101).fill('10000000')))}),/not enough/);
});
test('public founder enrollment signs only the fixed mainnet allocation and proves its native key',()=>{
  const proof=createFounderRecipientRecord(key(8)),verified=verifyFounderRecipientRecord(JSON.stringify(proof));
  assert.equal(verified.address,privateKeyIdentity(key(8),'main').address);assert.equal(verified.founderAtoms,'100000000000000');assert.equal(verified.maximumSupplyAtoms,'2100000000000000');assert.equal(verified.scriptPubKey,addressScript(verified.address,'main'));
  assert.ok(!JSON.stringify(proof).includes(hex(key(8))));
  for(const changes of [{network:'regtest'},{founderAtoms:'200000000000000'},{maximumSupplyAtoms:'4200000000000000'},{domain:'Some other app'},{digest:'00'.repeat(32)},{address:privateKeyIdentity(key(9),'main').address},{purpose:'Send coins now'}])assert.throws(()=>verifyFounderRecipientRecord({...proof,...changes}));
  assert.throws(()=>createFounderRecipientRecord(key(1)),/public test key/);
});
