import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMyCapabilities } from "../data/access";

/**
 * What the signed-in person may do, read from the database. This only decides what to
 * show: the database is the real enforcement, so a hidden button is never the only protection.
 */
export function useCapabilities() {
  const q = useQuery({ queryKey: ["my-capabilities"], queryFn: getMyCapabilities, staleTime: 60_000 });
  const caps = q.data ?? null;
  const set = useMemo(() => new Set(caps ?? []), [caps]);
  return {
    /** null until it has loaded */
    caps,
    isLoading: q.isLoading,
    can: (action: string) => set.has(action),
    canAny: (actions: string[]) => actions.some((a) => set.has(a)),
  };
}
