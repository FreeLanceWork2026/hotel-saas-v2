"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";

export type Theme = "dark" | "light" | "system";

interface ThemeContextValue {
  theme: Theme;         // stored preference
  resolved: "dark" | "light"; // what's actually applied
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolved: "dark",
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<"dark" | "light">("dark");

  // Derive the resolved theme from preference + system
  const resolveTheme = useCallback(
    (pref: Theme): "dark" | "light" => {
      if (pref === "system") {
        return window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
      }
      return pref;
    },
    []
  );

  // Apply theme to <html> element
  const applyTheme = useCallback(
    (pref: Theme) => {
      const r = resolveTheme(pref);
      document.documentElement.setAttribute("data-theme", r);
      setResolved(r);
    },
    [resolveTheme]
  );

  // On mount: read saved preference
  useEffect(() => {
    const saved = (localStorage.getItem("addis-theme") as Theme) ?? "system";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after hydration
    setThemeState(saved);
    applyTheme(saved);

    // Listen for OS-level theme changes (for "system" mode)
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const current = (localStorage.getItem("addis-theme") as Theme) ?? "system";
      if (current === "system") applyTheme("system");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [applyTheme]);

  const setTheme = (t: Theme) => {
    localStorage.setItem("addis-theme", t);
    setThemeState(t);
    applyTheme(t);
  };

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
