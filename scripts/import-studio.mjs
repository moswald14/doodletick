// SPDX-License-Identifier: GPL-3.0-only
// Import the verified standalone Studio while retaining Keeper's story and match bridge.
import { access, readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const integration = path.join(root, 'scripts/studio-integration');
const normalize = value => value.replaceAll('\r\n', '\n');
const read = async name => normalize(await readFile(name, 'utf8'));
function replace(source, before, after, label) {
  if (!source.includes(before)) throw Error('Review the Studio adapter: ' + label);
  return source.replace(before, after);
}
export async function adaptStudio(app, version, { sharedRooms = false } = {}) {
  app = normalize(app);
  app = replace(app, "  const steps = ['sound', 'beat', 'melody', 'arrange', 'export'];", '  const matchStudio = '+(sharedRooms?"new URLSearchParams(location.search).get('matchStudio') === '1'":'false')+";\n  const telephone = {items:[],selected:null,loading:false,loaded:false,error:'',ticket:0};\n  const requestedTelephone = matchStudio ? null : new URLSearchParams(location.search).get('project');\n  const steps = ['sound', 'beat', 'melody', 'arrange', 'export', ...(matchStudio ? [] : ['telephone'])];", 'workflow');
  app = replace(app, "export:'Export'};", "export:'Export', telephone:'Telephone'};", 'step names');
  app = replace(app, "export:'#b8f58b'};", "export:'#b8f58b',telephone:'#f4a8c7'};", 'step colors');
  app = replace(app, '  try { audio.volume =', '  if (!matchStudio) try { audio.volume =', 'personal master read');
  app = replace(app, '    revision++; lastExportAudio = null;', '    revision++; lastExportAudio = null;', 'change hook');
  app = replace(app, "$('save-state').textContent = 'Unsaved changes · keeping a browser draft';", "$('save-state').textContent = matchStudio ? 'Save your soundtrack from the shared room' : 'Unsaved changes · keeping a browser draft';", 'shared save label');
  app = replace(app, 'saveTimer = setTimeout(saveDraft, 900);', 'if (!matchStudio) saveTimer = setTimeout(saveDraft, 900);', 'draft scheduling');
  app = replace(app, '  async function saveDraft() {', '  async function saveDraft() {\n    if (matchStudio) return;', 'draft privacy');
  app = replace(app, 'function scopeForStep() { return ', "function scopeForStep() { if (ui.step === 'telephone') return 'song'; return ", 'Telephone playback');
  app = replace(app, 'const details = {sound:', "const details = {telephone:'Stories & shared songs',sound:", 'Telephone detail');
  app = replace(app, 'function sessionPath(){', "function sessionPath(){if(ui.step==='telephone')return '';", 'Telephone making path');
  let telephoneUI=await read(path.join(integration,'telephone-ui.js'));
  if(!sharedRooms){const start=telephoneUI.indexOf('  function openMatch('),end=telephoneUI.indexOf('  async function telephoneProject(',start);if(start<0||end<start)throw Error('Review the shared-room bridge boundary.');telephoneUI=telephoneUI.slice(0,start)+telephoneUI.slice(end);}
  app = replace(app, "const scrollMemory = new Map();", telephoneUI + '\n  const scrollMemory = new Map();', 'Telephone UI');
  app = replace(app, 'export:exportView}', 'export:exportView,telephone:telephoneView}', 'Telephone view');
  app = replace(app, 'renderNav(); renderTransport();', "renderNav(); renderTransport(); if(matchStudio)$('workflow').querySelector('[data-action=classic]')?.remove();", 'match navigation');
  app = replace(app, '  const actions={', "  const actions={\n    'telephone-refresh':()=>refreshTelephone(), 'telephone-select':b=>refreshTelephone(b.dataset.id),\n    'telephone-make':()=>telephoneProject(true), 'telephone-load':()=>telephoneProject(false), 'telephone-save':()=>saveTelephoneSoundtrack(),", 'Telephone actions');
  app = replace(app, 'try{localStorage.setItem(MASTER,e.target.value);}catch{}', 'if (!matchStudio) try{localStorage.setItem(MASTER,e.target.value);}catch{}', 'master write privacy');
  app = replace(app, 'if(revision&&savedVersion!==revision)', 'if(!matchStudio&&revision&&savedVersion!==revision)', 'shared room owns unsaved navigation');
  app = replace(app, '  try{const library=localStorage.getItem(LIBRARY);', '  if (!matchStudio) try{const library=localStorage.getItem(LIBRARY);', 'personal library privacy');
  app = replace(app, '  try{const recovery=localStorage.getItem(STORE);', '  if (!matchStudio) try{const recovery=localStorage.getItem(STORE);', 'personal draft privacy');
  app = replace(app, '  Promise.all([StudioStore.get(', '  if (!matchStudio) Promise.all([StudioStore.get(', 'personal voice bank privacy');
  app = replace(app, "setStep(steps.includes(location.hash.slice(1))?location.hash.slice(1):'sound');", "if (!matchStudio) try { p.library=C.W.prepareImport(p.library,C.W.validateBundle(window.DOT_STARTER_LIBRARY),()=>C.id('sound')).waves; } catch { announce('Import your sound library backup to recover its sounds.'); }\n  setStep(steps.includes(location.hash.slice(1))?location.hash.slice(1):matchStudio?'arrange':requestedTelephone?'telephone':'sound');", 'opening step');
  const versionMarker = app.match(/window\.DotWaveStudio=Object\.freeze\(\{version:'[^']+'/)?.[0];
  if(!versionMarker)throw Error('Review the Studio version API.');
  app = replace(app, versionMarker, "window.DotWaveStudio=Object.freeze({version:'"+version+"'", 'Studio version');
  app = replace(app, "snapshot:()=>C.serialize(p),", 'snapshot:()=>C.serialize(p),refreshTelephone,'+(sharedRooms?'...(matchStudio?{openMatch,snapshotMatch}:{}),':''), 'shared API');
  app = replace(app, 'revision,selected:[...ui.selected]', 'revision,selected:[...ui.selected],telephoneId:telephone.selected?.id||null', 'Telephone state');
  app = replace(app, '  // Read-only snapshot helpers', "  if (!matchStudio) { refreshTelephone(); if(window.DoodleBridge) DoodleBridge.watch(()=>refreshTelephone()); }\n  // Read-only snapshot helpers", 'shelf watcher');
  app = app.replaceAll('Dot-Wave-Classic.html','studio-classic.html').replaceAll('Third-party-notices.txt','studio-notices.txt');
  return app;
}

export async function importStudio(source, { checkOnly = false } = {}) {
  source = path.resolve(source);
  const pkg = JSON.parse(await read(path.join(source,'package.json')));
  if (pkg.name !== 'dot-wave-studio' || !/^2\.[0-9]+\.[0-9]+$/.test(pkg.version)) throw Error('Choose the canonical Dot Wave Studio source checkout.');
  const sharedRooms=await access(path.join(root,'keeper/private-telephone/service.mjs')).then(()=>true,error=>{if(error.code!=='ENOENT')throw error;return false;});
  const temporary = await mkdtemp(path.join(os.tmpdir(),'keeper-studio-import-'));
  try {
    execFileSync(process.execPath,[path.join(source,'build.cjs'),temporary],{stdio:'pipe'});
    const built = await read(path.join(temporary,'Dot-Wave-Studio-'+pkg.version+'.html'));
    const styles = [...built.matchAll(/<style>([\s\S]*?)<\/style>/g)];
    const scripts = [...built.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    if (styles.length !== 1 || scripts.length !== 1) throw Error('Review the standalone Studio bundle boundaries.');
    let main = scripts[0][1];
    const worker = main.match(/^window\.DOT_WORKER_SOURCE=(.*);$/m);
    if (!worker) throw Error('Review the embedded Studio worker boundary.');
    const workerSource = normalize(JSON.parse(worker[1]));
    main = replace(main,worker[0],"window.DOT_HOSTED_STUDIO=true;window.DOT_SHARED_STUDIO="+(sharedRooms?"new URLSearchParams(location.search).get('matchStudio')==='1'":'false')+";window.DOT_WORKER_URL=new URL('./studio-worker.js',document.currentScript.src).href;",'same origin worker');
    main = replace(main,'if (!window.Worker || !window.DOT_WORKER_SOURCE) return;', 'if (!window.Worker || (!window.DOT_WORKER_SOURCE && !window.DOT_WORKER_URL)) return;', 'hosted worker availability');
    main = replace(main, "this.workerURL = URL.createObjectURL(new Blob([window.DOT_WORKER_SOURCE], {type: 'text/javascript'}));\n      this.worker = new Worker(this.workerURL);", "if(window.DOT_WORKER_URL)this.worker=new Worker(window.DOT_WORKER_URL);else{this.workerURL=URL.createObjectURL(new Blob([window.DOT_WORKER_SOURCE],{type:'text/javascript'}));this.worker=new Worker(this.workerURL);}", 'hosted worker creation');
    main = replace(main, "function store(){try{localStorage.setItem('dot-woof-history-v1'", "function store(){if(window.DOT_SHARED_STUDIO)return;try{localStorage.setItem('dot-woof-history-v1'", 'shared WOOF history write');
    main = replace(main, "try{const data=localStorage.getItem('dot-woof-history-v1');", "try{const data=window.DOT_SHARED_STUDIO?null:localStorage.getItem('dot-woof-history-v1');", 'shared WOOF history read');
    const app = await read(path.join(source,'app.js'));
    main = replace(main,app,await adaptStudio(app,pkg.version,{sharedRooms}),'application source');
    main = replace(main,'\nclass DotAudio {','\n'+await read(path.join(integration,'telephone-score.js'))+'\nclass DotAudio {','Telephone generator');
    main = 'window.DOT_STARTER_LIBRARY='+JSON.stringify(JSON.parse(await read(path.join(integration,'starter-library.json'))))+';\n'+main;
    const html = built.replace(styles[0][0],'<link rel="stylesheet" href="./studio.css">').replace(scripts[0][0],'<script src="./doodle-bridge.js"></script>\n<script src="./studio-app.js"></script>');
    const destination = path.join(root,'keeper/public');
    await mkdir(destination,{recursive:true});
    let notices = await read(path.join(source,'Third-party-notices.txt'));
    notices += '\nKeeper distribution: the upstream sample credits are reproduced below.\n';
    for(const name of ['LICENSE.md','README.txt','sample-source-info.txt','SAMPLE-PROVENANCE.json'])notices += '\nSample-credits/'+name+'\n'+await read(path.join(source,'sample-credits',name));
    const payloads = {'studio.html':html,'studio-app.js':main,'studio-worker.js':workerSource,'studio.css':styles[0][1]+'\n'+await read(path.join(integration,'telephone.css')),'studio-classic.html':await read(path.join(source,'Dot-Wave-Classic.html')),'studio-notices.txt':notices};
    for(const [name,data] of Object.entries(payloads)){
      if(checkOnly){if(await readFile(path.join(destination,name),'utf8')!==data)throw Error('Studio import differs: '+name);}
      else await writeFile(path.join(destination,name),data);
    }
    console.log(JSON.stringify({version:pkg.version,assets:Object.entries(payloads).map(([name,data])=>({name,bytes:Buffer.byteLength(data),sha256:createHash('sha256').update(data).digest('hex')}))},null,2));
  } finally {
    if(path.dirname(path.resolve(temporary))!==path.resolve(os.tmpdir()) || !path.basename(temporary).startsWith('keeper-studio-import-'))throw Error('Unexpected temporary Studio build path.');
    await rm(temporary,{recursive:true,force:true});
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if(process.argv.length<3||process.argv.length>4||process.argv[3]&&process.argv[3]!=='--check')throw Error('Usage: node scripts/import-studio.mjs <Studio-source-checkout> [--check]');
  await importStudio(process.argv[2], {checkOnly:process.argv[3]==='--check'});
}
