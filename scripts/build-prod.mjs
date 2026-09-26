/**
 * The production build.
 *
 * `next build` on its own picks up .env.local, which points the site at a developer's
 * own API on 127.0.0.1 — a site built that way loads but can reach no server. Setting
 * the variable here wins over .env.local, and an empty value means "same domain", so
 * the export calls /api on whatever host it is served from.
 */
import { spawnSync } from "node:child_process";

const result = spawnSync("npx", ["next", "build"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NEXT_PUBLIC_API_BASE: "" },
});
process.exit(result.status ?? 1);
