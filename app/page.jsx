"use client";
// Home: the landing page first, then the app.
// "Start talking" adds #app to the address, so a reload goes straight to the app and the
// browser's Back button returns to the landing page. Coming back from Google sign-in
// (?gmail=...) also skips the landing page.
import { useEffect, useState } from "react";
import CofounderApp from "@/components/CofounderApp";
import LandingPage from "@/components/LandingPage";

export default function Home() {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const sync = () =>
      setEntered(window.location.hash === "#app" || new URLSearchParams(window.location.search).has("gmail"));
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  function enter() {
    window.history.pushState(null, "", `${window.location.pathname}${window.location.search}#app`);
    setEntered(true);
  }

  return entered ? <CofounderApp /> : <LandingPage onEnter={enter} />;
}
