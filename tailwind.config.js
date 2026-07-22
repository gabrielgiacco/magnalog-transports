/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    screens: {
      xs: "480px",
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },
    extend: {
      fontFamily: {
        head: ["Syne", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
        sans: ["DM Sans", "sans-serif"],
      },
      colors: {
        bg: "#080d18",
        surface: "#0f1623",
        surface2: "#162030",
        surface3: "#1c2840",
        border: "#1e2d42",
        border2: "#273d58",
        accent: "#f97316",
      },
    },
  },
  plugins: [],
};
