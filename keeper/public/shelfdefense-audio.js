/* ShelfDEFENSE — original, optional Web Audio sound effects. No sound files. */
(() => {
  'use strict';
  const MAX_VOICES=24;
  const EVENTS=Object.freeze(['shot','build','upgrade','skill','sell','hit','kill','shield','split','heal','ability','wave','boss','win','lose']);
  const INTERVALS={shot:.075,build:.08,upgrade:.12,skill:.12,sell:.08,hit:.085,kill:.1,shield:.1,split:.14,heal:.22,ability:.5,wave:.45,boss:.75,win:1,lose:1};
  let enabled=false,volume=.58,context=null,output=null,noiseBuffer=null;
  const voices=new Set(),lastPlayed=new Map();

  function disconnect(voice){
    voices.delete(voice);
    for(const node of voice.nodes)try{node.disconnect();}catch{}
  }
  function stopVoices(){
    for(const voice of [...voices]){try{voice.source.stop();}catch{}disconnect(voice);}
  }
  function ensureContext(){
    if(context?.state==='closed'){context=null;output=null;noiseBuffer=null;voices.clear();lastPlayed.clear();}
    if(!context){
      const AudioContext=window.AudioContext||window.webkitAudioContext;
      if(!AudioContext)return null;
      try{
        context=new AudioContext();
        const master=context.createGain();master.gain.setValueAtTime(volume,context.currentTime);
        // A gentle compressor catches dense combat without raising quiet sounds.
        if(context.createDynamicsCompressor){
          const compressor=context.createDynamicsCompressor();
          compressor.threshold.setValueAtTime(-18,context.currentTime);
          compressor.knee.setValueAtTime(12,context.currentTime);
          compressor.ratio.setValueAtTime(4,context.currentTime);
          compressor.attack.setValueAtTime(.004,context.currentTime);
          compressor.release.setValueAtTime(.14,context.currentTime);
          compressor.connect(master);output={input:compressor,master};
        }else output={input:master,master};
        master.connect(context.destination);
      }catch{context=null;output=null;return null;}
    }
    if(context.state==='suspended')try{const resuming=context.resume();if(resuming?.catch)resuming.catch(()=>{});}catch{}
    return context;
  }
  function prune(now){for(const voice of [...voices])if(voice.end<=now){try{voice.source.stop();}catch{}disconnect(voice);}}
  function envelope(gain,start,duration,peak){
    gain.gain.setValueAtTime(.0001,start);
    gain.gain.linearRampToValueAtTime(Math.max(.0001,peak),start+Math.min(.007,duration*.15));
    gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
  }
  function register(source,nodes,start,duration){
    const voice={source,nodes,end:start+duration+.03};voices.add(voice);
    source.onended=()=>disconnect(voice);
    try{source.start(start);source.stop(start+duration+.025);return 1;}catch{disconnect(voice);return 0;}
  }
  function tone(frequency,endFrequency,duration=.1,kind='sine',peak=.05,delay=0){
    if(voices.size>=MAX_VOICES)return 0;
    const start=context.currentTime+delay,oscillator=context.createOscillator(),gain=context.createGain();
    oscillator.type=kind;oscillator.frequency.setValueAtTime(frequency,start);
    if(endFrequency!==frequency)oscillator.frequency.exponentialRampToValueAtTime(Math.max(20,endFrequency),start+duration);
    envelope(gain,start,duration,peak);oscillator.connect(gain);gain.connect(output.input);
    return register(oscillator,[oscillator,gain],start,duration);
  }
  function noise(duration=.06,peak=.025,frequency=1800,filterType='bandpass',delay=0){
    if(voices.size>=MAX_VOICES)return 0;
    if(!noiseBuffer){
      noiseBuffer=context.createBuffer(1,Math.ceil(context.sampleRate*.6),context.sampleRate);
      const data=noiseBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
    }
    const start=context.currentTime+delay,source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();
    source.buffer=noiseBuffer;filter.type=filterType;filter.frequency.setValueAtTime(frequency,start);filter.Q.setValueAtTime(.7,start);
    envelope(gain,start,duration,peak);source.connect(filter);filter.connect(gain);gain.connect(output.input);
    return register(source,[source,filter,gain],start,duration);
  }
  function notes(frequencies,{delay=0,spacing=.08,duration=.13,peak=.035,kind='triangle'}={}){
    let count=0;frequencies.forEach((frequency,index)=>count+=tone(frequency,frequency*.98,duration,kind,peak,delay+index*spacing));return count;
  }
  function waveTone(input){
    const model=window.ShelfWaves;
    if(!input||typeof input!=='object'||!model?.normalize||!model?.samples)return null;
    try{
      const descriptor=model.normalize(input),values=model.samples(descriptor,256);
      if(!Array.isArray(values)||values.length<16||values.length>2048||!values.every(value=>typeof value==='number'&&Number.isFinite(value)))return null;
      if(voices.size>=MAX_VOICES)return 0;
      const rate=context.sampleRate;if(!Number.isFinite(rate)||rate<=0)return null;
      const frequency=Math.max(80,Math.min(1200,Number(descriptor.frequency)||300));
      const duration=Math.max(.08,Math.min(.65,Number(descriptor.envelope)||.2));
      const cycles=Math.max(.5,Math.min(8,Number(descriptor.cycles)||2));
      const bounded=values.map(value=>Math.max(-1,Math.min(1,value)));
      const mean=bounded.reduce((sum,value)=>sum+value,0)/bounded.length;
      const centered=bounded.map(value=>value-mean),peak=Math.max(...centered.map(Math.abs));
      if(peak<.00001)return 0;
      const buffer=context.createBuffer(1,centered.length,rate),data=buffer.getChannelData(0);
      const scale=1/Math.max(1,peak);for(let i=0;i<data.length;i++)data[i]=centered[i]*scale;
      const start=context.currentTime,source=context.createBufferSource(),gain=context.createGain();
      source.buffer=buffer;source.loop=true;
      source.playbackRate.setValueAtTime(frequency*(centered.length/rate)/cycles,start);
      // The same samples drive the trace and tone. Remove DC and soften the
      // onset/release so a hand-drawn edge does not create a loud click.
      envelope(gain,start,duration,.055);
      const filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.setValueAtTime(Math.min(rate*.42,Math.max(1800,frequency*9)),start);filter.Q.setValueAtTime(.45,start);
      source.connect(filter);filter.connect(gain);gain.connect(output.input);
      return register(source,[source,filter,gain],start,duration);
    }catch{return null;}
  }
  function shot(type){
    switch(type){
      case 'pencil':return tone(1420,630,.055,'triangle',.035)+noise(.025,.018,3300,'highpass');
      case 'glue':return tone(185,64,.16,'sine',.10)+tone(300,125,.075,'sine',.045,.022);
      case 'band':return tone(310,92,.16,'triangle',.085)+tone(620,184,.10,'sine',.025,.008);
      case 'knight':return tone(560,280,.105,'triangle',.055)+tone(1120,760,.055,'square',.012)+noise(.035,.015,2600);
      case 'lamp':return tone(1050,1770,.085,'sine',.026)+tone(525,885,.085,'sine',.017);
      default:return tone(500,340,.065,'triangle',.025);
    }
  }
  function cue(event,details){
    switch(event){
      case 'shot':{const custom=details.wave?waveTone(details.wave):null;return custom===null?shot(details.type):custom;}
      case 'build':return noise(.065,.05,650,'lowpass')+tone(220,165,.11,'triangle',.065)+tone(440,420,.07,'sine',.028,.045);
      case 'upgrade':return notes([523.25,659.25,783.99],{spacing:.065,duration:.19,peak:.04})+tone(1046.5,1046.5,.24,'sine',.025,.14);
      case 'skill':return notes([659.25,783.99,987.77,1318.5],{spacing:.05,duration:.18,peak:.035});
      case 'sell':return notes([440,330,220],{spacing:.055,duration:.10,peak:.035});
      case 'hit':return noise(.025,.012,2200)+tone(145,110,.035,'sine',.025);
      case 'kill':return tone(430,720,.07,'triangle',.03)+noise(.035,.014,1300);
      case 'shield':return tone(960,850,.075,'triangle',.04)+tone(205,170,.09,'sine',.045);
      case 'split':return notes([170,250,340],{spacing:.045,duration:.09,peak:.045,kind:'sine'});
      case 'heal':return notes([740,987.77],{spacing:.095,duration:.22,peak:.027,kind:'sine'});
      case 'ability':return noise(.38,.08,700,'lowpass')+tone(85,35,.40,'triangle',.11)+tone(220,880,.2,'sine',.04,.03);
      case 'wave':return notes([261.63,329.63,392],{spacing:.09,duration:.17,peak:.045});
      case 'boss':return notes([92.5,82.41,61.74],{spacing:.17,duration:.3,peak:.055,kind:'triangle'})+tone(46.25,30.87,.58,'sawtooth',.035)+noise(.3,.04,200,'lowpass');
      case 'win':return notes([261.63,329.63,392],{spacing:0,duration:.60,peak:.035})+notes([523.25,659.25,783.99,1046.5],{delay:.12,spacing:.15,duration:.27,peak:.04});
      case 'lose':return notes([392,329.63,261.63,196],{spacing:.16,duration:.29,peak:.04})+tone(98,73.42,.6,'sine',.04,.2);
      default:return 0;
    }
  }
  const api={
    events:EVENTS,
    get enabled(){return enabled;},
    get volume(){return volume;},
    setEnabled(value){enabled=!!value;if(!enabled){stopVoices();lastPlayed.clear();}return enabled;},
    setVolume(value){const requested=Number(value);if(Number.isFinite(requested))volume=Math.max(0,Math.min(1,requested));if(output&&context)try{output.master.gain.setTargetAtTime(volume,context.currentTime,.02);}catch{}if(volume===0)stopVoices();return volume;},
    previewWave(descriptor){
      if(!enabled||volume===0||!window.ShelfWaves?.samples)return false;
      try{
        if(!ensureContext())return false;
        const now=context.currentTime;prune(now);
        if(now-(lastPlayed.get('wave-preview')??-Infinity)<.16||voices.size>=MAX_VOICES)return false;
        const count=waveTone(descriptor);if(count>0)lastPlayed.set('wave-preview',now);return count>0;
      }catch{return false;}
    },
    play(event,details={}){
      if(!enabled||volume===0||!EVENTS.includes(event))return false;
      try{
        if(!ensureContext())return false;
        const now=context.currentTime;prune(now);
        const kind=details&&typeof details==='object'?details:{};
        const key=event==='shot'?event+':'+(kind.type||'default'):event;
        const interval=event==='shot'&&kind.type==='lamp'?.11:INTERVALS[event];
        if(now-(lastPlayed.get(key)??-Infinity)<interval||voices.size>=MAX_VOICES)return false;
        const count=cue(event,kind);if(count)lastPlayed.set(key,now);return count>0;
      }catch{return false;}
    }
  };
  window.ShelfAudio=Object.freeze(api);
})();
