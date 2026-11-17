/* Dot Wave / ShelfDEFENSE — shared waveform attack workbench. */
(() => {
  'use strict';
  const W=window.ShelfWaves,game=window.shelfGame;if(!W||!game)return;
  const $=id=>document.getElementById(id),overlay=$('wave-lab-overlay');if(!overlay)return;
  const keys=['waveA','waveB','cycles','amp','phase','duty','ratio','mix','frequency','envelope'];
  let custom=Array.from({length:64},(_,i)=>Math.sin(i/64*Math.PI*2)),seed=1729,draft=null,drawing=false,lastPoint=null,returnFocus=null;
  const ctx=$('wave-scope').getContext('2d');
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function status(message){$('wave-lab-status').textContent=message;}
  function read(){const d={name:$('wlab-name').value,custom,seed};for(const k of keys)d[k]=k==='waveA'||k==='waveB'?$('wlab-'+k).value:Number($('wlab-'+k).value);return W.normalize(d);}
  function apply(d){d=W.normalize(d);$('wlab-name').value=d.name;for(const k of keys)$('wlab-'+k).value=d[k];custom=[...(d.custom||custom)];seed=d.seed;update();}
  function draw(){
    const c=ctx,width=760,height=250,points=W.samples(draft,380);c.clearRect(0,0,width,height);c.fillStyle='#111e24';c.fillRect(0,0,width,height);c.lineWidth=1;c.strokeStyle='#a6ce9140';
    for(let x=20;x<width;x+=40){c.beginPath();c.moveTo(x,0);c.lineTo(x,height);c.stroke();}for(let y=25;y<height;y+=25){c.beginPath();c.moveTo(0,y);c.lineTo(width,y);c.stroke();}
    c.strokeStyle='#c5d6bf55';c.beginPath();c.moveTo(0,height/2);c.lineTo(width,height/2);c.stroke();
    c.shadowColor='#c7ec93';c.shadowBlur=12;c.strokeStyle='#c7ec93';c.lineWidth=2.5;c.beginPath();points.forEach((v,i)=>{const x=i/(points.length-1)*width,y=height/2-v*height*.43;i?c.lineTo(x,y):c.moveTo(x,y);});c.stroke();c.shadowBlur=0;
  }
  function update(){
    draft=read();const a=W.analyze(draft),b=a.combat;
    for(const k of keys){const el=$('wlab-'+k+'-value');if(el)el.textContent=k==='frequency'?`${draft[k]} Hz`:k==='envelope'?`${Math.round(draft[k]*1000)} ms`:k==='phase'?`${draft[k]}°`:k==='amp'||k==='mix'||k==='duty'?`${Math.round(draft[k]*100)}%`:`${draft[k]}×`;}
    $('wave-fingerprint').textContent=W.signature(draft);
    $('wave-combat-stats').innerHTML=[['POWER',b.damage],['FIRE SPEED',1/b.rate],['RANGE',b.range],['SHOT SPEED',b.projectileSpeed]].map(([name,value])=>`<div><span>${name}</span><strong>${value.toFixed(2)}×</strong></div>`).join('')+`<div><span>EXTRA SPLASH</span><strong>+${Math.round(b.splashAdd)} px</strong></div>`;
    $('wave-combat-description').textContent=`${draft.name}: ${b.damage>=1.04?'a heavier hit':b.damage<=.96?'a lighter, busier signal':'an even-tempered signal'}${b.rate<.98?', delivered more quickly':b.rate>1.02?', with a little more recovery time':''}. ${b.splashAdd>=4?'Its texture spreads impact across a small area.':'Its clean shape keeps the impact focused.'}`;
    $('wave-draw-hint').textContent=draft.waveA==='custom'?'Draw across the scope to sculpt one cycle. The same shape powers your attack and its tone.':'Mix two oscillators, or select Draw your wave to sketch a unique shape.';
    const selected=game.getSnapshot().selectedTower;
    $('wave-target').textContent=selected?`${selected.name} · level ${selected.level}`:'Select a defender on the shelf';
    $('wave-target-note').textContent=selected?'Applies to this tower’s next attacks. Its skills and weapon role still matter.':'You can listen and export now. Close the lab, select a placed tower, and open the lab again to equip.';
    $('wave-equip-btn').disabled=!selected;$('wave-stock-btn').disabled=!selected?.wave;draw();
    try{localStorage.setItem('shelfdefense.wave-draft.v1',W.exportPreset(draft));}catch{}
  }
  function open(){returnFocus=document.activeElement;game.pauseAll();const selected=game.getSnapshot().selectedTower;let d=selected?.wave;try{if(!d){const raw=localStorage.getItem('shelfdefense.wave-draft.v1');if(raw)d=W.importPreset(raw);}}catch{}if(!d)d=W.presets[0].wave;overlay.hidden=false;apply(d);status('Every shelf is paused while you shape this attack.');$('wave-lab-close').focus();}
  function close(){overlay.hidden=true;const target=(returnFocus?.id&&$(returnFocus.id))||$('wave-lab-open');target?.focus();}
  $('wave-lab-open')?.addEventListener('click',open);$('wave-lab-close').addEventListener('click',close);
  for(const k of keys)$('wlab-'+k).addEventListener('input',()=>{if(k==='waveA'&&$('wlab-waveA').value==='custom')$('wlab-cycles').value=1;update();});
  $('wlab-name').addEventListener('input',update);
  $('wave-presets').innerHTML=W.presets.map((p,i)=>`<button type="button" data-wave-preset="${i}" title="${esc(p.description)}">${esc(p.name)}</button>`).join('');
  $('wave-presets').querySelectorAll('[data-wave-preset]').forEach(el=>el.addEventListener('click',()=>{apply(W.presets[Number(el.dataset.wavePreset)].wave);status('Preset loaded. Make it your own.');}));
  $('wave-preview-btn').addEventListener('click',()=>{game.setSound(true);try{localStorage.setItem('shelfdefense-sound','true');}catch{}const ok=window.ShelfAudio?.previewWave(draft);status(ok?'Playing your waveform.':'Audio is unavailable here. The attack can still be equipped.');window.dispatchEvent(new Event('shelf-sound-enabled'));});
  $('wave-equip-btn').addEventListener('click',()=>{if(game.equipWave(draft)){status(`${draft.name} equipped. Close the lab and resume your shelves.`);update();}else status('Select a placed defender before equipping a waveform.');});
  $('wave-stock-btn').addEventListener('click',()=>{if(game.clearWave()){status('Stock attack restored. Your skills are unchanged.');update();}});
  $('wave-export-btn').addEventListener('click',()=>{const blob=new Blob([W.exportPreset(draft)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='dot-wave-'+W.signature(draft)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Attack preset exported. Import it here to reuse the same signal.');});
  $('wave-import-input').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>100000)throw Error('Choose an attack preset smaller than 100 KB.');apply(W.importPreset(await file.text()));status('Attack preset imported. Review it, then equip.');}catch(error){status(error.message||'That file is not a valid attack preset.');}e.target.value='';});
  function point(event){const box=$('wave-scope').getBoundingClientRect();return {i:Math.max(0,Math.min(63,Math.round((event.clientX-box.left)/box.width*63))),v:Math.max(-1,Math.min(1,(.5-(event.clientY-box.top)/box.height)/.43))};}
  function paint(event){const p=point(event);if(lastPoint){const lo=Math.min(lastPoint.i,p.i),hi=Math.max(lastPoint.i,p.i);for(let i=lo;i<=hi;i++){const t=hi===lo?1:(i-lastPoint.i)/(p.i-lastPoint.i);custom[i]=lastPoint.v+(p.v-lastPoint.v)*t;}}else custom[p.i]=p.v;lastPoint=p;update();}
  $('wave-scope').addEventListener('pointerdown',e=>{if($('wlab-waveA').value!=='custom')return;if(custom.length!==64){const p=custom;custom=Array.from({length:64},(_,i)=>{const at=i/64*p.length,j=Math.floor(at),f=at-j;return p[j]*(1-f)+p[(j+1)%p.length]*f;});}drawing=true;lastPoint=null;$('wave-scope').setPointerCapture(e.pointerId);paint(e);});
  $('wave-scope').addEventListener('pointermove',e=>{if(drawing)paint(e);});
  for(const name of ['pointerup','pointercancel'])$('wave-scope').addEventListener(name,()=>{drawing=false;lastPoint=null;});
  document.addEventListener('keydown',e=>{if(overlay.hidden)return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}if(e.key==='Tab'){const buttons=[...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary')];const first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
  window.ShelfWaveLab={open,close};
})();
