"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { HeroSlide } from "./hero-carousel";
import { useDragPan } from "@frontend/lib/use-drag-pan";

type CampaignScrollerProps = {
  campaigns: HeroSlide[];
  label: string;
};

export function CampaignScroller({ campaigns, label }: CampaignScrollerProps) {
  const { scrollRef, onMouseDown, suppressDraggedClick } = useDragPan();
  const trackRef = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  // Arrows appear only while the row actually overflows, and each one is
  // disabled at its current end.
  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setScrollable(max > 1);
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft >= max - 1);
  }, [scrollRef]);

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;
    // Re-check when the row or its content resizes (window resize, images).
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);
    if (trackRef.current) observer.observe(trackRef.current);
    return () => observer.disconnect();
  }, [updateScrollState, scrollRef, campaigns.length]);

  const scrollLeft = () => {
    scrollRef.current?.scrollBy({ left: -300, behavior: "smooth" });
  };

  const scrollRight = () => {
    scrollRef.current?.scrollBy({ left: 300, behavior: "smooth" });
  };

  if (!campaigns.length) return null;
  return (
    <section aria-label={label} className="mb-12">
      <h2 className="mb-4 flex items-center gap-2.5 text-xl font-bold tracking-tight">
        <span className="h-5 w-1 rounded-full bg-primary" aria-hidden />
        {label}
      </h2>
      {/* Arrows live outside the scroller so they stay fixed while content pans. */}
      <div className="relative">
        <div
          ref={scrollRef}
          onScroll={updateScrollState}
          onMouseDown={onMouseDown}
          className="overflow-x-auto scrollbar-hidden pb-2"
        >
          <div ref={trackRef} className="flex gap-3">
            {campaigns.map((campaign) => (
              <Link
                key={campaign.id}
                href={campaign.linkUrl || `/products?campaign=${campaign.id}`}
                onClick={suppressDraggedClick}
                className="group relative block w-[85%] shrink-0 overflow-hidden rounded-2xl border border-border/60 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:w-[48%] lg:w-[38%]"
              >
                <span className="relative block aspect-[16/9] w-full bg-surface-2">
                  <Image
                    src={campaign.imageUrl}
                    alt={campaign.title}
                    fill
                    unoptimized
                    sizes="(max-width: 640px) 85vw, (max-width: 1024px) 48vw, 38vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <span
                    className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent"
                    aria-hidden
                  />
                  <span className="absolute bottom-3 left-4 right-4 text-sm font-bold text-white">
                    {campaign.title}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
        {scrollable && (
          <>
            <button
              type="button"
              onClick={scrollLeft}
              disabled={atStart}
              className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-l bg-surface/80 px-3 py-2 text-primary transition-colors hover:bg-primary/20 disabled:pointer-events-none disabled:opacity-40"
              aria-label="Scroll left"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={scrollRight}
              disabled={atEnd}
              className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-r bg-surface/80 px-3 py-2 text-primary transition-colors hover:bg-primary/20 disabled:pointer-events-none disabled:opacity-40"
              aria-label="Scroll right"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </>
        )}
      </div>
    </section>
  );
}
