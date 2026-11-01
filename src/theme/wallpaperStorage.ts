// Asynchronous storage for custom wallpaper images using IndexedDB,
// scoped per user account with a localStorage fallback. Compresses user-uploaded
// photos via canvas to keep storage fast and light (< 250 KB).

const DB_NAME = "pinks_sms_theme";
const DB_VERSION = 1;
const STORE_NAME = "wallpapers";

function keyFor(userId?: string | null): string {
  return userId ? `custom_wallpaper_${userId}` : "custom_wallpaper_guest";
}

function fallbackKeyFor(userId?: string | null): string {
  return userId ? `sms.customWallpaper.${userId}` : "sms.customWallpaper.guest";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveCustomWallpaper(dataUrl: string, userId?: string | null): Promise<void> {
  const k = keyFor(userId);
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(dataUrl, k);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      localStorage.setItem(fallbackKeyFor(userId), dataUrl);
    } catch {
      /* ignore storage quota errors */
    }
  }
}

export async function loadCustomWallpaper(userId?: string | null): Promise<string | null> {
  const k = keyFor(userId);
  try {
    const db = await openDb();
    const result = await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(k);
      req.onsuccess = () => resolve((req.result as string) ?? null);
      req.onerror = () => reject(req.error);
    });
    if (result) return result;
  } catch {
    /* fallback to localStorage */
  }

  try {
    return localStorage.getItem(fallbackKeyFor(userId));
  } catch {
    return null;
  }
}

export async function deleteCustomWallpaper(userId?: string | null): Promise<void> {
  const k = keyFor(userId);
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(k);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    /* ignore */
  }

  try {
    localStorage.removeItem(fallbackKeyFor(userId));
  } catch {
    /* ignore */
  }
}

/**
 * Resizes and compresses any image file to a max dimension of 1920px (preserving aspect ratio)
 * and returns an optimized JPEG data URL.
 */
export async function processWallpaperFile(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const maxDim = 1920;
  let { width, height } = bitmap;

  if (width > maxDim || height > maxDim) {
    if (width > height) {
      height = Math.round((height * maxDim) / width);
      width = maxDim;
    } else {
      width = Math.round((width * maxDim) / height);
      height = maxDim;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Canvas context is not available");
  }

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return canvas.toDataURL("image/jpeg", 0.84);
}
