"use client";
// The whole app: the woven 3D cofounder on the left, the working panel on the right.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, setAccessCode, getAccessCode } from "@/lib/api";
import { EvidencePanel, TestsPanel, WeeklyPanel, CompanyPanel } from "@/components/Panels";
import Markdown, { plainText } from "@/components/Markdown";
import { toWavBase64 } from "@/lib/wav";
import VoiceCaption, { wordWeights } from "@/components/VoiceCaption";
import TasksPanel from "@/components/TasksPanel";
import PeoplePanel from "@/components/PeoplePanel";
import ChatOverview from "@/components/ChatOverview";
import Landing from "@/components/Landing";
import HudScene from "@/components/HudScene";


const STATE_TEXT = {
  idle: "Tap Talk to speak, or open Chat to type",
  starting: "Opening the microphone… allow it if your browser asks",
  listening: "Listening… I'll stop when you pause",
  thinking: "Thinking it through",
  speaking: "Speaking",
};

// Inovo says this every time you start chatting (first Talk or first message after opening the page).
const GREETING = "Hey boss, welcome to Inoverse!";

const VERDICT_CLASS = { GO: "go", RESHAPE: "reshape", KILL: "kill" };

export default function CofounderApp() {
  const [state, setState] = useState("idle");
  const [lang, setLang] = useState("en");
  const [handsFree, setHandsFree] = useState(false);
  const [log, setLog] = useState([]);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState(null);
  const [tab, setTab] = useState(null); // which dock panel is open (null = none)
  const [needCode, setNeedCode] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [entered, setEntered] = useState(false); // past the scroll-through intro?
  const [chatView, setChatView] = useState("talk"); // Chat panel: conversation or overview

  const levelRef = useRef(0);
  const meterRef = useRef(null);
  const recRef = useRef(null);
  const voiceRef = useRef({ audio: null, token: 0, stopMeter: null }); // the cofounder voice now playing
  const progressRef = useRef(() => 0); // how far the cofounder has got through what it is saying (0-1)
  const [caption, setCaption] = useState(null); // { who: "you" | "cofounder", text }
  const historyRef = useRef([]);
  const handsFreeRef = useRef(false);
  const greetedRef = useRef(false); // has Inovo greeted you since the page opened?
  const langRef = useRef("en");
  const logEndRef = useRef(null);

  const dbReady = Boolean(status?.supabase?.ok);

  // hide the caption once the exchange is over
  useEffect(() => {
    if (state === "idle") setCaption(null);
  }, [state]);
  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);
  useEffect(() => {
    langRef.current = lang;
  }, [lang]);
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [log, tab]);

  // setup status + saved conversation
  const loadStatus = useCallback(async () => {
    try {
      const s = await fetch("/api/status").then((r) => r.json());
      setStatus(s);
      if (s.supabase?.ok) {
        const { messages } = await api("/api/messages");
        // saved history first; keep anything already on screen this visit (like the greeting)
        setLog((cur) => [...messages.map((m) => ({ role: m.role, text: m.text, skill: m.skill })), ...cur.filter((m) => m.live)]);
        historyRef.current = messages.slice(-8).map((m) => ({ role: m.role, text: m.text }));
      }
    } catch (e) {
      setError(e.message);
    }
  }, []);

  // Check Gmail for new "Inovo" emails when the app opens and every 5 minutes.
  useEffect(() => {
    if (!dbReady) return;
    const sync = async () => {
      try {
        const r = await api("/api/tasks/sync", { method: "POST" });
        if (r.added) window.dispatchEvent(new Event("inoverse:tasks-updated"));
      } catch {} // quiet: the Tasks tab shows problems when you open it
    };
    sync();
    const t = setInterval(sync, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [dbReady]);

  // Back from Google sign-in: open the Tasks tab and say how it went.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const g = p.get("gmail");
    if (!g) return;
    setTab("tasks");
    if (g === "error") setError(`Couldn't connect Gmail: ${p.get("reason") || "unknown problem"}`);
    if (g === "demo") setError("This is the public demo, so it doesn't connect a real Gmail. Run INOVERSE on your laptop for that.");
    if (g === "not-configured") setError("Gmail isn't set up yet. See “Connect Gmail” in the README.");
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  useEffect(() => {
    loadStatus();
    const onNeed = () => setNeedCode(true);
    window.addEventListener("cofounder:need-code", onNeed);
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }
    return () => {
      window.removeEventListener("cofounder:need-code", onNeed);
      cancelRecording();
      stopMeter();
      stopVoice();
    };
  }, [loadStatus]);

  // ---------- microphone level for the 3D weave ----------
  // Returns null on success, or the getUserMedia error.
  async function startMeter() {
    if (meterRef.current) return null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) {
          const x = (v - 128) / 128;
          sum += x * x;
        }
        levelRef.current = Math.sqrt(sum / buf.length);
        if (meterRef.current) meterRef.current.raf = requestAnimationFrame(tick);
      };
      meterRef.current = { stream, ctx, raf: 0 };
      meterRef.current.raf = requestAnimationFrame(tick);
      return null;
    } catch (err) {
      levelRef.current = 0;
      return err;
    }
  }

  function stopMeter() {
    const m = meterRef.current;
    meterRef.current = null;
    levelRef.current = 0;
    if (!m) return;
    cancelAnimationFrame(m.raf);
    m.stream.getTracks().forEach((t) => t.stop());
    m.ctx.close().catch(() => {});
  }

  // ---------- voice ----------
  // Record from the mic, stop by itself when you go quiet, then transcribe on
  // the server. We don't use the browser's SpeechRecognition: it relies on a
  // Google speech service that fails quietly on many machines.
  // auto: started by itself after the cofounder spoke (conversation mode)
  async function listen({ auto = false } = {}) {
    if (recRef.current) return; // already recording
    if (!auto && !greetedRef.current) {
      // first Talk: Inovo greets you, then starts listening by itself
      greetedRef.current = true;
      setError("");
      setLog((l) => [...l, { role: "assistant", text: GREETING, live: true }]);
      speak(GREETING, { converse: true });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser can't record audio. Use Chrome or Edge, or type in the panel.");
      return;
    }
    stopVoice();
    setError("");

    // Show right away that the click worked; the browser may now ask for the mic.
    const opening = { opening: true, cancelled: false };
    recRef.current = opening;
    setState("starting");
    const slow = setTimeout(() => {
      if (recRef.current === opening)
        setError(
          "The browser hasn't allowed the microphone yet. Click the icon at the left of the address bar (next to localhost:3000), " +
            "set Microphone to Allow, then reload the page."
        );
    }, 4000);

    const micErr = await startMeter();
    clearTimeout(slow);
    if (opening.cancelled) {
      stopMeter();
      return;
    }
    recRef.current = null;
    if (micErr) {
      setState("idle");
      setError(
        micErr.name === "NotAllowedError"
          ? "Microphone access is blocked. Click the icon at the left of the address bar, set Microphone to Allow, reload and try again. Also check Windows Settings → Privacy → Microphone."
          : micErr.name === "NotFoundError"
            ? "No microphone found. Check that one is plugged in."
            : micErr.name === "NotReadableError"
              ? "Another app is using the microphone. Close it (Zoom, Teams, Discord…) and try again."
              : `Couldn't open the microphone: ${micErr.message}`
      );
      return;
    }
    setError("");

    const chunks = [];
    let mr;
    try {
      mr = new MediaRecorder(meterRef.current.stream);
    } catch (err) {
      stopMeter();
      setError(`Couldn't start recording: ${err.message}`);
      return;
    }
    const session = { mr, cancelled: false, timer: 0, quiet: false };
    recRef.current = session;

    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = async () => {
      clearInterval(session.timer);
      stopMeter();
      const done = () => {
        if (recRef.current === session) recRef.current = null;
      };
      if (session.cancelled) return done();
      if (session.quiet) {
        // conversation mode and you didn't say anything: end the conversation quietly
        done();
        setState("idle");
        return;
      }
      if (!chunks.length) {
        done();
        setState("idle");
        setError("Nothing was recorded. Check your microphone and try again.");
        return;
      }
      setState("thinking");
      try {
        const audio = await toWavBase64(new Blob(chunks, { type: mr.mimeType }));
        const { text } = await api("/api/transcribe", { method: "POST", body: { audio, lang: langRef.current } });
        done();
        if (session.cancelled) return;
        if (!text) {
          setState("idle");
          setError("I couldn't make out any words. Try again a little closer to the mic, or type below.");
          return;
        }
        setCaption({ who: "you", text });
        ask(text, { fromVoice: true });
      } catch (e) {
        done();
        if (session.cancelled) return;
        setState("idle");
        setError(e.message);
      }
    };

    mr.start(250);
    setState("listening");
    setCaption({ who: "you", text: "" });

    // Stop by itself: 1.2 s of quiet after you speak, 8 s if no speech is
    // picked up at all, and never longer than 45 s.
    const started = Date.now();
    let spoke = false;
    let lastLoud = started;
    // Background noise level (fan, room hum), learned from every reading: it drops
    // straight to any quieter reading and only creeps up slowly. Before, steady noise
    // counted as "still talking" and recording went on long after you stopped.
    let floor = null;
    const recent = [];
    session.timer = setInterval(() => {
      const now = Date.now();
      recent.push(levelRef.current);
      if (recent.length > 3) recent.shift();
      const level = recent.reduce((a, b) => a + b, 0) / recent.length; // smooth out flicker
      floor = floor === null ? level : level < floor ? level : floor + (level - floor) * 0.01;
      const loud = level > Math.max(0.012, floor * 2 + 0.008);
      if (loud) {
        spoke = true;
        lastLoud = now;
      }
      if (!spoke && now - started > 8000) {
        if (auto) session.quiet = true;
        finishRecording();
      } else if ((spoke && now - lastLoud > 1200) || now - started > 45000) {
        finishRecording();
      }
    }, 100);
  }

  // Stop recording and send what we have.
  function finishRecording() {
    const s = recRef.current;
    if (!s || s.opening) return;
    clearInterval(s.timer);
    if (s.mr.state !== "inactive") s.mr.stop();
  }

  // Cancel everything: recording (without sending) and speech.
  function cancelRecording() {
    const s = recRef.current;
    recRef.current = null;
    if (!s) return;
    s.cancelled = true;
    if (s.opening) return; // still waiting for mic permission
    clearInterval(s.timer);
    if (s.mr.state !== "inactive") s.mr.stop();
  }

  function stop() {
    if (state === "listening") return finishRecording();
    cancelRecording();
    stopMeter();
    stopVoice();
    setState("idle");
  }

  // ---------- the cofounder's voice ----------
  // Made on the server with Gemini text-to-speech, so it sounds natural in any
  // browser. Falls back to the browser's own voice if that fails.
  function stopVoice() {
    voiceRef.current.token++;
    voiceRef.current.stopMeter?.();
    voiceRef.current.stopMeter = null;
    const a = voiceRef.current.audio;
    voiceRef.current.audio = null;
    if (a) {
      a.pause();
      URL.revokeObjectURL(a.src);
    }
    window.speechSynthesis?.cancel();
  }

  // Scan the voice clip in 20 ms steps and mark where it is talking vs pausing.
  // cum[i] = talking time up to step i. Lets the subtitles follow the real speech.
  async function speechTimeline(blob) {
    try {
      const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const buf = await new Off(1, 1, 24000).decodeAudioData(await blob.arrayBuffer());
      const data = buf.getChannelData(0);
      const step = 0.02;
      const hop = Math.max(1, Math.round(buf.sampleRate * step));
      const n = Math.ceil(data.length / hop);
      const rms = new Float32Array(n);
      let max = 0;
      for (let f = 0; f < n; f++) {
        const end = Math.min(data.length, (f + 1) * hop);
        let sum = 0;
        for (let i = f * hop; i < end; i++) sum += data[i] * data[i];
        rms[f] = Math.sqrt(sum / Math.max(1, end - f * hop));
        if (rms[f] > max) max = rms[f];
      }
      if (!max) return null;
      const talking = Array.from(rms, (r) => r > max * 0.06);
      // gaps under 160 ms are just between words, not real pauses
      for (let f = 0; f < n; ) {
        if (talking[f]) { f++; continue; }
        let g = f;
        while (g < n && !talking[g]) g++;
        if (f > 0 && g < n && g - f < 8) for (let k = f; k < g; k++) talking[k] = true;
        f = g;
      }
      const cum = new Float32Array(n + 1);
      for (let f = 0; f < n; f++) cum[f + 1] = cum[f] + (talking[f] ? 1 : 0);
      // real pauses (in talking time), to line up with commas and full stops
      const pauses = [];
      for (let f = 1; f < n; f++) if (!talking[f] && talking[f - 1] && cum[f] < cum[n]) pauses.push(cum[f]);
      return cum[n] ? { cum, total: cum[n], step, pauses } : null;
    } catch {
      return null; // fall back to simple time-based progress
    }
  }

  // Follow the loudness of the cofounder voice so the sphere and the wave move with it.
  // Returns a stop function. If the audio system is not available, the voice still plays.
  async function meterFor(audio) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!voiceRef.current.ctx) voiceRef.current.ctx = new Ctx();
      const ctx = voiceRef.current.ctx;
      if (ctx.state !== "running") {
        await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 300))]);
        if (ctx.state !== "running") return null; // routing through a stopped context would mute the voice
      }
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      const src = ctx.createMediaElementSource(audio);
      src.connect(analyser);
      analyser.connect(ctx.destination);
      const buf = new Uint8Array(analyser.fftSize);
      let raf;
      const tick = () => {
        raf = requestAnimationFrame(tick);
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        levelRef.current = Math.sqrt(sum / buf.length);
      };
      raf = requestAnimationFrame(tick);
      return () => {
        cancelAnimationFrame(raf);
        levelRef.current = 0;
        src.disconnect();
        analyser.disconnect();
      };
    } catch {
      return null;
    }
  }

  // After the cofounder finishes speaking: listen again if we're in a spoken conversation.
  function afterSpeaking(converse) {
    setState("idle");
    if (converse || handsFreeRef.current) setTimeout(() => listen({ auto: true }), 350);
  }

  // Line up the subtitle with the voice. Talking time is spread over the words by
  // length, and every real pause in the audio that falls near a comma or full stop
  // pins the subtitle to that point, so small errors can't build up.
  // Returns a function: fraction of talking time (0-1) → fraction of the subtitle (0-1).
  function alignSubtitle(timeline, text) {
    const words = text.split(/\s+/).filter(Boolean);
    const { cum, total } = wordWeights(text);
    if (!timeline?.pauses?.length || !words.length) return (p) => p;
    const T = timeline.total;
    const breaks = [];
    words.forEach((w, i) => {
      if (/[,.;:!?—–-]["'”)\]]*$/.test(w)) breaks.push(cum[i]);
    });
    const tolerance = (total / words.length) * 3; // about three words
    const anchors = [[0, 0]];
    for (const tp of timeline.pauses) {
      const [lt, lw] = anchors[anchors.length - 1];
      if (tp <= lt) continue;
      const expected = lw + ((tp - lt) / (T - lt)) * (total - lw);
      let best = null;
      for (const b of breaks) {
        if (b <= lw) continue;
        if (best === null || Math.abs(b - expected) < Math.abs(best - expected)) best = b;
      }
      if (best !== null && Math.abs(best - expected) <= tolerance && best < total) anchors.push([tp, best]);
    }
    anchors.push([T, total]);
    return (p) => {
      const t = p * T;
      for (let i = 1; i < anchors.length; i++) {
        const [t0, w0] = anchors[i - 1];
        const [t1, w1] = anchors[i];
        if (t <= t1) return (w0 + (t1 > t0 ? (t - t0) / (t1 - t0) : 1) * (w1 - w0)) / total;
      }
      return 1;
    };
  }

  // One voice clip per answer (the free tier only allows a few clips a day).
  const speak = useCallback(async (line, { converse = false } = {}) => {
    stopVoice();
    const text = plainText(line || "");
    if (!text) return setState("idle");
    const token = voiceRef.current.token;
    const stopped = () => token !== voiceRef.current.token;
    setState("thinking");
    const spans = [{ text }];

    const headers = { "Content-Type": "application/json" };
    const code = getAccessCode();
    if (code) headers["x-access-code"] = code;
    const clips = spans.map((sp) =>
      fetch("/api/speak", { method: "POST", headers, body: JSON.stringify({ text: sp.text, lang: langRef.current }) })
        .then((r) => {
          if (!r.ok) throw new Error(`voice ${r.status}`);
          return r.blob();
        })
        .then(async (blob) => ({ blob, timeline: await speechTimeline(blob) }))
    );
    clips.forEach((c) => c.catch(() => {})); // failures are handled where each clip is played

    const playClip = ({ blob, timeline }, sp) =>
      new Promise(async (resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        voiceRef.current.audio = audio;
        const finish = (ok) => {
          voiceRef.current.stopMeter?.();
          voiceRef.current.stopMeter = null;
          if (voiceRef.current.audio === audio) voiceRef.current.audio = null;
          URL.revokeObjectURL(url);
          ok ? resolve() : reject(new Error("playback failed"));
        };
        const toSubtitle = alignSubtitle(timeline, sp.text);
        audio.onplaying = () => {
          progressRef.current = () => {
            if (!timeline) return audio.duration ? audio.currentTime / audio.duration : 0;
            // count only time spent talking, so the subtitle waits during pauses
            const t = audio.currentTime - 0.06; // speakers lag the clock slightly
            const f = Math.max(0, Math.min(timeline.cum.length - 1, Math.floor(t / timeline.step)));
            return toSubtitle(timeline.cum[f] / timeline.total);
          };
          setCaption((c) => (c?.who === "cofounder" && c.text === text ? c : { who: "cofounder", text }));
          setState("speaking");
        };
        audio.onended = () => finish(true);
        audio.onerror = () => finish(false);
        voiceRef.current.stopMeter = await meterFor(audio);
        if (stopped()) return finish(true);
        audio.play().catch(() => finish(false));
      });

    for (let i = 0; i < spans.length; i++) {
      let clip;
      try {
        clip = await clips[i];
        if (stopped()) return;
        await playClip(clip, spans[i]);
      } catch (err) {
        if (stopped()) return;
        console.warn("Cofounder voice failed, using the browser voice:", err.message);
        return browserSpeak(spans.slice(i).map((sp) => sp.text).join(" "), converse, text);
      }
      if (stopped()) return;
    }
    afterSpeaking(converse);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // fullText: the whole answer for the subtitle, when only the end of it is left to say
  function browserSpeak(text, converse, fullText = text) {
    if (!window.speechSynthesis) return setState("idle");
    const all = window.speechSynthesis.getVoices();
    // Voices installed on the computer first: Chrome's online "Google" voices
    // fail silently when its speech service can't be reached.
    const voices = [...all.filter((v) => v.localService), ...all.filter((v) => !v.localService)];
    // Urdu voices are rare; Roman Urdu read by an English voice is understandable
    const want = langRef.current === "ur" ? ["ur", "hi", "en-IN", "en"] : ["en-GB", "en-US", "en"];
    const voice = want.map((w) => voices.find((v) => v.lang.startsWith(w))).find(Boolean) || null;

    const say = (v, retry) => {
      const u = new SpeechSynthesisUtterance(text);
      u.voice = v;
      if (v) u.lang = v.lang;
      u.rate = 1.02;
      let spokenTo = 0;
      u.onboundary = (e) => (spokenTo = e.charIndex);
      u.onstart = () => {
        setCaption({ who: "cofounder", text: fullText });
        const offset = fullText.length - text.length;
        progressRef.current = () => (offset + spokenTo) / fullText.length;
        setState("speaking");
      };
      u.onerror = (e) => {
        // try once more with the browser's default voice
        if (retry && e.error !== "interrupted" && e.error !== "canceled") return say(null, false);
        setState("idle");
      };
      u.onend = () => afterSpeaking(converse);
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume(); // Chrome sometimes stays paused
      window.speechSynthesis.speak(u);
    };
    say(voice, Boolean(voice));
  }

  async function ask(raw, { fromVoice = false } = {}) {
    const message = raw.trim();
    if (!message) return;
    setTyped("");
    setError("");
    // first message typed before any Talk: greet you along with the answer
    const greet = !greetedRef.current;
    greetedRef.current = true;
    setLog((l) => [...l, ...(greet ? [{ role: "assistant", text: GREETING, live: true }] : []), { role: "user", text: message }]);
    setState("thinking");
    try {
      const data = await api("/api/cofounder", {
        method: "POST",
        body: { message, history: historyRef.current, lang: langRef.current },
      });
      historyRef.current = [...historyRef.current, { role: "user", text: message }, { role: "assistant", text: data.details || data.say }].slice(-8);

      let action;
      if (data.action?.type === "open_url" && /^https:\/\//.test(data.action.url)) {
        const opened = window.open(data.action.url, "_blank");
        if (opened) opened.opener = null;
        action = { ...data.action, blocked: !opened };
      }

      setLog((l) => [
        ...l,
        { role: "assistant", text: data.details || data.say, skill: data.skill, gapCheck: data.gapCheck, experimentId: data.experimentId, action },
      ]);
      speak(
        action?.blocked
          ? langRef.current === "ur"
            ? "Browser ne tab rok diya. Button dabayein."
            : "Your browser blocked the new tab. Use the button to open it."
          : (greet ? GREETING + " " : "") + data.say,
        // keep talking only when you spoke, and not after opening a website
        { converse: fromVoice && !action }
      );
    } catch (e) {
      setError(e.message);
      setState("idle");
    }
  }

  function saveCode(e) {
    e.preventDefault();
    setAccessCode(codeInput.trim());
    setNeedCode(false);
    setCodeInput("");
    loadStatus();
  }

  const busy = state === "thinking";
  const panel = DOCK.find((d) => d.key === tab) || null;

  return (
    <div className={`app ${panel ? "has-panel" : ""}`}>
      {!entered && <Landing onEnter={() => setEntered(true)} />}

      <section className={`stage s-${state}`} aria-label="Inovo">
        {/* the HUD background: powers on after the intro, then loops with a slow drift */}
        <HudScene entered={entered} state={state} levelRef={levelRef} />
        <div className="stage-shade" aria-hidden="true" />

        <header className="topbar">
          <div className="brand">
            <span className="brand-name">INOVERSE</span>
            <span className="brand-sub">
              with Inovo, your AI cofounder
              {status?.demo && <span className="demo-badge" title="Public demo: sample Inovix data, nothing private">Demo</span>}
            </span>
          </div>
          <div className="toggles" role="group" aria-label="Voice settings">
            <button aria-pressed={lang === "en"} onClick={() => setLang("en")}>English</button>
            <button aria-pressed={lang === "ur"} onClick={() => setLang("ur")} lang="ur">اردو</button>
            <button aria-pressed={handsFree} onClick={() => setHandsFree((h) => !h)}>Hands-free</button>
          </div>
        </header>

        <div className="stage-notices">
          {needCode && (
            <form className="notice" onSubmit={saveCode}>
              <label htmlFor="code">Inoverse is protected. Enter the access code.</label>
              <div className="row">
                <input id="code" type="password" value={codeInput} onChange={(e) => setCodeInput(e.target.value)} autoComplete="off" />
                <button className="btn" disabled={!codeInput.trim()}>Unlock</button>
              </div>
            </form>
          )}
          <SetupNotice status={status} />
        </div>

        <div className="stage-foot">
          <VoiceCaption state={state} caption={caption} levelRef={levelRef} progressRef={progressRef} />
          {error && (
            <p className="stage-error" role="alert">
              {error}
            </p>
          )}
          <p className="state-line" aria-live="polite">{STATE_TEXT[state]}</p>
          {state === "idle" ? (
            <button className="talk" onClick={() => listen()}>Talk</button>
          ) : (
            <button className="talk stop" onClick={stop}>{state === "listening" ? "Done" : "Stop"}</button>
          )}

          <nav className="dock" aria-label="Inoverse features">
            {DOCK.map((d) => (
              <button
                key={d.key}
                className={tab === d.key ? "on" : ""}
                aria-pressed={tab === d.key}
                onClick={() => setTab((t) => (t === d.key ? null : d.key))}
              >
                <DockIcon name={d.key} />
                <span>{d.label}</span>
                {d.key === "chat" && busy && <i className="dock-dot" aria-hidden="true" />}
              </button>
            ))}
          </nav>
        </div>
      </section>

      {/* slide-in panel for the dock feature */}
      <aside className={`drawer ${panel ? "open" : ""}`} aria-label={panel ? panel.label : undefined} aria-hidden={!panel}>
        {panel && (
          <>
            <header className="drawer-head">
              <h2>{panel.title}</h2>
              <button className="ov-close" onClick={() => setTab(null)} aria-label="Close panel">✕</button>
            </header>
            <div className="drawer-body">
              {tab === "chat" && (
                <div className="chat-panel">
                  <div className="seg" role="tablist" aria-label="Chat views">
                    <button role="tab" aria-selected={chatView === "talk"} onClick={() => setChatView("talk")}>Conversation</button>
                    <button role="tab" aria-selected={chatView === "overview"} onClick={() => setChatView("overview")}>Overview &amp; issues</button>
                  </div>

                  {chatView === "overview" ? (
                    <ChatOverview inline open log={log} dbReady={dbReady} />
                  ) : (
                    <div className="talk-panel">
                      <div className="log">
                        {log.length === 0 && (
                          <div className="empty">
                            <p>Ask out loud or type. A few things to try:</p>
                            <ul>
                              <li>A client wants a website for his textile shop. What's the scope?</li>
                              <li>How should we price Wattly?</li>
                              <li>What's on my plate this week?</li>
                              <li>Open YouTube</li>
                            </ul>
                          </div>
                        )}
                        {log.map((m, i) => (
                          <article key={i} className={`msg ${m.role}`}>
                            {m.role === "assistant" && m.skill && <span className="skill">{SKILL_NAMES[m.skill] || m.skill}</span>}
                            {m.gapCheck && <GapCard gap={m.gapCheck} onOpenTests={() => setTab("tests")} />}
                            <div className="text">{m.role === "assistant" ? <Markdown text={m.text} /> : m.text}</div>
                            {m.action && (
                              <div className="action">
                                <a href={m.action.url} target="_blank" rel="noopener noreferrer">Open {m.action.label}</a>
                                {m.action.blocked && <small>Your browser blocked the new tab. Allow pop-ups for this site once and it will open by itself.</small>}
                              </div>
                            )}
                          </article>
                        ))}
                        {busy && <p className="thinking">Inovo is thinking…</p>}
                        <div ref={logEndRef} />
                      </div>
                      <form
                        className="ask"
                        onSubmit={(e) => {
                          e.preventDefault();
                          ask(typed);
                        }}
                      >
                        <label htmlFor="ask" className="sr-only">Message to Inovo</label>
                        <input id="ask" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type to Inovo" disabled={busy} />
                        <button className="btn" disabled={busy || !typed.trim()}>Send</button>
                      </form>
                    </div>
                  )}
                </div>
              )}
              {tab === "tasks" && <TasksPanel dbReady={dbReady} />}
              {tab === "people" && <PeoplePanel dbReady={dbReady} lang={lang} />}
              {tab === "evidence" && <EvidencePanel dbReady={dbReady} />}
              {tab === "tests" && <TestsPanel dbReady={dbReady} />}
              {tab === "weekly" && <WeeklyPanel dbReady={dbReady} lang={lang} onSpeak={speak} />}
              {tab === "company" && <CompanyPanel dbReady={dbReady} />}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

// The dock: one icon per feature, each opens a slide-in panel.
const DOCK = [
  { key: "chat", label: "Chat", title: "Chat with Inovo" },
  { key: "tasks", label: "Tasks", title: "Tasks & meetings" },
  { key: "people", label: "People", title: "People & outreach" },
  { key: "evidence", label: "Evidence", title: "Evidence" },
  { key: "tests", label: "Tests", title: "48-hour tests" },
  { key: "weekly", label: "Weekly", title: "Weekly review" },
  { key: "company", label: "Company", title: "Company" },
];

function DockIcon({ name }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  switch (name) {
    case "chat":
      return (<svg {...common}><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9h8M8 12h5" /></svg>);
    case "tasks":
      return (<svg {...common}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8 12 3 3 5-6" /></svg>);
    case "people":
      return (<svg {...common}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" /></svg>);
    case "evidence":
      return (<svg {...common}><path d="M6 3h9l3 3v15H6z" /><path d="M9 10h6M9 14h6M9 18h4" /></svg>);
    case "tests":
      return (<svg {...common}><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" /><path d="M7.5 15h9" /></svg>);
    case "weekly":
      return (<svg {...common}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /><path d="M8 15h3" /></svg>);
    default:
      return (<svg {...common}><path d="M4 21V8l8-5 8 5v13" /><path d="M9 21v-6h6v6" /></svg>);
  }
}

const SKILL_NAMES = {
  roast: "Gap check",
  "solo-founder": "Founder mode",
  "pricing-strategist": "Pricing",
  "weekly-review": "Weekly review",
  "client-scope": "Client scope",
  "open-website": "Website",
};

function SetupNotice({ status }) {
  if (!status) return null;
  const notes = [];
  if (!status.gemma.configured) notes.push("Add GEMINI_API_KEY to .env.local and restart the app so Inovo can answer.");
  if (!status.supabase.configured) notes.push("No database connected. Answers work, but evidence, tests and reviews won't be saved until you connect Supabase.");
  else if (!status.supabase.ok) notes.push(`Supabase is connected but not ready: ${status.supabase.error}`);
  else if (!status.supabase.seeded) notes.push("Supabase is ready. Run supabase/seed.sql, or add your company details in the Company tab.");
  if (!notes.length) return null;
  return (
    <div className="notice" role="status">
      {notes.map((n) => (
        <p key={n}>{n}</p>
      ))}
    </div>
  );
}

function GapCard({ gap, onOpenTests }) {
  const { verdict, panel, test } = gap;
  const order = ["critic", "champion", "analyst", "investigator", "customer"];
  return (
    <div className={`gap ${VERDICT_CLASS[verdict.verdict]}`}>
      <div className="verdict">
        <strong>{verdict.verdict}</strong>
        <span>
          {verdict.composite} out of 10, {verdict.confidence} confidence
        </span>
      </div>
      <dl className="scores">
        {order.map((k) => (
          <div key={k} className="score">
            <dt>{k[0].toUpperCase() + k.slice(1)}</dt>
            <dd>
              <span className="bar" style={{ "--w": `${(panel[k]?.score || 0) * 10}%` }} />
              <b>{panel[k]?.score}</b>
            </dd>
          </div>
        ))}
      </dl>
      {verdict.gates.length > 0 && <p className="gates">{verdict.gates.join(" ")}</p>}
      <div className="test">
        <p className="test-name">Next 48 hours: {test.name}</p>
        <p>{test.do}</p>
        <p className="muted">Costs {test.cost}. It passes if: {test.pass}</p>
        <button className="link" onClick={onOpenTests}>Track this test</button>
      </div>
    </div>
  );
}
