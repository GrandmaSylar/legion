// Asynchronous storage for custom wallpaper images using IndexedDB,
// with a localStorage fallback. Compresses user-uploaded photos via canvas
// to keep storage fast and light (< 250 KB).

const DB_NAME = "pinks_sms_theme";
const DB_VERSION = 1;
const STORE_NAME = "wallpapers";
const KEY_CUSTOM = "custom_wallpaper";
const FALLBACK_KEY = "sms.customWallpaper";

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

export async function saveCustomWallpaper(dataUrl: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(dataUrl, KEY_CUSTOM);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      localStorage.setItem(FALLBACK_KEY, dataUrl);
    } catch {
      /* ignore storage quota errors */
    }
  }
}

export async function loadCustomWallpaper(): Promise<string | null> {
  try {
    const db = await openDb();
    const result = await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(KEY_CUSTOM);
      req.onsuccess = () => resolve((req.result as string) ?? null);
      req.onerror = () => reject(req.error);
    });
    if (result) return result;
  } catch {
    /* fallback to localStorage */
  }

  try {
    return localStorage.getItem(FALLBACK_KEY);
  } catch {
    return null;
  }
}

export async function deleteCustomWallpaper(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(KEY_CUSTOM);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    /* ignore */
  }

  try {
    localStorage.removeItem(FALLBACK_KEY);
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
