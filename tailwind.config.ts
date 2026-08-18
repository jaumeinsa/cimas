import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Tokens de la marca Rutakon (los del planificador en rutakon.com):
        // tinta #26221a, hueso #ede6d6, kraft #e2d8c2, naranja #d4551a.
        // Se mantienen los nombres de clase originales para re-pintar todo.
        pine: { DEFAULT: "#26221a", soft: "#3a3427", tint: "#f2ecdc" },
        accent: { DEFAULT: "#d4551a", dark: "#a33417", soft: "#e07a45", tint: "#f6e3d3" },
        cream: "#ede6d6",
        paper: "#faf7ee",
        ink: { DEFAULT: "#26221a", muted: "#6b6250" },
        line: "#e2d8c2",
      },
      fontFamily: {
        display: ["'Archivo Black'", "Barlow", "sans-serif"],
        cap: ["'Barlow Condensed'", "Barlow", "sans-serif"],
        sans: ["Barlow", "system-ui", "-apple-system", "sans-serif"],
      },
      boxShadow: {
        card: "0 10px 30px rgba(38, 34, 26, 0.16)",
      },
    },
  },
  plugins: [],
};

export default config;
