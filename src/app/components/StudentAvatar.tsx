import { useQuery } from "@tanstack/react-query";
import { signedPhotoUrls } from "../../lib/data/students";
import { cn } from "./ui/utils";

/** Signed photo links for a set of storage paths. Cached just under their one-hour life. */
export function usePhotoUrls(paths: (string | null | undefined)[]): Record<string, string> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))].sort();
  const { data } = useQuery({
    queryKey: ["photo-urls", unique],
    queryFn: () => signedPhotoUrls(unique),
    enabled: unique.length > 0,
    staleTime: 50 * 60_000,
  });
  return data ?? {};
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function StudentAvatar({
  name, url, className,
}: { name: string; url?: string | null; className?: string }) {
  return url ? (
    <img
      src={url}
      alt=""
      loading="lazy"
      className={cn("size-10 shrink-0 rounded-full object-cover", className)}
    />
  ) : (
    <span
      aria-hidden
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-medium text-primary",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
