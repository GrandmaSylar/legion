import { useQuery } from "@tanstack/react-query";
import { photoUrlsFor } from "../../lib/data/students";
import { cn } from "./ui/utils";

/**
 * Expiring photo links for the given students (pass only those who have a photo).
 * Cached just under the links' one-hour life. If photos are unavailable the
 * avatars simply show initials, so there is no retry.
 */
export function usePhotoUrls(studentIds: (string | null | undefined)[]): Record<string, string> {
  const unique = [...new Set(studentIds.filter((p): p is string => !!p))].sort();
  const { data } = useQuery({
    queryKey: ["photo-urls", unique],
    queryFn: () => photoUrlsFor(unique),
    enabled: unique.length > 0,
    staleTime: 50 * 60_000,
    retry: false,
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
