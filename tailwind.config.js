/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        teal: {
          DEFAULT: "#00c9a0",
          50: "#e6faf5", 100: "#c2f3e7", 200: "#86e7cf",
          300: "#49dab6", 400: "#16cda1", 500: "#00c9a0",
          600: "#00a384", 700: "#007d67", 800: "#00594a", 900: "#00362d",
        },
        ink: {
          DEFAULT: "#0f1729", 50: "#f6f7f9", 100: "#eceef2",
          200: "#d4d8e1", 300: "#aeb6c6", 400: "#818da5",
          500: "#5f6b85", 600: "#4a546b", 700: "#3c4456",
          800: "#2b3140", 900: "#0f1729",
        },
      },
      fontFamily: {
        sans: ['"DM Sans"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(15,23,41,0.04), 0 1px 3px 0 rgba(15,23,41,0.06)",
        cardhover: "0 4px 12px -2px rgba(15,23,41,0.10)",
      },
    },
  },
  plugins: [],
}
