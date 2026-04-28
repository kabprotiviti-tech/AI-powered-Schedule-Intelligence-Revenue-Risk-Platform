import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas:          "#070c18",
        surface:         "#0d1424",
        card:            "#111d2e",
        border:          "#1a2d45",
        "border-subtle": "#162038",
        primary:         "#3b82f6",
        "primary-dim":   "#1d4ed8",
        success:         "#10b981",
        warning:         "#f59e0b",
        danger:          "#ef4444",
        "text-primary":  "#e2e8f0",
        "text-secondary":"#64748b",
        "text-muted":    "#334155",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      keyframes: {
        "fade-up": {
          "0%":   { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-in-right": {
          "0%":   { opacity: "0", transform: "translateX(32px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "slide-in-left": {
          "0%":   { opacity: "0", transform: "translateX(-32px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "scale-in": {
          "0%":   { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "slide-in-panel": {
          "0%":   { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
        shimmer: {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition:  "200% 0" },
        },
        "pulse-red": {
          "0%,100%": { boxShadow: "0 0 0 0 rgba(239,68,68,0)" },
          "50%":     { boxShadow: "0 0 0 4px rgba(239,68,68,0.25)" },
        },
        "pulse-amber": {
          "0%,100%": { boxShadow: "0 0 0 0 rgba(245,158,11,0)" },
          "50%":     { boxShadow: "0 0 0 4px rgba(245,158,11,0.2)" },
        },
        "dot-pulse": {
          "0%,100%": { transform: "scale(1)",   opacity: "1" },
          "50%":     { transform: "scale(1.5)", opacity: "0.6" },
        },
        dash: {
          to: { strokeDashoffset: "0" },
        },
        "count-up": {
          "0%":   { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up":        "fade-up 0.4s ease both",
        "fade-in":        "fade-in 0.3s ease both",
        "slide-in-right": "slide-in-right 0.35s cubic-bezier(0.16,1,0.3,1) both",
        "slide-in-left":  "slide-in-left 0.35s cubic-bezier(0.16,1,0.3,1) both",
        "scale-in":       "scale-in 0.25s cubic-bezier(0.16,1,0.3,1) both",
        "slide-in-panel": "slide-in-panel 0.3s cubic-bezier(0.16,1,0.3,1) both",
        shimmer:          "shimmer 2s linear infinite",
        "pulse-red":      "pulse-red 2s ease-in-out infinite",
        "pulse-amber":    "pulse-amber 2.5s ease-in-out infinite",
        "dot-pulse":      "dot-pulse 2s ease-in-out infinite",
        dash:             "dash 1s ease forwards",
        "count-up":       "count-up 0.5s ease both",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.16,1,0.3,1)",
      },
      boxShadow: {
        "glow-blue":  "0 0 24px rgba(59,130,246,0.18)",
        "glow-red":   "0 0 24px rgba(239,68,68,0.18)",
        "glow-amber": "0 0 24px rgba(245,158,11,0.15)",
        "glow-green": "0 0 24px rgba(16,185,129,0.15)",
        "card-hover": "0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(59,130,246,0.15)",
        "panel":      "0 24px 80px rgba(0,0,0,0.6), -1px 0 0 rgba(255,255,255,0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
