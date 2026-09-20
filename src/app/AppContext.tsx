import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { Area, ReminderEvent, Settings } from "../shared/types";
import { ThemeId } from "../shared/constants";

type AppState = {
  ready: boolean;
  settings: Settings;
  areas: Area[];
  error: string | null;
  toast: string | null;
  reminder: ReminderEvent | null;
  dismissReminder: () => void;
  setTheme: (theme: Settings["theme"]) => Promise<void>;
  replaceAreas: (areas: Area[]) => void;
  notify: (message: string) => void;
  applySettings: (next: Settings) => void;
  reload: () => Promise<void>;
};

const DEFAULT_SETTINGS: Settings = {
  theme: ThemeId.Dark,
  week_starts_on: 1,
  auto_backup: true,
  keep_backups: 7,
  last_backup_at: null,
  onboarded: false,
  reminder_enabled: true,
  reminder_time: "09:00",
  sync_dir: "",
  last_sync_at: null,
  started_on: null,
};

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [areas, setAreas] = useState<Area[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [reminder, setReminder] = useState<ReminderEvent | null>(null);
  const toastTimer = useRef<number | null>(null);

  const reload = useCallback(async () => {
    const [nextSettings, nextAreas] = await Promise.all([
      api.getSettings(),
      api.listAreas(),
    ]);
    setSettings(nextSettings);
    setAreas(nextAreas);
    document.documentElement.dataset.theme = nextSettings.theme;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await reload();
        if (!cancelled) setError(null);
      } catch (e) {
        const message = e instanceof ApiError ? e.message : "无法连接本地服务";
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const next = await api.fireDueReminders();
        if (!cancelled && next.due) setReminder(next);
      } catch {
        /* 应用未就绪时忽略 */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const setTheme = useCallback(async (theme: Settings["theme"]) => {
    const next = await api.setTheme(theme);
    setSettings(next);
    document.documentElement.dataset.theme = next.theme;
  }, []);

  const notify = useCallback((message: string) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  }, []);

  const applySettings = useCallback((next: Settings) => {
    setSettings(next);
    document.documentElement.dataset.theme = next.theme;
  }, []);

  const dismissReminder = useCallback(() => setReminder(null), []);

  const value = useMemo(
    () => ({
      ready,
      settings,
      areas,
      error,
      toast,
      reminder,
      dismissReminder,
      setTheme,
      replaceAreas: setAreas,
      notify,
      applySettings,
      reload,
    }),
    [ready, settings, areas, error, toast, reminder, dismissReminder, setTheme, notify, applySettings, reload],
  );

  if (!ready) {
    return (
      <div className="boot">
        <div className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p>正在打开观测台…</p>
      </div>
    );
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp 必须在 AppProvider 内使用");
  return ctx;
}
