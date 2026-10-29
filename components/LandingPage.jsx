"use client";
// The Inoverse landing page. One liquid globe lives behind the whole page and travels
// with you: each section tells it where to sit, how big to be and how much to melt,
// and it glides there as you scroll (faster scrolling = more wobble). It follows the
// mouse, and takes the colour of whichever executive the page is talking about.
// "Start talking" opens the app (see app/page.jsx).
import { useEffect, useRef, useState } from "react";
import Globe from "@/components/Globe";
import { ROLES, roleByKey } from "@/lib/roles";

// Where the globe sits in each section. x/y: fraction of half the screen (0 = centre).
const SCENES = [
  { id: "hero", x: 0.42, y: -0.02, scale: 1.05, rot: 0, blob: 0.75 },
  { id: "statement", x: -0.5, y: 0.05, scale: 0.72, rot: 1.6, blob: 1 },
  { id: "team", x: 0.62, y: 0.18, scale: 0.5, rot: 3.1, blob: 0.6 },
  { id: "shape", x: 0, y: 0.04, scale: 1.0, rot: 4.2, blob: 0.25 },
  { id: "features", x: -0.66, y: -0.42, scale: 0.46, rot: 5.6, blob: 1 },
  { id: "close", x: 0, y: 0.1, scale: 0.92, rot: 7, blob: 0.8 },
];
// phones: keep the globe centred behind the text instead of to the side
const PHONE = { x: 0.15, y: 0.6, scale: 0.75 };

const EXECS = ROLES.filter((r) => r.key !== "cofounder");
const HERO_CYCLE = ["cfo", "cto", "legal", "cmo", "hr", "cro", "ceo"];
const STATES = [
  ["idle", "Idle", "Breathing slowly, waiting for you."],
  ["listening", "Listening", "Ripples follow your voice."],
  ["thinking", "Thinking", "The liquid swirls while it works it out."],
  ["speaking", "Speaking", "Swells and moves with every word."],
];

const FEATURES = [
  ["Gap check before you build", "Five reviewers score a new idea and give a verdict: GO, RESHAPE or KILL, with a 48-hour test to prove it."],
  ["Market simulation", "See how customers might react to your products, and which one to focus on."],
  ["Tasks from your inbox", "Email yourself “Inovo: …” and it becomes a task. Your Google Calendar meetings show up too."],
  ["People & follow-ups", "Keep track of leads and clients, and get WhatsApp follow-up drafts when they're due."],
  ["Weekly review", "What's stalled, who does what, and one goal for the week."],
  ["English & Urdu, hands-free", "Talk out loud in either language. Inovo answers in a natural voice and keeps the conversation going."],
];

const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

export default function LandingPage({ onEnter }) {
  const scrollRef = useRef(null);
  const sectionRefs = useRef([]);
  const motionRef = useRef({ ...SCENES[0], scale: 0.05, energy: 0 });
  const levelRef = useRef(0);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [active, setActive] = useState(0);
  const [heroRole, setHeroRole] = useState(0);
  const [hoverRole, setHoverRole] = useState(null);
  const [demo, setDemo] = useState({ state: "idle", auto: true });
  const leavingRef = useRef(false);

  // 1. loader: count to 100% (and wait for the fonts), then reveal the page
  useEffect(() => {
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const minTime = still ? 200 : 1500;
    const start = performance.now();
    let fontsDone = false;
    document.fonts?.ready.then(() => (fontsDone = true)) ?? (fontsDone = true);
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / minTime);
      const p = Math.round(ease(t) * (fontsDone ? 100 : 92));
      setProgress(p);
      if (t >= 1 && fontsDone) {
        setProgress(100);
        setTimeout(() => setReady(true), 250);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // 2. scroll → where the globe should be; scroll speed → wobble
  useEffect(() => {
    if (!ready) return;
    const box = scrollRef.current;
    if (!box) return;
    let raf;
    let lastTop = box.scrollTop;
    let lastT = performance.now();
    let shown = -1;
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      if (leavingRef.current) return;
      const top = box.scrollTop;
      const vh = box.clientHeight;
      // each section's "home" scroll position: when it is centred on screen
      const homes = sectionRefs.current.map((el) => (el ? el.offsetTop + el.offsetHeight / 2 - vh / 2 : 0));
      let i = 0;
      while (i < homes.length - 2 && top >= homes[i + 1]) i++;
      const span = Math.max(1, homes[i + 1] - homes[i]);
      const t = ease(Math.max(0, Math.min(1, (top - homes[i]) / span)));
      const a = SCENES[i];
      const b = SCENES[i + 1];
      const phone = window.innerWidth < 760;
      const m = motionRef.current;
      m.x = lerp(a.x, b.x, t) * (phone ? PHONE.x : 1);
      m.y = phone ? PHONE.y - Math.min(1, top / vh) * 0.6 : lerp(a.y, b.y, t);
      m.scale = lerp(a.scale, b.scale, t) * (phone ? PHONE.scale : 1);
      m.rot = lerp(a.rot, b.rot, t);
      m.blob = lerp(a.blob, b.blob, t);
      const dt = Math.max(1, now - lastT);
      m.energy = Math.min(1, Math.abs(top - lastTop) / dt / 4); // ~4 px per ms = full wobble
      lastTop = top;
      lastT = now;
      const near = t < 0.5 ? i : i + 1;
      if (near !== shown) {
        shown = near;
        setActive(near);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  // 3. sections fade up as they come into view
  useEffect(() => {
    if (!ready) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("in")),
      { root: scrollRef.current, threshold: 0.18 }
    );
    scrollRef.current?.querySelectorAll(".lp-reveal").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ready]);

  // 4. hero: the globe changes colour through the executives
  useEffect(() => {
    if (!ready || active !== 0) return;
    const t = setInterval(() => setHeroRole((n) => (n + 1) % HERO_CYCLE.length), 2200);
    return () => clearInterval(t);
  }, [ready, active]);

  // 5. "We gave Inovo a shape": show each state in turn (until you pick one)
  useEffect(() => {
    if (active !== 3 || !demo.auto) return;
    const t = setInterval(
      () => setDemo((d) => ({ ...d, state: STATES[(STATES.findIndex(([k]) => k === d.state) + 1) % STATES.length][0] })),
      3000
    );
    return () => clearInterval(t);
  }, [active, demo.auto]);

  // a pretend voice level so "Listening" and "Speaking" move like the real thing
  const shownState = active === 3 ? demo.state : "idle";
  useEffect(() => {
    if (shownState !== "listening" && shownState !== "speaking") {
      levelRef.current = 0;
      return;
    }
    let raf;
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const s = now / 1000;
      levelRef.current = 0.02 + 0.06 * Math.abs(Math.sin(s * 5.3) * Math.sin(s * 1.9 + 1));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [shownState]);

  function start() {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    // the globe swells to fill the screen, then the app takes over
    Object.assign(motionRef.current, { x: 0, y: 0, scale: 2.4, blob: 0.3, energy: 1 });
    setTimeout(onEnter, 900);
  }

  const roleKey =
    hoverRole ||
    (active === 0 ? HERO_CYCLE[heroRole] : active === 2 ? "ceo" : active === 4 ? "cto" : active === 1 ? "cmo" : "cofounder");
  const role = roleByKey(roleKey);

  const sec = (i) => (el) => (sectionRefs.current[i] = el);

  return (
    <div
      className={`lp ${ready ? "ready" : ""} ${leaving ? "leaving" : ""}`}
      style={{ "--role": role.color, "--role-2": role.color2 }}
    >
      {/* the liquid globe behind everything */}
      <Globe
        state={shownState}
        levelRef={levelRef}
        color={role.color}
        color2={role.color2}
        motionRef={motionRef}
        className="globe-stage"
      />

      {/* loader */}
      <div className="lp-loader" aria-hidden={ready}>
        <span className="lp-loader-name">Inoverse</span>
        <span className="lp-loader-pct">{progress}%</span>
      </div>

      <header className="lp-nav">
        <span className="lp-logo">Inoverse</span>
        <button className="lp-pill" onClick={start}>
          Launch Inovo <span aria-hidden="true">↗</span>
        </button>
      </header>

      <main className="lp-scroll" ref={scrollRef} tabIndex={-1}>
        {/* ---------- hero ---------- */}
        <section className="lp-sec lp-hero" ref={sec(0)}>
          <div className="lp-hero-copy">
            <p className="lp-eyebrow">Inovo · your AI cofounder</p>
            <h1 className="lp-h1">
              This isn't a chatbot.
              <span>It's your whole C-suite.</span>
            </h1>
            <p className="lp-lead">
              Talk to Inovo out loud, in English or Urdu. Every question goes to the executive who owns it: the CFO runs
              your numbers, the CTO picks your stack, Legal reads the contract. And it always tells you who's speaking.
            </p>
            <div className="lp-ctas">
              <button className="lp-btn" onClick={start}>Start talking →</button>
              <a className="lp-link" href="#team" onClick={(e) => { e.preventDefault(); sectionRefs.current[2]?.scrollIntoView({ behavior: "smooth" }); }}>
                Meet the team
              </a>
            </div>
          </div>
          <div className="lp-hero-role" aria-live="polite">
            <span>Speaking as</span>
            <b key={role.key}>{role.label}</b>
            <small>{role.area}</small>
          </div>
          <span className="lp-scrollcue" aria-hidden="true">Scroll</span>
        </section>

        {/* ---------- statement ---------- */}
        <section className="lp-sec lp-statement" ref={sec(1)}>
          <div className="lp-reveal lp-statement-inner">
            <h2 className="lp-h2">
              Inovo doesn't just reply.
              <span>It runs the room.</span>
            </h2>
            <div className="lp-cols">
              <div>
                <h3>Built for founders who do everything</h3>
                <p>
                  Pricing on Monday, a client contract on Tuesday, a hiring call on Wednesday. Inovo knows your company,
                  your products and your week, so every answer starts from where you actually are.
                </p>
              </div>
              <div>
                <h3>One voice, a full leadership team</h3>
                <p>
                  Ask anything. Inovo routes it to the right executive, who answers through their own lens, and says so:
                  “CFO here.” You stay the boss; they bring the options.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- the team ---------- */}
        <section className="lp-sec lp-team" id="team" ref={sec(2)}>
          <div className="lp-reveal">
            <p className="lp-eyebrow">Meet your executives</p>
            <h2 className="lp-h2">Twelve hats.<span>One cofounder.</span></h2>
            <ul className="lp-roles" onMouseLeave={() => setHoverRole(null)}>
              {EXECS.map((r) => (
                <li key={r.key}>
                  <button
                    style={{ "--c": r.color }}
                    className={hoverRole === r.key ? "on" : ""}
                    onMouseEnter={() => setHoverRole(r.key)}
                    onFocus={() => setHoverRole(r.key)}
                    onBlur={() => setHoverRole(null)}
                  >
                    <b>{r.label}</b>
                    <span>{r.area}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="lp-note">Hover an executive to see their colour.</p>
          </div>
        </section>

        {/* ---------- shape ---------- */}
        <section className="lp-sec lp-shape" ref={sec(3)}>
          <div className="lp-reveal lp-shape-top">
            <p className="lp-eyebrow">We gave Inovo a shape</p>
            <h2 className="lp-h2">Not a face.<span>A living liquid.</span></h2>
          </div>
          <div className="lp-reveal lp-shape-bottom">
            <p className="lp-lead">
              It listens, thinks and speaks, and takes the colour of whoever is talking.
            </p>
            <div className="lp-states" role="group" aria-label="Show a state">
              {STATES.map(([k, label, text]) => (
                <button
                  key={k}
                  aria-pressed={demo.state === k}
                  onClick={() => setDemo({ state: k, auto: false })}
                >
                  <b>{label}</b>
                  <span>{text}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- features ---------- */}
        <section className="lp-sec lp-features" ref={sec(4)}>
          <div className="lp-reveal">
            <p className="lp-eyebrow">What it does</p>
            <h2 className="lp-h2">More than advice.<span>It does the work.</span></h2>
            <ul className="lp-grid">
              {FEATURES.map(([title, text], i) => (
                <li key={title} className="lp-card" style={{ "--d": `${i * 70}ms` }}>
                  <span className="lp-num">{String(i + 1).padStart(2, "0")}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------- close ---------- */}
        <section className="lp-sec lp-close" ref={sec(5)}>
          <div className="lp-reveal lp-close-inner">
            <h2 className="lp-h1">
              You're not hiring a bot.
              <span>You're meeting your team.</span>
            </h2>
            <button className="lp-btn" onClick={start}>Start talking →</button>
          </div>
          <footer className="lp-foot">
            <span>© 2026 Inovix &amp; Co · Faisalabad</span>
            <span>Runs on Gemma</span>
          </footer>
        </section>
      </main>
    </div>
  );
}
