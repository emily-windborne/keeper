"use client";

import { createClient } from "@lib/supabase";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toISODate } from "@/components/planner/planner-view-utils";
import { mapItemRow, mapPlannedTaskRow, type PlannedTask } from "@/lib/db/map-rows";
import { formatClock } from "@/lib/planner/clock-label";
import { markPlannedTaskDone } from "@/lib/planner/mark-task-done";
import { saveNextRepeats } from "@/lib/planner/next-repeat";
import { loadProtectedTimes } from "@/lib/settings/protected-times";
import { loadUserSettings } from "@/lib/settings/user-settings";
import type { Item } from "@/data/inventory-mock";

type EnergyLevel = "Low" | "Medium" | "High";
type Outcome = "done" | "skipped" | "move_tomorrow" | "move_later";

function addDaysToISO(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

function outcomeSummaryLabel(outcome: string): string {
  switch (outcome) {
    case "done":
      return "Done";
    case "skipped":
      return "Skipped";
    case "move_tomorrow":
      return "Moved to tomorrow";
    case "move_later":
      return "Moved later";
    default:
      return outcome;
  }
}

type CheckInRow = {
  id: string;
  user_id: string;
  date: string;
  energy_level: EnergyLevel;
  notes: string | null;
  created_at: string;
};

type TaskUpdateRow = {
  outcome: string;
  planned_tasks: { title_snapshot: string } | null;
};

function normalizeEmbeddedPlanned(
  raw: unknown,
): { title_snapshot: string } | null {
  if (raw == null || typeof raw !== "object") return null;
  if (Array.isArray(raw)) {
    const first = raw[0];
    if (first && typeof first === "object" && "title_snapshot" in first) {
      return { title_snapshot: String((first as { title_snapshot: unknown }).title_snapshot) };
    }
    return null;
  }
  if ("title_snapshot" in raw) {
    return { title_snapshot: String((raw as { title_snapshot: unknown }).title_snapshot) };
  }
  return null;
}

function taskSnapshotTitle(u: TaskUpdateRow): string {
  return u.planned_tasks?.title_snapshot ?? "Task";
}

function taskTimeLabel(value: string | null): string | null {
  if (!value) return null;
  const label = formatClock(value);
  return label || null;
}

function TomorrowPreview({ tasks }: { tasks: PlannedTask[] }) {
  const ordered = [...tasks].sort(
    (a, b) =>
      (a.scheduled_time_start ?? "99:99").localeCompare(b.scheduled_time_start ?? "99:99") ||
      a.title_snapshot.localeCompare(b.title_snapshot),
  );
  return (
    <details className="mt-8 rounded-[14px] border border-border bg-surface-raised shadow-soft">
      <summary className="min-h-11 cursor-pointer list-none px-4 py-3">
        <span className="flex items-center justify-between gap-3">
          <span className="text-[15px] font-medium text-ink">Preview tomorrow</span>
          <span className="text-[12px] text-ink-muted">Optional</span>
        </span>
      </summary>
      <div className="border-t border-border px-4 py-3">
        {ordered.length === 0 ? (
          <p className="text-[13px] text-ink-muted">Nothing scheduled for tomorrow.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {ordered.map((task) => {
              const time = taskTimeLabel(task.scheduled_time_start);
              return (
                <li key={task.id} className="text-[15px] text-ink">
                  {time ? `${time} · ${task.title_snapshot}` : task.title_snapshot}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </details>
  );
}

export function CheckInScreen() {
  const supabase = useMemo(() => createClient(), []);
  const todayISO = useMemo(() => toISODate(new Date()), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [existingCheckIn, setExistingCheckIn] = useState<CheckInRow | null>(null);
  const [summaryUpdates, setSummaryUpdates] = useState<TaskUpdateRow[]>([]);

  const [todayTasks, setTodayTasks] = useState<PlannedTask[]>([]);
  const [tomorrowTasks, setTomorrowTasks] = useState<PlannedTask[]>([]);
  const [itemsById, setItemsById] = useState<Map<string, Item>>(new Map());

  const [energy, setEnergy] = useState<EnergyLevel | null>(null);
  const [notes, setNotes] = useState("");
  const [outcomes, setOutcomes] = useState<Partial<Record<string, Outcome>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      setError("Sign in to use check-in.");
      return;
    }

    const tomorrowISO = addDaysToISO(todayISO, 1);
    const [checkRes, tasksRes, itemsRes, tomorrowRes] = await Promise.all([
      supabase.from("check_ins").select("*").eq("user_id", user.id).eq("date", todayISO).maybeSingle(),
      supabase
        .from("planned_tasks")
        .select("*")
        .eq("user_id", user.id)
        .eq("scheduled_date", todayISO)
        .eq("status", "planned")
        .order("scheduled_time_start", { ascending: true, nullsFirst: false }),
      supabase.from("items").select("*").eq("user_id", user.id),
      supabase
        .from("planned_tasks")
        .select("*")
        .eq("user_id", user.id)
        .eq("scheduled_date", tomorrowISO)
        .in("status", ["planned", "moved"])
        .order("scheduled_time_start", { ascending: true, nullsFirst: false }),
    ]);

    if (!tomorrowRes.error && tomorrowRes.data) {
      setTomorrowTasks(
        tomorrowRes.data.map((row) => mapPlannedTaskRow(row as Parameters<typeof mapPlannedTaskRow>[0])),
      );
    } else {
      setTomorrowTasks([]);
    }

    if (checkRes.error) {
      setError(checkRes.error.message);
      setLoading(false);
      return;
    }

    if (checkRes.data) {
      const row = checkRes.data as CheckInRow;
      setExistingCheckIn(row);
      const updRes = await supabase
        .from("check_in_task_updates")
        .select(
          `
          outcome,
          planned_tasks ( title_snapshot )
        `,
        )
        .eq("check_in_id", row.id);

      if (!updRes.error && updRes.data) {
        const rows = updRes.data as { outcome: string; planned_tasks: unknown }[];
        setSummaryUpdates(
          rows.map((r) => ({
            outcome: r.outcome,
            planned_tasks: normalizeEmbeddedPlanned(r.planned_tasks),
          })),
        );
      } else {
        setSummaryUpdates([]);
      }
      setTodayTasks([]);
    } else {
      setExistingCheckIn(null);
      setSummaryUpdates([]);
      if (!tasksRes.error && tasksRes.data) {
        setTodayTasks(
          tasksRes.data.map((r) => mapPlannedTaskRow(r as Parameters<typeof mapPlannedTaskRow>[0])),
        );
      } else {
        setTodayTasks([]);
      }
    }

    if (!itemsRes.error && itemsRes.data) {
      const m = new Map<string, Item>();
      for (const r of itemsRes.data) {
        const item = mapItemRow(r as Parameters<typeof mapItemRow>[0]);
        m.set(item.id, item);
      }
      setItemsById(m);
    }

    setLoading(false);
  }, [supabase, todayISO]);

  useEffect(() => {
    void load();
  }, [load]);

  function setOutcome(taskId: string, o: Outcome) {
    setOutcomes((prev) => ({ ...prev, [taskId]: o }));
  }

  async function applyOutcome(
    task: PlannedTask,
    outcome: Outcome,
    nowISO: string,
  ): Promise<{ error: string | null }> {
    const item = itemsById.get(task.item_id);

    try {
      if (outcome === "done") {
        const result = await markPlannedTaskDone(supabase, task, item ?? null, nowISO);
        return { error: result.error };
      }

      if (outcome === "skipped") {
        const { error } = await supabase
          .from("planned_tasks")
          .update({ status: "skipped", updated_at: nowISO })
          .eq("id", task.id);
        return { error: error?.message ?? null };
      }

      if (outcome === "move_tomorrow") {
        const next = addDaysToISO(todayISO, 1);
        const { error } = await supabase
          .from("planned_tasks")
          .update({
            scheduled_date: next,
            status: "moved",
            updated_at: nowISO,
          })
          .eq("id", task.id);
        return { error: error?.message ?? null };
      }

      const later = addDaysToISO(todayISO, 3);
      const { error } = await supabase
        .from("planned_tasks")
        .update({
          scheduled_date: later,
          status: "moved",
          updated_at: nowISO,
        })
        .eq("id", task.id);
      return { error: error?.message ?? null };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Could not update task." };
    }
  }

  async function handleSave() {
    if (!energy) {
      setError("Choose your energy level.");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("You need to be signed in.");
      return;
    }

    const actioned = todayTasks.filter((t) => outcomes[t.id] != null);

    setSaving(true);
    setError(null);
    const nowISO = new Date().toISOString();

    try {
      const { data: checkRow, error: checkErr } = await supabase
        .from("check_ins")
        .insert({
          user_id: user.id,
          date: todayISO,
          energy_level: energy,
          notes: notes.trim() || null,
        })
        .select()
        .single();

      if (checkErr || !checkRow) {
        setError(checkErr?.message ?? "Could not save check-in.");
        return;
      }

      const checkInId = (checkRow as CheckInRow).id;

      for (const task of actioned) {
        const o = outcomes[task.id]!;
        const err = await applyOutcome(task, o, nowISO);
        if (err.error) {
          setError(err.error);
          return;
        }

        const { error: updErr } = await supabase.from("check_in_task_updates").insert({
          check_in_id: checkInId,
          planned_task_id: task.id,
          outcome: o,
        });
        if (updErr) {
          setError(updErr.message);
          return;
        }
      }

      let scheduleError: string | null = null;
      const markedDone = actioned.some((task) => outcomes[task.id] === "done");
      if (markedDone) {
        const settings = await loadUserSettings(supabase);
        if (settings.autoScheduleNext) {
          const [tasksRes, itemsRes] = await Promise.all([
            supabase.from("planned_tasks").select("*").eq("user_id", user.id),
            supabase.from("items").select("*").eq("user_id", user.id),
          ]);
          if (tasksRes.error) {
            scheduleError = tasksRes.error.message;
          } else if (itemsRes.error) {
            scheduleError = itemsRes.error.message;
          } else {
            const windows = await loadProtectedTimes(supabase);
            const filled = await saveNextRepeats(
              supabase,
              (itemsRes.data ?? []).map((row) => mapItemRow(row as Parameters<typeof mapItemRow>[0])),
              (tasksRes.data ?? []).map((row) =>
                mapPlannedTaskRow(row as Parameters<typeof mapPlannedTaskRow>[0]),
              ),
              todayISO,
              new Date(),
              settings.dayStartMinutes,
              {
                wakeMin: settings.wakeMinutes,
                windDownMin: settings.windDownMinutes,
                protectedWindows: windows,
              },
            );
            scheduleError = filled.error;
          }
        }
      }

      await load();
      if (scheduleError) setError(scheduleError);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save check-in.");
    } finally {
      setSaving(false);
    }
  }

  const dateLine = useMemo(
    () =>
      new Date(`${todayISO}T12:00:00`).toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    [todayISO],
  );

  if (loading) {
    return (
      <div className="flex flex-1 flex-col pb-28">
        <p className="text-[13px] text-ink-muted">Loading…</p>
      </div>
    );
  }

  if (error && !existingCheckIn && todayTasks.length === 0 && error === "Sign in to use check-in.") {
    return (
      <div className="flex flex-1 flex-col pb-28">
        <p className="text-[13px] text-ink-muted">{error}</p>
      </div>
    );
  }

  if (existingCheckIn) {
    return (
      <div className="flex flex-1 flex-col pb-28">
        <h1 className="font-serif text-[26px] font-normal tracking-tight text-ink">Today&apos;s wrap-up</h1>
        <p className="mt-1 text-[13px] text-ink-muted">{dateLine}</p>

        <div className="mt-8 space-y-6">
          <section>
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">Energy</h2>
            <p className="mt-1 text-[15px] text-ink">{existingCheckIn.energy_level}</p>
          </section>

          {existingCheckIn.notes?.trim() && (
            <section>
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">Notes</h2>
              <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-ink">
                {existingCheckIn.notes}
              </p>
            </section>
          )}

          {summaryUpdates.length > 0 && (
            <section>
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">Tasks</h2>
              <ul className="mt-3 flex flex-col gap-3">
                {summaryUpdates.map((u, i) => (
                  <li
                    key={`${u.outcome}-${i}`}
                    className="flex flex-col gap-1 rounded-[14px] border border-border bg-surface-raised px-4 py-3 shadow-soft"
                  >
                    <span className="text-[15px] font-medium text-ink">{taskSnapshotTitle(u)}</span>
                    <span className="text-[13px] text-ink-muted">{outcomeSummaryLabel(u.outcome)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <TomorrowPreview tasks={tomorrowTasks} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col pb-28">
      <h1 className="font-serif text-[26px] font-normal tracking-tight text-ink">How did today go?</h1>
      <p className="mt-1 text-[13px] text-ink-muted">{dateLine}</p>

      <div className="mt-8">
        <p className="mb-2 text-[13px] font-medium text-ink-muted">Energy</p>
        <div className="flex gap-2">
          {(["Low", "Medium", "High"] as const).map((e) => {
            const selected = energy === e;
            return (
              <button
                key={e}
                type="button"
                onClick={() => setEnergy(e)}
                className={`flex-1 rounded-full border px-3 py-2.5 text-[13px] font-medium transition-colors ${
                  selected
                    ? "border-transparent bg-[#caa510] text-white"
                    : "border-[#E5DAD0] bg-transparent text-ink-muted hover:text-ink"
                }`}
              >
                {e}
              </button>
            );
          })}
        </div>
      </div>

      {todayTasks.length > 0 && (
        <div className="mt-8">
          <p className="mb-3 text-[13px] font-medium text-ink-muted">Today&apos;s tasks</p>
          <ul className="flex flex-col gap-4">
            {todayTasks.map((task) => (
              <li
                key={task.id}
                className="rounded-[14px] border border-border bg-surface-raised p-4 shadow-soft"
              >
                <p className="text-[15px] font-semibold text-ink">{task.title_snapshot}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setOutcome(task.id, "done")}
                    className={`rounded-full px-3 py-2 text-[12px] font-semibold sm:text-[13px] ${
                      outcomes[task.id] === "done"
                        ? "bg-[#0f394c] text-white"
                        : "border border-[#E5DAD0] bg-transparent text-ink-muted hover:text-ink"
                    }`}
                  >
                    Done
                  </button>
                  <button
                    type="button"
                    onClick={() => setOutcome(task.id, "skipped")}
                    className={`rounded-full px-3 py-2 text-[12px] font-semibold sm:text-[13px] ${
                      outcomes[task.id] === "skipped"
                        ? "border-2 border-[#caa510] bg-transparent text-ink"
                        : "border border-[#E5DAD0] bg-transparent text-ink-muted hover:text-ink"
                    }`}
                  >
                    Skipped
                  </button>
                  <button
                    type="button"
                    onClick={() => setOutcome(task.id, "move_tomorrow")}
                    className={`rounded-full px-3 py-2 text-[12px] font-semibold sm:text-[13px] ${
                      outcomes[task.id] === "move_tomorrow"
                        ? "border-2 border-[#caa510] bg-transparent text-ink"
                        : "border border-[#E5DAD0] bg-transparent text-ink-muted hover:text-ink"
                    }`}
                  >
                    Move to tomorrow
                  </button>
                  <button
                    type="button"
                    onClick={() => setOutcome(task.id, "move_later")}
                    className={`rounded-full px-3 py-2 text-[12px] font-semibold sm:text-[13px] ${
                      outcomes[task.id] === "move_later"
                        ? "border-2 border-[#caa510] bg-transparent text-ink"
                        : "border border-[#E5DAD0] bg-transparent text-ink-muted hover:text-ink"
                    }`}
                  >
                    Move later
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <label className="mt-8 block">
        <span className="mb-2 block text-[13px] font-medium text-ink-muted">Notes (optional)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything to note about today?"
          rows={4}
          className="w-full rounded-[14px] border border-border bg-surface-raised px-4 py-3 text-[15px] text-ink shadow-sm outline-none placeholder:text-ink-faint focus:border-accent/40 focus:ring-2 focus:ring-accent/15"
        />
      </label>

      <TomorrowPreview tasks={tomorrowTasks} />

      {error && <p className="mt-4 text-[13px] text-red-800/90">{error}</p>}

      <button
        type="button"
        disabled={saving || !energy}
        onClick={() => void handleSave()}
        className="mt-8 w-full rounded-[12px] bg-[#caa510] px-4 py-3.5 text-[15px] font-semibold text-white shadow-soft transition-opacity hover:opacity-[0.96] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save check-in"}
      </button>

      {todayTasks.length === 0 && (
        <p className="mt-4 text-[13px] text-ink-muted">
          No tasks scheduled for today. You can still save energy and notes.
        </p>
      )}
    </div>
  );
}
