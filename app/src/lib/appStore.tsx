"use client";

/**
 * THE CLIENT STORE (cluster H). The app's screen data lives here, hydrated
 * once from the device's cache the instant the app starts, then from
 * /api/app-state, and revalidated in the background (on focus, on a timer,
 * and after any write). A screen never waits on a fetch to render its
 * structure: with a snapshot it renders at once; without one it shows its
 * skeleton and the Sinhala line that says so.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { APP_SNAPSHOT_VERSION, type AppSnapshot } from "@/lib/appSnapshot";

const CACHE_KEY = `ss:app-state:v${APP_SNAPSHOT_VERSION}`;
const REVALIDATE_MS = 60_000;

export type StoreStatus = "cold" | "cached" | "fresh" | "offline" | "error";

export interface AppStore {
  snapshot: AppSnapshot | null;
  /** cold = nothing yet · cached = the device's last copy · fresh = from the server this visit · offline = the network failed (cached copy shown) · error = the server failed. */
  status: StoreStatus;
  /** A fetch is in flight behind what is shown. */
  updating: boolean;
  /** The server says this device has no child: the screens send it to onboarding. */
  noChild: boolean;
  /** When the last fresh snapshot arrived (ms, performance clock) — 0 until one has. */
  freshAt: number;
  /** Fetch again now (after a write, on demand). Resolves when the fetch settles. */
  refresh: () => Promise<void>;
  /** Forget the cached copy (a child switch, a delete). */
  clear: () => void;
}

const AppStoreContext = createContext<AppStore | null>(null);

function readCache(): AppSnapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { snapshot?: AppSnapshot };
    return parsed.snapshot ?? null;
  } catch {
    return null;
  }
}

/**
 * The snapshot is an external store (module-level) read through
 * useSyncExternalStore: the server render sees null (the skeleton), the
 * client's first render sees the device's cached copy — no effect, no
 * setState-after-mount, no flash of skeleton on a warm device.
 */
const store = {
  snapshot: null as AppSnapshot | null,
  status: "cold" as StoreStatus,
  loaded: false,
  listeners: new Set<() => void>(),
  get(): AppSnapshot | null {
    if (!store.loaded && typeof window !== "undefined") {
      store.loaded = true;
      store.snapshot = readCache();
      if (store.snapshot) store.status = "cached";
    }
    return store.snapshot;
  },
  set(snapshot: AppSnapshot | null): void {
    store.loaded = true;
    store.snapshot = snapshot;
    for (const listener of store.listeners) listener();
  },
  subscribe(listener: () => void): () => void {
    store.listeners.add(listener);
    return () => store.listeners.delete(listener);
  },
};
const getServerSnapshot = (): AppSnapshot | null => null;

function writeCache(snapshot: AppSnapshot | null): void {
  try {
    if (snapshot) localStorage.setItem(CACHE_KEY, JSON.stringify({ snapshot, savedAt: Date.now() }));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    // storage may be unavailable (private mode): the snapshot still lives in memory for this visit
  }
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(store.subscribe, store.get, getServerSnapshot);
  const setSnapshot = store.set;
  const [status, setStatus] = useState<StoreStatus>(() => (typeof window === "undefined" ? "cold" : store.get() ? "cached" : "cold"));
  const [updating, setUpdating] = useState(false);
  const [noChild, setNoChild] = useState(false);
  const [freshAt, setFreshAt] = useState(0);
  const inFlight = useRef<Promise<void> | null>(null);

  const queued = useRef<Promise<void> | null>(null);

  /** Background revalidation: one fetch at a time, a second request rides the one in the air. */
  const revalidate = useCallback((): Promise<void> => {
    if (inFlight.current) return inFlight.current;
    setUpdating(true);
    const run = (async () => {
      try {
        const response = await fetch("/api/app-state", { cache: "no-store", credentials: "same-origin" });
        if (response.status === 409) {
          setNoChild(true);
          setSnapshot(null);
          writeCache(null);
          setStatus("fresh");
          return;
        }
        const payload = (await response.json().catch(() => null)) as { ok?: boolean; snapshot?: AppSnapshot } | null;
        if (!response.ok || !payload?.ok || !payload.snapshot) {
          setStatus("error");
          return;
        }
        setNoChild(false);
        setSnapshot(payload.snapshot);
        writeCache(payload.snapshot);
        setStatus("fresh");
        setFreshAt(performance.now());
      } catch {
        // No network: what is shown stays, and says so quietly.
        setStatus((current) => (current === "fresh" ? "fresh" : "offline"));
      } finally {
        setUpdating(false);
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    return run;
  }, []);

  /**
   * After a write (the PIN entered, a child switched): the caller needs a
   * snapshot that was fetched AFTER the write. A revalidation already in the
   * air started before it — riding that one handed the PIN gate a stale
   * "parent: null" and the gate asked again (18 Sep, the device walk). So a
   * fetch in flight is followed by exactly one more, and that one is awaited.
   */
  const refresh = useCallback((): Promise<void> => {
    if (!inFlight.current) return revalidate();
    if (!queued.current) {
      queued.current = inFlight.current.then(() => {
        queued.current = null;
        return revalidate();
      });
    }
    return queued.current;
  }, [revalidate]);

  const clear = useCallback(() => {
    setSnapshot(null);
    setStatus("cold");
    setFreshAt(0);
    writeCache(null);
  }, []);

  // Hydrate from the device first — instantly — then from the server.
  useEffect(() => {
    // The app is interactive from here (React has hydrated): harnesses tap only after this mark, as a child's first tap lands on a painted, live screen.
    document.documentElement.setAttribute("data-hydrated", "1");
    void revalidate();
  }, [revalidate]);

  // Revalidate quietly: when the app comes back into view, and on a timer while it is visible.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void revalidate();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void revalidate();
    }, REVALIDATE_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onVisible);
      clearInterval(timer);
    };
  }, [revalidate]);

  const value = useMemo<AppStore>(() => ({ snapshot, status, updating, noChild, freshAt, refresh, clear }), [snapshot, status, updating, noChild, freshAt, refresh, clear]);
  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppState(): AppStore {
  const store = useContext(AppStoreContext);
  if (!store) throw new Error("useAppState needs <AppStateProvider> (src/app/(app)/layout.tsx)");
  return store;
}
