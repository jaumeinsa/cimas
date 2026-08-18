import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta Rutakon (heredada del proyecto Senda): verde bosque + naranja.
        pine: { DEFAULT: "#1f5132", soft: "#2f6f4f", tint: "#ecf3ee" },
        accent: { DEFAULT: "#e8590c", dark: "#d9480f", soft: "#f08c00", tint: "#fdf0e5" },
        cream: "#faf8f3",
        paper: "#ffffff",
        ink: { DEFAULT: "#1f2a24", muted: "#6b7770" },
        line: "#e6e1d6",
      },
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
      boxShadow: {
        card: "0 10px 30px rgba(31, 42, 36, 0.18)",
      },
    },
  },
  plugins: [],
};

export default config;
