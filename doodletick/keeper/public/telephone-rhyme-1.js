
    (() => {
      "use strict";
      const MAX_INPUT = 64;
      const PASS_DELAY_MS = 680;
      const input = document.querySelector("#words");
      const count = document.querySelector("#count");
      const detonate = document.querySelector("#detonate");
      const stop = document.querySelector("#stop");
      const reset = document.querySelector("#reset");
      const log = document.querySelector("#log");
      const state = document.querySelector("#state");
      const halt = document.querySelector("#halt");
      let timer = null;
      let running = false;
      let audioContext = null;
      const voices = new Set();
      function silence() {
        for (const voice of voices) {
          try { voice.stop(); } catch (_) {}
          voice.disconnect();
        }
        voices.clear();
      }

      const lastWord = value => (value.trim().split(/\s+/).pop() || "noise").replace(/[^a-z]/gi, "") || "noise";
      const rhymeTail = word => {
        const clean = word.toLowerCase();
        if (clean.endsWith("oon")) return "tune";
        if (clean.endsWith("ay")) return "day";
        if (clean.endsWith("ight")) return "night";
        if (clean.endsWith("ow")) return "glow";
        return clean.length > 3 ? clean.slice(1) + "ay" : clean + "oo";
      };
      const squeezeVowels = value => value.replace(/[aeiou]+/gi, match => match[0]);
      const halfRhyme = value => value.replace(/[aeiou](?=[^aeiou]*$)/i, "uh");
      const badRhyme = value => value.replace(/[aeiou]/gi, "ø").replace(/s/gi, "zz");
      const tooMuch = value => `${value} / ${value} / ${value}`;
      const goatify = value => `🐐 BAA-${value.toUpperCase().replace(/\s+/g, "-BAA-")}-BAA ♪`;
      const transforms = [
        ["RHYME", value => `${value} → ${rhymeTail(lastWord(value))}`],
        ["UNRHYME", value => value.replace(/\s*→\s*[^\s]+$/, "")],
        ["HALF-RHYME", halfRhyme],
        ["BAD RHYME", badRhyme],
        ["RHYME TOO MUCH", tooMuch],
        ["🐐 BAA REMIX", goatify],
        ["WHY?", () => "because it sounds cool"],
        ["BECAUSE IT SOUNDS COOL", () => "♪ ♪ ♪ ♪ ♪"]
      ];

      function setControls(isRunning) {
        running = isRunning;
        detonate.disabled = isRunning;
        input.disabled = isRunning;
        stop.disabled = !isRunning;
      }
      function updateCount() { count.textContent = `${input.value.length}/${MAX_INPUT}`; }
      function resetView() {
        silence();
        clearTimeout(timer); timer = null; setControls(false);
        log.replaceChildren(); state.textContent = "IDLE";
        halt.className = "halt";
        halt.textContent = "␀   WAITING FOR A VERY SMALL, VERY SILLY DETONATION";
      }
      function addPass(number, name, value, active) {
        const item = document.createElement("li");
        item.className = `pass${active ? " active" : ""}`;
        item.innerHTML = `<span class="number">${String(number).padStart(2, "0")}</span><span class="name"></span><span class="value"></span>`;
        item.querySelector(".name").textContent = `[${name}]`;
        item.querySelector(".value").textContent = value;
        log.append(item);
        return item;
      }
      function beep(step) {
        try {
          audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
          if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
          const now = audioContext.currentTime;
          const oscillator = audioContext.createOscillator();
          const gain = audioContext.createGain();
          const notes = [261.63, 329.63, 392, 523.25, 659.25, 392, 329.63, 261.63];
          oscillator.frequency.value = notes[step] || 261.63;
          oscillator.type = step === 5 ? "square" : "triangle";
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.exponentialRampToValueAtTime(0.06, now + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
          oscillator.connect(gain).connect(audioContext.destination);
          voices.add(oscillator);
          oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
          oscillator.start(now); oscillator.stop(now + 0.2);
        } catch (_) { /* Sound is optional; text pipeline remains complete. */ }
      }
      function haltRun(message, finished) {
        silence();
        clearTimeout(timer); timer = null; setControls(false);
        state.textContent = finished ? "HALTED" : "STOPPED";
        halt.className = `halt ${finished ? "done" : ""}`;
        halt.textContent = finished ? "␀   HALT: THE GOAT HAS LEFT THE BUILDING" : "␀   STOPPED SAFELY — NOTHING PERSISTS";
        if (message) halt.title = message;
      }
      function run() {
        resetView(); setControls(true); state.textContent = "RUNNING // 0/8";
        halt.className = "halt running"; halt.textContent = "💣   PIPELINE ACTIVE — STOP IS AVAILABLE";
        let value = input.value.slice(0, MAX_INPUT).trim() || "silent goat";
        let index = 0;
        const next = () => {
          if (!running) return;
          if (index === transforms.length) return haltRun("completed", true);
          const [name, transform] = transforms[index];
          value = transform(value);
          const entry = addPass(index + 1, name, value, true);
          beep(index);
          requestAnimationFrame(() => { entry.classList.remove("active"); entry.classList.add("done"); });
          index += 1; state.textContent = `RUNNING // ${index}/8`;
          timer = setTimeout(next, PASS_DELAY_MS);
        };
        next();
      }
      input.addEventListener("input", updateCount);
      detonate.addEventListener("click", run);
      stop.addEventListener("click", () => haltRun("manual stop", false));
      reset.addEventListener("click", resetView);
      input.addEventListener("keydown", event => { if (event.key === "Enter" && !running) run(); });
      document.addEventListener("keydown", event => { if (event.key === "Escape" && running) haltRun("escape", false); });
      window.addEventListener("pagehide", () => haltRun("page closed", false));
      updateCount();
    })();
