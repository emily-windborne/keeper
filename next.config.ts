import type { NextConfig } from "next";

/**
 * Dev / Fast Refresh:
 * - `watchOptions.pollIntervalMs` enables Turbopack’s polling watcher when set.
 *   Native FS events are sometimes unreliable (e.g. projects under Desktop with iCloud,
 *   some VPNs, Docker bind mounts). Polling keeps HMR/Fast Refresh consistent.
 * - To use native watching only, remove `pollIntervalMs` or set via env in a local wrapper.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  watchOptions: {
    // 500–1000ms is typical; lower = snappier but slightly more CPU during dev.
    pollIntervalMs: 750,
  },
};

export default nextConfig;
