"use client";
// The living background behind Inovo.
// 1. Start: when you come out of the intro, the HUD powers on from darkness (2.4 s clip, played once).
// 2. Then it hands off to the seamless loop (the loop's first frame is the start clip's last frame).
// 3. Movement: a slow camera drift, plus a slight shift with the mouse, so the HUD feels deep.
// 4. Lighting: a soft light sweep passes over the HUD every few seconds.
// The voice effect on the centre chip lives inside the same moving layer, so it stays on the chip.
import { useEffect, useRef, useState } from "react";
import VoiceCore from "@/components/VoiceCore";

export default function HudScene({ entered, state, levelRef }) {
  const sceneRef = useRef(null);
  const startRef = useRef(null);
  const loopRef = useRef(null);
  const [phase, setPhase] = useState("dark"); // dark → powering → live

  // power on once the intro is done
  useEffect(() => {
    if (!entered || phase !== "dark") return;
    const v = startRef.current;
    if (!v) return;
    setPhase("powering");
    v.currentTime = 0;
    v.play().catch(() => {
      // can't autoplay for some reason: skip straight to the loop
      setPhase("live");
      loopRef.current?.play().catch(() => {});
    });
  }, [entered, phase]);

  function handOff() {
    const loop = loopRef.current;
    if (!loop) return setPhase("live");
    loop.currentTime = 0;
    // keep the start clip's last frame on screen until the loop is really playing
    const go = () => setPhase("live");
    loop.addEventListener("playing", go, { once: true });
    loop.play().catch(go);
  }

  // mouse parallax: the scene leans a little away from the pointer
  useEffect(() => {
    const el = sceneRef.current;
    if (!el || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    const onMove = (e) => {
      tx = e.clientX / window.innerWidth - 0.5;
      ty = e.clientY / window.innerHeight - 0.5;
    };
    const tick = () => {
      raf = requestAnimationFrame(tick);
      x += (tx - x) * 0.05;
      y += (ty - y) * 0.05;
      el.style.setProperty("--px", x.toFixed(4));
      el.style.setProperty("--py", y.toFixed(4));
    };
    window.addEventListener("pointermove", onMove);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className={`hud-scene hud-${phase}`} ref={sceneRef} aria-hidden="true">
      <div className="hud-drift">
        <video ref={loopRef} className="stage-video hud-loop" src="/inoverse-bg.mp4" muted loop playsInline preload="auto" />
        <video
          ref={startRef}
          className="stage-video hud-start"
          src="/inoverse-bg-start.mp4"
          muted
          playsInline
          preload="auto"
          onEnded={handOff}
        />
        <VoiceCore state={state} levelRef={levelRef} />
        <div className="hud-sweep" />
      </div>
    </div>
  );
}
