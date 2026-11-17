// SPDX-License-Identifier: GPL-3.0-only
import { readFile, writeFile, mkdir, rename, unlink, lstat } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { PRIVATE_ROOM_BUNDLE } from './private-room-bundle.mjs';

const MAX_ZIP=8000000, MAX_TOTAL=32000000, MAX_FRAME=6000000, CHUNK=262144;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const validId=value=>typeof value==='string'&&/^[a-z][a-z0-9-]{0,49}$/.test(value);
const validFile=value=>typeof value==='string'&&/^(?:frames\/)?[a-z][a-z0-9.-]{0,79}$/.test(value)&&!value.includes('..');
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);

export function privateServiceConfig(value) {
  if (value === undefined) return { hope: { caseRules: {} } };
  if (!plain(value) || Object.keys(value).some(key => key !== 'hope') || !plain(value.hope) || Object.keys(value.hope).some(key => key !== 'caseRules') || !plain(value.hope.caseRules) || Object.keys(value.hope.caseRules).length > 24) throw error('Invalid private service configuration.');
  const rules = {};
  for (const [id, rule] of Object.entries(value.hope.caseRules)) {
    if (!validId(id) || !plain(rule) || Object.keys(rule).sort().join(',') !== 'answer,essential' || typeof rule.answer !== 'string' || !/^[a-zA-Z0-9-]{1,60}$/.test(rule.answer) || !Array.isArray(rule.essential) || !rule.essential.length || rule.essential.length > 6 || new Set(rule.essential).size !== rule.essential.length || rule.essential.some(item => typeof item !== 'string' || !/^[a-zA-Z0-9-]{1,60}$/.test(item))) throw error('Invalid private fictional case rule.');
    rules[id] = { answer: rule.answer, essential: [...rule.essential] };
  }
  return { hope: { caseRules: rules } };
}

export function readPrivateBundle(bytes, expected) {
  if(!Buffer.isBuffer(bytes))bytes=Buffer.from(bytes);
  if(!Number.isInteger(expected?.bytes)||expected.bytes<1||expected.bytes>MAX_ZIP||!/^[a-f0-9]{64}$/.test(expected.sha256||''))throw error('This release has no private station bundle configured.',503);
  if(bytes.length!==expected.bytes||digest(bytes)!==expected.sha256)throw error('This file is not the private station bundle approved for this app version.');
  let end=-1;
  for(let at=bytes.length-22;at>=Math.max(0,bytes.length-65557);at--)if(bytes.readUInt32LE(at)===0x06054b50){end=at;break;}
  if(end<0||bytes.readUInt16LE(end+4)!==0||bytes.readUInt16LE(end+6)!==0||end+22+bytes.readUInt16LE(end+20)!==bytes.length)throw error('Invalid private bundle directory.');
  const count=bytes.readUInt16LE(end+10), size=bytes.readUInt32LE(end+12), start=bytes.readUInt32LE(end+16);
  if(!count||count>64||bytes.readUInt16LE(end+8)!==count||start+size!==end)throw error('Private bundle directory exceeds its limits.');
  let at=start,total=0;const files=new Map();
  for(let i=0;i<count;i++){
    if(at+46>end||bytes.readUInt32LE(at)!==0x02014b50)throw error('Invalid private bundle entry.');
    const flags=bytes.readUInt16LE(at+8), method=bytes.readUInt16LE(at+10), compressed=bytes.readUInt32LE(at+20), length=bytes.readUInt32LE(at+24), n=bytes.readUInt16LE(at+28), extra=bytes.readUInt16LE(at+30), comment=bytes.readUInt16LE(at+32), local=bytes.readUInt32LE(at+42);
    if(flags&1||![0,8].includes(method)||length>MAX_FRAME||compressed>MAX_ZIP||at+46+n+extra+comment>end)throw error('Unsupported private bundle entry.');
    const name=bytes.subarray(at+46,at+46+n).toString('utf8');
    if(!validFile(name)||files.has(name))throw error('Unsafe or duplicate private bundle path.');
    if(local+30>start||bytes.readUInt32LE(local)!==0x04034b50)throw error('Invalid private bundle file header.');
    const localName=bytes.readUInt16LE(local+26), localExtra=bytes.readUInt16LE(local+28), dataAt=local+30+localName+localExtra;
    if(bytes.subarray(local+30,local+30+localName).toString('utf8')!==name||bytes.readUInt16LE(local+8)!==method||dataAt+compressed>start)throw error('Private bundle headers disagree.');
    total+=length;if(total>MAX_TOTAL)throw error('Private bundle is too large when opened.');
    let data;try{data=method===0?Buffer.from(bytes.subarray(dataAt,dataAt+compressed)):inflateRawSync(bytes.subarray(dataAt,dataAt+compressed),{maxOutputLength:Math.max(1,length)});}catch{throw error('A private bundle file could not be opened.');}
    if(data.length!==length)throw error('Private bundle file length differs.');
    files.set(name,data);at+=46+n+extra+comment;
  }
  if(at!==end||!files.has('manifest.json'))throw error('The private bundle manifest is missing.');
  let manifest;try{manifest=JSON.parse(files.get('manifest.json').toString('utf8'));}catch{throw error('Invalid private station manifest.');}
  if(!plain(manifest)||manifest.format!=='mozcorp-private-bundle'||manifest.version!==1||manifest.private!==true||manifest.noncePlaceholder!=='__MOZCORP_NONCE__'||manifest.protocol!=='doodle-mozcorp/v1'||!Array.isArray(manifest.files)||!Array.isArray(manifest.stations)||!manifest.stations.length||manifest.stations.length>24)throw error('Unsupported private station manifest.');
  const inventory=new Set();
  for(const item of manifest.files){
    if(!plain(item)||!validFile(item.path)||item.path==='manifest.json'||inventory.has(item.path)||!Number.isInteger(item.bytes)||!/^[a-f0-9]{64}$/.test(item.sha256||''))throw error('Invalid private station inventory.');
    const data=files.get(item.path);if(!data||data.length!==item.bytes||digest(data)!==item.sha256)throw error('A private station failed its content check.');
    inventory.add(item.path);
  }
  if(files.size!==inventory.size+1)throw error('The private bundle contains unlisted files.');
  const stationIds=new Set();
  const stations=manifest.stations.map(s=>{
    if(!plain(s)||!validId(s.id)||stationIds.has(s.id)||typeof s.title!=='string'||!s.title||s.title.length>120||!inventory.has(s.file)||!s.file.endsWith('.html')||s.private!==true||s.canonical!==undefined&&!validId(s.canonical)||typeof s.startAnchor!=='string'||!/^[A-Za-z0-9_-]{0,100}$/.test(s.startAnchor))throw error('Invalid private station.');
    const focusAnchors=s.focusAnchors||[];if(!Array.isArray(focusAnchors)||focusAnchors.length>16||focusAnchors.some(a=>typeof a!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(a)))throw error('Invalid private station focus targets.');
    stationIds.add(s.id);return{id:s.id,title:s.title,file:s.file,canonical:s.canonical||s.id,startAnchor:s.startAnchor,focusAnchors};
  });
  for(const s of stations)if(!stationIds.has(s.canonical))throw error('A private station alias has no destination.');
  for(const file of inventory){
    const html=files.get(file).toString('utf8');
    if(!html.includes('__MOZCORP_NONCE__')||/<script\b[^>]*\bsrc\s*=/i.test(html)||/<script\b(?![^>]*nonce=["']__MOZCORP_NONCE__["'])/i.test(html))throw error('A private station requires unapproved executable resources.');
  }
  let originalUrl=null;
  if(typeof manifest.originalUpgradesUrl==='string'){try{const u=new URL(manifest.originalUpgradesUrl);if(u.protocol==='https:'&&!u.username&&!u.password)originalUrl=u.origin;}catch{}}
  const services = privateServiceConfig(manifest.services);
  return{files,stations,originalUrl,services,sha256:expected.sha256,bytes:expected.bytes};
}

export async function createPrivateRoomStore({dataDir,expected=PRIVATE_ROOM_BUNDLE}={}) {
  const directory=path.resolve(dataDir,'private-stations'), final=path.join(directory,'bundle.zip'), temp=path.join(directory,'upload.part');
  let bundle=null,upload=null,queue=Promise.resolve(),unavailable=null;
  const serial=fn=>{const job=queue.then(fn);queue=job.catch(()=>{});return job;};
  async function noLink(file){try{if((await lstat(file)).isSymbolicLink())throw error('A private station storage path is linked.',500);}catch(e){if(e.code!=='ENOENT')throw e;}}
  async function ensure(){await noLink(directory);await mkdir(directory,{recursive:true});await noLink(final);await noLink(temp);}
  try{await noLink(directory);await noLink(final);bundle=readPrivateBundle(await readFile(final),expected);}catch(e){if(e.code!=='ENOENT')unavailable='The private station bundle needs a fresh verified copy. Your other Keeper data is unchanged.';}
  function status(){return{installed:!!bundle,error:unavailable,name:expected.name||'Private stations',expected:{bytes:expected.bytes,sha256:expected.sha256},stations:bundle?.stations.map(({id,title,canonical,startAnchor,focusAnchors})=>({id,title,canonical,startAnchor,focusAnchors}))||[],originalUrl:bundle?.originalUrl||null};}
  return{
    status,
    serviceConfig(){return bundle ? structuredClone(bundle.services) : {hope:{caseRules:{}}};},
    begin(){return serial(async()=>{if(!expected.bytes||!expected.sha256)throw error('This release has no private station bundle configured.',503);await ensure();upload={id:randomBytes(16).toString('hex'),offset:0};await writeFile(temp,Buffer.alloc(0),{mode:0o600});return{uploadId:upload.id,offset:0,chunkBytes:CHUNK,totalBytes:expected.bytes};});},
    append(id,offset,bytes){return serial(async()=>{if(!upload||id!==upload.id)throw error('Start the private bundle upload again.',409);if(!Number.isSafeInteger(offset)||offset!==upload.offset)throw error('The upload position changed. Start the upload again.',409);if(!bytes.length||bytes.length>CHUNK||upload.offset+bytes.length>expected.bytes)throw error('Private bundle chunk exceeds its limits.',413);await ensure();const {appendFile}=await import('node:fs/promises');await appendFile(temp,bytes,{mode:0o600});upload.offset+=bytes.length;return{offset:upload.offset,totalBytes:expected.bytes};});},
    finish(id){return serial(async()=>{if(!upload||id!==upload.id||upload.offset!==expected.bytes)throw error('The private bundle upload is incomplete.',409);await ensure();const candidate=readPrivateBundle(await readFile(temp),expected);await rename(temp,final);bundle=candidate;upload=null;unavailable=null;return status();});},
    cancel(id){return serial(async()=>{if(upload?.id!==id)return;await ensure();await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});upload=null;});},
    frame(id){if(!bundle)throw error('Install your private station bundle first.',404);const station=bundle.stations.find(s=>s.id===id);if(!station)throw error('This private station is not installed.',404);const nonce=randomBytes(18).toString('base64');return{html:bundle.files.get(station.file).toString('utf8').replaceAll('__MOZCORP_NONCE__',nonce),csp:privateFramePolicy(nonce)};},
    async idle(){await queue;}
  };
}

export function privateFramePolicy(nonce){
  if(!/^[a-zA-Z0-9+/=]{24,40}$/.test(nonce))throw error('Invalid frame nonce.',500);
  return "default-src 'none'; script-src 'nonce-"+nonce+"'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data: blob:; connect-src 'none'; worker-src 'none'; frame-src 'self' data: blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-scripts allow-forms allow-modals allow-downloads";
}

const xmlText=value=>String(value||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,'').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,key)=>{
  if(key[0]==='#'){const n=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):parseInt(key.slice(1),10);return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'';}
  return{amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[key.toLowerCase()];
}).trim();
export async function fetchPrivateRoomNews({query='',limit=6,fetcher=fetch}={}){
  if(typeof query!=='string'||query.length>120||!Number.isInteger(limit)||limit<1||limit>12)throw error('Choose a short news search and between 1 and 12 headlines.');
  query=query.trim();const feed=new URL(query?'https://news.google.com/rss/search':'https://news.google.com/rss');
  if(query)feed.searchParams.set('q',query);for(const[k,v]of Object.entries({hl:'en-US',gl:'US',ceid:'US:en'}))feed.searchParams.set(k,v);
  let response,raw='';try{
    response=await fetcher(feed,{signal:AbortSignal.timeout(8000),redirect:'error',headers:{Accept:'application/rss+xml, application/xml;q=0.9'}});
    if(!response.ok||!response.body)throw error('The news feed is unavailable.',502);
    const decoder=new TextDecoder();let bytes=0;
    for await(const chunk of response.body){bytes+=chunk.length;if(bytes>600000){await response.body.cancel?.().catch(()=>{});throw error('The news feed exceeded its limit.',502);}raw+=decoder.decode(chunk,{stream:true});}raw+=decoder.decode();
  }catch(e){if(e.status)throw e;throw error('The news feed could not be reached. Try again later.',502);}
  const items=[];for(const match of raw.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)){
    const field=name=>xmlText(match[1].match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'>','i'))?.[1]);
    const title=field('title').slice(0,800),link=field('link');let safe;try{safe=new URL(link);if(safe.protocol!=='https:'||safe.username||safe.password)continue;}catch{continue;}
    if(!title)continue;items.push({title,source:field('source').slice(0,200),publishedAt:field('pubDate').slice(0,120),link:safe.href});if(items.length>=limit)break;
  }
  if(!items.length)throw error('The news feed returned no readable headlines. Try another search.',502);
  return{query,sourceFeed:query?'Google News search RSS':'Google News top stories RSS',grabbedAt:new Date().toISOString(),items};
}

export function createPrivateRoomHandler({store,news=fetchPrivateRoomNews}){
  let newsBusy=false,lastNewsAt=0;
  const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
  const body=async(req,max)=>{const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>max)throw error('Private station request is too large.',413);chunks.push(chunk);}return Buffer.concat(chunks);};
  return async(req,res,url)=>{
    if(!url.pathname.startsWith('/api/mozcorp/')&&!url.pathname.startsWith('/mozcorp/frame/'))return false;
    try{
      if(req.method==='GET'&&url.pathname==='/api/mozcorp/status'){send(res,200,store.status());return true;}
      if(req.method==='GET'&&url.pathname==='/api/mozcorp/news'){
        if(!store.status().installed)throw error('Install your private stations before opening their news desk.',404);
        if(newsBusy||Date.now()-lastNewsAt<1500)throw error('Wait a moment before grabbing more headlines.',429);
        const query=url.searchParams.get('q')||'',rawLimit=url.searchParams.get('limit')||'6';if(!/^\d{1,2}$/.test(rawLimit))throw error('Invalid headline count.');
        newsBusy=true;lastNewsAt=Date.now();try{send(res,200,await news({query,limit:Number(rawLimit)}));}finally{newsBusy=false;}return true;
      }
      if(req.method==='GET'&&/^\/mozcorp\/frame\/[a-z][a-z0-9-]{0,49}$/.test(url.pathname)){
        const frame=store.frame(url.pathname.split('/').at(-1));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':frame.csp,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(frame.html);return true;
      }
      if(req.method==='POST'&&url.pathname==='/api/mozcorp/install/start'){await body(req,200);send(res,200,await store.begin());return true;}
      if(req.method==='POST'&&url.pathname==='/api/mozcorp/install/chunk'){
        if(req.headers['content-type']!=='application/octet-stream')throw error('Binary bundle data required.',415);
        const id=url.searchParams.get('upload'), offset=url.searchParams.get('offset');if(!/^[a-f0-9]{32}$/.test(id||'')||!/^\d{1,8}$/.test(offset||''))throw error('Invalid bundle upload position.');
        send(res,200,await store.append(id,Number(offset),await body(req,CHUNK)));return true;
      }
      if(req.method==='POST'&&url.pathname==='/api/mozcorp/install/finish'){
        const id=url.searchParams.get('upload');if(!/^[a-f0-9]{32}$/.test(id||''))throw error('Invalid bundle upload.');await body(req,200);send(res,200,await store.finish(id));return true;
      }
      send(res,404,{error:'Private station route not found.'});return true;
    }catch(e){send(res,e.status||500,{error:e.status?e.message:'The private station could not complete this request.'});return true;}
  };
}
