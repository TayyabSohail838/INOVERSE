// Live voice in the browser with Gemini Live: the mic streams to Google as you talk and
// Inovo's voice streams back, usually starting within a second. Skills still run on Gemma:
// when Live calls the `inovo_brain` tool, onTool() answers it through /api/cofounder.
//
// Speakers + mic: while Inovo is talking we don't send the mic, so Inovo can't hear itself
// and cut itself off. Use interrupt() (the Skip button) to stop it mid-sentence.

const WS_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained";
const MIC_RATE = 16000; // what Live expects from the mic
const OUT_RATE = 24000; // what Live sends back
const ECHO_GUARD = 0.35; // seconds after Inovo stops talking before the mic is sent again

const WORKLET = `class InovoMic extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor("inovo-mic", InovoMic);`;

export function liveSupported() {
  return (
    typeof window !== "undefined" &&
    typeof WebSocket !== "undefined" &&
    typeof AudioWorkletNode !== "undefined" &&
    Boolean(window.AudioContext) &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

function toBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// Average the mic samples down to 16 kHz and turn them into 16-bit PCM.
function toPcm16(input, inRate) {
  const ratio = inRate / MIC_RATE;
  const n = Math.floor(input.length / ratio);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * ratio);
    const b = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = a; j < b; j++) sum += input[j];
    const v = Math.max(-1, Math.min(1, sum / Math.max(1, b - a)));
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  return new Uint8Array(out.buffer);
}

function rms(analyser, buf) {
  analyser.getFloatTimeDomainData(buf);
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

export class LiveVoice {
  // handlers: onState(state), onLevel(0-1), onUserText(text, done), onInovoText(text, done, { filler }),
  //           onTool(request) → Promise<object>, onClose(reason), onError(message)
  constructor(handlers) {
    this.h = handlers;
    this.state = "idle";
    this.closed = false;
    this.sources = new Set();
    this.nextTime = 0;
    this.inText = "";
    this.outText = "";
    this.skipping = false;
    this.toolsRunning = 0;
  }

  // getSetup() → { token, setup } from /api/live. Resolves once Live is ready; throws if it can't start.
  async start(getSetup) {
    this.set("starting");
    const [mic, conf] = await Promise.all([
      navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      }),
      getSetup(),
    ]);
    this.mic = mic;
    if (this.closed) return this.cleanup();

    await new Promise((resolve, reject) => {
      const ws = new WebSocket(`${WS_URL}?access_token=${encodeURIComponent(conf.token)}`);
      this.ws = ws;
      const fail = setTimeout(() => reject(new Error("Live voice didn't answer in time.")), 15000);
      ws.onopen = () => ws.send(JSON.stringify({ setup: conf.setup }));
      ws.onmessage = async (ev) => {
        let m;
        try {
          m = JSON.parse(typeof ev.data === "string" ? ev.data : await ev.data.text());
        } catch {
          return;
        }
        if (m.setupComplete) {
          clearTimeout(fail);
          this.ready = true;
          resolve();
        }
        this.onMessage(m);
      };
      ws.onerror = () => reject(new Error("Couldn't connect to Live voice."));
      ws.onclose = (e) => {
        clearTimeout(fail);
        reject(new Error(e.reason || "Live voice closed."));
        // after a good start, a dropped connection ends the session (before it, start() throws instead)
        if (!this.closed && this.ready) this.end(e.code === 1000 ? "" : e.reason || "The live session ended.");
      };
    });
    if (this.closed) return;

    this.greeting = true; // mic stays closed until Inovo has greeted
    await this.startAudio();
    // Inovo speaks first: the instructions tell it how to greet
    this.send({ clientContent: { turns: [{ role: "user", parts: [{ text: "(The founder just pressed Talk. Greet him now.)" }] }], turnComplete: true } });
  }

  async startAudio() {
    const ctx = new AudioContext();
    this.ctx = ctx;
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});

    // mic → worklet (raw samples) → 16 kHz PCM chunks every 100 ms
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const src = ctx.createMediaStreamSource(this.mic);
    const node = new AudioWorkletNode(ctx, "inovo-mic");
    const mute = ctx.createGain();
    mute.gain.value = 0;
    src.connect(node).connect(mute).connect(ctx.destination); // keeps the worklet running, silently
    this.micAnalyser = ctx.createAnalyser();
    this.micAnalyser.fftSize = 1024;
    src.connect(this.micAnalyser);

    let pending = [];
    let count = 0;
    const chunk = Math.round(ctx.sampleRate / 10);
    node.port.onmessage = (e) => {
      pending.push(e.data);
      count += e.data.length;
      if (count < chunk) return;
      const all = new Float32Array(count);
      let o = 0;
      for (const p of pending) {
        all.set(p, o);
        o += p.length;
      }
      pending = [];
      count = 0;
      if (this.micOpen()) {
        this.send({ realtimeInput: { audio: { data: toBase64(toPcm16(all, ctx.sampleRate)), mimeType: `audio/pcm;rate=${MIC_RATE}` } } });
      }
    };
    this.node = node;

    // Inovo's voice → analyser (for the globe) → speakers
    this.out = ctx.createGain();
    this.outAnalyser = ctx.createAnalyser();
    this.outAnalyser.fftSize = 1024;
    this.out.connect(this.outAnalyser).connect(ctx.destination);

    const buf = new Float32Array(1024);
    const tick = () => {
      if (this.closed) return;
      const talking = this.speaking();
      this.h.onLevel?.(Math.min(1, rms(talking ? this.outAnalyser : this.micAnalyser, buf)));
      this.set(talking ? "speaking" : this.toolsRunning || this.greeting || this.awaiting ? "thinking" : "listening");
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  speaking() {
    return Boolean(this.ctx) && this.ctx.currentTime < this.nextTime;
  }

  // the mic goes out only when Inovo isn't talking (so it doesn't hear itself)
  micOpen() {
    return !this.closed && !this.greeting && this.ctx && this.ctx.currentTime > this.nextTime + ECHO_GUARD;
  }

  set(state) {
    if (state === this.state) return;
    this.state = state;
    this.h.onState?.(state);
  }

  send(obj) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  play(b64) {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const pcm = new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
    const buffer = this.ctx.createBuffer(1, pcm.length, OUT_RATE);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.out);
    const at = Math.max(this.ctx.currentTime + 0.04, this.nextTime);
    src.start(at);
    this.nextTime = at + buffer.duration;
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
  }

  stopPlayback() {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {}
    }
    this.sources.clear();
    this.nextTime = 0;
  }

  // typed in the chat during a live session: same conversation
  sendText(text) {
    this.interrupt();
    this.skipping = false;
    this.send({ clientContent: { turns: [{ role: "user", parts: [{ text }] }], turnComplete: true } });
  }

  // the founder heard enough: stop talking now, drop the rest of this answer
  interrupt() {
    this.stopPlayback();
    this.skipping = true;
    this.greeting = false;
  }

  flushUser() {
    if (this.inText.trim()) this.h.onUserText?.(this.inText.trim(), true);
    this.inText = "";
  }

  flushInovo(filler = false) {
    if (this.outText.trim()) this.h.onInovoText?.(this.outText.trim(), true, { filler });
    this.outText = "";
  }

  async onMessage(m) {
    if (m.voiceActivity?.type === "ACTIVITY_END") this.awaiting = true; // you stopped: Inovo is answering
    const sc = m.serverContent;
    if (sc) {
      if (sc.interrupted) this.stopPlayback();
      if (sc.inputTranscription?.text) {
        this.inText += sc.inputTranscription.text;
        this.h.onUserText?.(this.inText.trim(), false);
      }
      const parts = sc.modelTurn?.parts || [];
      if (parts.length || sc.outputTranscription?.text) this.flushUser();
      if (!this.skipping) {
        for (const p of parts)
          if (p.inlineData?.data && /audio/.test(p.inlineData.mimeType || "audio")) {
            this.awaiting = false;
            this.play(p.inlineData.data);
          }
        if (sc.outputTranscription?.text) {
          this.outText += sc.outputTranscription.text;
          this.h.onInovoText?.(this.outText.trim(), false, {});
        }
      }
      if (sc.turnComplete) {
        this.awaiting = false;
        this.flushUser();
        this.flushInovo(false);
        this.skipping = false;
        this.greeting = false;
      }
    }
    if (m.toolCall?.functionCalls?.length) {
      this.flushUser();
      this.flushInovo(true); // "one sec, boss…" is not the answer
      this.greeting = false;
      this.skipping = false;
      const responses = await Promise.all(
        m.toolCall.functionCalls.map(async (fc) => {
          this.toolsRunning++;
          let response;
          try {
            response = await this.h.onTool?.(fc.args?.request || "", fc.name);
          } catch (err) {
            response = { error: err.message || "The skill failed." };
          } finally {
            this.toolsRunning--;
          }
          return { id: fc.id, name: fc.name, response: response || {} };
        })
      );
      this.awaiting = true; // the skill is done; Inovo is about to read the answer
      this.send({ toolResponse: { functionResponses: responses } });
    }
    if (m.goAway) this.h.onError?.("The live session is about to end. Tap Talk again to keep going.");
  }

  end(reason = "") {
    if (this.closed) return;
    this.closed = true;
    this.cleanup();
    this.set("idle");
    this.h.onClose?.(reason);
  }

  cleanup() {
    cancelAnimationFrame(this.raf);
    this.stopPlayback();
    try {
      this.ws?.close(1000);
    } catch {}
    this.mic?.getTracks().forEach((t) => t.stop());
    this.node?.port && (this.node.port.onmessage = null);
    this.ctx?.close().catch(() => {});
    this.h.onLevel?.(0);
  }
}
