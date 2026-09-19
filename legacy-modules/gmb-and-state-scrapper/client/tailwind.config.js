/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      boxShadow: {
        panel: "0 18px 50px rgba(15, 23, 42, 0.24)",
      },
      colors: {
        ink: "#14213d",
        ember: "#f97316",
        mist: "#eef2ff",
        glow: "#fef3c7",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["'Source Sans 3'", "sans-serif"],
      },
    },
  },
};
