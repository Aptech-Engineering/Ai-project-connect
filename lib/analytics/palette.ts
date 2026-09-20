// Chart palette — validated, section 11.2. Never cycle slot order; it is what keeps the
// palette colour-blind safe. "Other" beyond 8 series is slot "other".
export const SLOT_COLORS = {
  1: "#f26b22", // brand orange — current period
  2: "#14a38b", // teal
  3: "#2a78d6", // blue
  4: "#e87ba4", // magenta
  5: "#eda100", // yellow
  6: "#008300", // green
  7: "#4a3aa7", // violet
  8: "#e34948", // red
  other: "#8a96a8",
} as const;

export const SEQUENTIAL_BLUE = [
  "#f3f5f9", // zero = mist
  "#cde2fb",
  "#9ec5f4",
  "#6da7ec",
  "#3987e5",
  "#2a78d6",
  "#1c5cab",
  "#104281",
  "#0d366b",
];

export const ORDINAL_BLUE = ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281", "#0d366b"];

export const DIVERGING = { early: "#2a78d6", late: "#e34948", middle: "#e3e8f0" };

export const STATUS_COLORS = {
  good: { bg: "#0ca30c", text: "#006300" },
  warning: { bg: "#fab219", text: "#7a5200" },
  serious: { bg: "#ec835a", text: "#8a3413" },
  critical: { bg: "#d03b3b", text: "#b42318" },
};

// Fixed series assignments — section 11.2 table. Same hue on every screen so people learn them.
export const FIXED_SLOTS: Record<string, number | "other"> = {
  paystack: 1,
  "bank transfer": 2,
  "at centre": 3,
  online: 1,
  "walk-in": 3,
  desktop: 3,
  mobile: 1,
  tablet: 2,
};

export function comparisonColor(hex: string) {
  return { stroke: hex, strokeDasharray: "5 4", opacity: 0.6 };
}
