const memoryStorage = new Map<string, string>();

const getBrowserStorage = (type: "local" | "session") => {
  if (typeof window === "undefined") return null;
  try {
    return type === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
};

export const safeStorage = {
  getItem(key: string) {
    for (const type of ["local", "session"] as const) {
      const storage = getBrowserStorage(type);
      if (!storage) continue;
      try {
        const value = storage.getItem(key);
        if (value !== null) return value;
      } catch {
        // Mobile private/restore modes can throw on storage access.
      }
    }
    return memoryStorage.get(key) ?? null;
  },

  setItem(key: string, value: string) {
    for (const type of ["local", "session"] as const) {
      const storage = getBrowserStorage(type);
      if (!storage) continue;
      try {
        storage.setItem(key, value);
        memoryStorage.set(key, value);
        return;
      } catch {
        // Try the next storage tier.
      }
    }
    memoryStorage.set(key, value);
  },

  removeItem(key: string) {
    for (const type of ["local", "session"] as const) {
      const storage = getBrowserStorage(type);
      if (!storage) continue;
      try {
        storage.removeItem(key);
      } catch {
        // Ignore unavailable storage.
      }
    }
    memoryStorage.delete(key);
  },
};

export const supabaseSafeStorage = {
  getItem: (key: string) => safeStorage.getItem(key),
  setItem: (key: string, value: string) => safeStorage.setItem(key, value),
  removeItem: (key: string) => safeStorage.removeItem(key),
};

export function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

export const bootLog = (...args: unknown[]) => {
  if (import.meta.env.DEV || safeStorage.getItem("spendova_debug_boot") === "1") {
    console.info("[Spendova boot]", ...args);
  }
};
