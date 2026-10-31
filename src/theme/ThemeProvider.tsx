// Two independent choices: mode (dark / light) and surface (glass / flat).
// Glass is the Sedela look and costs GPU on cheap phones, so it defaults to
// flat on small screens and when the OS asks for reduced transparency.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Mode = "dark" | "light";
export type Surface = "glass" | "flat";

interface ThemeState {
  mode: Mode;
  surface: Surface;
  setMode: (m: Mode) => void;
  setSurface: (s: Surface) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage can be blocked; the choice just won't persist */
  }
}

function defaultSurface(): Surface {
  const wide = window.matchMedia("(min-width: 1024px)").matches;
  const reduced = window.matchMedia("(prefers-reduced-transparency: reduce)").matches;
  return wide && !reduced ? "glass" : "flat";
}

function defaultMode(): Mode {
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function ThemeProvider({ accent, children }: { accent?: string | null; children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(() => (read("sms.mode") as Mode | null) ?? defaultMode());
  const [surface, setSurfaceState] = useState<Surface>(
    () => (read("sms.surface") as Surface | null) ?? defaultSurface(),
  );

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", mode === "dark");
    root.classList.toggle("light", mode === "light");
    root.dataset.surface = surface;
  }, [mode, surface]);

  // Per-school brand colour (white-labelling starts here).
  useEffect(() => {
    const root = document.documentElement;
    if (accent) {
      root.style.setProperty("--primary", accent);
      root.style.setProperty("--accent", accent);
      root.style.setProperty("--ring", accent);
    } else {
      root.style.removeProperty("--primary");
      root.style.removeProperty("--accent");
      root.style.removeProperty("--ring");
    }
  }, [accent]);

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    write("sms.mode", m);
  }, []);
  const setSurface = useCallback((s: Surface) => {
    setSurfaceState(s);
    write("sms.surface", s);
  }, []);

  const value = useMemo(() => ({ mode, surface, setMode, setSurface }), [mode, surface, setMode, setSurface]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
