/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0f0f13",
        surface: "#1a1a24",
        border: "#2a2a3a",
        muted: "#888",
      },
    },
  },
  plugins: [],
}
