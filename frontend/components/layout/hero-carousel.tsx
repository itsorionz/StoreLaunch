"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

export type HeroSlide = { id: string; title: string; imageUrl: string; linkUrl: string };

export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (slides.length <= 1 || paused) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % slides.length), 5000);
    return () => clearInterval(t);
  }, [slides.length, paused]);

  if (!slides.length) return null;
  const slide = slides[index];

  return (
    <div
      className="group relative mb-10 overflow-hidden rounded-2xl border border-border/60 shadow-sm"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <Link href={slide.linkUrl} className="block">
        <div className="relative aspect-[16/5] w-full">
          <Image
            key={slide.id}
            src={slide.imageUrl}
            alt={slide.title}
            fill
            priority
            unoptimized
            sizes="(max-width: 1280px) 100vw, 1280px"
            className="object-cover"
          />
          {/* Gradient scrim for readability */}
          <div
            className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent"
            aria-hidden
          />
        </div>
      </Link>

      {slides.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous slide"
            onClick={() => setIndex((i) => (i - 1 + slides.length) % slides.length)}
            className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-foreground opacity-0 shadow-sm backdrop-blur transition-opacity duration-200 hover:bg-white group-hover:opacity-100 md:opacity-0"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Next slide"
            onClick={() => setIndex((i) => (i + 1) % slides.length)}
            className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-foreground opacity-0 shadow-sm backdrop-blur transition-opacity duration-200 hover:bg-white group-hover:opacity-100 md:opacity-0"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>

          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-label={`Slide ${i + 1}`}
                onClick={() => setIndex(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === index ? "w-6 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
