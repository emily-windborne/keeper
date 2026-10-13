# Keeper

Mobile-first app shell built with Next.js, TypeScript, and Tailwind CSS.

## Setup

Add `ANTHROPIC_API_KEY` to `.env.local` for Planner AI refine (`POST /api/refine`). Without it, refine requests return a configuration error.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The default route is **Planner**; use the bottom nav for Inventory, Check-In, and Settings.

### Database

Run the SQL files in `supabase/migrations` in filename order in the Supabase SQL editor. If the first schema is already applied, run each newer file once. `002_apply_plan_my_week.sql` lets Plan my week save the whole week in one step. `003_times_per_period.sql` stores how many times an item happens in each day or week. `004_frequency.sql` stores "every N days/weeks/months" and when a repeat ends. Notes are not part of that rule.

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
