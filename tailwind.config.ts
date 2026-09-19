import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  darkMode: ["class"],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#06142a",
          800: "#112846",
          700: "#1a3561",
          600: "#26467a",
          DEFAULT: "#0b1f3a",
        },
        brand: {
          DEFAULT: "#f26b22",
          600: "#e05a12",
          700: "#b9470a",
          soft: "#fdebdd",
        },
        teal: {
          DEFAULT: "#14a38b",
          700: "#0d7a68",
          soft: "#ddf2ee",
        },
        mist: "#f3f5f9",
        line: "#e3e8f0",
        muted: "#5b6b82",
        "blue-soft": "#dfe7f2",
        danger: {
          DEFAULT: "#b42318",
          soft: "#fbe3e1",
        },
        status: {
          good: "#0ca30c",
          goodText: "#006300",
          warning: "#fab219",
          serious: "#ec835a",
          critical: "#d03b3b",
          criticalText: "#b42318",
        },
        slot: {
          1: "#f26b22",
          2: "#14a38b",
          3: "#2a78d6",
          4: "#e87ba4",
          5: "#eda100",
          6: "#008300",
          7: "#4a3aa7",
          8: "#e34948",
        },
      },
      fontFamily: {
        display: ["var(--font-poppins)", "Poppins", "sans-serif"],
        sans: ["var(--font-lato)", "Lato", "sans-serif"],
      },
      borderRadius: {
        "2xl": "1rem",
        xl: "0.75rem",
      },
      boxShadow: {
        soft: "0 2px 10px -2px rgba(11,31,58,0.07), 0 1px 2px rgba(11,31,58,0.04)",
      },
    },
  },
  plugins: [],
};
export default config;
