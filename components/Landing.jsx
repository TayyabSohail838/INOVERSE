"use client";
// The intro: scroll or swipe down to push into the hologram. Scrolling moves the
// 8-second video forward (scroll back to rewind); at the light burst it fades into Inoverse.
import { useEffect, useRef, useState } from "react";

const SCROLL_SCREENS = 3.5; // how much scrolling the whole video takes

export default function Landing({ onEnter }) {
  const scrollRef = useRef(null);
  const videoRef = useRef(null);
  const hintRef = useRef(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const box = scrollRef.current;
    const video = videoRef.current;
    if (!box || !video) return;
    box.focus({ preventScroll: true }); // arrow keys and space work right away
    video.pause();

    let raf;
    let shown = 0; // the video time on screen, eased toward the scroll position
    let done = false;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const max = box.scrollHeight - box.clientHeight || 1;
      const progress = Math.min(1, Math.max(0, box.scrollTop / max));
      const duration = video.duration || 8;
      const target = progress * (duration - 0.05);

      shown += (target - shown) * 0.2; // smooth, so wheel steps don't look jumpy
      if (Math.abs(target - shown) < 0.002) shown = target;
      if (video.readyState >= 1 && !video.seeking && Math.abs(video.currentTime - shown) > 0.015) {
        video.currentTime = shown;
      }
      if (hintRef.current) hintRef.current.style.opacity = String(Math.max(0, 1 - progress * 5));

      if (!done && progress > 0.985 && shown > duration - 0.35) {
        done = true;
        setLeaving(true);
        setTimeout(onEnter, 750);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onEnter]);

  return (
    <div className={`landing ${leaving ? "leaving" : ""}`} aria-label="Inoverse intro">
      <div className="landing-scroll" ref={scrollRef} tabIndex={-1}>
        <div style={{ height: `${(SCROLL_SCREENS + 1) * 100}vh` }}>
          <div className="landing-sticky">
            <video
              ref={videoRef}
              className="landing-video"
              src="/inoverse-intro.mp4"
              poster="/inoverse-intro.jpg"
              muted
              playsInline
              preload="auto"
              aria-hidden="true"
            />
            <div className="landing-hint" ref={hintRef}>
              <span className="landing-name">INOVERSE</span>
              <span className="landing-scrollcue">
                Scroll to enter
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="landing-flash" aria-hidden="true" />
    </div>
  );
}
