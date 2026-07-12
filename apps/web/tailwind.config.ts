import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./features/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#191c1e",
        surface: "#f7f9fb",
        primary: "#001e40",
        secondary: "#006875",
        "on-surface": "#191c1e",
        "on-surface-variant": "#43474f",
        "on-primary": "#ffffff",
        "on-primary-container": "#a7c8ff",
        "outline-variant": "#c3c6d1",
        "surface-container": "#eceef0",
        "surface-container-low": "#f2f4f6",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["Georgia", "ui-serif", "serif"],
      },
      boxShadow: {
        panel: "0 12px 24px -10px rgba(0, 104, 117, 0.14)",
      },
    },
  },
  plugins: [],
};

export default config;
