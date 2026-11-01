"use client";

import { useEffect, useState } from "react";
import { useDict } from "@frontend/i18n/provider";

export function ScrollToTop() {
  const dict = useDict();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 300);
    window.addEventListener("scroll", onScroll, { passive: true });
    const frame = requestAnimationFrame(onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  if (!visible) return null;
  return (
    <button
      type="button"
      data-scroll-top
      aria-label={dict.common.scrollToTop}
      title={dict.common.scrollToTop}
      onClick={() =>
        window.scrollTo({
          top: 0,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
        })
      }
      className="fixed right-5 bottom-20 z-[80] flex h-11 w-11 items-center justify-center rounded-full border border-primary/20 bg-primary text-white shadow-lg transition-colors hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:right-6 lg:bottom-6"
    >
      <svg
        width="21"
        height="21"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="m5 12 7-7 7 7M12 5v15" />
      </svg>
    </button>
  );
}
