"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import { format, subDays, startOfDay } from "date-fns";
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
  Trash2,
  Download,
  Settings,
  Activity,
  Wind,
  Bell,
  BellOff,
  Clock,
  Check,
} from "lucide-react";
import { toast } from "sonner";

/* ---------- types ---------- */
interface Measurement {
  id: string;
  value: number;
  period: "morning" | "evening";
  timing: "before" | "after";
  date: string; // ISO string
  createdAt: string;
}

interface AppSettings {
  personalBest: number;
}

/* ---------- local storage helpers ---------- */
const STORAGE_KEYS = {
  measurements: "peakflow_measurements",
  settings: "peakflow_settings",
  notifications: "peakflow_notifications",
} as const;

function loadMeasurements(): Measurement[] {
  if (typeof window === "undefined") return [];
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
  if (typeof window === "undefined") return { personalBest: 400 };
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    return raw ? JSON.parse(raw) : { personalBest: 400 };
  } catch {
    return { personalBest: 400 };
  }
}

function saveSettings(data: AppSettings) {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(data));
}

function loadNotificationsPref(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEYS.notifications) === "true";
}

function saveNotificationsPref(val: boolean) {
  localStorage.setItem(STORAGE_KEYS.notifications, JSON.stringify(val));
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ---------- zone helpers ---------- */
function getZone(value: number, pb: number): "green" | "yellow" | "red" {
  if (value >= pb * 0.8) return "green";
  if (value >= pb * 0.5) return "yellow";
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

/* ---------- main component ---------- */
export default function PeakFlowDiary() {
  const [mounted, setMounted] = useState(false);

  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [settings, setSettings] = useState<AppSettings>({ personalBest: 400 });
  const [inputValue, setInputValue] = useState("");
  const [period, setPeriod] = useState<"morning" | "evening">("morning");
  const [timing, setTiming] = useState<"before" | "after">("before");
  const [pbInput, setPbInput] = useState("400");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [reminderTimeout, setReminderTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [editingPB, setEditingPB] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [chartDays, setChartDays] = useState(14);

  /* --- load data from localStorage once after mount --- */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time init from browser API (localStorage)
    setMeasurements(loadMeasurements());
    const s = loadSettings();
    setSettings(s);
    setPbInput(String(s.personalBest));
    setNotificationsEnabled(loadNotificationsPref());
    const hour = new Date().getHours();
    setPeriod(hour >= 5 && hour < 15 ? "morning" : "evening");
    setMounted(true);
  }, []);

  /* --- add measurement --- */
  const addMeasurement = () => {
    const val = parseInt(inputValue);
    if (isNaN(val) || val < 50 || val > 900) {
      toast.error("Введите корректное значение ПСВ (50-900 л/мин)");
      return;
    }

    const now = new Date();
    const newM: Measurement = {
      id: generateId(),
      value: val,
      period,
      timing,
      date: now.toISOString(),
      createdAt: now.toISOString(),
    };

    const updated = [...measurements, newM];
    setMeasurements(updated);
    saveMeasurements(updated);

    setInputValue("");

    // If this is a "before" measurement, switch to "after" and schedule reminder
    if (timing === "before") {
      setTiming("after");
      scheduleReminder();
    } else {
      setTiming("before");
    }

    toast.success(`Записано: ${val} л/мин (${period === "morning" ? "утро" : "вечер"}, ${timing === "before" ? "до" : "после"} ингаляции)`);
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

  /* --- notifications --- */
  const scheduleReminder = () => {
    const notifPref = loadNotificationsPref();
    if (!notifPref) return;
    if (reminderTimeout) clearTimeout(reminderTimeout);
    const timeout = setTimeout(() => {
      if (Notification.permission === "granted") {
        new Notification("Пикфлоуметрия", {
          body: "Прошло 30 минут — время сделать замер после ингаляции!",
          tag: "peakflow-reminder",
        });
      }
      toast.info("Прошло 30 минут — время сделать замер после ингаляции!", {
        duration: 10000,
      });
    }, 30 * 60 * 1000); // 30 minutes
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

  /* --- CSV export (fully client-side) --- */
  const exportCSV = () => {
    const sorted = [...measurements].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const pb = settings.personalBest;
    const greenMin = Math.round(pb * 0.8);
    const yellowMin = Math.round(pb * 0.5);

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
        const timingStr =
          m.timing === "before" ? "До ингаляции" : "После ингаляции";
        const zone =
          m.value >= greenMin
            ? "Зелёная"
            : m.value >= yellowMin
              ? "Жёлтая"
              : "Красная";
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

  const greenMin = Math.round(settings.personalBest * 0.8);
  const yellowMin = Math.round(settings.personalBest * 0.5);

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

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center">
        <Wind className="h-8 w-8 text-emerald-400 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wind className="h-6 w-6 text-emerald-600" />
            <h1 className="text-lg font-bold text-slate-800">Пикфлоуметрия</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleNotifications}
              className="h-9 w-9"
              title={
                notificationsEnabled
                  ? "Выключить уведомления"
                  : "Включить уведомления"
              }
            >
              {notificationsEnabled ? (
                <Bell className="h-4 w-4 text-emerald-600" />
              ) : (
                <BellOff className="h-4 w-4 text-slate-400" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={exportCSV}
              className="h-9 w-9"
              title="Экспорт CSV"
            >
              <Download className="h-4 w-4 text-slate-600" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-4 pb-8">
        <Tabs defaultValue="input" className="w-full">
          <TabsList className="w-full grid grid-cols-3">
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
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
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
                          todayDone(p, t)
                            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                            : "bg-slate-50 border-slate-200 text-slate-500"
                        } ${
                          period === p && timing === t
                            ? "ring-2 ring-emerald-500 ring-offset-1"
                            : ""
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="text-xs font-medium leading-tight">
                          {label}
                        </span>
                        {todayDone(p, t) && (
                          <Check className="h-3.5 w-3.5 text-emerald-500 ml-auto shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Input card */}
              <Card className="border-2 border-emerald-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">
                    Новый замер
                  </CardTitle>
                  <CardDescription>
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
                    {timing === "before"
                      ? "до ингаляции"
                      : "через 30 мин после ингаляции"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
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

                  {/* Value input */}
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground mb-1 block">
                        ПСВ (л/мин)
                      </label>
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
                        className="text-2xl font-bold h-14 text-center"
                      />
                    </div>
                    <Button
                      size="lg"
                      className="h-14 px-6 text-base font-semibold bg-emerald-600 hover:bg-emerald-700"
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
                        getZone(parseInt(inputValue), settings.personalBest) ===
                        "green"
                          ? "bg-emerald-50"
                          : getZone(parseInt(inputValue), settings.personalBest) ===
                              "yellow"
                            ? "bg-amber-50"
                            : "bg-red-50"
                      }`}
                    >
                      <div
                        className={`h-3 w-3 rounded-full ${zoneColor(
                          getZone(parseInt(inputValue), settings.personalBest)
                        )}`}
                      />
                      <span className="text-sm font-medium">
                        {zoneLabel(
                          getZone(parseInt(inputValue), settings.personalBest)
                        )}{" "}
                        зона
                      </span>
                      <span className="text-xs text-muted-foreground ml-1">
                        ({parseInt(inputValue)} / {settings.personalBest})
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Zone legend */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Settings className="h-4 w-4" /> Зоны и настройки
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-emerald-500" />
                        <span>Зелёная</span>
                      </div>
                      <span className="text-muted-foreground">
                        {greenMin}–{settings.personalBest} л/мин
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-amber-500" />
                        <span>Жёлтая</span>
                      </div>
                      <span className="text-muted-foreground">
                        {yellowMin}–{greenMin - 1} л/мин
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-red-500" />
                        <span>Красная</span>
                      </div>
                      <span className="text-muted-foreground">
                        &lt; {yellowMin} л/мин
                      </span>
                    </div>
                  </div>

                  {/* Personal best setting */}
                  <div className="border-t pt-3">
                    {editingPB ? (
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-muted-foreground whitespace-nowrap">
                          Перс. лучший:
                        </label>
                        <Input
                          type="number"
                          value={pbInput}
                          onChange={(e) => setPbInput(e.target.value)}
                          className="h-8 w-24 text-center"
                          min={50}
                          max={900}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") savePB();
                            if (e.key === "Escape") setEditingPB(false);
                          }}
                        />
                        <Button size="sm" className="h-8" onClick={savePB}>
                          Сохранить
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditingPB(true)}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                      >
                        Персональный лучший:{" "}
                        <strong className="text-foreground">
                          {settings.personalBest} л/мин
                        </strong>
                        <span className="text-xs">(нажмите чтобы изменить)</span>
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ===== CHART TAB ===== */}
          <TabsContent value="chart">
            <div className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
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

                      {/* Zone reference areas */}
                      <ReferenceArea
                        y1={greenMin}
                        y2={settings.personalBest}
                        fill="#10b981"
                        fillOpacity={0.06}
                      />
                      <ReferenceArea
                        y1={yellowMin}
                        y2={greenMin}
                        fill="#f59e0b"
                        fillOpacity={0.06}
                      />
                      <ReferenceArea
                        y1={0}
                        y2={yellowMin}
                        fill="#ef4444"
                        fillOpacity={0.06}
                      />

                      {/* Zone boundary lines */}
                      <ReferenceLine
                        y={greenMin}
                        stroke="#10b981"
                        strokeDasharray="6 3"
                        strokeWidth={1}
                        label={{
                          value: "80%",
                          position: "right",
                          style: { fontSize: 10, fill: "#10b981" },
                        }}
                      />
                      <ReferenceLine
                        y={yellowMin}
                        stroke="#f59e0b"
                        strokeDasharray="6 3"
                        strokeWidth={1}
                        label={{
                          value: "50%",
                          position: "right",
                          style: { fontSize: 10, fill: "#f59e0b" },
                        }}
                      />
                      <ReferenceLine
                        y={settings.personalBest}
                        stroke="#10b981"
                        strokeDasharray="3 3"
                        strokeWidth={1.5}
                        label={{
                          value: `ПЛР ${settings.personalBest}`,
                          position: "left",
                          style: { fontSize: 10, fill: "#10b981" },
                        }}
                      />

                      <Line
                        type="monotone"
                        dataKey="morningBefore"
                        stroke="var(--color-morningBefore)"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="morningAfter"
                        stroke="var(--color-morningAfter)"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="eveningBefore"
                        stroke="var(--color-eveningBefore)"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="eveningAfter"
                        stroke="var(--color-eveningAfter)"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                    </LineChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ===== HISTORY TAB ===== */}
          <TabsContent value="history">
            <div className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Последние записи
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1"
                      onClick={exportCSV}
                    >
                      <Download className="h-3 w-3" /> CSV
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {historyList.length === 0 ? (
                    <div className="text-center text-muted-foreground text-sm py-8">
                      <Wind className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                      <p>Записей пока нет</p>
                      <p className="text-xs mt-1">
                        Начните вводить данные пикфлоуметрии
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[500px] overflow-y-auto">
                      {historyList.map((m) => {
                        const d = new Date(m.date);
                        const zone = getZone(m.value, settings.personalBest);
                        return (
                          <div
                            key={m.id}
                            className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${zoneBorderColor(zone)} bg-white`}
                          >
                            <div
                              className={`h-2.5 w-2.5 rounded-full shrink-0 ${zoneColor(zone)}`}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 text-sm font-medium">
                                <span className="text-lg font-bold">
                                  {m.value}
                                </span>
                                <span className="text-muted-foreground text-xs">
                                  л/мин
                                </span>
                                <Badge
                                  variant="secondary"
                                  className="text-xs px-1.5 py-0 ml-auto shrink-0"
                                >
                                  {zoneLabel(zone)}
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                                {m.period === "morning" ? (
                                  <Sun className="h-3 w-3 text-amber-400" />
                                ) : (
                                  <Moon className="h-3 w-3 text-indigo-400" />
                                )}
                                <span>
                                  {m.period === "morning" ? "Утро" : "Вечер"},{" "}
                                  {m.timing === "before" ? "до" : "после"}{" "}
                                  ингаляции
                                </span>
                                <span className="text-slate-300">|</span>
                                <span>
                                  {format(d, "dd.MM.yy, HH:mm", { locale: ru })}
                                </span>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0 text-slate-400 hover:text-red-500"
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

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white/80 backdrop-blur-sm">
        <div className="max-w-lg mx-auto px-4 py-3 text-center text-xs text-muted-foreground">
          Все данные хранятся только на этом устройстве. Интернет не нужен.
        </div>
      </footer>
    </div>
  );
}
