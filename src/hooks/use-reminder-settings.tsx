import { useEffect, useState } from "react";

const KEY_WINDOW = "portal.reminderWindowDays";
const KEY_OVERDUE = "portal.reminderOverdueDays";
const EVENT = "portal.reminderSettings.change";

export const DEFAULT_WINDOW_DAYS = 30;
export const DEFAULT_OVERDUE_DAYS = 0;

function readNum(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export type ReminderSettings = {
  windowDays: number;
  overdueDays: number;
};

export function useReminderSettings(): [
  ReminderSettings,
  (s: Partial<ReminderSettings>) => void,
] {
  const [settings, setSettings] = useState<ReminderSettings>({
    windowDays: DEFAULT_WINDOW_DAYS,
    overdueDays: DEFAULT_OVERDUE_DAYS,
  });

  useEffect(() => {
    const load = () =>
      setSettings({
        windowDays: readNum(KEY_WINDOW, DEFAULT_WINDOW_DAYS),
        overdueDays: readNum(KEY_OVERDUE, DEFAULT_OVERDUE_DAYS),
      });
    load();
    window.addEventListener(EVENT, load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener(EVENT, load);
      window.removeEventListener("storage", load);
    };
  }, []);

  function update(patch: Partial<ReminderSettings>) {
    if (typeof window === "undefined") return;
    const next = { ...settings, ...patch };
    window.localStorage.setItem(KEY_WINDOW, String(next.windowDays));
    window.localStorage.setItem(KEY_OVERDUE, String(next.overdueDays));
    window.dispatchEvent(new Event(EVENT));
    setSettings(next);
  }

  return [settings, update];
}
