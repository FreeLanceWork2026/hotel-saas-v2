"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import {
  LayoutDashboard,
  Store,
  UserRound,
  LogOut,
  LogIn,
  Loader2,
} from "lucide-react";
import { logout } from "@/app/[locale]/login/actions";
import styles from "./UserMenu.module.css";
import { useFeature } from "@/context/FeaturesContext";

type Role = "admin" | "employee" | "kiosk_operator" | "customer";

interface Me {
  id: string;
  email: string | null;
  name: string;
  avatar: string | null;
  role: Role;
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function UserMenu() {
  const t = useTranslations("nav");
  const hasKiosk = useFeature("kiosk_pos");
  const pathname = usePathname();

  const [me, setMe] = useState<Me | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      const json = (await res.json()) as { user: Me | null };
      setMe(json.user);
      setImgFailed(false);
    } catch {
      setMe(null);
    } finally {
      setLoaded(true);
    }
  }, []);

  // Fetch on mount, on route change, and when the tab regains focus
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches the signed-in user from the server
    refresh();
  }, [refresh, pathname]);

  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  // Close on outside click / Escape
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      window.location.href = "/";
    }
  };

  // Still checking session — reserve space so the navbar doesn't jump
  if (!loaded) return <span className={styles.skeleton} aria-hidden="true" />;

  // Signed out
  if (!me) {
    return (
      <Link href="/login" className={styles.signIn} id="nav-sign-in">
        <LogIn size={16} />
        <span>{t("signIn")}</span>
      </Link>
    );
  }

  const isStaff = me.role === "employee" || me.role === "kiosk_operator";
  const roleLabel =
    me.role === "admin"
      ? t("roleAdmin")
      : isStaff
        ? t("roleEmployee")
        : t("roleCustomer");

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        id="nav-profile-button"
        className={styles.avatarBtn}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={me.name}
      >
        {me.avatar && !imgFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={me.avatar}
            alt=""
            className={styles.avatarImg}
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span className={styles.avatarInitials}>{initialsOf(me.name)}</span>
        )}
        <span className={styles.onlineDot} aria-hidden="true" />
      </button>

      {open && (
        <div className={styles.menu} role="menu">
          <div className={styles.header}>
            <div className={styles.headerAvatar}>
              {me.avatar && !imgFailed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={me.avatar}
                  alt=""
                  className={styles.avatarImg}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className={styles.avatarInitials}>{initialsOf(me.name)}</span>
              )}
            </div>
            <div className={styles.headerText}>
              <div className={styles.name}>{me.name}</div>
              {me.email && <div className={styles.email}>{me.email}</div>}
              <span className={`${styles.roleBadge} ${styles[`role_${me.role}`] ?? ""}`}>
                {roleLabel}
              </span>
            </div>
          </div>

          <div className={styles.divider} />

          {me.role === "admin" && (
            <>
              <Link
                href="/admin"
                className={styles.item}
                role="menuitem"
                onClick={() => setOpen(false)}
                id="nav-menu-dashboard"
              >
                <LayoutDashboard size={16} /> {t("dashboard")}
              </Link>
              {hasKiosk && <Link
                href="/kiosk"
                className={styles.item}
                role="menuitem"
                onClick={() => setOpen(false)}
                id="nav-menu-kiosk"
              >
                <Store size={16} /> {t("kiosk")}
              </Link>}
            </>
          )}

          {isStaff && hasKiosk && (
            <Link
              href="/kiosk"
              className={styles.item}
              role="menuitem"
              onClick={() => setOpen(false)}
              id="nav-menu-kiosk"
            >
              <Store size={16} /> {t("kiosk")}
            </Link>
          )}

          {me.role === "customer" && (
            <Link
              href="/account"
              className={styles.item}
              role="menuitem"
              onClick={() => setOpen(false)}
              id="nav-menu-account"
            >
              <UserRound size={16} /> {t("myAccount")}
            </Link>
          )}

          <div className={styles.divider} />

          <button
            className={`${styles.item} ${styles.danger}`}
            role="menuitem"
            onClick={handleSignOut}
            disabled={signingOut}
            id="nav-menu-sign-out"
          >
            {signingOut ? <Loader2 size={16} className={styles.spin} /> : <LogOut size={16} />}
            {t("signOut")}
          </button>
        </div>
      )}
    </div>
  );
}
