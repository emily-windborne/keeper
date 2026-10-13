# Keeper

Mobile-first app shell built with Next.js, TypeScript, and Tailwind CSS.

## Setup

Add `ANTHROPIC_API_KEY` to `.env.local` for Planner AI (`POST /api/refine` and brain dump). Without it, those requests return a configuration error. Refine uses `claude-sonnet-5-5`. Brain dump uses `claude-haiku-5-5`. Plan my week and Ask Keeper show a preview before anything is saved.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The default route is **Planner**; use the bottom nav for Inventory, Check-In, and Settings.

### Database

Run the SQL files in `supabase/migrations` in filename order in the Supabase SQL editor. If the first schema is already applied, run each newer file once. `002_apply_plan_my_week.sql` lets Plan my week save the whole week in one step. `003_times_per_period.sql` stores how many times an item happens in each day or week. `004_frequency.sql` stores "every N days/weeks/months" and when a repeat ends. Notes are not part of that rule. `005_fixed_time_and_day_start.sql` stores a fixed clock time and the time of day your planner starts (default 6:00 AM). `006_anchor_type.sql` lets an item be a quiet routine, such as bedtime, that shows on the calendar without taking a time slot. `008_notifications.sql` stores phone notification times and the phone's push signup. Each person can only see their own signup.

### Phone notifications

Settings has a Notifications section. On iPhone, add Keeper to the home screen, open it from that icon, then tap Turn on notifications. A normal Safari tab cannot ask for permission.

Keeper can send two notes, and each one can be switched off:

- A morning note, starting at 7:30 AM in your time zone. Example: "Today: 4 things. Start with Yoga." Tapping it opens today.
- A nightly note, starting at 11:00 PM. It says "Time for your nightly check-in." Tapping it opens the check-in.

There is no alert at a task's exact time, and no alert the day before. Tomorrow's list is only inside the check-in, under Preview tomorrow.

Add these in Vercel (Project Settings, Environment Variables), then redeploy:

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`, from `npx web-push generate-vapid-keys`
- `VAPID_SUBJECT`, your email as `mailto:you@example.com`
- `CRON_SECRET`, a long password you make up
- `SUPABASE_SERVICE_ROLE_KEY`, the service_role key from Supabase. Do not put this key in a name that starts with `NEXT_PUBLIC_`.

`vercel.json` asks Vercel to run the sender every 15 minutes. The free Hobby plan only allows a job once a day, and that deploy is rejected. The Pro plan is what makes a 7:30 AM note and an 11:00 PM note both arrive. If the deploy says Hobby accounts are limited to daily cron jobs, upgrade the project to Pro and redeploy.

### Hot reload / Fast Refresh

`next.config.ts` sets `watchOptions.pollIntervalMs` so Turbopack polls for file changes. That fixes inconsistent HMR when native file watching fails (common if the repo lives under **Desktop** with **iCloud**, or on some networked drives).

- **`npm run dev`** — Turbopack (default).
- **`npm run dev:webpack`** — Webpack dev server if you still see stale UI; Fast Refresh works there too.

If updates still stick, try clearing `.next` once (`rm -rf .next`) and restarting dev.

## Scripts

- `npm run dev` — development server (Turbopack)
- `npm run build` — production build
- `npm run start` — run production server
- `npm run lint` — ESLint
