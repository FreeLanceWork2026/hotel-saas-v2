"use client";

import { useEffect, useRef } from "react";

/**
 * Keyboard-wedge scanner support (USB / Bluetooth barcode guns).
 *
 * Those scanners "type" the code very fast and finish with Enter. We buffer
 * keystrokes that arrive < `maxGapMs` apart and fire `onScan` when Enter ends a
 * burst of at least `minLength` characters. Normal human typing is slower, so it
 * never triggers. Keys typed inside inputs are ignored unless `captureInInputs`.
 */
export function useScanner(
  onScan: (code: string) => void,
  opts: { enabled?: boolean; minLength?: number; maxGapMs?: number; captureInInputs?: boolean } = {},
) {
  const { enabled = true, minLength = 4, maxGapMs = 50, captureInInputs = false } = opts;
  const cb = useRef(onScan);
  useEffect(() => { cb.current = onScan; }, [onScan]);

  useEffect(() => {
    if (!enabled) return;
    let buffer = "";
    let last = 0;

    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (typing && !captureInInputs) return;

      const now = performance.now();
      if (now - last > maxGapMs) buffer = "";
      last = now;

      if (e.key === "Enter") {
        if (buffer.length >= minLength) {
          e.preventDefault();
          const code = buffer;
          buffer = "";
          cb.current(code);
        }
        buffer = "";
        return;
      }
      if (e.key.length === 1) buffer += e.key;
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [enabled, minLength, maxGapMs, captureInInputs]);
}
