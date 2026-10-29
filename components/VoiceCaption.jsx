"use client";
// What you see while talking: a live sound wave while you speak (then your
// words), and subtitles that follow the cofounder's voice word by word.
import { useEffect, useRef } from "react";

const BARS = 32;

// Rough speaking time of each word: its letters and digits, plus a little per word.
// cum[i] = time up to the end of word i. Progress values (0-1) are fractions of `total`.
export function wordWeights(text = "") {
  const cum = [];
  let total = 0;
  for (const w of String(text).split(/\s+/).filter(Boolean)) {
    const sounds = (w.match(/[\p{L}\p{N}]/gu) || []).length;
    total += 1.5 + sounds + (/\d/.test(w) ? sounds * 1.5 : 0); // numbers are read out longer
    cum.push(total);
  }
  return { cum, total: total || 1 };
}

export default function VoiceCaption({ state, caption, levelRef, progressRef }) {
  const barsRef = useRef([]);
  const wordsRef = useRef(null);

  const active = state === "listening" || state === "speaking";

  // Sound wave: scrolls left, newest level on the right.
  useEffect(() => {
    if (!active) return;
    const hist = new Array(BARS).fill(0);
    let raf;
    let last = 0;
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 45) return;
      last = now;
      hist.shift();
      let level = levelRef.current || 0;
      // browser fallback voice gives no level: show a gentle talking pulse instead
      if (state === "speaking" && level < 0.003) {
        const t = now / 1000;
        level = 0.04 + 0.08 * Math.abs(Math.sin(t * 7.1) * Math.sin(t * 3.3));
      }
      hist.push(Math.min(1, level * 7));
      barsRef.current.forEach((el, i) => {
        if (el) el.style.transform = `scaleY(${0.08 + hist[i] * 0.92})`;
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, state, levelRef]);

  // Subtitles: light up words in step with how far the voice has played.
  useEffect(() => {
    if (state !== "speaking" || caption?.who !== "cofounder") return;
    const weights = wordWeights(caption.text);
    let raf;
    let shown = -1;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const spans = wordsRef.current?.children;
      if (!spans?.length) return;
      const p = Math.max(0, Math.min(1, progressRef.current?.() ?? 0));
      // longer words take longer to say: share the talking time by word length
      const target = p * weights.total;
      let upTo = -1;
      if (p > 0) {
        upTo = weights.cum.findIndex((c) => c >= target);
        if (upTo === -1) upTo = spans.length - 1;
      }
      if (upTo === shown) return;
      shown = upTo;
      for (let i = 0; i < spans.length; i++) {
        spans[i].className = i < upTo ? "said" : i === upTo ? "now" : "";
      }
      spans[Math.max(0, upTo)]?.scrollIntoView?.({ block: "nearest" });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state, caption, progressRef]);

  if (!caption) return null;
  const you = caption.who === "you";
  const words = (caption.text || "").split(/\s+/).filter(Boolean);

  return (
    <div className={`voice-caption ${you ? "is-you" : "is-cofounder"}`} aria-live="polite">
      <div className="vc-head">
        <span className="vc-who">{you ? "You" : "Inovo"}</span>
        {active && (
          <div className="vc-wave" aria-hidden="true">
            {Array.from({ length: BARS }, (_, i) => (
              <i key={i} ref={(el) => (barsRef.current[i] = el)} />
            ))}
          </div>
        )}
      </div>
      {you ? (
        <p className="vc-text">{caption.text || (state === "listening" ? "Listening…" : "Working out what you said…")}</p>
      ) : (
        <p className="vc-text" ref={wordsRef}>
          {words.map((w, i) => (
            <span key={i}>{w} </span>
          ))}
        </p>
      )}
    </div>
  );
}
