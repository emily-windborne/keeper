"use client";

import { createClient } from "@lib/supabase";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Item } from "@/data/inventory-mock";
import { CategoryIcon } from "@/components/CategoryIcon";
import { PlannerCalendarPopover } from "@/components/planner/PlannerCalendarPopover";
import { PlannerDayView } from "@/components/planner/PlannerDayView";
import { PlannerMonthView } from "@/components/planner/PlannerMonthView";
import { PlannerTaskList } from "@/components/planner/PlannerTaskList";
import { startOfMonth, toISODate } from "@/components/planner/planner-view-utils";
import { computeNextDueDate } from "@/lib/inventory/compute-next-due";
import { buildPlanMyWeekInputs } from "@/lib/planner/plan-my-week";
import {
  itemToInsertRow,
  mapItemRow,
  mapPlannedTaskRow,
  type PlannedTask,
  plannedTaskToInsertRow,
  type NewPlannedTaskInput,
} from "@/lib/db/map-rows";
import type { BrainDumpItemDraft } from "@/lib/api/brain-dump-types";
import type { RefineApiAction, RefineChange, RefineResponseBody } from "@/lib/api/refine-types";
import { BrainDumpPreviewSheet } from "@/components/planner/BrainDumpPreviewSheet";

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

function formatDayDotClass(count: number): string {
  if (count <= 0) return "bg-surface-alt";
  if (count === 1) return "bg-teal-light";
  if (count <= 3) return "bg-teal";
  return "bg-accent";
}

function daysFromTodayStart(todayStart: Date, target: Date): number {
  const a = Date.UTC(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate());
  const b = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((b - a) / 86400000);
}

export function PlannerScreen() {
  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [weekOffset, setWeekOffset] = useState(0);

  const weekStart = useMemo(
    () => addDays(todayStart, weekOffset * 7),
    [todayStart, weekOffset],
  );

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [
    weekStart,
  ]);

  const todayISO = useMemo(() => toISODate(todayStart), [todayStart]);
  const [selectedDateISO, setSelectedDateISO] = useState(todayISO);
  const [plannerView, setPlannerView] = useState<PlannerView>("week");
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [toast, setToast] = useState<Toast>(null);

  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Item[]>([]);
  const [plannedTasks, setPlannedTasks] = useState<PlannedTask[]>([]);
  const [loading, setLoading] = useState(true);

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
        if (!itemsRes.error && itemsRes.data) {
          setItems(itemsRes.data.map((r) => mapItemRow(r as Parameters<typeof mapItemRow>[0])));
        }
        if (!tasksRes.error && tasksRes.data) {
          setPlannedTasks(
            tasksRes.data.map((r) => mapPlannedTaskRow(r as Parameters<typeof mapPlannedTaskRow>[0])),
          );
        }
        if (itemsRes.error) {
          setToast({ id: createId(), message: itemsRes.error.message });
        }
        if (tasksRes.error) {
          setToast({ id: createId(), message: tasksRes.error.message });
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
  }, [supabase]);

  const [taskActionsOpen, setTaskActionsOpen] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  const activeTask = useMemo(
    () => plannedTasks.find((t) => t.id === activeTaskId) ?? null,
    [plannedTasks, activeTaskId],
  );

  const [addOpen, setAddOpen] = useState(false);
  const [planningWeek, setPlanningWeek] = useState(false);
  const [refiningChip, setRefiningChip] = useState<string | null>(null);
  const [askKeeperOpen, setAskKeeperOpen] = useState(false);
  const [brainDumpParsing, setBrainDumpParsing] = useState(false);
  const [brainDumpPreviewOpen, setBrainDumpPreviewOpen] = useState(false);
  const [brainDumpDrafts, setBrainDumpDrafts] = useState<BrainDumpItemDraft[]>([]);
  const [brainDumpSaving, setBrainDumpSaving] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const ms = toast.onUndo ? 12000 : 2600;
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

  const loadByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of weekDays) map.set(toISODate(d), 0);
    for (const task of plannedTasks) {
      map.set(task.scheduled_date, (map.get(task.scheduled_date) ?? 0) + 1);
    }
    return map;
  }, [plannedTasks, weekDays]);

  const tasksCountByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of plannedTasks) {
      m.set(t.scheduled_date, (m.get(t.scheduled_date) ?? 0) + 1);
    }
    return m;
  }, [plannedTasks]);

  const headerSubtitle = useMemo(() => {
    const sel = new Date(`${selectedDateISO}T12:00:00`);
    if (plannerView === "day") {
      return sel.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    }
    return `${weekDays[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${weekDays[6].toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  }, [plannerView, selectedDateISO, weekDays]);

  const sectionTitle = useMemo(() => {
    if (plannerView === "month") {
      const d = new Date(`${selectedDateISO}T12:00:00`);
      return `Tasks · ${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`;
    }
    if (plannerView === "day") {
      return selectedDateISO === todayISO ? "Today" : "Day schedule";
    }
    return selectedDateISO === todayISO ? "Today" : "Selected day";
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

  async function applyRefineChanges(
    userId: string,
    changes: RefineChange[],
    current: PlannedTask[],
  ): Promise<PlannedTask[]> {
    let next = [...current];
    for (const c of changes) {
      const nowISO = new Date().toISOString();
      if (c.action === "move") {
        const { error } = await supabase
          .from("planned_tasks")
          .update({
            scheduled_date: c.to_date,
            status: "moved",
            updated_at: nowISO,
          })
          .eq("id", c.planned_task_id);
        if (error) throw new Error(error.message);
        next = next.map((t) =>
          t.id === c.planned_task_id
            ? { ...t, scheduled_date: c.to_date, status: "moved", updated_at: nowISO }
            : t,
        );
      } else if (c.action === "remove") {
        const { error } = await supabase.from("planned_tasks").delete().eq("id", c.planned_task_id);
        if (error) throw new Error(error.message);
        next = next.filter((t) => t.id !== c.planned_task_id);
      } else if (c.action === "add") {
        const item = items.find((i) => i.id === c.item_id);
        if (!item) throw new Error("Unknown item for add.");
        const input: NewPlannedTaskInput = {
          item_id: item.id,
          title_snapshot: item.title,
          scheduled_date: c.to_date,
          scheduled_time_start: c.scheduled_time_start ?? null,
          scheduled_time_end: null,
          status: "planned",
          priority_override: null,
          notes: null,
        };
        const { data, error } = await supabase
          .from("planned_tasks")
          .insert(plannedTaskToInsertRow(userId, input))
          .select()
          .single();
        if (error) throw new Error(error.message);
        const mapped = mapPlannedTaskRow(data as Parameters<typeof mapPlannedTaskRow>[0]);
        next = [mapped, ...next];
      }
    }
    return next;
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
    const beforeSnapshot = plannedTasks.map((t) => ({ ...t }));
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
          },
        }),
      });
      const data = (await res.json()) as RefineResponseBody & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Request failed.");
      }
      const afterTasks = await applyRefineChanges(user.id, data.changes, plannedTasks);
      setPlannedTasks(afterTasks);
      setToast({
        id: createId(),
        message: data.note,
        onUndo: () =>
          void (async () => {
            try {
              await syncPlannedTasksUndo(user.id, beforeSnapshot, afterTasks);
              setPlannedTasks(beforeSnapshot.map((t) => ({ ...t })));
              setToast({ id: createId(), message: "Reverted the last suggestion." });
            } catch (e) {
              setToast({
                id: createId(),
                message: e instanceof Error ? e.message : "Could not undo.",
              });
            }
          })(),
      });
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
    try {
      const res = await fetch("/api/inventory/parse-brain-dump", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
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
    const inputs = buildPlanMyWeekInputs(items, existingInWeek, weekISOs);

    if (inputs.length === 0) {
      setToast({
        id: createId(),
        message:
          "Nothing to schedule — no items due by the end of this week, or they’re already on the planner.",
      });
      return;
    }

    setPlanningWeek(true);
    try {
      const rows = inputs.map((input) => plannedTaskToInsertRow(user.id, input));
      const { data, error } = await supabase.from("planned_tasks").insert(rows).select();
      if (error) {
        setToast({ id: createId(), message: error.message });
        return;
      }
      const mapped = (data ?? []).map((r) =>
        mapPlannedTaskRow(r as Parameters<typeof mapPlannedTaskRow>[0]),
      );
      setPlannedTasks((prev) => [...mapped, ...prev]);
      setToast({
        id: createId(),
        message: `Added ${mapped.length} task${mapped.length === 1 ? "" : "s"} to this week.`,
      });
    } finally {
      setPlanningWeek(false);
    }
  }

  function shiftWeek(delta: -1 | 1) {
    setWeekOffset((o) => o + delta);
    setSelectedDateISO((prev) => {
      const d = new Date(`${prev}T12:00:00`);
      if (!Number.isFinite(d.getTime())) return prev;
      d.setDate(d.getDate() + delta * 7);
      setMonthCursor(startOfMonth(d));
      return toISODate(d);
    });
  }

  function jumpPlannerToDate(iso: string) {
    const target = new Date(`${iso}T12:00:00`);
    if (!Number.isFinite(target.getTime())) return;
    const d = daysFromTodayStart(todayStart, target);
    setWeekOffset(Math.floor(d / 7));
    setSelectedDateISO(iso);
    setMonthCursor(startOfMonth(target));
  }

  function handlePlannerViewChange(v: PlannerView) {
    setPlannerView(v);
    if (v === "month") {
      setMonthCursor(startOfMonth(new Date(`${selectedDateISO}T12:00:00`)));
    }
  }

  function shiftDay(delta: -1 | 1) {
    const d = new Date(`${selectedDateISO}T12:00:00`);
    d.setDate(d.getDate() + delta);
    jumpPlannerToDate(toISODate(d));
  }

  function shiftMonth(delta: -1 | 1) {
    setMonthCursor((prev) => {
      const n = new Date(prev);
      n.setMonth(n.getMonth() + delta);
      return startOfMonth(n);
    });
  }

  function openTaskActions(taskId: string) {
    setActiveTaskId(taskId);
    setTaskActionsOpen(true);
  }

  function closeTaskActions() {
    setTaskActionsOpen(false);
    setActiveTaskId(null);
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

    const nowISO = new Date().toISOString();
    const { error: taskErr } = await supabase
      .from("planned_tasks")
      .update({ status: "done", updated_at: nowISO })
      .eq("id", taskId);
    if (taskErr) {
      setToast({ id: createId(), message: taskErr.message });
      return;
    }

    setPlannedTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, status: "done", updated_at: nowISO } : t,
      ),
    );

    const item = itemById.get(task.item_id);
    if (!item || item.type !== "recurring") return;

    const nextDue = computeNextDueDate(item, nowISO);
    const { error: itemErr } = await supabase
      .from("items")
      .update({
        last_completed_at: nowISO,
        next_due_date: nextDue,
        updated_at: nowISO,
      })
      .eq("id", item.id);
    if (itemErr) {
      setToast({ id: createId(), message: itemErr.message });
      return;
    }

    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? { ...i, last_completed_at: nowISO, next_due_date: nextDue, updated_at: nowISO }
          : i,
      ),
    );
  }

  async function moveTask(taskId: string, toDateISO: string) {
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

  async function handleAddPlannedTask(input: NewPlannedTaskInput) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setToast({ id: createId(), message: "You need to be signed in to add a task." });
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

    const quickItem: Omit<Item, "id" | "created_at" | "updated_at"> = {
      title: trimmed,
      category: "Personal",
      type: "one_off",
      frequency_type: null,
      frequency_value: null,
      preferred_days: null,
      preferred_time_of_day: null,
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
          {(plannerView === "week" || plannerView === "day") && (
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
          <button
            type="button"
            disabled={planningWeek || loading}
            onClick={() => void handlePlanMyWeek()}
            className="rounded-full bg-accent px-4 py-2 text-[13px] font-medium text-surface-raised shadow-soft transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
          >
            {planningWeek ? "Planning…" : "Plan my week"}
          </button>
        </div>
      </header>

      {loading ? (
        <p className="text-[13px] text-ink-muted">Loading…</p>
      ) : (
        <>
          <div className="flex flex-col gap-2 pb-3">
            {plannerView === "week" && (
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => shiftWeek(-1)}
                  className="flex w-9 shrink-0 items-center justify-center self-stretch rounded-lg py-2 text-[var(--color-text-secondary)] transition-opacity hover:opacity-70 active:opacity-55"
                  aria-label="Previous 7 days"
                >
                  <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
                </button>
                <div className="flex min-w-0 flex-1 items-start justify-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {weekDays.map((d) => {
                    const iso = toISODate(d);
                    const selected = iso === selectedDateISO;
                    const isToday = iso === todayISO;
                    const dotCount = loadByDate.get(iso) ?? 0;
                    const dotClass = formatDayDotClass(dotCount);
                    const dayAbbr = d.toLocaleDateString(undefined, { weekday: "narrow" });
                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => jumpPlannerToDate(iso)}
                        className={`flex min-w-[3.15rem] flex-col items-center gap-1 rounded-[20px] px-2 py-2 ${
                          selected
                            ? "bg-accent-soft/80 text-accent"
                            : "bg-surface-raised text-ink-muted"
                        } ${isToday && !selected ? "ring-1 ring-accent/25" : ""}`}
                        aria-pressed={selected}
                        aria-current={isToday ? "date" : undefined}
                      >
                        <span className="text-[11px] font-medium">{dayAbbr}</span>
                        <span className="text-[13px] font-semibold">{d.getDate()}</span>
                        <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden />
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => shiftWeek(1)}
                  className="flex w-9 shrink-0 items-center justify-center self-stretch rounded-lg py-2 text-[var(--color-text-secondary)] transition-opacity hover:opacity-70 active:opacity-55"
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

            <div className="mt-4 flex-1 overflow-y-auto pr-1 pb-44">
              {plannerView === "day" ? (
                <PlannerDayView
                  tasks={selectedDayTasks}
                  itemById={itemById}
                  onOpenTask={openTaskActions}
                />
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
        onRefine={(action, label, custom) => void handleRefineChip(action, label, custom)}
        onBrainDumpParse={(text) => void handleBrainDumpParse(text)}
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
        onClick={() => setAddOpen(true)}
        className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom)+4rem)] right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-surface-raised shadow-[0_4px_14px_rgba(202,165,16,0.35)] transition-transform hover:scale-[1.02] active:scale-[0.98] sm:right-8"
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
        onClose={() => setAddOpen(false)}
        weekDays={weekDays}
        selectedDateISO={selectedDateISO}
        items={items}
        onAdd={(input) => void handleAddPlannedTask(input)}
        onQuickAdd={(payload) => void handleQuickAddPlannedTask(payload)}
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
      />

      {toast && (
        <ToastView
          message={toast.message}
          onUndo={toast.onUndo}
        />
      )}
    </div>
  );
}

function ToastView({
  message,
  onUndo,
}: {
  message: string;
  onUndo?: () => void | Promise<void>;
}) {
  return (
    <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom)+1.25rem)] left-1/2 z-[90] w-[calc(100%-2rem)] max-w-md -translate-x-1/2">
      <div className="flex flex-col items-stretch gap-2 rounded-[20px] border border-border bg-surface-raised px-4 py-3 text-[13px] text-ink-muted shadow-soft sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <p className="text-center sm:flex-1 sm:text-left">{message}</p>
        {onUndo && (
          <button
            type="button"
            onClick={() => void onUndo()}
            className="shrink-0 rounded-full border border-border bg-surface-alt px-3 py-1.5 text-[13px] font-medium text-ink hover:border-accent/25"
          >
            Undo
          </button>
        )}
      </div>
    </div>
  );
}

const REFINE_CHIPS_SHEET: { label: string; action: RefineApiAction }[] = [
  { label: "Plan my week", action: "plan_week" },
  { label: "Lighten today", action: "lighten_day" },
  { label: "1 hour tonight", action: "one_hour" },
  { label: "Rebalance week", action: "rebalance" },
];

function AskKeeperPanel({
  open,
  onOpenChange,
  disabled,
  refiningLabel,
  parsingBrainDump,
  onRefine,
  onBrainDumpParse,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  refiningLabel: string | null;
  parsingBrainDump?: boolean;
  onRefine: (action: RefineApiAction, chipLabel: string, customPrompt?: string) => void | Promise<void>;
  onBrainDumpParse: (text: string) => void | Promise<void>;
}) {
  const [customLine, setCustomLine] = useState("");
  const [brainDump, setBrainDump] = useState("");

  const busy = Boolean(refiningLabel || parsingBrainDump);

  useEffect(() => {
    if (!open) {
      setCustomLine("");
      setBrainDump("");
    }
  }, [open]);

  function close() {
    onOpenChange(false);
  }

  function pickChip(action: RefineApiAction, label: string) {
    close();
    void onRefine(action, label);
  }

  function submitCustom() {
    const t = customLine.trim();
    if (!t) return;
    close();
    void onRefine("custom", "Custom", t);
  }

  function submitBrainDump() {
    const t = brainDump.trim();
    if (!t) return;
    void onBrainDumpParse(t);
  }

  return (
    <>
      {!open && (
        <div className="pointer-events-none fixed bottom-[calc(4rem+env(safe-area-inset-bottom,0px)+1.375rem)] left-0 right-0 z-[55] flex justify-center px-5">
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => onOpenChange(true)}
            className="pointer-events-auto rounded-full bg-[#0f394c] px-4 py-2 text-[13px] font-medium text-white shadow-soft transition-opacity hover:opacity-[0.96] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "…" : "Ask Keeper"}
          </button>
        </div>
      )}
      {open && (
        <div className="fixed inset-0 z-[70]">
          <button
            type="button"
            className="absolute inset-0 bg-black/20 backdrop-blur-[1px]"
            aria-label="Close"
            onClick={close}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Ask Keeper"
            className="absolute bottom-0 left-0 right-0 mx-auto max-h-[min(88dvh,720px)] w-full max-w-shell overflow-y-auto rounded-t-[20px] border border-border bg-surface-raised shadow-[0_-12px_40px_rgba(15,57,76,0.12)] sm:max-w-xl md:max-w-2xl lg:max-w-3xl"
          >
            <div className="px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-8 md:px-10">
              <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-ink-faint/50" aria-hidden />
              <header className="mb-4 flex items-center justify-between gap-3">
                <h2 className="font-serif text-[20px] font-normal tracking-tight text-ink">Ask Keeper</h2>
                <button
                  type="button"
                  onClick={close}
                  className="rounded-xl px-3 py-2 text-[13px] font-medium text-ink-muted hover:bg-surface-muted/70 hover:text-ink"
                >
                  Cancel
                </button>
              </header>

              <div className="mb-5 rounded-[14px] border border-border bg-surface-alt/70 p-4">
                <p className="text-[13px] font-medium text-ink">Add to inventory from notes</p>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
                  Paste routines, recurring tasks, and responsibilities. Keeper will suggest structured
                  items you can edit before saving.
                </p>
                <textarea
                  value={brainDump}
                  onChange={(e) => setBrainDump(e.target.value)}
                  placeholder="Brain dump: e.g. trash every Tuesday, kids swim Wed evening, quarterly HVAC filter…"
                  rows={4}
                  className="mt-3 w-full resize-y rounded-[10px] border border-border bg-surface-raised px-3 py-2.5 text-[14px] text-ink placeholder:text-ink-faint focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/15"
                />
                <button
                  type="button"
                  disabled={disabled || busy || !brainDump.trim()}
                  onClick={() => submitBrainDump()}
                  className="mt-3 w-full rounded-[10px] bg-[#0f394c] px-4 py-2.5 text-[13px] font-semibold text-white shadow-soft transition-opacity hover:opacity-[0.96] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {parsingBrainDump ? "Parsing…" : "Parse into items"}
                </button>
              </div>

              <p className="mb-2 text-[12px] font-medium uppercase tracking-wide text-ink-muted">
                Planner
              </p>
              <div className="flex flex-wrap gap-2">
                {REFINE_CHIPS_SHEET.map(({ label, action }) => (
                  <button
                    key={label}
                    type="button"
                    disabled={disabled || busy}
                    onClick={() => pickChip(action, label)}
                    className="shrink-0 rounded-full border border-border bg-surface-alt px-3 py-2 text-[13px] font-medium text-ink-muted shadow-sm transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                <input
                  type="text"
                  value={customLine}
                  onChange={(e) => setCustomLine(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitCustom();
                    }
                  }}
                  placeholder="Or type a custom planner request"
                  className="min-w-0 flex-1 rounded-[10px] border border-border bg-surface-raised px-3 py-2.5 text-[14px] text-ink placeholder:text-ink-faint focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/15"
                />
                <button
                  type="button"
                  disabled={disabled || busy || !customLine.trim()}
                  onClick={() => submitCustom()}
                  className="shrink-0 rounded-[10px] border border-border bg-surface-alt px-3 py-2 text-[13px] font-medium text-ink hover:border-accent/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

type AddMode = "quick" | "inventory";

function AddToWeekSheet({
  open,
  onClose,
  weekDays,
  items,
  selectedDateISO,
  onAdd,
  onQuickAdd,
}: {
  open: boolean;
  onClose: () => void;
  weekDays: Date[];
  items: Item[];
  selectedDateISO: string;
  onAdd: (task: NewPlannedTaskInput) => void | Promise<void>;
  onQuickAdd: (payload: {
    title: string;
    scheduled_date: string;
    scheduled_time_start: string | null;
    scheduled_time_end: string | null;
    estimated_minutes: number;
  }) => void | Promise<void>;
}) {
  const [mode, setMode] = useState<AddMode>("quick");
  const [quickTitle, setQuickTitle] = useState("");
  const [query, setQuery] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [assignedDateISO, setAssignedDateISO] = useState(selectedDateISO);
  const [timeStart, setTimeStart] = useState<string>("");
  const [durationMinutes, setDurationMinutes] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setMode("quick");
    setQuickTitle("");
    setQuery("");
    setSelectedItemId(null);
    setAssignedDateISO(selectedDateISO);
    setTimeStart("");
    setDurationMinutes("");
  }, [open, selectedDateISO]);

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedItemId) ?? null,
    [items, selectedItemId],
  );

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.title.toLowerCase().includes(q));
  }, [items, query]);

  function parseTimeToMinutes(t: string): number | null {
    const match = t.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return h * 60 + m;
  }

  function minutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60) % 24;
    const m = minutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  const parsedDurationMinutes = useMemo(() => {
    const trimmed = durationMinutes.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/(\d+(?:\.\d+)?)/);
    if (!match) return null;
    const n = Number(match[1]);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n);
  }, [durationMinutes]);

  const scheduledTimeStart = useMemo(() => {
    const t = timeStart.trim();
    if (!t) return null;
    return parseTimeToMinutes(t) == null ? null : t;
  }, [timeStart]);

  const effectiveDurationMinutes = useMemo(() => {
    if (mode === "quick") {
      return parsedDurationMinutes ?? 30;
    }
    if (selectedItem) {
      return parsedDurationMinutes ?? selectedItem.estimated_minutes;
    }
    return parsedDurationMinutes ?? 30;
  }, [mode, parsedDurationMinutes, selectedItem]);

  const scheduledTimeEnd = useMemo(() => {
    if (!scheduledTimeStart) return null;
    const startMin = parseTimeToMinutes(scheduledTimeStart);
    if (startMin == null) return null;
    return minutesToTime(startMin + effectiveDurationMinutes);
  }, [scheduledTimeStart, effectiveDurationMinutes]);

  const canSaveQuick = quickTitle.trim().length > 0;
  const canSaveInventory = Boolean(selectedItem);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70]">
      <button
        type="button"
        className="absolute inset-0 bg-black/20 backdrop-blur-[1px]"
        aria-label="Close add task sheet"
        onClick={onClose}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-label="Add to week"
        className="absolute bottom-0 left-0 right-0 mx-auto w-full max-w-shell rounded-t-[20px] border border-border bg-surface-raised shadow-[0_-12px_40px_rgba(15,57,76,0.12)] sm:max-w-xl md:max-w-2xl lg:max-w-3xl"
      >
        <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-8 md:px-10">
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-ink-faint/50" aria-hidden />
          <header className="mb-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="font-serif text-[20px] font-normal tracking-tight text-ink">
                Add to day
              </h2>
              <p className="mt-1 text-[13px] text-ink-muted">
                {mode === "quick"
                  ? "Name the task, pick a day, and save."
                  : "Pick something from your inventory, or switch to Quick add."}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-3 py-2 text-sm font-medium text-ink-muted hover:bg-surface-muted/70 hover:text-ink"
            >
              Cancel
            </button>
          </header>

          <div className="mb-4 flex rounded-[10px] border border-border bg-surface-alt p-1">
            <button
              type="button"
              onClick={() => setMode("quick")}
              className={`flex-1 rounded-[8px] px-3 py-2 text-[13px] font-medium transition-colors ${
                mode === "quick"
                  ? "bg-surface-raised text-accent shadow-sm"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              Quick add
            </button>
            <button
              type="button"
              onClick={() => setMode("inventory")}
              className={`flex-1 rounded-[8px] px-3 py-2 text-[13px] font-medium transition-colors ${
                mode === "inventory"
                  ? "bg-surface-raised text-accent shadow-sm"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              From inventory
            </button>
          </div>

          <div className="space-y-4">
            {mode === "quick" && (
              <label className="block">
                <span className="mb-2 block text-[13px] font-medium text-ink-muted">
                  What do you need to do?
                </span>
                <input
                  value={quickTitle}
                  onChange={(e) => setQuickTitle(e.target.value)}
                  placeholder="Task here.."
                  className="w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-base text-ink shadow-sm outline-none placeholder:text-ink-faint focus:border-accent/40 focus:ring-2 focus:ring-accent/15"
                  autoFocus
                />
              </label>
            )}

            {mode === "inventory" && (
              <label className="block">
                <span className="mb-2 block text-[13px] font-medium text-ink-muted">
                  Search inventory
                </span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. yoga"
                  className="w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-base text-ink shadow-sm outline-none placeholder:text-ink-faint focus:border-accent/40 focus:ring-2 focus:ring-accent/15"
                />
              </label>
            )}

            <label className="block">
              <span className="mb-2 block text-[13px] font-medium text-ink-muted">Date</span>
              <input
                type="date"
                value={assignedDateISO}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) setAssignedDateISO(v);
                }}
                className="w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-base text-ink shadow-sm outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/15"
              />
            </label>

            <div>
              <span className="mb-2 block text-[13px] font-medium text-ink-muted">
                Next 7 days (quick pick)
              </span>
              <div className="flex gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {weekDays.map((d) => {
                  const iso = toISODate(d);
                  const selected = iso === assignedDateISO;
                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => setAssignedDateISO(iso)}
                      className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-[13px] font-medium transition-colors ${
                        selected
                          ? "border-accent/25 bg-surface-alt text-accent"
                          : "border-border bg-surface-raised text-ink-muted"
                      }`}
                    >
                      {d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2)}{" "}
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>

            {mode === "inventory" && (
              <div className="max-h-[34vh] overflow-y-auto pr-1">
                <ul className="flex flex-col gap-3 pb-2">
                  {items.length === 0 && (
                    <li className="rounded-[14px] border border-dashed border-border bg-surface-alt/60 px-4 py-8 text-center text-[13px] text-ink-muted">
                      No inventory items yet. Use <span className="font-medium text-ink">Quick add</span>{" "}
                      above, or add items in <span className="font-medium text-ink">Inventory</span>.
                    </li>
                  )}
                  {items.length > 0 && filteredItems.length === 0 && (
                    <li className="rounded-[14px] border border-dashed border-border bg-surface-alt/60 px-4 py-6 text-center text-[13px] text-ink-muted">
                      No matches. Clear the search box to see all items.
                    </li>
                  )}
                  {filteredItems.map((item) => {
                    const active = item.id === selectedItemId;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedItemId(item.id)}
                          className={`w-full rounded-[14px] border bg-surface-raised p-4 text-left shadow-soft transition-colors ${
                            active ? "border-accent/25" : "border-border"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <CategoryIcon category={item.category} />
                            <div className="min-w-0 flex-1">
                              <div className="text-[15px] font-semibold text-ink">
                                {item.title}
                              </div>
                              <div className="mt-1 text-[13px] text-ink-muted">
                                {item.category} · {item.estimated_minutes} min · {item.priority}
                              </div>
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-[13px] font-medium text-ink-muted">
                  Time (optional)
                </span>
                <input
                  type="time"
                  value={timeStart}
                  onChange={(e) => setTimeStart(e.target.value)}
                  className="w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-base text-ink shadow-sm outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/15"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-[13px] font-medium text-ink-muted">
                  Duration (optional, minutes)
                </span>
                <input
                  inputMode="numeric"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  placeholder={mode === "quick" ? "default 30" : "e.g. 30"}
                  className="w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-base text-ink shadow-sm outline-none placeholder:text-ink-faint focus:border-accent/40 focus:ring-2 focus:ring-accent/15"
                />
              </label>
            </div>

            <button
              type="button"
              disabled={mode === "quick" ? !canSaveQuick : !canSaveInventory}
              onClick={() => {
                if (mode === "quick") {
                  if (!canSaveQuick) return;
                  void onQuickAdd({
                    title: quickTitle.trim(),
                    scheduled_date: assignedDateISO,
                    scheduled_time_start: scheduledTimeStart,
                    scheduled_time_end: scheduledTimeEnd,
                    estimated_minutes: effectiveDurationMinutes,
                  });
                  return;
                }
                if (!selectedItem) return;
                const input: NewPlannedTaskInput = {
                  item_id: selectedItem.id,
                  title_snapshot: selectedItem.title,
                  scheduled_date: assignedDateISO,
                  scheduled_time_start: scheduledTimeStart,
                  scheduled_time_end: scheduledTimeEnd,
                  status: "planned",
                  priority_override: null,
                  notes: null,
                };
                void onAdd(input);
              }}
              className="w-full rounded-[10px] bg-accent px-4 py-3.5 text-base font-semibold text-surface-raised shadow-[0_6px_18px_rgba(202,165,16,0.28)] transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save
            </button>
            {mode === "inventory" && items.length > 0 && !selectedItem && (
              <p className="text-center text-[12px] text-ink-muted">
                Tap an item above to enable Save.
              </p>
            )}
            {mode === "quick" && !canSaveQuick && (
              <p className="text-center text-[12px] text-ink-muted">
                Enter a task name to save.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function TaskActionsSheet({
  open,
  task,
  item,
  onClose,
  onMarkDone,
  onSkip,
  onReschedule,
}: {
  open: boolean;
  task: PlannedTask | null;
  item: Item | null;
  onClose: () => void;
  onMarkDone: (taskId: string) => void;
  onSkip: (taskId: string) => void;
  onReschedule: (taskId: string, toISODate: string) => void;
}) {
  if (!open || !task || !item) return null;

  return (
    <div className="fixed inset-0 z-[70]">
      <button
        type="button"
        className="absolute inset-0 bg-black/20 backdrop-blur-[1px]"
        aria-label="Close task actions"
        onClick={onClose}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-label="Task actions"
        className="absolute bottom-0 left-0 right-0 mx-auto w-full max-w-shell rounded-t-[20px] border border-border bg-surface-raised shadow-[0_-12px_40px_rgba(15,57,76,0.12)] sm:max-w-xl md:max-w-2xl lg:max-w-3xl"
      >
        <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-8 md:px-10">
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-ink-faint/50" aria-hidden />

          <header className="mb-5 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <CategoryIcon category={item.category} />
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold text-ink">{task.title_snapshot}</div>
                  <div className="mt-1 text-[13px] text-ink-muted">
                    {item.category} · {item.estimated_minutes} min
                  </div>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-3 py-2 text-sm font-medium text-ink-muted hover:bg-surface-muted/70 hover:text-ink"
            >
              Close
            </button>
          </header>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => onMarkDone(task.id)}
              className="w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-[13px] font-semibold text-ink shadow-soft hover:border-teal/30"
            >
              Mark done
            </button>
            <button
              type="button"
              onClick={() => onSkip(task.id)}
              className="w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-[13px] font-semibold text-ink shadow-soft hover:border-accent/20"
            >
              Skip
            </button>

            <div className="pt-1">
              <div className="mb-2 text-[13px] font-medium text-ink-muted">Reschedule</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onReschedule(task.id, toISODate(addDays(new Date(task.scheduled_date), 1)))
                  }
                  className="rounded-[10px] border border-border bg-surface-alt px-3 py-2 text-[13px] font-medium text-ink-muted"
                >
                  Tomorrow
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onReschedule(task.id, toISODate(addDays(new Date(task.scheduled_date), 2)))
                  }
                  className="rounded-[10px] border border-border bg-surface-alt px-3 py-2 text-[13px] font-medium text-ink-muted"
                >
                  Next open day
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onReschedule(task.id, toISODate(addDays(new Date(task.scheduled_date), 3)))
                  }
                  className="rounded-[10px] border border-border bg-surface-alt px-3 py-2 text-[13px] font-medium text-ink-muted"
                >
                  Later this week
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onReschedule(task.id, toISODate(addDays(new Date(task.scheduled_date), 7)))
                  }
                  className="rounded-[10px] border border-border bg-surface-alt px-3 py-2 text-[13px] font-medium text-ink-muted"
                >
                  Next week
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onReschedule(task.id, toISODate(addDays(new Date(task.scheduled_date), 4)))
                  }
                  className="col-span-2 rounded-[10px] border border-border bg-surface-alt px-3 py-2 text-[13px] font-medium text-ink-muted"
                >
                  Custom
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-[13px] font-semibold text-ink shadow-soft hover:border-border"
            >
              Edit
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
