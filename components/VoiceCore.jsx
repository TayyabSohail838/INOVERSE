"use client";
// The glowing chip in the middle of the HUD video comes alive with the voice:
//   listening (you talk)  → teal sound ripples and a wave ring that follow your mic
//   speaking (Inovo)      → the same in bright cyan, following Inovo's voice
//   thinking              → arcs spin around the chip like a loader
//   idle                  → a slow, faint breathing glow
// Drawn on a canvas laid exactly over the chip's ring in the video (see .voice-core in globals.css).
import { useEffect, useRef } from "react";

const COLORS = {
  listening: [94, 234, 212], // teal: you
  speaking: [34, 211, 238], // cyan: Inovo
  thinking: [103, 232, 249],
  starting: [94, 234, 212],
  idle: [34, 211, 238],
};

export default function VoiceCore({ state, levelRef }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let size = 0;
    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      size = canvas.clientWidth;
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    fit();

    let raf;
    let level = 0; // smoothed voice level, 0-1
    let color = [...COLORS.idle];
    let ripples = []; // { born, strength }
    let lastRipple = 0;
    let spin = 0;
    let last = performance.now();

    const rgba = (a) => `rgba(${color[0] | 0}, ${color[1] | 0}, ${color[2] | 0}, ${a})`;

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      const voiced = st === "listening" || st === "speaking";

      // voice level: raw mic / voice RMS is roughly 0-0.2, so scale it up
      const raw = voiced ? Math.min(1, (levelRef?.current || 0) * 6) : 0;
      level += (raw - level) * (raw > level ? 0.45 : 0.12); // rise fast, fall slowly
      const target = COLORS[st] || COLORS.idle;
      color = color.map((c, i) => c + (target[i] - c) * 0.08);

      const c = size / 2;
      const r0 = size * 0.174; // radius of the chip's outer ring in the video
      ctx.clearRect(0, 0, size, size);
      ctx.globalCompositeOperation = "lighter";

      // 1. glow behind the chip: breathes when idle, swells with the voice
      const breathe = still ? 0.5 : 0.5 + 0.5 * Math.sin(now / 1400);
      const glowA = voiced ? 0.18 + level * 0.45 : st === "thinking" ? 0.22 : 0.06 + breathe * 0.06;
      const glowR = r0 * (voiced ? 0.9 + level * 0.6 : 0.95);
      const g = ctx.createRadialGradient(c, c, 0, c, c, glowR);
      g.addColorStop(0, rgba(glowA));
      g.addColorStop(0.55, rgba(glowA * 0.45));
      g.addColorStop(1, rgba(0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c, c, glowR, 0, Math.PI * 2);
      ctx.fill();

      if (still) {
        if (voiced || st === "thinking") {
          ctx.strokeStyle = rgba(0.7);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(c, c, r0, 0, Math.PI * 2);
          ctx.stroke();
        }
        return;
      }

      // 2. ripples: a new ring each time the voice gets loud, spreading outwards
      if (voiced && level > 0.12 && now - lastRipple > 150 - level * 60) {
        ripples.push({ born: now, strength: level });
        lastRipple = now;
      }
      if (st === "thinking" && now - lastRipple > 900) {
        ripples.push({ born: now, strength: 0.3 });
        lastRipple = now;
      }
      ripples = ripples.filter((rp) => now - rp.born < 1400);
      for (const rp of ripples) {
        const t = (now - rp.born) / 1400;
        const rr = r0 * (0.95 + t * 1.5);
        ctx.strokeStyle = rgba((1 - t) * (0.25 + rp.strength * 0.55));
        ctx.lineWidth = 1 + rp.strength * 3 * (1 - t);
        ctx.beginPath();
        ctx.arc(c, c, rr, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 3. wave ring: the chip's ring wobbles like a sound wave while someone talks
      if (voiced) {
        const pts = 120;
        const amp = r0 * 0.12 * level;
        ctx.strokeStyle = rgba(0.45 + level * 0.5);
        ctx.lineWidth = 1.5 + level * 2;
        ctx.shadowColor = rgba(0.9);
        ctx.shadowBlur = 12 * level;
        ctx.beginPath();
        for (let i = 0; i <= pts; i++) {
          const a = (i / pts) * Math.PI * 2;
          const wobble =
            Math.sin(a * 6 + now / 140) * 0.55 + Math.sin(a * 11 - now / 90) * 0.3 + Math.sin(a * 3 + now / 260) * 0.15;
          const rr = r0 * 0.98 + wobble * amp;
          const x = c + Math.cos(a) * rr;
          const y = c + Math.sin(a) * rr;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // 4. spinning arcs around the ring: fast while thinking, driven by the voice while talking
      const speed = st === "thinking" ? 3.2 : voiced ? 0.6 + level * 3 : 0.15;
      spin += dt * speed;
      const arcA = st === "thinking" ? 0.75 : voiced ? 0.35 + level * 0.5 : 0.12;
      ctx.strokeStyle = rgba(arcA);
      ctx.lineCap = "round";
      for (let k = 0; k < 3; k++) {
        const start = spin * (k % 2 ? -1 : 1) + (k * Math.PI * 2) / 3;
        ctx.lineWidth = k === 0 ? 3 : 1.6;
        ctx.beginPath();
        ctx.arc(c, c, r0 * (1.12 + k * 0.07), start, start + 0.7 + (voiced ? level * 0.8 : 0));
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [levelRef]);

  return <canvas ref={canvasRef} className="voice-core" aria-hidden="true" />;
}
