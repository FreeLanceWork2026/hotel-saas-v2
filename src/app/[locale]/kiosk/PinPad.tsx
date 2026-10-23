"use client";

import React, { useState, useTransition, useCallback } from "react";
import { Loader2, Hash } from "lucide-react";
import styles from "./PinPad.module.css";
import { verifyEmployeePin } from "./pinActions";
import { signInWithGoogle } from "../login/actions";

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
}

interface PinPadProps {
  onUnlock: (employee: Employee) => void;
  locale?: string;
  /** Signed in with an account that has no kiosk access */
  deniedAccount?: { email: string | null; name: string } | null;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
      <path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.548 0 9s.347 2.825.957 4.039l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

export default function PinPad({ onUnlock, locale = "en", deniedAccount }: PinPadProps) {
  const [tab, setTab]              = useState<"pin" | "google">(deniedAccount ? "google" : "pin");
  const [pin, setPin]         = useState("");
  const [errorMsg, setError]  = useState("");
  const [isPending, startTransition] = useTransition();
  const [googlePending, startGoogle] = useTransition();

  const handleGoogle = () => {
    setError("");
    startGoogle(async () => {
      const res = await signInWithGoogle(`/${locale}/kiosk`, locale);
      if ("error" in res) setError(res.error ?? "Google sign-in failed.");
      else if (res.url) window.location.href = res.url;
    });
  };

  const handleKey = useCallback((key: string) => {
    if (isPending) return;
    setError("");

    if (key === "DEL") {
      setPin((p) => p.slice(0, -1));
      return;
    }

    if (pin.length >= 4) return;
    const next = pin + key;
    setPin(next);

    // Auto-submit when 4 digits entered
    if (next.length === 4) {
      startTransition(async () => {
        const res = await verifyEmployeePin(next);
        if (res.success && res.employee) {
          setPin("");
          onUnlock(res.employee);
        } else {
          setPin("");
          setError(res.error ?? "Incorrect PIN.");
        }
      });
    }
  }, [pin, isPending, onUnlock]);

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <div className={styles.logo}>🍽️</div>
        <div className={styles.title}>Entoto Haven Kiosk</div>

        {/* Sign-in method tabs */}
        <div className={styles.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "pin"}
            className={`${styles.tab} ${tab === "pin" ? styles.tabActive : ""}`}
            onClick={() => { setTab("pin"); setError(""); }}
          >
            <Hash size={14} /> PIN
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "google"}
            className={`${styles.tab} ${tab === "google" ? styles.tabActive : ""}`}
            onClick={() => { setTab("google"); setError(""); }}
          >
            <GoogleIcon /> Google
          </button>
        </div>

        {tab === "pin" ? (
          <>
            <div className={styles.subtitle}>Enter your 4-digit employee PIN</div>

            {/* PIN dots indicator */}
            <div className={styles.dots}>
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`${styles.dot} ${i < pin.length ? styles.dotFilled : ""}`}
                />
              ))}
            </div>

            {/* Error message */}
            <div className={styles.error} key={errorMsg}>
              {errorMsg}
            </div>

            {/* Numpad */}
            <div className={styles.numpad}>
              {KEYS.map((k) => (
                <button
                  key={k}
                  className={styles.numBtn}
                  onClick={() => handleKey(k)}
                  disabled={isPending}
                >
                  {k}
                </button>
              ))}

              {/* Bottom row: [0] [DEL] */}
              <button
                className={`${styles.numBtn} ${styles.numBtnWide}`}
                onClick={() => handleKey("0")}
                disabled={isPending}
              >
                0
              </button>
              <button
                className={`${styles.numBtn} ${styles.numBtnDelete}`}
                onClick={() => handleKey("DEL")}
                disabled={isPending || pin.length === 0}
              >
                ⌫
              </button>
            </div>

            {/* Loading state */}
            {isPending && (
              <div className={styles.submitBtnLoading}>
                <Loader2 size={18} style={{ animation: "spin 0.8s linear infinite", color: "#ea580c" }} />
                <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.875rem" }}>Verifying…</span>
              </div>
            )}
          </>
        ) : (
          <>
            <div className={styles.subtitle}>Sign in with your staff Google account</div>

            {deniedAccount && (
              <div className={styles.notice}>
                <strong>{deniedAccount.email ?? deniedAccount.name}</strong> doesn&apos;t have kiosk
                access yet. Ask an admin to set your role to <em>Employee</em>, or use another account.
              </div>
            )}

            <div className={styles.error} key={errorMsg}>{errorMsg}</div>

            <button
              type="button"
              className={styles.googleBtn}
              onClick={handleGoogle}
              disabled={googlePending}
            >
              {googlePending ? <Loader2 size={16} style={{ animation: "spin 0.8s linear infinite" }} /> : <GoogleIcon />}
              {googlePending ? "Opening Google…" : "Continue with Google"}
            </button>

            <button type="button" className={styles.linkBtn} onClick={() => setTab("pin")}>
              ← Use PIN instead
            </button>
          </>
        )}
      </div>
    </div>
  );
}
