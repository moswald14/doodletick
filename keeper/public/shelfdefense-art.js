/* ShelfDEFENSE — original canvas illustrations. No external assets. */
(() => {
  'use strict';
  const palette = {pencil:'#7ecfa4',glue:'#cab1f2',band:'#efb96d',knight:'#eaa397',lamp:'#90c9e5'};
  const cache = new Map();
  function round(c,x,y,w,h,r,fill,stroke){c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.stroke();}}
  function circle(c,x,y,r,fill,stroke){c.beginPath();c.arc(x,y,r,0,Math.PI*2);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.stroke();}}
  function text(c,s,x,y,size,color,font='sans-serif'){c.font=`700 ${size}px ${font}`;c.fillStyle=color;c.fillText(s,x,y);}
  function book(c,x,y,w,h,color,label,tilt=0){
    c.save();c.translate(x,y);c.rotate(tilt);c.shadowColor='#38251e65';c.shadowBlur=8;c.shadowOffsetY=7;
    round(c,-w/2,-h/2,w,h,4,color);c.shadowColor='transparent';
    round(c,-w/2+5,-h/2+5,w-10,h-10,2,null,'#ffffff22');
    c.fillStyle='#00000020';c.fillRect(-w/2+6,-h/2,5,h);
    c.fillStyle='#ebd7af';c.fillRect(-w/2+5,h/2-7,w-10,4);
    c.fillStyle='#ffffff50';c.fillRect(-w/2+8,-h/2+12,w-16,2);
    if(label){c.save();c.rotate(-Math.PI/2);c.textAlign='center';text(c,label,0,3,Math.min(12,w*.23),'#f4e6cb','Georgia');c.restore();}
    c.restore();
  }
  function pot(c,x,y){c.save();c.translate(x,y);c.shadowColor='#231c2360';c.shadowBlur=7;c.shadowOffsetY=7;round(c,-18,-6,36,30,5,'#b9684e');c.shadowColor='transparent';round(c,-21,-9,42,9,3,'#d38a63');c.strokeStyle='#446951';c.lineWidth=5;c.beginPath();c.moveTo(0,-7);c.lineTo(0,-54);c.stroke();for(let i=0;i<4;i++){c.fillStyle=i%2?'#6e9666':'#8bb178';c.beginPath();c.ellipse((i%2?1:-1)*12,-20-i*10,16,7,i%2?-.65:.65,0,Math.PI*2);c.fill();}c.restore();}
  function staticBoard(c,{path,pads,mapIndex}){
    path=path.map(p=>Array.isArray(p)?p:[p.x,p.y]);
    const tones=[['#b28a60','#a37d54'],['#83908c','#74827f'],['#887383','#766274']][mapIndex%3];
    c.fillStyle=tones[0];c.fillRect(0,0,1200,700);
    for(let i=0;i<6;i++){
      const y=i*128-24;c.fillStyle=i%2?tones[1]:tones[0];c.fillRect(0,y,1200,128);
      c.fillStyle='#322a352a';c.fillRect(0,y+125,1200,3);c.fillStyle='#f8e0b81c';c.fillRect(0,y+128,1200,2);
      c.strokeStyle='#34292a10';c.lineWidth=1;
      for(let k=0;k<11;k++){const yy=y+12+k*10;c.beginPath();c.moveTo(0,yy);c.bezierCurveTo(320,yy-3,620,yy+4,1200,yy-2);c.stroke();}
    }
    const vignette=c.createRadialGradient(570,310,90,570,310,810);vignette.addColorStop(0,'#ffffff06');vignette.addColorStop(1,'#19222c65');c.fillStyle=vignette;c.fillRect(0,0,1200,700);
    c.strokeStyle='#3a292a66';c.lineWidth=14;c.strokeRect(-1,-1,1202,702);c.strokeStyle='#e8c69044';c.lineWidth=2;c.strokeRect(8,8,1184,684);
    // Books and tiny personal belongings sit at the edges of the battlefield.
    book(c,45,48,38,86,'#5d716d','FIELD NOTES',-.16);book(c,88,39,37,92,'#59677c','VOLUME II',-.08);
    book(c,1004,52,46,98,'#576b5d','BOTANY',.12);book(c,1054,50,42,96,'#a77356','ODYSSEY',.12);
    book(c,1104,47,43,93,'#626c87','STARS',.12);pot(c,1153,71);
    book(c,87,649,115,54,'#586d79','SMALL WONDERS',-.04);book(c,95,627,110,43,'#8d5f58','STORIES',.04);
    book(c,711,653,107,52,'#6e7460','MAGIC FOR BEGINNERS',.06);
    c.save();c.translate(850,650);c.rotate(-.08);round(c,-46,-22,92,44,3,'#dbcda7');c.strokeStyle='#b4aa903f';for(let i=-9;i<13;i+=7){c.beginPath();c.moveTo(-32,i);c.lineTo(30,i);c.stroke();}text(c,'save the shelf!',-36,-5,9,'#715b4a');c.restore();
    c.save();c.translate(578,589);c.rotate(.32);round(c,-6,-35,12,70,2,'#ceaf6c');c.fillStyle='#e9c781';c.beginPath();c.moveTo(-6,-35);c.lineTo(0,-50);c.lineTo(6,-35);c.fill();c.fillStyle='#4f4541';c.beginPath();c.moveTo(-2,-45);c.lineTo(0,-50);c.lineTo(2,-45);c.fill();round(c,-6,27,12,9,1,'#cd8d8a');c.restore();
    for(const [x,y] of [[340,550],[951,578],[931,59]]){circle(c,x,y,7,'#a98958','#d2b77b');circle(c,x,y,3,'#534638');}
    // A linen bookmark becomes the enemy lane.
    function strokePath(color,width){c.beginPath();path.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.lineJoin='round';c.lineCap='round';c.lineWidth=width;c.strokeStyle=color;c.stroke();}
    c.save();c.shadowColor='#251c2855';c.shadowOffsetY=7;c.shadowBlur=10;strokePath('#6f523b',72);c.shadowColor='transparent';strokePath('#dac599',66);strokePath('#e0cea8',57);
    c.setLineDash([2,9]);strokePath('#a6926c55',47);c.setLineDash([]);strokePath('#e3d2ad',43);
    c.setLineDash([4,15]);strokePath('#a8997b55',2);c.setLineDash([]);c.restore();
    // Metal washers are the build slots; all are visible before selection.
    for(const p of pads){const x=Array.isArray(p)?p[0]:p.x,y=Array.isArray(p)?p[1]:p.y;c.save();c.translate(x,y);circle(c,0,4,28,'#332e332d');circle(c,0,0,27,'#233b3a45','#e5d4a95f');c.setLineDash([3,5]);c.lineWidth=1.5;circle(c,0,0,22,null,'#f2e5c47a');c.setLineDash([]);c.strokeStyle='#e8dcc060';c.lineWidth=2;c.beginPath();c.moveTo(-5,0);c.lineTo(5,0);c.moveTo(0,-5);c.lineTo(0,5);c.stroke();c.restore();}
    c.save();c.translate(31,path[0][1]);round(c,-22,-16,44,32,6,'#283a38');c.textAlign='center';text(c,'IN',0,4,10,'#d7c599');c.restore();
    // Shelf number plaque.
    round(c,30,575,100,25,3,'#332c2a55');text(c,`SHELF 0${mapIndex+1}`,43,591,10,'#dfcda4');
  }
  function drawBackground(c,opts){
    const key=opts.mapIndex+':'+JSON.stringify(opts.path);let layer=cache.get(key);
    if(!layer){layer=document.createElement('canvas');layer.width=1200;layer.height=700;staticBoard(layer.getContext('2d'),opts);cache.set(key,layer);}
    c.drawImage(layer,0,0);
    // Floating motes move slowly above the wooden shelf.
    c.save();for(let i=0;i<19;i++){const t=(opts.time||0);let x=(i*197+Math.sin(t*.18+i)*17)%1200;let y=(i*113-t*3+700000)%700;c.globalAlpha=.12+.1*Math.sin(t+i);circle(c,x,y,1.3,'#fff2d5');}c.restore();
  }
  function drawTower(c,t,{selected=false,hover=false,time=0}={}){
    const col=palette[t.type]||'#aed7a4';c.save();c.translate(t.x,t.y);
    c.shadowColor='#241d3270';c.shadowBlur=10;c.shadowOffsetY=8;circle(c,0,3,25,'#4e4c45');c.shadowColor='transparent';circle(c,0,0,24,'#e1d0ad');circle(c,0,0,19,'#6b7770');circle(c,0,0,16,col);
    for(let i=0;i<4;i++){let a=i*Math.PI/2+.7;circle(c,Math.cos(a)*20,Math.sin(a)*20,1.5,'#7e7967');}
    c.save();c.rotate(Number.isFinite(t.angle)?t.angle:0);
    if(t.type==='pencil'){
      round(c,-13,-9,28,18,5,'#52675d','#d1ddba');round(c,-3,-5,32,10,2,'#e5ae5c');c.fillStyle='#ffe6b5';c.beginPath();c.moveTo(29,-5);c.lineTo(40,0);c.lineTo(29,5);c.fill();c.fillStyle='#3f4742';c.beginPath();c.moveTo(36,-2);c.lineTo(40,0);c.lineTo(36,2);c.fill();round(c,0,-2,28,2,0,'#f9d38a');round(c,-8,-5,7,10,1,'#b7827d');circle(c,-8,0,6,'#507b61');
    } else if(t.type==='glue'){
      c.rotate(Math.PI/2);round(c,-12,-15,24,35,7,'#e8dfc7','#c9b8d8');round(c,-11,-3,22,16,2,'#9a81c0');text(c,'G',-4,9,11,'#f4e5d6');round(c,-6,-21,12,10,2,'#b89bd6');c.fillStyle='#d1bce8';c.beginPath();c.moveTo(-3,-21);c.lineTo(0,-33);c.lineTo(3,-21);c.fill();
    } else if(t.type==='band'){
      c.strokeStyle='#714d35';c.lineWidth=9;c.lineCap='round';c.beginPath();c.moveTo(-10,0);c.lineTo(4,0);c.lineTo(15,-15);c.moveTo(4,0);c.lineTo(15,15);c.stroke();c.strokeStyle='#f4cc83';c.lineWidth=3;c.beginPath();c.moveTo(15,-15);c.lineTo(-4,0);c.lineTo(15,15);c.stroke();circle(c,-4,0,5,'#7d8f7a');circle(c,15,-15,3,'#c09258');circle(c,15,15,3,'#c09258');
    } else if(t.type==='knight'){
      round(c,-12,-15,25,30,7,'#9aa8ac','#dee5d9');round(c,0,-12,15,24,4,'#d8ddcf');round(c,3,-7,12,4,1,'#344447');c.strokeStyle='#647a7b';c.lineWidth=1.5;for(let k=0;k<3;k++){c.beginPath();c.moveTo(6+k*3,1);c.lineTo(6+k*3,8);c.stroke();}round(c,-6,-21,5,12,2,'#d68f83');c.fillStyle='#e4b0a0';c.beginPath();c.moveTo(-5,-21);c.quadraticCurveTo(-14,-30,-19,-20);c.lineTo(-5,-17);c.fill();c.strokeStyle='#eee6cd';c.lineWidth=5;c.beginPath();c.moveTo(20,-12);c.lineTo(33,-22);c.stroke();c.strokeStyle='#b99561';c.lineWidth=4;c.beginPath();c.moveTo(20,-21);c.lineTo(27,-13);c.stroke();
    } else {
      circle(c,-6,0,9,'#657e85');c.strokeStyle='#475e64';c.lineWidth=6;c.beginPath();c.moveTo(-6,0);c.lineTo(5,-13);c.lineTo(16,0);c.stroke();c.fillStyle='#8cb6c7';c.beginPath();c.moveTo(12,-13);c.lineTo(29,-19);c.lineTo(29,19);c.lineTo(12,12);c.closePath();c.fill();c.fillStyle='#f5e9a7';c.beginPath();c.ellipse(29,0,5,19,0,0,Math.PI*2);c.fill();circle(c,3,-11,4,'#b3cfce');
    }
    c.restore();
    if(t.level>1){round(c,-17,21,34,13,5,'#243b3a');c.textAlign='center';text(c,'★'.repeat(Math.min(3,t.level-1)),0,31,8,'#f6d28c');}
    if(Array.isArray(t.skills))for(const [i,skill] of t.skills.slice(0,2).entries()){
      const a=time*.7+i*Math.PI-.65,x=Math.cos(a)*31,y=Math.sin(a)*31;
      c.save();c.translate(x,y);c.shadowBlur=7;c.shadowColor=i?'#a3e1dd':'#f8d58f';
      circle(c,0,0,5,'#344f4a',i?'#a3e1dd':'#f8d58f');
      if(skill==='reach'){circle(c,0,0,2,null,'#c4f0e8');}else{c.fillStyle='#f8d58f';c.beginPath();c.moveTo(0,-3);c.lineTo(3,0);c.lineTo(0,3);c.lineTo(-3,0);c.closePath();c.fill();}c.restore();
    }
    if(selected){c.lineWidth=2;circle(c,0,0,31,null,'#e5f6b1');circle(c,0,0,35,null,'#e5f6b155');}c.restore();
  }
  function drawEnemy(c,e,{time=0}={}){
    c.save();c.translate(e.x,e.y);const boss=e.type==='boss';let r=e.r|| (boss?24:13);if(boss)r=Math.max(r,23);const bob=Math.sin(time*10+(e.id||0))*1.7;
    c.scale(1+Math.sin(time*9+(e.id||0))*.025,1);circle(c,0,7,r*.95,'#3b343e33');c.translate(0,bob-(e.type==='moth'?12:2));
    if(e.type==='moth'){
      // Folded paper wings flutter above the lane; their silhouette stays readable.
      const flap=.53+.31*Math.sin(time*21+(e.id||0));
      for(const side of [-1,1]){
        c.save();c.scale(side,1);c.translate(2,0);c.scale(flap+0.4,1);
        c.fillStyle='#ad96ce';c.strokeStyle='#dcc8ed';c.lineWidth=1;
        c.beginPath();c.moveTo(0,-1);c.lineTo(r*1.48,-r*.95);c.quadraticCurveTo(r*1.85,-r*.3,r*1.18,r*.15);c.lineTo(r*.94,r*.81);c.lineTo(0,r*.43);c.closePath();c.fill();c.stroke();
        c.strokeStyle='#79689a';c.beginPath();c.moveTo(0,0);c.lineTo(r*1.3,-r*.55);c.moveTo(2,2);c.lineTo(r*.85,r*.55);c.stroke();
        circle(c,r*.98,-r*.32,3,'#dfc985');c.restore();
      }
      c.fillStyle='#77708e';c.beginPath();c.ellipse(0,1,r*.44,r*.85,0,0,Math.PI*2);c.fill();circle(c,0,-r*.43,r*.52,'#c3b1dc');
      c.strokeStyle='#d8c7e9';c.lineWidth=1.4;c.beginPath();c.moveTo(-3,-r*.7);c.lineTo(-8,-r*1.16);c.moveTo(3,-r*.7);c.lineTo(8,-r*1.16);c.stroke();
    } else if(e.type==='inkling'){
      c.fillStyle='#304f59';c.beginPath();for(let i=0;i<18;i++){const a=i*Math.PI/9,rr=r*(.88+.16*Math.sin(i*3+time*4));c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}c.closePath();c.fill();
      circle(c,-r*.12,-r*.15,r*.72,'#46717b');circle(c,-r*.35,-r*.44,r*.15,'#84aba7');
      for(let i=0;i<3;i++){const a=time*1.2+i*2.1;circle(c,Math.cos(a)*(r+6),Math.sin(a)*(r+2),2+i*.4,'#355d68');}
      c.strokeStyle='#29454d';c.lineWidth=4;c.lineCap='round';c.beginPath();c.moveTo(-r*.55,r*.5);c.lineTo(-r*.9,r*.9);c.moveTo(r*.4,r*.6);c.lineTo(r*.72,r*.98);c.stroke();
    } else if(e.type==='binder'){
      for(const side of [-1,1]){c.strokeStyle='#4d5551';c.lineWidth=2.5;c.lineCap='round';for(let i=0;i<3;i++){const y=-r*.5+i*r*.5;c.beginPath();c.moveTo(side*r*.55,y);c.lineTo(side*r*1.1,y+3);c.stroke();}}
      round(c,-r*.76,-r*.72,r*1.52,r*1.55,4,'#b3975c','#ecd69b');
      round(c,-r*.53,-r*.55,r*1.06,r*1.18,3,'#72776a');
      c.strokeStyle='#d8cfac';c.lineWidth=2.5;c.beginPath();c.moveTo(-r*.48,-r*.7);c.lineTo(-r*.48,-r*1.23);c.quadraticCurveTo(0,-r*1.62,r*.48,-r*1.23);c.lineTo(r*.48,-r*.7);c.stroke();
      c.fillStyle='#bfa36a';c.beginPath();c.moveTo(0,r*.12);c.lineTo(r*.55,r*.32);c.lineTo(r*.45,r*.83);c.lineTo(0,r*1.1);c.lineTo(-r*.45,r*.83);c.lineTo(-r*.55,r*.32);c.closePath();c.fill();c.strokeStyle='#f0d7a0';c.lineWidth=1;c.stroke();
      if((e.shieldHp||0)>0){c.save();c.globalAlpha=.45+.13*Math.sin(time*5);c.strokeStyle='#f2d88a';c.lineWidth=2;c.beginPath();c.ellipse(0,0,r+7,r+10,0,0,Math.PI*2);c.stroke();c.restore();}
    } else if(e.type==='nurse'){
      c.fillStyle='#527d69';c.beginPath();for(let i=0;i<14;i++){const a=i*Math.PI/7,rr=r*(i%2?.88:1.08);c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}c.closePath();c.fill();circle(c,0,0,r*.82,'#8eb78a');
      round(c,-r*.7,-r*.89,r*1.4,r*.48,3,'#e2e4c6');c.fillStyle='#638c70';c.fillRect(-2,-r*.84,4,r*.35);c.fillRect(-5,-r*.72,10,3);
      c.strokeStyle='#cfb58b';c.lineWidth=2.5;c.beginPath();c.moveTo(-r*.6,-r*.1);c.lineTo(r*.6,r*.8);c.stroke();round(c,r*.2,r*.37,r*.7,r*.57,2,'#c5ad7d','#e5d0a0');c.fillStyle='#627f63';c.fillRect(r*.45,r*.45,2,r*.34);c.fillRect(r*.33,r*.57,r*.36,2);
      if((e.healFlash||0)>0){c.save();c.globalAlpha=Math.min(.65,e.healFlash);circle(c,0,0,r+9+(1-e.healFlash)*13,null,'#b3edaa');c.restore();}
      for(let i=0;i<2;i++){const a=time*.9+i*Math.PI,y=-r-5-((time*8+i*8)%14),x=Math.sin(a)*10;c.save();c.globalAlpha=.38;c.fillStyle='#c3e8ae';c.fillRect(x-1.2,y-3,2.4,6);c.fillRect(x-3,y-1.2,6,2.4);c.restore();}
    } else if(e.type==='crumb'){
      c.fillStyle='#af9168';c.beginPath();for(let i=0;i<9;i++){const a=i*Math.PI*2/9,rr=r*(i%2?.85:1.1);c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}c.closePath();c.fill();circle(c,-1,-1,r*.75,'#d8bf91');circle(c,-r*.35,-r*.38,1.2,'#f1deac');
    } else if(e.type==='bookworm'||e.type==='worm'){
      for(let i=3;i>=0;i--)circle(c,-i*6,Math.sin(time*12-i)*2,r*(.7+i*.04),i%2?'#889c75':'#9bb185','#5f775e');circle(c,0,0,r,'#acbf8a');
    } else if(e.type==='armored'||e.type==='armor') {
      c.fillStyle='#718188';c.beginPath();for(let i=0;i<6;i++){let a=i*Math.PI/3;c.lineTo(Math.cos(a)*(r+3),Math.sin(a)*(r+3));}c.closePath();c.fill();c.strokeStyle='#c5cac0';c.lineWidth=2;c.stroke();circle(c,0,0,r*.7,'#4b6569');
    } else {
      const colors=boss?['#876a9b','#a082b5']:e.type==='fast'?['#b98a65','#d1ab7f']:['#647778','#8c9a90'];
      c.fillStyle=colors[0];c.beginPath();for(let i=0;i<16;i++){let a=i*Math.PI/8,rr=r*(i%2?.87:1.15);c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}c.closePath();c.fill();circle(c,0,0,r*.83,colors[1]);
      if(boss){c.fillStyle='#f3ce84';c.beginPath();c.moveTo(-r*.6,-r*.65);c.lineTo(-r*.75,-r*1.5);c.lineTo(-r*.2,-r*1.2);c.lineTo(0,-r*1.65);c.lineTo(r*.3,-r*1.2);c.lineTo(r*.75,-r*1.5);c.lineTo(r*.6,-r*.65);c.closePath();c.fill();}
    }
    const eye=Math.max(e.type==='crumb'?1.8:2.8,r*.19);circle(c,-r*.31,-2,eye,'#fff9dc');circle(c,r*.31,-2,eye,'#fff9dc');circle(c,-r*.25,-1,eye*.43,'#293e41');circle(c,r*.37,-1,eye*.43,'#293e41');
    c.strokeStyle='#384b47';c.lineWidth=1.5;c.beginPath();c.moveTo(-3,r*.35);c.quadraticCurveTo(0,r*.22,3,r*.35);c.stroke();
    c.restore();
  }
  function drawBase(c,{x,y,lives,time=0}){
    c.save();c.translate(x-30,y);circle(c,0,8,38,'#24352b35');book(c,0,12,58,34,'#5b8068','',0);book(c,-4,-8,60,24,'#c28d64','',-.04);book(c,0,-26,54,17,'#5e6c8e','',.04);c.strokeStyle='#edd9ab';c.lineWidth=3;c.beginPath();c.moveTo(2,-32);c.lineTo(2,-73);c.stroke();c.fillStyle=lives>5?'#aaca7d':'#e49a83';c.beginPath();c.moveTo(3,-73);c.lineTo(30,-65+Math.sin(time*3)*2);c.lineTo(3,-55);c.closePath();c.fill();c.restore();
  }
  window.ShelfArt={drawBackground,drawTower,drawEnemy,drawBase,palette};
})();
