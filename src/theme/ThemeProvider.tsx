// Comprehensive theme provider with per-user account binding:
// - All preferences (mode, surface, accent, wallpaper, dim, blur) are scoped
//   to the signed-in user's account ID.
// - Settings are saved locally in user-scoped storage (zero UI latency) and
//   synchronized to the user's profile in Supabase via set_my_theme RPC.
// - Custom uploaded wallpapers are stored in IndexedDB under custom_wallpaper_<userId>.
// - Signing out or switching users immediately switches to that account's theme,
//   with unauthenticated screens defaulting safely to the school brand theme.
// - By default, there is no background wallpaper image ("none").

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { WALLPAPER_PRESETS } from "./wallpaperPresets";
import {
  deleteCustomWallpaper,
  loadCustomWallpaper,
  processWallpaperFile,
  saveCustomWallpaper,
} from "./wallpaperStorage";
import { extractDominantColor } from "./extractColor";
import { saveUserTheme } from "../lib/data/theme";
import type { UserThemeConfig } from "../lib/auth/AuthProvider";

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
    id: "minimal-amoled",
    name: "Default Clean (No Wallpaper)",
    mode: "dark",
    surface: "glass",
    accent: "#e8562a",
    wallpaperType: "none",
    wallpaperPresetId: "sedela",
    bgDim: 0.7,
  },
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
    id: "frosted-light",
    name: "Frosted Light",
    mode: "light",
    surface: "glass",
    accent: "#2563eb",
    wallpaperType: "none",
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
  userId: string | null;
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

function userKey(key: string, userId?: string | null): string {
  return userId ? `sms.theme.${userId}.${key}` : `sms.theme.guest.${key}`;
}

function read(key: string, userId?: string | null): string | null {
  try {
    return localStorage.getItem(userKey(key, userId));
  } catch {
    return null;
  }
}

function write(key: string, value: string, userId?: string | null) {
  try {
    localStorage.setItem(userKey(key, userId), value);
  } catch {
    /* storage can be blocked */
  }
}

function removeKey(key: string, userId?: string | null) {
  try {
    localStorage.removeItem(userKey(key, userId));
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
  userId = null,
  cloudTheme = null,
  accent: schoolAccentProp,
  children,
}: {
  userId?: string | null;
  cloudTheme?: UserThemeConfig | null;
  accent?: string | null;
  children: ReactNode;
}) {
  // Resolve initial values based on userKey or cloudTheme
  const resolveMode = (uid: string | null, cloud: UserThemeConfig | null): Mode => {
    const saved = read("mode", uid) as Mode | null;
    return saved || cloud?.mode || defaultMode();
  };

  const resolveSurface = (uid: string | null, cloud: UserThemeConfig | null): Surface => {
    const saved = read("surface", uid) as Surface | null;
    return saved || cloud?.surface || defaultSurface();
  };

  const resolveAccent = (uid: string | null, cloud: UserThemeConfig | null): string | null => {
    return read("accent", uid) || cloud?.accent || null;
  };

  const resolveWallpaperType = (uid: string | null, cloud: UserThemeConfig | null): WallpaperType => {
    const saved = read("wallpaperType", uid) as WallpaperType | null;
    return saved || cloud?.wallpaperType || "none";
  };

  const resolveWallpaperPresetId = (uid: string | null, cloud: UserThemeConfig | null): string => {
    return read("wallpaperPresetId", uid) || cloud?.wallpaperPresetId || "sedela";
  };

  const resolveBgDim = (uid: string | null, cloud: UserThemeConfig | null): number => {
    const saved = read("bgDim", uid);
    if (saved) return parseFloat(saved);
    if (cloud?.bgDim !== undefined) return cloud.bgDim;
    return 0.55;
  };

  const resolveBgBlur = (uid: string | null, cloud: UserThemeConfig | null): number => {
    const saved = read("bgBlur", uid);
    if (saved) return parseInt(saved, 10);
    if (cloud?.bgBlur !== undefined) return cloud.bgBlur;
    return 0;
  };

  const [mode, setModeState] = useState<Mode>(() => resolveMode(userId, cloudTheme));
  const [surface, setSurfaceState] = useState<Surface>(() => resolveSurface(userId, cloudTheme));
  const [customAccent, setCustomAccent] = useState<string | null>(() => resolveAccent(userId, cloudTheme));
  const [wallpaperType, setWallpaperTypeState] = useState<WallpaperType>(() => resolveWallpaperType(userId, cloudTheme));
  const [wallpaperPresetId, setWallpaperPresetIdState] = useState<string>(() => resolveWallpaperPresetId(userId, cloudTheme));
  const [customWallpaper, setCustomWallpaper] = useState<string | null>(null);
  const [bgDim, setBgDimState] = useState<number>(() => resolveBgDim(userId, cloudTheme));
  const [bgBlur, setBgBlurState] = useState<number>(() => resolveBgBlur(userId, cloudTheme));

  // Switch or reload user settings whenever userId changes or cloudTheme updates
  useEffect(() => {
    setModeState(resolveMode(userId, cloudTheme));
    setSurfaceState(resolveSurface(userId, cloudTheme));
    setCustomAccent(resolveAccent(userId, cloudTheme));
    setWallpaperTypeState(resolveWallpaperType(userId, cloudTheme));
    setWallpaperPresetIdState(resolveWallpaperPresetId(userId, cloudTheme));
    setBgDimState(resolveBgDim(userId, cloudTheme));
    setBgBlurState(resolveBgBlur(userId, cloudTheme));

    if (userId) {
      loadCustomWallpaper(userId).then((img) => setCustomWallpaper(img));
    } else {
      setCustomWallpaper(null);
    }
  }, [userId, cloudTheme]);

  // Debounced cloud sync helper
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueCloudSync = useCallback(
    (cfg: UserThemeConfig) => {
      if (!userId) return;
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = setTimeout(() => {
        void saveUserTheme(cfg);
      }, 350);
    },
    [userId],
  );

  const effectiveAccent = customAccent || schoolAccentProp || "#e8562a";

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

  const setMode = useCallback(
    (m: Mode) => {
      setModeState(m);
      write("mode", m, userId);
      queueCloudSync({
        mode: m,
        surface,
        accent: customAccent,
        wallpaperType,
        wallpaperPresetId,
        bgDim,
        bgBlur,
      });
    },
    [userId, surface, customAccent, wallpaperType, wallpaperPresetId, bgDim, bgBlur, queueCloudSync],
  );

  const setSurface = useCallback(
    (s: Surface) => {
      setSurfaceState(s);
      write("surface", s, userId);
      queueCloudSync({
        mode,
        surface: s,
        accent: customAccent,
        wallpaperType,
        wallpaperPresetId,
        bgDim,
        bgBlur,
      });
    },
    [userId, mode, customAccent, wallpaperType, wallpaperPresetId, bgDim, bgBlur, queueCloudSync],
  );

  const setAccent = useCallback(
    (hex: string) => {
      setCustomAccent(hex);
      write("accent", hex, userId);
      queueCloudSync({
        mode,
        surface,
        accent: hex,
        wallpaperType,
        wallpaperPresetId,
        bgDim,
        bgBlur,
      });
    },
    [userId, mode, surface, wallpaperType, wallpaperPresetId, bgDim, bgBlur, queueCloudSync],
  );

  const resetAccent = useCallback(() => {
    setCustomAccent(null);
    removeKey("accent", userId);
    queueCloudSync({
      mode,
      surface,
      accent: null,
      wallpaperType,
      wallpaperPresetId,
      bgDim,
      bgBlur,
    });
  }, [userId, mode, surface, wallpaperType, wallpaperPresetId, bgDim, bgBlur, queueCloudSync]);

  const setWallpaperType = useCallback(
    (type: WallpaperType) => {
      setWallpaperTypeState(type);
      write("wallpaperType", type, userId);
      queueCloudSync({
        mode,
        surface,
        accent: customAccent,
        wallpaperType: type,
        wallpaperPresetId,
        bgDim,
        bgBlur,
      });
    },
    [userId, mode, surface, customAccent, wallpaperPresetId, bgDim, bgBlur, queueCloudSync],
  );

  const setWallpaperPreset = useCallback(
    (id: string) => {
      setWallpaperPresetIdState(id);
      write("wallpaperPresetId", id, userId);
      setWallpaperTypeState("preset");
      write("wallpaperType", "preset", userId);

      const p = WALLPAPER_PRESETS.find((item) => item.id === id);
      const newDim = p && !read("bgDim", userId) ? p.recommendedDim : bgDim;
      if (newDim !== bgDim) {
        setBgDimState(newDim);
        write("bgDim", String(newDim), userId);
      }

      queueCloudSync({
        mode,
        surface,
        accent: customAccent,
        wallpaperType: "preset",
        wallpaperPresetId: id,
        bgDim: newDim,
        bgBlur,
      });
    },
    [userId, mode, surface, customAccent, bgDim, bgBlur, queueCloudSync],
  );

  const uploadCustomWallpaper = useCallback(
    async (file: File) => {
      const optimizedDataUrl = await processWallpaperFile(file);
      await saveCustomWallpaper(optimizedDataUrl, userId);
      setCustomWallpaper(optimizedDataUrl);
      setWallpaperTypeState("custom");
      write("wallpaperType", "custom", userId);

      queueCloudSync({
        mode,
        surface,
        accent: customAccent,
        wallpaperType: "custom",
        wallpaperPresetId,
        bgDim,
        bgBlur,
      });
      return optimizedDataUrl;
    },
    [userId, mode, surface, customAccent, wallpaperPresetId, bgDim, bgBlur, queueCloudSync],
  );

  const removeCustomWallpaper = useCallback(async () => {
    await deleteCustomWallpaper(userId);
    setCustomWallpaper(null);
    setWallpaperTypeState("none");
    write("wallpaperType", "none", userId);

    queueCloudSync({
      mode,
      surface,
      accent: customAccent,
      wallpaperType: "none",
      wallpaperPresetId,
      bgDim,
      bgBlur,
    });
  }, [userId, mode, surface, customAccent, wallpaperPresetId, bgDim, bgBlur, queueCloudSync]);

  const extractAndApplyColor = useCallback(
    async (imageUrl?: string) => {
      const target = imageUrl || activeWallpaperUrl;
      if (!target) return effectiveAccent;
      const extracted = await extractDominantColor(target);
      setCustomAccent(extracted);
      write("accent", extracted, userId);
      queueCloudSync({
        mode,
        surface,
        accent: extracted,
        wallpaperType,
        wallpaperPresetId,
        bgDim,
        bgBlur,
      });
      return extracted;
    },
    [activeWallpaperUrl, effectiveAccent, userId, mode, surface, wallpaperType, wallpaperPresetId, bgDim, bgBlur, queueCloudSync],
  );

  const setBgDim = useCallback(
    (dim: number) => {
      setBgDimState(dim);
      write("bgDim", String(dim), userId);
      queueCloudSync({
        mode,
        surface,
        accent: customAccent,
        wallpaperType,
        wallpaperPresetId,
        bgDim: dim,
        bgBlur,
      });
    },
    [userId, mode, surface, customAccent, wallpaperType, wallpaperPresetId, bgBlur, queueCloudSync],
  );

  const setBgBlur = useCallback(
    (blur: number) => {
      setBgBlurState(blur);
      write("bgBlur", String(blur), userId);
      queueCloudSync({
        mode,
        surface,
        accent: customAccent,
        wallpaperType,
        wallpaperPresetId,
        bgDim,
        bgBlur: blur,
      });
    },
    [userId, mode, surface, customAccent, wallpaperType, wallpaperPresetId, bgDim, queueCloudSync],
  );

  const applyThemePreset = useCallback(
    (presetId: string) => {
      const preset = THEME_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;

      setModeState(preset.mode);
      write("mode", preset.mode, userId);

      setSurfaceState(preset.surface);
      write("surface", preset.surface, userId);

      setCustomAccent(preset.accent);
      write("accent", preset.accent, userId);

      setWallpaperTypeState(preset.wallpaperType);
      write("wallpaperType", preset.wallpaperType, userId);

      if (preset.wallpaperPresetId) {
        setWallpaperPresetIdState(preset.wallpaperPresetId);
        write("wallpaperPresetId", preset.wallpaperPresetId, userId);
      }

      setBgDimState(preset.bgDim);
      write("bgDim", String(preset.bgDim), userId);

      queueCloudSync({
        mode: preset.mode,
        surface: preset.surface,
        accent: preset.accent,
        wallpaperType: preset.wallpaperType,
        wallpaperPresetId: preset.wallpaperPresetId,
        bgDim: preset.bgDim,
        bgBlur,
      });
    },
    [userId, bgBlur, queueCloudSync],
  );

  const resetToDefaults = useCallback(() => {
    setModeState("dark");
    write("mode", "dark", userId);
    setSurfaceState("glass");
    write("surface", "glass", userId);
    setCustomAccent(null);
    removeKey("accent", userId);
    setWallpaperTypeState("none");
    write("wallpaperType", "none", userId);
    setWallpaperPresetIdState("sedela");
    write("wallpaperPresetId", "sedela", userId);
    setBgDimState(0.55);
    write("bgDim", "0.55", userId);
    setBgBlurState(0);
    write("bgBlur", "0", userId);

    queueCloudSync({
      mode: "dark",
      surface: "glass",
      accent: null,
      wallpaperType: "none",
      wallpaperPresetId: "sedela",
      bgDim: 0.55,
      bgBlur: 0,
    });
  }, [userId, queueCloudSync]);

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
      userId,
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
      userId,
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
      {/* Background wallpaper layer: fixed behind all content only when explicitly enabled */}
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
