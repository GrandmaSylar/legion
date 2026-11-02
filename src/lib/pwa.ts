import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    notify();
  });
}

export function registerServiceWorker(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Ignore service worker registration errors in restricted contexts
      });
    });
  }
}

export function countOfflineAttendanceDrafts(): number {
  if (typeof window === "undefined") return 0;
  try {
    let count = 0;
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith("attendance_draft:")) {
        count += 1;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

export function usePwaStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [canInstall, setCanInstall] = useState<boolean>(
    () => deferredInstallPrompt !== null,
  );
  const [draftCount, setDraftCount] = useState<number>(() =>
    countOfflineAttendanceDrafts(),
  );

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      setDraftCount(countOfflineAttendanceDrafts());
    };
    const onOffline = () => {
      setIsOnline(false);
      setDraftCount(countOfflineAttendanceDrafts());
    };
    const onPromptChange = () => {
      setCanInstall(deferredInstallPrompt !== null);
    };
    const interval = window.setInterval(() => {
      setDraftCount(countOfflineAttendanceDrafts());
    }, 4000);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    listeners.add(onPromptChange);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      listeners.delete(onPromptChange);
      window.clearInterval(interval);
    };
  }, []);

  const installApp = async () => {
    if (!deferredInstallPrompt) return;
    await deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    notify();
  };

  return {
    isOnline,
    canInstall,
    draftCount,
    installApp,
  };
}

