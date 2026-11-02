import { Link } from "react-router";
import { LegionCrest } from "./LegionCrest";
import { cn } from "../ui/utils";

export interface LegionLogoProps {
  variant?: "full" | "compact" | "horizontal" | "icon";
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
  linkToHome?: boolean;
  animated?: boolean;
  tagline?: string;
  themeContext?: "dark" | "light" | "auto";
}

const SIZE_MAP = {
  xs: { icon: 24, title: "text-sm", sub: "text-[8px]" },
  sm: { icon: 30, title: "text-base tracking-wider", sub: "text-[9px]" },
  md: { icon: 38, title: "text-lg tracking-wider", sub: "text-[10px]" },
  lg: { icon: 48, title: "text-2xl tracking-widest", sub: "text-[11px]" },
  xl: { icon: 64, title: "text-3xl tracking-widest", sub: "text-xs" },
  "2xl": { icon: 84, title: "text-4xl tracking-widest", sub: "text-sm" },
};

export function LegionLogo({
  variant = "full",
  size = "md",
  className,
  linkToHome = false,
  animated = true,
  tagline = "School Management System",
}: LegionLogoProps) {
  const cfg = SIZE_MAP[size] ?? SIZE_MAP.md;

  const content = (
    <div
      className={cn(
        "group inline-flex items-center gap-3 select-none text-foreground",
        variant === "icon" && "gap-0",
        className,
      )}
    >
      <LegionCrest size={cfg.icon} animated={animated} />

      {variant !== "icon" ? (
        <div className="flex flex-col leading-none">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "font-black tracking-[0.16em] uppercase text-foreground transition-colors group-hover:text-primary",
                cfg.title,
              )}
              style={{
                fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                letterSpacing: "0.14em",
              }}
            >
              LEGION
            </span>
            <span className="size-1.5 rounded-full bg-primary" />
          </div>

          {variant === "full" ? (
            <span
              className={cn(
                "mt-0.5 font-medium tracking-[0.18em] uppercase text-muted-foreground",
                cfg.sub,
              )}
            >
              {tagline}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  if (linkToHome) {
    return (
      <Link
        to="/"
        className="inline-flex outline-hidden focus-visible:ring-2 focus-visible:ring-primary rounded-lg p-0.5"
        aria-label="Legion School Management System"
      >
        {content}
      </Link>
    );
  }

  return content;
}
