"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import { format, subDays, startOfDay, isToday, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Sun,
  Moon,
  Plus,
  Minus,
  Trash2,
  Upload,
  Download,
  Settings,
  Activity,
  Wind,
  Bell,
  BellOff,
  Clock,
  Check,
  CalendarDays,
  Palette,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

/* ---------- types ---------- */
interface Measurement {
  id: string;
  value: number;
  period: "morning" | "evening";
  timing: "before" | "after";
  date: string;       // ISO datetime of the measurement
  createdAt: string; // ISO datetime when record was created
}

interface AppSettings {
  personalBest: number;
  reminderMinutes: number; // configurable reminder delay (default 30)
  theme: "light" | "dark" | "system";
}

/* ---------- version ---------- */
const APP_VERSION = "1.2.0";

/* ---------- local storage helpers ---------- */
const STORAGE_KEYS = {
  measurements: "peakflow_measurements",
  settings: "peakflow_settings",
  notifications: "peakflow_notifications",
} as const;

function loadMeasurements(): Measurement[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.measurements);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveMeasurements(data: Measurement[]) {
  localStorage.setItem(STORAGE_KEYS.measurements, JSON.stringify(data));
}

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    return raw ? JSON.parse(raw) : { personalBest: 400, reminderMinutes: 30, theme: "system" };
  } catch {
    return { personalBest: 400, reminderMinutes: 30, theme: "system" };
  }
}

function saveSettings(data: AppSettings) {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(data));
}

function loadNotificationsPref(): boolean {
  return localStorage.getItem(STORAGE_KEYS.notifications) === "true";
}

function saveNotificationsPref(val: boolean) {
  localStorage.setItem(STORAGE_KEYS.notifications, JSON.stringify(val));
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ---------- zone helpers ---------- */
function round10(n: number): number {
  return Math.round(n / 10) * 10;
}

function getZone(value: number, pb: number): "green" | "yellow" | "red" {
  if (value >= round10(pb * 0.8)) return "green";
  if (value >= round10(pb * 0.5)) return "yellow";
  return "red";
}

function zoneColor(zone: "green" | "yellow" | "red") {
  if (zone === "green") return "bg-emerald-500";
  if (zone === "yellow") return "bg-amber-500";
  return "bg-red-500";
}

function zoneLabel(zone: "green" | "yellow" | "red") {
  if (zone === "green") return "Зелёная";
  if (zone === "yellow") return "Жёлтая";
  return "Красная";
}

function zoneBorderColor(zone: "green" | "yellow" | "red") {
  if (zone === "green") return "border-emerald-500";
  if (zone === "yellow") return "border-amber-500";
  return "border-red-500";
}

/* ---------- chart config ---------- */
const chartConfig = {
  morningBefore: { label: "Утро до инг.", color: "#f97316" },
  morningAfter: { label: "Утро после инг.", color: "#ea580c" },
  eveningBefore: { label: "Вечер до инг.", color: "#8b5cf6" },
  eveningAfter: { label: "Вечер после инг.", color: "#7c3aed" },
} satisfies ChartConfig;

/* ---------- theme helper ---------- */
function getEffectiveTheme(settingsTheme: "light" | "dark" | "system"): "light" | "dark" {
  if (settingsTheme === "system") {
    if (typeof window !== "undefined") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return "light";
  }
  return settingsTheme;
}

/* ---------- main component ---------- */
export function PeakFlowDiary() {
  const [measurements, setMeasurements] = useState<Measurement[]>(() => loadMeasurements());
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [inputValue, setInputValue] = useState(() => {
    const saved = loadMeasurements();
    return saved.length > 0 ? String(saved[saved.length - 1].value) : "";
  });

  // #2: Auto morning/evening by system time (before 15:00 = morning)
  const [period, setPeriod] = useState<"morning" | "evening">(() => {
    const hour = new Date().getHours();
    return hour < 15 ? "morning" : "evening";
  });
  const [timing, setTiming] = useState<"before" | "after">("before");
  const [pbInput, setPbInput] = useState(() => String(loadSettings().personalBest));
  const [reminderMinInput, setReminderMinInput] = useState(() => String(loadSettings().reminderMinutes));
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => loadNotificationsPref());
  const [reminderTimeout, setReminderTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [editingPB, setEditingPB] = useState(false);
  const [editingReminder, setEditingReminder] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [chartDays, setChartDays] = useState(14);

  // #1: Date/time picker for measurements
  const [selectedDate, setSelectedDate] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));
  const [selectedTime, setSelectedTime] = useState<string>(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);

  // #5: Theme state
  const [theme, setTheme] = useState<"light" | "dark" | "system">(() => loadSettings().theme);

  // #4: Easter egg state
  const [tapCount, setTapCount] = useState(0);
  const [showEasterEgg, setShowEasterEgg] = useState(false);

  // #6: Swipe support for tabs
  const [activeTab, setActiveTab] = useState("input");
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  // Apply theme on mount and changes
  useEffect(() => {
    const effective = getEffectiveTheme(theme);
    document.documentElement.classList.toggle("dark", effective === "dark");
    document.documentElement.style.colorScheme = effective;
  }, [theme]);

  // Listen for system theme changes
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      document.documentElement.classList.toggle("dark", mq.matches);
      document.documentElement.style.colorScheme = mq.matches ? "dark" : "light";
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  // Auto-update: listen for SW update notification
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "SW_UPDATED") {
        toast.info("Доступна новая версия приложения", {
          description: "Нажмите для обновления",
          duration: 15000,
          action: {
            label: "Обновить",
            onClick: () => window.location.reload(),
          },
        });
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, []);

  /* --- add measurement (#1: with custom date/time) --- */
  const addMeasurement = () => {
    const val = parseInt(inputValue);
    if (isNaN(val) || val < 50 || val > 900) {
      toast.error("Введите корректное значение ПСВ (50-900 л/мин)");
      return;
    }

    const measurementDateTime = new Date(`${selectedDate}T${selectedTime}`);
    const now = new Date();

    // Validate: future dates not allowed
    if (measurementDateTime > now) {
      toast.error("Нельзя записать замер в будущем");
      return;
    }

    const newM: Measurement = {
      id: generateId(),
      value: val,
      period,
      timing,
      date: measurementDateTime.toISOString(),
      createdAt: now.toISOString(),
    };

    const updated = [...measurements, newM];
    setMeasurements(updated);
    saveMeasurements(updated);
    setInputValue(String(val));

    // #10: Auto-update personal best if new value is higher
    if (val > settings.personalBest) {
      const newSettings = { ...settings, personalBest: val };
      setSettings(newSettings);
      saveSettings(newSettings);
      setPbInput(String(val));
      toast.success(`Новый персональный лучший результат: ${val} л/мин!`);
    }

    // #3: Auto-switch before→after with reminder
    if (timing === "before") {
      setTiming("after");
      scheduleReminder();
    } else {
      setTiming("before");
    }

    const periodLabel = period === "morning" ? "утро" : "вечер";
    const timingLabel = timing === "before" ? "до" : "после";
    toast.success(`Записано: ${val} л/мин (${periodLabel}, ${timingLabel} ингаляции)`);

    inputRef.current?.focus();
  };

  /* --- delete measurement --- */
  const deleteMeasurement = (id: string) => {
    const updated = measurements.filter((m) => m.id !== id);
    setMeasurements(updated);
    saveMeasurements(updated);
    toast.success("Запись удалена");
  };

  /* --- update personal best --- */
  const savePB = () => {
    const val = parseInt(pbInput);
    if (isNaN(val) || val < 50 || val > 900) {
      toast.error("Введите корректное значение (50-900)");
      return;
    }
    const updated = { ...settings, personalBest: val };
    setSettings(updated);
    saveSettings(updated);
    setEditingPB(false);
    toast.success(`Персональный лучший результат: ${val} л/мин`);
  };

  /* --- save reminder minutes (#3: configurable) --- */
  const saveReminderMin = () => {
    const val = parseInt(reminderMinInput);
    if (isNaN(val) || val < 1 || val > 120) {
      toast.error("Введите корректное значение (1-120 минут)");
      return;
    }
    const updated = { ...settings, reminderMinutes: val };
    setSettings(updated);
    saveSettings(updated);
    setEditingReminder(false);
    toast.success(`Напоминание через ${val} мин.`);
  };

  /* --- theme toggle (#5) --- */
  const cycleTheme = () => {
    const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(next);
    const updated = { ...settings, theme: next };
    setSettings(updated);
    saveSettings(updated);
  };

  /* --- notifications (#3: configurable delay) --- */
  const scheduleReminder = () => {
    if (!loadNotificationsPref()) return;
    if (reminderTimeout) clearTimeout(reminderTimeout);
    const delay = settings.reminderMinutes * 60 * 1000;
    const timeout = setTimeout(() => {
      if (Notification.permission === "granted") {
        new Notification("Дневник пикфлоуметрии", {
          body: `Прошло ${settings.reminderMinutes} мин. — время сделать замер после ингаляции!`,
          tag: "peakflow-reminder",
        });
      }
      toast.info(`Прошло ${settings.reminderMinutes} мин. — время сделать замер после ингаляции!`, {
        duration: 10000,
      });
    }, delay);
    setReminderTimeout(timeout);
  };

  const toggleNotifications = async () => {
    if (!notificationsEnabled) {
      if ("Notification" in window) {
        const perm = await Notification.requestPermission();
        if (perm === "granted") {
          setNotificationsEnabled(true);
          saveNotificationsPref(true);
          toast.success("Уведомления включены");
        } else {
          toast.error("Разрешите уведомления в настройках браузера");
        }
      } else {
        toast.error("Уведомления не поддерживаются в этом браузере");
      }
    } else {
      setNotificationsEnabled(false);
      saveNotificationsPref(false);
      if (reminderTimeout) clearTimeout(reminderTimeout);
      toast.success("Уведомления выключены");
    }
  };

  /* --- CSV export (#9: Upload icon = arrow up) --- */
  const exportCSV = () => {
    const sorted = [...measurements].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const pb = settings.personalBest;
    const greenMin = round10(pb * 0.8);
    const yellowMin = round10(pb * 0.5);

    const bom = "\uFEFF";
    const header = "Дата;Время;Период;Тип;ПСВ (л/мин);Зона\n";

    const rows = sorted
      .map((m) => {
        const d = new Date(m.date);
        const dateStr = d.toLocaleDateString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        });
        const timeStr = d.toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
        });
        const periodStr = m.period === "morning" ? "Утро" : "Вечер";
        const timingStr = m.timing === "before" ? "До ингаляции" : "После ингаляции";
        const zone = m.value >= greenMin ? "Зелёная" : m.value >= yellowMin ? "Жёлтая" : "Красная";
        return `${dateStr};${timeStr};${periodStr};${timingStr};${m.value};${zone}`;
      })
      .join("\n");

    const csv = bom + header + rows;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `peakflow_${format(new Date(), "yyyy-MM-dd")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("CSV-файл загружен");
  };

  /* --- CSV import --- */
  const importCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        // Remove BOM if present
        const cleaned = text.replace(/^\uFEFF/, "");
        const lines = cleaned.split("\n").filter((l) => l.trim());

        if (lines.length < 2) {
          toast.error("Файл пуст или не содержит данных");
          return;
        }

        // Skip header row
        const dataLines = lines.slice(1);
        const imported: Measurement[] = [];

        for (const line of dataLines) {
          const parts = line.split(";").map((s) => s.trim());
          if (parts.length < 5) continue;

          const [dateStr, timeStr, periodStr, timingStr, valueStr] = parts;
          const value = parseInt(valueStr);
          if (isNaN(value) || value < 50 || value > 900) continue;

          // Parse date and time (format: DD.MM.YYYY, HH:mm)
          const period: "morning" | "evening" = periodStr.toLowerCase().startsWith("утр") ? "morning" : "evening";
          const timing: "before" | "after" = timingStr.toLowerCase().includes("до") ? "before" : "after";

          // Parse DD.MM.YYYY
          const dateParts = dateStr.split(".");
          const day = parseInt(dateParts[0]);
          const month = parseInt(dateParts[1]) - 1;
          const year = parseInt(dateParts[2]);
          // Parse HH:mm
          const timeParts = timeStr.split(":");
          const hour = parseInt(timeParts[0]);
          const minute = parseInt(timeParts[1]);

          const date = new Date(year, month, day, hour, minute);

          if (isNaN(date.getTime())) continue;

          imported.push({
            id: generateId(),
            value,
            period,
            timing,
            date: date.toISOString(),
            createdAt: new Date().toISOString(),
          });
        }

        if (imported.length === 0) {
          toast.error("Не удалось прочитать записи из файла");
          return;
        }

        // Merge with existing: add imported, skip duplicates by date+period+timing
        const existing = [...measurements];
        let added = 0;
        let skipped = 0;

        for (const m of imported) {
          const isDupe = existing.some(
            (e) =>
              format(new Date(e.date), "yyyy-MM-dd HH:mm") === format(new Date(m.date), "yyyy-MM-dd HH:mm") &&
              e.period === m.period &&
              e.timing === m.timing
          );
          if (isDupe) {
            skipped++;
          } else {
            existing.push(m);
            added++;
          }
        }

        const merged = existing;
        setMeasurements(merged);
        saveMeasurements(merged);

        // Auto-update personal best if any imported value is higher
        const maxImported = Math.max(...imported.map((m) => m.value));
        if (maxImported > settings.personalBest) {
          const newSettings = { ...settings, personalBest: maxImported };
          setSettings(newSettings);
          saveSettings(newSettings);
          setPbInput(String(maxImported));
        }

        toast.success(`Импортировано: ${added} записей${skipped > 0 ? `, пропущено (дубли): ${skipped}` : ""}`);
      } catch {
        toast.error("Ошибка чтения CSV-файла");
      }
    };
    reader.readAsText(file, "utf-8");
    // Reset input so same file can be re-imported
    event.target.value = "";
  };

  /* --- settings button: switch to input tab + scroll --- */
  const openSettings = () => {
    setActiveTab("input");
    setShowSettings(true);
    setTimeout(() => {
      settingsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  /* --- chart data --- */
  const chartData = React.useMemo(() => {
    const days = Array.from({ length: chartDays }, (_, i) => {
      const d = startOfDay(subDays(new Date(), chartDays - 1 - i));
      const dayStr = format(d, "yyyy-MM-dd");
      const keys = [
        { key: "morningBefore", period: "morning" as const, timing: "before" as const },
        { key: "morningAfter", period: "morning" as const, timing: "after" as const },
        { key: "eveningBefore", period: "evening" as const, timing: "before" as const },
        { key: "eveningAfter", period: "evening" as const, timing: "after" as const },
      ];

      const point: Record<string, string | number> = {
        date: format(d, "dd.MM", { locale: ru }),
      };
      for (const { key, period: p, timing: t } of keys) {
        const m = measurements.find(
          (m) =>
            format(new Date(m.date), "yyyy-MM-dd") === dayStr &&
            m.period === p &&
            m.timing === t
        );
        point[key] = m ? m.value : (undefined as unknown as number);
      }
      return point;
    });
    return days;
  }, [measurements, chartDays]);

  const greenMin = round10(settings.personalBest * 0.8);
  const yellowMin = round10(settings.personalBest * 0.5);

  /* --- today's measurements --- */
  const todayMeasurements = React.useMemo(() => {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    return measurements.filter(
      (m) => format(new Date(m.date), "yyyy-MM-dd") === todayStr
    );
  }, [measurements]);

  const todayDone = (p: "morning" | "evening", t: "before" | "after") =>
    todayMeasurements.some((m) => m.period === p && m.timing === t);

  /* --- history list --- */
  const historyList = React.useMemo(() => {
    return [...measurements]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 20);
  }, [measurements]);

  /* --- #4: Easter egg --- */
  const handleTitleTap = () => {
    setTapCount((prev) => {
      const next = prev + 1;
      if (next >= 5) {
        setShowEasterEgg(true);
        setTimeout(() => {
          setShowEasterEgg(false);
          setTapCount(0);
        }, 3000);
        return 0;
      }
      return next;
    });
  };

  /* --- #6: Swipe handlers for tabs --- */
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!touchStartX.current || !touchEndX.current) return;
    const diff = touchStartX.current - touchEndX.current;
    const tabs = ["input", "chart", "history"];
    const currentIndex = tabs.indexOf(activeTab);
    if (Math.abs(diff) > 50) {
      if (diff > 0 && currentIndex < tabs.length - 1) {
        setActiveTab(tabs[currentIndex + 1]);
      } else if (diff < 0 && currentIndex > 0) {
        setActiveTab(tabs[currentIndex - 1]);
      }
    }
    touchStartX.current = null;
    touchEndX.current = null;
  }, [activeTab]);

  const isDark = getEffectiveTheme(theme) === "dark";

  return (
    <div className={`min-h-screen flex flex-col ${isDark ? "dark bg-gradient-to-b from-slate-950 to-slate-900" : "bg-gradient-to-b from-slate-50 to-slate-100"}`}>
      {/* Header — #8: renamed, #5: theme-aware */}
      <header className={`backdrop-blur-sm border-b sticky top-0 z-10 ${isDark ? "bg-slate-900/80 border-slate-800" : "bg-white/80 border-slate-200"}`}>
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div
            className="flex items-center gap-2 cursor-pointer select-none"
            onClick={handleTitleTap}
          >
            <Wind className="h-6 w-6 text-emerald-500" />
            <h1 className={`text-lg font-bold ${isDark ? "text-slate-100" : "text-slate-800"}`}>
              Дневник пикфлоуметрии
            </h1>
          </div>
          <div className="flex items-center gap-1">
            {/* #5: Theme toggle button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={cycleTheme}
              className="h-9 w-9"
              title={`Тема: ${theme === "light" ? "светлая" : theme === "dark" ? "тёмная" : "системная"}`}
            >
              <Palette className={`h-4 w-4 ${theme === "light" ? "text-amber-500" : theme === "dark" ? "text-indigo-400" : "text-emerald-600"}`} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleNotifications}
              className="h-9 w-9"
              title={notificationsEnabled ? "Выключить уведомления" : "Включить уведомления"}
            >
              {notificationsEnabled ? (
                <Bell className="h-4 w-4 text-emerald-600" />
              ) : (
                <BellOff className={`h-4 w-4 ${isDark ? "text-slate-500" : "text-slate-400"}`} />
              )}
            </Button>
            {/* #9: Upload icon (arrow up from container) instead of Download */}
            <Button
              variant="ghost"
              size="icon"
              onClick={exportCSV}
              className="h-9 w-9"
              title="Экспорт CSV"
            >
              <Upload className={`h-4 w-4 ${isDark ? "text-slate-300" : "text-slate-600"}`} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={openSettings}
              className="h-9 w-9"
              title="Настройки"
            >
              <Settings className={`h-4 w-4 ${isDark ? "text-slate-300" : "text-slate-600"}`} />
            </Button>
          </div>
        </div>
      </header>

      {/* #4: Easter egg popup */}
      {showEasterEgg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className={`rounded-2xl p-6 mx-4 text-center shadow-2xl max-w-xs ${isDark ? "bg-slate-800" : "bg-white"}`}>
            <div className="text-4xl mb-2">🫁</div>
            <h2 className={`text-lg font-bold mb-1 ${isDark ? "text-slate-100" : "text-slate-800"}`}>Simple PFM Diary</h2>
            <p className={`text-sm mb-3 ${isDark ? "text-slate-400" : "text-muted-foreground"}`}>Версия {APP_VERSION}</p>
            <p className={`text-xs ${isDark ? "text-slate-500" : "text-muted-foreground"}`}>
              Дышите свободно! Данные хранятся только на вашем устройстве.
            </p>
            <div className="mt-3 text-xs text-emerald-600 font-mono">v{APP_VERSION}</div>
          </div>
        </div>
      )}

      {/* Main content — #6: swipe handlers */}
      <main
        className="flex-1 max-w-lg mx-auto w-full px-4 py-4 pb-8"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className={`w-full grid grid-cols-3 ${isDark ? "bg-slate-800" : ""}`}>
            <TabsTrigger value="input" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              <span className="text-xs sm:text-sm">Ввод</span>
            </TabsTrigger>
            <TabsTrigger value="chart" className="gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              <span className="text-xs sm:text-sm">График</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              <span className="text-xs sm:text-sm">История</span>
            </TabsTrigger>
          </TabsList>

          {/* ===== INPUT TAB ===== */}
          <TabsContent value="input">
            <div className="space-y-4 mt-4">
              {/* Today's checklist */}
              <Card className={isDark ? "border-slate-700 bg-slate-800/50" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className={`text-sm font-medium flex items-center gap-2 ${isDark ? "text-slate-200" : ""}`}>
                    <Check className="h-4 w-4 text-emerald-500" />
                    Сегодня, {format(new Date(), "dd MMMM", { locale: ru })}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { p: "morning" as const, t: "before" as const, label: "Утро (до)", icon: Sun },
                        { p: "morning" as const, t: "after" as const, label: "Утро (после)", icon: Sun },
                        { p: "evening" as const, t: "before" as const, label: "Вечер (до)", icon: Moon },
                        { p: "evening" as const, t: "after" as const, label: "Вечер (после)", icon: Moon },
                      ] as const
                    ).map(({ p, t, label, icon: Icon }) => (
                      <div
                        key={`${p}-${t}`}
                        className={`flex items-center gap-2 rounded-lg border p-2.5 text-sm transition-colors ${
                          isDark
                            ? todayDone(p, t)
                              ? "bg-emerald-950/50 border-emerald-800 text-emerald-300"
                              : "bg-slate-800 border-slate-700 text-slate-500"
                            : todayDone(p, t)
                              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                              : "bg-slate-50 border-slate-200 text-slate-500"
                        } ${period === p && timing === t ? "ring-2 ring-emerald-500 ring-offset-1" : ""}`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="text-xs font-medium leading-tight">{label}</span>
                        {todayDone(p, t) && (
                          <Check className="h-3.5 w-3.5 text-emerald-500 ml-auto shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Input card */}
              <Card className={`border-2 ${isDark ? "border-emerald-800 bg-slate-800/50" : "border-emerald-200"}`}>
                <CardHeader className="pb-2">
                  <CardTitle className={`text-base font-semibold ${isDark ? "text-slate-100" : ""}`}>Новый замер</CardTitle>
                  <CardDescription className={isDark ? "text-slate-400" : ""}>
                    {period === "morning" ? (
                      <span className="flex items-center gap-1">
                        <Sun className="h-3.5 w-3.5 text-amber-500" /> Утро
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <Moon className="h-3.5 w-3.5 text-indigo-400" /> Вечер
                      </span>
                    )}
                    {" — "}
                    {timing === "before" ? "до ингаляции" : `через ${settings.reminderMinutes} мин после ингаляции`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* #1: Date/time picker */}
                  <div className={`rounded-lg border p-3 space-y-2 ${isDark ? "border-slate-700 bg-slate-900/50" : "bg-slate-50"}`}>
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span className={`text-xs font-medium ${isDark ? "text-slate-300" : "text-muted-foreground"}`}>Дата и время замера</span>
                      {isToday(parseISO(selectedDate)) ? (
                        <Badge variant="secondary" className="text-xs px-1.5 py-0 ml-auto">Сейчас</Badge>
                      ) : (
                        <button
                          onClick={() => {
                            const now = new Date();
                            setSelectedDate(format(now, "yyyy-MM-dd"));
                            setSelectedTime(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
                          }}
                          className="text-xs text-emerald-600 hover:text-emerald-700 ml-auto"
                        >
                          Сбросить на сейчас
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        max={format(new Date(), "yyyy-MM-dd")}
                        className={`flex-1 h-9 text-sm ${isDark ? "bg-slate-800 border-slate-600 text-slate-200" : ""}`}
                      />
                      <Input
                        type="time"
                        value={selectedTime}
                        onChange={(e) => setSelectedTime(e.target.value)}
                        className={`w-24 h-9 text-sm ${isDark ? "bg-slate-800 border-slate-600 text-slate-200" : ""}`}
                      />
                    </div>
                  </div>

                  {/* Period toggle */}
                  <div className="flex gap-2">
                    <Button
                      variant={period === "morning" ? "default" : "outline"}
                      size="sm"
                      className="flex-1 gap-1.5"
                      onClick={() => setPeriod("morning")}
                    >
                      <Sun className="h-3.5 w-3.5" /> Утро
                    </Button>
                    <Button
                      variant={period === "evening" ? "default" : "outline"}
                      size="sm"
                      className="flex-1 gap-1.5"
                      onClick={() => setPeriod("evening")}
                    >
                      <Moon className="h-3.5 w-3.5" /> Вечер
                    </Button>
                  </div>

                  {/* Timing toggle */}
                  <div className="flex gap-2">
                    <Button
                      variant={timing === "before" ? "default" : "outline"}
                      size="sm"
                      className="flex-1"
                      onClick={() => setTiming("before")}
                    >
                      До ингаляции
                    </Button>
                    <Button
                      variant={timing === "after" ? "default" : "outline"}
                      size="sm"
                      className="flex-1"
                      onClick={() => setTiming("after")}
                    >
                      После ингаляции
                    </Button>
                  </div>

                  {/* Value input with +/- buttons */}
                  <div className="space-y-2">
                    <label className={`text-xs block ${isDark ? "text-slate-400" : "text-muted-foreground"}`}>
                      ПСВ (л/мин)
                    </label>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="lg"
                        className="h-14 w-14 shrink-0 text-lg font-bold"
                        onClick={() => {
                          const cur = parseInt(inputValue) || 0;
                          const next = Math.max(50, cur - 10);
                          setInputValue(String(next));
                        }}
                        disabled={!inputValue || parseInt(inputValue) <= 50}
                      >
                        <Minus className="h-5 w-5" />
                      </Button>
                      <Input
                        ref={inputRef}
                        type="number"
                        inputMode="numeric"
                        placeholder="250"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") addMeasurement();
                        }}
                        min={50}
                        max={900}
                        className={`text-2xl font-bold h-14 text-center flex-1 ${isDark ? "bg-slate-800 border-slate-600 text-slate-100" : ""}`}
                      />
                      <Button
                        variant="outline"
                        size="lg"
                        className="h-14 w-14 shrink-0 text-lg font-bold"
                        onClick={() => {
                          const cur = parseInt(inputValue) || 0;
                          const next = Math.min(900, cur + 10);
                          setInputValue(String(next));
                        }}
                        disabled={!inputValue || parseInt(inputValue) >= 900}
                      >
                        <Plus className="h-5 w-5" />
                      </Button>
                    </div>
                    <Button
                      size="lg"
                      className="w-full h-12 text-base font-semibold bg-emerald-600 hover:bg-emerald-700"
                      onClick={addMeasurement}
                    >
                      <Plus className="h-5 w-5 mr-1" />
                      Записать
                    </Button>
                  </div>

                  {/* Zone indicator */}
                  {inputValue && !isNaN(parseInt(inputValue)) && (
                    <div
                      className={`flex items-center justify-center gap-2 rounded-lg p-3 border-l-4 ${zoneBorderColor(
                        getZone(parseInt(inputValue), settings.personalBest)
                      )} ${
                        getZone(parseInt(inputValue), settings.personalBest) === "green"
                          ? isDark ? "bg-emerald-950/30" : "bg-emerald-50"
                          : getZone(parseInt(inputValue), settings.personalBest) === "yellow"
                            ? isDark ? "bg-amber-950/30" : "bg-amber-50"
                            : isDark ? "bg-red-950/30" : "bg-red-50"
                      }`}
                    >
                      <div className={`h-3 w-3 rounded-full ${zoneColor(getZone(parseInt(inputValue), settings.personalBest))}`} />
                      <span className="text-sm font-medium">
                        {zoneLabel(getZone(parseInt(inputValue), settings.personalBest))} зона
                      </span>
                      <span className={`text-xs ml-1 ${isDark ? "text-slate-400" : "text-muted-foreground"}`}>
                        ({parseInt(inputValue)} / {settings.personalBest})
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Zone legend + Settings (collapsed by default) */}
              <Card ref={settingsRef} className={isDark ? "border-slate-700 bg-slate-800/50" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className={`text-sm font-medium flex items-center gap-2 cursor-pointer ${isDark ? "text-slate-200" : ""}`}
                    onClick={() => setShowSettings(!showSettings)}
                  >
                    <Settings className="h-4 w-4" />
                    Зоны и настройки
                    <span className={`ml-auto text-xs transition-transform ${showSettings ? "rotate-180" : ""}`}>&#9660;</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className={`${showSettings ? "" : "hidden"} space-y-3`}>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-emerald-500" />
                        <span className={isDark ? "text-slate-200" : ""}>Зелёная</span>
                      </div>
                      <span className={isDark ? "text-slate-400" : "text-muted-foreground"}>
                        {greenMin}–{settings.personalBest} л/мин
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-amber-500" />
                        <span className={isDark ? "text-slate-200" : ""}>Жёлтая</span>
                      </div>
                      <span className={isDark ? "text-slate-400" : "text-muted-foreground"}>
                        {yellowMin}–{greenMin - 1} л/мин
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-red-500" />
                        <span className={isDark ? "text-slate-200" : ""}>Красная</span>
                      </div>
                      <span className={isDark ? "text-slate-400" : "text-muted-foreground"}>
                        &lt; {yellowMin} л/мин
                      </span>
                    </div>
                  </div>

                  {/* Personal best setting — #10: auto-update + manual edit */}
                  <div className={`border-t pt-3 ${isDark ? "border-slate-700" : ""}`}>
                    {editingPB ? (
                      <div className="flex items-center gap-2">
                        <label className={`text-xs whitespace-nowrap ${isDark ? "text-slate-400" : "text-muted-foreground"}`}>
                          Перс. лучший:
                        </label>
                        <Input
                          type="number"
                          value={pbInput}
                          onChange={(e) => setPbInput(e.target.value)}
                          className={`h-8 w-24 text-center ${isDark ? "bg-slate-700 border-slate-600 text-slate-100" : ""}`}
                          min={50}
                          max={900}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") savePB();
                            if (e.key === "Escape") setEditingPB(false);
                          }}
                        />
                        <Button size="sm" className="h-8" onClick={savePB}>OK</Button>
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingPB(false)}>Отмена</Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditingPB(true)}
                        className={`text-sm transition-colors flex items-center gap-1 ${isDark ? "text-slate-400 hover:text-slate-200" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        Персональный лучший: <strong className={isDark ? "text-slate-100" : "text-foreground"}>{settings.personalBest} л/мин</strong>
                        <span className={`text-xs ${isDark ? "text-slate-500" : ""}`}>(нажмите чтобы изменить)</span>
                      </button>
                    )}
                  </div>

                  {/* #3: Configurable reminder delay */}
                  <div className={`border-t pt-3 ${isDark ? "border-slate-700" : ""}`}>
                    {editingReminder ? (
                      <div className="flex items-center gap-2">
                        <label className={`text-xs whitespace-nowrap ${isDark ? "text-slate-400" : "text-muted-foreground"}`}>
                          Напоминание через:
                        </label>
                        <Input
                          type="number"
                          value={reminderMinInput}
                          onChange={(e) => setReminderMinInput(e.target.value)}
                          className={`h-8 w-16 text-center ${isDark ? "bg-slate-700 border-slate-600 text-slate-100" : ""}`}
                          min={1}
                          max={120}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveReminderMin();
                            if (e.key === "Escape") setEditingReminder(false);
                          }}
                        />
                        <span className={`text-xs ${isDark ? "text-slate-400" : "text-muted-foreground"}`}>мин.</span>
                        <Button size="sm" className="h-8" onClick={saveReminderMin}>OK</Button>
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingReminder(false)}>Отмена</Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditingReminder(true)}
                        className={`text-sm transition-colors flex items-center gap-1 ${isDark ? "text-slate-400 hover:text-slate-200" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        <Bell className="h-3.5 w-3.5" />
                        Напоминание: <strong className={isDark ? "text-slate-100" : "text-foreground"}>{settings.reminderMinutes} мин.</strong>
                        <span className={`text-xs ${isDark ? "text-slate-500" : ""}`}>(нажмите чтобы изменить)</span>
                      </button>
                    )}
                  </div>

                  {/* CSV Import/Export */}
                  <div className={`border-t pt-3 ${isDark ? "border-slate-700" : ""}`}>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 gap-1.5 text-xs"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Download className="h-3.5 w-3.5" />
                        Импорт CSV
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 gap-1.5 text-xs"
                        onClick={exportCSV}
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Экспорт CSV
                      </Button>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={importCSV}
                    />
                    <p className={`text-xs mt-2 ${isDark ? "text-slate-500" : "text-muted-foreground"}`}>
                      Импорт объединяет данные. Дубли не создаются.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ===== CHART TAB ===== */}
          <TabsContent value="chart">
            <div className="space-y-4 mt-4">
              <Card className={isDark ? "border-slate-700 bg-slate-800/50" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className={`text-base font-semibold flex items-center gap-2 ${isDark ? "text-slate-100" : ""}`}>
                      <Activity className="h-4 w-4 text-emerald-500" />
                      Динамика ПСВ
                    </CardTitle>
                    <div className="flex gap-1">
                      <Button
                        variant={chartDays === 7 ? "default" : "outline"}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setChartDays(7)}
                      >
                        7 дн
                      </Button>
                      <Button
                        variant={chartDays === 14 ? "default" : "outline"}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setChartDays(14)}
                      >
                        14 дн
                      </Button>
                      <Button
                        variant={chartDays === 30 ? "default" : "outline"}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setChartDays(30)}
                      >
                        30 дн
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={chartConfig} className="h-[300px] w-full">
                    <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11 }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        domain={[0, "auto"]}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11 }}
                        label={{
                          value: "л/мин",
                          angle: -90,
                          position: "insideLeft",
                          style: { fontSize: 11 },
                        }}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <ChartLegend content={<ChartLegendContent />} />

                      <ReferenceArea y1={greenMin} y2={settings.personalBest} fill="#10b981" fillOpacity={0.06} />
                      <ReferenceArea y1={yellowMin} y2={greenMin} fill="#f59e0b" fillOpacity={0.06} />
                      <ReferenceArea y1={0} y2={yellowMin} fill="#ef4444" fillOpacity={0.06} />

                      <ReferenceLine y={greenMin} stroke="#10b981" strokeDasharray="6 3" strokeWidth={1}
                        label={{ value: "80%", position: "right", style: { fontSize: 10, fill: "#10b981" } }} />
                      <ReferenceLine y={yellowMin} stroke="#f59e0b" strokeDasharray="6 3" strokeWidth={1}
                        label={{ value: "50%", position: "right", style: { fontSize: 10, fill: "#f59e0b" } }} />
                      <ReferenceLine y={settings.personalBest} stroke="#10b981" strokeDasharray="3 3" strokeWidth={1.5}
                        label={{ value: `ПЛР ${settings.personalBest}`, position: "left", style: { fontSize: 10, fill: "#10b981" } }} />

                      <Line type="monotone" dataKey="morningBefore" stroke="var(--color-morningBefore)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      <Line type="monotone" dataKey="morningAfter" stroke="var(--color-morningAfter)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      <Line type="monotone" dataKey="eveningBefore" stroke="var(--color-eveningBefore)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      <Line type="monotone" dataKey="eveningAfter" stroke="var(--color-eveningAfter)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    </LineChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ===== HISTORY TAB ===== */}
          <TabsContent value="history">
            <div className="space-y-4 mt-4">
              <Card className={isDark ? "border-slate-700 bg-slate-800/50" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className={`text-base font-semibold flex items-center gap-2 ${isDark ? "text-slate-100" : ""}`}>
                      <Clock className="h-4 w-4" />
                      Последние записи
                    </CardTitle>
                    {/* #9: Upload icon in history too */}
                    <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={exportCSV}>
                      <Upload className="h-3 w-3" /> CSV
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {historyList.length === 0 ? (
                    <div className={`text-center text-sm py-8 ${isDark ? "text-slate-500" : "text-muted-foreground"}`}>
                      <Wind className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                      <p>Записей пока нет</p>
                      <p className="text-xs mt-1">Начните вводить данные пикфлоуметрии</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[500px] overflow-y-auto">
                      {historyList.map((m) => {
                        const d = new Date(m.date);
                        const zone = getZone(m.value, settings.personalBest);
                        return (
                          <div
                            key={m.id}
                            className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${zoneBorderColor(zone)} ${isDark ? "bg-slate-800/80" : "bg-white"}`}
                          >
                            <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${zoneColor(zone)}`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 text-sm font-medium">
                                <span className="text-lg font-bold">{m.value}</span>
                                <span className={`text-xs ${isDark ? "text-slate-400" : "text-muted-foreground"}`}>л/мин</span>
                                <Badge variant="secondary" className="text-xs px-1.5 py-0 ml-auto shrink-0">
                                  {zoneLabel(zone)}
                                </Badge>
                              </div>
                              <div className={`text-xs mt-0.5 flex items-center gap-1.5 ${isDark ? "text-slate-400" : "text-muted-foreground"}`}>
                                {m.period === "morning" ? (
                                  <Sun className="h-3 w-3 text-amber-400" />
                                ) : (
                                  <Moon className="h-3 w-3 text-indigo-400" />
                                )}
                                <span>
                                  {m.period === "morning" ? "Утро" : "Вечер"},{" "}
                                  {m.timing === "before" ? "до" : "после"} ингаляции
                                </span>
                                <span className="text-slate-300">|</span>
                                <span>{format(d, "dd.MM.yy, HH:mm", { locale: ru })}</span>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`h-8 w-8 shrink-0 ${isDark ? "text-slate-500 hover:text-red-400" : "text-slate-400 hover:text-red-500"}`}
                              onClick={() => deleteMeasurement(m.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer — #7: no Node.js badge; #8: correct name */}
      <footer className={`mt-auto border-t backdrop-blur-sm ${isDark ? "border-slate-800 bg-slate-900/80" : "border-slate-200 bg-white/80"}`}>
        <div className={`max-w-lg mx-auto px-4 py-3 text-center text-xs ${isDark ? "text-slate-500" : "text-muted-foreground"}`}>
          Все данные хранятся только на этом устройстве. Интернет не нужен.
        </div>
      </footer>
    </div>
  );
}
