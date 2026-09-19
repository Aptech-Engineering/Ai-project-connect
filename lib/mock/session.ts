import type { MeResponse, Role } from "../types";

// Local mock session. Spec 3.3: sign-in posts to /api/staff/auth/login and the same cookie
// covers the Engineering Panel. Here we keep it in localStorage so the dashboard is directly
// browsable — auth wiring is out of scope for this build.
const KEY = "apc_analytics_session";

export function getSession(): MeResponse {
  if (typeof window === "undefined") return demoAdmin();
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return demoAdmin();
  try {
    return JSON.parse(raw) as MeResponse;
  } catch {
    return demoAdmin();
  }
}

export function setRole(role: Role) {
  const session = role === "admin" ? demoAdmin() : demoStaff();
  window.localStorage.setItem(KEY, JSON.stringify(session));
}

function demoAdmin(): MeResponse {
  return {
    user: { id: 1, name: "Aptech Dev Team", role: "admin" },
    canViewAnalytics: true,
    sections: [
      "overview", "traffic", "engagement", "funnels", "revenue", "projects",
      "pipeline", "clients", "courses", "team", "operations", "realtime",
    ],
    timezone: "Africa/Lagos",
    currency: "NGN",
    trackingSince: "2026-06-20",
  };
}

function demoStaff(): MeResponse {
  return {
    user: { id: 7, name: "Amina Bello", role: "staff" },
    canViewAnalytics: true,
    sections: [
      "overview", "traffic", "engagement", "funnels", "projects",
      "pipeline", "clients", "courses", "operations", "realtime",
    ],
    timezone: "Africa/Lagos",
    currency: "NGN",
    trackingSince: "2026-06-20",
  };
}
