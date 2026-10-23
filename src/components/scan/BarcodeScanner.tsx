"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { X, Camera, Zap, ZapOff } from "lucide-react";
import styles from "./BarcodeScanner.module.css";

/**
 * Full-screen camera scanner (phones / tablets / laptops).
 *
 * - Uses the native BarcodeDetector where available (Chrome/Android/Edge),
 *   otherwise the `barcode-detector` ponyfill (zxing-wasm) so iOS Safari works too.
 * - `continuous` keeps the camera open for rapid cashier-style scanning:
 *   the same code is debounced for `cooldownMs` so one item isn't added 20 times.
 * - `onScan` may return a short feedback string shown over the viewfinder.
 */

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"] as const;

interface DetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onScan: (code: string) => string | void | Promise<string | void>;
  continuous?: boolean;
  cooldownMs?: number;
  title?: string;
}

/** Short beep without shipping an audio file. */
export function beep(ok = true) {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = ok ? 1040 : 220;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.09 : 0.25));
    osc.onended = () => ctx.close();
  } catch {
    /* audio is optional */
  }
  try {
    navigator.vibrate?.(ok ? 30 : [60, 40, 60]);
  } catch {
    /* vibration is optional */
  }
}

export default function BarcodeScanner({
  open,
  onClose,
  onScan,
  continuous = false,
  cooldownMs = 1500,
  title = "Scan a barcode or QR",
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [torch, setTorch] = useState<boolean | null>(null); // null = unsupported
  const [starting, setStarting] = useState(true);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    trackRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let busy = false;

    (async () => {
      setError(null);
      setFeedback(null);
      setStarting(true);
      setTorch(null);

      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Camera access needs a secure (https) connection and a supported browser.");
        setStarting(false);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        trackRef.current = track;
        const caps = (track.getCapabilities?.() ?? {}) as { torch?: boolean };
        if (caps.torch) setTorch(false);

        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play().catch(() => {});

        let detector: DetectorLike;
        const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => DetectorLike }).BarcodeDetector;
        if (Native) {
          detector = new Native({ formats: [...FORMATS] });
        } else {
          const mod = await import("barcode-detector/ponyfill");
          detector = new mod.BarcodeDetector({ formats: [...FORMATS] }) as unknown as DetectorLike;
        }
        if (cancelled) return;
        setStarting(false);

        const tick = async () => {
          if (cancelled) return;
          if (!busy && video.readyState >= 2) {
            busy = true;
            try {
              const found = await detector.detect(video);
              const code = found[0]?.rawValue?.trim();
              if (code) {
                const now = Date.now();
                const last = lastRef.current;
                if (code !== last.code || now - last.at > cooldownMs) {
                  lastRef.current = { code, at: now };
                  const note = await onScanRef.current(code);
                  if (typeof note === "string") {
                    setFeedback(note);
                    setTimeout(() => setFeedback((f) => (f === note ? null : f)), 1600);
                  }
                  if (!continuous) {
                    onClose();
                    return;
                  }
                }
              }
            } catch {
              /* a frame failed to decode — try the next one */
            } finally {
              busy = false;
            }
          }
          timer = setTimeout(tick, 140);
        };
        tick();
      } catch (e) {
        const name = e instanceof Error ? e.name : "";
        setError(
          name === "NotAllowedError"
            ? "Camera permission was denied. Allow camera access in your browser settings and try again."
            : name === "NotFoundError"
              ? "No camera was found on this device."
              : "Could not start the camera.",
        );
        setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      stop();
    };
  }, [open, continuous, cooldownMs, onClose, stop]);

  const toggleTorch = async () => {
    const track = trackRef.current;
    if (!track) return;
    const next = !torch;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorch(next);
    } catch {
      setTorch(null);
    }
  };

  if (!open) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={title}>
      <div className={styles.header}>
        <span className={styles.title}>
          <Camera size={16} /> {title}
        </span>
        <div className={styles.headerBtns}>
          {torch !== null && (
            <button type="button" className={styles.iconBtn} onClick={toggleTorch} aria-label="Toggle flashlight">
              {torch ? <Zap size={18} /> : <ZapOff size={18} />}
            </button>
          )}
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Close scanner">
            <X size={20} />
          </button>
        </div>
      </div>

      <div className={styles.viewport}>
        <video ref={videoRef} className={styles.video} playsInline muted />
        {!error && (
          <div className={styles.frame} aria-hidden>
            <span className={styles.laser} />
          </div>
        )}
        {starting && !error && <div className={styles.status}>Starting camera…</div>}
        {error && <div className={styles.error}>{error}</div>}
        {feedback && <div className={styles.feedback}>{feedback}</div>}
      </div>

      <p className={styles.hint}>
        {continuous ? "Keep scanning — each item is added to the cart. Tap ✕ when finished." : "Point the camera at the barcode or QR code."}
      </p>
    </div>
  );
}
