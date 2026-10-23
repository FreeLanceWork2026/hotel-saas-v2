"use client";

import React, { Suspense, useState, useTransition } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import { Lock, Mail, Loader2, AlertCircle, ChevronRight, Eye, EyeOff } from "lucide-react";
import { login, signInWithGoogle } from "./actions";
import styles from "./Login.module.css";

// ── Google icon SVG (inline — no external dependency) ─────────────────────
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

// ── Inner form ─────────────────────────────────────────────────────────────
function LoginFormInner() {
  const [errorMsg, setErrorMsg]      = useState("");
  const [showPass, setShowPass]      = useState(false);
  const [isPending, startTransition] = useTransition();
  const [googlePending, startGoogle] = useTransition();
  const searchParams = useSearchParams();
  const pathname     = usePathname();

  const localeMatch = pathname.match(/^\/(en|am)\//);
  const locale      = localeMatch ? localeMatch[1] : "en";
  const oauthError  = searchParams.get("oauth_error");
  const redirectTo  = searchParams.get("redirectTo");
  const isLoading   = isPending || googlePending;

  const handleEmailLogin = async (formData: FormData) => {
    setErrorMsg("");
    startTransition(async () => {
      const res = await login(formData);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        window.location.href = redirectTo ?? `/auth/continue?locale=${locale}`;
      }
    });
  };

  const handleGoogle = () => {
    setErrorMsg("");
    startGoogle(async () => {
      const res = await signInWithGoogle(redirectTo ?? undefined, locale);
      if ("error" in res) {
        setErrorMsg(res.error ?? "Google sign-in failed.");
      } else if (res.url) {
        window.location.href = res.url;
      }
    });
  };

  return (
    <div className={styles.page}>
      <div className={styles.glow} />

      <div className={styles.card}>
        {/* Logo */}
        <div className={styles.logoArea}>
          <div className={styles.logoIcon}>🍽️</div>
          <div>
            <div className={styles.logoName}>Entoto Haven</div>
            <div className={styles.logoSub}>Account</div>
          </div>
        </div>

        <div className={styles.divider} />

        <div className={styles.heading}>
          <h1 className={styles.title}>Welcome back</h1>
          <p className={styles.subtitle}>Sign in to continue</p>
        </div>

        {/* OAuth callback error */}
        {oauthError && (
          <div className={styles.errorAlert}>
            <AlertCircle size={16} className={styles.errorIcon} />
            <span>Google sign-in failed: {decodeURIComponent(oauthError)}</span>
          </div>
        )}

        {/* Form / action error */}
        {errorMsg && (
          <div className={styles.errorAlert}>
            <AlertCircle size={16} className={styles.errorIcon} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* ── Google OAuth button ── */}
        <button
          type="button"
          className={styles.googleBtn}
          onClick={handleGoogle}
          disabled={isLoading}
        >
          {googlePending
            ? <Loader2 size={16} className={styles.spinner} />
            : <GoogleIcon />}
          {googlePending ? "Redirecting to Google…" : "Continue with Google"}
        </button>

        {/* ── Divider ── */}
        <div className={styles.orDivider}>
          <span className={styles.orLine} />
          <span className={styles.orText}>or sign in with email</span>
          <span className={styles.orLine} />
        </div>

        {/* ── Email / password form ── */}
        <form action={handleEmailLogin} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">Email Address</label>
            <div className={styles.inputWrap}>
              <Mail size={16} className={styles.inputIcon} />
              <input
                className={styles.input}
                type="email"
                id="email"
                name="email"
                required
                placeholder="admin@addisbites.com"
                autoComplete="email"
                disabled={isLoading}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">Password</label>
            <div className={styles.inputWrap}>
              <Lock size={16} className={styles.inputIcon} />
              <input
                className={`${styles.input} ${styles.inputWithEye}`}
                type={showPass ? "text" : "password"}
                id="password"
                name="password"
                required
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={isLoading}
              />
              <button
                type="button"
                className={styles.eyeBtn}
                onClick={() => setShowPass((v) => !v)}
                tabIndex={-1}
                aria-label={showPass ? "Hide password" : "Show password"}
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button type="submit" className={styles.submitBtn} disabled={isLoading}>
            {isPending ? (
              <><Loader2 size={18} className={styles.spinner} /> Signing in...</>
            ) : (
              <>Sign In <ChevronRight size={16} /></>
            )}
          </button>
        </form>

        {/* Loading overlay */}
        {isLoading && (
          <div className={styles.loadingOverlay}>
            <div className={styles.loadingDots}>
              <span /><span /><span />
            </div>
            <p className={styles.loadingText}>
              {googlePending ? "Opening Google…" : "Signing in..."}
            </p>
          </div>
        )}
      </div>

      <p className={styles.footerNote}>Entoto Haven · Secure Access Only</p>
    </div>
  );
}

// ── Outer export with Suspense boundary (required for useSearchParams) ─────
export default function LoginForm() {
  return (
    <Suspense
      fallback={
        <div style={{
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0806",
        }}>
          <Loader2 size={32} style={{ color: "#c8891e", animation: "spin 0.8s linear infinite" }} />
        </div>
      }
    >
      <LoginFormInner />
    </Suspense>
  );
}