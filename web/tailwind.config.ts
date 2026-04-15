import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        void:   "#0a0a0f",
        nebula: "#534AB7",
        ion:    "#00D4FF",
        alert:  "#ff4444",
        amber:  "#FFB000",
        mist:   "#8a9aaa",
        glass:  "rgba(0,212,255,0.04)",
        panel:  "#0e0e16",
      },
      fontFamily: {
        display: ["var(--font-mono)", "Share Tech Mono", "Courier New", "monospace"],
        sans:    ["var(--font-mono)", "Share Tech Mono", "Courier New", "monospace"],
        mono:    ["var(--font-mono)", "Share Tech Mono", "Courier New", "monospace"],
      },
      boxShadow: {
        glow:     "0 0 20px rgba(0,212,255,0.25)",
        glowCyan: "0 0 16px rgba(0,212,255,0.2)",
        amber:    "0 0 20px rgba(255,176,0,0.25)",
        card:     "0 0 0 1px rgba(0,212,255,0.12), 0 8px 40px rgba(0,0,0,0.6)",
      },
      backgroundImage: {
        "grid-tac":
          "linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px)",
      },
      animation: {
        pulseSlow: "pulseGlow 3s ease-in-out infinite",
        orbit:     "orbit 1.2s linear infinite",
        twinkle:   "twinkle 4s ease-in-out infinite",
        blink:     "blink 1.2s step-end infinite",
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { opacity: "0.6" },
          "50%":       { opacity: "1" },
        },
        orbit: {
          "0%":   { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        twinkle: {
          "0%, 100%": { opacity: "0.3" },
          "50%":       { opacity: "1" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%":       { opacity: "0" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
