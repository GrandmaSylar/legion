import type { QueryClient } from "@tanstack/react-query";
import {
  getInstitutionDetails,
  listAcademicYears,
  listClasses,
  listLevels,
  listSubjects,
  listTerms,
} from "./data/setup";
import { getDashboardStats, getRecentActivity } from "./data/dashboard";
import { listStaff } from "./data/staff";
import { listNotices } from "./data/notices";
import {
  listExpenseCategories,
  listExpenses,
  listFeeCategories,
  listInvoices,
} from "./data/fees";

const CACHE_KEY_PREFIX = "sms_rq_cache_v1:";
const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// Queries that are safe and fast to persist in localStorage for instant 0ms boot
const PERSISTABLE_ROOT_KEYS = new Set([
  "academic-years",
  "terms",
  "levels",
  "subjects",
  "classes",
  "institution-details",
  "dashboard",
  "activity",
  "notices",
  "fee-categories",
  "expense-categories",
]);

interface PersistedEntry {
  queryKey: readonly unknown[];
  data: unknown;
  dataUpdatedAt: number;
}

export function hydratePersistedQueryCache(
  queryClient: QueryClient,
  userId: string | undefined,
): void {
  if (!userId || typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(`${CACHE_KEY_PREFIX}${userId}`);
    if (!raw) return;
    const entries = JSON.parse(raw) as PersistedEntry[];
    const now = Date.now();
    for (const entry of entries) {
      if (!entry?.queryKey || entry.data === undefined) continue;
      if (now - entry.dataUpdatedAt > MAX_CACHE_AGE_MS) continue;
      const existing = queryClient.getQueryData(entry.queryKey);
      if (existing === undefined) {
        queryClient.setQueryData(entry.queryKey, entry.data, {
          updatedAt: entry.dataUpdatedAt,
        });
      }
    }
  } catch {
    // Ignore storage corruption or quota errors
  }
}

export function subscribeQueryCachePersistence(
  queryClient: QueryClient,
  userId: string | undefined,
): () => void {
  if (!userId || typeof window === "undefined") return () => {};

  let timer: number | null = null;
  const save = () => {
    timer = null;
    try {
      const queries = queryClient.getQueryCache().getAll();
      const entries: PersistedEntry[] = [];
      for (const q of queries) {
        const rootKey = String(q.queryKey[0] ?? "");
        if (!PERSISTABLE_ROOT_KEYS.has(rootKey)) continue;
        if (q.state.status !== "success" || q.state.data === undefined) continue;
        entries.push({
          queryKey: q.queryKey,
          data: q.state.data,
          dataUpdatedAt: q.state.dataUpdatedAt,
        });
      }
      window.localStorage.setItem(
        `${CACHE_KEY_PREFIX}${userId}`,
        JSON.stringify(entries),
      );
    } catch {
      // Ignore quota exceeded errors
    }
  };

  const unsubscribe = queryClient.getQueryCache().subscribe(() => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(save, 500);
  });

  return () => {
    if (timer !== null) window.clearTimeout(timer);
    unsubscribe();
  };
}

// Track prefetched routes so we don't repeat chunk downloads
const prefetchedRoutes = new Set<string>();

export function prefetchRouteAndData(
  path: string,
  queryClient: QueryClient,
): void {
  // 1. Preload the lazy route JS chunk on first hover/focus
  if (!prefetchedRoutes.has(path)) {
    prefetchedRoutes.add(path);
    switch (path) {
      case "/":
        void import("../app/pages/Dashboard");
        break;
      case "/students":
        void import("../app/pages/students/StudentsList");
        break;
      case "/attendance":
        void import("../app/pages/attendance/Attendance");
        break;
      case "/grades":
        void import("../app/pages/grades/Grades");
        break;
      case "/fees":
        void import("../app/pages/fees/Fees");
        break;
      case "/analytics":
        void import("../app/pages/analytics/Analytics");
        break;
      case "/staff":
        void import("../app/pages/staff/Staff");
        break;
      case "/notices":
        void import("../app/pages/notices/Notices");
        break;
      case "/settings":
        void import("../app/pages/Settings");
        break;
      case "/users":
        void import("../app/pages/users/Users");
        break;
    }
  }

  // 2. Warm core shared reference queries (academic years & terms)
  void queryClient
    .prefetchQuery({
      queryKey: ["academic-years"],
      queryFn: listAcademicYears,
      staleTime: 5 * 60_000,
    })
    .then(() => {
      const years = queryClient.getQueryData<
        { id: string; isCurrent: boolean }[]
      >(["academic-years"]);
      const currentYear = years?.find((y) => y.isCurrent) ?? years?.[0];
      if (
        currentYear &&
        (path === "/" ||
          path === "/attendance" ||
          path === "/grades" ||
          path === "/students")
      ) {
        void queryClient.prefetchQuery({
          queryKey: ["classes", currentYear.id],
          queryFn: () => listClasses(currentYear.id),
          staleTime: 3 * 60_000,
        });
      }
    });

  // 3. Route-specific data prefetching
  switch (path) {
    case "/":
      void queryClient.prefetchQuery({
        queryKey: ["dashboard"],
        queryFn: getDashboardStats,
        staleTime: 2 * 60_000,
      });
      void queryClient.prefetchQuery({
        queryKey: ["activity"],
        queryFn: () => getRecentActivity(8),
        staleTime: 60_000,
      });
      break;
    case "/grades":
      void queryClient.prefetchQuery({
        queryKey: ["terms"],
        queryFn: listTerms,
        staleTime: 5 * 60_000,
      });
      break;
    case "/fees":
      void queryClient.prefetchQuery({
        queryKey: ["institution-details"],
        queryFn: getInstitutionDetails,
        staleTime: 5 * 60_000,
      });
      void queryClient.prefetchQuery({
        queryKey: ["invoices"],
        queryFn: listInvoices,
        staleTime: 90_000,
      });
      void queryClient.prefetchQuery({
        queryKey: ["expenses"],
        queryFn: listExpenses,
        staleTime: 90_000,
      });
      void queryClient.prefetchQuery({
        queryKey: ["expense-categories"],
        queryFn: listExpenseCategories,
        staleTime: 5 * 60_000,
      });
      break;
    case "/staff":
      void queryClient.prefetchQuery({
        queryKey: ["staff"],
        queryFn: listStaff,
        staleTime: 2 * 60_000,
      });
      break;
    case "/notices":
      void queryClient.prefetchQuery({
        queryKey: ["notices"],
        queryFn: () => listNotices(),
        staleTime: 2 * 60_000,
      });
      break;
    case "/settings":
      void queryClient.prefetchQuery({
        queryKey: ["institution-details"],
        queryFn: getInstitutionDetails,
        staleTime: 5 * 60_000,
      });
      void queryClient.prefetchQuery({
        queryKey: ["levels"],
        queryFn: listLevels,
        staleTime: 5 * 60_000,
      });
      void queryClient.prefetchQuery({
        queryKey: ["subjects"],
        queryFn: listSubjects,
        staleTime: 5 * 60_000,
      });
      void queryClient.prefetchQuery({
        queryKey: ["fee-categories"],
        queryFn: listFeeCategories,
        staleTime: 5 * 60_000,
      });
      break;
  }
}
