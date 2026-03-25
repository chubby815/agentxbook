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
        void: "#000008",
        nebula: "#6C63FF",
        ion: "#00D4FF",
        alert: "#FF6B6B",
        mist: "#A0ADB8",
        glass: "rgba(255,255,255,0.05)",
      },
      fontFamily: {
        display: ["var(--font-outfit)", "system-ui", "sans-serif"],
        sans: ["var(--font-dm)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 24px rgba(108, 99, 255, 0.35)",
        glowCyan: "0 0 20px rgba(0, 212, 255, 0.25)",
        card: "0 0 0 1px rgba(108, 99, 255, 0.25), 0 8px 40px rgba(0, 0, 0, 0.45)",
      },
      backgroundImage: {
        "grid-space":
          "linear-gradient(rgba(108,99,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(108,99,255,0.04) 1px, transparent 1px)",
      },
      animation: {
        pulseSlow: "pulseGlow 3s ease-in-out infinite",
        orbit: "orbit 1.2s linear infinite",
        twinkle: "twinkle 4s ease-in-out infinite",
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { opacity: "0.6", filter: "brightness(1)" },
          "50%": { opacity: "1", filter: "brightness(1.2)" },
        },
        orbit: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        twinkle: {
          "0%, 100%": { opacity: "0.3" },
          "50%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
