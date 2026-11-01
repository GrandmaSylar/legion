// Curated built-in wallpaper presets.
// High-resolution SVG gradient meshes that render smoothly at any screen size
// without network requests or large asset downloads, plus the original Sedela artwork.
import sedelaImage from "../imports/image.png";

export interface WallpaperPreset {
  id: string;
  name: string;
  description: string;
  recommendedAccent: string;
  url: string;
  previewGradient: string;
  recommendedDim: number;
}

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const AURORA_SVG = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs>
    <radialGradient id="a1" cx="20%" cy="30%" r="60%">
      <stop offset="0%" stop-color="#059669" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#022c22" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="a2" cx="80%" cy="40%" r="55%">
      <stop offset="0%" stop-color="#0284c7" stop-opacity="0.75"/>
      <stop offset="100%" stop-color="#0369a1" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="a3" cx="50%" cy="90%" r="70%">
      <stop offset="0%" stop-color="#7c3aed" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#090514" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="a4" cx="30%" cy="75%" r="45%">
      <stop offset="0%" stop-color="#10b981" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#064e3b" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1920" height="1080" fill="#021411"/>
  <rect width="1920" height="1080" fill="url(#a1)"/>
  <rect width="1920" height="1080" fill="url(#a2)"/>
  <rect width="1920" height="1080" fill="url(#a3)"/>
  <rect width="1920" height="1080" fill="url(#a4)"/>
</svg>
`);

const COSMOS_SVG = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs>
    <radialGradient id="c1" cx="25%" cy="25%" r="65%">
      <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.75"/>
      <stop offset="100%" stop-color="#2e1065" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="c2" cx="85%" cy="30%" r="55%">
      <stop offset="0%" stop-color="#ec4899" stop-opacity="0.65"/>
      <stop offset="100%" stop-color="#701a75" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="c3" cx="60%" cy="85%" r="60%">
      <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="#172554" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="c4" cx="10%" cy="80%" r="50%">
      <stop offset="0%" stop-color="#6366f1" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#050014" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1920" height="1080" fill="#070213"/>
  <rect width="1920" height="1080" fill="url(#c1)"/>
  <rect width="1920" height="1080" fill="url(#c2)"/>
  <rect width="1920" height="1080" fill="url(#c3)"/>
  <rect width="1920" height="1080" fill="url(#c4)"/>
</svg>
`);

const SUNSET_SVG = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs>
    <radialGradient id="s1" cx="30%" cy="20%" r="60%">
      <stop offset="0%" stop-color="#f97316" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#7c2d12" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="s2" cx="85%" cy="35%" r="55%">
      <stop offset="0%" stop-color="#e11d48" stop-opacity="0.75"/>
      <stop offset="100%" stop-color="#4c0519" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="s3" cx="50%" cy="85%" r="65%">
      <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#1a0410" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="s4" cx="15%" cy="75%" r="50%">
      <stop offset="0%" stop-color="#c026d3" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#140212" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1920" height="1080" fill="#14040e"/>
  <rect width="1920" height="1080" fill="url(#s1)"/>
  <rect width="1920" height="1080" fill="url(#s2)"/>
  <rect width="1920" height="1080" fill="url(#s3)"/>
  <rect width="1920" height="1080" fill="url(#s4)"/>
</svg>
`);

const OCEAN_SVG = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs>
    <radialGradient id="o1" cx="20%" cy="25%" r="60%">
      <stop offset="0%" stop-color="#0284c7" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#082f49" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="o2" cx="75%" cy="30%" r="55%">
      <stop offset="0%" stop-color="#06b6d4" stop-opacity="0.75"/>
      <stop offset="100%" stop-color="#164e63" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="o3" cx="50%" cy="90%" r="65%">
      <stop offset="0%" stop-color="#2563eb" stop-opacity="0.65"/>
      <stop offset="100%" stop-color="#030712" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="o4" cx="85%" cy="80%" r="50%">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#0c4a6e" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1920" height="1080" fill="#020914"/>
  <rect width="1920" height="1080" fill="url(#o1)"/>
  <rect width="1920" height="1080" fill="url(#o2)"/>
  <rect width="1920" height="1080" fill="url(#o3)"/>
  <rect width="1920" height="1080" fill="url(#o4)"/>
</svg>
`);

const MIDNIGHT_SVG = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs>
    <radialGradient id="m1" cx="20%" cy="20%" r="60%">
      <stop offset="0%" stop-color="#334155" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#090d16" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="m2" cx="80%" cy="70%" r="60%">
      <stop offset="0%" stop-color="#1e293b" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="#020617" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1920" height="1080" fill="#000000"/>
  <rect width="1920" height="1080" fill="url(#m1)"/>
  <rect width="1920" height="1080" fill="url(#m2)"/>
</svg>
`);

export const WALLPAPER_PRESETS: WallpaperPreset[] = [
  {
    id: "sedela",
    name: "Sedela Nebula",
    description: "The signature warm cosmic glow from the pilot design",
    recommendedAccent: "#e8562a",
    url: sedelaImage,
    previewGradient: "radial-gradient(circle at 30% 30%, #e8562a, #3b0764 65%, #05010d 100%)",
    recommendedDim: 0.55,
  },
  {
    id: "aurora",
    name: "Aurora Glow",
    description: "Vibrant emerald northern lights and oceanic turquoise",
    recommendedAccent: "#10b981",
    url: AURORA_SVG,
    previewGradient: "radial-gradient(circle at 30% 30%, #10b981, #0284c7 50%, #021411 95%)",
    recommendedDim: 0.6,
  },
  {
    id: "cosmos",
    name: "Cosmic Amethyst",
    description: "Deep violet starlight and ultraviolet nebula flow",
    recommendedAccent: "#8b5cf6",
    url: COSMOS_SVG,
    previewGradient: "radial-gradient(circle at 30% 30%, #8b5cf6, #ec4899 50%, #070213 95%)",
    recommendedDim: 0.55,
  },
  {
    id: "sunset",
    name: "Sunset Drift",
    description: "Warm amber dusk, golden horizon and rich magenta",
    recommendedAccent: "#f97316",
    url: SUNSET_SVG,
    previewGradient: "radial-gradient(circle at 30% 30%, #f97316, #e11d48 50%, #14040e 95%)",
    recommendedDim: 0.55,
  },
  {
    id: "ocean",
    name: "Midnight Ocean",
    description: "Electric cyan reef and deep sapphire currents",
    recommendedAccent: "#06b6d4",
    url: OCEAN_SVG,
    previewGradient: "radial-gradient(circle at 30% 30%, #06b6d4, #2563eb 50%, #020914 95%)",
    recommendedDim: 0.6,
  },
  {
    id: "midnight",
    name: "Midnight Minimal",
    description: "Subtle dark slate glow, sleek and distraction-free",
    recommendedAccent: "#64748b",
    url: MIDNIGHT_SVG,
    previewGradient: "radial-gradient(circle at 30% 30%, #334155, #0f172a 60%, #000000 100%)",
    recommendedDim: 0.45,
  },
];

export const ACCENT_PALETTE = [
  { name: "Sedela Orange", hex: "#e8562a" },
  { name: "Ocean Sapphire", hex: "#2563eb" },
  { name: "Emerald Forest", hex: "#10b981" },
  { name: "Amethyst Violet", hex: "#8b5cf6" },
  { name: "Neon Rose", hex: "#ec4899" },
  { name: "Amber Gold", hex: "#f59e0b" },
  { name: "Electric Cyan", hex: "#06b6d4" },
  { name: "Ruby Crimson", hex: "#ef4444" },
];
