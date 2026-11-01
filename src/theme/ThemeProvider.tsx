// Comprehensive theme provider:
// - Mode: dark (AMOLED true black / glass) / light
// - Surface: glass (frosted acrylic backdrop) / flat (solid, high contrast)
// - Accent: brand primary color or user custom palette
// - Wallpaper: curated presets (Sedela Nebula, Aurora, Cosmos, Sunset, Ocean, Minimal)
//   or custom uploaded user photo stored in IndexedDB, with adjustable dim and blur.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { WALLPAPER_PRESETS, type WallpaperPreset } from "./wallpaperPresets";
import {
  deleteCustomWallpaper,
  loadCustomWallpaper,
  processWallpaperFile,
  saveCustomWallpaper,
} from "./wallpaperStorage";
import { extractDominantColor } from "./extractColor";

export type Mode = "dark" | "light";
export type Surface = "glass" | "flat";
export type WallpaperType = "preset" | "custom" | "none";

export interface ThemePresetOption {
  id: string;
  name: string;
  mode: Mode;
  surface: Surface;
  accent: string;
  wallpaperType: WallpaperType;
  wallpaperPresetId: string;
  bgDim: number;
}

export const THEME_PRESETS: ThemePresetOption[] = [
  {
    id: "sedela-glass",
    name: "Sedela Glass",
    mode: "dark",
    surface: "glass",
    accent: "#e8562a",
    wallpaperType: "preset",
    wallpaperPresetId: "sedela",
    bgDim: 0.55,
  },
  {
    id: "aurora-emerald",
    name: "Aurora Emerald",
    mode: "dark",
    surface: "glass",
    accent: "#10b981",
    wallpaperType: "preset",
    wallpaperPresetId: "aurora",
    bgDim: 0.6,
  },
  {
    id: "cosmic-violet",
    name: "Cosmic Violet",
    mode: "dark",
    surface: "glass",
    accent: "#8b5cf6",
    wallpaperType: "preset",
    wallpaperPresetId: "cosmos",
    bgDim: 0.55,
  },
  {
    id: "sunset-coral",
    name: "Sunset Horizon",
    mode: "dark",
    surface: "glass",
    accent: "#f97316",
    wallpaperType: "preset",
    wallpaperPresetId: "sunset",
    bgDim: 0.55,
  },
  {
    id: "ocean-sapphire",
    name: "Ocean Sapphire",
    mode: "dark",
    surface: "glass",
    accent: "#06b6d4",
    wallpaperType: "preset",
    wallpaperPresetId: "ocean",
    bgDim: 0.6,
  },
  {
    id: "minimal-amoled",
    name: "Pure AMOLED",
    mode: "dark",
    surface: "flat",
    accent: "#e8562a",
    wallpaperType: "none",
    wallpaperPresetId: "sedela",
    bgDim: 0.7,
  },
  {
    id: "frosted-light",
    name: "Frosted Light",
    mode: "light",
    surface: "glass",
    accent: "#2563eb",
    wallpaperType: "preset",
    wallpaperPresetId: "ocean",
    bgDim: 0.25,
  },
];

interface ThemeState {
  mode: Mode;
  surface: Surface;
  accent: string;
  schoolAccent: string | null;
  wallpaperType: WallpaperType;
  wallpaperPresetId: string;
  customWallpaper: string | null;
  activeWallpaperUrl: string | null;
  bgDim: number;
  bgBlur: number;
  setMode: (m: Mode) => void;
  setSurface: (s: Surface) => void;
  setAccent: (hex: string) => void;
  resetAccent: () => void;
  setWallpaperType: (type: WallpaperType) => void;
  setWallpaperPreset: (id: string) => void;
  uploadCustomWallpaper: (file: File) => Promise<string>;
  removeCustomWallpaper: () => Promise<void>;
  extractAndApplyColor: (imageUrl?: string) => Promise<string>;
  setBgDim: (dim: number) => void;
  setBgBlur: (blur: number) => void;
  applyThemePreset: (presetId: string) => void;
  resetToDefaults: () => void;
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
    /* storage can be blocked */
  }
}

function remove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage can be blocked */
  }
}

function defaultSurface(): Surface {
  const wide = typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
  const reduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-transparency: reduce)").matches;
  return wide && !reduced ? "glass" : "flat";
}

function defaultMode(): Mode {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function ThemeProvider({
  accent: schoolAccentProp,
  children,
}: {
  accent?: string | null;
  children: ReactNode;
}) {
  const [mode, setModeState] = useState<Mode>(() => (read("sms.mode") as Mode | null) ?? defaultMode());
  const [surface, setSurfaceState] = useState<Surface>(
    () => (read("sms.surface") as Surface | null) ?? defaultSurface(),
  );

  const [customAccent, setCustomAccent] = useState<string | null>(() => read("sms.accent"));

  const [wallpaperType, setWallpaperTypeState] = useState<WallpaperType>(
    () => (read("sms.wallpaperType") as WallpaperType | null) ?? "preset",
  );
  const [wallpaperPresetId, setWallpaperPresetIdState] = useState<string>(
    () => read("sms.wallpaperPresetId") ?? "sedela",
  );
  const [customWallpaper, setCustomWallpaper] = useState<string | null>(null);

  const [bgDim, setBgDimState] = useState<number>(() => {
    const val = read("sms.bgDim");
    return val ? parseFloat(val) : 0.55;
  });

  const [bgBlur, setBgBlurState] = useState<number>(() => {
    const val = read("sms.bgBlur");
    return val ? parseInt(val, 10) : 0;
  });

  // Effective accent: user custom accent > school's brandPrimary > default '#e8562a'
  const effectiveAccent = customAccent || schoolAccentProp || "#e8562a";

  // Load custom wallpaper from IndexedDB on startup
  useEffect(() => {
    loadCustomWallpaper().then((img) => {
      if (img) setCustomWallpaper(img);
    });
  }, []);

  // Compute active wallpaper URL
  const activeWallpaperUrl = useMemo<string | null>(() => {
    if (wallpaperType === "none") return null;
    if (wallpaperType === "custom" && customWallpaper) return customWallpaper;
    const preset = WALLPAPER_PRESETS.find((p) => p.id === wallpaperPresetId) ?? WALLPAPER_PRESETS[0];
    return preset?.url ?? null;
  }, [wallpaperType, customWallpaper, wallpaperPresetId]);

  // Sync DOM attributes and CSS variables
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", mode === "dark");
    root.classList.toggle("light", mode === "light");
    root.dataset.surface = surface;
    root.dataset.wallpaper = wallpaperType;

    root.style.setProperty("--primary", effectiveAccent);
    root.style.setProperty("--accent", effectiveAccent);
    root.style.setProperty("--ring", effectiveAccent);
    root.style.setProperty("--bg-dim", String(bgDim));
    root.style.setProperty("--bg-blur", `${bgBlur}px`);
  }, [mode, surface, wallpaperType, effectiveAccent, bgDim, bgBlur]);

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    write("sms.mode", m);
  }, []);

  const setSurface = useCallback((s: Surface) => {
    setSurfaceState(s);
    write("sms.surface", s);
  }, []);

  const setAccent = useCallback((hex: string) => {
    setCustomAccent(hex);
    write("sms.accent", hex);
  }, []);

  const resetAccent = useCallback(() => {
    setCustomAccent(null);
    remove("sms.accent");
  }, []);

  const setWallpaperType = useCallback((type: WallpaperType) => {
    setWallpaperTypeState(type);
    write("sms.wallpaperType", type);
  }, []);

  const setWallpaperPreset = useCallback((id: string) => {
    setWallpaperPresetIdState(id);
    write("sms.wallpaperPresetId", id);
    setWallpaperTypeState("preset");
    write("sms.wallpaperType", "preset");
    // Also adjust default dim for that preset if user hasn't heavily customized
    const p = WALLPAPER_PRESETS.find((item) => item.id === id);
    if (p && !read("sms.bgDim")) {
      setBgDimState(p.recommendedDim);
    }
  }, []);

  const uploadCustomWallpaper = useCallback(async (file: File) => {
    const optimizedDataUrl = await processWallpaperFile(file);
    await saveCustomWallpaper(optimizedDataUrl);
    setCustomWallpaper(optimizedDataUrl);
    setWallpaperTypeState("custom");
    write("sms.wallpaperType", "custom");
    return optimizedDataUrl;
  }, []);

  const removeCustomWallpaper = useCallback(async () => {
    await deleteCustomWallpaper();
    setCustomWallpaper(null);
    setWallpaperPresetIdState("sedela");
    setWallpaperTypeState("preset");
    write("sms.wallpaperPresetId", "sedela");
    write("sms.wallpaperType", "preset");
  }, []);

  const extractAndApplyColor = useCallback(
    async (imageUrl?: string) => {
      const target = imageUrl || activeWallpaperUrl;
      if (!target) return effectiveAccent;
      const extracted = await extractDominantColor(target);
      setCustomAccent(extracted);
      write("sms.accent", extracted);
      return extracted;
    },
    [activeWallpaperUrl, effectiveAccent],
  );

  const setBgDim = useCallback((dim: number) => {
    setBgDimState(dim);
    write("sms.bgDim", String(dim));
  }, []);

  const setBgBlur = useCallback((blur: number) => {
    setBgBlurState(blur);
    write("sms.bgBlur", String(blur));
  }, []);

  const applyThemePreset = useCallback((presetId: string) => {
    const preset = THEME_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    setModeState(preset.mode);
    write("sms.mode", preset.mode);

    setSurfaceState(preset.surface);
    write("sms.surface", preset.surface);

    setCustomAccent(preset.accent);
    write("sms.accent", preset.accent);

    setWallpaperTypeState(preset.wallpaperType);
    write("sms.wallpaperType", preset.wallpaperType);

    if (preset.wallpaperPresetId) {
      setWallpaperPresetIdState(preset.wallpaperPresetId);
      write("sms.wallpaperPresetId", preset.wallpaperPresetId);
    }

    setBgDimState(preset.bgDim);
    write("sms.bgDim", String(preset.bgDim));
  }, []);

  const resetToDefaults = useCallback(() => {
    setModeState("dark");
    write("sms.mode", "dark");
    setSurfaceState("glass");
    write("sms.surface", "glass");
    setCustomAccent(null);
    remove("sms.accent");
    setWallpaperTypeState("preset");
    write("sms.wallpaperType", "preset");
    setWallpaperPresetIdState("sedela");
    write("sms.wallpaperPresetId", "sedela");
    setBgDimState(0.55);
    write("sms.bgDim", "0.55");
    setBgBlurState(0);
    write("sms.bgBlur", "0");
  }, []);

  const value = useMemo<ThemeState>(
    () => ({
      mode,
      surface,
      accent: effectiveAccent,
      schoolAccent: schoolAccentProp ?? null,
      wallpaperType,
      wallpaperPresetId,
      customWallpaper,
      activeWallpaperUrl,
      bgDim,
      bgBlur,
      setMode,
      setSurface,
      setAccent,
      resetAccent,
      setWallpaperType,
      setWallpaperPreset,
      uploadCustomWallpaper,
      removeCustomWallpaper,
      extractAndApplyColor,
      setBgDim,
      setBgBlur,
      applyThemePreset,
      resetToDefaults,
    }),
    [
      mode,
      surface,
      effectiveAccent,
      schoolAccentProp,
      wallpaperType,
      wallpaperPresetId,
      customWallpaper,
      activeWallpaperUrl,
      bgDim,
      bgBlur,
      setMode,
      setSurface,
      setAccent,
      resetAccent,
      setWallpaperType,
      setWallpaperPreset,
      uploadCustomWallpaper,
      removeCustomWallpaper,
      extractAndApplyColor,
      setBgDim,
      setBgBlur,
      applyThemePreset,
      resetToDefaults,
    ],
  );

  return (
    <ThemeContext.Provider value={value}>
      {/* Background wallpaper layer: fixed behind all content */}
      {wallpaperType !== "none" && activeWallpaperUrl ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 -z-30 overflow-hidden"
        >
          {/* Wallpaper Image */}
          <div
            className="absolute -inset-4 bg-cover bg-center transition-all duration-300"
            style={{
              backgroundImage: `url(${activeWallpaperUrl})`,
              filter: bgBlur > 0 ? `blur(${bgBlur}px)` : undefined,
            }}
          />
          {/* Contrast & Dim Scrim */}
          <div
            className="absolute inset-0 transition-colors duration-300"
            style={{
              backgroundColor:
                mode === "dark"
                  ? `rgba(0, 0, 0, ${bgDim})`
                  : `rgba(255, 255, 255, ${Math.min(0.85, Math.max(0.15, 1 - bgDim))})`,
            }}
          />
        </div>
      ) : null}
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
