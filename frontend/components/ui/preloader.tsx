"use client";

import { useEffect, useState } from "react";
import { Spinner } from "./spinner";

// Minimum time on screen measured from navigation start, so a fully cached
// load cannot flash the overlay for a single frame.
const MIN_VISIBLE_MS = 400;
// Hard cap so a hanging asset can never trap the user behind the overlay.
const MAX_VISIBLE_MS = 5000;
const FADE_MS = 300;

type Phase = "visible" | "fading" | "gone";

/**
 * Full-screen splash shown while the document loads and hydrates. It is part
 * of the root layout, so it only ever plays on a full page load — client-side
 * navigations are covered by the `loading.tsx` files instead.
 */
export function Preloader() {
  const [phase, setPhase] = useState<Phase>("visible");

  useEffect(() => {
    let fadeTimer: number | undefined;
    let goneTimer: number | undefined;

    const fade = () => {
      setPhase((current) => (current === "visible" ? "fading" : current));
      goneTimer = window.setTimeout(() => setPhase("gone"), FADE_MS);
    };

    const scheduleFade = () => {
      if (fadeTimer !== undefined) return;
      const wait = Math.max(0, MIN_VISIBLE_MS - performance.now());
      fadeTimer = window.setTimeout(fade, wait);
    };

    // Failsafe: never keep the overlay up past MAX_VISIBLE_MS after navigation.
    const failsafe = window.setTimeout(fade, Math.max(0, MAX_VISIBLE_MS - performance.now()));

    if (document.readyState === "complete") scheduleFade();
    else window.addEventListener("load", scheduleFade, { once: true });

    return () => {
      window.removeEventListener("load", scheduleFade);
      window.clearTimeout(fadeTimer);
      window.clearTimeout(goneTimer);
      window.clearTimeout(failsafe);
    };
  }, []);

  // Prevent scrolling behind the overlay while it is up.
  useEffect(() => {
    if (phase === "gone") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [phase]);

  if (phase === "gone") return null;

  return (
    <div
      id="app-preloader"
      role="status"
      className={`preloader-failsafe fixed inset-0 z-[120] flex items-center justify-center bg-background transition-opacity duration-300 ${
        phase === "fading" ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <Spinner className="h-8 w-8 text-primary" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
