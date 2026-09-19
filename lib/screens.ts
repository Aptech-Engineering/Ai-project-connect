import type { ScreenKey } from "./types";

export const SCREENS: { key: ScreenKey; label: string; adminOnly?: boolean; live?: boolean }[] = [
  { key: "overview", label: "Overview" },
  { key: "traffic", label: "Traffic" },
  { key: "engagement", label: "Engagement" },
  { key: "funnels", label: "Funnels" },
  { key: "revenue", label: "Revenue", adminOnly: true },
  { key: "projects", label: "Projects" },
  { key: "pipeline", label: "Sales pipeline" },
  { key: "clients", label: "Clients" },
  { key: "courses", label: "Courses" },
  { key: "team", label: "Team", adminOnly: true },
  { key: "operations", label: "Operations" },
  { key: "realtime", label: "Realtime", live: true },
];

export const SCREEN_TAGLINES: Record<ScreenKey, string> = {
  overview: "How is the business doing this period?",
  traffic: "How many people visit, from where, on what device?",
  engagement: "What do they click and use?",
  funnels: "Where do people drop out between visiting and paying?",
  revenue: "How much money came in, how much was refunded, and what is booked?",
  projects: "Are we delivering on time?",
  pipeline: "How do ideas turn into quotes and projects?",
  clients: "Who uses the portal, and how often?",
  courses: "Does \u201cLearn the stack\u201d turn into enrolments?",
  team: "How quickly does the team update clients and reply?",
  operations: "Are emails, SMS and payments working?",
  realtime: "What is happening right now?",
};
