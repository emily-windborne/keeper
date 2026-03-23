# Keeper

Mobile-first app shell built with Next.js, TypeScript, and Tailwind CSS.

## Setup

Add `ANTHROPIC_API_KEY` to `.env.local` for Planner AI refine (`POST /api/refine`). Without it, refine requests return a configuration error.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The default route is **Planner**; use the bottom nav for Inventory, Check-In, and Settings.

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
