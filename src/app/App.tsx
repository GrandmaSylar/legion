import { useState, useRef, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import {
  Menu, Grid3X3, Clock, Bell, ChevronDown, BookOpen,
  TrendingUp, GraduationCap, ArrowUpRight, LayoutGrid,
  Settings, Maximize2, X, Upload, Palette, Image, Pipette,
  Check,
} from "lucide-react";

// ─── Data ────────────────────────────────────────────────────────────────────

const revenueData = [
  { month: "Jan", value: 4200 }, { month: "Feb", value: 3800 },
  { month: "Mar", value: 5100 }, { month: "Apr", value: 4700 },
  { month: "May", value: 6200 }, { month: "Jun", value: 5800 },
  { month: "Jul", value: 7100 }, { month: "Aug", value: 6500 },
  { month: "Sep", value: 8200 }, { month: "Oct", value: 7600 },
  { month: "Nov", value: 9100 }, { month: "Dec", value: 8400 },
];

const withdrawalRequests = [
  { name: "Ana Bailey",       email: "anabailey@yah.co",   amount: "$5.22",  status: "pending" },
  { name: "Thomas Garcia",    email: "tgarcia@yahoo.com",  amount: "$14.81", status: "pending" },
  { name: "Arjuna Baker",     email: "rgreen@rall.com",    amount: "$11.70", status: "active"  },
  { name: "Ethan Hernandez",  email: "ethanhern@qjz.net",  amount: "$17.84", status: "pending" },
];

const topCourses = [
  { icon: "📊", name: "Data Science and Machine Learning", sales: 12 },
  { icon: "💻", name: "Full Stack Web Development",        sales: 16 },
  { icon: "⛓",  name: "Blockchain Technology",             sales: 8  },
  { icon: "🎨", name: "User Experience (UX) Design",       sales: 9  },
];

const courseOverviewData = [
  { name: "XI Crash Course",       value: 30, color: "#ff6b6b" },
  { name: "Digital Marketing",     value: 20, color: "#ffd93d" },
  { name: "Code Learning",         value: 15, color: "#6bcfff" },
  { name: "UX/UI Designing",       value: 18, color: "#6bffb8" },
  { name: "AI & Product Learning", value: 10, color: "#c77dff" },
  { name: "Web Designing Boot",    value: 7,  color: "#ff9f43" },
];

const navItems = ["Home", "Courses", "Bootcamp", "Team Training", "EBook", "Enrollments", "Reports", "Affiliate"];

const PALETTE = [
  "#e8562a", "#f59e0b", "#10b981", "#3b82f6",
  "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16",
  "#f97316", "#6366f1", "#14b8a6", "#ef4444",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function rgbToHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
}

function accentWithAlpha(hex: string, alpha: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function extractDominantColor(imgSrc: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 64; canvas.height = 64;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, 64, 64);
      const data = ctx.getImageData(0, 0, 64, 64).data;
      let r = 0, g = 0, b = 0, count = 0;
      for (let i = 0; i < data.length; i += 8) {
        const pr = data[i], pg = data[i + 1], pb = data[i + 2], a = data[i + 3];
        if (a < 128) continue;
        // skip near-white and near-black pixels
        const lum = 0.299 * pr + 0.587 * pg + 0.114 * pb;
        if (lum < 30 || lum > 220) continue;
        r += pr; g += pg; b += pb; count++;
      }
      if (count === 0) { resolve("#6366f1"); return; }
      r = Math.round(r / count);
      g = Math.round(g / count);
      b = Math.round(b / count);
      // boost saturation: push away from grey
      const max = Math.max(r, g, b);
      const boost = 1.6;
      r = Math.round((r - max / 3) * boost + max / 3);
      g = Math.round((g - max / 3) * boost + max / 3);
      b = Math.round((b - max / 3) * boost + max / 3);
      resolve(rgbToHex(r, g, b));
    };
    img.onerror = () => resolve("#6366f1");
    img.src = imgSrc;
  });
}

// ─── Glass style factory ─────────────────────────────────────────────────────

function makeGlass(accent: string) {
  return {
    panel: {
      background: "rgba(255,255,255,0.06)",
      backdropFilter: "blur(24px) saturate(180%)",
      WebkitBackdropFilter: "blur(24px) saturate(180%)",
      border: "1px solid rgba(255,255,255,0.12)",
      boxShadow: "0 8px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.15)",
    } as React.CSSProperties,
    nav: {
      background: "rgba(255,255,255,0.04)",
      backdropFilter: "blur(32px) saturate(200%)",
      WebkitBackdropFilter: "blur(32px) saturate(200%)",
      borderBottom: "1px solid rgba(255,255,255,0.1)",
    } as React.CSSProperties,
    pill: {
      background: "rgba(255,255,255,0.08)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      border: "1px solid rgba(255,255,255,0.13)",
    } as React.CSSProperties,
    activePill: {
      background: accentWithAlpha(accent, 0.8),
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      border: `1px solid ${accentWithAlpha(accent, 0.5)}`,
      boxShadow: `0 0 16px ${accentWithAlpha(accent, 0.5)}, inset 0 1px 0 rgba(255,255,255,0.2)`,
    } as React.CSSProperties,
    divider: "rgba(255,255,255,0.08)",
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ icon, label, total, sub1Label, sub1Value, sub2Label, sub2Value, glowColor }: {
  icon: React.ReactNode; label: string; total: number;
  sub1Label: string; sub1Value: number; sub2Label: string; sub2Value: number; glowColor: string;
}) {
  const g = makeGlass(glowColor);
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-3 relative overflow-hidden" style={g.panel}>
      <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full opacity-20 blur-2xl pointer-events-none" style={{ background: glowColor }} />
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}>
          {icon}
        </div>
        <span className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>{label}</span>
      </div>
      <div className="text-3xl font-bold text-white" style={{ textShadow: "0 0 20px rgba(255,255,255,0.2)" }}>{total}</div>
      <div className="flex gap-5">
        <div>
          <div className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{sub1Label}</div>
          <div className="text-sm font-semibold text-white">{sub1Value}</div>
        </div>
        <div>
          <div className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{sub2Label}</div>
          <div className="text-sm font-semibold text-white">{sub2Value}</div>
        </div>
      </div>
    </div>
  );
}

function DropdownBadge({ label, glass }: { label: string; glass: ReturnType<typeof makeGlass> }) {
  return (
    <button className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs" style={{ ...glass.pill, color: "rgba(255,255,255,0.6)" }}>
      {label}<ChevronDown size={10} />
    </button>
  );
}

function IconBtn({ children, glass }: { children: React.ReactNode; glass: ReturnType<typeof makeGlass> }) {
  return (
    <button className="w-7 h-7 rounded-xl flex items-center justify-center" style={glass.pill}>
      {children}
    </button>
  );
}

const CustomTooltip = ({ active, payload, glass }: { active?: boolean; payload?: Array<{ value: number }>; glass: ReturnType<typeof makeGlass> }) => {
  if (active && payload?.length) {
    return (
      <div className="px-3 py-1.5 rounded-xl text-xs text-white" style={{ ...glass.panel, border: "1px solid rgba(255,255,255,0.2)" }}>
        ${payload[0].value.toLocaleString()}
      </div>
    );
  }
  return null;
};

// ─── Settings Panel ───────────────────────────────────────────────────────────

type BgMode = "gradient" | "solid" | "image";

function SettingsPanel({
  open, onClose, accent, setAccent, bgMode, setBgMode,
  bgColor, setBgColor, bgImage, setBgImage, glass,
}: {
  open: boolean; onClose: () => void;
  accent: string; setAccent: (c: string) => void;
  bgMode: BgMode; setBgMode: (m: BgMode) => void;
  bgColor: string; setBgColor: (c: string) => void;
  bgImage: string | null; setBgImage: (s: string | null) => void;
  glass: ReturnType<typeof makeGlass>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [extracting, setExtracting] = useState(false);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      setBgImage(src);
      setBgMode("image");
    };
    reader.readAsDataURL(file);
  }, [setBgImage, setBgMode]);

  const handleExtract = useCallback(async () => {
    const src = bgMode === "image" && bgImage ? bgImage : bgMode === "solid" ? null : null;
    if (!src) return;
    setExtracting(true);
    const color = await extractDominantColor(src);
    setAccent(color);
    setExtracting(false);
  }, [bgMode, bgImage, setAccent]);

  if (!open) return null;

  const panelStyle: React.CSSProperties = {
    background: "rgba(10,8,22,0.7)",
    backdropFilter: "blur(40px) saturate(200%)",
    WebkitBackdropFilter: "blur(40px) saturate(200%)",
    border: "1px solid rgba(255,255,255,0.12)",
    boxShadow: "-8px 0 48px rgba(0,0,0,0.5)",
  };

  const sectionLabel = { color: "rgba(255,255,255,0.4)", fontSize: "10px", textTransform: "uppercase" as const, letterSpacing: "0.1em", fontWeight: 600 };
  const modeBtn = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: "6px 0", borderRadius: "10px", fontSize: "11px", fontWeight: 500,
    color: active ? "#fff" : "rgba(255,255,255,0.45)",
    background: active ? accentWithAlpha(accent, 0.25) : "rgba(255,255,255,0.05)",
    border: active ? `1px solid ${accentWithAlpha(accent, 0.5)}` : "1px solid rgba(255,255,255,0.08)",
    boxShadow: active ? `0 0 12px ${accentWithAlpha(accent, 0.3)}` : "none",
    transition: "all 0.2s",
    cursor: "pointer",
  });

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-72 flex flex-col" style={panelStyle}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex items-center gap-2">
            <Palette size={14} style={{ color: accent }} />
            <span className="text-sm font-semibold text-white">Appearance</span>
          </div>
          <button onClick={onClose} className="w-6 h-6 rounded-lg flex items-center justify-center" style={glass.pill}>
            <X size={12} style={{ color: "rgba(255,255,255,0.6)" }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-6">

          {/* ── Background ─────────────────────────── */}
          <div className="flex flex-col gap-3">
            <span style={sectionLabel}>Background</span>

            {/* Mode tabs */}
            <div className="flex gap-1.5">
              {(["gradient", "solid", "image"] as BgMode[]).map((m) => (
                <button key={m} onClick={() => setBgMode(m)} style={modeBtn(bgMode === m)}>
                  {m === "gradient" ? "Gradient" : m === "solid" ? "Solid" : "Photo"}
                </button>
              ))}
            </div>

            {/* Solid color picker */}
            {bgMode === "solid" && (
              <div className="flex flex-col gap-2">
                <label className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>Pick a color</label>
                <div className="flex items-center gap-2">
                  <div className="relative w-10 h-10 rounded-xl overflow-hidden flex-shrink-0" style={{ border: "1px solid rgba(255,255,255,0.15)" }}>
                    <input
                      type="color"
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      className="absolute inset-0 w-full h-full cursor-pointer opacity-0"
                    />
                    <div className="w-full h-full" style={{ background: bgColor }} />
                  </div>
                  <input
                    type="text"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl text-xs text-white outline-none"
                    style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
                  />
                </div>
              </div>
            )}

            {/* Photo upload */}
            {bgMode === "image" && (
              <div className="flex flex-col gap-2">
                <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full py-8 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all hover:bg-white/10"
                  style={
                    bgImage
                      ? { backgroundImage: `url(${bgImage})`, backgroundSize: "cover", backgroundPosition: "center", border: "1px solid rgba(255,255,255,0.15)", minHeight: 120 }
                      : { background: "rgba(255,255,255,0.05)", border: "2px dashed rgba(255,255,255,0.15)" }
                  }
                >
                  {!bgImage && (
                    <>
                      <Upload size={18} style={{ color: "rgba(255,255,255,0.4)" }} />
                      <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Upload photo</span>
                    </>
                  )}
                  {bgImage && (
                    <div className="w-full h-full flex items-end justify-end p-2" style={{ minHeight: 100 }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setBgImage(null); setBgMode("gradient"); }}
                        className="w-6 h-6 rounded-full flex items-center justify-center"
                        style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.2)" }}
                      >
                        <X size={10} style={{ color: "#fff" }} />
                      </button>
                    </div>
                  )}
                </button>
                {bgImage && (
                  <button onClick={() => fileRef.current?.click()} className="text-xs text-center py-1.5 rounded-xl w-full" style={{ ...glass.pill, color: "rgba(255,255,255,0.6)" }}>
                    <Image size={10} className="inline mr-1" />Change photo
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Theme Color ────────────────────────── */}
          <div className="flex flex-col gap-3">
            <span style={sectionLabel}>Theme Color</span>

            {/* Extract from background */}
            {(bgMode === "image" && bgImage) || bgMode === "solid" ? (
              <button
                onClick={handleExtract}
                disabled={extracting}
                className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium w-full transition-all"
                style={{
                  background: accentWithAlpha(accent, 0.15),
                  border: `1px solid ${accentWithAlpha(accent, 0.4)}`,
                  color: "#fff",
                  boxShadow: `0 0 12px ${accentWithAlpha(accent, 0.2)}`,
                  opacity: extracting ? 0.6 : 1,
                }}
              >
                <Pipette size={12} style={{ color: accent }} />
                {extracting ? "Extracting…" : "Extract from background"}
              </button>
            ) : null}

            {/* Color palette */}
            <div>
              <div className="text-xs mb-2" style={{ color: "rgba(255,255,255,0.4)" }}>Palette</div>
              <div className="grid grid-cols-6 gap-2">
                {PALETTE.map((color) => (
                  <button
                    key={color}
                    onClick={() => setAccent(color)}
                    className="w-full aspect-square rounded-xl relative transition-transform hover:scale-110"
                    style={{
                      background: color,
                      boxShadow: accent === color ? `0 0 0 2px #fff, 0 0 12px ${color}` : "none",
                      border: accent === color ? "none" : "1px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    {accent === color && (
                      <Check size={10} className="absolute inset-0 m-auto text-white" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5))" }} />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom color picker */}
            <div>
              <div className="text-xs mb-2" style={{ color: "rgba(255,255,255,0.4)" }}>Custom</div>
              <div className="flex items-center gap-2">
                <div className="relative w-10 h-10 rounded-xl overflow-hidden flex-shrink-0" style={{ border: `1px solid ${accentWithAlpha(accent, 0.5)}`, boxShadow: `0 0 10px ${accentWithAlpha(accent, 0.4)}` }}>
                  <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="absolute inset-0 w-full h-full cursor-pointer opacity-0" />
                  <div className="w-full h-full" style={{ background: accent }} />
                </div>
                <input
                  type="text"
                  value={accent}
                  onChange={(e) => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) setAccent(e.target.value); }}
                  className="flex-1 px-3 py-2 rounded-xl text-xs text-white outline-none"
                  style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
                />
              </div>
            </div>

            {/* Live preview strip */}
            <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: accentWithAlpha(accent, 0.12), border: `1px solid ${accentWithAlpha(accent, 0.25)}` }}>
              <div className="w-6 h-6 rounded-lg flex-shrink-0" style={{ background: accent, boxShadow: `0 0 10px ${accentWithAlpha(accent, 0.6)}` }} />
              <div>
                <div className="text-xs font-semibold text-white">Active theme</div>
                <div className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>{accent.toUpperCase()}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [activeNav, setActiveNav]       = useState("Home");
  const [activeCourseTab, setActiveCourseTab] = useState("Top Courses");
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Appearance state
  const [accent, setAccent]     = useState("#e8562a");
  const [bgMode, setBgMode]     = useState<BgMode>("gradient");
  const [bgColor, setBgColor]   = useState("#0a0018");
  const [bgImage, setBgImage]   = useState<string | null>(null);

  const glass = makeGlass(accent);

  return (
    <div className="min-h-screen w-full font-[Inter,sans-serif] relative overflow-hidden" style={{ color: "#fff" }}>

      {/* ── Background Layer ── */}
      {bgMode === "gradient" && (
        <div className="fixed inset-0 -z-10" style={{ background: "linear-gradient(135deg,#0a0015 0%,#0d0a1f 30%,#100818 60%,#0a1020 100%)" }} />
      )}
      {bgMode === "solid" && (
        <div className="fixed inset-0 -z-10" style={{ background: bgColor }} />
      )}
      {bgMode === "image" && bgImage && (
        <div className="fixed inset-0 -z-10" style={{ backgroundImage: `url(${bgImage})`, backgroundSize: "cover", backgroundPosition: "center" }} />
      )}
      {/* dim overlay for image */}
      {bgMode === "image" && bgImage && (
        <div className="fixed inset-0 -z-10" style={{ background: "rgba(0,0,0,0.45)" }} />
      )}

      {/* Ambient orbs — always visible, tinted to accent */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-5%] w-[50vw] h-[50vw] rounded-full opacity-30 blur-3xl" style={{ background: `radial-gradient(circle,${accent} 0%,transparent 70%)` }} />
        <div className="absolute top-[20%] right-[-10%] w-[40vw] h-[40vw] rounded-full opacity-20 blur-3xl" style={{ background: `radial-gradient(circle,${accent} 0%,transparent 70%)`, filter: "hue-rotate(130deg)" }} />
        <div className="absolute bottom-[-5%] left-[30%] w-[45vw] h-[35vw] rounded-full opacity-20 blur-3xl" style={{ background: `radial-gradient(circle,${accent} 0%,transparent 70%)`, filter: "hue-rotate(220deg)" }} />
        <div className="absolute top-[50%] left-[10%] w-[30vw] h-[30vw] rounded-full opacity-15 blur-3xl" style={{ background: `radial-gradient(circle,${accent} 0%,transparent 70%)`, filter: "hue-rotate(60deg)" }} />
      </div>

      {/* ── Top Nav ── */}
      <nav className="sticky top-0 z-30 flex items-center justify-between px-5 py-2.5" style={glass.nav}>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-7 h-7 rounded-xl flex items-center justify-center text-white font-bold text-sm" style={{ background: accentWithAlpha(accent, 0.9), border: `1px solid ${accentWithAlpha(accent, 0.5)}`, boxShadow: `0 0 12px ${accentWithAlpha(accent, 0.5)}` }}>
            S
          </div>
          <span className="font-bold text-white text-sm tracking-widest" style={{ textShadow: "0 0 20px rgba(255,255,255,0.3)" }}>SEDELA</span>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto">
          {navItems.map((item) => (
            <button
              key={item}
              onClick={() => setActiveNav(item)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all"
              style={activeNav === item ? { ...glass.activePill, color: "#fff" } : { color: "rgba(255,255,255,0.5)" }}
            >
              {item}
              {["Courses","Bootcamp","Team Training","EBook","Enrollments","Reports"].includes(item) && <ChevronDown size={10} />}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <IconBtn glass={glass}><Settings size={13} style={{ color: "rgba(255,255,255,0.6)" }} /></IconBtn>
          <IconBtn glass={glass}><Grid3X3 size={13} style={{ color: "rgba(255,255,255,0.6)" }} /></IconBtn>
          <IconBtn glass={glass}><Clock size={13} style={{ color: "rgba(255,255,255,0.6)" }} /></IconBtn>
          <button className="w-7 h-7 rounded-xl flex items-center justify-center relative" style={glass.pill}>
            <Bell size={13} style={{ color: "rgba(255,255,255,0.6)" }} />
            <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full" style={{ background: accent, boxShadow: `0 0 6px ${accent}` }} />
          </button>
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: `linear-gradient(135deg,${accent},${accentWithAlpha(accent, 0.6)})`, border: "1px solid rgba(255,255,255,0.2)", boxShadow: `0 0 10px ${accentWithAlpha(accent, 0.4)}` }}>
            A
          </div>
        </div>
      </nav>

      {/* ── Page Body ── */}
      <div className="p-4 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <button className="w-7 h-7 rounded-xl flex items-center justify-center" style={glass.pill}>
            <Menu size={14} style={{ color: "rgba(255,255,255,0.6)" }} />
          </button>
          <h1 className="text-lg font-semibold text-white" style={{ textShadow: "0 0 30px rgba(255,255,255,0.2)" }}>Dashboard Overview</h1>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={<BookOpen size={14} style={{ color: accent }} />} label="Courses" total={24} sub1Label="Active Courses" sub1Value={3} sub2Label="Upcoming Courses" sub2Value={1} glowColor={accent} />
          <StatCard icon={<LayoutGrid size={14} style={{ color: "#7fb8ff" }} />} label="Number of Lessons" total={220} sub1Label="Active Lessons" sub1Value={20} sub2Label="Upcoming Lessons" sub2Value={4} glowColor="#3b82f6" />
          <StatCard icon={<TrendingUp size={14} style={{ color: "#7bffca" }} />} label="Number of Enrollment" total={67} sub1Label="Future Enrollment" sub1Value={60} sub2Label="New Enrollment" sub2Value={7} glowColor="#10b981" />
          <StatCard icon={<GraduationCap size={14} style={{ color: "#c77dff" }} />} label="Number of Students" total={17} sub1Label="Active Students" sub1Value={12} sub2Label="New Students" sub2Value={5} glowColor="#7c3aed" />
        </div>

        {/* Middle Row */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
          {/* Revenue Chart */}
          <div className="lg:col-span-3 rounded-2xl flex flex-col" style={glass.panel}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${glass.divider}` }}>
              <span className="text-sm font-semibold text-white">Active Revenue</span>
              <div className="flex items-center gap-2">
                <button className="p-1.5 rounded-lg" style={glass.pill}><Maximize2 size={10} style={{ color: "rgba(255,255,255,0.5)" }} /></button>
                <DropdownBadge label="This Year" glass={glass} />
              </div>
            </div>
            <div className="p-4 flex-1">
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={revenueData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={accent} stopOpacity={0.5} />
                      <stop offset="95%" stopColor={accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip glass={glass} />} cursor={{ stroke: "rgba(255,255,255,0.1)" }} />
                  <Area type="monotone" dataKey="value" stroke={accent} strokeWidth={2} fill="url(#revGrad)" dot={false} activeDot={{ r: 4, fill: accent, stroke: "#fff", strokeWidth: 1.5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Requested Withdrawal */}
          <div className="lg:col-span-2 rounded-2xl flex flex-col" style={glass.panel}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${glass.divider}` }}>
              <span className="text-sm font-semibold text-white">Requested Withdrawal</span>
              <div className="flex items-center gap-2">
                <button className="p-1.5 rounded-lg" style={glass.pill}><Maximize2 size={10} style={{ color: "rgba(255,255,255,0.5)" }} /></button>
                <DropdownBadge label="9 Months" glass={glass} />
              </div>
            </div>
            <div className="flex flex-col">
              {withdrawalRequests.map((req, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3" style={{ borderBottom: i < withdrawalRequests.length - 1 ? `1px solid ${glass.divider}` : "none" }}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                      style={{ background: `linear-gradient(135deg, hsl(${i * 70 + 180},60%,50%), hsl(${i * 70 + 220},70%,40%))`, border: "1px solid rgba(255,255,255,0.2)", boxShadow: `0 0 8px hsla(${i * 70 + 180},60%,50%,0.4)` }}>
                      {req.name.split(" ").map((n) => n[0]).join("")}
                    </div>
                    <div>
                      <div className="text-xs font-medium text-white leading-tight">{req.email}</div>
                      <div className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{req.name}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <div className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Requested Amount</div>
                      <div className="text-sm font-semibold text-white">{req.amount}</div>
                    </div>
                    <button className="w-6 h-6 rounded-lg flex items-center justify-center"
                      style={req.status === "active"
                        ? { background: accentWithAlpha(accent, 0.25), border: `1px solid ${accentWithAlpha(accent, 0.4)}` }
                        : glass.pill}>
                      <ChevronDown size={11} style={{ color: req.status === "active" ? accent : "rgba(255,255,255,0.5)" }} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
          {/* Top Courses */}
          <div className="lg:col-span-3 rounded-2xl flex flex-col" style={glass.panel}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${glass.divider}` }}>
              <div className="flex gap-4">
                {["Top Courses", "Best Sellers"].map((tab) => (
                  <button key={tab} onClick={() => setActiveCourseTab(tab)} className="text-xs font-medium pb-1 transition-all"
                    style={{
                      color: activeCourseTab === tab ? "#fff" : "rgba(255,255,255,0.4)",
                      borderBottom: activeCourseTab === tab ? `2px solid ${accent}` : "2px solid transparent",
                      textShadow: activeCourseTab === tab ? `0 0 12px ${accentWithAlpha(accent, 0.6)}` : "none",
                    }}>
                    {tab}
                  </button>
                ))}
              </div>
              <button className="p-1.5 rounded-lg" style={glass.pill}><Maximize2 size={10} style={{ color: "rgba(255,255,255,0.5)" }} /></button>
            </div>
            <div className="flex flex-col">
              {topCourses.map((course, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3 transition-all hover:bg-white/5"
                  style={{ borderBottom: i < topCourses.length - 1 ? `1px solid ${glass.divider}` : "none" }}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                      style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}>
                      {course.icon}
                    </div>
                    <span className="text-xs text-white font-medium">{course.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white">{course.sales} Total Sales</span>
                    <ArrowUpRight size={12} style={{ color: "#4ade80", filter: "drop-shadow(0 0 4px rgba(74,222,128,0.5))" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Course Overview */}
          <div className="lg:col-span-2 rounded-2xl flex flex-col" style={glass.panel}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${glass.divider}` }}>
              <span className="text-sm font-semibold text-white">Course Overview</span>
              <div className="flex items-center gap-2">
                <button className="p-1.5 rounded-lg" style={glass.pill}><Maximize2 size={10} style={{ color: "rgba(255,255,255,0.5)" }} /></button>
                <DropdownBadge label="7 Days" glass={glass} />
              </div>
            </div>
            <div className="p-4 flex flex-col gap-3 flex-1">
              <div className="flex items-start gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>XI Crash Course</span>
                  <span className="text-2xl font-bold text-white" style={{ textShadow: "0 0 20px rgba(255,107,107,0.4)" }}>270%</span>
                  <div className="flex gap-4 mt-1">
                    <div>
                      <div className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>New Ses</div>
                      <div className="text-sm font-semibold text-white">12</div>
                    </div>
                    <div>
                      <div className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Active Students</div>
                      <div className="text-sm font-semibold text-white">9</div>
                    </div>
                  </div>
                  <div className="mt-1">
                    <div className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Lesson Completion</div>
                    <div className="text-sm font-semibold text-white">16 of 24</div>
                  </div>
                </div>
                <div className="flex-1 flex justify-center">
                  <PieChart width={110} height={110}>
                    <Pie data={courseOverviewData} cx={50} cy={50} innerRadius={30} outerRadius={52} paddingAngle={2} dataKey="value" strokeWidth={0}>
                      {courseOverviewData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} style={{ filter: `drop-shadow(0 0 4px ${entry.color}88)` }} />
                      ))}
                    </Pie>
                  </PieChart>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {courseOverviewData.map((item, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: item.color, boxShadow: `0 0 5px ${item.color}` }} />
                    <span className="text-xs truncate" style={{ color: "rgba(255,255,255,0.5)" }}>{item.name}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-2 mt-auto" style={{ borderTop: `1px solid ${glass.divider}` }}>
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Total Rating</span>
                <div className="flex items-center gap-1">
                  {[1,2,3,4,5].map((s) => (
                    <span key={s} className="text-xs" style={{ color: s <= 4 ? "#fbbf24" : "rgba(255,255,255,0.15)", filter: s <= 4 ? "drop-shadow(0 0 3px rgba(251,191,36,0.6))" : "none" }}>★</span>
                  ))}
                  <span className="text-xs font-semibold text-white ml-1">4</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Floating Appearance Button ── */}
      <button
        onClick={() => setSettingsOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-medium text-white transition-all hover:scale-105 active:scale-95"
        style={{
          background: accentWithAlpha(accent, 0.25),
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: `1px solid ${accentWithAlpha(accent, 0.5)}`,
          boxShadow: `0 4px 24px ${accentWithAlpha(accent, 0.35)}, inset 0 1px 0 rgba(255,255,255,0.15)`,
        }}
      >
        <Palette size={14} style={{ color: accent }} />
        Appearance
      </button>

      {/* ── Settings Panel ── */}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        accent={accent}
        setAccent={setAccent}
        bgMode={bgMode}
        setBgMode={setBgMode}
        bgColor={bgColor}
        setBgColor={setBgColor}
        bgImage={bgImage}
        setBgImage={setBgImage}
        glass={glass}
      />
    </div>
  );
}
