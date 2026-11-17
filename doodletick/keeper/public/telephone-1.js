
    const moduleDefs=[
      ["WORD GEN","#27e2ff","Turns the seed into loaded vocabulary."],
      ["CHARACTER GEN","#ff3e9d","Makes a person out of the words."],
      ["DESIRE-O-VISION","#ffe12c","Finds what they want and pictures it."],
      ["POEM GEN","#a572ff","Turns the person into four bad lines."],
      ["RIDICULATOR","#ff8a34","Exposes bait-and-switch gaps while keeping the source and unknowns visible."],
      ["SAUCE RACK","#ff3e9d","Herb + liquid + powder + vapor."],
      ["GLITCH / ZALGO","#27e2ff","Does typographic property damage."],
      ["EMOJI TRANSLATOR","#ffe12c","Replaces dignity with pictograms."],
      ["ASCII FACTORY","#a572ff","Flattens reality into characters."],
      ["TELEPHONE","#70ff8d","Misremembers what just happened."],
      ["GET-IT : GOT-IT","#ff8a34","Implication becomes canon. No appeals."],
      ["HIVEMIND","#70ff8d","Many wrong brains merge into one stronger wrong brain."],
      ["STORY // EXIT","#ffe12c","Everything becomes one story. Nothing comes back out except the story."]
    ];
    const chain=document.querySelector("#chain");
    moduleDefs.forEach((m,i)=>{
      const d=document.createElement("div"); d.className="module on"; d.style.setProperty("--c",m[1]);
      d.innerHTML='<div class="module-title"><span><span class="num">'+String(i+1).padStart(2,"0")+'</span> '+m[0]+'</span><button class="toggle" aria-label="Toggle '+m[0]+'" aria-pressed="true"><span></span></button></div><p>'+m[2]+'</p><input class="tiny-range" aria-label="'+m[0]+' intensity" type="range" min="0" max="100" value="'+(50+(i*7)%49)+'">';
      const toggle=d.querySelector(".toggle");
      if(i===moduleDefs.length-1){toggle.disabled=true;toggle.title="HARDWIRED EXIT";toggle.setAttribute("aria-label","STORY EXIT is hardwired on")}
      else toggle.onclick=e=>{d.classList.toggle("on");e.currentTarget.setAttribute("aria-pressed",d.classList.contains("on"))};
      chain.appendChild(d);
    });
    document.querySelectorAll(".chip").forEach(b=>b.onclick=()=>{document.querySelector("#seed").value=b.dataset.seed;renderFour(b.dataset.seed)});
    const damage=document.querySelector("#damage"); damage.oninput=()=>document.querySelector("#damageVal").textContent=damage.value+"%";
    const characterLens=document.querySelector("#characterLens"),manualIdentityFields=document.querySelector("#manualIdentityFields");
    characterLens.onchange=()=>{manualIdentityFields.hidden=characterLens.value!=="manual"};
    const pick=a=>a[Math.floor(Math.random()*a.length)];
    const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
    const hash=s=>[...s].reduce((a,c)=>((a<<5)-a+c.charCodeAt(0))|0,1779033703)>>>0;
    function mulberry32(a){return function(){let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
    function extract(seed){
      const stop=new Set("a an the and or but if it is was are were be been being to of in on at for from with by that this can could would should who someone something has have had one some into its their his her".split(" "));
      return seed.toLowerCase().replace(/[^a-z0-9' -]/g,"").split(/\s+/).filter(w=>w.length>2&&!stop.has(w));
    }
    function interpretFour(raw){
      const text=String(raw??"").trim();if(!text)return{literal:"Waiting for words.",subjective:"Waiting for a point of view.",symbolic:"Waiting for symbols.",back:"Waiting to walk it backwards.",bus:""};
      const short=text.length>320?text.slice(0,317)+"…":text,lower=text.toLowerCase(),cues=[];
      if(/\b(i|i'm|im|me|my|mine|we|our|us)\b/i.test(text))cues.push("FIRST-PERSON");
      if(/\b(see|hear|taste|smell|feel|felt|touch|dizz|spin|balance|bright|dark|loud|quiet|pain|hurt|cold|hot)\w*\b/i.test(text))cues.push("BODY / SENSORY");
      if(/\b(think|believe|remember|imagine|dream|seem|maybe|perhaps|guess)\w*\b/i.test(text))cues.push("MIND / MEMORY / UNCERTAINTY");
      if(/\b(love|hate|angry|mad|sad|happy|afraid|fear|calm|lonely|hurt)\w*\b/i.test(text))cues.push("EMOTION");
      if(/\b(always|never|forever|everything|nothing|everyone|nobody|infinite|eternal)\b/i.test(text))cues.push("TOTAL / INFINITE LANGUAGE");
      const symbols=[];
      const add=(re,label)=>{if(re.test(lower)&&!symbols.includes(label))symbols.push(label)};
      add(/\b(split|half|divide|two|double)\w*\b/,"DIVISION ↔ TWO FRAMES");
      add(/\b(forever|eternal|infinite|everything|nothing|all|nul|null)\b/,"INFINITY / TOTALITY ↔ LIMITS OF THE FRAME");
      add(/\b(dizz|spin|balance|fall|upside|backwards)\w*\b/,"ORIENTATION ↔ FINDING A FRAME");
      add(/\b(machine|computer|code|program|keyboard|system)\w*\b/,"MACHINE ↔ RULES / CONTROL / MAKING");
      add(/\b(time|past|future|before|after|again)\b/,"TIME ↔ SEQUENCE / REVISION");
      add(/\b(kitchen|cook|food|animal|cat|dog|mouse)\w*\b/,"KITCHEN ANIMAL ↔ CARE / PLAY / SURVIVAL");
      add(/\b(wall|hole|door|window|border|boundary)\w*\b/,"BOUNDARY ↔ INSIDE / OUTSIDE");
      const subjective="SPEAKER-POSITIONED EXPERIENCE // "+(cues.length?cues.join(" + "):"NO STRONG CUE DETECTED")+" // experience preserved; external cause, diagnosis, and intent are not inferred.";
      const symbolic=(symbols.length?symbols.join(" // "):"OPEN METAPHOR // no symbol forced")+" // POSSIBLE reading only; speaker gets final say.";
      const back='INTERPRETATIONS RELEASED → RAW: “'+short+'”\nASK BACKWARDS: what was directly said? what did the listener add? what remains UNKNOWN?';
      return{literal:'SURFACE CLAIM // “'+short+'”\nUNVERIFIED by the language machine.',subjective,symbolic,back,bus:"LITERAL["+short+"] SUBJECTIVE["+(cues.join("+")||"OPEN")+"] SYMBOLIC["+(symbols.join("+")||"OPEN")+"] BACK[RAW PRESERVED; UNKNOWN STAYS UNKNOWN]"};
    }
    function renderFour(raw){
      const f=interpretFour(raw);
      [["fourLiteral",f.literal],["fourSubjective",f.subjective],["fourSymbolic",f.symbolic],["fourBack",f.back]].forEach(([id,value])=>{const el=document.querySelector("#"+id);if(el)el.textContent=value});
      return f;
    }
    const fourWayInputs=new Set(["seed","thoughtInput","commandInput","theFuck","rearClaim","tragedyInput"]);
    document.addEventListener("input",e=>{if(fourWayInputs.has(e.target?.id))renderFour(e.target.value)});
    renderFour(document.querySelector("#seed").value);
    const masterStoryText=document.querySelector("#masterStoryText"),masterStoryStatus=document.querySelector("#masterStoryStatus");
    const updateMasterStatus=label=>{masterStoryStatus.textContent=masterStoryText.value?label+" // "+[...masterStoryText.value].length+" characters in this page copy. Download .txt to keep a durable master file.":"MASTER COPY EMPTY // nothing saved yet."};
    masterStoryText.addEventListener("input",()=>updateMasterStatus("MASTER COPY EDITED"));
    document.querySelector("#masterFromHopper").onclick=()=>{
      if(masterStoryText.value&&!confirm("Replace the current master copy with the hopper text? Export it first if you need the old version."))return;
      masterStoryText.value=document.querySelector("#seed").value;updateMasterStatus("MASTER COPIED FROM HOPPER");
    };
    document.querySelector("#masterToHopper").onclick=()=>{
      if(!masterStoryText.value){masterStoryStatus.textContent="MASTER COPY EMPTY // import or capture a story first.";return}
      if(document.querySelector("#seed").value&&!confirm("Replace the working hopper with a copy of the master story? The master itself stays unchanged."))return;
      document.querySelector("#seed").value=masterStoryText.value;document.querySelector("#sourceHandling").value="personal";run(false);
      masterStoryStatus.textContent="WORKING COPY MADE // hopper is held in PERSONAL / PAST mode. Master copy unchanged.";
    };
    document.querySelector("#masterExport").onclick=()=>{
      if(!masterStoryText.value){masterStoryStatus.textContent="MASTER COPY EMPTY // nothing to download.";return}
      const blob=new Blob([masterStoryText.value],{type:"text/plain;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a"),stamp=new Date().toISOString().replace(/[:.]/g,"-");
      a.href=url;a.download="bullshit-telephone-master-"+stamp+".txt";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);updateMasterStatus("MASTER FILE DOWNLOADED");
    };
    const masterImportFile=document.querySelector("#masterImportFile");
    document.querySelector("#masterImportButton").onclick=()=>masterImportFile.click();
    masterImportFile.onchange=async()=>{const file=masterImportFile.files?.[0];if(!file)return;if(masterStoryText.value&&!confirm("Replace the current page master with the imported file? Export the current copy first if you need it.")){masterImportFile.value="";return}masterStoryText.value=await file.text();updateMasterStatus("MASTER IMPORTED // "+file.name);masterImportFile.value=""};
    const rearAds=["ADVERTISEMENT: Upgrade to Premium Certainty™ — now with 0% additional evidence!","ADVERTISEMENT: Buy two conclusions, get a third assumption FREE.","SPONSORED: Dr. Maybe's Industrial-Strength Confirmation Bias.","ADVERTISEMENT: NEW! Facts-Flavored Opinion Nuggets.","SPONSORED: The Department of Somehow says this message probably exists.","ADVERTISEMENT: Ask your narrative if DUMBISM® is right for you."];
    function rearFeed(){
      if(document.querySelector("#sourceHandling").value!=="fiction"){document.querySelector("#rearOut").textContent="SOURCE HOLD // rear-feed remix skipped. Your entered words remain unchanged.";return}
      const raw=document.querySelector("#rearClaim").value.trim(),cert=document.querySelector("#rearCert").value,dumb=+document.querySelector("#dumbism").value,ads=+document.querySelector("#adLoad").value,out=document.querySelector("#rearOut"),passive=/^(?:|\.{2,}|idk|i don'?t know|dunno|pass|wait|nothing|no comment|maybe)$/i.test(raw);if(passive){out.textContent="PASSIVITY DETECTED\n↤ SUCCESSION TOKEN // UNRESOLVED\n↤ NEXT HOLDER INHERITS THE QUESTION, NOT AN ANSWER\n\n$ SPONSORED BY Doing Nothing®\n\nFIREWALL // PASSIVITY ≠ CONSENT // PASSIVITY ≠ REJECTION // PASSIVITY ≠ FACT";return}
      const guard=cert==="known"?"USER-LABELED KNOWN // preserve evidence separately; the Telephone is not verification.":cert==="suspected"?"SUSPECTED // FIREWALL: CANNOT PROMOTE TO FACT.":cert==="pain"?"PAIN REAL // preserve the lived experience; WHAT CAUSED IT stays a separate evidence question.":cert==="emotional"?"EMOTIONAL DAMAGE // the feeling is real; another person's intent is a separate evidence question.":"UNKNOWN // FIREWALL: CANNOT PROMOTE TO FACT.";
      const path=["STORY EXIT","HIVEMIND","GET-IT:GOT-IT","TELEPHONE","ASCII","EMOJI","GLITCH","SAUCE","RIDICULATOR","POEM","DESIRE","CHARACTER","WORD","INPUT HOPPER"],hops=3+Math.floor(dumb/12),words=extract(raw),noise=["probably","allegedly","coupon-related","for no reason","according to a raccoon","after an ad break","[PERSON UNRESOLVED]","somehow"];
      const four=interpretFour(raw);
      let signal=raw,lines=["EVIDENCE FIREWALL // "+guard,"ORIGINAL // "+raw,"FOUR-WAY // "+four.bus];
      path.slice(0,Math.min(path.length,hops)).forEach((stage,i)=>{if(ads>0&&((i*29+ads)%100)<ads)lines.push("$ "+pick(rearAds));if(dumb>20&&i%2){const k=words.length?words[(i+dumb)%words.length]:"thing";signal=k+" "+pick(noise)+" // "+signal.slice(0,Math.max(18,90-Math.floor(dumb/2)))}lines.push("↤ "+stage+" // "+signal)});
      lines.push("\nFIREWALL RESULT // "+(cert==="known"?"classification preserved; machine mutations are NOT evidence.":cert==="pain"?"PAIN PRESERVED AS REAL EXPERIENCE // cause NOT invented. No names invented.":cert==="emotional"?"EMOTION PRESERVED // intent NOT invented // emotional damage may be real without mind-reading anybody.":"still "+cert.toUpperCase()+". No names invented. No accusation upgraded."));out.textContent=lines.join("\n");
    }
    function revealBaitSwitch(){
      const original=document.querySelector("#baitOriginal").value;
      const promise=document.querySelector("#baitPromise").value;
      const changed=document.querySelector("#baitSwitch").value;
      const evidence=document.querySelector("#baitEvidence").value;
      const correction=document.querySelector("#baitCorrection").value;
      const hasInput=[original,promise,changed,evidence,correction].some(v=>v.trim());
      document.querySelector("#baitOutput").textContent=hasInput?[
        "SOURCE // PRESERVED AS ENTERED\n"+(original||"[not supplied]"),
        "BAIT / EXPECTATION //\n"+(promise||"[not supplied]"),
        "SWITCH / CHANGE //\n"+(changed||"[not supplied]"),
        "SUPPORTED BY YOUR ENTERED SOURCE //\n"+(evidence||"UNKNOWN // no evidence entered"),
        "YOUR CORRECTION //\n"+(correction||"[not supplied yet]"),
        "OPEN // motive, cause, anatomy, and missing history remain UNKNOWN unless your evidence establishes them. This comparison is not independent verification."
      ].join("\n\n"):"NOTHING ENTERED // no story was changed.";
    }
    document.querySelector("#baitReveal").onclick=revealBaitSwitch;
    document.querySelector("#baitUse").onclick=()=>{
      const correction=document.querySelector("#baitCorrection").value.trim();
      if(!correction){document.querySelector("#baitOutput").textContent="NO CORRECTION TO CARRY FORWARD // write your corrected account first.";return}
      document.querySelector("#seed").value=correction;
      renderFour(correction);
      document.querySelector("#seed").scrollIntoView({behavior:"smooth",block:"center"});
      document.querySelector("#baitOutput").textContent="YOUR CORRECTION COPIED TO INPUT HOPPER // it has not been run or altered. Press the main button when you want to generate from it.";
    };
    const bugImpactRoutes={
      critical:"FIRST // protect saved work and restore a playable route; pause the affected feature if needed.",
      story:"FIRST // preserve the source text and stop silent identity or story changes; compare against the chosen GURL ONLY setting and entered evidence.",
      feature:"NEXT // reproduce with the same settings, then repair the control without changing the report.",
      minor:"TRACK // record the workaround and verify it; small impact does not mean the report is false."
    };
    let acknowledgedPainCopy=null,lastCorruptedCopy=null,painCheck=null;
    const corruptorCharge=document.querySelector("#corruptorCharge");
    function resetCorruptorRead(){acknowledgedPainCopy=null;lastCorruptedCopy=null;painCheck=null;corruptorCharge.value=0;corruptorCharge.disabled=true;document.querySelector("#corruptorChargeOut").textContent="0 / 100";document.querySelector("#bugCreateBranch").disabled=true;document.querySelector("#bugFeedCorruptor").disabled=true;document.querySelector("#bugRunCorruptor").disabled=true;document.querySelector("#bugEncryptCopy").disabled=true;document.querySelector("#corruptorOutput").textContent="CARE || CORRUPTION // read the source first. A pain check stays outside the story."}
    function keepPainCheckOutOfStory(){
      if(painCheck?.report!==acknowledgedPainCopy)return false;
      document.querySelector("#bugPainReadout").textContent="PAIN CHECK OPEN // report preserved exactly as entered:\n“"+acknowledgedPainCopy+"”\nACKNOWLEDGED // the reported experience is read as given. Cause and interpretation remain open.\n\nSTORY EXIT FIREWALL // this check is care-only. It is not sent to the story hopper and never reaches a story ending.";
      document.querySelector("#corruptorOutput").textContent="CARE BRANCH OPEN // the source report remains here, unaltered. No source text was sent to the story hopper. The pain check has no completion state; edit and re-read it whenever the report changes.";
      return true;
    }
    document.querySelector("#bugReadPain").onclick=()=>{
      const report=document.querySelector("#bugReport").value;
      if(!report.trim()){resetCorruptorRead();document.querySelector("#bugPainReadout").textContent="NOTHING TO READ YET // add the report in your own words; no details will be invented.";return}
      acknowledgedPainCopy=report;painCheck={report};
      document.querySelector("#bugPainReadout").textContent="PAIN CHECK OPEN // report preserved exactly as entered:\n“"+acknowledgedPainCopy+"”\nACKNOWLEDGED // the reported experience is read as given. Cause and interpretation remain open.\n\nSTORY EXIT FIREWALL // this check is care-only. It is not sent to the story hopper and never reaches a story ending.";
      document.querySelector("#bugCreateBranch").disabled=false;
      document.querySelector("#bugFeedCorruptor").disabled=false;
    };
    document.querySelector("#bugReport").addEventListener("input",()=>{if(acknowledgedPainCopy!==null&&document.querySelector("#bugReport").value!==acknowledgedPainCopy){resetCorruptorRead();document.querySelector("#bugPainReadout").textContent="REPORT EDITED // read the current words again before using a copy."}});
    document.querySelector("#bugCreateBranch").onclick=()=>{
      if(acknowledgedPainCopy===null)return;
      keepPainCheckOutOfStory();
    };
    document.querySelector("#bugFeedCorruptor").onclick=()=>{
      if(acknowledgedPainCopy===null)return;
      const chars=[...acknowledgedPainCopy].filter(ch=>!/[\s\p{M}]/u.test(ch)).length,charge=Math.max(10,Math.min(100,Math.ceil(chars/2)));
      corruptorCharge.value=charge;corruptorCharge.disabled=false;document.querySelector("#corruptorChargeOut").textContent=charge+" / 100";document.querySelector("#bugRunCorruptor").disabled=false;
      document.querySelector("#corruptorOutput").textContent="COPY FED // "+charge+" CORRUPTION ENERGY // source report remains unchanged. Adjust the charge, then run a preview if you choose. The pain check remains outside the story.";
    };
    corruptorCharge.oninput=()=>document.querySelector("#corruptorChargeOut").textContent=corruptorCharge.value+" / 100";
    document.querySelector("#bugRunCorruptor").onclick=()=>{
      if(acknowledgedPainCopy===null||!+corruptorCharge.value)return;
      lastCorruptedCopy=glitch(acknowledgedPainCopy,+corruptorCharge.value);
      document.querySelector("#corruptorOutput").textContent="CORRUPTED COPY PREVIEW // fictional text effect; not a correction or evidence:\n"+lastCorruptedCopy+"\n\nSOURCE STILL PRESERVED // edit or re-read the source to reset the charge. This preview is not story input and cannot change an ending.";
      document.querySelector("#bugEncryptCopy").disabled=false;
    };
    const corruptorToken=document.querySelector("#corruptorToken"),corruptorPassphrase=document.querySelector("#corruptorPassphrase"),cryptoOut=document.querySelector("#corruptorDecryptOut");
    const encoder=new TextEncoder(),decoder=new TextDecoder();
    async function deriveCorruptorKey(passphrase,salt,usages){
      const material=await crypto.subtle.importKey("raw",encoder.encode(passphrase),"PBKDF2",false,["deriveKey"]);
      return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:310000,hash:"SHA-256"},material,{name:"AES-GCM",length:256},false,usages);
    }
    const toB64=bytes=>{let binary="";for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(binary)};
    const fromB64=base64=>Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
    document.querySelector("#bugEncryptCopy").onclick=async()=>{
      const pass=corruptorPassphrase.value;
      if(!lastCorruptedCopy)return;
      if(pass.length<8){cryptoOut.textContent="PASSPHRASE TOO SHORT // enter at least 8 characters before encrypting.";return}
      if(!globalThis.crypto?.subtle){cryptoOut.textContent="LOCAL ENCRYPTION UNAVAILABLE // this browser context does not expose Web Crypto.";return}
      try{
        const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),key=await deriveCorruptorKey(pass,salt,["encrypt"]);
        const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,encoder.encode(lastCorruptedCopy))),packed=new Uint8Array(salt.length+iv.length+encrypted.length);
        packed.set(salt,0);packed.set(iv,salt.length);packed.set(encrypted,salt.length+iv.length);
        corruptorToken.value="BTWE1."+toB64(packed);cryptoOut.textContent="ENCRYPTED LOCALLY // AES-GCM 256 + PBKDF2/SHA-256 // token includes random salt and nonce. Keep the passphrase separately; without it, the token cannot be opened.";
      }catch(err){cryptoOut.textContent="ENCRYPTION FAILED // "+String(err?.message||err)}
    };
    document.querySelector("#bugDecryptCopy").onclick=async()=>{
      const pass=corruptorPassphrase.value,token=corruptorToken.value.trim();
      if(!globalThis.crypto?.subtle){cryptoOut.textContent="LOCAL DECRYPTION UNAVAILABLE // this browser context does not expose Web Crypto.";return}
      if(pass.length<8){cryptoOut.textContent="PASSPHRASE REQUIRED // enter the same 8+ character passphrase.";return}
      try{
        if(!token.startsWith("BTWE1."))throw new Error("token should begin BTWE1.");
        const packed=fromB64(token.slice(6));if(packed.length<45)throw new Error("token is incomplete.");
        const salt=packed.slice(0,16),iv=packed.slice(16,28),ciphertext=packed.slice(28),key=await deriveCorruptorKey(pass,salt,["decrypt"]);
        const clear=await crypto.subtle.decrypt({name:"AES-GCM",iv},key,ciphertext);
        cryptoOut.textContent="DECRYPTED COPY // source text recovered from the token:\n"+decoder.decode(clear)+"\n\nThis is the encrypted copy; the original report remains separate.";
      }catch(err){cryptoOut.textContent="COULD NOT DECRYPT // check the token and passphrase. "+String(err?.message||err)}
    };
    let memoryLineStampedText=null,memoryLineStampedHash=null;
    document.querySelector("#memoryLineStamp").onclick=async()=>{
      const text=document.querySelector("#memoryLineText").value,status=document.querySelector("#memoryLineStatus"),field=document.querySelector("#memoryLineFingerprint");
      if(!text){status.textContent="NO LINE TO STAMP // enter exact text first; nothing is inferred.";return}
      if(!globalThis.crypto?.subtle){status.textContent="FINGERPRINT UNAVAILABLE // this browser context does not expose Web Crypto.";return}
      try{const bytes=await crypto.subtle.digest("SHA-256",encoder.encode(text)),hash=[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("");if(memoryLineStampedText===text&&memoryLineStampedHash===hash){status.textContent="MATCH // exact line matches the fingerprint held in this page session. This does not verify truth, author, or time."}else if(memoryLineStampedText!==null){memoryLineStampedText=text;memoryLineStampedHash=hash;field.value=hash;status.textContent="LINE CHANGED // a new fingerprint was made for the current exact text. Copy/save it if you need to keep it."}else{memoryLineStampedText=text;memoryLineStampedHash=hash;field.value=hash;status.textContent="FINGERPRINT MADE // copy it to keep. It checks exact-text changes only; it does not prove truth, author, or event time."}}catch(err){status.textContent="FINGERPRINT FAILED // "+String(err?.message||err)}
    };
    document.querySelector("#memoryLineEncrypt").onclick=async()=>{
      const text=document.querySelector("#memoryLineText").value,pass=corruptorPassphrase.value,status=document.querySelector("#memoryLineStatus");
      if(!text){status.textContent="NO LINE TO ENCRYPT // enter the exact line first.";return}
      if(pass.length<8){status.textContent="PASSPHRASE REQUIRED // enter at least 8 characters in the Encryption passphrase field below.";corruptorPassphrase.focus();return}
      if(!globalThis.crypto?.subtle){status.textContent="LOCAL ENCRYPTION UNAVAILABLE // this browser context does not expose Web Crypto.";return}
      if(corruptorToken.value.trim()&&!confirm("Replace the encrypted token currently in the shared token box? Copy it somewhere safe first if you need it.")){status.textContent="ENCRYPTION CANCELLED // existing token left unchanged.";return}
      try{const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),key=await deriveCorruptorKey(pass,salt,["encrypt"]),cipher=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,encoder.encode(text))),packed=new Uint8Array(28+cipher.length);packed.set(salt);packed.set(iv,16);packed.set(cipher,28);corruptorToken.value="BTWE1."+toB64(packed);status.textContent="LINE ENCRYPTED LOCALLY // copy the BTWE1 token below and keep the passphrase separately. Decrypt with the shared DECRYPT TOKEN button; the line and passphrase are not saved by this page.";cryptoOut.textContent="ENCRYPTED MEMORY LINE // locally encrypted exact text. Paste the token below and use the same passphrase to decrypt.";corruptorToken.scrollIntoView({behavior:"smooth",block:"center"})}catch(err){status.textContent="ENCRYPTION FAILED // "+String(err?.message||err)}
    };
    document.querySelector("#bugClearCrypto").onclick=()=>{corruptorPassphrase.value="";corruptorToken.value="";cryptoOut.textContent="ENCRYPTION DATA CLEARED // encrypted token and passphrase field cleared from this page."};
    document.querySelector("#bugMakeRoom").onclick=e=>{
      const readout=document.querySelector("#bugPainReadout"),large=!readout.classList.contains("big-enough");
      readout.classList.toggle("big-enough",large);e.currentTarget.setAttribute("aria-pressed",String(large));
      e.currentTarget.textContent=large?"MAKE IT SMALL AGAIN":"BECOME BIG ENOUGH ’NUF // MAKE ROOM FOR THE WORDS";
    };
    document.querySelector("#bugOpenRound").onclick=()=>{
      const val=id=>document.querySelector("#"+id).value;
      const report=val("bugReport"),expected=val("bugExpected"),observed=val("bugObserved"),steps=val("bugRepro"),affected=val("bugAffected"),impact=val("bugImpact");
      if(![report,expected,observed,steps,affected].some(x=>x.trim())){document.querySelector("#bugRoundOut").textContent="ROUND NOT STARTED // enter at least one report detail. Nothing was changed.";return}
      document.querySelector("#bugRoundOut").textContent=[
        "REPORT // preserved exactly as entered\n"+(report||"[not supplied]"),
        "EXPECTED //\n"+(expected||"UNKNOWN // not supplied"),
        "OBSERVED //\n"+(observed||"UNKNOWN // not supplied"),
        "IMPACT ROUTE // "+bugImpactRoutes[impact],
        "AFFECTED CONDITIONS //\n"+(affected||"not yet known"),
        "REPRO / EVIDENCE //\n"+(steps||"not supplied // do not call this fixed or disproven"),
        "RODEO RULE // investigate the system behavior. No penalty for wording, memory gaps, or who reported it."
      ].join("\n\n");
    };
    document.querySelector("#bugCloseRound").onclick=()=>{
      const fix=document.querySelector("#bugFix").value.trim(),retest=document.querySelector("#bugRetest").value.trim(),result=document.querySelector("#bugTestResult").value,confirmed=document.querySelector("#bugReporterOk").checked,out=document.querySelector("#bugCloseOut");
      if(!fix||!retest){out.textContent="OPEN // record both a proposed fix and the retest steps/result first.";return}
      if(result==="not-run"){out.textContent="OPEN // fix recorded, retest not run. Keep the report open.";return}
      if(result==="failed"){out.textContent="STILL OPEN // retest failed. Preserve the report and continue repair.";return}
      out.textContent=confirmed?"CLOSED WITH REPORTER CONFIRMATION // fix: "+fix+"\nRETEST: "+retest:"VERIFIED, AWAITING AFFECTED PLAYER // the retest passed, but the report stays open until the reporter/player confirms.\nFIX: "+fix+"\nRETEST: "+retest;
    };
    document.querySelector("#bugFixMode").onclick=()=>{const guide=document.querySelector("#bugFixModeGuide");guide.hidden=false;guide.textContent="FIX FIX MODE // LEARN A LOOP\n1. Replay the original steps without changing anything. Record what actually happens.\n2. Change one small thing, and write down exactly what changed.\n3. Replay the same steps, then one nearby case.\n4. Compare expected vs observed. A failed fix is useful evidence; reopen the loop.\n5. Record what the test taught you and what is still UNKNOWN. Close only after a passing retest and affected-player confirmation.";document.querySelector("#bugLearning").focus()};
    document.querySelector("#bugLearningCard").onclick=()=>{const value=id=>document.querySelector("#"+id).value.trim()||"UNKNOWN / not supplied",card=document.querySelector("#bugLearningOut");card.textContent="LEARNING CARD // REPORTER WORDS STAY THE SOURCE\nEXPECTED: "+value("bugExpected")+"\nOBSERVED: "+value("bugObserved")+"\nREPRO STEPS: "+value("bugRepro")+"\nFIX ATTEMPT: "+value("bugFix")+"\nRETEST: "+value("bugRetest")+"\nWHAT THE TEST TAUGHT / WHAT REMAINS UNKNOWN: "+value("bugLearning")+"\nNEXT LOOP: change one thing, replay, compare. This card summarizes entered notes; it does not verify a cause."};
    const storyCareFile=document.querySelector("#storyCareFile"),storyCareScan=document.querySelector("#storyCareScan"),storyCareStatus=document.querySelector("#storyCareStatus"),storyCareResults=document.querySelector("#storyCareResults");
    storyCareFile.onchange=()=>{const file=storyCareFile.files?.[0];storyCareScan.disabled=!file;storyCareStatus.textContent=file?"LOCAL FILE SELECTED // "+file.name+" // "+file.size+" bytes // not uploaded.":"NO FILE READ // nothing is uploaded or saved by this checker."};
    function extractStoryOptions(source,fileName){
      const isHtml=/\.(html?|xhtml)$/i.test(fileName)||/<(?:!doctype\s+html|html|option|button)\b/i.test(source),found=[];
      if(isHtml){const doc=new DOMParser().parseFromString(source,"text/html");doc.querySelectorAll("option,.chip,[data-story-option],.gamebuttons button,.story-option").forEach(node=>{const text=(node.textContent||"").replace(/\s+/g," ").trim();if(text)found.push(text)})}
      if(!found.length){source.split(/\r?\n/).forEach(line=>{const text=line.trim().replace(/^\s*(?:[-*•]|\d+[.)])\s*/,"");if(text&&text.length<=320)found.push(text)})}
      return [...new Set(found)];
    }
    const storyCareRules=[
      ["may dismiss a feeling",/\b(?:you imagined it|just a dream|nothing happened|stop being dramatic|attention[- ]seeking|fake pain|your feelings are not real)\b/i],
      ["may force forgiveness or forgetting",/\b(?:must|have to|forced to|cannot refuse to)\s+(?:forgive|forget|move on|accept|obey)\b/i],
      ["may assign blame for being hurt",/\b(?:your fault|you (?:deserve|deserved|caused|asked for) (?:the )?(?:pain|hurt|harm|abuse))\b/i],
      ["may erase identity or memory",/\b(?:erase|delete|overwrite|wipe)\s+(?:their |your )?(?:identity|memory|past|story)\b/i],
      ["may turn an uncertain claim into certainty",/\b(?:proves? that|definitely happened|the real truth is|everyone knows)\b/i]
    ];
    storyCareScan.onclick=async()=>{
      const file=storyCareFile.files?.[0];if(!file){storyCareStatus.textContent="NO FILE SELECTED // choose a local file first.";return}
      storyCareScan.disabled=true;storyCareStatus.textContent="READING LOCALLY // file contents stay in this page.";
      try{const source=await file.text(),options=extractStoryOptions(source,file.name),flagged=[];for(const option of options){const rules=storyCareRules.filter(([,re])=>re.test(option)).map(([name])=>name);if(rules.length)flagged.push({option,rules})}
        storyCareStatus.textContent="SCAN COMPLETE // "+options.length+" story choices/seeds checked // "+flagged.length+" review suggestions. This is a wording check, not a verdict.";
        storyCareResults.textContent=flagged.length?flagged.map((item,i)=>(i+1)+". REVIEW // "+item.rules.join("; ")+"\n“"+item.option+"”\nA player decides whether this is hurtful in context.").join("\n\n"):options.length?"NO RULE MATCHES // no listed wording pattern was found in the extracted options. This is not a guarantee that every player will feel okay.":"NO OPTIONS EXTRACTED // try an HTML, Markdown, or text file with one story choice per line.";
      }catch(error){storyCareStatus.textContent="FILE READ FAILED // "+String(error?.message||error);storyCareResults.textContent="Nothing was uploaded or changed."}finally{storyCareScan.disabled=!storyCareFile.files?.length}
    };
    document.querySelector("#storyCareClear").onclick=()=>{storyCareFile.value="";storyCareScan.disabled=true;storyCareStatus.textContent="NO FILE READ // nothing is uploaded or saved by this checker.";storyCareResults.textContent="Choose the local game file, then scan its story choices."};
    const first=["Milo","Zuzu","Cricket","Nova","Benny","Moxie","Orla","Pip","Theo","Wanda","Gasket","Juniper"];
    const gurlFirst=["Moxie","Orla","Wanda","Juniper","Zuzu","Nova","Pip","Daisy","Roxy","Mina","Tess","Lola"];
    const last=["Venn","Crumb","Voltage","Probably","McProblem","Sideways","Again","Nope","Fizz","Telephone","Oops","Bucket"];
    const jobs=["junior reality mechanic","unlicensed destiny inspector","municipal wizard","snack engineer","professional witness","mall prophet","emergency poet","time janitor","cat attorney","Department of Somehow intern"];
    const wants=["a quiet house where nothing explodes","to be believed exactly once","an infinite breakfast with no closing time","to build one impossible thing that actually works","a tiny kingdom nobody can repossess","to get home before reality notices","a best friend who remembers every version of them","one perfect day that cannot be edited","to own the moon for seventeen minutes","to prove the stupid idea was beautiful"];
    const weird=["legally","backwards","for tax purposes","inside a Denny's","because Tuesday said so","using only coupons","after consulting the moon","in front of Congress","with absolutely no adult supervision"];
    const verbs=["invents","misplaces","licenses","haunts","forgets","weaponizes","adopts","audits","summons","misunderstands"];
    const hiveBrains=[
      ["THE CHILD",t=>"Obviously "+pick(["it works because nobody told it not to","the machine is lonely","the rule only counts when grownups look","you can just ask the moon nicely"])+"."],
      ["THE LAWYER",t=>"Counsel argues that "+pick(["the warning label created a contractual universe","causality failed to initial page three","the desire itself constitutes prior art","the word ‘never’ has no defined jurisdiction"])+"."],
      ["THE ENGINEER",t=>"Failure analysis confirms "+pick(["the impossible part is functioning within tolerance","the bug is now load-bearing","the feedback loop is the product","seven unnecessary gears solve the moral problem"])+"."],
      ["THE POET",t=>pick(["Every loophole casts a little shadow forward.","The machine dreams in instructions nobody remembers writing.","Desire is just a blueprint wearing perfume.","History rhymes because somebody keeps feeding it quarters."])],
      ["THE BUREAUCRAT",t=>"Form "+pick(["GOT-17B","NO-2","WHY-404","9¾-CANON"])+" therefore classifies this incident as "+pick(["routine metaphysical maintenance","an approved childhood invention","municipal weather","a taxable miracle"])+"."],
      ["THE CONSPIRACY GUY",t=>"Connect the dots: "+pick(["the receipt, the moon, and Tuesday are the same witness","every typo points backward in time","the vending machine knew first","nobody has explained the pancakes"])+"."],
      ["THE CAT",t=>pick(["The cat sits on the evidence. Case closed.","Mrrp. The machine belongs to the cat now.","All timelines converge at the warmest rectangle.","The cat votes for knocking canon off the table."])],
      ["THE ARCHAEOLOGIST",t=>"Future ruins indicate "+pick(["this sentence was discovered before it was written","the warning label became a sacred tablet","the first machine was actually a misunderstanding","civilization ended politely and left a receipt"])+"."],
      ["THE ACCOUNTANT",t=>"After reconciliation, reality owes "+pick(["three moons and $4.17","one childhood plus interest","a refund for unused causality","seventeen breakfasts"])+"."],
      ["THE DRAMATIST",t=>"ACT III REVEAL: "+pick(["the stupid rule was the protagonist","the machine wanted a normal childhood","the villain was a punctuation mark","everybody has been inside the poem the whole time"])+"."],
      ["THE INTERNET",t=>"Consensus status: "+pick(["source: dude trust me","big if Tuesday","canon speedrun any%","ratio + causality issue"])+"."],
      ["THE GHOST",t=>pick(["I remember this happening tomorrow.","Do not erase the part that hasn't happened yet.","The dead draft is still editing the living one.","Someone keeps haunting the footnotes."])]
    ];
    let lastSignal="", lastPreHive="", lastStoryContext=null, rootHumanSeed="", reiterationCount=0, cosmicBest=null;
    const moduleOn=i=>chain.children[i]?.classList.contains("on");
    const moduleLevel=i=>+(chain.children[i]?.querySelector("input")?.value||50);
    const bountyDefs=[
      {name:"WHY TAX",hint:"Explain WHY some part of this nonsense would happen.",test:t=>/\b(because|why|therefore|so that|reason)\b/i.test(t)},
      {name:"CONTRADICTION MINING",hint:"Find a contradiction, loophole, exception, or thing that cannot both be true.",test:t=>/\b(but|except|unless|contradict|loophole|however|can't|cannot)\b/i.test(t)},
      {name:"DETAIL FARM",hint:"Add one weirdly concrete detail: a number, place, object, date, price, color, etc.",test:t=>/\d|\$|\b(red|blue|green|yellow|black|white|street|room|box|door|car|store|house|machine)\b/i.test(t)},
      {name:"WHAT-IF FUTURES",hint:"Push it forward: what happens next, or what happens IF something changes?",test:t=>/\b(if|then|next|after|before|would|could|future|happens)\b/i.test(t)},
      {name:"CHARACTER MOTIVE",hint:"Give somebody a want, fear, choice, secret, or reason to care.",test:t=>/\b(want|wants|fear|afraid|chooses|choice|secret|care|needs|because)\b/i.test(t)},
      {name:"RULE LAWYER",hint:"Invent, attack, or reinterpret one rule of the machine/world.",test:t=>/\b(rule|allowed|never|always|must|can't|cannot|legal|illegal|exception)\b/i.test(t)}
    ];
    const lootTables={
      common:["🧾 Cursed Receipt","🎟️ Tuesday Coupon","🪙 Counterfeit Moon Penny","📎 Load-Bearing Paperclip","🥫 Emergency Metaphor"],
      rare:["🔑 Moon Key","📜 CANON Stamp","🧠 Spare Brain Cell","☎️ Red Telephone","🧪 Meaning Concentrate"],
      legendary:["👑 Crown of Somehow","💎 Plot Diamond","🕳️ Portable Loophole","⏳ Refundable Tuesday","🦆 PAPAL DUCK RELIC"]
    };
    let wallet=0,currentBounty=null,bountyMultiplier=1,bountyJackpot=0;
    const thoughtQueue=[],thoughtHistory=[],inventory=[];
    const blankFateStats=()=>({samples:0,chars:0,words:0,questions:0,exclaims:0,reasons:0,curious:0,care:0,play:0,direct:0,caps:0});
    let fateState={research:0,hashes:[],stats:blankFateStats(),match:null,spol:null};
    const kitchenAnimals=[
      {emoji:"🐈",name:"Miso",species:"CAT",station:"SAUCER / NIGHT SOUS",v:[58,72,48,74,84],gift:"notices the thing you did not say and never makes a production out of it"},
      {emoji:"🐕",name:"Biscuit",species:"DOG",station:"FRONT OF HOUSE / MORALE",v:[94,64,78,45,58],gift:"makes enthusiasm feel safe instead of embarrassing"},
      {emoji:"🦝",name:"Tongs",species:"RACCOON",station:"DISH PIT / CONTRABAND SNACKS",v:[64,84,98,58,68],gift:"can survive your weirdest tangent and hand it back improved"},
      {emoji:"🐇",name:"Proof",species:"RABBIT",station:"PASTRY / DOUGH LISTENER",v:[90,58,38,82,38],gift:"gives an unfinished thought enough quiet to rise"},
      {emoji:"🐻",name:"Skillet",species:"BEAR",station:"GRILL / CLOSING SHIFT",v:[88,44,54,76,74],gift:"stays steady when the kitchen gets loud"},
      {emoji:"🦊",name:"Ticket",species:"FOX",station:"EXPO / IMPOSSIBLE ORDERS",v:[64,90,80,72,88],gift:"keeps up with fast language without pretending confusion is agreement"},
      {emoji:"🐙",name:"Mise",species:"OCTOPUS",station:"PREP / EIGHT-HAND SYSTEMS",v:[72,96,74,94,60],gift:"likes the complicated version and still remembers the original point"},
      {emoji:"🐦‍⬛",name:"Crumb",species:"CROW",station:"NIGHT BAKERY / SHINY OBJECTS",v:[60,98,88,90,76],gift:"treats strange connections as clues worth checking"}
    ];
    const fateClamp=n=>Math.max(0,Math.min(100,Math.round(n)));
    const xorNulNul=value=>[...String(value)].map(ch=>String.fromCodePoint(ch.codePointAt(0)^0^0)).join("");
    function learnLanguage(raw,boost=1){
      if(fateState.match)return;
      const text=String(raw||"").trim();if(text.length<3)return;
      const h=hash(text.toLowerCase().replace(/\s+/g," "));if(fateState.hashes.includes(h))return;
      fateState.hashes=[...fateState.hashes.slice(-39),h];
      const s=fateState.stats,words=text.match(/\b[\w']+\b/g)||[],lower=text.toLowerCase();
      s.samples++;s.chars+=text.length;s.words+=words.length;
      s.questions+=(text.match(/\?/g)||[]).length;s.exclaims+=(text.match(/!/g)||[]).length;
      s.reasons+=(lower.match(/\b(because|therefore|however|unless|if|then|means|instead|but|so|why)\b/g)||[]).length;
      s.curious+=(lower.match(/\b(why|how|what|where|when|who|wonder|maybe|could|would|imagine|think)\b/g)||[]).length;
      s.care+=(lower.match(/\b(we|us|our|feel|feels|happy|sad|care|kind|love|help|together|sorry|please|thanks|thank)\b/g)||[]).length;
      s.play+=(lower.match(/\b(weird|wild|funny|dumb|stupid|cool|cute|fuck|shit|bullshit|wtf|lol|haha|animal|kitchen|fate)\b/g)||[]).length;
      s.direct+=/^\s*(make|do|put|give|show|tell|find|start|add|build|turn|get|rerun|go)\b/i.test(text)?1:0;
      s.caps+=(text.match(/\b[A-Z]{3,}\b/g)||[]).length;
      fateState.research=fateClamp(fateState.research+Math.max(1,Math.round(2.5*boost)));
      maybeUnlockFate();renderFate();
    }
    function fateProfile(){
      const s=fateState.stats,w=Math.max(1,s.words),n=Math.max(1,s.samples),avg=w/n;
      return [
        fateClamp(38+(s.care/w)*520+Math.min(18,avg*.45)),
        fateClamp(38+(s.curious/w)*480+(s.questions/n)*18+(s.reasons/w)*120),
        fateClamp(35+(s.play/w)*500+(s.exclaims/n)*13+(s.caps/n)*7),
        fateClamp(32+Math.min(32,avg*1.15)+(s.reasons/w)*430),
        fateClamp(42+(s.direct/n)*32+Math.max(0,18-avg*.5)+(s.caps/n)*5)
      ];
    }
    function makeSpol(animal,profile){
      const ideas=[
        "The freezer contains one unlabeled dessert that hums when either of you lies.",
        "Closing time arrives, but Table Zero keeps ordering meals from tomorrow.",
        "A regular leaves a key in the tip jar with a note: BOTH OF YOU OR NEITHER.",
        "The kitchen loses power except for one impossible stove that seems to understand conversation.",
        "An order prints for a customer neither of you remembers meeting: MAKE WHAT I ACTUALLY NEED.",
        "You inherit the midnight special, but the recipe is written entirely as questions."
      ];
      const id="SPOL-KITCHEN-"+String(hash(animal.name+fateState.hashes.join("-"))%100000).padStart(5,"0");
      return {id,premise:ideas[hash(id)%ideas.length],first:"First move: you and "+animal.name+" each get one sentence before either of you is allowed to solve it."};
    }
    function maybeUnlockFate(){
      if(fateState.research<100||fateState.match)return;
      const p=fateProfile();
      const identity=p.join(":")+":"+fateState.stats.samples,afterXor=xorNulNul(identity);
      if(afterXor!==identity)return;
      const ranked=kitchenAnimals.map(a=>({a,fit:100-(a.v.reduce((sum,x,i)=>sum+Math.abs(x-p[i]),0)/5)*.58})).sort((x,y)=>y.fit-x.fit);
      const winner=ranked[0];fateState.match={name:winner.a.name,score:fateClamp(winner.fit),profile:p,xorProof:hash(identity)===hash(afterXor)};fateState.spol=makeSpol(winner.a,p);
    }
    function renderCutePixel(animal,profile){
      const canvas=document.querySelector("#cutePixel"),status=document.querySelector("#pixelGpu");if(!canvas)return;
      const kind=Math.max(0,kitchenAnimals.findIndex(a=>a.name===animal.name)),furPal=[[.72,.58,.47],[.74,.50,.25],[.45,.48,.52],[.88,.84,.76],[.52,.32,.18],[.86,.36,.11],[.58,.36,.72],[.16,.18,.22]],accents=[[1,.24,.60],[.15,.89,1],[1,.88,.17],[.65,.45,1],[.44,1,.55]];
      const strongest=profile.indexOf(Math.max(...profile)),gl=canvas.getContext("webgl",{antialias:false,preserveDrawingBuffer:true});
      if(gl){
        const vs='attribute vec2 a; varying vec2 v; void main(){v=(a+1.0)*0.5;gl_Position=vec4(a,0.0,1.0);}';
        const fs=`precision mediump float;
          varying vec2 v; uniform float uKind; uniform vec3 uFur; uniform vec3 uAccent;
          float ell(vec2 p,vec2 c,vec2 r){vec2 d=(p-c)/r;return 1.0-step(1.0,dot(d,d));}
          float boxy(vec2 p,vec2 c,vec2 s){vec2 d=step(abs(p-c),s);return d.x*d.y;}
          void main(){
            vec2 p=(floor(v*32.0)+0.5)/32.0;
            float checker=mod(floor(p.x*16.0)+floor(p.y*16.0),2.0);
            vec3 col=mix(vec3(.045,.03,.065),uAccent*.22+.035,mix(.28,.62,checker));
            float body=ell(p,vec2(.5,.18),vec2(.28,.24)); col=mix(col,mix(uFur,vec3(.93),.12),body);
            float apron=ell(p,vec2(.5,.13),vec2(.18,.18));col=mix(col,vec3(.92,.90,.82),apron);
            float ears=0.0;
            if(uKind<.5)ears=max(ell(p,vec2(.29,.79),vec2(.12,.18)),ell(p,vec2(.71,.79),vec2(.12,.18)));
            else if(uKind<1.5)ears=max(ell(p,vec2(.25,.66),vec2(.13,.23)),ell(p,vec2(.75,.66),vec2(.13,.23)));
            else if(uKind<2.5)ears=max(ell(p,vec2(.27,.76),vec2(.11,.14)),ell(p,vec2(.73,.76),vec2(.11,.14)));
            else if(uKind<3.5)ears=max(ell(p,vec2(.35,.88),vec2(.075,.25)),ell(p,vec2(.65,.88),vec2(.075,.25)));
            else if(uKind<4.5)ears=max(ell(p,vec2(.28,.77),vec2(.12,.12)),ell(p,vec2(.72,.77),vec2(.12,.12)));
            else if(uKind<5.5)ears=max(ell(p,vec2(.29,.81),vec2(.105,.19)),ell(p,vec2(.71,.81),vec2(.105,.19)));
            col=mix(col,uFur*.88,ears);
            float head=ell(p,vec2(.5,.58),vec2(.30,.27));col=mix(col,uFur,head);
            if(uKind>5.5&&uKind<6.5){float tent=max(max(ell(p,vec2(.27,.36),vec2(.07,.19)),ell(p,vec2(.42,.34),vec2(.06,.20))),max(ell(p,vec2(.58,.34),vec2(.06,.20)),ell(p,vec2(.73,.36),vec2(.07,.19))));col=mix(col,uFur,tent);}
            if(uKind>1.5&&uKind<2.5){float mask=max(ell(p,vec2(.38,.61),vec2(.15,.10)),ell(p,vec2(.62,.61),vec2(.15,.10)));col=mix(col,vec3(.17,.18,.20),mask);}
            float eye=max(ell(p,vec2(.39,.62),vec2(.045,.055)),ell(p,vec2(.61,.62),vec2(.045,.055)));col=mix(col,vec3(.035),eye);
            float shine=max(boxy(p,vec2(.405,.642),vec2(.012)),boxy(p,vec2(.625,.642),vec2(.012)));col=mix(col,vec3(1.0),shine);
            float cheek=max(boxy(p,vec2(.31,.53),vec2(.035,.018)),boxy(p,vec2(.69,.53),vec2(.035,.018)));col=mix(col,vec3(1.0,.35,.52),cheek*.7);
            float nose=boxy(p,vec2(.5,.54),vec2(.028,.018));col=mix(col,vec3(.12,.07,.09),nose);
            float mouth=max(boxy(p,vec2(.47,.49),vec2(.032,.012)),boxy(p,vec2(.53,.49),vec2(.032,.012)));col=mix(col,vec3(.16,.08,.10),mouth);
            if(uKind>6.5){float beak=boxy(p,vec2(.5,.52),vec2(.085,.035));col=mix(col,vec3(1.0,.66,.12),beak);}
            float badge=boxy(p,vec2(.5,.18),vec2(.045));col=mix(col,uAccent,badge);
            gl_FragColor=vec4(col,1.0);
          }`;
        const compile=(type,src)=>{const sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(sh)||"shader compile failed");return sh};
        try{
          const prog=gl.createProgram();gl.attachShader(prog,compile(gl.VERTEX_SHADER,vs));gl.attachShader(prog,compile(gl.FRAGMENT_SHADER,fs));gl.linkProgram(prog);if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(prog)||"shader link failed");gl.useProgram(prog);
          const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);const a=gl.getAttribLocation(prog,"a");gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
          gl.uniform1f(gl.getUniformLocation(prog,"uKind"),kind);gl.uniform3fv(gl.getUniformLocation(prog,"uFur"),furPal[kind]);gl.uniform3fv(gl.getUniformLocation(prog,"uAccent"),accents[strongest]);gl.viewport(0,0,canvas.width,canvas.height);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
          status.textContent="GPU // WEBGL PIXEL SHADER ACTIVE";status.className="gpu-ok";return;
        }catch{}
      }
      const x=canvas.getContext("2d");if(!x)return;x.imageSmoothingEnabled=false;x.fillStyle="#10091a";x.fillRect(0,0,128,128);x.fillStyle="#b38bd8";x.fillRect(24,30,80,72);x.fillStyle="#111";x.fillRect(42,58,12,14);x.fillRect(74,58,12,14);x.fillStyle="#fff";x.fillRect(45,60,4,4);x.fillRect(77,60,4,4);x.fillStyle="#ff75ad";x.fillRect(56,80,16,6);status.textContent="GPU UNAVAILABLE // CUTE 2D EMERGENCY MODE";status.className="gpu-fallback";
    }
    function runMirrorWorld(){
      const input=document.querySelector("#tragedyInput"),out=document.querySelector("#mirrorOut");if(!input||!out)return;
      const tragedy=input.value.trim();if(!tragedy){out.classList.add("show");out.textContent="MIRROR ERROR // give me an ending to walk backward from.";return}
      const four=interpretFour(tragedy);renderFour(tragedy);
      const keys=extract(tragedy).slice(0,5),signal=keys.length?keys.join(" / "):"the ending",alienStory=/alien.{0,20}sick|sick.{0,20}alien/i.test(tragedy);
      const animal=fateState.match?.name||"your Kitchen Animal";
      const path=[
        "[ 00 // TRAGEDY ]\n"+tragedy,
        "[ 00.5 // FOUR-WAY ]\n"+four.bus,
        "[ -01 // CONSEQUENCE BEFORE CAUSE ]\nDo not assign blame yet. Freeze the ending and mark its loudest signals: "+signal+".",
        ...(alienStory?["[ -01.5 // BELEIEVEVEVE ]\nBelieve the character's experience: they feel sick, scared, and affected. Test the alien explanation separately. Empathy does not require turning an uncertain cause into a fact."]:[]),
        "[ -02 // POSSIBLE MISREAD ]\nAsk what each person could have inferred without actually knowing. A reaction is evidence of a need, not automatic proof of an intention.",
        "[ -03 // EMPATHY MIRROR ]\nYou model "+animal+"'s interior world; "+animal+" models yours. Each gets to correct the model. Nobody is required to accept the machine's guess.",
        "[ -04 // LAST REVERSIBLE FORK ]\nBefore the irreversible-looking choice, ask one small question: “What do you need me to understand before I act?”",
        "[ +01 // MIRROR WORLD ]\nKeep everything that was true before the fork, change only the avoidable misread, then continue forward. Different future; same people; no destiny forced."
      ];
      out.textContent=path.join("\n\n");out.classList.add("show");
    }
    function renderFate(){
      maybeUnlockFate();const r=fateState.research,p=fateProfile(),labels=["CARE","CURIOSITY","PLAY","DEPTH","DIRECT"];
      document.querySelector("#fateCount").textContent=r+" / 100";document.querySelector("#fateBar").style.width=r+"%";
      document.querySelector("#fateLens").classList.toggle("on",r>=20);document.querySelector("#fateRhythm").classList.toggle("on",r>=45);document.querySelector("#fateMirror").classList.toggle("on",r>=70);
      const power=1+(r>=20?1:0)+(r>=45?2:0)+(r>=70?4:0),btn=document.querySelector("#researchMe");btn.textContent=fateState.match?"✓ KITCHEN ANIMAL FOUND // SPOL OPEN":"🍪 RESEARCH ME BACKWARDS +"+power;btn.disabled=!!fateState.match;
      document.querySelector("#fateReadout").innerHTML=fateState.stats.samples?("<strong>REVERSE PROFILE // "+fateState.stats.samples+" LANGUAGE SAMPLE"+(fateState.stats.samples===1?"":"S")+"</strong><br>"+labels.map((x,i)=>x+" "+p[i]).join(" // ")+"<br>XOR NUL NUL // "+(fateState.match?"PASS // IDENTITY UNCHANGED":"ARMED @ 100")+"<br><span class=\"muted\">RAM ONLY // sentences are discarded after measurement // reload = amnesia // nothing written to browser storage.</span>"):"NO PROFILE YET // talk to the machine, then keep digging.";
      const box=document.querySelector("#animalMatch");
      if(fateState.match){
        const animal=kitchenAnimals.find(a=>a.name===fateState.match.name)||kitchenAnimals[0],strong=labels[p.indexOf(Math.max(...p))],low=labels[p.indexOf(Math.min(...p))];
        box.classList.add("show");box.innerHTML='<div class="animal-name"><span class="animal-emoji">'+animal.emoji+'</span>'+animal.name+' // '+animal.species+'</div><div class="pixelgen"><canvas id="cutePixel" class="pixelcanvas" width="128" height="128" aria-label="GPU generated cute pixel portrait of '+animal.name+'"></canvas><div class="pixelmeta"><strong>cutePIXELgen // '+animal.species+'</strong><br><span id="pixelGpu">GPU // INITIALIZING…</span><br>32×32 PROCEDURAL SOUL<br>PROFILE-TINTED BADGE</div></div><div class="fatecopy"><strong>'+animal.station+'</strong> // MATCH '+fateState.match.score+'%<br>XOR NUL NUL: '+(fateState.match.xorProof!==false?'PASS // YOU CAME OUT AS YOU':'FAIL')+'<br>WHY: '+animal.gift+'. Your loudest signal is '+strong+'; the engine also checked what happens around '+low+'.<br><br>ONE ACTIVE KITCHEN MATCH // no swipe roster // no secret bench.</div><div class="spol"><strong>✦ NEW SPOL STARTED // '+fateState.spol.id+'</strong><br>'+fateState.spol.premise+'<br>'+fateState.spol.first+'</div><div class="mirrorworld"><div class="mirror-title"><span>◐ MIRROR WORLD</span><span>BACKWARDS TRAGEDY</span></div><div class="dotrow"><button id="forgetDot" class="blinkdot" type="button" aria-label="Dot that can forget to blink"></button><span id="dotStatus">DOT REMEMBERS TO BLINK</span></div><textarea id="tragedyInput" aria-label="Tragedy to walk backwards from" placeholder="Put the bad ending here…"></textarea><button id="mirrorAlien" class="chip" type="button">👽 ALIEN SICKNESS // FICTION STORY</button><button id="mirrorGo" class="mirrorbtn">↶ WALK THE TRAGEDY BACKWARDS</button><div id="mirrorOut" class="mirrorout"></div></div>';renderCutePixel(animal,p);const tragedyInput=document.querySelector("#tragedyInput");tragedyInput.value="You and "+animal.name+" finish the shift each believing the other did not care, and the kitchen goes dark with the important thing still unsaid.";document.querySelector("#mirrorGo").onclick=runMirrorWorld;document.querySelector("#mirrorAlien").onclick=()=>{tragedyInput.value="FICTION // An alien sickness makes everyone tell the same impossible story. The tragedy begins when people argue over whether the alien explanation is true and stop listening to the sick people describing what they actually feel.";runMirrorWorld()};document.querySelector("#forgetDot").onclick=e=>{e.currentTarget.classList.add("forgot");e.currentTarget.disabled=true;document.querySelector("#dotStatus").textContent="DOT FORGOT // YOU STILL CAN BLINK"};
      }
    }
    document.querySelector("#researchMe").onclick=()=>{
      if(fateState.match)return;learnLanguage(document.querySelector("#seed").value,1);
      const r=fateState.research,power=1+(r>=20?1:0)+(r>=45?2:0)+(r>=70?4:0);fateState.research=fateClamp(r+power);maybeUnlockFate();renderFate();
    };
    function renderEconomy(){
      document.querySelector("#wallet").textContent="$"+wallet.toLocaleString();document.querySelector("#fuel").textContent=thoughtQueue.length;
      document.querySelector("#lootRack").innerHTML="";
      inventory.slice(-8).forEach(item=>{const x=document.createElement("span");x.className="loot";x.textContent=item;document.querySelector("#lootRack").appendChild(x)});
    }
    function rerollBounty(){
      currentBounty=pick(bountyDefs);bountyMultiplier=pick([1,1.25,1.5,2,3,4]);bountyJackpot=25+Math.floor(Math.random()*226);
      document.querySelector("#bountyName").textContent=currentBounty.name;
      document.querySelector("#bountyHint").textContent=currentBounty.hint;
      document.querySelector("#bountyPay").textContent=" // "+bountyMultiplier+"× PAY // $"+bountyJackpot+" JACKPOT @ 85+";
    }
    function appraiseThought(raw){
      const text=String(raw||"").trim();if(!text)throw new Error("the Hivemind cannot appraise an empty skull");
      const four=interpretFour(text);renderFour(text);
      learnLanguage(text,3);
      const words=extract(text),lower=text.toLowerCase(),seedWords=extract(document.querySelector("#seed").value),relevance=new Set(seedWords.filter(w=>lower.includes(w))).size;
      const reasoning=/\b(because|therefore|however|unless|if|then|means|instead|but|so that)\b/i.test(text)?10:0;
      const bountyHit=currentBounty.test(text),normalized=lower.replace(/[^a-z0-9]+/g," ").trim();
      const duplicate=thoughtHistory.some(x=>x.normalized===normalized);
      let score=Math.round(15+Math.min(25,words.length*1.7)+Math.min(20,relevance*6)+reasoning+(bountyHit?20:0)+(duplicate?-40:10));score=Math.max(0,Math.min(100,score));
      const good=score>=55,reward=good?Math.round(score*bountyMultiplier)+(bountyHit&&score>=85?bountyJackpot:0):0;
      let loot="";if(score>=95)loot=pick(lootTables.legendary);else if(score>=80)loot=pick(lootTables.rare);else if(score>=65)loot=pick(lootTables.common);
      thoughtHistory.push({normalized,score});
      if(good){wallet+=reward;thoughtQueue.push({text,score,four:four.bus});if(score>=90)thoughtQueue.push({text:"BONUS ECHO: "+text,score,four:four.bus});if(loot)inventory.push(loot)}
      renderEconomy();
      const verdict=good?("PAID $"+reward+" // +"+(score>=90?2:1)+" FUEL"+(loot?" // LOOT DROP: "+loot:"")):("REJECTED // 0 FUEL // think harder");
      document.querySelector("#thoughtScore").textContent="APPRAISAL "+score+"/100 // "+(bountyHit?"BOUNTY HIT // ":"")+verdict;
      rerollBounty();
      return {score,good,reward,loot,bountyHit,verdict};
    }
    function reargueWithThought(){
      if(document.querySelector("#sourceHandling").value!=="fiction"){document.querySelector("#hiveOut").textContent="SOURCE HELD // Hivemind re-argument bypassed; no source words were remixed.";return false}
      if(!thoughtQueue.length){document.querySelector("#hiveOut").textContent="[ THINK REQUIRED — earn at least 1 FUEL before asking the Hivemind to re-argue ]";document.querySelector("#thoughtScore").textContent="NO FUEL // Submit a GOOD THOUGHT (55+) first.";return false}
      if(!lastSignal)run(false);
      const thought=thoughtQueue.shift();renderEconomy();
      lastSignal=renderHive(lastPreHive+" HUMAN THOUGHT ["+thought.score+"/100]: "+thought.text+" // FOUR-WAY: "+(thought.four||interpretFour(thought.text).bus));
      document.querySelector("#storyOut").textContent=finishStory({...lastStoryContext,signal:lastSignal});
      document.querySelector("#canonOut").textContent="GOT-IT: Human thought consumed as Hivemind fuel. STORY was regenerated from the pre-story signal + that thought. Nothing was fed back after it.";
      document.querySelectorAll(".panel").forEach(x=>{x.classList.remove("blink");void x.offsetWidth;x.classList.add("blink")});return true;
    }
    function glitch(s,n){
      if(n<45)return s; const z=["̷","̴","̵","̶","͟","͞","̸","̹","͎","̺","͓","̻","̽","̾","͆","̓","̈́"];
      return [...s].map((c,i)=>/[a-z]/i.test(c)&&Math.random()<n/260?c+pick(z)+(n>82&&Math.random()<.35?pick(z):""):c).join("");
    }
    function drawVision(name,want,seed){
      const c=document.querySelector("#desire"),x=c.getContext("2d"),r=mulberry32(hash(seed+name+want));
      const hue=Math.floor(r()*360); x.clearRect(0,0,900,900);
      const g=x.createRadialGradient(450,400,30,450,450,620);g.addColorStop(0,"hsl("+hue+" 90% 64%)");g.addColorStop(.38,"hsl("+((hue+65)%360)+" 70% 30%)");g.addColorStop(1,"#05060a");x.fillStyle=g;x.fillRect(0,0,900,900);
      for(let i=0;i<90;i++){x.globalAlpha=.18+r()*.55;x.fillStyle=i%4?"#fff":"hsl("+((hue+180)%360)+" 90% 65%)";x.beginPath();x.arc(r()*900,r()*700,1+r()*4,0,7);x.fill()}
      x.globalAlpha=1;x.strokeStyle="#ffffff70";x.lineWidth=5;x.beginPath();x.arc(450,390,225,0,Math.PI*2);x.stroke();
      x.font="100px system-ui";x.textAlign="center";x.textBaseline="middle";
      const lower=want.toLowerCase(); let icon=lower.includes("house")?"🏠":lower.includes("moon")?"🌙":lower.includes("breakfast")?"🥞":lower.includes("friend")?"🫂":lower.includes("believed")?"📣":lower.includes("build")?"⚙️":lower.includes("kingdom")?"🏰":lower.includes("home")?"🗝️":lower.includes("day")?"🌅":"✨";
      x.fillText(icon,450,390);x.fillStyle="#fff";x.shadowColor="#000";x.shadowBlur=18;x.font="900 46px system-ui";x.fillText(name.toUpperCase(),450,700);
      x.shadowBlur=0;x.font="700 25px system-ui";x.fillStyle="#dbe4ee";wrapText(x,want.toUpperCase(),450,760,700,34);
    }
    function wrapText(ctx,text,cx,y,max,line){const words=text.split(" ");let s="",lines=[];for(const w of words){const t=s?s+" "+w:w;if(ctx.measureText(t).width>max){lines.push(s);s=w}else s=t}lines.push(s);lines.slice(0,3).forEach((l,i)=>ctx.fillText(l,cx,y+i*line))}
    function hivemind(signal){
      const count=Math.max(3,Math.min(12,+document.querySelector("#brains").value||7));
      const gens=Math.max(1,Math.min(12,+document.querySelector("#gens").value||4));
      const mode=document.querySelector("#consensus").value;
      let current=signal, history=[];
      for(let g=1;g<=gens;g++){
        const shuffled=[...hiveBrains].sort(()=>Math.random()-.5).slice(0,count);
        const candidates=shuffled.map(([brain,fn],i)=>{
          const claim=fn(current);
          const overlap=extract(claim).filter(w=>current.toLowerCase().includes(w)).length;
          const weirdness=(claim.match(/moon|time|reality|canon|machine|cat|causality/gi)||[]).length;
          const score=mode==="majority"?overlap*3+Math.random()*3:mode==="chaos"?weirdness*4+Math.random()*8:overlap+weirdness*2+Math.random()*6;
          return {brain,claim,score};
        }).sort((a,b)=>b.score-a.score);
        const winners=candidates.slice(0,Math.min(3,candidates.length));
        const verdict=winners.map(x=>x.claim).join(" ");
        history.push("GEN "+String(g).padStart(2,"0")+" // "+winners.map(x=>x.brain.replace("THE ","")).join(" + ")+" // "+verdict);
        const kernel=current.split(/(?<=[.!?])\s+/).slice(-2).join(" ");
        current=kernel+" HIVEMIND GEN "+g+" CONSENSUS: "+verdict;
      }
      return {text:current,history};
    }
    function renderHive(signal){
      if(!moduleOn(11)){document.querySelector("#hiveOut").textContent="[ HIVEMIND BYPASSED — individual thought temporarily permitted ]";document.querySelector("#hiveLog").innerHTML="";return signal}
      const h=hivemind(signal);
      document.querySelector("#hiveOut").textContent=h.text;
      document.querySelector("#hiveLog").innerHTML=h.history.map(x=>'<div class="hive-line">'+x.replace(/&/g,"&amp;").replace(/</g,"&lt;")+'</div>').join("");
      return h.text;
    }
    function finishStory({seed,name,job,want,word,rule,signal,calls,tone}){
      if(!moduleOn(12))return "[ STORY EXIT BYPASSED — signal fell out of the machine unfinished ]\\n\\n"+signal;
      const openings=[
        name+" had never planned to become a "+job+". The plan had been much simpler: "+want+".",
        "It started with one stupid idea: "+seed.replace(/[.!?]+$/,'')+". Unfortunately, "+name+" was exactly the kind of "+job+" who would test it.",
        "By the time anyone noticed the "+word+", "+name+" was already trying to use it to get "+want+"."
      ];
      const middles=[
        "The machine had opinions. After "+calls+" telephone call"+(calls===1?"":"s")+", several acts of linguistic vandalism, and a committee argument nobody remembered authorizing, its surviving version of events was this: "+signal,
        "Then the whole mess went through the Ridiculator, the Sauce Rack, the Telephone, GET-IT:GOT-IT, and finally the Hivemind. What survived was difficult to defend in court: "+signal,
        "Every stage changed the facts a little more until the Hivemind stamped the following wreckage APPROVED: "+signal
      ];
      const endings=[
        "And that was it. No feeding the ending back into the beginning. "+name+" stepped out carrying the only thing the machine was ever supposed to make: a story.",
        "The warning light blinked STORY COMPLETE. The machinery could be reiterated later, but this ending was allowed to remain an ending.",
        "Somewhere behind them the patch bay went quiet. The story had escaped. Anything run again would have to start from the machine's scraps, never from this ending."
      ];
      return pick(openings)+"\\n\\n"+pick(middles)+"\\n\\n"+pick(endings)+"\\n\\n[ EXIT // STORY COMPLETE // "+tone.toUpperCase()+" ]";
    }
    function holdSource(seed,calls,tone){
      const mode=document.querySelector("#sourceHandling").value,observer=mode==="observer"||mode==="talky",label=mode==="talky"?"TALKY TALK KNOW GEN // ONE OBSERVER":mode==="observer"?"ONE OBSERVER":"PERSONAL / PAST";
      const held=mode==="talky"?"TALKY TALK KNOW GEN // ONE OBSERVER\n\nI heard your words:\n“"+seed+"”\n\nWhat I know: those are the words you gave me.\nWhat I do not know: missing history, cause, intent, or details you did not enter.\nOne question: What should I understand next?":"PERSONAL / PAST SOURCE HELD // exact words, no machine additions:\n\n"+seed+"\n\nNo character, cause, motive, canon, symbol, or ending was generated.";
      document.querySelector("#wordOut").textContent="[SOURCE HELD]";document.querySelector("#wordMeta").textContent=label+" // no word extraction.";
      document.querySelector("#nameOut").textContent="NO CHARACTER INVENTED";document.querySelector("#characterOut").textContent="Identity, body, biography, desire, and cause are not generated in this mode.";
      document.querySelector("#fourLiteral").textContent="RAW SOURCE // “"+seed+"”";document.querySelector("#fourSubjective").textContent="HELD // no speaker state inferred.";document.querySelector("#fourSymbolic").textContent="HELD // no metaphor assigned.";document.querySelector("#fourBack").textContent="SOURCE PRESERVED // no assumptions released back into it.";
      document.querySelector("#poemOut").textContent="[PERSONAL / PAST SOURCE HELD]";document.querySelector("#storyOut").textContent=held;
      document.querySelector("#emojiOut").textContent="[HELD // no translation]";document.querySelector("#asciiOut").textContent="[HELD // no rendering]";
      document.querySelector("#canonOut").textContent="UNKNOWN STAYS UNKNOWN // no canon declared.";document.querySelector("#hiveOut").textContent=observer?"ONE OBSERVER // single listener; no consensus or extra voices.":"HIVEMIND BYPASSED // source held.";document.querySelector("#hiveLog").replaceChildren();
      const canvas=document.querySelector("#desire"),ctx=canvas.getContext("2d");ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle="#05070a";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle="#f4f7fb";ctx.font="800 30px ui-monospace,monospace";ctx.textAlign="center";ctx.fillText("SOURCE HELD",canvas.width/2,canvas.height/2);
      document.querySelector("#desireCaption").textContent=label+" // no desire or image invented.";document.querySelector("#runid").textContent=label+" // "+calls+" CALLS SKIPPED // "+tone.toUpperCase();
      lastPreHive=seed;lastSignal=seed;lastStoryContext=null;rootHumanSeed=seed;reiterationCount=0;
      document.querySelector("#reiterateStatus").innerHTML="<strong>SOURCE HOLD</strong> // story and telephone mutations paused // "+(observer?"ONE OBSERVER; no group consensus.":"personal / past account preserved.");
    }
    function run(extra=false,seedOverride=null){
      const fromHuman=seedOverride===null;
      const rawSeed=fromHuman?document.querySelector("#seed").value:String(seedOverride);
      const seed=document.querySelector("#sourceHandling").value!=="fiction"?rawSeed:rawSeed.trim()||"nothing happens and everyone is suspicious";
      if(fromHuman&&document.querySelector("#sourceHandling").value==="fiction"){learnLanguage(seed,1);rootHumanSeed=seed;reiterationCount=0}
      const four=interpretFour(fromHuman?seed:(rootHumanSeed||seed));if(fromHuman)renderFour(seed);
      const tone=document.querySelector("#tone").value, calls=Math.max(1,Math.min(100,+document.querySelector("#calls").value||1));
      if(document.querySelector("#sourceHandling").value!=="fiction"){holdSource(seed,calls,tone);return}
      let dmg=+damage.value;if(extra){dmg=Math.min(100,dmg+18);damage.value=dmg;damage.oninput()}
      const words=extract(seed); const rawWord=words.length?pick(words):pick(["thing","problem","machine"]);
      const word=moduleOn(0)?rawWord+"-"+pick(["engine","logic","ghost","crumb","weather","theory","juice","protocol"]):rawWord;
      const gurlOnly=characterLens.value==="gurl"&&moduleOn(1),manualOnly=characterLens.value==="manual"&&moduleOn(1);
      const name=moduleOn(1)?(manualOnly?(document.querySelector("#manualName").value.trim()||"Somebody"):pick(gurlOnly?gurlFirst:first)+" "+pick(last)):"Somebody";
      const job=moduleOn(1)?(manualOnly?(document.querySelector("#manualRole").value.trim()||"person"):pick(jobs)):"person";
      const desirePool=rawWord.includes("cat")?["a house with seventeen heated windows and absolutely no vacuum cleaners",...wants]:rawWord.includes("time")?["one afternoon that lasts exactly as long as they need",...wants]:rawWord.includes("machine")?["to build one impossible thing that actually works",...wants]:wants;
      const want=moduleOn(2)?pick(desirePool):"to understand what just happened";
      const rule="They may "+pick(verbs)+" anything, but never "+pick(["on Christmas","twice in the same timeline","while being observed","before breakfast","without filing Form 9-B","if a cat says no"])+".";
      const identity=manualOnly?"MANUAL IDENTITY // PRONOUNS: "+(document.querySelector("#manualPronouns").value.trim()||"␀ / unspecified")+(document.querySelector("#manualRole").value.trim()?" // ROLE: "+document.querySelector("#manualRole").value.trim():" // ROLE: ␀ / unspecified"):gurlOnly?"GURL ONLY // SHE/HER // generated character lens; body and biography unspecified":"OPEN LENS // generated identity unspecified";
      const lore=cap(seed.replace(/[.!?]+$/,""))+". "+name+(gurlOnly?", a gurl and "+job:manualOnly?", "+job:", a "+job)+", discovers that this somehow means "+pick(["the city owes the moon back rent","time is a refundable beverage","the warning label is legally a parent","every copy is technically the original","the government has been using the wrong Tuesday","the machine has unionized against causality"])+".";
      const lines=[
        name+", keeper of the "+word+", wanted "+want+",",
        "so "+(words[0]||word)+" arrived "+pick(weird)+".",
        "The "+word+" said, “"+pick(["absolutely not","GET IT?","receipt required","try being impossible harder","I remember the future"])+".”",
        "By morning, "+pick(["the mayor was a coupon","the moon had a lawyer","history owed them lunch","everybody pretended this was normal","the machine had written a sequel"])+"."
      ];
      let mutation=lore+" "+rule+" CHARACTER LENS // "+identity+". FOUR-WAY HUMAN INPUT // "+four.bus+".";
      if(moduleOn(4)) mutation+=" RIDICULATOR // absurd fictional cause for the machine plot only: "+pick(["a forbidden noun","three raccoons in a trench coat","a clerical dragon","too much foreshadowing","an improperly licensed metaphor"])+" "+pick(weird)+". HUMAN STORY FIREWALL // no real-world cause, motive, body, or memory inferred.";
      if(moduleOn(5)) mutation+=" SAUCED["+["DRY HERB","LIQUID","POWDER","VAPOR"][Math.floor(moduleLevel(5)/26)%4]+"]: "+pick(["sentences now stick to the ceiling","adjectives have entered the bloodstream","punctuation has become airborne","meaning is technically a soup"])+".";
      if(moduleOn(9)) mutation+=" After "+calls+" telephone call"+(calls===1?"":"s")+", everybody remembers it as: "+cap((words.slice().reverse().slice(0,5).join(" ")||"the thing happened"))+" "+pick(weird)+".";
      const canon="GET-IT: If "+name+" wants "+want+", then the "+word+" must somehow be capable of helping. GOT-IT: "+pick(["That implication is now legally binding.","The loophole has been stamped CANON.","Reality has 30 days to appeal.","Nobody read the terms. Too late."]);
      if(moduleOn(10)) mutation+=" "+canon;
      if(dmg>55&&moduleOn(7))mutation+=" "+["☎️📎⚠️","🧠🥤🌀","🦆⚖️🌙","🧾🔥✨"][Math.floor(Math.random()*4)];
      let finalText=moduleOn(6)?glitch(mutation,Math.min(100,(dmg+moduleLevel(6))/2)):mutation;
      if(cosmicBest)finalText+=" COSMIC PIXEL HARVEST ["+cosmicBest.name+" // Q"+cosmicBest.score+" // "+cosmicBest.kitchen+"] survived the tubular collider and enters the pre-story bus.";
      lastPreHive=finalText;
      lastSignal=renderHive(lastPreHive);
      lastStoryContext={seed,name,job,want,word,rule,calls,tone};
      const story=finishStory({...lastStoryContext,signal:lastSignal});
      document.querySelector("#wordOut").textContent=word;
      document.querySelector("#wordMeta").textContent="seed vocabulary → "+tone+" // word signal "+moduleLevel(0)+"%";
      document.querySelector("#nameOut").textContent=name;
      document.querySelector("#characterOut").textContent=job+"\nLENS: "+identity+"\nDESIRE: "+want+"\nRULE: "+rule;
      document.querySelector("#poemOut").textContent=moduleOn(3)?lines.map(x=>moduleOn(6)?glitch(x,Math.max(0,dmg-25)) : x).join("\n"):"[ POEM GEN BYPASSED ]";
      document.querySelector("#storyOut").textContent=story;
      document.querySelector("#emojiOut").textContent=moduleOn(7)?("🧍 "+(want.includes("house")?"🏠":want.includes("moon")?"🌙":want.includes("friend")?"🫂":"✨")+" "+(rawWord.includes("machine")?"⚙️":"💭")+" 📞".repeat(Math.min(5,Math.ceil(calls/10)))+" 💥"):"[ EMOJI BYPASSED ]";
      document.querySelector("#asciiOut").textContent=moduleOn(8)?(" /\\_/\\\n( o.o )  "+word.slice(0,16)+"\n > ^ <   [ "+name.split(" ")[0]+" ]\n===< TELEPHONE >==="):"[ ASCII BYPASSED ]";
      document.querySelector("#canonOut").textContent=moduleOn(10)?canon:"[ GET-IT : GOT-IT BYPASSED — reality temporarily safe ]";
      document.querySelector("#runid").textContent="RUN // "+String(Math.floor(Math.random()*999999)).padStart(6,"0")+" // "+calls+" CALLS";
      document.querySelector("#desireCaption").textContent=name.toUpperCase()+" DESIRES: "+want+". The Desire-O-Vision turns that into a symbolic dream image and feeds the result forward as story canon.";
      drawVision(name,want,seed+Date.now());
      document.querySelectorAll(".panel").forEach(x=>{x.classList.remove("blink");void x.offsetWidth;x.classList.add("blink")});
    }
    function reiterateWorld(){
      if(document.querySelector("#sourceHandling").value!=="fiction"){document.querySelector("#reiterateStatus").innerHTML="<strong>SOURCE HOLD</strong> // reiteration bypassed; no telephone mutations were added.";return {reiteration:reiterationCount,scraps:0,storyFeedback:false}}
      if(!lastStoryContext)run(false);
      const scraps=[
        "WORD "+document.querySelector("#wordOut").textContent,
        "CHARACTER "+document.querySelector("#nameOut").textContent+" "+document.querySelector("#characterOut").textContent,
        "POEM "+document.querySelector("#poemOut").textContent,
        "EMOJI "+document.querySelector("#emojiOut").textContent,
        "ASCII "+document.querySelector("#asciiOut").textContent,
        "CANON "+document.querySelector("#canonOut").textContent,
        "PREHIVE "+lastPreHive
      ].filter(x=>x.trim());
      for(let i=scraps.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[scraps[i],scraps[j]]=[scraps[j],scraps[i]]}
      const seen=new Set(),wiggled=[];
      extract(scraps.join(" ")).forEach(w=>{const k=w.toLowerCase();if(!seen.has(k)&&wiggled.length<34){seen.add(k);wiggled.push(w)}});
      reiterationCount++;
      const human=rootHumanSeed||document.querySelector("#seed").value.trim()||"nothing";
      const kernel=human.replace(/[.!?]+$/,'')+". REITERATION "+reiterationCount+" // <VARY>[VARY] intermediate bus: "+wiggled.join(" ")+". The route changed; the final story from the previous run is explicitly not on this bus.";
      run(false,kernel);
      document.querySelector("#reiterateStatus").innerHTML="<strong>REITERATION "+String(reiterationCount).padStart(2,"0")+" COMPLETE</strong> // "+scraps.length+" intermediate rails wiggled // STORY EXIT EXCLUDED // FATE PROFILE NOT TRAINED ON MACHINE OUTPUT";
      document.querySelector("#runid").textContent+=" // ↻"+reiterationCount;
      return {reiteration:reiterationCount,scraps:scraps.length,storyFeedback:false};
    }
    document.querySelector("#go").onclick=()=>run(false);
    document.querySelector("#sourceHandling").onchange=()=>{if(document.querySelector("#sourceHandling").value!=="fiction")run(false)};
    document.querySelector("#panic").onclick=()=>run(true);
    document.querySelector("#randomRandom").onclick=()=>{const result=randomRandom();commandPrint("RANDOM RANDOM // "+result,"ok")};
    document.querySelector("#totalUpgrade").onclick=()=>fakeTotalUpgrade();
    document.querySelector("#hiveGo").onclick=()=>reargueWithThought();
    document.querySelector("#reiterateGo").onclick=()=>reiterateWorld();
    document.querySelector("#thinkGo").onclick=()=>{try{const r=appraiseThought(document.querySelector("#thoughtInput").value);if(r.good)document.querySelector("#thoughtInput").value=""}catch(err){document.querySelector("#thoughtScore").textContent="ERR // "+err.message}};
    document.querySelector("#rearGo").onclick=rearFeed;
    function randomRandom(){
      if(document.querySelector("#sourceHandling").value!=="fiction")return "SOURCE HELD // Random Random did not change the source.";
      const a=["a haunted printer","three raccoons","a bored child","the moon's lawyer","an unemployed wizard","a suspicious cat","a vending machine","a tiny government","someone from tomorrow","a coupon with feelings"];
      const b=["invents","accidentally marries","puts on trial","downloads","elects","misremembers","sells","clones","argues with","finds inside a cereal box"];
      const c=["time travel","a second Tuesday","God's receipt","an illegal breakfast","the last normal idea","a machine that makes machines","a legally binding ghost","the concept of money","a forbidden button","an extremely local apocalypse"];
      const d=["and nobody is allowed to admit it worked","until Christmas gets subpoenaed","so history asks for a refund","but the cat owns the patent","and Congress has to watch","which somehow becomes municipal law","before reality can unplug it","and the warning label becomes a religion"];
      document.querySelector("#seed").value=cap(pick(a))+" "+pick(b)+" "+pick(c)+", "+pick(d)+".";
      const toneEl=document.querySelector("#tone");toneEl.selectedIndex=Math.floor(Math.random()*toneEl.options.length);
      document.querySelector("#calls").value=1+Math.floor(Math.random()*100);
      damage.value=Math.floor(Math.random()*101);damage.oninput();
      document.querySelector("#brains").value=3+Math.floor(Math.random()*10);
      document.querySelector("#gens").value=1+Math.floor(Math.random()*12);
      const consensusEl=document.querySelector("#consensus");consensusEl.selectedIndex=Math.floor(Math.random()*consensusEl.options.length);
      rerollBounty();
      [...chain.children].forEach((el,i)=>{
        el.querySelector("input").value=Math.floor(Math.random()*101);
        if(i===12)return;
        const on=Math.random()>=.5;el.classList.toggle("on",on);el.querySelector(".toggle").setAttribute("aria-pressed",on);
      });
      run(false);
      return document.querySelector("#calls").value+" CALLS // "+damage.value+"% DAMAGE // "+[...chain.children].filter(x=>x.classList.contains("on")).length+"/"+moduleDefs.length+" MODULES ON";
    }
    let upgradeBusy=false;
    function fakeTotalUpgrade(){
      if(upgradeBusy)return false;upgradeBusy=true;
      const overlay=document.querySelector("#upgradeOverlay"),stage=document.querySelector("#upgradeStage"),bar=document.querySelector("#upgradeBar"),zero=document.querySelector("#upgradeZero"),button=document.querySelector("#totalUpgrade");
      const stages=[
        [4,"Locating the part that needs more TOTAL…"],
        [13,"Upgrading the upgrade subsystem…"],
        [31,"Installing PREMIUM NOTHING…"],
        [49,"Optimizing button curvature…"],
        [67,"Making the Hivemind look more expensive…"],
        [82,"Converting existing features into the exact same features…"],
        [96,"Applying irreversible-looking reversible-looking changes…"],
        [99,"Stuck at 99%. This proves it is serious."],
        [100,"SYSTEM IMPROVED BEYOND MEASUREMENT"]
      ];
      overlay.classList.add("show");button.disabled=true;zero.textContent="";bar.style.width="0%";let i=0;
      const timer=setInterval(()=>{
        const [pct,msg]=stages[i++];bar.style.width=pct+"%";stage.textContent=pct+"% // "+msg;
        if(i===stages.length){clearInterval(timer);zero.textContent="✓ TOTAL UPGRADE COMPLETE\n0 FEATURES ADDED // 0 SETTINGS CHANGED // +0 EVERYTHING";setTimeout(()=>{overlay.classList.remove("show");button.disabled=false;bar.style.width="0%";upgradeBusy=false},1300)}
      },240);return true;
    }
    const commandLog=document.querySelector("#commandLog"), commandInput=document.querySelector("#commandInput"), commandHistory=[];
    let commandHistoryAt=0;
    function commandPrint(message,kind=""){
      const line=document.createElement("div");
      line.className=kind?"cmd-"+kind:"";
      line.textContent=String(message);
      commandLog.appendChild(line);
      commandLog.scrollTop=commandLog.scrollHeight;
    }
    function commandTokens(source){
      const tokens=[]; source.replace(/"([^"]*)"|'([^']*)'|(\S+)/g,(_,dq,sq,bare)=>{tokens.push(dq??sq??bare);return _}); return tokens;
    }
    function commandModule(query){
      const q=String(query||"").trim(); if(!q)return null;
      if(/^\d+$/.test(q)){const i=+q-1;return i>=0&&i<moduleDefs.length?i:null}
      const clean=q.toLowerCase().replace(/[^a-z0-9]+/g,"");
      return moduleDefs.findIndex(m=>m[0].toLowerCase().replace(/[^a-z0-9]+/g,"").includes(clean));
    }
    function commandSetModule(i,state){
      if(i===12)throw new Error("STORY // EXIT is hardwired ON. Nice try.");
      const el=chain.children[i], next=state==="toggle"?!moduleOn(i):state;
      el.classList.toggle("on",next);el.querySelector(".toggle").setAttribute("aria-pressed",next);
      return (i+1)+" "+moduleDefs[i][0]+" => "+(next?"ON":"BYPASS");
    }
    function commandStatus(){
      const active=[...chain.children].filter(x=>x.classList.contains("on")).length;
      return "SEED: "+document.querySelector("#seed").value.trim()+"\nFLAVOR: "+document.querySelector("#tone").value+" | CALLS: "+document.querySelector("#calls").value+" | DAMAGE: "+damage.value+"%\nHIVE: "+document.querySelector("#brains").value+" brains × "+document.querySelector("#gens").value+" gens | "+document.querySelector("#consensus").value+"\nPATCH BAY: "+active+"/"+moduleDefs.length+" modules ON";
    }
    function runCommand(source){
      const tokens=commandTokens(source.trim()); if(!tokens.length)return;
      learnLanguage(source,1);
      const cmd=tokens.shift().toLowerCase(), args=tokens;
      const joined=args.join(" ").trim();
      commandPrint("moz@reality:$ "+source,"in");
      try{
        if(cmd==="help"||cmd==="?"){
          commandPrint("HELP        show this mess\nSTATUS      inspect the machine\nSEED <text>  read/set input bullshit\nTONE <name>  set flavor\nCALLS <1-100> | DAMAGE <0-100>\nBRAINS <3-12> | GENS <1-12>\nCONSENSUS interesting|majority|chaos\nTHINK <text> appraise thought for $ + fuel + loot\nBOUNTY      inspect the current thought bounty\nWALLET      fake money + fuel balance\nLOOT        inventory dump\nMODULES     list patch bay\nON/OFF/TOGGLE <#|name>\nINTENSITY <#|name> <0-100>\nGO          run the whole machine\nREITERATE   wiggle intermediate rails + run again; story stays EXIT\nRANDOM      RANDOM RANDOM EVERYTHING + GO + bounty reroll\nUPGRADE     perform a TOTAL UPGRADE of absolutely nothing\nPANIC       +18 damage and run\nHIVE        spend 1 thought fuel to re-argue\nGITTET [text]  optionally seed + GO\nGODDIT      print the canon receipt\nCLEAR       wipe this prompt", "dim");
        }else if(cmd==="clear"){commandLog.textContent="";
        }else if(cmd==="status"){commandPrint(commandStatus(),"ok");
        }else if(cmd==="seed"){
          if(joined){document.querySelector("#seed").value=joined;renderFour(joined)}
          commandPrint("SEED => "+document.querySelector("#seed").value,"ok");
        }else if(cmd==="tone"){
          if(!joined)return commandPrint("TONE => "+document.querySelector("#tone").value,"ok");
          const option=[...document.querySelector("#tone").options].find(o=>o.value.toLowerCase()===joined.toLowerCase());
          if(!option)throw new Error("unknown tone; try: "+[...document.querySelector("#tone").options].map(o=>o.value).join(" | "));
          document.querySelector("#tone").value=option.value;commandPrint("TONE => "+option.value,"ok");
        }else if(["calls","damage","brains","gens"].includes(cmd)){
          const specs={calls:["#calls",1,100],damage:["#damage",0,100],brains:["#brains",3,12],gens:["#gens",1,12]},spec=specs[cmd],n=Number(args[0]);
          if(!Number.isFinite(n))throw new Error(cmd.toUpperCase()+" needs a number from "+spec[1]+" to "+spec[2]);
          const v=Math.round(Math.max(spec[1],Math.min(spec[2],n)));document.querySelector(spec[0]).value=v;if(cmd==="damage")damage.oninput();commandPrint(cmd.toUpperCase()+" => "+v,"ok");
        }else if(cmd==="consensus"){
          const aliases={"most interesting survives":"interesting","majority hallucination":"majority","least sane wins":"chaos"},v=aliases[joined.toLowerCase()]||joined.toLowerCase();
          if(!["interesting","majority","chaos"].includes(v))throw new Error("consensus must be interesting, majority, or chaos");
          document.querySelector("#consensus").value=v;commandPrint("CONSENSUS => "+v,"ok");
        }else if(cmd==="think"){
          const r=appraiseThought(joined);commandPrint("APPRAISAL "+r.score+"/100 // "+r.verdict,r.good?"ok":"bad");
        }else if(cmd==="bounty"){commandPrint(currentBounty.name+" // "+currentBounty.hint+" // "+bountyMultiplier+"× PAY // $"+bountyJackpot+" JACKPOT @ 85+","ok");
        }else if(cmd==="wallet"){commandPrint("BRAIN TREASURY => $"+wallet.toLocaleString()+" // "+thoughtQueue.length+" FUEL","ok");
        }else if(cmd==="loot"){commandPrint(inventory.length?("LOOT // "+inventory.join(" | ")):"LOOT // empty pockets. score 65+ to start dropping junk.",inventory.length?"ok":"dim");
        }else if(cmd==="modules"){
          commandPrint(moduleDefs.map((m,i)=>String(i+1).padStart(2,"0")+" ["+(moduleOn(i)?"ON ":"OFF")+"] "+m[0]+" @ "+moduleLevel(i)+"%").join("\n"),"dim");
        }else if(["on","off","toggle"].includes(cmd)){
          const i=commandModule(joined);if(i<0||i===null)throw new Error("module not found; use MODULES for names/numbers");
          commandPrint(commandSetModule(i,cmd==="toggle"?"toggle":cmd==="on"),"ok");
        }else if(cmd==="intensity"){
          if(args.length<2)throw new Error("usage: INTENSITY <#|name> <0-100>");
          const n=Number(args.at(-1)),q=args.slice(0,-1).join(" "),i=commandModule(q);if(i<0||i===null)throw new Error("module not found");if(!Number.isFinite(n))throw new Error("intensity needs 0-100");
          const v=Math.round(Math.max(0,Math.min(100,n)));chain.children[i].querySelector("input").value=v;commandPrint(moduleDefs[i][0]+" INTENSITY => "+v+"%","ok");
        }else if(cmd==="go"||cmd==="run"){run(false);commandPrint("RUN COMPLETE // story exited cleanly.","ok");
        }else if(cmd==="random"||(cmd==="random-random")){commandPrint("RANDOM RANDOM // "+randomRandom(),"ok");
        }else if(cmd==="upgrade"||cmd==="total-upgrade"){const ok=fakeTotalUpgrade();commandPrint(ok?"TOTAL UPGRADE STARTED // expected gains: none":"TOTAL UPGRADE ALREADY BUSY DOING NOTHING",ok?"ok":"dim");
        }else if(cmd==="panic"){run(true);commandPrint("PANIC ACCEPTED // DAMAGE => "+damage.value+"%","ok");
        }else if(cmd==="hive"){const ok=reargueWithThought();commandPrint(ok?"HIVEMIND RE-ARGUED // 1 FUEL CONSUMED.":"HIVE DENIED // NO FUEL // THINK <text> first",ok?"ok":"bad");
        }else if(cmd==="reiterate"||cmd==="again"){const r=reiterateWorld();commandPrint("REITERATE "+r.reiteration+" // "+r.scraps+" INTERMEDIATE RAILS // STORY FEEDBACK: "+(r.storyFeedback?"YES":"NO"),"ok");
        }else if(cmd==="gittet"){
          if(joined){document.querySelector("#seed").value=joined;renderFour(joined)}run(false);commandPrint("GITTET => "+document.querySelector("#canonOut").textContent,"ok");
        }else if(cmd==="goddit"){
          if(!lastSignal)run(false);commandPrint("GODDIT => "+document.querySelector("#canonOut").textContent,"ok");
        }else throw new Error("command not found: "+cmd+" // type HELP");
      }catch(err){commandPrint("ERR // "+err.message,"bad")}
    }
    commandInput.addEventListener("keydown",e=>{
      if(e.key==="Enter"){
        const source=commandInput.value.trim();if(!source)return;e.preventDefault();commandHistory.push(source);commandHistoryAt=commandHistory.length;commandInput.value="";runCommand(source);
      }else if(e.key==="ArrowUp"){
        if(!commandHistory.length)return;e.preventDefault();commandHistoryAt=Math.max(0,commandHistoryAt-1);commandInput.value=commandHistory[commandHistoryAt]||"";
      }else if(e.key==="ArrowDown"){
        if(!commandHistory.length)return;e.preventDefault();commandHistoryAt=Math.min(commandHistory.length,commandHistoryAt+1);commandInput.value=commandHistory[commandHistoryAt]||"";
      }
    });
    commandPrint("GITTET|GODDIT SHELL v1.0 // reality mounted read/write.","ok");
    commandPrint("Type HELP. ↑/↓ recalls your bad decisions.","dim");
    rerollBounty();renderEconomy();renderFate();
    if(document.modelContext?.registerTool){
      const register=()=>document.modelContext.registerTool({
        name:"generate_bullshit",
        title:"Run Bullshit Telephone World",
        description:"Feed an idea through the visible Bullshit Telephone World generator chain.",
        inputSchema:{type:"object",properties:{seed:{type:"string"},tone:{type:"string"},calls:{type:"integer",minimum:1,maximum:100},damage:{type:"integer",minimum:0,maximum:100}},required:["seed"],additionalProperties:false},
        annotations:{readOnlyHint:false,untrustedContentHint:true},
        execute(input){
          if(!input||typeof input.seed!=="string"||!input.seed.trim())throw new Error("seed must be a non-empty string");
          document.querySelector("#seed").value=input.seed;
          if(input.tone&&[...document.querySelector("#tone").options].some(o=>o.value===input.tone))document.querySelector("#tone").value=input.tone;
          if(Number.isInteger(input.calls)){document.querySelector("#calls").value=Math.max(1,Math.min(100,input.calls))}
          if(Number.isInteger(input.damage)){damage.value=Math.max(0,Math.min(100,input.damage));damage.oninput()}
          run(false);
          return {word:document.querySelector("#wordOut").textContent,character:document.querySelector("#nameOut").textContent,desire:document.querySelector("#desireCaption").textContent,canon:document.querySelector("#canonOut").textContent};
        }
      });
      Promise.resolve(register()).catch(()=>{});
      Promise.resolve(document.modelContext.registerTool({
        name:"reiterate_hivemind",
        title:"Re-Argue Before Story",
        description:"Re-run the pre-story signal through multiple competing hive brains and consensus generations, then exit by writing a new final story. The story is never fed back.",
        inputSchema:{type:"object",properties:{brains:{type:"integer",minimum:3,maximum:12},generations:{type:"integer",minimum:1,maximum:12},consensus:{type:"string",enum:["interesting","majority","chaos"]}},additionalProperties:false},
        annotations:{readOnlyHint:false,untrustedContentHint:true},
        execute(input){
          if(document.querySelector("#sourceHandling").value!=="fiction"){holdSource(document.querySelector("#seed").value,+document.querySelector("#calls").value,document.querySelector("#tone").value);return {sourceHeld:true};}
          if(Number.isInteger(input?.brains))document.querySelector("#brains").value=input.brains;
          if(Number.isInteger(input?.generations))document.querySelector("#gens").value=input.generations;
          if(input?.consensus)document.querySelector("#consensus").value=input.consensus;
          if(!lastSignal)run(false); else {lastSignal=renderHive(lastPreHive);document.querySelector("#storyOut").textContent=finishStory({...lastStoryContext,signal:lastSignal})}
          return {consensus:lastSignal,generations:+document.querySelector("#gens").value,brains:+document.querySelector("#brains").value};
        }
      })).catch(()=>{});
    }
    // COSMIC PIXEL COLLIDER // a cellular automaton living on a torus, with very fake accelerator paperwork.
    const colliderCanvas=document.querySelector("#colliderCanvas"),colliderCtx=colliderCanvas.getContext("2d");
    const harvestCanvas=document.querySelector("#harvestCanvas"),harvestCtx=harvestCanvas.getContext("2d");
    const LIFE_U=64,LIFE_V=24,LIFE_N=LIFE_U*LIFE_V;
    let life=new Uint8Array(LIFE_N),lifeAge=new Uint8Array(LIFE_N),lifeOld=new Uint8Array(LIFE_N),lifeGen=0,colliderRunning=true,colliderLast=0,colliderAccum=0,beamPhase=0,activeIP=0,colliderYaw=.18,colliderPitch=-.42,colliderZoom=1,colliderDrag=null,harvestCount=0,mouseTrapArmed=true;
    const lifeIndex=(u,v)=>((u+LIFE_U)%LIFE_U)*LIFE_V+((v+LIFE_V)%LIFE_V);
    function colliderSeed(mode="random"){
      life.fill(0);lifeAge.fill(0);lifeOld.fill(0);lifeGen=0;
      if(mode==="random"){
        for(let i=0;i<LIFE_N;i++)life[i]=Math.random()<.235?1:0;
      }else if(mode==="kitchen"){
        const stamps=[[[0,1],[1,2],[2,0],[2,1],[2,2]],[[0,0],[1,0],[2,0]],[[0,0],[0,1],[1,0],[1,1]]];
        for(let n=0;n<18;n++){const s=stamps[n%stamps.length],ou=Math.floor(Math.random()*LIFE_U),ov=Math.floor(Math.random()*LIFE_V);s.forEach(([a,b])=>life[lifeIndex(ou+a,ov+b)]=1)}
      }
      lifeOld.set(life);drawCollider();updateColliderHud("NEW "+(mode==="kitchen"?"KITCHEN BAIT":"COSMIC SOUP"));
    }
    function parseLifeRule(){
      const value=document.querySelector("#lifeRule").value,[b,s]=value.split("/");
      return {born:new Set(b.slice(1).split("").filter(Boolean).map(Number)),survive:new Set(s.slice(1).split("").filter(Boolean).map(Number))};
    }
    function lifeStep(forceCollision=false){
      const rule=parseLifeRule(),next=new Uint8Array(LIFE_N),nextAge=new Uint8Array(LIFE_N),noise=+document.querySelector("#cosmicMutation").value/10000;
      if(lifeGen%5===0)lifeOld.set(life);
      for(let u=0;u<LIFE_U;u++)for(let v=0;v<LIFE_V;v++){
        const at=lifeIndex(u,v);let n=0;
        for(let du=-1;du<=1;du++)for(let dv=-1;dv<=1;dv++)if(du||dv)n+=life[lifeIndex(u+du,v+dv)];
        let on=life[at]?rule.survive.has(n):rule.born.has(n);if(Math.random()<noise)on=!on;
        next[at]=on?1:0;nextAge[at]=on?Math.min(255,lifeAge[at]+1):0;
      }
      life=next;lifeAge=nextAge;lifeGen++;beamPhase=(beamPhase+.035+(+document.querySelector("#beamEnergy").value/100)*.055)%(Math.PI*2);
      if(forceCollision||lifeGen%17===0)injectCollision(forceCollision?1.55:1);
      if(lifeGen%29===0)harvestCosmic(true);
      updateColliderHud();
    }
    function injectCollision(mult=1){
      const energy=+document.querySelector("#beamEnergy").value,center=Math.floor(activeIP*LIFE_U/4),bursts=Math.round((5+energy*.18)*mult);
      for(let i=0;i<bursts;i++){
        const du=Math.round((Math.random()-.5)*Math.max(3,energy/8)),dv=Math.round((Math.random()-.5)*Math.max(3,energy/13));
        const idx=lifeIndex(center+du,Math.floor(LIFE_V/2)+dv);life[idx]=1;lifeAge[idx]=1;
        if(energy>68&&Math.random()>.48)life[lifeIndex(center-du,Math.floor(LIFE_V/2)-dv)]=1;
      }
      activeIP=(activeIP+1)%4;updateColliderHud("COLLISION @ IP-"+(activeIP===0?4:activeIP));
    }
    function specimenWindow(ip){
      const w=12,h=12,c=Math.floor(ip*LIFE_U/4),grid=new Uint8Array(w*h),ages=[];let live=0,transitions=0,persist=0;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const u=c+x-Math.floor(w/2),v=Math.floor(LIFE_V/2)+y-Math.floor(h/2),src=lifeIndex(u,v),i=y*w+x,val=life[src];grid[i]=val;
        if(val){live++;ages.push(lifeAge[src]);if(lifeOld[src])persist++}
        if(x&&val!==grid[i-1])transitions++;if(y&&val!==grid[i-w])transitions++;
      }
      const density=live/(w*h),densityScore=Math.max(0,1-Math.abs(density-.30)/.30),structure=Math.min(1,transitions/(w*h*.72)),persistence=live?persist/live:0;
      let novelty=1;if(cosmicBest?.grid){let diff=0;for(let i=0;i<grid.length;i++)diff+=grid[i]!==cosmicBest.grid[i];novelty=Math.min(1,.25+diff/grid.length)}
      const age=ages.length?ages.reduce((a,b)=>a+b,0)/ages.length:0,longevity=Math.min(1,age/7),score=Math.round(100*(densityScore*.24+structure*.23+persistence*.21+novelty*.20+longevity*.12));
      return {ip,grid,live,density,score,structure,persistence,novelty,longevity};
    }
    function specimenName(grid,ip){
      const code=[...grid].map(x=>x?"1":"0").join(""),h=hash(code+ip+lifeGen),a=["Loop","Pixel","Quark","Crumb","Halo","Spoon","Orbit","Muon","Soup","Ghost"],b=["mouse","moth","dumpling","engine","sprout","noodle","beetle","waffle","blob","whisker"];return (a[h%a.length]+b[(h>>>5)%b.length]).toUpperCase()+"-"+String(h%1000).padStart(3,"0");
    }
    function kitchenTest(spec){
      const h=hash([...spec.grid].join("")+spec.score),roles=["PET // follows the prep cook","FOOD? // nobody is brave enough to taste it","NEST // occupies the warm proofing shelf","TOOL // excellent tiny whisk behavior","PARASITE // stealing exactly one crumb per hour","SOUS-CHEF // somehow knows mise en place","SPICE // tastes like blue electricity","DISH PIT GOD // eats impossible leftovers"];
      const animal=fateState.match?kitchenAnimals.find(a=>a.name===fateState.match.name):kitchenAnimals[h%kitchenAnimals.length];return animal.name.toUpperCase()+" THE "+animal.species+": "+roles[(h>>>7)%roles.length];
    }
    function harvestCosmic(auto=false){
      const candidates=[0,1,2,3].map(specimenWindow).sort((a,b)=>b.score-a.score),s=candidates[0];harvestCount++;
      if(!cosmicBest||s.score>cosmicBest.score){s.name=specimenName(s.grid,s.ip);s.kitchen=kitchenTest(s);s.gen=lifeGen;cosmicBest=s;renderHarvest();if(mouseTrapArmed&&s.score>=72){colliderRunning=false;document.querySelector("#colliderToggle").textContent="▶ RESUME RING";updateColliderHud("🐭 MOUSE TRAP CAUGHT A GOOD ONE // "+s.name+" // Q"+s.score)}else updateColliderHud("NEW BEST // "+s.name+" // Q"+s.score)}
      else if(!auto)updateColliderHud("HARVEST Q"+s.score+" // BEST STILL Q"+cosmicBest.score);
      return s;
    }
    function renderHarvest(){
      harvestCtx.fillStyle="#050607";harvestCtx.fillRect(0,0,144,144);if(!cosmicBest)return;
      const cell=12;for(let y=0;y<12;y++)for(let x=0;x<12;x++){const on=cosmicBest.grid[y*12+x];harvestCtx.fillStyle=on?(cosmicBest.score>=80?"#70ff8d":"#ffe12c"):"#111820";harvestCtx.fillRect(x*cell+1,y*cell+1,cell-2,cell-2)}
      document.querySelector("#harvestName").textContent="BEST SPECIMEN // "+cosmicBest.name+" // IP-"+(cosmicBest.ip+1);
      document.querySelector("#harvestScore").textContent="QUALITY "+cosmicBest.score+" / 100 // "+(cosmicBest.score>=88?"HOLY SHIT, KEEP THIS ONE":cosmicBest.score>=72?"GOOD ONE // VAULTED":"INTERESTING GARBAGE // VAULTED FOR NOW");
      document.querySelector("#qualityBar").style.width=cosmicBest.score+"%";
      document.querySelector("#harvestTraits").textContent="PERSISTENCE "+Math.round(cosmicBest.persistence*100)+"% // STRUCTURE "+Math.round(cosmicBest.structure*100)+"% // NOVELTY "+Math.round(cosmicBest.novelty*100)+"% // GEN "+cosmicBest.gen;
      document.querySelector("#kitchenVerdict").textContent="🍳 "+cosmicBest.kitchen;
    }
    function torusProject(u,v){
      const R=2.25,r=.72,cu=Math.cos(u),su=Math.sin(u),cv=Math.cos(v),sv=Math.sin(v);let x=(R+r*cv)*cu,y=r*sv,z=(R+r*cv)*su;
      let x1=x*Math.cos(colliderYaw)-z*Math.sin(colliderYaw),z1=x*Math.sin(colliderYaw)+z*Math.cos(colliderYaw),y1=y*Math.cos(colliderPitch)-z1*Math.sin(colliderPitch),z2=y*Math.sin(colliderPitch)+z1*Math.cos(colliderPitch);
      const sc=colliderZoom*125*(5.8/(6.6+z2));return {x:colliderCanvas.width/2+x1*sc,y:colliderCanvas.height/2+y1*sc,z:z2,sc};
    }
    function temperatureHex(kelvin){
      const t=kelvin/100;let r,g,b;
      if(t<=66){r=255;g=99.4708025861*Math.log(t)-161.1195681661;b=t<=19?0:138.5177312231*Math.log(t-10)-305.0447927307}
      else{r=329.698727446*Math.pow(t-60,-0.1332047592);g=288.1221695283*Math.pow(t-60,-0.0755148492);b=255}
      return "#"+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,"0")).join("");
    }
    function setStoryLight(mode){
      const select=document.querySelector("#storyLightMode"),temp=document.querySelector("#beamTemp");
      select.value=mode;if(mode==="time")temp.value=5200;if(mode==="relax")temp.value=3000;
      updateBeamTemperature();
    }
    function updateBeamTemperature(){
      const kelvin=+document.querySelector("#beamTemp").value,color=temperatureHex(kelvin),mode=document.querySelector("#storyLightMode").value;
      document.querySelector("#beamTempOut").textContent=kelvin+" K";
      document.querySelector("#beamASwatch").style.background=color;document.querySelector("#beamBSwatch").style.background=color;
      document.querySelector("#storyLightReadout").textContent=(mode==="time"?"TIME STORY": "RELAX STORY")+" // "+kelvin+" K";
    }
    function drawCollider(){
      const c=colliderCtx,w=colliderCanvas.width,h=colliderCanvas.height;c.clearRect(0,0,w,h);const glow=c.createRadialGradient(w*.5,h*.48,20,w*.5,h*.48,w*.5);glow.addColorStop(0,"#102634");glow.addColorStop(.5,"#071017");glow.addColorStop(1,"#020304");c.fillStyle=glow;c.fillRect(0,0,w,h);
      c.lineWidth=1;c.strokeStyle="#24424d88";for(let vv=0;vv<Math.PI*2;vv+=Math.PI/4){c.beginPath();for(let i=0;i<=96;i++){const p=torusProject(i/96*Math.PI*2,vv);i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y)}c.stroke()}for(let uu=0;uu<Math.PI*2;uu+=Math.PI/8){c.beginPath();for(let i=0;i<=32;i++){const p=torusProject(uu,i/32*Math.PI*2);i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y)}c.stroke()}
      const dots=[];for(let u=0;u<LIFE_U;u++)for(let v=0;v<LIFE_V;v++)if(life[lifeIndex(u,v)]){const p=torusProject((u+.5)/LIFE_U*Math.PI*2,(v+.5)/LIFE_V*Math.PI*2);dots.push({...p,age:lifeAge[lifeIndex(u,v)]})}dots.sort((a,b)=>b.z-a.z);for(const p of dots){const size=Math.max(1.4,Math.min(5,2.3*p.sc/45));c.fillStyle=p.age>6?"#70ff8d":p.age>2?"#ffe12c":"#fff2a2";c.globalAlpha=Math.max(.3,1-(p.z+3)/13);c.fillRect(p.x-size/2,p.y-size/2,size,size)}c.globalAlpha=1;
      const beamColor=temperatureHex(+document.querySelector("#beamTemp").value);const drawBeam=(phase,color,dir)=>{c.strokeStyle=color;c.lineWidth=3;c.shadowBlur=13;c.shadowColor=color;c.beginPath();for(let j=0;j<14;j++){const a=phase*dir-j*.026*dir,p=torusProject(a,Math.PI);j?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y)}c.stroke();c.shadowBlur=0};drawBeam(beamPhase,beamColor,1);drawBeam(-beamPhase+.07,beamColor,-1);
      for(let i=0;i<4;i++){const p=torusProject(i*Math.PI/2,0);c.strokeStyle=i===activeIP?"#70ff8d":"#54656f";c.lineWidth=i===activeIP?3:1;c.beginPath();c.arc(p.x,p.y,i===activeIP?9:6,0,Math.PI*2);c.stroke();c.fillStyle=i===activeIP?"#70ff8d":"#73828b";c.font="800 10px ui-monospace,monospace";c.fillText("IP-"+(i+1),p.x+10,p.y-8)}
    }
    function updateColliderHud(note=""){
      const pop=life.reduce((a,b)=>a+b,0);document.querySelector("#colliderGen").textContent="GEN "+String(lifeGen).padStart(6,"0");document.querySelector("#colliderPop").textContent="PIXELS "+pop;document.querySelector("#colliderIP").textContent="IP-"+(activeIP+1)+" ARMED";
      if(note)document.querySelector("#colliderReadout").innerHTML="<strong>"+note+"</strong> // "+document.querySelector("#lifeRule").value+" // "+harvestCount+" harvests // "+(cosmicBest?"vault Q"+cosmicBest.score:"vault empty");
    }
    function colliderFrame(t){
      const speed=+document.querySelector("#colliderSpeed").value;if(colliderRunning){colliderAccum+=Math.min(70,t-colliderLast);const stepMs=420-speed*18;while(colliderAccum>stepMs){lifeStep();colliderAccum-=stepMs}}colliderLast=t;drawCollider();requestAnimationFrame(colliderFrame);
    }
    document.querySelector("#colliderToggle").onclick=e=>{colliderRunning=!colliderRunning;e.currentTarget.textContent=colliderRunning?"Ⅱ PAUSE RING":"▶ RESUME RING";updateColliderHud(colliderRunning?"RING RESUMED":"RING PAUSED")};
    document.querySelector("#colliderStep").onclick=()=>{lifeStep();drawCollider();updateColliderHud("SINGLE GENERATION")};
    document.querySelector("#colliderRandom").onclick=()=>colliderSeed("random");document.querySelector("#colliderKitchen").onclick=()=>colliderSeed("kitchen");document.querySelector("#colliderClear").onclick=()=>{life.fill(0);lifeAge.fill(0);lifeOld.fill(0);lifeGen=0;updateColliderHud("BEAM PIPE VACUUMED");drawCollider()};
    document.querySelector("#colliderHarvest").onclick=()=>harvestCosmic(false);document.querySelector("#colliderFire").onclick=()=>{for(let i=0;i<3;i++){injectCollision(1.8);lifeStep(true)}const caught=harvestCosmic(false);if(!(mouseTrapArmed&&caught.score>=72))updateColliderHud("BOTH BEAMS FIRED // DETECTOR RINGING")};
    document.querySelector("#mouseTrap").onclick=e=>{mouseTrapArmed=!mouseTrapArmed;e.currentTarget.textContent="🐭 MOUSE TRAP // "+(mouseTrapArmed?"ARMED":"OFF");updateColliderHud("MOUSE TRAP "+(mouseTrapArmed?"ARMED @ Q72":"DISARMED"))};
    document.querySelector("#colliderKeep").onclick=()=>{if(!cosmicBest)return updateColliderHud("NOTHING TO KEEP YET");colliderRunning=false;document.querySelector("#colliderToggle").textContent="▶ RESUME RING";updateColliderHud("SPECIMEN LOCKED // "+cosmicBest.name+" ENTERS PRE-STORY BUS")};
    ["colliderSpeed","beamEnergy","cosmicMutation"].forEach(id=>{const el=document.querySelector("#"+id),out=document.querySelector("#"+id+"Out");el.oninput=()=>out.textContent=el.value});document.querySelector("#lifeRule").onchange=()=>updateColliderHud("PHYSICS REWRITTEN");
    document.querySelector("#storyLightMode").onchange=e=>setStoryLight(e.target.value);
    document.querySelector("#beamTemp").oninput=()=>updateBeamTemperature();updateBeamTemperature();
    colliderCanvas.addEventListener("pointerdown",e=>{colliderDrag={x:e.clientX,y:e.clientY,yaw:colliderYaw,pitch:colliderPitch};colliderCanvas.setPointerCapture(e.pointerId)});colliderCanvas.addEventListener("pointermove",e=>{if(!colliderDrag)return;colliderYaw=colliderDrag.yaw+(e.clientX-colliderDrag.x)*.008;colliderPitch=Math.max(-1.25,Math.min(1.25,colliderDrag.pitch+(e.clientY-colliderDrag.y)*.008))});colliderCanvas.addEventListener("pointerup",()=>colliderDrag=null);colliderCanvas.addEventListener("pointercancel",()=>colliderDrag=null);colliderCanvas.addEventListener("wheel",e=>{e.preventDefault();colliderZoom=Math.max(.7,Math.min(1.45,colliderZoom*(e.deltaY>0?.94:1.06)))},{passive:false});
    colliderSeed("kitchen");renderHarvest();requestAnimationFrame(colliderFrame);

    // SOUND LAB // actual generated noises; codes are intentionally public-ish for console fuckery.
    const SFX=Object.freeze({START:"START",FUCK:"FUCK",COLLIDE:"COLLIDE",HARVEST:"HARVEST",BACK:"BACK",CHURCH:"CHURCH",JUSTICE:"JUSTICE",VOTE:"VOTE",KITCHEN:"KITCHEN",STORY:"STORY",NUL:"NUL",LOVE:"LOVE",RANDOM:"RANDOM",WIN:"WIN",LOSE:"LOSE"});
    window.BULLSHIT_SFX=SFX;
    let audioCtx=null,audioMaster=null,audioAnalyser=null,audioWaveData=null,soundEnabled=true,soundVolume=.55,ambientOsc=null,ambientOsc2=null,ambientGain=null,berryTick=0;
    const berryFrames=[],berryColors=["#ff3e9d","#a572ff","#27e2ff","#70ff8d","#ffe12c"];
    function ensureAudio(){
      if(!audioCtx){const AC=window.AudioContext||window.webkitAudioContext;if(!AC){document.querySelector("#soundStatus").textContent="WEB AUDIO // NOT SUPPORTED";return null}audioCtx=new AC();audioMaster=audioCtx.createGain();audioMaster.gain.value=soundVolume;audioAnalyser=audioCtx.createAnalyser();audioAnalyser.fftSize=1024;audioWaveData=new Uint8Array(audioAnalyser.fftSize);audioMaster.connect(audioAnalyser);audioAnalyser.connect(audioCtx.destination)}
      if(audioCtx.state==="suspended")audioCtx.resume().catch(()=>{});return audioCtx;
    }
    function sTone(freq,dur=.12,type="sine",gain=.16,delay=0,endFreq=null){
      const ac=ensureAudio();if(!ac||!soundEnabled)return;const t=ac.currentTime+delay,o=ac.createOscillator(),g=ac.createGain();o.type=type;o.frequency.setValueAtTime(Math.max(20,freq),t);if(endFreq)o.frequency.exponentialRampToValueAtTime(Math.max(20,endFreq),t+dur);g.gain.setValueAtTime(Math.max(.0001,gain),t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(g);g.connect(audioMaster);o.start(t);o.stop(t+dur+.02);
    }
    function sNoise(dur=.1,gain=.08,delay=0,center=1200){
      const ac=ensureAudio();if(!ac||!soundEnabled)return;const len=Math.max(1,Math.floor(ac.sampleRate*dur)),buf=ac.createBuffer(1,len,ac.sampleRate),data=buf.getChannelData(0);for(let i=0;i<len;i++)data[i]=Math.random()*2-1;const src=ac.createBufferSource(),f=ac.createBiquadFilter(),g=ac.createGain(),t=ac.currentTime+delay;src.buffer=buf;f.type="bandpass";f.frequency.value=center;f.Q.value=.7;g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);src.connect(f);f.connect(g);g.connect(audioMaster);src.start(t);src.stop(t+dur+.02);
    }
    function playSFX(code){
      if(!soundEnabled)return;ensureAudio();const c=String(code||"").toUpperCase();
      if(c===SFX.START){[196,247,294,392].forEach((f,i)=>sTone(f,.3,"triangle",.11,i*.055))}
      else if(c===SFX.FUCK){sNoise(.16,.16,0,360);sTone(78,.22,"sawtooth",.16,0,42);sTone(156,.08,"square",.06,.03)}
      else if(c===SFX.COLLIDE){sTone(95,.3,"sawtooth",.11,0,920);sTone(1100,.28,"square",.08,.015,120);sNoise(.22,.12,.06,1800)}
      else if(c===SFX.HARVEST){[660,880,1320].forEach((f,i)=>sTone(f,.16,"sine",.12,i*.07))}
      else if(c===SFX.BACK){[760,570,410,300,410,570].forEach((f,i)=>sTone(f,.12,"triangle",.085,i*.055))}
      else if(c===SFX.CHURCH){sTone(174,.95,"sine",.15);sTone(261,.82,"sine",.09,.015);sTone(348,.62,"sine",.055,.025)}
      else if(c===SFX.JUSTICE){sTone(82,.18,"square",.15);sTone(164,.28,"triangle",.11,.09);sNoise(.06,.06,.02,220)}
      else if(c===SFX.VOTE){[440,554,659,880].forEach((f,i)=>sTone(f,.07,"square",.055,i*.075))}
      else if(c===SFX.KITCHEN){sTone(640,.09,"sine",.09,0,980);sTone(820,.1,"sine",.08,.11,1250);sTone(510,.06,"triangle",.05,.23)}
      else if(c===SFX.STORY){sTone(112,.55,"sawtooth",.07,0,93);sTone(119,.5,"triangle",.065,.03,101);sNoise(.3,.035,.08,620)}
      else if(c===SFX.NUL){sTone(1040,.045,"square",.07);sTone(1040,.045,"square",.07,.11)}
      else if(c===SFX.LOVE){[261.63,329.63,392,523.25].forEach((f,i)=>sTone(f,.55,"sine",.075,i*.035))}
      else if(c===SFX.RANDOM){for(let i=0;i<6;i++)sTone(120+Math.random()*1200,.05+Math.random()*.14,pick(["sine","square","triangle"]),.05,i*.045)}
      else if(c===SFX.WIN){[262,330,392,523,659,784].forEach((f,i)=>sTone(f,.3,"triangle",.09,i*.08))}
      else if(c===SFX.LOSE){sTone(190,.7,"sawtooth",.08,0,61);sNoise(.42,.055,.08,180)}
      document.querySelector("#soundStatus").textContent="PLAY // SFX."+c;
    }
    window.playBullshitSFX=playSFX;
    function setAmbience(on){
      const ac=ensureAudio();if(!ac)return;if(!on){[ambientOsc,ambientOsc2].forEach(o=>{try{o?.stop()}catch{}});ambientOsc=ambientOsc2=ambientGain=null;document.querySelector("#soundAmbience").textContent="〰 COLLIDER HUM // OFF";return}
      if(ambientOsc)return;ambientGain=ac.createGain();ambientGain.gain.value=.055;const filter=ac.createBiquadFilter();filter.type="lowpass";filter.frequency.value=310;ambientOsc=ac.createOscillator();ambientOsc2=ac.createOscillator();ambientOsc.type="sawtooth";ambientOsc2.type="sine";ambientOsc.frequency.value=55;ambientOsc2.frequency.value=82.4;ambientOsc.connect(filter);ambientOsc2.connect(filter);filter.connect(ambientGain);ambientGain.connect(audioMaster);ambientOsc.start();ambientOsc2.start();document.querySelector("#soundAmbience").textContent="〰 COLLIDER HUM // ON";
    }
    document.querySelector("#soundMaster").onclick=e=>{if(!audioCtx){soundEnabled=true;ensureAudio();playSFX(SFX.START)}else{soundEnabled=!soundEnabled;if(!soundEnabled)setAmbience(false);else playSFX(SFX.START)}e.currentTarget.classList.toggle("off",!soundEnabled);e.currentTarget.textContent=soundEnabled?"🔊 SOUND ON":"🔇 SOUND OFF";document.querySelector("#soundStatus").textContent=soundEnabled?"WEB AUDIO // ACTIVE":"WEB AUDIO // MUTED"};
    document.querySelector("#soundVolume").oninput=e=>{soundVolume=+e.target.value/100;document.querySelector("#soundVolumeOut").textContent=e.target.value;if(audioMaster)audioMaster.gain.value=soundVolume};
    document.querySelector("#soundAmbience").onclick=()=>setAmbience(!ambientOsc);
    document.querySelector("#soundCodes").onclick=e=>{const b=e.target.closest("[data-sfx]");if(b)playSFX(b.dataset.sfx)};
    const berryWave=document.querySelector("#berryWave"),berryCtx=berryWave.getContext("2d");
    function drawBerryWave(){
      if(audioAnalyser&&audioWaveData){audioAnalyser.getByteTimeDomainData(audioWaveData);if(++berryTick%9===0){berryFrames.push(new Uint8Array(audioWaveData));if(berryFrames.length>5)berryFrames.shift()}}
      berryCtx.fillStyle="#040306";berryCtx.fillRect(0,0,berryWave.width,berryWave.height);berryCtx.strokeStyle="#28162a";berryCtx.lineWidth=1;berryCtx.beginPath();berryCtx.moveTo(0,berryWave.height/2);berryCtx.lineTo(berryWave.width,berryWave.height/2);berryCtx.stroke();const frames=berryFrames.length?berryFrames:[new Uint8Array(512).fill(128)];frames.forEach((frame,fi)=>{berryCtx.strokeStyle=berryColors[fi%berryColors.length];berryCtx.globalAlpha=.32+fi/Math.max(1,frames.length)*.65;berryCtx.lineWidth=fi===frames.length-1?3:1.5;berryCtx.beginPath();for(let i=0;i<frame.length;i++){const x=i/(frame.length-1)*berryWave.width,y=(frame[i]/255)*berryWave.height;i?berryCtx.lineTo(x,y):berryCtx.moveTo(x,y)}berryCtx.stroke()});berryCtx.globalAlpha=1;berryCtx.fillStyle="#c98ab0";berryCtx.font="800 18px ui-monospace,monospace";berryCtx.fillText("<MULTIPLE>[BERRY] // "+(audioCtx?"LIVE":"CLICK A SOUND TO WAKE IT"),14,26);requestAnimationFrame(drawBerryWave)
    }
    document.querySelector("#berryClear").onclick=()=>{berryFrames.length=0;playSFX(SFX.NUL)};
    document.querySelector("#berrySave").onclick=()=>{const a=document.createElement("a");a.download="multiple-berry-waveform.png";a.href=berryWave.toDataURL("image/png");a.click();playSFX(SFX.HARVEST);document.querySelector("#soundStatus").textContent="SAVED // <MULTIPLE>[BERRY] WAVEFORM"};
    requestAnimationFrame(drawBerryWave);

    // EVERYTHING MACHINE GAME // one FUCK, twelve turns, zero expendable souls.
    let game={active:false,turn:0,money:60,pixels:0,souls:8,damage:0,story:0,democracy:100,linkIntegrity:100,beauty:0,happy:false,pixelPerfect:false,bestAnimal:null,rawFuck:"",rawHash:0,collected:new Set(),crops:0,seeds:0,food:0,freeSeedUsed:false,fish:[],current:0};
    let linkAttackMod=false;
    const petState={snack:72,rest:72,play:58,trust:45};let petNote="Curious and cozy. Care actions are free and can’t be missed.";
    const gameLogEl=document.querySelector("#gameLog"),gameButtons=[...document.querySelectorAll("#everythingGame .gamebuttons button:not(#gameStart)")];
    const clamp100=n=>Math.max(0,Math.min(100,Math.round(n)));
    function gameLog(s,kind=""){
      const line=document.createElement("div");line.textContent=(kind?kind+" // ":"")+s;if(kind==="WIN")line.className="gamewin";if(kind==="LOSE")line.className="gamelose";gameLogEl.appendChild(line);gameLogEl.scrollTop=gameLogEl.scrollHeight;
    }
    function gameRender(){
      [["gameStory","gameStoryBar",game.story],["gameDemo","gameDemoBar",game.democracy],["gameLinkHealth","gameLinkBar",game.linkIntegrity],["gameBeauty","gameBeautyBar",game.beauty]].forEach(([n,b,v])=>{document.querySelector("#"+n).textContent=v;document.querySelector("#"+b).style.width=v+"%"});
      const attackToggle=document.querySelector("#linkAttackToggle");attackToggle.setAttribute("aria-pressed",String(linkAttackMod));attackToggle.textContent=linkAttackMod?"🛡 LINK ATTACK MOD // ON":"🛡 LINK ATTACK MOD // OFF";
      document.querySelector("#gameTurn").textContent=game.turn+"/12";document.querySelector("#gameMoney").textContent="$"+game.money;document.querySelector("#gamePixels").textContent=game.pixels+"/3";document.querySelector("#gameSouls").textContent=game.souls+"/8";
      const tally=document.querySelector("#gameHarvestTally");if(tally)tally.textContent="TINY FARM LOOP // "+game.seeds+" seeds · "+game.food+" pretend food · "+game.crops+" crops · "+game.fish.length+" fish // DREAM CURRENT "+game.current+" // game-only";
      petRender();
      const state=document.querySelector("#gameState");state.textContent=!game.active?(game.turn?"PARTY PAUSED":"PRESS START"):game.story>=60?"📖 STORY GETTING SILLY":"MACHINE PLAYING // NO-HURT MODE";
      const mood=document.querySelector("#gameMoodEmoji"),moodState=!game.active?(game.turn?"🎉":"🍩"):game.current>0?"⚡":game.fish.length?"🐟":game.beauty>=60?"✨":"🤖";mood.textContent=moodState;mood.setAttribute("aria-label","Game mood "+moodState);mood.title="Game-state emoji only // does she know? UNKNOWN unless a person says.";
    }
    function petRender(note){
      if(note)petNote=note;const name=document.querySelector("#petName").value.trim()||"Companion",look=document.querySelector("#petType").value;
      document.querySelector("#petAvatar").textContent=look;document.querySelector("#petAvatar").setAttribute("aria-label",name+", virtual companion");
      [["petSnackMeter",petState.snack],["petRestMeter",petState.rest],["petPlayMeter",petState.play],["petTrustMeter",petState.trust]].forEach(([id,value])=>{document.querySelector("#"+id).style.width=clamp100(value)+"%"});
      const low=petState.snack<25?"could enjoy a snack":petState.rest<25?"could use a nap":petState.play<25?"might like a little play":"is cozy and curious";
      document.querySelector("#petStatus").textContent=name+" "+low+". Safe either way; there is no penalty. "+petNote;
    }
    document.querySelector("#petName").addEventListener("input",()=>petRender());document.querySelector("#petType").addEventListener("change",()=>petRender());
    document.querySelector("#petSnack").onclick=()=>{const usedHarvest=game.food>0;if(usedHarvest)game.food--;petState.snack=clamp100(petState.snack+24);petRender(usedHarvest?"Shared one pretend farm harvest.":"A make-believe snack appeared from the tiny pantry.");gameRender()};
    document.querySelector("#petPlay").onclick=()=>{petState.play=clamp100(petState.play+23);petState.rest=clamp100(petState.rest-7);petRender("Played a small game together; now there’s time to rest.")};
    document.querySelector("#petRest").onclick=()=>{petState.rest=clamp100(petState.rest+28);petRender("Cozy quiet time. The game can wait.")};
    document.querySelector("#petHello").onclick=()=>{petState.trust=clamp100(petState.trust+8);petState.play=clamp100(petState.play+3);petRender("A hello, freely given. No response is owed.")};
    function gameScoreSummary(){return "BEAUTY "+game.beauty+" // PIXELS "+game.pixels+" // LINK HEALTH "+game.linkIntegrity+"% // "+game.crops+" crops, "+game.food+" pretend food // "+game.fish.length+" fish // $"+game.money+" pretend dollars"}
    function gameEndCheck(){
      game.damage=0;game.story=clamp100(game.story);game.democracy=clamp100(game.democracy);game.linkIntegrity=clamp100(game.linkIntegrity);game.beauty=clamp100(game.beauty);
      if(game.pixels>=3&&game.happy&&game.beauty>=100){game.active=false;game.beauty=100;gameLog("YOU MADE THE WORLD BETTER WITHOUT SPENDING ANYBODY. 8/8 souls go home. "+gameScoreSummary()+".","WIN");playSFX(SFX.WIN);gameRender();return true}
      if(game.turn>=12){game.active=false;gameLog("PARTY PAUSED // 8/8 souls go home. Nobody lost; press START when you want another round. "+gameScoreSummary()+" // "+(game.happy?"KITCHEN HAPPY":"KITCHEN READY FOR A SNACK")+".");playSFX(SFX.WIN);gameRender();return true}
      gameRender();return false;
    }
    function gameAct(fn){
      if(!game.active){gameLog("Press START / PLAY AGAIN first.");return}fn();game.turn++;petState.snack=clamp100(petState.snack-3);petState.rest=clamp100(petState.rest-2);petState.play=clamp100(petState.play-2);petNote="A little time passed in the game; the companion stays safe.";gameEndCheck();
    }
    function gameStart(){
      const raw=document.querySelector("#theFuck").value.trim()||"everything",four=interpretFour(raw);renderFour(raw);game={active:true,turn:0,money:60,pixels:0,souls:8,damage:0,story:0,democracy:100,linkIntegrity:100,beauty:0,happy:false,pixelPerfect:false,bestAnimal:null,rawFuck:raw,rawHash:hash(raw),collected:new Set(),crops:0,seeds:0,food:0,freeSeedUsed:false,fish:[],current:0};gameLogEl.textContent="";cosmicBest=null;harvestCount=0;renderHarvest();document.querySelector("#pixelPerfectCard").classList.remove("show");document.querySelector("#gameSecretCodeCard").style.display="none";colliderSeed("kitchen");colliderRunning=true;document.querySelector("#colliderToggle").textContent="Ⅱ PAUSE RING";gameLog("THE FUCK LOADED // "+raw);gameLog("FOUR-WAY LOADED // "+four.bus);gameLog("NO-HURT MODE // play money only; no damage loss, no soul spending, and no run failure.");gameLog("FARM LOOP // free story seed → plant for pretend food + seed return → feed the kitchen. No real food is produced.");gameLog("LINK ATTACK // fictional containment only. It cannot open, scan, change, or attack real URLs or people. UNKNOWN stays UNKNOWN.");gameRender();
    }
    document.querySelector("#gameStart").onclick=gameStart;
    document.querySelector("#gamePayWin").onclick=()=>gameAct(()=>{
      if(game.money<35){gameLog("GOLDEN COUPON DENIED // it costs $35 pretend dollars; go fish, farm, or FUCK WITH IT for play money.");return}
      game.money-=35;game.pixels=3;game.collected.add("Golden Coupon Pixel Parade");game.happy=true;game.bestAnimal=bestKitchenAnimal();game.beauty=100;game.pixelPerfect=true;renderPixelPerfectAnimal(game.bestAnimal);
      const recipientType=document.querySelector("#gameCodeRecipient").value,isDude=recipientType==="dude",recipient=isDude?"DUDE // SECRET SECRET // NUL NUL":pick(gurlFirst)+" "+pick(last),code=isDude?"DONUT-DONUT":pick(["MOON-SOUP-404","BRAIN-SCAN-BOOP","RACCOON-COUPON","TELEPHONE-CAKE","FORTUNE-FIZZ"]),card=document.querySelector("#gameSecretCodeCard");
      document.querySelector("#gameSecretCodeMessage").textContent=isDude?"In the story, the secret fun code went to DUDE // SECRET SECRET // NUL NUL. No extra identity guessed. Maybe a donut, maybe a donut-donut.":"In the story, the secret fortune code was sent to "+recipient+" // GURL. It grants one imaginary moon-soup and an invite to the victory party.";
      document.querySelector("#gameSecretCodeValue").textContent=code;document.querySelector("#gameSecretCodeStatus").textContent="STORY DELIVERY COMPLETE // copy the code to share it with a real friend; nothing was sent outside this page.";card.style.display="grid";
      gameLog("💸 GOLDEN WIN COUPON // -$35 pretend dollars. Three coupon pixels! Kitchen party! Beauty confetti! Secret code delivered in-story to "+recipient+": "+code+". Copy it if you want to share it outside the game. No real money, no hurt.");
    });
    document.querySelector("#gameCopySecretCode").onclick=async()=>{const code=document.querySelector("#gameSecretCodeValue").textContent;if(!code)return;try{await navigator.clipboard.writeText(code);document.querySelector("#gameSecretCodeStatus").textContent="CODE COPIED // send it to your friend however you like."}catch{document.querySelector("#gameSecretCodeStatus").textContent="COPY BLOCKED BY BROWSER // select the code above and press Ctrl+C."}};
    document.querySelector("#linkAttackToggle").onclick=()=>{linkAttackMod=!linkAttackMod;gameRender();gameLog(linkAttackMod?"LINK ATTACK MOD ON // choose a fictional story fault and contain it. This is not an internet link tool.":"LINK ATTACK MOD OFF // ordinary story play continues.")};
    document.querySelector("#characterSpellcheck").onclick=()=>{const fields=[...document.querySelectorAll(".character-sheet-grid input[type=text], .character-sheet-grid textarea")];fields.forEach(field=>field.spellcheck=true);document.querySelector("#characterSpellStatus").textContent="SOULCHECK // browser spellcheck is on. It may flag names as unfamiliar; suggestions are yours to accept or ignore.";fields[0]?.focus()};
    let identityResourceSnapshot="";
    const identityResourceReadout=document.querySelector("#identityResourceReadout");
    function lockIdentityResources(){identityResourceSnapshot="";identityResourceReadout.textContent="LOCKED HUD // sheet changed; confirm the user-entered identity again to refresh story counts."}
    ["sheetName","sheetKind","sheetAnchor","sheetChoice","sheetCast"].forEach(id=>document.querySelector("#"+id).addEventListener("input",()=>{if(identityResourceSnapshot)lockIdentityResources()}));
    document.querySelector("#identityDiscover").onclick=()=>{
      const name=document.querySelector("#sheetName").value.trim(),kind=document.querySelector("#sheetKind").value.trim();if(!name||!kind){identityResourceReadout.textContent="DISCOVERY HELD // enter the character name and kind yourself; the game will not guess an identity.";return}
      const memory=document.querySelector("#sheetAnchor").value.trim()?1:0,choice=document.querySelector("#sheetChoice").value.trim()?1:0,companions=document.querySelector("#sheetCast").value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).length;identityResourceSnapshot=JSON.stringify({name,kind,memory,choice,companions});
      identityResourceReadout.textContent="IDENTITY CONFIRMED FROM YOUR SHEET // "+name+" · "+kind+"\nSTORY RAM / entered memory details: "+memory+"\nAGENCY SLOTS / entered next choices: "+choice+"\nCONNECTION LINKS / names you entered: "+companions+"\nCURRENT SIGNAL / present story state, not currency.";
    };
    document.querySelector("#characterBegin").onclick=()=>{
      const field=id=>document.querySelector("#"+id).value.trim()||"UNKNOWN",state=field("sheetState");
      const boundary=state==="missing"?"MISSING STATUS // leave location, reason, and outcome UNKNOWN; do not invent a return or loss.":state==="memory"?"REMEMBRANCE // a player-authored story using entered memories only; not actual contact, resurrection, or verification of a soul.":state==="present"?"PRESENT // no disappearance or outcome implied.":"FICTION // player-created character.";
      const origin=field("sheetOrigin")==="first-soul"?"FIRST MODE EVER // FIRST SOUL? origin stays UNKNOWN until the player authors more; 'first first' is a story phrase, and pain does not prove a cause or assign blame.":"ORIGIN OPEN // no beginning is assumed.";
      const premise=["CHARACTER MAD LIB // "+field("sheetName")+" // KIND: "+field("sheetKind"),"WANTS: "+field("sheetWant"),"TROUBLE / UNKNOWN: "+field("sheetTrouble"),"FELT EXPERIENCE // real as the player reports it; cause left open: "+field("sheetFelt"),"GOLDEN CONTINUITY MAP // player-chosen links; gaps remain UNKNOWN: "+field("sheetContinuity"),"HISTORY FOR EVERYONE // preserve each entered account separately; conflicts and source gaps remain visible: "+field("sheetVoices"),"RUMOR / PATTERN HYPOTHESIS // player-entered, not verified fact: "+field("sheetPattern"),"TIME / ORDER AS GIVEN: "+field("sheetClock"),"CHOSEN DETAIL: "+field("sheetAnchor"),"OTHER CHARACTERS / POSSIBLE COMPANIONS: "+field("sheetCast"),"NEXT CHOICE: "+field("sheetChoice"),"TONE: "+field("sheetTone"),origin,boundary,"No automatic timestamp is treated as proof; blank fields stay UNKNOWN, and the player decides what is true."].join(" // ");
      document.querySelector("#theFuck").value=premise;gameStart();gameLog("CHARACTER SHEET STARTED // missing outcomes stay open; memories stay player-authored.");
    };
    document.querySelector("#gameFuck").onclick=()=>gameAct(()=>{const cash=8+Math.floor(Math.random()*23),spin=3+Math.floor(Math.random()*12);game.money+=cash;game.story+=spin;game.beauty+=3;gameLog("FUCK WITH IT → +$"+cash+" play money // +"+spin+" silly story // +3 beauty. No hurt, just glitter.")});
    document.querySelector("#gameCollide").onclick=()=>gameAct(()=>{injectCollision(1.7);for(let i=0;i<3;i++)lifeStep(true);game.beauty+=4;game.story+=2;gameLog("PIXEL COLLIDER FIRED // world wobbled safely; detector full of suspicious glitter.")});
    document.querySelector("#gameHarvest").onclick=()=>gameAct(()=>{const s=harvestCosmic(false);if(s.score>=48){const name=cosmicBest?.name||specimenName(s.grid,s.ip);if(!game.collected.has(name)){game.collected.add(name);game.pixels++;game.beauty+=Math.max(6,Math.round(s.score/7));gameLog("MOUSE TRAP CAUGHT "+name+" // Q"+s.score+" // GOOD PIXEL "+game.pixels+"/3")}else{gameLog("MOUSE TRAP caught the same little bastard again. No duplicate point.")}}else{game.story+=5;gameLog("MOUSE TRAP found Q"+s.score+" pixel soup. Machine almost pretended it was profound. +5 STORY BAD.")}});
    document.querySelector("#gameBack").onclick=()=>gameAct(()=>{game.story-=28;game.money=Math.max(0,game.money-4);gameLog("↶ STORY → interpretation → feeling → RAW. ↶ RAW → many possible futures. UNKNOWN stayed UNKNOWN.")});
    document.querySelector("#gameChurch").onclick=()=>gameAct(()=>{game.story-=6;game.money=Math.max(0,game.money-5);game.beauty+=8;gameLog("⛪↶ BACKWARDS CHURCH // BODY FIRST // HURT COUNTS // STOP OUTRANKED STORY. +8 cozy beauty.")});
    document.querySelector("#gameJustice").onclick=()=>gameAct(()=>{if(game.money<10){gameLog("JUSTICE wanted play money. Treasury contains lint.");game.story+=3;return}game.money-=10;game.story-=10;game.beauty+=8;gameLog("⚖ EVIDENCE + RESPONSIBILITY + REPAIR // UNKNOWN ≠ GUILTY // +8 beauty.")});
    document.querySelector("#gameDemocracy").onclick=()=>gameAct(()=>{const gain=12+Math.floor(Math.random()*13);game.democracy+=gain;game.money=Math.max(0,game.money-6);game.story-=4;game.beauty+=6;gameLog("🗳 8 SOULS = 8 VOTES. Treasury attempted to vote; ballot rejected for being money. Democracy +"+gain+".")});
    function bestKitchenAnimal(){
      if(fateState.match){const matched=kitchenAnimals.find(a=>a.name===fateState.match.name);if(matched)return matched}
      if(!cosmicBest)return kitchenAnimals[game.rawHash%kitchenAnimals.length];
      const v=[cosmicBest.persistence*100,cosmicBest.structure*100,cosmicBest.novelty*100,cosmicBest.score,cosmicBest.density*100];return kitchenAnimals.map(a=>({a,d:a.v.reduce((sum,n,i)=>sum+Math.abs(n-v[i]),0)})).sort((a,b)=>a.d-b.d)[0].a;
    }
    function renderPixelPerfectAnimal(animal){
      const c=document.querySelector("#pixelPerfectCanvas"),x=c.getContext("2d"),idx=Math.max(0,kitchenAnimals.indexOf(animal)),pal=["#c88f68","#d3a348","#777f8c","#e5d8bd","#87512d","#e26926","#875cb0","#242832"],fur=pal[idx%pal.length],px=8;x.imageSmoothingEnabled=false;x.fillStyle="#071009";x.fillRect(0,0,128,128);const rect=(gx,gy,gw,gh,col)=>{x.fillStyle=col;x.fillRect(gx*px,gy*px,gw*px,gh*px)};rect(5,4,6,7,fur);rect(4,5,8,5,fur);rect(5,3,2,2,fur);rect(9,3,2,2,fur);if(animal.species==="RABBIT"){rect(5,0,2,4,fur);rect(9,0,2,4,fur)}rect(6,6,1,1,"#050607");rect(9,6,1,1,"#050607");rect(7,8,2,1,"#ff9fbf");rect(5,11,6,4,"#f3ead6");rect(6,12,4,3,"#27e2ff");rect(2+(idx%3)*5,14,2,1,"#ffe12c");rect(12-(idx%2)*9,2,1,1,"#70ff8d");document.querySelector("#pixelPerfectName").textContent="PIXEL PERFECT // "+animal.emoji+" "+animal.name.toUpperCase();document.querySelector("#pixelPerfectMeta").textContent=animal.station+" // BEST MATCH // pain kept whole; nothing banana-split across souls.";document.querySelector("#pixelPerfectCard").classList.add("show");
    }
    document.querySelector("#gameKitchen").onclick=()=>gameAct(()=>{if(game.food<1&&game.pixels<1){gameLog("🍳 KITCHEN ANIMAL is waiting kindly. Grow pretend food or bring a cosmic pixel.");game.beauty+=1;return}const animal=bestKitchenAnimal();game.bestAnimal=animal;if(!game.happy){const meal=game.food>0?(game.food--,"a pretend farm meal"):"a cosmic pixel";game.happy=true;game.beauty+=22;gameLog("🍳 "+animal.name.toUpperCase()+" THE "+animal.species+" shares "+meal+" and adopts the rest as "+pick(["PET","TINY WHISK","SOUP ORACLE","CRUMB INSPECTOR","ILLEGAL DUMPLING"])+". KITCHEN HAPPY.")}else{if(game.food>0)game.food--;game.beauty+=7;gameLog("🍳 "+animal.name+" already happy. A little pretend snack adds +7 beauty.")}});
    document.querySelector("#gamePixelPerfect").onclick=()=>gameAct(()=>{if(!game.happy||game.pixels<3){gameLog("✦ PIXEL PERFECT LOCKED // needs 3 GOOD PIXELS + one happy BEST Kitchen Animal.");return}const animal=game.bestAnimal||bestKitchenAnimal();game.bestAnimal=animal;if(!game.pixelPerfect){game.pixelPerfect=true;game.beauty+=16;renderPixelPerfectAnimal(animal);gameLog("✦ PIXEL PERFECT UNLOCKED ONLY FOR "+animal.name.toUpperCase()+" // BEST KITCHEN ANIMAL // +16 BEAUTY")}else{renderPixelPerfectAnimal(animal);gameLog("✦ PIXEL PERFECT already belongs to "+animal.name+". No duplicate beauty farming.")}});
    document.querySelector("#gameStoryGo").onclick=()=>gameAct(()=>{const mode=document.querySelector("#storyLightMode").value,temp=+document.querySelector("#beamTemp").value;if(mode==="relax"){game.beauty+=12;game.story-=8;gameLog("📖 RELAX STORY // warm-white beam at "+temp+" K // +12 beauty, -8 story silliness. Take a breath; nothing needs to escalate.")}else{const boost=10+Math.floor(Math.random()*14),risk=11+Math.floor(Math.random()*18);game.beauty+=boost;game.story+=risk;gameLog("📖 TIME STORY // cool-white beam at "+temp+" K // beauty +"+boost+" // story silliness +"+risk+". Story can be wrong.")}});
    const fishNames=["Moon Koi","Button-Eyed Perch","Comet Minnow","Velvet Catfish","Tiny Lake Dragon","Puddle Trout","Lantern Guppy","Crumb Carp"];
    document.querySelector("#gameSeed").onclick=()=>gameAct(()=>{if(game.freeSeedUsed){gameLog("✨ THE NOTHING SEED HAS ALREADY STARTED THIS RUN // the harvest returns seeds so the loop can keep going.");return}game.freeSeedUsed=true;game.seeds++;game.beauty+=2;gameLog("✨ SEED FROM NOTHING // a tiny story seed appears in the pretend farm. +1 seed, +2 beauty. No real food or matter was created.")});
    document.querySelector("#gameFarm").onclick=()=>gameAct(()=>{if(game.seeds<1){gameLog("🌱 FARM PAUSED // press SEED FROM NOTHING once to begin this run.");return}game.seeds--;game.crops++;game.food++;game.seeds+=2;const cash=4+Math.floor(Math.random()*4);game.money+=cash;game.beauty+=5;gameLog("🌱 FARM MODE // planted 1 seed; harvested 1 pretend food + 2 return seeds. +1 crop, +$"+cash+" play money, +5 beauty. Soil is happy; no damage or story pressure.")});
    const linkFaults={rumor:"UNVERIFIED RUMOR PROMOTED TO FACT",source:"MISSING SOURCE",order:"SCRAMBLED EVENT ORDER",continuity:"BROKEN CONTINUITY LINK"};
    document.querySelector("#gameLinkAttack").onclick=()=>{
      if(!game.active){gameLog("Press START / PLAY AGAIN first.");return}
      if(!linkAttackMod){gameLog("LINK ATTACK MOD IS OFF // switch it on first. This does not spend a turn.");return}
      gameAct(()=>{const target=linkFaults[document.querySelector("#linkAttackTarget").value]||"STORY-LINK FAULT",repaired=Math.min(22,100-game.linkIntegrity),pressure=Math.min(12,game.story);game.linkIntegrity+=22;game.story-=12;game.beauty+=4;gameLog("⚔ LINK ATTACK CONTAINED // "+target+" marked as a fictional machine fault. LINK HEALTH +"+repaired+" · story silliness -"+pressure+" · beauty +4. Original character notes stay untouched; gaps remain UNKNOWN.")});
    };
    document.querySelector("#gameFish").onclick=()=>gameAct(()=>{const fish=pick(fishNames),cash=5+Math.floor(Math.random()*6);game.fish.push(fish);game.money+=cash;game.beauty+=4;gameLog("🎣 FISHING MODE // caught a "+fish+"! +1 fish, +$"+cash+" play money, +4 beauty. Catch-and-keep is pretend; no damage or story pressure.")});
    document.querySelector("#gameCare").onclick=()=>gameAct(()=>{const settled=Math.min(8,game.story);game.story-=settled;game.beauty+=6;gameLog("♡ CARE, NOT CURE // rest, choice, and steady support ease "+settled+" story silliness; +6 beauty. Nothing about the person is deleted, and healing has no forced deadline.")});
    document.querySelector("#gameReceiveLove").onclick=()=>gameAct(()=>{const settled=Math.min(4,game.story);game.story-=settled;game.beauty+=8;gameLog("♥ RECEIVED LOVE // kindness arrived freely: +8 beauty, -"+settled+" story silliness. No payment, debt, or required response. The story and the person remain their own.")});
    document.querySelector("#gameDreamCurrent").onclick=()=>gameAct(()=>{game.current++;game.beauty+=7;const present=game.fish.length?"the "+game.fish[game.fish.length-1]+" glimmers in the present":game.crops?"the little crop patch catches a strip of sunlight":game.happy&&game.bestAnimal?game.bestAnimal.name+" is resting in the kitchen":game.turn?"the machine pauses between choices":"the world waits in one quiet moment";const dream=pick(["A golden line connects only the moments the player chose to keep.","A small green life pixel blinks; its meaning stays open.","The next future branches from what can be chosen now.","The clock turns gently; missing time remains UNKNOWN."]);gameLog("⚡ DREAM WITH CURRENT // "+present+". "+dream+" +1 current, +7 beauty, $0 spent. Dream, not prediction.")});
    document.querySelector("#gameNul").onclick=()=>gameAct(()=>{const now=document.querySelector("#theFuck").value.trim()||"everything",same=hash(now)===game.rawHash;game.story-=12;gameLog("NUL NUL // RAW INPUT INTEGRITY: "+(same?"PASS // YOU CAME OUT AS YOU":"CHANGED // current text preserved, original hash remembered"))});
    document.querySelector("#gameLove").onclick=()=>gameAct(()=>{const made=12;game.beauty+=made;game.money=Math.max(0,game.money-4);gameLog("♥ LOVE brought devotion to the party and made +"+made+" beauty. No hurt needed; repair is off duty.")});
    document.querySelector("#gameRandom").onclick=()=>gameAct(()=>{const events=[
      ["WORD CHURCH holds a four-hour sermon about JAIL vs PRISON.",6,-2,5],
      ["BETA TESTER says OW. Machine actually listens.",-5,0,7],
      ["A billionaire tries to purchase nine votes. Receipt says LOL NO.",3,-8,3],
      ["Kitchen Animal discovers municipal cheese.",-2,3,9],
      ["Cosmic pixel learns to wiggle without becoming a prophecy.",-6,2,8],
      ["TOTAL UPGRADE completes. Nothing changes. Somehow morale improves.",0,0,5],
      ["Everybody presses STOP at once. Machine stops. Revolutionary technology.",-8,4,7],
      ["THE FUCK falls down the stairs and becomes contemporary art.",5,0,13]
    ],e=pick(events);game.story+=e[1];game.democracy+=e[2];game.beauty+=e[3];gameLog("🎲 "+e[0])});
    const buttonSounds={gameStart:SFX.START,gameFuck:SFX.FUCK,gameCollide:SFX.COLLIDE,gameLinkAttack:SFX.COLLIDE,gameHarvest:SFX.HARVEST,gameBack:SFX.BACK,gameChurch:SFX.CHURCH,gameJustice:SFX.JUSTICE,gameDemocracy:SFX.VOTE,gameKitchen:SFX.KITCHEN,gamePixelPerfect:SFX.HARVEST,gameStoryGo:SFX.STORY,gameSeed:SFX.HARVEST,gameFarm:SFX.HARVEST,gameFish:SFX.HARVEST,petSnack:SFX.KITCHEN,petPlay:SFX.HARVEST,petRest:SFX.STORY,petHello:SFX.LOVE,gameCare:SFX.LOVE,gameReceiveLove:SFX.LOVE,gameDreamCurrent:SFX.STORY,gameNul:SFX.NUL,gameLove:SFX.LOVE,gameRandom:SFX.RANDOM,colliderFire:SFX.COLLIDE,colliderHarvest:SFX.HARVEST,mouseTrap:SFX.HARVEST,colliderKitchen:SFX.KITCHEN};
    document.addEventListener("click",e=>{const b=e.target.closest("button");if(b&&buttonSounds[b.id])playSFX(buttonSounds[b.id])});
    const keyButtons={Enter:"gameStart",KeyF:"gameFuck",KeyC:"gameCollide",KeyH:"gameHarvest",KeyB:"gameBack",KeyJ:"gameJustice",KeyV:"gameDemocracy",KeyK:"gameKitchen",KeyS:"gameStoryGo",KeyN:"gameNul",KeyL:"gameLove",KeyR:"gameRandom"};
    // BOSS SCRAMBLE // self-contained, session-only boss rush. It deliberately does not alter the 12-turn game above.
    (()=>{
      "use strict";
      const $=id=>document.querySelector("#"+id),root=$("bossScramble");
      if(!root)return;
      const stageSets={
        sprint:["QUALIFIER","CROSSFIRE","APEX"],
        standard:["QUALIFIER I","QUALIFIER II","CROSSFIRE","SEMIFINAL","APEX"],
        ascendant:["QUALIFIER I","QUALIFIER II","CROSSFIRE","ELITE QUARTER","SEMIFINAL","PENULTIMATE","APEX"]
      };
      const bosses=[
        {id:"regent",icon:"♜",name:"IRON REGENT",role:"slow hammer monarch",color:"#ff8a34",attacks:[{cue:"HAMMER ECHO // a gold impact line fills the floor. BRACE through it.",answer:"brace"},{cue:"OPEN CROWN // the Regent exposes a bright weak point. BREAK it.",answer:"break"}]},
        {id:"siren",icon:"📡",name:"VAULT SIREN",role:"broadcast duelist",color:"#27e2ff",attacks:[{cue:"TRACKING CHORUS // cyan reticles sweep sideways. GLIDE across the lane.",answer:"glide"},{cue:"AMPLIFIER WINDOW // the speaker cone flashes white. BREAK the signal.",answer:"break"}]},
        {id:"furnace",icon:"🔥",name:"FURNACE BEAST",role:"charge engine",color:"#ff8a34",attacks:[{cue:"BOILER RUSH // orange rails mark the charge. GLIDE through the gap.",answer:"glide"},{cue:"ASH BURST // a hot ring blooms outward. BRACE at the center.",answer:"brace"}]},
        {id:"bishop",icon:"♝",name:"BISHOP NULL",role:"mirror tactician",color:"#a572ff",attacks:[{cue:"MIRROR FOLD // three reflected weak points blink. BREAK the bright one.",answer:"break"},{cue:"NULL PROCESSION // purple tiles advance in a row. GLIDE to the open tile.",answer:"glide"}]},
        {id:"coupon",icon:"🎟",name:"COUPON GOLEM",role:"receipt bruiser",color:"#ffe12c",attacks:[{cue:"RECEIPT SLAM // a receipt-shaped shadow lands overhead. BRACE beneath it.",answer:"brace"},{cue:"VOID DISCOUNT // a perforated seam opens. BREAK the coupon before it tears.",answer:"break"}]},
        {id:"waffle",icon:"🧇",name:"WAFFLE ORACLE",role:"grid prophet",color:"#70ff8d",attacks:[{cue:"SYRUP FLOOD // square cells light in a checkerboard. GLIDE across the dark cells.",answer:"glide"},{cue:"TOASTED SIGIL // the center square turns white-hot. BREAK its crust.",answer:"break"}]},
        {id:"aunty",icon:"📺",name:"STATIC AUNTY",role:"channel storm",color:"#ff3e9d",attacks:[{cue:"CHANNEL SURGE // pink scanlines crash toward the rail. BRACE the signal.",answer:"brace"},{cue:"REMOTE WINDOW // the mute icon flashes in place. BREAK the broadcast.",answer:"break"}]},
        {id:"mouse",icon:"🐭",name:"MOUSE TRAP MAESTRO",role:"tiny arena conductor",color:"#70ff8d",attacks:[{cue:"CRUMB PARADE // small markers zigzag forward. GLIDE between them.",answer:"glide"},{cue:"BELL RING // a silver triangle flashes above the baton. BRACE for the chime.",answer:"brace"}]},
        {id:"baron",icon:"🕴",name:"CHANNEL BARON",role:"ad break tyrant",color:"#a572ff",attacks:[{cue:"SPONSOR WALL // purple ad panels close in. GLIDE through the open slot.",answer:"glide"},{cue:"FINE PRINT // one clause becomes bright and fragile. BREAK the clause.",answer:"break"}]},
        {id:"pantry",icon:"🥫",name:"PANTRY PHANTOM",role:"shelf-haunting chef",color:"#27e2ff",attacks:[{cue:"CAN RAIN // tins fall in a marked circle. BRACE under the lid.",answer:"brace"},{cue:"LABEL SWAP // the real label pulses cyan. BREAK its seal.",answer:"break"}]}
      ];
      const traits=[
        {id:"gale",name:"GALE STEP",detail:"a borrowed wind dash crosses the ring",color:"#27e2ff",answer:"glide",cue:"BORROWED GALE STEP // a cyan wind lane arrives. GLIDE through it."},
        {id:"embers",name:"EMBER MINES",detail:"delayed hot sigils bloom after a warning",color:"#ff8a34",answer:"glide",cue:"BORROWED EMBER MINES // orange circles bloom on the floor. GLIDE to the cool tile."},
        {id:"mirror",name:"MIRROR ARRAY",detail:"one reflected weak point matters",color:"#a572ff",answer:"break",cue:"BORROWED MIRROR ARRAY // the true reflection shines white. BREAK it."},
        {id:"anchor",name:"ANCHOR PULSE",detail:"a wide knockback wave asks for a grounded read",color:"#ffe12c",answer:"brace",cue:"BORROWED ANCHOR PULSE // a gold shock ring expands. BRACE its edge."},
        {id:"static",name:"STATIC ECHO",detail:"a delayed repeat plays after the original cue",color:"#ff3e9d",answer:"brace",cue:"BORROWED STATIC ECHO // the pink repeat is incoming. BRACE again."},
        {id:"slip",name:"SLIPSTREAM",detail:"a speed lane rewards a clean crossing",color:"#70ff8d",answer:"glide",cue:"BORROWED SLIPSTREAM // green arrows cut across the bracket. GLIDE with them."},
        {id:"coupon",name:"VOID COUPON",detail:"a tearable discount opens a short weak-point window",color:"#ffe12c",answer:"break",cue:"BORROWED VOID COUPON // the perforation glows. BREAK the tear line."},
        {id:"bloom",name:"GLASS BLOOM",detail:"a ring of shards creates a visible safe center",color:"#27e2ff",answer:"brace",cue:"BORROWED GLASS BLOOM // shards circle the center. BRACE in the clear pocket."},
        {id:"drum",name:"PANTRY DRUM",detail:"a three-beat shelf rhythm telegraphs a final hit",color:"#ff8a34",answer:"brace",cue:"BORROWED PANTRY DRUM // the third can lands loudest. BRACE the downbeat."},
        {id:"portal",name:"PAPER PORTAL",detail:"a door-shaped tear shifts the safe lane",color:"#a572ff",answer:"glide",cue:"BORROWED PAPER PORTAL // the violet doorway opens sideways. GLIDE through it."}
      ];
      const arenas=[
        {id:"glass",name:"GLASS BRACKET",rule:"rotating safe lanes remain visible"},
        {id:"pantry",name:"NEON PANTRY",rule:"shelf lights mark the quiet squares"},
        {id:"archive",name:"ARCHIVE RING",rule:"reflections show the active weak point"},
        {id:"collider",name:"PETAL COLLIDER",rule:"the pulse line names the incoming direction"},
        {id:"studio",name:"CHANNEL STUDIO",rule:"scanlines announce every delayed echo"}
      ];
      const breakers=[
        {id:"capacitor",lane:"power",name:"PARRY CAPACITOR",color:"#ff8a34",copy:"Correct BREAK reads earn +20 extra Renown."},
        {id:"overprint",lane:"power",name:"OVERPRINT",color:"#ffe12c",copy:"Every clean encounter earns a larger bonus."},
        {id:"softshell",lane:"guard",name:"SOFTSHELL",color:"#70ff8d",copy:"Successful BRACE reads restore more Clarity."},
        {id:"warmreset",lane:"guard",name:"WARM REBOOT",color:"#27e2ff",copy:"A Reboot returns with extra Clarity."},
        {id:"slipstep",lane:"flow",name:"SLIPSTEP",color:"#a572ff",copy:"Correct GLIDE reads earn +20 extra Renown."},
        {id:"reroute",lane:"flow",name:"EXTRA REROUTE",color:"#ff3e9d",copy:"Gain one additional contract Reroute."}
      ];
      const counterNames={brace:"BRACE",break:"BREAK",glide:"GLIDE"};
      const empty=()=>({active:false,mode:"idle",kind:"standard",stages:stageSets.standard,stage:0,rng:Math.random,renown:0,score:0,clarity:100,reboots:2,reroutes:2,power:0,guard:0,flow:0,history:[],contracts:[],current:null,draft:[],apex:null});
      let scramble=empty();
      const scrambleLog=$("scrambleLog"),counterButtons=[...root.querySelectorAll("[data-counter]")];
      const sound=code=>{try{if(typeof playSFX==="function")playSFX(code)}catch(_){}};
      const rngPick=list=>list[Math.floor(scramble.rng()*list.length)]||list[0];
      const className=variant=>variant==="elite"?"elite":variant==="chaos"?"chaos":"";
      const setText=(id,value)=>{const node=$(id);if(node)node.textContent=value};
      const addLog=(text,tone="")=>{const line=document.createElement("div");if(tone)line.className=tone;line.textContent=text;scrambleLog.append(line);while(scrambleLog.children.length>8)scrambleLog.firstElementChild?.remove();scrambleLog.scrollTop=scrambleLog.scrollHeight};
      function setStage(kicker,title,copy){
        const box=$("scrambleStage"),eyebrow=document.createElement("span"),heading=document.createElement("strong"),body=document.createElement("p");
        eyebrow.className="scramble-kicker";eyebrow.textContent=kicker;heading.textContent=title;body.textContent=copy;box.replaceChildren(eyebrow,heading,body);
      }
      function compatible(boss,trait,arena){
        return !((boss.id==="furnace"&&trait.id==="anchor")||(boss.id==="bishop"&&trait.id==="mirror")||(boss.id==="baron"&&arena.id==="studio"&&trait.id==="static"));
      }
      function unused(pool,used){const choices=pool.filter(item=>!used.has(item.id));return choices.length?choices:pool}
      function makeContract(slot,localBosses,localTraits){
        const priorBosses=new Set(scramble.history.map(entry=>entry.boss.id)),priorTraits=new Set(scramble.history.map(entry=>entry.trait.id));
        let boss,trait,arena,tries=0;
        do{boss=rngPick(unused(bosses,new Set([...priorBosses,...localBosses])));trait=rngPick(unused(traits,new Set([...priorTraits,...localTraits])));arena=rngPick(arenas);tries++}while(!compatible(boss,trait,arena)&&tries<40);
        localBosses.add(boss.id);localTraits.add(trait.id);
        const variants=[{lane:"CALIBRATED",variant:"safe",reward:11,threat:1},{lane:"ELITE",variant:"elite",reward:17,threat:2},{lane:"CHAOS",variant:"chaos",reward:24,threat:3}];
        const spec=variants[slot];
        return{boss,trait,arena,...spec,color:boss.color};
      }
      function generateContracts(){
        const localBosses=new Set(),localTraits=new Set();scramble.contracts=[0,1,2].map(slot=>makeContract(slot,localBosses,localTraits));
      }
      function encounterBeats(contract){
        if(contract.beats)return contract.beats;
        const first=contract.boss.attacks[scramble.stage%contract.boss.attacks.length],last=contract.boss.attacks[(scramble.stage+1)%contract.boss.attacks.length];
        return[{...first,source:contract.boss.name},{cue:contract.trait.cue,answer:contract.trait.answer,source:"BORROWED "+contract.trait.name},{...last,source:contract.boss.name}];
      }
      function makeApex(){
        const archiveBoss={id:"warden",icon:"▣",name:"ARCHIVE WARDEN",role:"curated finale",color:"#ff3e9d",attacks:[{cue:"CATALOGUE CORE // the center index opens bright. BREAK it.",answer:"break"},{cue:"CLOSING BRACKET // every outer rail lights at once. BRACE the inner ring.",answer:"brace"}]};
        const inherited=scramble.history.slice(-2).map(entry=>({cue:"ARCHIVED "+entry.trait.name+" // "+entry.trait.cue.split(" // ").slice(1).join(" // "),answer:entry.trait.answer,source:"ARCHIVED "+entry.trait.name}));
        const beats=[archiveBoss.attacks[0],...(inherited.length?inherited:[archiveBoss.attacks[1]]),archiveBoss.attacks[1]].slice(0,3);
        return{boss:archiveBoss,trait:{id:"archive",name:"CONVERGENCE ARCHIVE",detail:"the Warden returns patterns you already learned",color:"#ff3e9d",answer:"break",cue:"ARCHIVE OPEN"},arena:{id:"final",name:"THE STACK",rule:"each phase is cleanly separated and named"},lane:"APEX",variant:"elite",reward:35,threat:3,color:"#ff3e9d",beats};
      }
      function makeDraft(){
        const laneOrder=["power","guard","flow"];
        scramble.draft=laneOrder.map(lane=>rngPick(breakers.filter(breaker=>breaker.lane===lane)));
      }
      function renderContracts(){
        const holder=$("scrambleContracts");holder.replaceChildren();
        const addContract=(contract,index,isApex=false)=>{
          const card=document.createElement("article"),lane=document.createElement("div"),title=document.createElement("h3"),arena=document.createElement("p"),trait=document.createElement("p"),read=document.createElement("p"),reward=document.createElement("p"),button=document.createElement("button");
          card.className="scramble-contract "+className(contract.variant);card.style.setProperty("--contract",contract.color);lane.className="lane";lane.textContent=contract.lane+" // THREAT "+contract.threat;title.textContent=contract.boss.icon+" "+contract.boss.name;arena.textContent="ARENA // "+contract.arena.name+" · "+contract.arena.rule;trait.className="trait";trait.textContent="SCRAMBLE // "+contract.trait.name+" — "+contract.trait.detail;read.textContent="THREAT SCAN // counter cues stay visible.";reward.textContent="REWARD // +"+contract.reward+" Renown";button.type="button";button.textContent=isApex?"FACE THE WARDEN":"ENTER CONTRACT";button.addEventListener("click",()=>beginEncounter(contract));card.append(lane,title,arena,trait,read,reward,button);holder.append(card);
        };
        if(scramble.mode==="contracts")scramble.contracts.forEach((contract,index)=>addContract(contract,index));
        else if(scramble.mode==="apex"&&scramble.apex)addContract(scramble.apex,0,true);
        else{const emptyCard=document.createElement("div");emptyCard.className="scramble-empty";emptyCard.textContent=scramble.mode==="fight"?"ENCOUNTER IN PROGRESS // read the next named cue.":scramble.mode==="draft"?"BREAKER DRAFT OPEN // tune the build before the next gate.":scramble.mode==="complete"?"RUN DEBRIEF COMPLETE // start another bracket whenever you want.":"NO CONTRACTS YET // start a run to assemble the bracket.";holder.append(emptyCard)}
      }
      function renderFight(){
        const fight=$("scrambleFight"),visible=scramble.mode==="fight"&&scramble.current;fight.hidden=!visible;if(!visible)return;
        const current=scramble.current,beat=current.beats[current.beat];setText("scrambleFightLabel",current.boss.name+" // "+current.arena.name);setText("scrambleBeat","BEAT "+(current.beat+1)+"/"+current.beats.length);setText("scramblePrompt",beat.source+"\n"+beat.cue);setText("scrambleAnswer","VISIBLE COUNTER // choose "+counterNames[beat.answer]+". The cue stays on screen; speed is never required.");counterButtons.forEach(button=>button.disabled=false);
      }
      function renderDraft(){
        const draft=$("scrambleDraft"),holder=$("scrambleBreakers"),visible=scramble.mode==="draft";draft.hidden=!visible;holder.replaceChildren();if(!visible)return;
        scramble.draft.forEach((breaker,index)=>{const button=document.createElement("button"),title=document.createElement("strong"),copy=document.createElement("span");button.type="button";button.className="scramble-breaker";button.style.setProperty("--breaker",breaker.color);title.textContent=breaker.name+" // "+breaker.lane.toUpperCase();copy.textContent=breaker.copy;button.append(title,copy);button.addEventListener("click",()=>chooseBreaker(index));holder.append(button)});
      }
      function renderHistory(){
        const holder=$("scrambleHistory");holder.replaceChildren();const title=document.createElement("div");title.className="scramble-history-title";title.textContent="BRACKET HISTORY // "+(scramble.history.length?String(scramble.history.length)+" CLEARED":"EMPTY");holder.append(title);
        if(!scramble.history.length){const line=document.createElement("div");line.className="scramble-history-line";line.textContent="No boss has entered the archive.";holder.append(line);return}
        scramble.history.forEach((entry,index)=>{const line=document.createElement("div");line.className="scramble-history-line";line.style.setProperty("--hist",entry.boss.color);line.textContent=String(index+1).padStart(2,"0")+" // "+entry.boss.name+" + "+entry.trait.name+" // +"+entry.reward+" RENOWN";holder.append(line)});
      }
      function render(){
        const stageName=scramble.stages[Math.min(scramble.stage,scramble.stages.length-1)]||"—",round=scramble.active?String(Math.min(scramble.stage+1,scramble.stages.length))+"/"+scramble.stages.length:"—";
        setText("scrambleRound",round);setText("scrambleClarity",String(scramble.clarity));setText("scrambleReboots",String(scramble.reboots));setText("scrambleKeys",String(scramble.reroutes));setText("scrambleScore",String(scramble.renown));
        const status=$("scrambleStatus");status.textContent=scramble.mode==="complete"?"RUN COMPLETE":scramble.active?(scramble.mode==="fight"?"ENCOUNTER LIVE":scramble.mode==="draft"?"DRAFT OPEN":scramble.mode==="apex"?"APEX READY":"THREAT SCAN"):"GRID IDLE";
        $("scrambleStart").textContent=scramble.active?"↺ RESET + START":"▶ START BREAKPOINT";$("scrambleMode").disabled=scramble.active;$("scrambleReroute").disabled=!(scramble.active&&scramble.mode==="contracts"&&scramble.reroutes>0);$("scrambleAbandon").disabled=!scramble.active;
        if(scramble.mode==="idle")setStage("THREAT SCAN // WAITING","THE BRACKET IS QUIET.","Start a run to reveal three contracts. Every contract shows its boss, arena rule, borrowed trait, and counterplay before you choose.");
        else if(scramble.mode==="contracts")setStage("THREAT SCAN // "+stageName,stageName+" // PICK A CONTRACT.","Boss, arena, borrowed trait, and reward are all visible. Reroute replaces this set once without repeating an archived boss or trait.");
        else if(scramble.mode==="fight")setStage("ENCOUNTER // "+stageName,scramble.current.boss.name+" + "+scramble.current.trait.name,"Read the cue, then choose the named counter. Correct reads build Renown; a wrong read only lowers fictional Clarity.");
        else if(scramble.mode==="draft")setStage("BREAKER DRAFT // "+stageName,"CHOOSE ONE TEMPORARY BREAKER.","The upgrade lasts for this run only. The three lanes reward BREAK, BRACE, and GLIDE without hiding the next threat.");
        else if(scramble.mode==="apex")setStage("APEX // ARCHIVE WARDEN","THE RUN REMEMBERS WHAT YOU LEARNED.","The finale replays two traits from your own bracket in clean, separated beats. No surprise stack, no hidden counter.");
        else if(scramble.mode==="complete")setStage("RUN DEBRIEF // "+scramble.kind.toUpperCase(),"BREAKPOINT CLEARED // "+scramble.renown+" RENOWN.","Score: "+scramble.score+". Your Breakers and Renown are session-only; the base game stayed untouched. Start again for a fresh bracket.");
        renderContracts();renderFight();renderDraft();renderHistory();
      }
      function start(){
        const kind=$("scrambleMode").value,seed=(Math.random()*4294967295)>>>0;
        scramble={...empty(),active:true,mode:"contracts",kind,stages:stageSets[kind]||stageSets.standard,rng:mulberry32(seed||1),reboots:kind==="ascendant"?1:2,reroutes:kind==="ascendant"?1:2};
        generateContracts();scrambleLog.replaceChildren();addLog("THE CURATOR // “The bracket is live. Read the first three contracts.”","win");sound(SFX.START);render();
      }
      function beginEncounter(contract){
        if(!scramble.active||!(scramble.mode==="contracts"||scramble.mode==="apex"))return;
        scramble.current={...contract,beats:encounterBeats(contract),beat:0,successes:0,misses:0,rebootsUsed:0};scramble.mode="fight";addLog("THREAT LOCKED // "+contract.boss.name+" enters "+contract.arena.name+" with "+contract.trait.name+".","warn");sound(SFX.COLLIDE);render();
      }
      function resolveEncounter(){
        const current=scramble.current,clean=current.misses===0,score=90+current.reward*8+current.successes*(14+scramble.power*5)+(clean?35+scramble.flow*8:0),renown=current.reward+(clean?8:2)+scramble.flow;
        scramble.score+=score;scramble.renown+=renown;scramble.clarity=Math.min(100,scramble.clarity+8+scramble.guard*2);scramble.history.push({boss:current.boss,trait:current.trait,reward:renown});scramble.stage++;scramble.current=null;
        addLog("CLEARED // "+current.boss.name+" archived. +"+renown+" Renown // +"+score+" score."+(clean?" PERFECT READ.":" The bracket steadies."),"good");sound(scramble.stage>=scramble.stages.length?SFX.WIN:SFX.HARVEST);
        if(scramble.stage>=scramble.stages.length){scramble.active=false;scramble.mode="complete";addLog("BREAKPOINT COMPLETE // "+scramble.history.length+" fights cleared. The archive closes gently.","win")}
        else{scramble.mode="draft";makeDraft()}
        render();
      }
      function counter(answer){
        if(scramble.mode!=="fight"||!scramble.current)return;
        const current=scramble.current,beat=current.beats[current.beat],correct=answer===beat.answer;
        if(correct){current.successes++;const clarity=answer==="brace"?4+scramble.guard*3:1;scramble.clarity=Math.min(100,scramble.clarity+clarity);addLog("CLEAN "+counterNames[answer]+" // cue answered. +"+clarity+" Clarity.","good");sound(answer==="break"?SFX.HARVEST:SFX.STORY)}
        else{current.misses++;const loss=7+current.threat*3;scramble.clarity=Math.max(0,scramble.clarity-loss);addLog("MISMATCH // the cue asked for "+counterNames[beat.answer]+". -"+loss+" fictional Clarity.","warn");sound(SFX.NUL);if(scramble.clarity<=24&&scramble.reboots>0){scramble.reboots--;current.rebootsUsed++;scramble.clarity=Math.min(100,68+scramble.guard*7);addLog("WARM REBOOT // the beat rewinds safely. Clarity restored; the run continues.","win");sound(SFX.START)}}
        current.beat++;if(current.beat>=current.beats.length)resolveEncounter();else render();
      }
      function chooseBreaker(index){
        if(scramble.mode!=="draft")return;const breaker=scramble.draft[index];if(!breaker)return;
        scramble[breaker.lane]++;if(breaker.id==="reroute")scramble.reroutes++;addLog("BREAKER EQUIPPED // "+breaker.name+". "+breaker.copy,"good");sound(SFX.STORY);scramble.draft=[];
        if(scramble.stage===scramble.stages.length-1){scramble.apex=makeApex();scramble.mode="apex"}else{scramble.mode="contracts";generateContracts()}render();
      }
      function reroute(){
        if(!(scramble.active&&scramble.mode==="contracts"&&scramble.reroutes>0))return;scramble.reroutes--;generateContracts();addLog("REROUTE SPENT // the Curator replaces every visible contract.","warn");sound(SFX.RANDOM);render();
      }
      function abandon(){
        if(!scramble.active)return;scramble.active=false;scramble.mode="idle";scramble.contracts=[];scramble.current=null;scramble.draft=[];addLog("RUN ENDED // no penalty, no lost progress, no weird guilt. The bracket can wait.","warn");render();
      }
      $("scrambleStart").addEventListener("click",start);$("scrambleReroute").addEventListener("click",reroute);$("scrambleAbandon").addEventListener("click",abandon);counterButtons.forEach(button=>button.addEventListener("click",()=>counter(button.dataset.counter)));render();
    })();

    // GAME SELF-IMPROVEMENT FORM // local drafting only; it preserves entered words and never submits or stores a report.
    (()=>{
      "use strict";
      const root=document.querySelector("#gameImprove");
      if(!root)return;
      const $=id=>document.querySelector("#"+id),form=$("improveForm"),output=$("improveOutput"),live=$("improveLive"),resultTitle=$("improveResultTitle");
      const impactLabels={spark:"SPARK // tiny polish",bump:"BUMP // noticeable",wall:"WALL // stopped the flow"};
      const focusLabels={clarity:"clearer cues",pace:"kinder pacing",challenge:"challenge fit",access:"comfort / access"};
      const read=id=>$(id).value.trim();
      const focusValues=()=>[...root.querySelectorAll("[data-improve-focus]")].filter(input=>input.checked).map(input=>focusLabels[input.value]||input.value);
      const supplied=()=>Boolean(read("improveArea")||read("improveImpact")||read("improveKeep")||read("improveFriction")||read("improveChange")||read("improveTest")||read("improveUnknown")||focusValues().length);
      const valueOrOpen=(value,empty="OPEN / NOT ENTERED")=>value||empty;
      const setLive=(message,tone="")=>{live.className="improve-live"+(tone?" "+tone:"");live.textContent=message};
      const build=(kind)=>{
        if(!supplied()){
          output.textContent="NO NOTE PACKAGED YET // one choice or one short line is enough. This turns your words into a local review card; it cannot patch the game by itself.";
          setLive("Nothing to package yet. Pick one signal or leave one short note—both are enough.","warn");return;
        }
        const area=valueOrOpen(read("improveArea"),"NOT CHOSEN"),impact=impactLabels[read("improveImpact")]||"NOT CHOSEN",focus=focusValues();
        const keep=valueOrOpen(read("improveKeep")),friction=valueOrOpen(read("improveFriction")),change=valueOrOpen(read("improveChange")),test=valueOrOpen(read("improveTest")),unknown=valueOrOpen(read("improveUnknown"));
        const lines=kind==="plan"?[
          "BULLSHIT TELEPHONE WORLD 2 // LOCAL NEXT-RUN PLAN",
          "STATUS: UNSENT — no form data left this browser.",
          "AREA: "+area,
          "IMPACT: "+impact,
          "PRACTICE: "+(focus.length?focus.join(" · "):"OPEN / NOT CHOSEN"),
          "",
          "KEEP: "+keep,
          "FRICTION: "+friction,
          "SMALLEST NEXT PATCH: "+change,
          "TEST: "+test,
          "OPEN QUESTION: "+unknown
        ]:[
          "BULLSHIT TELEPHONE WORLD 2 // LOCAL TEST CARD",
          "STATUS: UNSENT — a review card, not an automatic change.",
          "AREA: "+area,
          "OBSERVATION: "+friction,
          "CHANGE TO TRY: "+change,
          "RETEST / SUCCESS SIGNAL: "+test,
          "CREDIT TO KEEP: "+keep,
          "STILL UNKNOWN: "+unknown,
          "FOCUS: "+(focus.length?focus.join(" · "):"OPEN / NOT CHOSEN")
        ];
        output.textContent=lines.join("\n");setLive(kind==="plan"?"Local next-run plan ready. Nothing was sent or changed automatically.":"Local test card ready. Your words were kept as entered; nothing was sent.","good");resultTitle.focus?.();
        try{if(typeof playSFX==="function")playSFX(SFX.STORY)}catch(_){}
      };
      $("improvePlan").addEventListener("click",()=>build("plan"));
      $("improveTestCard").addEventListener("click",()=>build("test"));
      $("improveClear").addEventListener("click",()=>{form.reset();output.textContent="NO NOTE PACKAGED YET // one choice or one short line is enough. This turns your words into a local review card; it cannot patch the game by itself.";setLive("Local draft cleared. Nothing was sent.");});
    })();

    const typingLearnPhrases=["THE STORY SQUEEZES INTO POEM.","SECRET SECRET // NUL NUL","DONUT-DONUT","MOON-SOUP-404","THE DUDE GETS A DONUT-DONUT.","UNKNOWN STAYS UNKNOWN.","FORTUNE-FIZZ // NO HURT MODE","BRAIN SCAN // TELEPHONE SOUP","PAY TO WIN EXTRA FUN."];
    let typingLearnCurrent="";const typingLearnMistakes=new Set();
    function renderTypingLearnFingerprint(){
      const readout=document.querySelector("#typingLearnFingerprint");if(!typingLearnMistakes.size){readout.textContent="UNIQUE ×2 FINGERPRINT FINGERPRINT // clean line; no typo marks yet.";return}
      const material=typingLearnCurrent+"::"+[...typingLearnMistakes].sort().join("|");let hash=2166136261;for(const char of material)hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
      readout.textContent="UNIQUE ×2 FINGERPRINT FINGERPRINT // TYP0-"+hash.toString(16).toUpperCase().padStart(8,"0")+" // "+typingLearnMistakes.size+" distinct typo mark"+(typingLearnMistakes.size===1?"":"s")+". This line-only mark stays in this page session; it is not a device ID and is not saved or sent.";
    }
    document.querySelector("#typingLearnNew").onclick=()=>{
      const choices=typingLearnPhrases.filter(phrase=>phrase!==typingLearnCurrent);typingLearnCurrent=pick(choices.length?choices:typingLearnPhrases);
      typingLearnMistakes.clear();document.querySelector("#typingLearnSweetNote").style.display="none";document.querySelector("#typingLearnPhrase").textContent=typingLearnCurrent;const input=document.querySelector("#typingLearnInput");input.maxLength=typingLearnCurrent.length;input.value="";document.querySelector("#typingLearnStatus").textContent="Type the line at your pace. Changes are okay; there’s no score penalty.";renderTypingLearnFingerprint();input.focus();
    };
    document.querySelector("#typingLearnInput").addEventListener("input",event=>{
      const input=event.currentTarget;if(!typingLearnCurrent){document.querySelector("#typingLearnStatus").textContent="Choose NEW PRACTICE LINE to begin.";return}
      const typed=input.value.toLocaleUpperCase();if(typed!==input.value){const cursor=input.selectionStart;input.value=typed;input.setSelectionRange(cursor,cursor)}
      const marksBefore=typingLearnMistakes.size;let matched=0;for(let i=0;i<typed.length;i++){if(typed[i]===typingLearnCurrent[i])matched++;else typingLearnMistakes.add(i+":"+typingLearnCurrent[i]+">"+typed[i])}renderTypingLearnFingerprint();
      if(typingLearnMistakes.size>marksBefore){const companion=document.querySelector("#petName").value.trim()||"Pip",isCat=document.querySelector("#petType").value==="🐱";document.querySelector("#typingLearnSweetNote").textContent=isCat?"That mistake brought your cat, "+companion+", back for one more tiny hello—in this game story.":"That mistake brought your companion, "+companion+", back for one more tiny hello—in this game story.";document.querySelector("#typingLearnSweetNote").style.display="block"}
      const status=document.querySelector("#typingLearnStatus");if(typed===typingLearnCurrent)status.textContent="LINE COMPLETE // nice typing. Pick another whenever you like.";
      else if(typed.length===typingLearnCurrent.length)status.textContent="LINE LENGTH REACHED // "+matched+"/"+typed.length+" characters match. Edit a key or choose another line.";
      else status.textContent=typed.length?"PROGRESS // "+typed.length+"/"+typingLearnCurrent.length+" characters · "+matched+" matching so far":"Type the phrase above. Take your time.";
    });
    document.addEventListener("keydown",e=>{if(e.ctrlKey||e.metaKey||e.altKey||e.repeat)return;const tag=e.target?.tagName;if(["INPUT","TEXTAREA","SELECT"].includes(tag)||e.target?.isContentEditable)return;const id=keyButtons[e.code];if(id){e.preventDefault();document.querySelector("#"+id)?.click()}});
    gameRender();

    // GUNPAPER // a small recursive world fed by the machine's input hopper.
    (()=>{
      const canvas=document.querySelector("#gunpaperCanvas"),ctx=canvas?.getContext("2d",{alpha:false});
      if(!canvas||!ctx)return;
      const pause=document.querySelector("#gunpaperPause"),refresh=document.querySelector("#gunpaperRefresh"),pierceButton=document.querySelector("#gunpaperPierce"),rabbitButton=document.querySelector("#gunpaperRabbit"),state=document.querySelector("#gunpaperState"),headline=document.querySelector("#gunpaperHeadline"),seed=document.querySelector("#seed"),reduce=matchMedia("(prefers-reduced-motion: reduce)"),fileInput=document.querySelector("#gunpaperFileInput"),filePick=document.querySelector("#gunpaperFilePick"),fileFuck=document.querySelector("#gunpaperFileFuck"),fileDownload=document.querySelector("#gunpaperFileDownload"),fileEject=document.querySelector("#gunpaperFileEject"),fileStatus=document.querySelector("#gunpaperFileStatus"),fileOutput=document.querySelector("#gunpaperFileOutput");
      const GRID=4,PERIOD=2400,BRUTE_PERIOD=420,ZOOM=GRID/2,PREVIEW_LEVELS=8;
      const FILE_MAX_BYTES=1024*1024,FILE_TERM_LIMIT=900,FILE_PREVIEW_LIMIT=12000;
      const fileExtensions=new Set([".txt",".md",".csv",".tsv",".json",".jsonl",".html",".htm",".xml",".yaml",".yml",".js",".mjs",".cjs",".ts",".tsx",".jsx",".css",".svg",".log"]);
      let w=0,h=0,dpr=1,paused=false,pauseAt=0,started=performance.now(),depth=0,brutePierce=false,proceduralSeed=(Math.random()*4294967295)>>>0,worlds=[],edition=[],impactAt=-Infinity,foodPoints=0,rabbitTimer=0,fileInk="",fileName="",fileTerms=[],fileCopy="",fileRoll=0,fileReadToken=0;
      const fallback=["REGRET","HAUNTED","APOLOGIES","BAD DECISION","COMPLIMENT"];
      const autoWords=["MUNICIPAL","RACCOON","COUPON","SOUP","MAYOR","THUNDER","BUREAU","PUDDLE","GHOST","MEATBALL","ORBIT","DISCOUNT","TAX","SANDWICH","PROPHECY","LOOPHOLE"];
      const worldNodes=["#wordOut","#nameOut","#characterOut","#desireCaption","#poemOut","#storyOut","#canonOut","#hiveOut","#rearOut","#commandLog"];
      let editionSerial=0,editionTimer=0;
      function proceduralRandom(){proceduralSeed=(Math.imul(proceduralSeed,1664525)+1013904223)>>>0;return proceduralSeed/4294967296}
      function randomVertex(){return{x:1+Math.floor(proceduralRandom()*(GRID-1)),y:1+Math.floor(proceduralRandom()*(GRID-1))}}
      function makePalette(avoid=-1000){let hue=proceduralRandom()*360;while(Math.abs(((hue-avoid+540)%360)-180)<58)hue=proceduralRandom()*360;const shift=105+proceduralRandom()*75;return{hue,a:`hsl(${hue} ${74+proceduralRandom()*20}% ${42+proceduralRandom()*14}%)`,b:`hsl(${(hue+shift)%360} ${70+proceduralRandom()*22}% ${48+proceduralRandom()*18}%)`,bg:`hsl(${(hue+236)%360} 30% 5%)`}}
      function makeWorld(parent){return{palette:makePalette(parent?.palette?.hue),vertex:randomVertex()}}
      function replenishWorlds(){while(worlds.length<PREVIEW_LEVELS)worlds.push(makeWorld(worlds.at(-1)))}
      function resetWorld(){depth=0;started=performance.now();worlds=[];replenishWorlds()}
      function wordsFrom(value){return(String(value||"").match(/[\p{L}\p{N}']+/gu)||[]).filter(word=>word.length>2&&word.length<22).map(word=>word.toUpperCase())}
      function livingWorld(){return worldNodes.map(selector=>document.querySelector(selector)?.textContent||"").filter(line=>line&&!/nothing has escaped|machine is humming|no canon has|little brains are asleep|waiting for/i.test(line)).join(" ")}
      function makeEdition(){const source=`${livingWorld()} ${seed?.value||""}`,seen=new Set(),terms=[...wordsFrom(source),...fileTerms].filter(word=>{if(seen.has(word))return false;seen.add(word);return true}),fake=offset=>autoWords[(editionSerial*7+offset*3)%autoWords.length],live=offset=>terms[(editionSerial*3+offset*5)%terms.length]||fake(offset),fromFile=offset=>fileTerms[(editionSerial*7+offset*5)%fileTerms.length]||live(offset),pick=offset=>fileTerms.length&&(offset===0||offset===2||offset===4)?fromFile(offset):(editionSerial+offset)%2?fake(offset):live(offset),a=pick(0),b=pick(1),c=pick(2),d=pick(3),e=pick(4);edition=[`${a} WEATHER ALERT`,`${b} FILES A COMPLAINT`,`LOOPHOLE FOUND IN ${c}`,`${d} NEEDS A RECEIPT`,`MAYOR BLAMES ${e}`].map(line=>line.slice(0,34));if(worlds.length)updateHeadline();else headline.textContent=`BREAKING NOW: ${edition[0]}`;editionSerial++}
      function setFileStatus(message,tone=""){if(!fileStatus)return;fileStatus.className=`gunpaper-file-status${tone?` ${tone}`:""}`;fileStatus.textContent=message}
      function setFileOutput(message){if(fileOutput)fileOutput.textContent=message}
      function syncFileActions(reading=false){if(fileFuck)fileFuck.disabled=reading||!fileInk;if(fileDownload)fileDownload.disabled=reading||!fileCopy;if(fileEject)fileEject.disabled=!(reading||fileInk)}
      function safeFileName(name){const clean=String(name||"local-file.txt").normalize("NFC").replace(/[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g," ").trim().slice(0,120);return clean||"local-file.txt"}
      function isTextLikeFile(file){const name=String(file?.name||"").toLowerCase(),extension=(name.match(/\.[a-z0-9]+$/)||[""])[0],type=String(file?.type||"").toLowerCase().split(";",1)[0],acceptedType=type.startsWith("text/")||["application/json","application/ld+json","application/javascript","application/x-javascript","application/xml","application/xhtml+xml","image/svg+xml"].includes(type);return fileExtensions.has(extension)||acceptedType}
      function normaliseFileText(raw){return String(raw||"").normalize("NFC").replace(/\r\n?/g,"\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g," ")}
      function fileTermsFrom(text){const raw=wordsFrom(text),fallback=raw.length?raw:(String(text).match(/[\p{L}\p{N}']+/gu)||[]).map(word=>word.toUpperCase()),found=[],seen=new Set();for(const word of fallback){if(seen.has(word))continue;seen.add(word);found.push(word);if(found.length>=FILE_TERM_LIMIT)break}return found}
      async function readLocalText(file){const bytes=new Uint8Array(await file.arrayBuffer());if(bytes.includes(0))throw new Error("BINARY-LOOKING FILE REJECTED");try{return new TextDecoder("utf-8",{fatal:true}).decode(bytes)}catch(error){throw new Error("GUNPAPER NEEDS UTF-8 TEXT")}}
      function fileHash(text){let value=2166136261;for(let index=0;index<text.length;index++)value=Math.imul(value^text.charCodeAt(index),16777619)>>>0;return value>>>0}
      function fileRandom(seedValue){let value=seedValue>>>0;return()=>{value=(value+0x6D2B79F5)>>>0;let mixed=value;mixed=Math.imul(mixed^(mixed>>>15),mixed|1);mixed^=mixed+Math.imul(mixed^(mixed>>>7),mixed|61);return((mixed^(mixed>>>14))>>>0)/4294967296}}
      function crumpleWord(word,rng){const chars=Array.from(word);if(chars.length<3)return chars.join("");const mode=Math.floor(rng()*4);if(mode===0)return chars.reverse().join("");if(mode===1){const first=chars.shift();return chars.join("")+first}if(mode===2)return chars.map((char,index)=>/[AEIOUYaeiouyÀ-ÖØ-öø-ÿ]/u.test(char)&&(index+Math.floor(rng()*2))%2===0?"Ø":char).join("");return chars.map((char,index)=>index%3===1?"█":char).join("")}
      function previewFileCopy(){const clipped=fileCopy.length>FILE_PREVIEW_LIMIT,tail=clipped?"\n\n[PREVIEW CLIPPED // THE FULL CRUMPLED COPY DOWNLOADS AS .TXT]":"";setFileOutput(`${fileCopy.slice(0,FILE_PREVIEW_LIMIT)}${tail}`)}
      function crumpleFileCopy(){if(!fileInk||!fileTerms.length){setFileStatus("NO FILE INK // LOAD A TEXT FILE FIRST.","warn");return}fileRoll++;const chunks=fileInk.split(/([\p{L}\p{N}][\p{L}\p{N}'_-]*)/gu),wordSlots=[];for(let index=1;index<chunks.length;index+=2)if(chunks[index])wordSlots.push(index);const rng=fileRandom(fileHash(`${fileInk}\n${fileName}\n${fileRoll}`)),turns=Math.min(12000,Math.max(1,Math.ceil(wordSlots.length*(.12+rng()*.12))));for(let turn=0;turn<turns;turn++){const slotIndex=Math.floor(rng()*wordSlots.length),slot=wordSlots[slotIndex];if(wordSlots.length>1&&rng()<.31){const other=wordSlots[(slotIndex+1+Math.floor(rng()*4))%wordSlots.length],[first,second]=[chunks[slot],chunks[other]];chunks[slot]=second;chunks[other]=first}else chunks[slot]=crumpleWord(chunks[slot],rng)}const header=["GUNPAPER // CRUMPLED LOCAL COPY",`SOURCE: ${fileName}`,`ROLL: ${String(fileRoll).padStart(2,"0")}`,"ORIGINAL FILE: UNTOUCHED","FILE DATA: THIS TAB ONLY // THIS INTAKE DOES NOT UPLOAD OR EXECUTE IT","------------------------------------------------------------",""].join("\n");fileCopy=`${header}${chunks.join("")}`;previewFileCopy();syncFileActions();setFileStatus(`NEW COPY GENERATED // ROLL ${fileRoll} // ORIGINAL ${fileName} IS STILL UNTOUCHED.`,"good");newEdition()}
      function crumpledFileName(){const raw=safeFileName(fileName).replace(/\.[^./\\]+$/,"").replace(/[<>:"/\\|?*]/g,"-").replace(/[^\p{L}\p{N}._-]+/gu,"-").replace(/^-+|-+$/g,"").slice(0,72)||"local-file";return `gunpaper-crumpled-${raw}-${String(fileRoll).padStart(2,"0")}.txt`}
      function downloadFileCopy(){if(!fileCopy){setFileStatus("MAKE A SAFE COPY BEFORE DOWNLOADING.","warn");return}try{const blob=new Blob([fileCopy],{type:"text/plain;charset=utf-8"}),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=crumpledFileName();link.style.display="none";document.body?.appendChild(link);link.click();link.remove?.();setTimeout(()=>URL.revokeObjectURL(url),1000);setFileStatus(`DOWNLOAD STARTED // ${link.download} IS A NEW .TXT COPY.`,"good")}catch(error){setFileStatus("DOWNLOAD COULDN'T START // THE COPY IS STILL IN THE PREVIEW.","warn")}}
      function restoreFileControls(){syncFileActions(false);if(fileInput)fileInput.value=""}
      async function loadLocalFile(){const file=fileInput?.files?.[0];if(!file)return;const token=++fileReadToken;if(!isTextLikeFile(file)){restoreFileControls();setFileStatus(`TYPE REJECTED // ${safeFileName(file.name)} ISN'T TEXT-LIKE.${fileInk?" PREVIOUS FILE INK IS STILL LOADED.":""}`,"warn");return}if(!Number.isFinite(file.size)||file.size<1){restoreFileControls();setFileStatus("EMPTY FILE REJECTED // GUNPAPER NEEDS SOME INK.","warn");return}if(file.size>FILE_MAX_BYTES){restoreFileControls();setFileStatus("FILE TOO BIG // GUNPAPER STOPS AT 1 MB. PREVIOUS FILE INK STAYED PUT.","warn");return}syncFileActions(true);setFileStatus(`READING LOCAL COPY // ${safeFileName(file.name)} // NOTHING IS UPLOADED.`);try{const raw=await readLocalText(file);if(token!==fileReadToken)return;const clean=normaliseFileText(raw),terms=fileTermsFrom(clean);if(!clean.trim()||!terms.length)throw new Error("EMPTY OR WORDLESS TEXT REJECTED");fileInk=clean;fileName=safeFileName(file.name);fileTerms=terms;fileCopy="";fileRoll=0;restoreFileControls();setFileOutput(`FILE INK READY // ${fileName}\n${fileTerms.length} SAFE HEADLINE TERMS ARE NOW HAUNTING GUNPAPER.\n\nPress FUCK UP A SAFE COPY to make a separate local .txt edition. The original file cannot be changed here.`);setFileStatus(`FILE INK LOADED // ${fileName} // ${fileTerms.length} TERMS // ORIGINAL UNTOUCHED.`,"good");newEdition()}catch(error){if(token!==fileReadToken)return;restoreFileControls();const reason=error instanceof Error&&error.message?error.message:"GUNPAPER COULDN'T READ THAT FILE";setFileStatus(`FILE REJECTED // ${reason}.${fileInk?" PREVIOUS FILE INK IS STILL LOADED.":""}`,"warn")}}
      function ejectLocalFile(){fileReadToken++;fileInk="";fileName="";fileTerms=[];fileCopy="";fileRoll=0;if(fileInput)fileInput.value="";syncFileActions();setFileOutput("CRUMPLED COPY // waiting for a local file. When you press FUCK UP A SAFE COPY, this box gets a separate cut-up text edition you can download.");setFileStatus("EJECTED // PAGE COPY CLEARED. GUNPAPER IS BACK TO ITS REGULAR FAKE NEWS.","good");newEdition()}
      function scheduleEdition(){clearTimeout(editionTimer);editionTimer=setTimeout(makeEdition,90)}
      function resize(){const box=canvas.getBoundingClientRect();dpr=Math.min(devicePixelRatio||1,2);w=Math.max(1,box.width);h=Math.max(1,box.height);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0)}
      function colorAt(x,y,p){return(x+y)%2?p.a:p.b}
      function paperMark(x,y,size,phrase){if(size<62)return;const pad=size*.13;ctx.save();ctx.beginPath();ctx.rect(x,y,size,size);ctx.clip();ctx.fillStyle="rgba(6,7,12,.30)";ctx.fillRect(x+pad,y+pad,size-pad*2,size*.23);ctx.fillStyle="rgba(255,255,255,.78)";ctx.font=`700 ${Math.max(7,size*.05)}px ui-monospace,monospace`;ctx.fillText("GUNPAPER",x+pad*1.25,y+pad*1.9);ctx.fillStyle="rgba(7,8,14,.52)";ctx.fillRect(x+pad,y+size*.47,size-pad*2,Math.max(1,size*.012));ctx.font=`600 ${Math.max(7,size*.043)}px ui-monospace,monospace`;ctx.fillStyle="rgba(7,8,14,.74)";ctx.fillText(phrase,x+pad,y+size*.63);ctx.restore()}
      function board(x,y,size,world,lineAlpha=.16,opacity=1){ctx.save();ctx.globalAlpha*=opacity;const step=size/GRID;for(let iy=0;iy<GRID;iy++)for(let ix=0;ix<GRID;ix++){ctx.fillStyle=colorAt(ix,iy,world.palette);ctx.fillRect(x+ix*step,y+iy*step,step+.75,step+.75);paperMark(x+ix*step,y+iy*step,step,edition[(ix+iy*GRID+depth)%edition.length])}ctx.strokeStyle=`rgba(255,255,255,${lineAlpha})`;ctx.lineWidth=Math.max(.5,size/950);for(let i=0;i<=GRID;i++){ctx.beginPath();ctx.moveTo(x+i*step,y);ctx.lineTo(x+i*step,y+size);ctx.stroke();ctx.beginPath();ctx.moveTo(x,y+i*step);ctx.lineTo(x+size,y+i*step);ctx.stroke()}ctx.restore()}
      function updateHeadline(){const world=worlds[0],paper=edition[(depth+(world?.vertex.x||0)+(world?.vertex.y||0))%edition.length]||"GUNPAPER";headline.textContent=`DEPTH ${String(depth+1).padStart(3,"0")} // ${paper}`}
      function advanceWorld(){if(!worlds.length)replenishWorlds();worlds.shift();replenishWorlds();depth++;makeEdition()}
      function drawHypnoglyph(now){const age=now-impactAt;if(age<0||age>860)return;const progress=age/860,alpha=(1-progress)*.34,radius=20+progress*Math.min(w,h)*.19,hue=worlds[0]?.palette.hue||284;ctx.save();ctx.translate(w/2,h/2);ctx.rotate(progress*.62);ctx.strokeStyle=`hsla(${hue} 100% 73% / ${alpha})`;ctx.lineWidth=1.5;for(let i=0;i<3;i++){const side=radius*(.42+i*.27);ctx.strokeRect(-side/2,-side/2,side,side)}ctx.beginPath();ctx.moveTo(-radius*.68,0);ctx.lineTo(0,-radius*.68);ctx.lineTo(radius*.68,0);ctx.lineTo(0,radius*.68);ctx.closePath();ctx.stroke();ctx.restore()}
      function drawPeelBoxes(raw,now){const hue=worlds[1]?.palette.hue||284,reach=Math.min(w,h)*.43;ctx.save();ctx.translate(w/2,h/2);for(let i=0;i<6;i++){const phase=(raw+i/6)%1,spread=Math.pow(phase,.72),side=16+reach*spread,spin=(i%2?1:-1)*(phase*1.35+now*.00008),alpha=(1-phase)*.23;ctx.save();ctx.rotate(spin);ctx.translate((i-2.5)*spread*10,(2.5-i)*spread*7);ctx.strokeStyle=`hsla(${(hue+i*19)%360} 100% 72% / ${alpha})`;ctx.lineWidth=Math.max(1,3-spread*2);ctx.setLineDash([Math.max(3,side*.06),Math.max(3,side*.035)]);ctx.strokeRect(-side/2,-side/2,side,side);ctx.restore()}ctx.restore();ctx.setLineDash([])}
      function rabbitHole(){const now=performance.now(),period=brutePierce?BRUTE_PERIOD:PERIOD,reward=3+Math.floor(proceduralRandom()*8);if(paused){paused=false;pause.textContent="PAUSE WORLD";requestAnimationFrame(draw)}started=now-period*.54;worlds.splice(1);replenishWorlds();depth++;makeEdition();foodPoints+=reward;impactAt=now;state.textContent="RABBIT HOLE";headline.textContent=`FOOD POINTS +${reward} // TOTAL ${foodPoints} // ${edition[depth%edition.length]||"GUNPAPER"}`;rabbitButton?.classList.add("on");rabbitButton.textContent=`FOOD POINTS ${foodPoints} // CLICK AGAIN`;clearTimeout(rabbitTimer);rabbitTimer=setTimeout(()=>{rabbitButton?.classList.remove("on");rabbitButton.textContent="HYPNOGLYPH // FOOD POINTS";if(!paused)state.textContent=brutePierce?"BRUTEPIERCE":"LIVE"},860)}
      function draw(now){if(window.__gunpaperFallback)return;window.__gunpaperFrame=now;const period=brutePierce?BRUTE_PERIOD:PERIOD;if(worlds.length<2)replenishWorlds();let elapsed=now-started;if(!Number.isFinite(elapsed)||elapsed<0){started=now;elapsed=0}const due=Math.floor(elapsed/period);if(due){const steps=Math.min(due,12);if(due>12){elapsed%=period;started=now-elapsed}else{started+=due*period;elapsed-=due*period}for(let i=0;i<steps;i++)advanceWorld()}const raw=elapsed/period,spawn=Math.min(1,raw*1.45),scale=Math.pow(ZOOM,raw),size=Math.max(w,h)*1.7,originX=-size/2,originY=-size/2,cell=size/GRID,vertex=worlds[0].vertex,targetX=originX+vertex.x*cell,targetY=originY+vertex.y*cell;ctx.fillStyle=worlds[0].palette.bg;ctx.fillRect(0,0,w,h);ctx.save();ctx.translate(w/2,h/2);ctx.scale(scale,scale);ctx.translate(-targetX,-targetY);board(originX,originY,size,worlds[0],.16);const childSize=cell*2,childX=targetX-cell,childY=targetY-cell;board(childX,childY,childSize,worlds[1],.22,spawn);ctx.restore();drawPeelBoxes(raw,now);const dotAlpha=1-spawn;if(dotAlpha>.01){const radius=2+spawn*Math.min(w,h)*.11,bloom=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,radius*2.5);bloom.addColorStop(0,`rgba(255,255,255,${dotAlpha})`);bloom.addColorStop(.25,`hsla(${worlds[1].palette.hue} 100% 70% / ${dotAlpha*.8})`);bloom.addColorStop(1,"rgba(0,0,0,0)");ctx.fillStyle=bloom;ctx.beginPath();ctx.arc(w/2,h/2,radius*2.5,0,Math.PI*2);ctx.fill();ctx.fillStyle=`rgba(255,255,255,${dotAlpha})`;ctx.beginPath();ctx.arc(w/2,h/2,Math.max(1.5,radius*.14),0,Math.PI*2);ctx.fill()}drawHypnoglyph(now);const vignette=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*.15,w/2,h/2,Math.max(w,h)*.78);vignette.addColorStop(0,"rgba(0,0,0,0)");vignette.addColorStop(1,"rgba(0,0,0,.3)");ctx.fillStyle=vignette;ctx.fillRect(0,0,w,h);if(!paused)requestAnimationFrame(draw)}
      function toggle(){if(paused){paused=false;started+=performance.now()-pauseAt;pause.textContent="PAUSE WORLD";state.textContent=brutePierce?"BRUTEPIERCE":"LIVE";requestAnimationFrame(draw)}else{paused=true;pauseAt=performance.now();pause.textContent="RESUME WORLD";state.textContent="PAUSED"}}
      function togglePierce(){const now=paused?pauseAt:performance.now(),oldPeriod=brutePierce?BRUTE_PERIOD:PERIOD,progress=(now-started)/oldPeriod;brutePierce=!brutePierce;started=now-progress*(brutePierce?BRUTE_PERIOD:PERIOD);pierceButton.classList.toggle("on",brutePierce);pierceButton.textContent=brutePierce?"BRUTEPIERCE ACTIVE":"BRUTEPIERCE MODE";state.textContent=paused?"PAUSED":brutePierce?"BRUTEPIERCE":"LIVE"}
      function newEdition(){makeEdition();worlds.splice(1);replenishWorlds();updateHeadline();if(paused)draw(performance.now())}
      const resizeWatcher=typeof ResizeObserver==="function"?new ResizeObserver(resize):null;resizeWatcher?.observe(canvas);window.addEventListener("resize",resize,{passive:true});makeEdition();resetWorld();updateHeadline();resize();pause.addEventListener("click",toggle);canvas.addEventListener("click",rabbitHole);canvas.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();rabbitHole()}});refresh.addEventListener("click",newEdition);pierceButton.addEventListener("click",togglePierce);rabbitButton?.addEventListener("click",rabbitHole);filePick?.addEventListener("click",()=>fileInput?.click());fileInput?.addEventListener("change",()=>{void loadLocalFile()});fileFuck?.addEventListener("click",crumpleFileCopy);fileDownload?.addEventListener("click",downloadFileCopy);fileEject?.addEventListener("click",ejectLocalFile);seed?.addEventListener("input",scheduleEdition);document.querySelector("#go")?.addEventListener("click",scheduleEdition);const newsdesk=new MutationObserver(scheduleEdition);worldNodes.map(selector=>document.querySelector(selector)).filter(Boolean).forEach(node=>newsdesk.observe(node,{childList:true,characterData:true,subtree:true}));requestAnimationFrame(draw);
    })();

    // PAINT PROGRAM // deliberately RAM-only: reload = clean wall.
    const paintCanvas=document.querySelector("#paintCanvas"),paintCtx=paintCanvas.getContext("2d",{willReadFrequently:true});
    const paintTool=document.querySelector("#paintTool"),paintColor=document.querySelector("#paintColor"),paintSize=document.querySelector("#paintSize"),paintSymbol=document.querySelector("#paintSymbol"),paintStatus=document.querySelector("#paintStatus"),paintUndo=[];
    let painting=false,paintLast=null,wobblePhase=0;
    function paintSnapshot(){paintUndo.push(paintCtx.getImageData(0,0,paintCanvas.width,paintCanvas.height));if(paintUndo.length>16)paintUndo.shift()}
    function paintReset(){paintCtx.save();paintCtx.globalCompositeOperation="source-over";paintCtx.fillStyle="#05070a";paintCtx.fillRect(0,0,paintCanvas.width,paintCanvas.height);paintCtx.restore()}
    function paintPoint(e){const r=paintCanvas.getBoundingClientRect();return{x:(e.clientX-r.left)*paintCanvas.width/r.width,y:(e.clientY-r.top)*paintCanvas.height/r.height}}
    function paintLine(a,b,tool){
      const size=+paintSize.value,color=paintColor.value,dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy)||1;
      paintCtx.save();paintCtx.lineCap="round";paintCtx.lineJoin="round";paintCtx.lineWidth=size;paintCtx.strokeStyle=tool==="erase"?"#05070a":color;
      if(tool==="wobble"){
        const nx=-dy/dist,ny=dx/dist,steps=Math.max(1,Math.ceil(dist/3));paintCtx.beginPath();
        for(let i=0;i<=steps;i++){const t=i/steps,w=Math.sin(wobblePhase+t*dist*.13)*size*1.25,x=a.x+dx*t+nx*w,y=a.y+dy*t+ny*w;if(i===0)paintCtx.moveTo(x,y);else paintCtx.lineTo(x,y)}
        paintCtx.stroke();wobblePhase+=dist*.13;
      }else{paintCtx.beginPath();paintCtx.moveTo(a.x,a.y);paintCtx.lineTo(b.x,b.y);paintCtx.stroke()}
      paintCtx.restore();
    }
    function paintStamp(p){const s=(paintSymbol.value||"✦").slice(0,6),size=+paintSize.value;paintCtx.save();paintCtx.fillStyle=paintColor.value;paintCtx.font=`900 ${Math.max(12,size*2.5)}px ui-monospace,monospace`;paintCtx.textAlign="center";paintCtx.textBaseline="middle";paintCtx.fillText(s,p.x,p.y);paintCtx.restore()}
    paintCanvas.addEventListener("pointerdown",e=>{e.preventDefault();const p=paintPoint(e),tool=paintTool.value;if(tool==="dropper"){const d=paintCtx.getImageData(Math.floor(p.x),Math.floor(p.y),1,1).data;paintColor.value="#"+[d[0],d[1],d[2]].map(n=>n.toString(16).padStart(2,"0")).join("");paintStatus.textContent="EYEDROPPER // STOLE THAT COLOR";return}paintSnapshot();if(tool==="symbol"){paintStamp(p);paintStatus.textContent="SYMBOL STAMPED // LANGUAGE IS NOW PAINT";return}painting=true;paintLast=p;paintCanvas.setPointerCapture(e.pointerId);paintLine(p,{x:p.x+.01,y:p.y+.01},tool);paintStatus.textContent=(tool==="wobble"?"WOBBLE WAVE":"PAINT")+" // MAKING MARKS"});
    paintCanvas.addEventListener("pointermove",e=>{if(!painting)return;const p=paintPoint(e);paintLine(paintLast,p,paintTool.value);paintLast=p});
    const paintUp=()=>{if(painting){painting=false;paintLast=null;paintStatus.textContent="MARK COMMITTED // UNDO EXISTS"}};paintCanvas.addEventListener("pointerup",paintUp);paintCanvas.addEventListener("pointercancel",paintUp);
    document.querySelector("#paintPalette").addEventListener("click",e=>{const b=e.target.closest("[data-color]");if(b)paintColor.value=b.dataset.color});
    paintSize.oninput=()=>document.querySelector("#paintSizeOut").textContent=paintSize.value;
    document.querySelector("#paintUndo").onclick=()=>{const old=paintUndo.pop();if(old){paintCtx.putImageData(old,0,0);paintStatus.textContent="UNDO // PREVIOUS REALITY RESTORED"}else paintStatus.textContent="UNDO // NOTHING LEFT TO REGRET"};
    document.querySelector("#paintClear").onclick=()=>{paintSnapshot();paintReset();paintStatus.textContent="CLEAR // WALL CLEAN, HISTORY HAS ONE UNDO"};
    document.querySelector("#paintRandom").onclick=()=>{paintSnapshot();const colors=["#f4f7fb","#ffe12c","#ff3e9d","#27e2ff","#70ff8d","#ff8a34","#a572ff"];for(let i=0;i<46;i++){paintCtx.save();paintCtx.globalAlpha=.35+Math.random()*.65;paintCtx.fillStyle=colors[Math.floor(Math.random()*colors.length)];const x=Math.random()*paintCanvas.width,y=Math.random()*paintCanvas.height,s=4+Math.random()*55;paintCtx.translate(x,y);paintCtx.rotate(Math.random()*Math.PI);if(Math.random()>.4)paintCtx.fillRect(-s/2,-s/2,s*2,s);else{paintCtx.beginPath();paintCtx.arc(0,0,s,0,Math.PI*2);paintCtx.fill()}paintCtx.restore()}paintStatus.textContent="RANDOM RANDOM // 46 UNQUALIFIED ART DECISIONS"};
    function varyPaint(power=1){paintSnapshot();const w=paintCanvas.width,h=paintCanvas.height,src=paintCtx.getImageData(0,0,w,h),out=paintCtx.createImageData(w,h),amp=3+Math.floor(Math.random()*8)*power;for(let y=0;y<h;y++){const shift=Math.round(Math.sin(y*.045+Math.random()*.15)*amp);for(let x=0;x<w;x++){const sx=(x+shift+w)%w,si=(y*w+sx)*4,di=(y*w+x)*4;out.data[di]=Math.min(255,src.data[si]+(Math.random()>.992?25:0));out.data[di+1]=src.data[si+1];out.data[di+2]=src.data[si+2];out.data[di+3]=src.data[si+3]}}paintCtx.putImageData(out,0,0);paintStatus.textContent=power>1?"WOBBLE IT // WHOLE CANVAS BENT SIDEWAYS":"<VARY>[VARY] // SAME PICTURE, DIFFERENT ANGLE"}
    function ascendPaintToAscii(saveUndo=true){
      const cols=90,rows=36,cellW=paintCanvas.width/cols,cellH=paintCanvas.height/rows,ramp=" .'`^,:;Il!i><~+_-?][}{1)(|\\/*tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",source=paintCtx.getImageData(0,0,paintCanvas.width,paintCanvas.height),lines=[];
      if(saveUndo)paintSnapshot();paintCtx.fillStyle="#05070a";paintCtx.fillRect(0,0,paintCanvas.width,paintCanvas.height);paintCtx.save();paintCtx.font="15px ui-monospace,Consolas,monospace";paintCtx.textBaseline="top";paintCtx.textAlign="left";
      for(let row=0;row<rows;row++){let line="";for(let col=0;col<cols;col++){let r=0,g=0,b=0,n=0;const x0=Math.floor(col*cellW),x1=Math.floor((col+1)*cellW),y0=Math.floor(row*cellH),y1=Math.floor((row+1)*cellH);for(let y=y0;y<y1;y+=2)for(let x=x0;x<x1;x+=2){const i=(y*paintCanvas.width+x)*4;r+=source.data[i];g+=source.data[i+1];b+=source.data[i+2];n++}r=Math.round(r/(n||1));g=Math.round(g/(n||1));b=Math.round(b/(n||1));const light=(.2126*r+.7152*g+.0722*b)/255,glyph=light<.055?" ":ramp[Math.min(ramp.length-1,Math.floor(light*ramp.length))];line+=glyph;if(glyph!==" "){paintCtx.fillStyle=`rgb(${r},${g},${b})`;paintCtx.fillText(glyph,col*cellW,row*cellH)}}lines.push(line)}paintCtx.restore();document.querySelector("#asciiPictureText").value=lines.join("\n");paintStatus.textContent="CHARACTER ASCENSION // picture translated into ASCII // UNDO keeps the original";
    }
    document.querySelector("#paintAscend").onclick=ascendPaintToAscii;
    function cheese4Camera(){
      const w=paintCanvas.width,h=paintCanvas.height,src=paintCtx.getImageData(0,0,w,h),out=paintCtx.createImageData(w,h);let marks=0;
      for(let y=0;y<h;y+=3)for(let x=0;x<w;x+=3){const i=(y*w+x)*4;if(src.data[i]+src.data[i+1]+src.data[i+2]>105)marks++}
      paintSnapshot();
      if(marks){
        for(let y=0;y<h;y++){const band=Math.floor(y/12),jump=(band%4===1?Math.round(Math.sin(band*2.1)*9):0)+(Math.random()<.045?Math.floor(Math.random()*17)-8:0);for(let x=0;x<w;x++){const sx=(x+jump+w)%w,si=(y*w+sx)*4,ri=(y*w+(sx+3)%w)*4,bi=(y*w+(sx+w-3)%w)*4,di=(y*w+x)*4;out.data[di]=src.data[ri];out.data[di+1]=src.data[si+1];out.data[di+2]=src.data[bi+2];out.data[di+3]=src.data[si+3]}}
        paintCtx.putImageData(out,0,0);paintCtx.save();paintCtx.globalAlpha=.11;for(let y=4;y<h;y+=9){paintCtx.fillStyle=y%18===4?"#27e2ff":"#ff3e9d";paintCtx.fillRect(0,y,w,1)}paintCtx.restore();
      }else{
        paintCtx.fillStyle="#070b12";paintCtx.fillRect(0,0,w,h);paintCtx.save();paintCtx.shadowBlur=24;paintCtx.shadowColor="#27e2ff";paintCtx.fillStyle="#111b25";paintCtx.fillRect(245,175,410,280);paintCtx.shadowBlur=0;paintCtx.strokeStyle="#27e2ff";paintCtx.lineWidth=5;paintCtx.strokeRect(245,175,410,280);paintCtx.fillStyle="#ffe12c";paintCtx.beginPath();paintCtx.moveTo(285,175);paintCtx.lineTo(390,95);paintCtx.lineTo(498,175);paintCtx.closePath();paintCtx.fill();paintCtx.fillStyle="#f4d45c";[[356,150,18],[409,129,13],[449,157,16]].forEach(([x,y,r])=>{paintCtx.beginPath();paintCtx.arc(x,y,r,0,Math.PI*2);paintCtx.fill()});
        const lens=paintCtx.createRadialGradient(450,315,18,450,315,108);lens.addColorStop(0,"#090d14");lens.addColorStop(.55,"#2c1641");lens.addColorStop(.78,"#27e2ff");lens.addColorStop(.88,"#ff3e9d");lens.addColorStop(1,"#132431");paintCtx.fillStyle=lens;paintCtx.beginPath();paintCtx.arc(450,315,108,0,Math.PI*2);paintCtx.fill();paintCtx.strokeStyle="#d3faff";paintCtx.lineWidth=4;paintCtx.stroke();paintCtx.restore();
      }
      paintCtx.save();paintCtx.fillStyle="#07111a";paintCtx.fillRect(185,18,530,58);paintCtx.strokeStyle="#27e2ff";paintCtx.lineWidth=2;paintCtx.strokeRect(185,18,530,58);paintCtx.textAlign="center";paintCtx.textBaseline="middle";paintCtx.font="1000 22px ui-monospace,Consolas,monospace";paintCtx.shadowBlur=15;paintCtx.shadowColor="#ff3e9d";paintCtx.fillStyle="#ff3e9d";paintCtx.fillText(">> CHEESE4CAMERA <<",447,43);paintCtx.shadowColor="#27e2ff";paintCtx.fillStyle="#27e2ff";paintCtx.fillText(">> CHEESE4CAMERA <<",453,43);paintCtx.shadowColor="#ffe12c";paintCtx.fillStyle="#fff0a1";paintCtx.fillText(">> CHEESE4CAMERA <<",450,42);paintCtx.shadowBlur=0;paintCtx.font="900 11px ui-monospace,Consolas,monospace";paintCtx.fillStyle="#aaf6ff";paintCtx.fillText("ROBOT VISION // ASCII ASCENSION // GLITCH WITH CARE",450,65);paintCtx.restore();
      paintCtx.save();paintCtx.shadowColor="#70ff8d";paintCtx.shadowBlur=18;paintCtx.fillStyle="#70ff8d";const lifeShape=["01100110","11111111","11111111","01111110","00111100","00011000"],px=7,lx=w/2-28,ly=h/2-21;lifeShape.forEach((row,ry)=>[...row].forEach((bit,rx)=>{if(bit==="1")paintCtx.fillRect(lx+rx*px,ly+ry*px,px-1,px-1)}));paintCtx.shadowBlur=0;paintCtx.textAlign="center";paintCtx.font="900 10px ui-monospace,Consolas,monospace";paintCtx.fillStyle="#d7ffd9";paintCtx.fillText("LIFE PIXEL",w/2,h/2+34);paintCtx.restore();
      paintCtx.save();paintCtx.globalAlpha=.82;paintCtx.font="900 22px ui-monospace,monospace";paintCtx.textAlign="center";paintCtx.fillStyle="#ffe12c";paintCtx.fillText("✦",75,95);paintCtx.fillStyle="#27e2ff";paintCtx.fillText("✧",w-78,105);paintCtx.fillStyle="#ff3e9d";paintCtx.fillText("✦",w-72,h-72);paintCtx.restore();
      paintCtx.save();paintCtx.globalAlpha=.58;paintCtx.strokeStyle="#aaf6ff";paintCtx.lineWidth=3;[[24,24,54,0,0,54],[w-24,24,-54,0,0,54],[24,h-24,54,0,0,-54],[w-24,h-24,-54,0,0,-54]].forEach(([x,y,dx1,dy1,dx2,dy2])=>{paintCtx.beginPath();paintCtx.moveTo(x+dx1,y+dy1);paintCtx.lineTo(x,y);paintCtx.lineTo(x+dx2,y+dy2);paintCtx.stroke()});paintCtx.restore();ascendPaintToAscii(false);paintStatus.textContent=(marks?"CHEESE4CAMERA // controlled RGB glitch":"CHEESE4CAMERA // cheese-camera portrait")+" + ROBOT TITLE + LIFE PIXEL + ASCII ASCENSION // UNDO READY";
    }
    document.querySelector("#paintCheeseCamera").onclick=cheese4Camera;
    document.querySelector("#asciiSave").onclick=()=>{const text=document.querySelector("#asciiPictureText").value;if(!text){paintStatus.textContent="ASCII SAVE // ascend a picture first";return}const a=document.createElement("a");a.download="character-ascension-ascii.txt";a.href=URL.createObjectURL(new Blob([text],{type:"text/plain;charset=utf-8"}));a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);paintStatus.textContent="ASCII TEXT SAVED // CHARACTER ASCENSION ESCAPED THE CANVAS"};
    document.querySelector("#matchRank").onclick=()=>{
      const out=document.querySelector("#matchResults"),criteria=document.querySelector("#matchCriteria").value.split(/\r?\n/).map(line=>line.split("|").map(part=>part.trim())).filter(parts=>parts.length>=3&&parts[0]&&parts[1]&&/^([1-5])$/.test(parts[2])).map(([question,preferred,weight])=>({question,preferred:preferred.toLocaleLowerCase(),weight:+weight}));
      const profiles=document.querySelector("#matchProfiles").value.split(/\r?\n/).map(line=>line.split("|")).filter(parts=>parts.length>=2&&parts[0].trim()).map(([name,...answerParts])=>({name:name.trim(),answers:answerParts.join("|").split(";").map(answer=>answer.trim().toLocaleLowerCase())}));
      if(!criteria.length){out.textContent="NO USABLE CRITERIA // enter question | preferred answer | weight 1–5 on each line.";return}
      if(!profiles.length){out.textContent="NO MATCH ANSWERS // enter name | answer 1 ; answer 2 ; answer 3, in the same order as your criteria.";return}
      const unknownAnswers=new Set(["unknown","?","unsure","not sure","prefer not to say"]);
      const ranked=profiles.map(profile=>{let earned=0,possible=0,answered=0;criteria.forEach((criterion,index)=>{const answer=profile.answers[index];if(!answer||unknownAnswers.has(answer))return;possible+=criterion.weight;answered++;if(answer===criterion.preferred)earned+=criterion.weight});return{...profile,earned,possible,answered,score:possible?Math.round(earned/possible*100):null}}).sort((a,b)=>(b.score??-1)-(a.score??-1)||b.earned-a.earned||a.name.localeCompare(b.name));
      out.textContent="YOUR CRITERIA // "+criteria.length+" · YOUR WEIGHTS ONLY\n\n"+ranked.map((profile,index)=>`${index+1}. ${profile.name} — ${profile.score===null?"NOT ENOUGH ANSWERS":profile.score+"% of answered weight"} (${profile.earned}/${profile.possible} points; ${profile.answered}/${criteria.length} answered)`).join("\n")+"\n\nExact answer matches only. Missing answers were skipped. A score is a sorting aid, not a diagnosis, safety check, or prediction of chemistry.";
    };
    document.querySelector("#matchClear").onclick=()=>{document.querySelector("#matchProfiles").value="";document.querySelector("#matchResults").textContent="MATCH ANSWERS CLEARED // your criteria remain for another comparison."};
    const matchFile=document.querySelector("#matchFile"),matchLoadFile=document.querySelector("#matchLoadFile");
    matchFile.onchange=()=>{matchLoadFile.disabled=!matchFile.files?.length};
    matchLoadFile.onclick=async()=>{const file=matchFile.files?.[0];if(!file)return;try{document.querySelector("#matchProfiles").value=await file.text();document.querySelector("#matchResults").textContent="LOCAL FILE LOADED // review the answers and criteria before ranking. File contents remain in this page."}catch(err){document.querySelector("#matchResults").textContent="COULD NOT READ FILE // "+String(err?.message||err)}};
    document.querySelector("#paintVary").onclick=()=>varyPaint(1);document.querySelector("#paintWobble").onclick=()=>varyPaint(2);
    document.querySelector("#paintSave").onclick=()=>{const a=document.createElement("a");a.download="bullshit-paint.png";a.href=paintCanvas.toDataURL("image/png");a.click();paintStatus.textContent="SAVE PNG // ART ESCAPED THE MACHINE"};
    paintReset();
    drawVision("NO CHARACTER","pull the lever","standby");

// This adapter is appended inside the original machine script, sharing its narrative state.
const DV_FIELDS = ['seed', 'sourceHandling', 'tone', 'calls', 'characterLens', 'manualName', 'manualPronouns', 'manualRole', 'damage', 'brains', 'gens', 'consensus', 'thoughtInput', 'masterStoryText', 'sheetName', 'sheetKind', 'sheetState', 'sheetTone', 'sheetOrigin', 'sheetWant', 'sheetTrouble', 'sheetFelt', 'sheetContinuity', 'sheetVoices', 'sheetPattern', 'sheetClock', 'sheetAnchor', 'sheetCast', 'sheetChoice', 'paintTool', 'paintSymbol', 'paintColor', 'paintSize', 'asciiPictureText'];
const DV_OUTPUTS = ['wordOut', 'wordMeta', 'nameOut', 'characterOut', 'fourLiteral', 'fourSubjective', 'fourSymbolic', 'fourBack', 'poemOut', 'storyOut', 'emojiOut', 'asciiOut', 'canonOut', 'hiveOut', 'hiveLog', 'runid', 'desireCaption', 'reiterateStatus'];
window.TelephoneMachine = {
  capture() {
    const controls = DV_FIELDS.map(id => document.getElementById(id)).filter(Boolean).map(el => ({id:el.id,tag:el.tagName.toLowerCase(),value:el.value,checked:!!el.checked}));
    const outputs = DV_OUTPUTS.map(id => document.getElementById(id)).filter(Boolean).map(el => ({id:el.id,text:el.textContent}));
    const canvases = ['paintCanvas', 'desire'].map(id => ({id,png:document.getElementById(id).toDataURL('image/png')}));
    return { controls, outputs, canvases, state: { lastSignal, lastPreHive, lastStoryContext, rootHumanSeed, reiterationCount,
      modules: [...chain.children].map(el => ({on:el.classList.contains('on'),level:+el.querySelector('input').value})) } };
  },
  async restore(project, beforeApply) {
    // Validate every imported control and state value before even starting a restore.
    project = window.DoodleBridge.validate(project);
    const machine = project.machine;
    // Decode and check every drawing before changing any live story or canvas.
    const decoded = await Promise.all((machine.canvases || []).filter(c => ['paintCanvas','desire'].includes(c.id)).map(async c => {
      const image = new Image(); image.src=c.png; await image.decode();
      if (image.width > 2000 || image.height > 2000) throw new Error('Saved drawing is too large.');
      return {id:c.id,image};
    }));
    beforeApply?.();
    // Source handling is restored first. Opening a save never runs a generator.
    document.getElementById('sourceHandling').value = project.sourceMode;
    for (const c of machine.controls || []) {
      if (!DV_FIELDS.includes(c.id) || c.id === 'sourceHandling') continue;
      const el = document.getElementById(c.id);
      if (el && el.tagName.toLowerCase() === c.tag) { el.value = c.value; el.checked = c.checked; }
    }
    for (const [id, value] of Object.entries({seed:project.sourceText,masterStoryText:project.masterText,asciiPictureText:project.asciiText})) document.getElementById(id).value = value;
    for (const out of machine.outputs || []) if (DV_OUTPUTS.includes(out.id)) document.getElementById(out.id).textContent = out.text;
    for (const [id, value] of Object.entries({storyOut:project.storyText,poemOut:project.poemText,characterOut:project.characterText})) document.getElementById(id).textContent = value;
    const state = machine.state || {};
    lastSignal = typeof state.lastSignal === 'string' ? state.lastSignal.slice(0,250000) : project.sourceText;
    lastPreHive = typeof state.lastPreHive === 'string' ? state.lastPreHive.slice(0,250000) : lastSignal;
    rootHumanSeed = typeof state.rootHumanSeed === 'string' ? state.rootHumanSeed.slice(0,250000) : project.sourceText;
    reiterationCount = Number.isInteger(state.reiterationCount) ? Math.max(0,Math.min(10000,state.reiterationCount)) : 0;
    const context = state.lastStoryContext;
    lastStoryContext = context && ['seed','name','job','want','word','rule','tone'].every(key => typeof context[key] === 'string' && context[key].length <= 250000) && Number.isInteger(context.calls) && context.calls >= 1 && context.calls <= 100 ? Object.fromEntries(['seed','name','job','want','word','rule','tone','calls'].map(key => [key,context[key]])) : null;
    if (project.sourceMode !== 'fiction') { lastStoryContext = null; lastSignal = lastPreHive = rootHumanSeed = project.sourceText; }
    if (Array.isArray(state.modules)) for (const [i, mod] of state.modules.slice(0,moduleDefs.length).entries()) {
      const el=chain.children[i]; if (!el || !mod) continue;
      const on = i === moduleDefs.length-1 || mod.on === true;
      el.classList.toggle('on',on); el.querySelector('.toggle').setAttribute('aria-pressed',String(on));
      el.querySelector('input').value = String(Math.max(0,Math.min(100,Number(mod.level)||0)));
    }
    characterLens.onchange(); damage.oninput(); updateMasterStatus('SESSION RESTORED');
    for (const {id,image} of decoded) {
      const canvas=document.getElementById(id), ctx=canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    }
  },
  stopSound() { if (audioCtx) { setAmbience(false); audioCtx.suspend().catch(()=>{}); } }
};
