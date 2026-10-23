"use client";

import { useTranslations, useLocale } from "next-intl";
import { usePathname, useRouter, Link } from "@/i18n/navigation";
import { useState, useEffect, useRef } from "react";
import { ShoppingCart, Menu, X, Globe, Sun, Moon, Monitor } from "lucide-react";
import { useTheme, type Theme } from "@/context/ThemeContext";
import { useCart } from "@/context/CartContext";
import { useFeature } from "@/context/FeaturesContext";
import styles from "./Navbar.module.css";
import UserMenu from "./UserMenu";

const THEME_OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: "light",  label: "Light",  icon: <Sun size={15} /> },
  { value: "dark",   label: "Dark",   icon: <Moon size={15} /> },
  { value: "system", label: "System", icon: <Monitor size={15} /> },
];

export default function Navbar() {
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { count: cartCount } = useCart();
  const canOrder = useFeature("online_ordering");
  const hasAmharic = useFeature("amharic");
  const hasBooking = useFeature("booking");

  const [isScrolled, setIsScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  const themeRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) setThemeOpen(false);
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const switchLocale = (next: string) => {
    router.replace(pathname, { locale: next });
    setLangOpen(false);
  };

  const themeIcon = theme === "light" ? <Sun size={17} /> : theme === "dark" ? <Moon size={17} /> : <Monitor size={17} />;

  const navLinks = [
    { href: "/", label: t("home") },
    ...(hasBooking ? [{ href: "/rooms", label: t("rooms") }] : []),
    { href: "/shop", label: t("shop") },
    { href: "/how-its-made", label: t("howItsMade") },
  ];

  return (
    <header className={`${styles.navbar} ${isScrolled ? styles.scrolled : ""}`}>
      <div className={`container ${styles.inner}`}>
        {/* Logo */}
        <Link href="/" className={styles.logo}>
          <span className={styles.logoIcon}>&#x1F35B;</span>
          <span className={styles.logoText}>
            {tCommon("appName")}
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className={styles.links} aria-label="Main navigation">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`${styles.link} ${pathname === link.href ? styles.active : ""}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right Actions */}
        <div className={styles.actions}>

          {/* ── Language Dropdown ── */}
          {hasAmharic && <div className={styles.dropdown} ref={langRef}>
            <button
              className={styles.iconBtn}
              onClick={() => { setLangOpen(!langOpen); setThemeOpen(false); }}
              aria-label={t("language")}
            >
              <Globe size={17} />
              <span className={styles.badge}>{locale === "en" ? "EN" : "አማ"}</span>
            </button>
            {langOpen && (
              <div className={styles.dropMenu}>
                <button
                  className={`${styles.dropItem} ${locale === "en" ? styles.dropItemActive : ""}`}
                  onClick={() => switchLocale("en")}
                >
                  <span>🇬🇧</span> English
                </button>
                <button
                  className={`${styles.dropItem} ${locale === "am" ? styles.dropItemActive : ""}`}
                  onClick={() => switchLocale("am")}
                >
                  <span>🇪🇹</span> አማርኛ
                </button>
              </div>
            )}
          </div>}

          {/* ── Theme Dropdown ── */}
          <div className={styles.dropdown} ref={themeRef}>
            <button
              className={styles.iconBtn}
              onClick={() => { setThemeOpen(!themeOpen); setLangOpen(false); }}
              aria-label="Theme"
            >
              {themeIcon}
            </button>
            {themeOpen && (
              <div className={styles.dropMenu}>
                {THEME_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className={`${styles.dropItem} ${theme === opt.value ? styles.dropItemActive : ""}`}
                    onClick={() => { setTheme(opt.value); setThemeOpen(false); }}
                  >
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Cart */}
          {canOrder && (
            <Link href="/cart" className={styles.cartBtn} aria-label={t("cart")}>
              <ShoppingCart size={20} />
              {cartCount > 0 && (
                <span className={styles.cartBadge}>{cartCount}</span>
              )}
            </Link>
          )}

          {/* Profile / Sign in */}
          <UserMenu />

          {/* Mobile menu toggle */}
          <button
            className={`${styles.iconBtn} ${styles.menuToggle}`}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className={styles.mobileMenu} onClick={() => setMenuOpen(false)}>
          <nav>
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} className={styles.mobileLink}>
                {link.label}
              </Link>
            ))}
            <a
              href="https://wa.me/251912345678"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.mobileLink}
            >
              {tCommon("whatsapp")}
            </a>
          </nav>

          {/* Mobile theme + language row */}
          <div className={styles.mobileControls}>
            {hasAmharic && <div className={styles.mobileControlGroup}>
              <span className={styles.mobileControlLabel}>Language</span>
              <div className={styles.mobileControlBtns}>
                <button onClick={() => switchLocale("en")} className={`${styles.mobilePill} ${locale === "en" ? styles.mobilePillActive : ""}`}>🇬🇧 EN</button>
                <button onClick={() => switchLocale("am")} className={`${styles.mobilePill} ${locale === "am" ? styles.mobilePillActive : ""}`}>🇪🇹 አማ</button>
              </div>
            </div>}
            <div className={styles.mobileControlGroup}>
              <span className={styles.mobileControlLabel}>Theme</span>
              <div className={styles.mobileControlBtns}>
                {THEME_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setTheme(opt.value)}
                    className={`${styles.mobilePill} ${theme === opt.value ? styles.mobilePillActive : ""}`}
                  >
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
