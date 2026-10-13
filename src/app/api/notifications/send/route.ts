import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { getSupabasePublicEnv } from "@/lib/supabase-public-env";
import {
  isMorningSendTime,
  morningDigestBody,
  orderedTitles,
  zonedClock,
} from "@/lib/notifications/digest";

export const dynamic = "force-dynamic";

type SettingsRow = {
  user_id: string;
  timezone: string | null;
  morning_digest_enabled: boolean;
  morning_digest_minutes: number;
  morning_digest_sent_on: string | null;
};

type SubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type TaskRow = {
  user_id: string;
  title_snapshot: string;
  scheduled_time_start: string | null;
  scheduled_date: string;
  status: string;
};

function serviceClient() {
  const env = getSupabasePublicEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!env || !key) return null;
  return createClient(env.url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) {
    return Response.json({ error: "Missing VAPID keys" }, { status: 500 });
  }

  const supabase = serviceClient();
  if (!supabase) {
    return Response.json({ error: "Missing Supabase service role key" }, { status: 500 });
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);

  const [settingsRes, subsRes] = await Promise.all([
    supabase
      .from("user_settings")
      .select(
        "user_id, timezone, morning_digest_enabled, morning_digest_minutes, morning_digest_sent_on",
      ),
    supabase.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth"),
  ]);

  if (settingsRes.error) return Response.json({ error: settingsRes.error.message }, { status: 500 });
  if (subsRes.error) return Response.json({ error: subsRes.error.message }, { status: 500 });

  const settings = (settingsRes.data ?? []) as SettingsRow[];
  const subscriptions = (subsRes.data ?? []) as SubscriptionRow[];
  const subsByUser = new Map<string, SubscriptionRow[]>();
  for (const sub of subscriptions) {
    const list = subsByUser.get(sub.user_id) ?? [];
    list.push(sub);
    subsByUser.set(sub.user_id, list);
  }

  const now = new Date();
  const clocks = new Map<string, { date: string; minutes: number }>();
  for (const row of settings) {
    if (!row.timezone) continue;
    const clock = zonedClock(now, row.timezone);
    if (clock) clocks.set(row.user_id, clock);
  }

  const dates = [...new Set([...clocks.values()].map((clock) => clock.date))];
  const tasksByUserDate = new Map<string, TaskRow[]>();
  if (dates.length > 0) {
    const tasksRes = await supabase
      .from("planned_tasks")
      .select("user_id, title_snapshot, scheduled_time_start, scheduled_date, status")
      .in("scheduled_date", dates)
      .in("status", ["planned", "moved"]);
    if (tasksRes.error) return Response.json({ error: tasksRes.error.message }, { status: 500 });
    for (const task of (tasksRes.data ?? []) as TaskRow[]) {
      const key = `${task.user_id}:${task.scheduled_date}`;
      const list = tasksByUserDate.get(key) ?? [];
      list.push(task);
      tasksByUserDate.set(key, list);
    }
  }

  let sent = 0;
  for (const row of settings) {
    const clock = clocks.get(row.user_id);
    const subs = subsByUser.get(row.user_id) ?? [];
    if (!clock || subs.length === 0) continue;

    if (
      row.morning_digest_enabled &&
      row.morning_digest_sent_on !== clock.date &&
      isMorningSendTime(clock.minutes, row.morning_digest_minutes)
    ) {
      const claimed = await claim(supabase, row.user_id, clock.date);
      if (claimed) {
        const titles = orderedTitles(
          (tasksByUserDate.get(`${row.user_id}:${clock.date}`) ?? []).map((task) => ({
            title: task.title_snapshot,
            start: task.scheduled_time_start,
          })),
        );
        const ok = await deliver(supabase, subs, {
          title: "Today",
          body: morningDigestBody(titles),
          url: "/?today=1",
        });
        if (ok) sent += 1;
        else await claim(supabase, row.user_id, null);
      }
    }
  }

  return Response.json({ ok: true, sent });
}

async function claim(
  supabase: ReturnType<typeof serviceClient>,
  userId: string,
  date: string | null,
): Promise<boolean> {
  if (!supabase) return false;
  const column = "morning_digest_sent_on";
  const update = supabase.from("user_settings").update({ [column]: date }).eq("user_id", userId);
  const filtered = date ? update.or(`${column}.is.null,${column}.neq.${date}`) : update;
  const { data, error } = await filtered.select("user_id");
  return !error && (data?.length ?? 0) > 0;
}

async function deliver(
  supabase: NonNullable<ReturnType<typeof serviceClient>>,
  subs: SubscriptionRow[],
  payload: { title: string; body: string; url: string },
): Promise<boolean> {
  let delivered = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
      );
      delivered += 1;
    } catch (error) {
      const status =
        typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
      if (status === 404 || status === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      }
    }
  }
  return delivered > 0;
}
