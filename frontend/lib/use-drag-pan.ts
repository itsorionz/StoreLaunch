"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Mouse drag-to-pan for a horizontally scrollable row.
 *
 * The gesture is tracked on `window` rather than on the row itself: each row
 * has absolutely positioned arrow buttons overlaying its edges, so once the
 * cursor crossed one the row stopped receiving `mousemove` and the pan froze
 * mid-gesture — the row looked like it "wasn't moving" while the button was
 * still held.
 */
export function useDragPan() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragStartX = useRef(0);
  const scrollStartX = useRef(0);
  const dragging = useRef(false);
  const dragged = useRef(false);

  const onMove = useCallback((e: MouseEvent) => {
    const el = scrollRef.current;
    if (!dragging.current || !el) return;
    if (e.buttons === 0) {
      // Released outside the window, so no mouseup reached us. Some engines
      // also emit buttons=0 with a clamped position while the cursor is
      // beyond the window edge — those coordinates are bogus, so skip them
      // (the drag survives and resumes when the pointer comes back inside)
      // but only end the gesture for a genuinely in-window event.
      const inside =
        e.clientX > 0 &&
        e.clientY > 0 &&
        e.clientX < window.innerWidth &&
        e.clientY < window.innerHeight;
      if (inside) dragging.current = false;
      return;
    }
    const delta = e.clientX - dragStartX.current;
    // Distance from the fixed drag origin — also tells a real pan apart from
    // the small jitter of a plain click.
    if (Math.abs(delta) > 4) dragged.current = true;
    // Measured from the drag origin on every event, so the row tracks the
    // cursor instead of snapping back toward its starting offset.
    el.scrollLeft = scrollStartX.current - delta;
    const max = el.scrollWidth - el.clientWidth;
    el.scrollLeft = Math.max(0, Math.min(max, el.scrollLeft));
  }, []);

  const stop = useCallback(() => {
    dragging.current = false;
  }, []);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only left-drag pans the row; don't preventDefault other buttons so the
      // browser's middle-click autoscroll keeps working.
      if (e.button !== 0) return;
      const el = scrollRef.current;
      if (!el) return;
      dragging.current = true;
      dragged.current = false;
      dragStartX.current = e.clientX;
      scrollStartX.current = el.scrollLeft;
      // Suppresses text selection and the native image/link drag that would
      // otherwise hijack the gesture; plain clicks are unaffected.
      e.preventDefault();
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", stop);
      window.addEventListener("blur", stop);
    },
    [onMove, stop],
  );

  // A pan that ends on a card must not follow that card's link.
  const suppressDraggedClick = useCallback((e: React.MouseEvent) => {
    if (!dragged.current) return;
    dragged.current = false;
    e.preventDefault();
  }, []);

  // Drop the window listeners if the row unmounts mid-gesture.
  useEffect(
    () => () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("blur", stop);
    },
    [onMove, stop],
  );

  return { scrollRef, onMouseDown, suppressDraggedClick };
}
