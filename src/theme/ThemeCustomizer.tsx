import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  Check,
  Image as ImageIcon,
  Moon,
  Palette,
  RotateCcw,
  Sliders,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import {
  THEME_PRESETS,
  useTheme,
  type Mode,
  type Surface,
  type WallpaperType,
} from "./ThemeProvider";
import { ACCENT_PALETTE, WALLPAPER_PRESETS } from "./wallpaperPresets";
import { Button } from "../app/components/ui/button";
import { cn } from "../app/components/ui/utils";

export function ThemeCustomizerModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    mode,
    surface,
    accent,
    wallpaperType,
    wallpaperPresetId,
    customWallpaper,
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
  } = useTheme();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<"presets" | "colors" | "wallpaper">("presets");
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [matchedToast, setMatchedToast] = useState<string | null>(null);

  // Close on Escape or click outside
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  async function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await uploadCustomWallpaper(file);
      // Auto-extract color from the uploaded photo
      setExtracting(true);
      const color = await extractAndApplyColor(dataUrl);
      setMatchedToast(`Matched accent to ${color}`);
      setTimeout(() => setMatchedToast(null), 3000);
    } catch {
      /* ignore */
    } finally {
      setUploading(false);
      setExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleExtractClick() {
    setExtracting(true);
    try {
      const color = await extractAndApplyColor();
      setMatchedToast(`Accent updated to ${color}`);
      setTimeout(() => setMatchedToast(null), 3000);
    } finally {
      setExtracting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="theme-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" />

      {/* Modal Surface */}
      <div
        ref={modalRef}
        className="surface relative z-10 flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div
              className="grid size-9 place-items-center rounded-xl text-white shadow-sm"
              style={{ backgroundColor: "var(--primary)" }}
            >
              <Palette className="size-4" aria-hidden />
            </div>
            <div>
              <h2 id="theme-modal-title" className="text-base font-semibold sm:text-lg">
                Theme & Appearance
              </h2>
              <p className="text-xs text-muted-foreground">
                Customize palette, surface translucency, and wallpapers
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-border bg-foreground/[0.02] px-4 pt-2 sm:px-6">
          <button
            type="button"
            onClick={() => setActiveTab("presets")}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors sm:text-sm",
              activeTab === "presets"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Sparkles className="size-3.5" />
            Curated Presets
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("colors")}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors sm:text-sm",
              activeTab === "colors"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Sliders className="size-3.5" />
            Color & Surfaces
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("wallpaper")}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors sm:text-sm",
              activeTab === "wallpaper"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <ImageIcon className="size-3.5" />
            Wallpaper & Blur
          </button>
        </div>

        {/* Body content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {matchedToast ? (
            <div
              role="status"
              className="mb-4 flex items-center justify-between rounded-xl bg-primary/15 px-3 py-2 text-xs font-medium text-primary shadow-sm"
            >
              <span className="flex items-center gap-1.5">
                <Wand2 className="size-3.5" /> {matchedToast}
              </span>
            </div>
          ) : null}

          {/* TAB 1: CURATED PRESETS */}
          {activeTab === "presets" && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground sm:text-sm">
                Choose a handcrafted aesthetic combining lighting, surface transparency, and background wallpapers.
              </p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {THEME_PRESETS.map((p) => {
                  const wp = WALLPAPER_PRESETS.find((w) => w.id === p.wallpaperPresetId);
                  const isCurrent =
                    mode === p.mode &&
                    surface === p.surface &&
                    accent.toLowerCase() === p.accent.toLowerCase() &&
                    wallpaperType === p.wallpaperType &&
                    (p.wallpaperType !== "preset" || wallpaperPresetId === p.wallpaperPresetId);

                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyThemePreset(p.id)}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-2xl border p-3 text-left transition-all hover:scale-[1.01] focus-visible:outline-2 focus-visible:outline-[var(--ring)]",
                        isCurrent
                          ? "border-primary bg-primary/10 shadow-sm"
                          : "border-border bg-foreground/[0.02] hover:border-foreground/20 hover:bg-foreground/[0.04]",
                      )}
                    >
                      {/* Mini Preview Box */}
                      <div
                        className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/20 shadow-inner"
                        style={{
                          background: p.wallpaperType === "none" ? (p.mode === "light" ? "#f8fafc" : "#09090b") : (wp?.previewGradient || "#09090b"),
                        }}
                      >
                        <div
                          className="size-5 rounded-full shadow-md"
                          style={{ backgroundColor: p.accent }}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="truncate text-xs font-semibold sm:text-sm">{p.name}</span>
                          {isCurrent ? (
                            <span className="flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <Check className="size-2.5" />
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="capitalize">{p.mode}</span>
                          <span>•</span>
                          <span className="capitalize">{p.surface}</span>
                          <span>•</span>
                          <span>{p.wallpaperType === "none" ? "No wallpaper" : wp?.name || "Wallpaper"}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: COLORS & SURFACES */}
          {activeTab === "colors" && (
            <div className="space-y-6">
              {/* Mode & Surface Section */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Mode Switcher */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Lighting Mode</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setMode("dark")}
                      className={cn(
                        "flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-medium transition-all",
                        mode === "dark"
                          ? "border-primary bg-primary/15 text-foreground"
                          : "border-border hover:bg-foreground/5 text-muted-foreground",
                      )}
                    >
                      <Moon className="size-3.5" />
                      Dark (AMOLED)
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("light")}
                      className={cn(
                        "flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-medium transition-all",
                        mode === "light"
                          ? "border-primary bg-primary/15 text-foreground"
                          : "border-border hover:bg-foreground/5 text-muted-foreground",
                      )}
                    >
                      <Sun className="size-3.5" />
                      Light
                    </button>
                  </div>
                </div>

                {/* Surface Switcher */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Surface Style</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSurface("glass")}
                      className={cn(
                        "flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-medium transition-all",
                        surface === "glass"
                          ? "border-primary bg-primary/15 text-foreground"
                          : "border-border hover:bg-foreground/5 text-muted-foreground",
                      )}
                    >
                      <Sparkles className="size-3.5" />
                      Frosted Glass
                    </button>
                    <button
                      type="button"
                      onClick={() => setSurface("flat")}
                      className={cn(
                        "flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-medium transition-all",
                        surface === "flat"
                          ? "border-primary bg-primary/15 text-foreground"
                          : "border-border hover:bg-foreground/5 text-muted-foreground",
                      )}
                    >
                      <div className="size-3 rounded-sm border border-current" />
                      Solid Flat
                    </button>
                  </div>
                </div>
              </div>

              {/* Accent Color Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">Accent Brand Palette</label>
                  <button
                    type="button"
                    onClick={resetAccent}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <RotateCcw className="size-3" />
                    Reset to school brand
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                  {ACCENT_PALETTE.map((c) => {
                    const isSelected = accent.toLowerCase() === c.hex.toLowerCase();
                    return (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => setAccent(c.hex)}
                        title={c.name}
                        className={cn(
                          "group relative flex aspect-square flex-col items-center justify-center rounded-xl transition-transform hover:scale-110",
                          isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "",
                        )}
                        style={{ backgroundColor: c.hex }}
                      >
                        {isSelected ? <Check className="size-4 text-white shadow" /> : null}
                      </button>
                    );
                  })}
                </div>

                {/* Custom Color Picker Input */}
                <div className="flex items-center gap-3 pt-2">
                  <label
                    htmlFor="custom-accent-color"
                    className="flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-foreground/5"
                  >
                    <input
                      id="custom-accent-color"
                      type="color"
                      value={accent}
                      onChange={(e) => setAccent(e.target.value)}
                      className="size-5 cursor-pointer rounded-full border-0 bg-transparent p-0"
                    />
                    <span>Custom Hex: <code className="uppercase">{accent}</code></span>
                  </label>

                  {wallpaperType !== "none" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleExtractClick}
                      disabled={extracting}
                      className="text-xs"
                    >
                      <Wand2 className="size-3.5" />
                      {extracting ? "Sampling..." : "Extract from wallpaper"}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: WALLPAPER & BLUR */}
          {activeTab === "wallpaper" && (
            <div className="space-y-6">
              {/* Wallpaper Type Pills */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Background Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setWallpaperType("preset")}
                    className={cn(
                      "rounded-xl border p-2 text-center text-xs font-medium transition-all",
                      wallpaperType === "preset"
                        ? "border-primary bg-primary/15 text-foreground"
                        : "border-border text-muted-foreground hover:bg-foreground/5",
                    )}
                  >
                    Preset Wallpapers
                  </button>
                  <button
                    type="button"
                    onClick={() => setWallpaperType("custom")}
                    className={cn(
                      "rounded-xl border p-2 text-center text-xs font-medium transition-all",
                      wallpaperType === "custom"
                        ? "border-primary bg-primary/15 text-foreground"
                        : "border-border text-muted-foreground hover:bg-foreground/5",
                    )}
                  >
                    Custom Photo
                  </button>
                  <button
                    type="button"
                    onClick={() => setWallpaperType("none")}
                    className={cn(
                      "rounded-xl border p-2 text-center text-xs font-medium transition-all",
                      wallpaperType === "none"
                        ? "border-primary bg-primary/15 text-foreground"
                        : "border-border text-muted-foreground hover:bg-foreground/5",
                    )}
                  >
                    None (Minimal)
                  </button>
                </div>
              </div>

              {/* Preset Gallery */}
              {wallpaperType === "preset" && (
                <div className="space-y-3">
                  <label className="text-xs font-medium text-muted-foreground">Built-in Wallpapers</label>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {WALLPAPER_PRESETS.map((wp) => {
                      const isSelected = wallpaperPresetId === wp.id;
                      return (
                        <button
                          key={wp.id}
                          type="button"
                          onClick={() => setWallpaperPreset(wp.id)}
                          className={cn(
                            "group flex flex-col overflow-hidden rounded-2xl border text-left transition-all hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-[var(--ring)]",
                            isSelected
                              ? "border-primary ring-2 ring-primary ring-offset-2 ring-offset-background"
                              : "border-border bg-foreground/[0.02]",
                          )}
                        >
                          <div
                            className="h-20 w-full"
                            style={{ background: wp.previewGradient }}
                          />
                          <div className="p-2.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold">{wp.name}</span>
                              {isSelected ? <Check className="size-3 text-primary" /> : null}
                            </div>
                            <span className="line-clamp-1 text-[11px] text-muted-foreground">
                              {wp.description}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Custom Photo Upload */}
              {wallpaperType === "custom" && (
                <div className="space-y-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />

                  {customWallpaper ? (
                    <div className="relative overflow-hidden rounded-2xl border border-border">
                      <img
                        src={customWallpaper}
                        alt="Custom background"
                        className="h-44 w-full object-cover"
                      />
                      <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 backdrop-blur-xs">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploading}
                        >
                          <Upload className="size-3.5" />
                          Replace photo
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => void removeCustomWallpaper()}
                        >
                          <Trash2 className="size-3.5" />
                          Remove
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={handleExtractClick}
                          disabled={extracting}
                        >
                          <Wand2 className="size-3.5" />
                          Auto-accent
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-foreground/[0.02] p-4 text-center transition-colors hover:border-foreground/30 hover:bg-foreground/[0.04]"
                    >
                      <div className="grid size-10 place-items-center rounded-full bg-foreground/5 text-muted-foreground">
                        <Upload className="size-5" />
                      </div>
                      <span className="text-xs font-medium sm:text-sm">
                        {uploading ? "Compressing & setting photo..." : "Upload a photo from your device"}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        JPEG, PNG, WebP • Auto-resized and stored locally
                      </span>
                    </button>
                  )}
                </div>
              )}

              {/* Sliders for Dim and Blur */}
              {wallpaperType !== "none" && (
                <div className="space-y-4 rounded-2xl border border-border bg-foreground/[0.02] p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Wallpaper Contrast & Atmosphere
                  </h3>

                  {/* Dark Scrim Dim */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span>Dim / Darkness Overlay</span>
                      <span className="font-mono text-muted-foreground">{Math.round(bgDim * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0.15}
                      max={0.9}
                      step={0.05}
                      value={bgDim}
                      onChange={(e) => setBgDim(parseFloat(e.target.value))}
                      className="w-full accent-[var(--primary)]"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Higher dim darkens the background so tables and text stay ultra-clear and legible.
                    </p>
                  </div>

                  {/* Blur Slider */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span>Background Blur</span>
                      <span className="font-mono text-muted-foreground">{bgBlur}px</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={24}
                      step={2}
                      value={bgBlur}
                      onChange={(e) => setBgBlur(parseInt(e.target.value, 10))}
                      className="w-full accent-[var(--primary)]"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Softens the wallpaper behind windows to focus attention on dashboard content.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border bg-foreground/[0.02] p-4 sm:px-6">
          <button
            type="button"
            onClick={resetToDefaults}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="size-3.5" />
            Reset all
          </button>
          <Button type="button" onClick={onClose} size="sm">
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
