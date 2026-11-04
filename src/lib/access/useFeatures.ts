import { useQuery } from "@tanstack/react-query";
import { getDisabledFeatures } from "../data/features";

/**
 * Which features the school has switched off. While it loads, nothing is treated as off, so menus
 * do not flicker. The database is the real enforcement; this only decides what to show.
 */
export function useFeatures() {
  const q = useQuery({ queryKey: ["my-disabled-features"], queryFn: getDisabledFeatures, staleTime: 60_000 });
  const disabled = q.data ?? null;
  return {
    /** null until it has loaded */
    disabled,
    isOn: (key: string) => !disabled?.includes(key),
  };
}
