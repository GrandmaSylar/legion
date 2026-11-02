import type { SVGProps } from "react";
import { cn } from "../ui/utils";

export interface LegionCrestProps extends SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
  animated?: boolean;
}

/**
 * Legion School Management System Crest
 * Represents unity, academic excellence, leadership, and structured knowledge.
 * Features a heraldic shield with an architectural "L" wing, an open book base,
 * and a radiant beacon star of enlightenment.
 */
export function LegionCrest({
  size = 40,
  className,
  animated = false,
  ...props
}: LegionCrestProps) {
  const idPrefix = "legion-crest-" + Math.random().toString(36).slice(2, 7);

  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0 select-none", animated && "transition-transform duration-300 hover:scale-105", className)}
      aria-label="Legion Crest"
      {...props}
    >
      <defs>
        {/* Primary shield gradient */}
        <linearGradient id={`${idPrefix}-shield`} x1="16" y1="8" x2="104" y2="112" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--primary, #e8562a)" />
          <stop offset="50%" stopColor="color-mix(in srgb, var(--primary, #e8562a) 85%, #d946ef)" />
          <stop offset="100%" stopColor="color-mix(in srgb, var(--primary, #e8562a) 65%, #000)" />
        </linearGradient>

        {/* Inner gold / bronze highlight for heraldic prestige */}
        <linearGradient id={`${idPrefix}-gold`} x1="30" y1="20" x2="90" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fef08a" stopOpacity="0.9" />
          <stop offset="40%" stopColor="#f59e0b" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#b45309" stopOpacity="0.8" />
        </linearGradient>

        {/* Ambient glow backdrop */}
        <radialGradient id={`${idPrefix}-glow`} cx="50%" cy="40%" r="55%">
          <stop offset="0%" stopColor="var(--primary, #e8562a)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="transparent" stopOpacity="0" />
        </radialGradient>

        {/* Crisp glass bevel */}
        <linearGradient id={`${idPrefix}-glass`} x1="20" y1="12" x2="100" y2="108" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="35%" stopColor="#ffffff" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Ambient aura glow */}
      <circle cx="60" cy="58" r="54" fill={`url(#${idPrefix}-glow)`} />

      {/* Outer shield frame: chamfered Roman heraldic crest */}
      <path
        d="M60 10 L98 22 C98 58 87 90 60 110 C33 90 22 58 22 22 Z"
        fill={`url(#${idPrefix}-shield)`}
        stroke="rgba(255,255,255,0.22)"
        strokeWidth="1.5"
      />

      {/* Glass bevel inner rim */}
      <path
        d="M60 13 L94 24 C94 56 84 85 60 104 C36 85 26 56 26 24 Z"
        fill="none"
        stroke={`url(#${idPrefix}-glass)`}
        strokeWidth="1.2"
      />

      {/* Inner shield inset (deep rich backdrop) */}
      <path
        d="M60 18 L90 27 C90 54 81 80 60 97 C39 80 30 54 30 27 Z"
        fill="rgba(10, 10, 18, 0.45)"
      />

      {/* Modern geometric Roman "L" / Eagle Wing motif */}
      {/* Upper blade of the L */}
      <path
        d="M45 32 H54 V66 H75 V75 H45 Z"
        fill="#ffffff"
        style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.35))" }}
      />

      {/* Angled heraldic chevron wing (upper right wing accent) */}
      <path
        d="M59 34 L78 39 L78 47 L62 43 Z"
        fill={`url(#${idPrefix}-gold)`}
      />
      <path
        d="M61 46 L82 51 L82 58 L63 54 Z"
        fill={`url(#${idPrefix}-gold)`}
      />
      <path
        d="M64 57 L84 61 L82 68 L66 65 Z"
        fill={`url(#${idPrefix}-gold)`}
        opacity="0.85"
      />

      {/* Open Book Base of Knowledge */}
      <path
        d="M38 82 C46 80 54 81 60 84 C66 81 74 80 82 82 L80 87 C73 85 66 86 60 89 C54 86 47 85 40 87 Z"
        fill="#ffffff"
        opacity="0.92"
      />

      {/* Star / Beacon of Wisdom at the Apex */}
      <path
        d="M60 21 L62 26 L67 27 L63 30 L64 35 L60 32 L56 35 L57 30 L53 27 L58 26 Z"
        fill="#ffffff"
        style={{ filter: "drop-shadow(0 0 6px rgba(255,255,255,0.8))" }}
      />
    </svg>
  );
}
