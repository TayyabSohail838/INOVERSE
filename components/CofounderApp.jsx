"use client";
// The whole app: the woven 3D cofounder on the left, the working panel on the right.
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { api, setAccessCode } from "@/lib/api";
import { EvidencePanel, TestsPanel, WeeklyPanel, CompanyPanel } from "@/components/Panels";

// three.js only runs in the browser
const Loom3D = dynamic(() => import("@/components/Loom3D"), { ssr: false });

const STATE_TEXT = {
  idle: "Tap to talk, or type in the panel",
  listening: "Listening",
  thinking: "Thinking it through",
  speaking: "Speaking",
};

const TABS = [
  { key: "talk", label: "Talk" },
  { key: "evidence", label: "Evidence" },
  { key: "tests", label: "Tests" },
  { key: "weekly", label: "Weekly review" },
  { key: "company", label: "Company" },
];

const VERDICT_CLASS = { GO: "go", RESHAPE: "reshape", KILL: "kill" };

export default function CofounderApp() {
  const [state, setState] = useState("idle");
  const [lang, setLang] = useState("en");
  const [handsFree, setHandsFree] = useState(false);
  const [log, setLog] = useState([]);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState(null);
  const [tab, setTab] = useState("talk");
  const [needCode, setNeedCode] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [council, setCouncil] = useState(null); // { panel, verdict } of the latest gap check

  const levelRef = useRef(0);
  const meterRef = useRef(null);
  const recRef = useRef(null);
  const historyRef = useRef([]);
  const handsFreeRef = useRef(false);
  const langRef = useRef("en");
  const logEndRef = useRef(null);

  const dbReady = Boolean(status?.supabase?.ok);

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
        setLog(messages.map((m) => ({ role: m.role, text: m.text, skill: m.skill })));
        historyRef.current = messages.slice(-8).map((m) => ({ role: m.role, text: m.text }));
      }
    } catch (e) {
      setError(e.message);
    }
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
      stopMeter();
      window.speechSynthesis?.cancel();
    };
  }, [loadStatus]);

  // ---------- microphone level for the 3D weave ----------
  async function startMeter() {
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
    } catch {
      levelRef.current = 0; // no level meter; speech recognition can still work
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
  function listen() {
    const Rec = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!Rec) {
      setError("Voice input needs Chrome or Edge. Typing works in any browser.");
      setTab("talk");
      return;
    }
    window.speechSynthesis?.cancel();
    const rec = new Rec();
    rec.lang = langRef.current === "ur" ? "ur-PK" : "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => {
      setError("");
      setState("listening");
      startMeter();
    };
    rec.onresult = (e) => ask(e.results[0][0].transcript);
    rec.onerror = (e) => {
      stopMeter();
      setState("idle");
      if (e.error === "not-allowed") setError("Microphone access is blocked. Allow it from the icon in the address bar.");
      else if (e.error !== "no-speech" && e.error !== "aborted") setError(`Microphone problem: ${e.error}`);
    };
    rec.onend = () => {
      stopMeter();
      setState((s) => (s === "listening" ? "idle" : s));
    };
    recRef.current = rec;
    rec.start();
  }

  function stop() {
    recRef.current?.abort();
    stopMeter();
    window.speechSynthesis?.cancel();
    setState("idle");
  }

  const speak = useCallback((line) => {
    if (!line || !window.speechSynthesis) {
      setState("idle");
      return;
    }
    const u = new SpeechSynthesisUtterance(line);
    const voices = window.speechSynthesis.getVoices();
    // Urdu voices are rare; Roman Urdu read by an English voice is understandable
    const want = langRef.current === "ur" ? ["ur", "hi", "en-IN", "en"] : ["en-GB", "en-US", "en"];
    u.voice = want.map((w) => voices.find((v) => v.lang.startsWith(w))).find(Boolean) || null;
    u.rate = 1.02;
    u.onstart = () => setState("speaking");
    u.onerror = () => setState("idle");
    u.onend = () => {
      setState("idle");
      if (handsFreeRef.current) setTimeout(listen, 400);
    };
    window.speechSynthesis.speak(u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ask(raw) {
    const message = raw.trim();
    if (!message) return;
    setTyped("");
    setTab("talk");
    setError("");
    setLog((l) => [...l, { role: "user", text: message }]);
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
      if (data.gapCheck) setCouncil({ panel: data.gapCheck.panel, verdict: data.gapCheck.verdict.verdict });

      setLog((l) => [
        ...l,
        { role: "assistant", text: data.details || data.say, skill: data.skill, gapCheck: data.gapCheck, experimentId: data.experimentId, action },
      ]);
      speak(
        action?.blocked
          ? langRef.current === "ur"
            ? "Browser ne tab rok diya. Button dabayein."
            : "Your browser blocked the new tab. Use the button to open it."
          : data.say
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

  return (
    <div className="app">
      <section className={`stage s-${state}`} aria-label="Cofounder">
        <Loom3D state={state} levelRef={levelRef} panel={council?.panel} verdict={council?.verdict} />

        <header className="stage-head">
          <div>
            <h1>Inovix cofounder</h1>
            <p>Checks the gaps before you build. Runs on Gemma.</p>
          </div>
          <div className="toggles" role="group" aria-label="Voice settings">
            <button aria-pressed={lang === "en"} onClick={() => setLang("en")}>English</button>
            <button aria-pressed={lang === "ur"} onClick={() => setLang("ur")} lang="ur">اردو</button>
            <button aria-pressed={handsFree} onClick={() => setHandsFree((h) => !h)}>Hands-free</button>
          </div>
        </header>

        <div className="stage-foot">
          <p className="state-line" aria-live="polite">{STATE_TEXT[state]}</p>
          {state === "idle" ? (
            <button className="talk" onClick={listen}>Talk</button>
          ) : (
            <button className="talk stop" onClick={stop}>Stop</button>
          )}
        </div>
      </section>

      <section className="panel" aria-label="Workspace">
        {needCode && (
          <form className="notice" onSubmit={saveCode}>
            <label htmlFor="code">This cofounder is protected. Enter the access code.</label>
            <div className="row">
              <input id="code" type="password" value={codeInput} onChange={(e) => setCodeInput(e.target.value)} autoComplete="off" />
              <button className="btn" disabled={!codeInput.trim()}>Unlock</button>
            </div>
          </form>
        )}
        <SetupNotice status={status} />

        <nav className="tabs" role="tablist" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </nav>

        <div className="panel-body" role="tabpanel">
          {tab === "talk" && (
            <div className="talk-panel">
              <div className="log">
                {log.length === 0 && (
                  <div className="empty">
                    <p>Ask out loud or type. A few things to try:</p>
                    <ul>
                      <li>I want to build a fabric defect app for small mills. Check the gaps first.</li>
                      <li>How should we price Wattly?</li>
                      <li>What should we focus on this week?</li>
                      <li>Open YouTube</li>
                    </ul>
                  </div>
                )}
                {log.map((m, i) => (
                  <article key={i} className={`msg ${m.role}`}>
                    {m.role === "assistant" && m.skill && <span className="skill">{SKILL_NAMES[m.skill] || m.skill}</span>}
                    {m.gapCheck && <GapCard gap={m.gapCheck} onOpenTests={() => setTab("tests")} />}
                    <div className="text">{m.text}</div>
                    {m.action && (
                      <div className="action">
                        <a href={m.action.url} target="_blank" rel="noopener noreferrer">Open {m.action.label}</a>
                        {m.action.blocked && <small>Your browser blocked the new tab. Allow pop-ups for this site once and it will open by itself.</small>}
                      </div>
                    )}
                  </article>
                ))}
                {busy && <p className="thinking">Thinking it through. A gap check takes up to 40 seconds.</p>}
                <div ref={logEndRef} />
              </div>
              {error && <p className="error" role="alert">{error}</p>}
              <form
                className="ask"
                onSubmit={(e) => {
                  e.preventDefault();
                  ask(typed);
                }}
              >
                <label htmlFor="ask" className="sr-only">Message to your cofounder</label>
                <input id="ask" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type to your cofounder" disabled={busy} />
                <button className="btn" disabled={busy || !typed.trim()}>Send</button>
              </form>
            </div>
          )}
          {tab === "evidence" && <EvidencePanel dbReady={dbReady} />}
          {tab === "tests" && <TestsPanel dbReady={dbReady} />}
          {tab === "weekly" && <WeeklyPanel dbReady={dbReady} lang={lang} onSpeak={speak} />}
          {tab === "company" && <CompanyPanel dbReady={dbReady} />}
        </div>
      </section>
    </div>
  );
}

const SKILL_NAMES = {
  roast: "Gap check",
  "solo-founder": "Founder mode",
  "pricing-strategist": "Pricing",
  "weekly-review": "Weekly review",
  "open-website": "Website",
};

function SetupNotice({ status }) {
  if (!status) return null;
  const notes = [];
  if (!status.gemma.configured) notes.push("Add GEMINI_API_KEY to .env.local and restart the app so the cofounder can answer.");
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
