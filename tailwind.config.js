/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ["ui-monospace", "Cascadia Code", "Fira Code", "Consolas", "monospace"],
      },
      colors: {
        bg: "#0d1117",
        surface: "#161b22",
        border: "#30363d",
        muted: "#8b949e",
        accent: "#58a6ff",
        green: "#3fb950",
        yellow: "#d29922",
        purple: "#bc8cff",
      },
    },
  },
  plugins: [],
};
