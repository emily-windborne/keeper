"use client";

import { createClient } from "@lib/supabase";
import { ChevronLeft, ChevronRight } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Item } from "@/data/inventory-mock";
import { PlannerCalendarPopover } from "@/components/planner/PlannerCalendarPopover";
import { PlannerDayView } from "@/components/planner/PlannerDayView";
import { PlannerMonthView } from "@/components/planner/PlannerMonthView";
import { PlannerTaskList } from "@/components/planner/PlannerTaskList";
import { PlannerWeekTimelineView } from "@/components/planner/PlannerWeekTimelineView";
import { startOfMonth, toISODate } from "@/components/planner/planner-view-utils";
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
import type { RefineApiAction, RefineChange, RefineResponseBody } from "@/lib/api/refine-types";
import { AddToWeekSheet } from "@/components/planner/AddToWeekSheet";
import { AskKeeperPanel } from "@/components/planner/AskKeeperPanel";
import { BrainDumpPreviewSheet } from "@/components/planner/BrainDumpPreviewSheet";
import { TaskActionsSheet } from "@/components/planner/TaskActionsSheet";
import { ToastView } from "@/components/planner/ToastView";
import { markPlannedTaskDone } from "@/lib/planner/mark-task-done";
import { applyPlanMyWeek } from "@/lib/planner/apply-plan-my-week";

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
    const { inputs, deferred } = buildPlanMyWeekInputs(items, existingInWeek, weekISOs, todayISO);

    if (inputs.length === 0 && deferred.length === 0) {
      setToast({
        id: createId(),
        message:
          "Nothing to schedule — no items due by the end of this week, or they’re already on the planner.",
      });
      return;
    }

    setPlanningWeek(true);
    try {
      const nowISO = new Date().toISOString();
      const saved = await applyPlanMyWeek(supabase, inputs, deferred);
      if (saved.error) {
        setToast({ id: createId(), message: saved.error });
        return;
      }

      if (deferred.length) {
        const defMap = new Map(deferred.map((d) => [d.itemId, d.nextDueISO]));
        setItems((prev) =>
          prev.map((i) =>
            defMap.has(i.id) ? { ...i, next_due_date: defMap.get(i.id)!, updated_at: nowISO } : i,
          ),
        );
      }

      const mapped = saved.tasks;
      if (mapped.length > 0) {
        setPlannedTasks((prev) => [...mapped, ...prev]);
      }

      const parts: string[] = [];
      if (mapped.length > 0) {
        parts.push(`Added ${mapped.length} task${mapped.length === 1 ? "" : "s"} to this week.`);
      }
      for (const d of deferred) {
        parts.push(d.userMessage);
      }
      setToast({
        id: createId(),
        message: parts.join(" "),
      });
      router.refresh();
    } finally {
      setPlanningWeek(false);
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
    setPlannedTasks((prev) => prev.map((t) => (t.id === taskId ? result.task : t)));
    if (result.item) {
      const nextItem = result.item;
      setItems((prev) => prev.map((i) => (i.id === nextItem.id ? nextItem : i)));
    }
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

  async function deletePlannedTask(taskId: string) {
    const { error } = await supabase.from("planned_tasks").delete().eq("id", taskId);
    if (error) {
      setToast({ id: createId(), message: error.message });
      return;
    }
    setPlannedTasks((prev) => prev.filter((t) => t.id !== taskId));
    closeTaskActions();
    setToast({ id: createId(), message: "Task removed from planner." });
  }

  async function savePlannedTaskInstance(
    taskId: string,
    patch: {
      scheduled_date: string;
      scheduled_time_start: string | null;
      scheduled_time_end: string | null;
      notes: string | null;
    },
  ): Promise<boolean> {
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
    setToast({ id: createId(), message: "Saved this event." });
    router.refresh();
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
    setItems((prev) =>
      prev.map((i) => (i.id === updated.id ? { ...updated, updated_at: nowISO } : i)),
    );
    setToast({ id: createId(), message: "Saved inventory item." });
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
      frequency_unit: null,
      times_per_period: 1,
      recurrence_end: "never",
      recurrence_end_date: null,
      recurrence_end_count: null,
      completed_count: 0,
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

            <div className="mt-4 flex-1 overflow-y-auto pr-1 pb-44">
              {plannerView === "day" ? (
                <PlannerDayView
                  tasks={selectedDayTasks}
                  itemById={itemById}
                  onOpenTask={openTaskActions}
                />
              ) : plannerView === "week" ? (
                <div className="flex w-full justify-center">
                  <PlannerWeekTimelineView
                    weekDays={timelineWeekDays}
                    plannedTasks={plannedTasks}
                    itemById={itemById}
                    selectedDateISO={selectedDateISO}
                    todayISO={todayISO}
                    onSelectDate={jumpPlannerToDate}
                    onOpenTask={openTaskActions}
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
        planningWeek={planningWeek}
        onPlanMyWeek={() => void handlePlanMyWeek()}
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
          onSaveInstance={(taskId, patch) => savePlannedTaskInstance(taskId, patch)}
          onSaveItem={(item) => saveItemFromPlanner(item)}
        />
      ) : null}

      {toast && (
        <ToastView
          message={toast.message}
          onUndo={toast.onUndo}
        />
      )}
    </div>
  );
}
