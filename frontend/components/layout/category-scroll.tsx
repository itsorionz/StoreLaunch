"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useDict } from "@frontend/i18n/provider";
import { useDragPan } from "@frontend/lib/use-drag-pan";

type CategoryScrollProps = {
  categories: Array<{
    id: string;
    name: string;
    nameBn?: string | null;
    slug: string;
    imageUrl?: string | null;
  }>;
  dict: ReturnType<typeof useDict>;
};

export function CategoryScroll({ categories, dict }: CategoryScrollProps) {
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
  }, [updateScrollState, scrollRef, categories.length]);

  const scrollLeft = () => {
    scrollRef.current?.scrollBy({ left: -300, behavior: "smooth" });
  };

  const scrollRight = () => {
    scrollRef.current?.scrollBy({ left: 300, behavior: "smooth" });
  };

  return (
    <section className="mb-12">
      <h2 className="mb-4 flex items-center gap-2.5 text-xl font-bold tracking-tight">
        <span className="h-5 w-1 rounded-full bg-primary" aria-hidden />
        {dict.home.allYouNeed}
      </h2>
      {/* Arrows live outside the scroller so they stay fixed while content pans. */}
      <div className="relative">
        <div
          ref={scrollRef}
          onScroll={updateScrollState}
          onMouseDown={onMouseDown}
          className="overflow-x-auto scrollbar-hidden pb-2"
        >
          <div ref={trackRef} className="inline-flex gap-3">
            {categories.map((c) => (
              <Link
                key={c.id}
                href={`/categories/${c.slug}`}
                onClick={suppressDraggedClick}
                className="group flex flex-col items-center gap-2.5 rounded-xl border border-border/60 bg-surface p-3.5 text-center shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md min-w-[200px]"
              >
                <span className="relative block aspect-square w-full overflow-hidden rounded-lg bg-surface-2">
                  <img
                    src={c.imageUrl ?? "/categories/photo-spices.webp"}
                    alt={dict.lang === "bn" ? c.nameBn || c.name : c.name}
                    className="h-full w-full object-contain p-1.5 transition-transform duration-200 group-hover:scale-110"
                  />
                </span>
                <span className="text-xs font-semibold leading-tight">
                  {dict.lang === "bn" ? c.nameBn || c.name : c.name}
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
      <div className="mt-4 text-center">
        <Link
          href="/categories"
          className="text-sm font-medium text-primary hover:text-primary-dark transition-colors"
        >
          See all categories
        </Link>
      </div>
    </section>
  );
}
