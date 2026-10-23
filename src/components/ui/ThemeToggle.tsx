"use client";

import React from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme, type Theme } from "@/context/ThemeContext";
import styles from "./ThemeToggle.module.css";

const OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: "light",  label: "Light",  icon: <Sun size={14} /> },
  { value: "dark",   label: "Dark",   icon: <Moon size={14} /> },
  { value: "system", label: "System", icon: <Monitor size={14} /> },
];

/**
 * Compact light / dark / system switch. Reads and writes the same preference
 * (`neil-theme`) as the storefront navbar, so the choice follows you everywhere.
 * Colours come from CSS variables so it blends into any surface:
 *   --tt-bg, --tt-border, --tt-fg, --tt-active-bg, --tt-active-fg
 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div className={`${styles.toggle} ${className}`} role="radiogroup" aria-label="Theme">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={theme === opt.value}
          aria-label={opt.label}
          title={opt.label}
          className={`${styles.btn} ${theme === opt.value ? styles.active : ""}`}
          onClick={() => setTheme(opt.value)}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );
}
