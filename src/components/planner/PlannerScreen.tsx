"use client";

import { createClient } from "@lib/supabase";
import { ChevronLeft, ChevronRight } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Item } from "@/data/inventory-mock";
import { PlannerCalendarPopover } from "@/components/planner/PlannerCalendarPopover";
import { PlannerDayView } from "@/components/planner/PlannerDayView";
import { PlannerMonthView } from "@/components/planner/PlannerMonthView";
import { PlannerTaskList } from "@/components/planner/PlannerTaskList";
import { PlannerWeekTimelineView } from "@/components/planner/PlannerWeekTimelineView";
import { startOfMonth, toISODate } from "@/components/planner/planner-view-utils";
import { DEFAULT_WAKE_MIN, DEFAULT_WIND_MIN } from "@/lib/planner/life-dump";
import { buildPlanMyWeekInputs } from "@/lib/planner/plan-my-week";
import {
  itemToInsertRow,
  itemToUpdateRow,
  mapItemRow,
  mapPlannedTaskRow,
  type PlannedTask,
  plannedTaskToInsertRow,
  type NewPlannedTaskInput,
} from "@/lib/db/map-rows";
import type { BrainDumpItemDraft } from "@/lib/api/brain-dump-types";
import type { RefineApiAction, RefineResponseBody } from "@/lib/api/refine-types";
import { SchedulePreviewSheet } from "@/components/planner/SchedulePreviewSheet";
import {
  proposalsFromPlan,
  proposalsFromRefine,
  type SchedulePreviewRow,
} from "@/lib/planner/schedule-preview";
import { ConfirmSheet } from "@/components/ConfirmSheet";
import { AddToWeekSheet } from "@/components/planner/AddToWeekSheet";
import { AskKeeperPanel } from "@/components/planner/AskKeeperPanel";
import { BrainDumpPreviewSheet } from "@/components/planner/BrainDumpPreviewSheet";
import { TaskActionsSheet } from "@/components/planner/TaskActionsSheet";
import { TOAST_DISMISS_MS, ToastView } from "@/components/planner/ToastView";
import { markPlannedTaskDone } from "@/lib/planner/mark-task-done";
import { applyPlanMyWeek } from "@/lib/planner/apply-plan-my-week";
import { DEFAULT_DAY_START_MIN } from "@/lib/planner/plan-my-week";
import { describeScheduleConflict, saveNextRepeats } from "@/lib/planner/next-repeat";
import { loadUserSettings } from "@/lib/settings/user-settings";
import type { ProtectedWindow } from "@/lib/planner/protected-time";
import { loadProtectedTimes } from "@/lib/settings/protected-times";
import { patchesForFutureTasks, syncFutureTasks } from "@/lib/inventory/future-tasks";

const PlannerTaskEditSheetLazy = dynamic(
  () => import("@/components/planner/PlannerTaskEditSheet"),
  { ssr: false, loading: () => null },
);

type Toast = { id: string; message: string; onUndo?: () => void | Promise<void> } | null;

type PlannerView = "day" | "week" | "month";

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return String(Date.now());
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function daysFromTodayStart(todayStart: Date, target: Date): number {
  const a = Date.UTC(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate());
  const b = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((b - a) / 86400000);
}

export function PlannerScreen() {
  const router = useRouter();
  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [weekOffset, setWeekOffset] = useState(0);
  /** Week timeline: page 0 = today…today+6, no past days. Arrows step by 7. */
  const [weekTimelinePage, setWeekTimelinePage] = useState(0);

  const weekStart = useMemo(
    () => addDays(todayStart, weekOffset * 7),
    [todayStart, weekOffset],
  );

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [
    weekStart,
  ]);

  const timelineWeekStart = useMemo(
    () => addDays(todayStart, weekTimelinePage * 7),
    [todayStart, weekTimelinePage],
  );

  const timelineWeekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(timelineWeekStart, i)),
    [timelineWeekStart],
  );

  const timelineWeekISOs = useMemo(
    () => timelineWeekDays.map((d) => toISODate(d)),
    [timelineWeekDays],
  );

  const weekTimelineRangeLabel = useMemo(() => {
    const a = timelineWeekDays[0];
    const b = timelineWeekDays[6];
    if (!a || !b) return "";
    const left = a.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const right = b.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `${left} – ${right}`;
  }, [timelineWeekDays]);

  const todayISO = useMemo(() => toISODate(todayStart), [todayStart]);
  const searchParams = useSearchParams();
  const [selectedDateISO, setSelectedDateISO] = useState(todayISO);
  const [plannerView, setPlannerView] = useState<PlannerView>("week");
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [toast, setToast] = useState<Toast>(null);

  useEffect(() => {
    if (searchParams.get("today") === "1") {
      setSelectedDateISO(todayISO);
      setPlannerView("day");
    }
  }, [searchParams, todayISO]);

  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Item[]>([]);
  const [plannedTasks, setPlannedTasks] = useState<PlannedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [dayStartMin, setDayStartMin] = useState(DEFAULT_DAY_START_MIN);
  const [wakeMin, setWakeMin] = useState(DEFAULT_WAKE_MIN);
  const [windMin, setWindMin] = useState(DEFAULT_WIND_MIN);
  const [autoScheduleNext, setAutoScheduleNext] = useState(true);
  const [protectedWindows, setProtectedWindows] = useState<ProtectedWindow[]>([]);

  const itemById = useMemo(() => {
    const map = new Map<string, Item>();
    for (const item of items) map.set(item.id, item);
    return map;
  }, [items]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [itemsRes, tasksRes] = await Promise.all([
          supabase.from("items").select("*").order("created_at", { ascending: false }),
          supabase.from("planned_tasks").select("*").order("scheduled_date", { ascending: true }),
        ]);
        if (cancelled) return;
        const mappedItems =
          !itemsRes.error && itemsRes.data
            ? itemsRes.data.map((r) => mapItemRow(r as Parameters<typeof mapItemRow>[0]))
            : [];
        const mappedTasks =
          !tasksRes.error && tasksRes.data
            ? tasksRes.data.map((r) => mapPlannedTaskRow(r as Parameters<typeof mapPlannedTaskRow>[0]))
            : [];
        if (!itemsRes.error && itemsRes.data) setItems(mappedItems);
        if (!tasksRes.error && tasksRes.data) setPlannedTasks(mappedTasks);
        if (itemsRes.error) {
          setToast({ id: createId(), message: itemsRes.error.message });
        }
        if (tasksRes.error) {
          setToast({ id: createId(), message: tasksRes.error.message });
        }
        const [settings, windows] = await Promise.all([
          loadUserSettings(supabase),
          loadProtectedTimes(supabase),
        ]);
        if (cancelled) return;
        setDayStartMin(settings.dayStartMinutes);
        setWakeMin(settings.wakeMinutes);
        setWindMin(settings.windDownMinutes);
        setAutoScheduleNext(settings.autoScheduleNext);
        setProtectedWindows(windows);
        if (settings.autoScheduleNext && !itemsRes.error && !tasksRes.error) {
          const filled = await saveNextRepeats(
            supabase,
            mappedItems,
            mappedTasks,
            todayISO,
            new Date(),
            settings.dayStartMinutes,
            {
              wakeMin: settings.wakeMinutes,
              windDownMin: settings.windDownMinutes,
              protectedWindows: windows,
            },
          );
          if (cancelled) return;
          if (filled.error) {
            setToast({ id: createId(), message: filled.error });
          } else if (filled.tasks.length > 0) {
            setPlannedTasks((prev) => [...filled.tasks, ...prev]);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setToast({
            id: createId(),
            message: e instanceof Error ? e.message : "Could not load planner data.",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, todayISO]);

  const [taskActionsOpen, setTaskActionsOpen] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [plannerTaskEditOpen, setPlannerTaskEditOpen] = useState(false);
  const [editingPlannedTaskId, setEditingPlannedTaskId] = useState<string | null>(null);
  const [plannerEditSessionKey, setPlannerEditSessionKey] = useState(0);

  const activeTask = useMemo(
    () => plannedTasks.find((t) => t.id === activeTaskId) ?? null,
    [plannedTasks, activeTaskId],
  );

  const editingPlannedTask = useMemo(
    () =>
      editingPlannedTaskId
        ? (plannedTasks.find((t) => t.id === editingPlannedTaskId) ?? null)
        : null,
    [plannedTasks, editingPlannedTaskId],
  );

  const editingPlannedItem = useMemo(
    () =>
      editingPlannedTask ? (itemById.get(editingPlannedTask.item_id) ?? null) : null,
    [editingPlannedTask, itemById],
  );

  const [addOpen, setAddOpen] = useState(false);
  const [addTime, setAddTime] = useState<string | null>(null);
  const [refiningChip, setRefiningChip] = useState<string | null>(null);
  const [schedulePreview, setSchedulePreview] = useState<{
    title: string;
    note: string;
    rows: SchedulePreviewRow[];
  } | null>(null);
  const [schedulePreviewSaving, setSchedulePreviewSaving] = useState(false);
  const [taskDeleteId, setTaskDeleteId] = useState<string | null>(null);
  const [askKeeperOpen, setAskKeeperOpen] = useState(false);
  const [brainDumpParsing, setBrainDumpParsing] = useState(false);
  const [brainDumpPreviewOpen, setBrainDumpPreviewOpen] = useState(false);
  const [brainDumpDrafts, setBrainDumpDrafts] = useState<BrainDumpItemDraft[]>([]);
  const [brainDumpSaving, setBrainDumpSaving] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const ms = TOAST_DISMISS_MS;
    const t = window.setTimeout(() => setToast(null), ms);
    return () => window.clearTimeout(t);
  }, [toast]);

  const selectedDayTasks = useMemo(
    () => plannedTasks.filter((t) => t.scheduled_date === selectedDateISO),
    [plannedTasks, selectedDateISO],
  );

  const selectedDayTasksSortedForList = useMemo(() => {
    return [...selectedDayTasks].sort((a, b) => {
      const ta = a.scheduled_time_start ?? "99:99";
      const tb = b.scheduled_time_start ?? "99:99";
      const byTime = ta.localeCompare(tb);
      if (byTime !== 0) return byTime;
      return a.title_snapshot.localeCompare(b.title_snapshot);
    });
  }, [selectedDayTasks]);

  const tasksCountByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of plannedTasks) {
      m.set(t.scheduled_date, (m.get(t.scheduled_date) ?? 0) + 1);
    }
    return m;
  }, [plannedTasks]);

  const headerSubtitle = useMemo(() => {
    const sel = new Date(`${selectedDateISO}T12:00:00`);
    return sel.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, [selectedDateISO]);

  const sectionTitle = useMemo(() => {
    if (plannerView === "month") {
      const d = new Date(`${selectedDateISO}T12:00:00`);
      return `Tasks · ${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`;
    }
    if (plannerView === "day") {
      return selectedDateISO === todayISO ? "Today" : "Day schedule";
    }
    return "Week schedule";
  }, [plannerView, selectedDateISO, todayISO]);

  function plannedTaskToNewInput(t: PlannedTask): NewPlannedTaskInput {
    return {
      item_id: t.item_id,
      title_snapshot: t.title_snapshot,
      scheduled_date: t.scheduled_date,
      scheduled_time_start: t.scheduled_time_start,
      scheduled_time_end: t.scheduled_time_end,
      status: t.status,
      priority_override: t.priority_override,
      notes: t.notes,
    };
  }

  function plannedTaskToUpdateRow(t: PlannedTask): Record<string, unknown> {
    return {
      item_id: t.item_id,
      title_snapshot: t.title_snapshot,
      scheduled_date: t.scheduled_date,
      scheduled_time_start: t.scheduled_time_start,
      scheduled_time_end: t.scheduled_time_end,
      status: t.status,
      priority_override: t.priority_override,
      notes: t.notes,
      updated_at: new Date().toISOString(),
    };
  }

  function clockContext() {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    let timeZone = "UTC";
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      timeZone = "UTC";
    }
    return { date: toISODate(now), time, time_zone: timeZone, at: now };
  }

  async function syncPlannedTasksUndo(userId: string, before: PlannedTask[], after: PlannedTask[]) {
    const beforeMap = new Map(before.map((t) => [t.id, t]));
    const afterMap = new Map(after.map((t) => [t.id, t]));

    for (const id of afterMap.keys()) {
      if (!beforeMap.has(id)) {
        const { error } = await supabase.from("planned_tasks").delete().eq("id", id);
        if (error) throw new Error(error.message);
      }
    }

    for (const t of beforeMap.values()) {
      if (!afterMap.has(t.id)) {
        const { error } = await supabase
          .from("planned_tasks")
          .insert(plannedTaskToInsertRow(userId, plannedTaskToNewInput(t)))
          .select()
          .single();
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from("planned_tasks")
          .update(plannedTaskToUpdateRow(t))
          .eq("id", t.id);
        if (error) throw new Error(error.message);
      }
    }
  }

  async function handleRefineChip(
    action: RefineApiAction,
    chipLabel: string,
    customPrompt?: string,
  ) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setToast({ id: createId(), message: "Sign in to use AI refine." });
      return;
    }

    if (action === "custom" && !customPrompt?.trim()) {
      setToast({ id: createId(), message: "Add a short request, or pick a suggestion above." });
      return;
    }

    setRefiningChip(chipLabel);
    const clock = clockContext();
    try {
      const res = await fetch("/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(action === "custom" && customPrompt?.trim()
            ? { custom_prompt: customPrompt.trim() }
            : {}),
          context: {
            items,
            planned_tasks: plannedTasks,
            week_start: toISODate(weekDays[0]),
            target_date:
              action === "lighten_day"
                ? selectedDateISO
                : action === "one_hour"
                  ? todayISO
                  : undefined,
            available_minutes: action === "one_hour" ? 60 : undefined,
            now: { date: clock.date, time: clock.time, time_zone: clock.time_zone },
          },
        }),
      });
      const data = (await res.json()) as RefineResponseBody & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Request failed.");
      }
      const weekISOs = weekDays.map((d) => toISODate(d));
      const rows = proposalsFromRefine(
        data.changes,
        items,
        plannedTasks,
        weekISOs,
        todayISO,
        clock.at,
        dayStartMin,
        wakeMin,
        windMin,
        protectedWindows,
      );
      if (rows.length === 0) {
        setToast({ id: createId(), message: data.note });
        return;
      }
      setSchedulePreview({ title: chipLabel, note: data.note, rows });
    } catch (e) {
      setToast({
        id: createId(),
        message: e instanceof Error ? e.message : "Something went wrong.",
      });
    } finally {
      setRefiningChip(null);
    }
  }

  async function handleBrainDumpParse(text: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setToast({ id: createId(), message: "Sign in to add inventory from notes." });
      return;
    }

    setBrainDumpParsing(true);
    const clock = clockContext();
    try {
      const res = await fetch("/api/inventory/parse-brain-dump", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          now: { date: clock.date, time: clock.time, time_zone: clock.time_zone },
          wake_minutes: wakeMin,
          wind_down_minutes: windMin,
          protected_windows: protectedWindows,
        }),
      });
      const data = (await res.json()) as { items?: BrainDumpItemDraft[]; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Request failed.");
      }
      if (!data.items?.length) {
        setToast({
          id: createId(),
          message: "No items extracted. Add a bit more detail and try again.",
        });
        return;
      }
      setBrainDumpDrafts(data.items);
      setAskKeeperOpen(false);
      setBrainDumpPreviewOpen(true);
    } catch (e) {
      setToast({
        id: createId(),
        message: e instanceof Error ? e.message : "Could not parse your notes.",
      });
    } finally {
      setBrainDumpParsing(false);
    }
  }

  async function handleConfirmBrainDump(drafts: BrainDumpItemDraft[]) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setToast({ id: createId(), message: "Sign in to save inventory." });
      return;
    }

    setBrainDumpSaving(true);
    try {
      const rows = drafts.map((d) => itemToInsertRow(user.id, d));
      const { data, error } = await supabase.from("items").insert(rows).select();
      if (error) throw new Error(error.message);
      const mapped = (data ?? []).map((r) =>
        mapItemRow(r as Parameters<typeof mapItemRow>[0]),
      );
      setItems((prev) => [...mapped, ...prev]);
      setBrainDumpPreviewOpen(false);
      setBrainDumpDrafts([]);
      setToast({
        id: createId(),
        message: `Added ${mapped.length} item${mapped.length === 1 ? "" : "s"} to inventory.`,
      });
    } catch (e) {
      setToast({
        id: createId(),
        message: e instanceof Error ? e.message : "Could not save items.",
      });
    } finally {
      setBrainDumpSaving(false);
    }
  }

  async function handlePlanMyWeek() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setToast({ id: createId(), message: "You need to be signed in to plan your week." });
      return;
    }

    const weekISOs = weekDays.map((d) => toISODate(d));
    const existingInWeek = plannedTasks.filter((t) => weekISOs.includes(t.scheduled_date));
    const { inputs, deferred } = buildPlanMyWeekInputs(items, existingInWeek, weekISOs, todayISO, {
      now: new Date(),
      dayStartMin,
      wakeMin,
      windDownMin: windMin,
      protectedWindows,
    });

    if (inputs.length === 0 && deferred.length === 0) {
      setToast({
        id: createId(),
        message:
          "Nothing to schedule. No items are due by the end of this week, or they are already on the planner.",
      });
      return;
    }

    setSchedulePreview({
      title: "Plan my week",
      note: "Choose what to put on the calendar. You can undo it afterward.",
      rows: proposalsFromPlan(inputs, deferred, items),
    });
  }

  async function confirmSchedulePreview(selected: SchedulePreviewRow[]) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setToast({ id: createId(), message: "You need to be signed in." });
      return;
    }

    const quietItemIds = new Set(items.filter((item) => item.type === "anchor").map((item) => item.id));
    let working = [...plannedTasks];
    for (const row of selected) {
      if (row.kind === "remove" && row.removeId) {
        working = working.filter((task) => task.id !== row.removeId);
        continue;
      }
      const placed = row.move
        ? {
            itemId: working.find((task) => task.id === row.move?.planned_task_id)?.item_id ?? null,
            date: row.move.scheduled_date,
            start: row.move.scheduled_time_start,
            end: row.move.scheduled_time_end,
            ignore: row.move.planned_task_id,
          }
        : row.add
          ? {
              itemId: row.add.item_id,
              date: row.add.scheduled_date,
              start: row.add.scheduled_time_start,
              end: row.add.scheduled_time_end,
              ignore: undefined as string | undefined,
            }
          : null;
      if (!placed) continue;
      const conflict = describeScheduleConflict(
        placed.ignore ? working.filter((task) => task.id !== placed.ignore) : working,
        placed.date,
        placed.start,
        placed.end,
        todayISO,
        new Date(),
        {
          occupiesTime: placed.itemId ? itemById.get(placed.itemId)?.type !== "anchor" : true,
          quietItemIds,
        },
      );
      if (conflict) {
        setToast({ id: createId(), message: conflict });
        return;
      }
      if (row.move) {
        working = working.map((task) =>
          task.id === row.move?.planned_task_id
            ? {
                ...task,
                scheduled_date: row.move.scheduled_date,
                scheduled_time_start: row.move.scheduled_time_start,
                scheduled_time_end: row.move.scheduled_time_end,
              }
            : task,
        );
      } else if (row.add) {
        working = [
          {
            id: `pending-${row.key}`,
            item_id: row.add.item_id,
            title_snapshot: row.add.title_snapshot,
            scheduled_date: row.add.scheduled_date,
            scheduled_time_start: row.add.scheduled_time_start,
            scheduled_time_end: row.add.scheduled_time_end,
            status: "planned",
            priority_override: null,
            notes: null,
            created_at: "",
            updated_at: "",
          },
          ...working,
        ];
      }
    }

    const beforeTasks = plannedTasks.map((task) => ({ ...task }));
    const beforeDue = new Map(items.map((item) => [item.id, item.next_due_date]));
    setSchedulePreviewSaving(true);
    try {
      const nowISO = new Date().toISOString();
      let nextTasks = [...plannedTasks];

      for (const row of selected) {
        if (row.kind !== "remove" || !row.removeId) continue;
        const { error } = await supabase.from("planned_tasks").delete().eq("id", row.removeId);
        if (error) throw new Error(error.message);
        nextTasks = nextTasks.filter((task) => task.id !== row.removeId);
      }

      for (const row of selected) {
        if (row.kind !== "move" || !row.move) continue;
        const { error } = await supabase
          .from("planned_tasks")
          .update({
            scheduled_date: row.move.scheduled_date,
            scheduled_time_start: row.move.scheduled_time_start,
            scheduled_time_end: row.move.scheduled_time_end,
            status: "moved",
            updated_at: nowISO,
          })
          .eq("id", row.move.planned_task_id);
        if (error) throw new Error(error.message);
        nextTasks = nextTasks.map((task) =>
          task.id === row.move?.planned_task_id
            ? {
                ...task,
                scheduled_date: row.move.scheduled_date,
                scheduled_time_start: row.move.scheduled_time_start,
                scheduled_time_end: row.move.scheduled_time_end,
                status: "moved",
                updated_at: nowISO,
              }
            : task,
        );
      }

      const adds = selected.flatMap((row) => (row.kind === "add" && row.add ? [row.add] : []));
      const deferred = selected.flatMap((row) =>
        row.kind === "defer" && row.defer
          ? [{ itemId: row.defer.itemId, title: row.title, nextDueISO: row.defer.nextDueISO, userMessage: row.detail }]
          : [],
      );
      if (adds.length > 0 || deferred.length > 0) {
        const saved = await applyPlanMyWeek(supabase, adds, deferred);
        if (saved.error) throw new Error(saved.error);
        if (saved.tasks.length > 0) nextTasks = [...saved.tasks, ...nextTasks];
      }

      if (deferred.length > 0) {
        const defMap = new Map(deferred.map((row) => [row.itemId, row.nextDueISO]));
        setItems((prev) =>
          prev.map((item) =>
            defMap.has(item.id) ? { ...item, next_due_date: defMap.get(item.id)!, updated_at: nowISO } : item,
          ),
        );
      }

      setPlannedTasks(nextTasks);
      setSchedulePreview(null);
      const count = selected.length;
      setToast({
        id: createId(),
        message: count === 1 ? "Added 1 change." : `Added ${count} changes.`,
        onUndo: () =>
          void (async () => {
            try {
              await syncPlannedTasksUndo(user.id, beforeTasks, nextTasks);
              for (const row of selected) {
                if (row.kind !== "defer" || !row.defer) continue;
                const previous = beforeDue.get(row.defer.itemId) ?? null;
                const { error } = await supabase
                  .from("items")
                  .update({ next_due_date: previous, updated_at: new Date().toISOString() })
                  .eq("id", row.defer.itemId);
                if (error) throw new Error(error.message);
              }
              setPlannedTasks(beforeTasks.map((task) => ({ ...task })));
              setItems((prev) =>
                prev.map((item) =>
                  beforeDue.has(item.id) ? { ...item, next_due_date: beforeDue.get(item.id) ?? null } : item,
                ),
              );
              setToast({ id: createId(), message: "Reverted the last change." });
            } catch (e) {
              setToast({
                id: createId(),
                message: e instanceof Error ? e.message : "Could not undo.",
              });
            }
          })(),
      });
      router.refresh();
    } catch (e) {
      setToast({
        id: createId(),
        message: e instanceof Error ? e.message : "Could not save those changes.",
      });
    } finally {
      setSchedulePreviewSaving(false);
    }
  }

  function shiftWeekTimeline(delta: -1 | 1) {
    setWeekTimelinePage((prev) => {
      const next = Math.max(0, prev + delta);
      setWeekOffset(next);
      return next;
    });
  }

  function jumpPlannerToDate(iso: string) {
    const target = new Date(`${iso}T12:00:00`);
    if (!Number.isFinite(target.getTime())) return;
    const d = daysFromTodayStart(todayStart, target);
    setWeekOffset(Math.floor(d / 7));
    if (d >= 0) {
      setWeekTimelinePage(Math.floor(d / 7));
    } else {
      setWeekTimelinePage(0);
    }
    setSelectedDateISO(iso);
    setMonthCursor(startOfMonth(target));
  }

  function handlePlannerViewChange(v: PlannerView) {
    setPlannerView(v);
    if (v === "week") {
      const d = daysFromTodayStart(todayStart, new Date(`${selectedDateISO}T12:00:00`));
      if (d >= 0) {
        setWeekTimelinePage(Math.floor(d / 7));
      } else {
        setWeekTimelinePage(0);
      }
    }
    if (v === "month") {
      setMonthCursor(startOfMonth(new Date(`${selectedDateISO}T12:00:00`)));
    }
  }

  function shiftDay(delta: -1 | 1) {
    const d = new Date(`${selectedDateISO}T12:00:00`);
    d.setDate(d.getDate() + delta);
    jumpPlannerToDate(toISODate(d));
  }

  const daySwipe = useRef<{ x: number; y: number; pointerId: number } | null>(null);

  function onDayPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("[data-task], button, a, input, textarea, select, label")) return;
    daySwipe.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  }

  function onDayPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const start = daySwipe.current;
    daySwipe.current = null;
    if (!start || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
    shiftDay(dx < 0 ? 1 : -1);
  }

  function shiftMonth(delta: -1 | 1) {
    setMonthCursor((prev) => {
      const n = new Date(prev);
      n.setMonth(n.getMonth() + delta);
      return startOfMonth(n);
    });
  }

  function openTaskActions(taskId: string) {
    setEditingPlannedTaskId(taskId);
    setPlannerEditSessionKey((k) => k + 1);
    setPlannerTaskEditOpen(true);
    setActiveTaskId(taskId);
  }

  function closeTaskActions() {
    setTaskActionsOpen(false);
    setActiveTaskId(null);
  }

  function openPlannerTaskEdit() {
    if (!activeTaskId) return;
    setEditingPlannedTaskId(activeTaskId);
    setPlannerEditSessionKey((k) => k + 1);
    setPlannerTaskEditOpen(true);
    closeTaskActions();
  }

  function closePlannerTaskEdit() {
    setPlannerTaskEditOpen(false);
    setEditingPlannedTaskId(null);
  }

  async function updateTaskStatus(taskId: string, status: PlannedTask["status"]) {
    const nowISO = new Date().toISOString();
    const { error } = await supabase
      .from("planned_tasks")
      .update({ status, updated_at: nowISO })
      .eq("id", taskId);
    if (error) {
      setToast({ id: createId(), message: error.message });
      return;
    }
    setPlannedTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status, updated_at: nowISO } : t)),
    );
  }

  async function markTaskDone(taskId: string) {
    const task = plannedTasks.find((t) => t.id === taskId);
    if (!task) return;
    const item = itemById.get(task.item_id) ?? null;
    const result = await markPlannedTaskDone(supabase, task, item);
    if (result.error) {
      setToast({ id: createId(), message: result.error });
      return;
    }
    const nextTasks = plannedTasks.map((t) => (t.id === taskId ? result.task : t));
    const nextItems = result.item
      ? items.map((i) => (i.id === result.item!.id ? result.item! : i))
      : items;
    setPlannedTasks(nextTasks);
    if (result.item) setItems(nextItems);
    if (
      autoScheduleNext &&
      result.item &&
      (result.item.type === "recurring" || result.item.type === "anchor")
    ) {
      const filled = await saveNextRepeats(
        supabase,
        nextItems,
        nextTasks,
        todayISO,
        new Date(),
        dayStartMin,
        { wakeMin, windDownMin: windMin, protectedWindows },
      );
      if (filled.error) {
        setToast({ id: createId(), message: filled.error });
      } else if (filled.tasks.length > 0) {
        setPlannedTasks((prev) => [...filled.tasks, ...prev]);
        setToast({
          id: createId(),
          message:
            filled.tasks.length === 1
              ? "The next repeat is on the calendar."
              : `Added ${filled.tasks.length} upcoming repeats.`,
        });
      }
    }
  }

  function scheduleConflict(
    dateISO: string,
    start: string | null,
    end: string | null,
    itemId: string | null,
    ignoreTaskId?: string,
  ): string | null {
    const quietItemIds = new Set(items.filter((item) => item.type === "anchor").map((item) => item.id));
    return describeScheduleConflict(
      ignoreTaskId ? plannedTasks.filter((task) => task.id !== ignoreTaskId) : plannedTasks,
      dateISO,
      start,
      end,
      todayISO,
      new Date(),
      {
        occupiesTime: itemId ? itemById.get(itemId)?.type !== "anchor" : true,
        quietItemIds,
      },
    );
  }

  async function moveTask(taskId: string, toDateISO: string) {
    const task = plannedTasks.find((t) => t.id === taskId);
    if (!task) return;
    const conflict = scheduleConflict(
      toDateISO,
      task.scheduled_time_start,
      task.scheduled_time_end,
      task.item_id,
      taskId,
    );
    if (conflict) {
      setToast({ id: createId(), message: conflict });
      return;
    }
    const nowISO = new Date().toISOString();
    const { error } = await supabase
      .from("planned_tasks")
      .update({
        scheduled_date: toDateISO,
        status: "moved",
        updated_at: nowISO,
      })
      .eq("id", taskId);
    if (error) {
      setToast({ id: createId(), message: error.message });
      return;
    }
    setPlannedTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, scheduled_date: toDateISO, status: "moved", updated_at: nowISO }
          : t,
      ),
    );
  }

  async function deletePlannedTask(taskId: string) {
    const task = plannedTasks.find((row) => row.id === taskId);
    if (!task) return;
    const { error } = await supabase.from("planned_tasks").delete().eq("id", taskId);
    if (error) {
      setToast({ id: createId(), message: error.message });
      return;
    }
    setPlannedTasks((prev) => prev.filter((t) => t.id !== taskId));
    closePlannerTaskEdit();
    closeTaskActions();
    setToast({
      id: createId(),
      message: "Task removed from the calendar.",
      onUndo: async () => {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error: restoreError } = await supabase
          .from("planned_tasks")
          .insert(plannedTaskToInsertRow(user.id, task))
          .select()
          .single();
        if (restoreError || !data) {
          setToast({ id: createId(), message: restoreError?.message ?? "Could not undo." });
          return;
        }
        setPlannedTasks((prev) => [
          mapPlannedTaskRow(data as Parameters<typeof mapPlannedTaskRow>[0]),
          ...prev,
        ]);
        setToast({ id: createId(), message: "Restored that task." });
      },
    });
  }

  async function savePlannedTaskInstance(
    taskId: string,
    patch: {
      scheduled_date: string;
      scheduled_time_start: string | null;
      scheduled_time_end: string | null;
      notes: string | null;
    },
    options?: { quiet?: boolean },
  ): Promise<boolean> {
    const current = plannedTasks.find((t) => t.id === taskId);
    const conflict = scheduleConflict(
      patch.scheduled_date,
      patch.scheduled_time_start,
      patch.scheduled_time_end,
      current?.item_id ?? null,
      taskId,
    );
    if (conflict) {
      setToast({ id: createId(), message: conflict });
      return false;
    }
    const nowISO = new Date().toISOString();
    const { error } = await supabase
      .from("planned_tasks")
      .update({ ...patch, updated_at: nowISO })
      .eq("id", taskId);
    if (error) {
      setToast({ id: createId(), message: error.message });
      return false;
    }
    setPlannedTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, ...patch, updated_at: nowISO } : t)),
    );
    if (!options?.quiet) {
      setToast({ id: createId(), message: "Saved this event." });
      router.refresh();
    }
    return true;
  }

  async function saveItemFromPlanner(updated: Item): Promise<boolean> {
    const nowISO = new Date().toISOString();
    const { error } = await supabase
      .from("items")
      .update(itemToUpdateRow(updated, nowISO))
      .eq("id", updated.id);
    if (error) {
      setToast({ id: createId(), message: error.message });
      return false;
    }
    const savedItem = { ...updated, updated_at: nowISO };
    const synced = await syncFutureTasks(supabase, savedItem, todayISO);
    if (synced.error) {
      setToast({ id: createId(), message: synced.error });
      return false;
    }
    const futurePatches = new Map(
      patchesForFutureTasks(savedItem, plannedTasks, todayISO).map((patch) => [patch.id, patch]),
    );
    setItems((prev) => prev.map((i) => (i.id === updated.id ? savedItem : i)));
    setPlannedTasks((prev) =>
      prev.map((task) => {
        const patch = futurePatches.get(task.id);
        if (!patch) return task;
        return {
          ...task,
          title_snapshot: patch.title_snapshot,
          scheduled_time_end: patch.scheduled_time_end,
          updated_at: nowISO,
        };
      }),
    );
    setToast({ id: createId(), message: "Saved. Upcoming tasks use this title." });
    router.refresh();
    return true;
  }

  async function handleAddPlannedTask(input: NewPlannedTaskInput) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setToast({ id: createId(), message: "You need to be signed in to add a task." });
      return;
    }

    const conflict = scheduleConflict(
      input.scheduled_date,
      input.scheduled_time_start,
      input.scheduled_time_end,
      input.item_id,
    );
    if (conflict) {
      setToast({ id: createId(), message: conflict });
      return;
    }

    const { data, error } = await supabase
      .from("planned_tasks")
      .insert(plannedTaskToInsertRow(user.id, input))
      .select()
      .single();

    if (error) {
      setToast({ id: createId(), message: error.message });
      return;
    }

    setPlannedTasks((prev) => [mapPlannedTaskRow(data as Parameters<typeof mapPlannedTaskRow>[0]), ...prev]);
    setAddOpen(false);
  }

  async function handleQuickAddPlannedTask(payload: {
    title: string;
    scheduled_date: string;
    scheduled_time_start: string | null;
    scheduled_time_end: string | null;
    estimated_minutes: number;
  }) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setToast({ id: createId(), message: "You need to be signed in to add a task." });
      return;
    }

    const trimmed = payload.title.trim();
    if (!trimmed) return;

    const conflict = scheduleConflict(
      payload.scheduled_date,
      payload.scheduled_time_start,
      payload.scheduled_time_end,
      null,
    );
    if (conflict) {
      setToast({ id: createId(), message: conflict });
      return;
    }

    const quickItem: Omit<Item, "id" | "created_at" | "updated_at"> = {
      title: trimmed,
      category: "Personal",
      type: "one_off",
      frequency_type: null,
      frequency_value: null,
      frequency_unit: null,
      times_per_period: 1,
      recurrence_end: "never",
      recurrence_end_date: null,
      recurrence_end_count: null,
      completed_count: 0,
      preferred_days: null,
      preferred_time_of_day: null,
      fixed_start_time: null,
      estimated_minutes: payload.estimated_minutes,
      priority: "Standard",
      flexibility: "Flexible anytime",
      cadence_pressure: "Can slide a little",
      minimum_success_threshold: null,
      notes: null,
      is_archived: false,
      last_completed_at: null,
      next_due_date: null,
    };

    const { data: itemRow, error: itemErr } = await supabase
      .from("items")
      .insert(itemToInsertRow(user.id, quickItem))
      .select()
      .single();

    if (itemErr) {
      setToast({ id: createId(), message: itemErr.message });
      return;
    }

    const item = mapItemRow(itemRow as Parameters<typeof mapItemRow>[0]);
    setItems((prev) => [item, ...prev]);

    const taskInput: NewPlannedTaskInput = {
      item_id: item.id,
      title_snapshot: item.title,
      scheduled_date: payload.scheduled_date,
      scheduled_time_start: payload.scheduled_time_start,
      scheduled_time_end: payload.scheduled_time_end,
      status: "planned",
      priority_override: null,
      notes: null,
    };

    const { data: taskRow, error: taskErr } = await supabase
      .from("planned_tasks")
      .insert(plannedTaskToInsertRow(user.id, taskInput))
      .select()
      .single();

    if (taskErr) {
      setToast({ id: createId(), message: taskErr.message });
      return;
    }

    setPlannedTasks((prev) => [
      mapPlannedTaskRow(taskRow as Parameters<typeof mapPlannedTaskRow>[0]),
      ...prev,
    ]);
    setAddOpen(false);
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {plannerView === "day" && (
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
              <span>{headerSubtitle}</span>
              <PlannerCalendarPopover
                weekDayISOs={weekDays.map((d) => toISODate(d))}
                todayISO={todayISO}
                selectedDateISO={selectedDateISO}
                onSelectDate={jumpPlannerToDate}
              />
            </div>
          )}
          {plannerView === "month" && (
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
              <span>
                {monthCursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
              </span>
              <PlannerCalendarPopover
                weekDayISOs={weekDays.map((d) => toISODate(d))}
                todayISO={todayISO}
                selectedDateISO={selectedDateISO}
                onSelectDate={jumpPlannerToDate}
              />
            </div>
          )}
          <h1 className="font-serif text-[26px] font-normal tracking-tight text-ink">
            Planner
          </h1>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
          <div className="flex items-center rounded-full border border-border bg-surface-alt p-1">
            {(
              [
                { id: "day" as const, label: "Day" },
                { id: "week" as const, label: "Week" },
                { id: "month" as const, label: "Month" },
              ] as const
            ).map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => handlePlannerViewChange(id)}
                className={`rounded-full px-3 py-1 text-[13px] transition-colors ${
                  plannerView === id
                    ? "bg-surface-raised font-medium text-accent shadow-sm"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {loading ? (
        <p className="text-[13px] text-ink-muted">Loading…</p>
      ) : (
        <>
          <div className="flex flex-col gap-2 pb-3">
            {plannerView === "week" && (
              <div className="mx-auto flex w-full max-w-[390px] items-center justify-center gap-2 pb-1">
                <button
                  type="button"
                  disabled={weekTimelinePage === 0}
                  onClick={() => shiftWeekTimeline(-1)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[rgba(15,57,76,0.6)] transition-opacity hover:opacity-80 active:opacity-60 disabled:pointer-events-none disabled:opacity-30"
                  aria-label="Previous 7 days"
                >
                  <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
                </button>
                <span className="min-w-0 flex-1 text-center text-[13px] font-medium text-[#0f394c]">
                  {weekTimelineRangeLabel}
                </span>
                <PlannerCalendarPopover
                  weekDayISOs={timelineWeekISOs}
                  todayISO={todayISO}
                  selectedDateISO={selectedDateISO}
                  onSelectDate={jumpPlannerToDate}
                />
                <button
                  type="button"
                  onClick={() => shiftWeekTimeline(1)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[rgba(15,57,76,0.6)] transition-opacity hover:opacity-80 active:opacity-60"
                  aria-label="Next 7 days"
                >
                  <ChevronRight className="h-5 w-5" strokeWidth={2} aria-hidden />
                </button>
              </div>
            )}
            {plannerView === "day" && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => shiftDay(-1)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-opacity hover:opacity-70 active:opacity-55"
                  aria-label="Previous day"
                >
                  <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
                </button>
                <p className="min-w-0 flex-1 text-center text-[13px] font-medium leading-snug text-ink">
                  {new Date(`${selectedDateISO}T12:00:00`).toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
                <button
                  type="button"
                  onClick={() => shiftDay(1)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-opacity hover:opacity-70 active:opacity-55"
                  aria-label="Next day"
                >
                  <ChevronRight className="h-5 w-5" strokeWidth={2} aria-hidden />
                </button>
              </div>
            )}
          </div>

          {plannerView === "month" && (
            <div className="pb-2">
              <PlannerMonthView
                monthCursor={monthCursor}
                selectedDateISO={selectedDateISO}
                todayISO={todayISO}
                tasksCountByDate={tasksCountByDate}
                onSelectDate={(iso) => jumpPlannerToDate(iso)}
                onPrevMonth={() => shiftMonth(-1)}
                onNextMonth={() => shiftMonth(1)}
              />
            </div>
          )}

          <section className="flex flex-1 flex-col">
            <h2 className="font-serif text-[20px] font-normal tracking-tight text-ink">
              {sectionTitle}
            </h2>

            <div
              className="mt-4 flex-1 overflow-y-auto pr-1 pb-44"
              onPointerDown={plannerView === "day" ? onDayPointerDown : undefined}
              onPointerUp={plannerView === "day" ? onDayPointerUp : undefined}
              onPointerCancel={plannerView === "day" ? () => { daySwipe.current = null; } : undefined}
            >
              {plannerView === "day" ? (
                <PlannerDayView
                  tasks={selectedDayTasks}
                  itemById={itemById}
                  dateISO={selectedDateISO}
                  protectedWindows={protectedWindows}
                  onOpenTask={openTaskActions}
                  onCommitSchedule={(taskId, patch) => {
                    const task = plannedTasks.find((row) => row.id === taskId);
                    void savePlannedTaskInstance(
                      taskId,
                      { ...patch, notes: task?.notes ?? null },
                      { quiet: true },
                    );
                  }}
                  onCreateAt={(date, time) => {
                    setSelectedDateISO(date);
                    setAddTime(time);
                    setAddOpen(true);
                  }}
                />
              ) : plannerView === "week" ? (
                <div className="flex w-full justify-center">
                  <PlannerWeekTimelineView
                    weekDays={timelineWeekDays}
                    plannedTasks={plannedTasks}
                    itemById={itemById}
                    selectedDateISO={selectedDateISO}
                    todayISO={todayISO}
                    protectedWindows={protectedWindows}
                    onSelectDate={jumpPlannerToDate}
                    onOpenTask={openTaskActions}
                    onCommitSchedule={(taskId, patch) => {
                      const task = plannedTasks.find((row) => row.id === taskId);
                      void savePlannedTaskInstance(
                        taskId,
                        { ...patch, notes: task?.notes ?? null },
                        { quiet: true },
                      );
                    }}
                    onCreateAt={(date, time) => {
                      jumpPlannerToDate(date);
                      setAddTime(time);
                      setAddOpen(true);
                    }}
                    onOpenDay={(date) => {
                      jumpPlannerToDate(date);
                      setPlannerView("day");
                    }}
                  />
                </div>
              ) : (
                <PlannerTaskList
                  tasks={selectedDayTasksSortedForList}
                  itemById={itemById}
                  onOpenTask={openTaskActions}
                />
              )}
            </div>
          </section>
        </>
      )}

      <AskKeeperPanel
        open={askKeeperOpen}
        onOpenChange={setAskKeeperOpen}
        disabled={loading}
        refiningLabel={refiningChip}
        parsingBrainDump={brainDumpParsing}
        planningWeek={false}
        onPlanMyWeek={() => void handlePlanMyWeek()}
        onRefine={(action, label, custom) => void handleRefineChip(action, label, custom)}
        onBrainDumpParse={(text) => void handleBrainDumpParse(text)}
      />

      <SchedulePreviewSheet
        open={schedulePreview != null}
        title={schedulePreview?.title ?? "Review"}
        note={schedulePreview?.note ?? ""}
        rows={schedulePreview?.rows ?? []}
        saving={schedulePreviewSaving}
        onClose={() => setSchedulePreview(null)}
        onConfirm={(selected) => void confirmSchedulePreview(selected)}
      />

      <BrainDumpPreviewSheet
        open={brainDumpPreviewOpen}
        onClose={() => {
          setBrainDumpPreviewOpen(false);
          setBrainDumpDrafts([]);
        }}
        initialDrafts={brainDumpDrafts}
        onConfirm={(drafts) => void handleConfirmBrainDump(drafts)}
        saving={brainDumpSaving}
      />

      <button
        type="button"
        onClick={() => {
          setAddTime(null);
          setAddOpen(true);
        }}
        className="fixed bottom-[calc(7rem+max(0px,env(safe-area-inset-bottom,0px)-0.75rem))] right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-surface-raised shadow-[0_4px_14px_rgba(202,165,16,0.35)] transition-transform hover:scale-[1.02] active:scale-[0.98] sm:right-8"
        aria-label="Add planned task"
      >
        <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          />
        </svg>
      </button>

      <AddToWeekSheet
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setAddTime(null);
        }}
        weekDays={weekDays}
        selectedDateISO={selectedDateISO}
        initialTime={addTime}
        items={items}
        onAdd={(input) => void handleAddPlannedTask(input)}
        onQuickAdd={(payload) => void handleQuickAddPlannedTask(payload)}
      />

      <ConfirmSheet
        open={taskDeleteId != null}
        title="Delete this task?"
        body="This takes it off the calendar. The inventory item stays. You can undo from the toast."
        confirmLabel="Delete this task"
        onConfirm={() => {
          if (!taskDeleteId) return;
          const id = taskDeleteId;
          setTaskDeleteId(null);
          void deletePlannedTask(id);
        }}
        onCancel={() => setTaskDeleteId(null)}
      />

      <TaskActionsSheet
        open={taskActionsOpen}
        task={activeTask}
        item={activeTask ? itemById.get(activeTask.item_id) ?? null : null}
        onClose={closeTaskActions}
        onMarkDone={(taskId) => {
          void markTaskDone(taskId);
          closeTaskActions();
        }}
        onSkip={(taskId) => {
          void updateTaskStatus(taskId, "skipped");
          closeTaskActions();
        }}
        onReschedule={(taskId, toISO) => {
          void moveTask(taskId, toISO);
          closeTaskActions();
        }}
        onDelete={(taskId) => void deletePlannedTask(taskId)}
        onOpenPlannerEdit={openPlannerTaskEdit}
      />

      {plannerTaskEditOpen && editingPlannedTask && editingPlannedItem ? (
        <PlannerTaskEditSheetLazy
          open
          sessionKey={plannerEditSessionKey}
          task={editingPlannedTask}
          item={editingPlannedItem}
          onClose={closePlannerTaskEdit}
          onMarkDone={(taskId) => {
            void markTaskDone(taskId);
            closePlannerTaskEdit();
          }}
          onSkip={(taskId) => {
            void updateTaskStatus(taskId, "skipped");
            closePlannerTaskEdit();
          }}
          onDelete={(taskId) => setTaskDeleteId(taskId)}
          onSaveInstance={(taskId, patch) => savePlannedTaskInstance(taskId, patch)}
          onSaveItem={(item) => saveItemFromPlanner(item)}
        />
      ) : null}

      {toast && (
        <ToastView
          message={toast.message}
          onUndo={toast.onUndo}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}
