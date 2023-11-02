/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/app/**/*.{js,jsx,ts,tsx,css}", "./src/app/index.html"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#dbe1f2",
          100: "#b7c3e5",
          200: "#92a5d7",
          300: "#8096d1",
          400: "#6e87ca",
          500: "#4a69bd",
          600: "#3b5497",
          700: "#344a84",
          800: "#2c3f71",
          900: "#1e2a4c",
        },
        background: "#282828",
        surface: "#3C3C3C",
        onsurface: "#BFC6CE",
        surfaceLight: "#505050",
        border: "#474747",
        btn: "#1534BA",
        onBtn: "#FFFFFF",
        tableEven: "#28292A",
        tableOdd: "#1F1F1F",
      },
    },
  },
  plugins: [],
};
