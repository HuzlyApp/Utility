import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fcf8f2",
          100: "#f7efdf",
          200: "#eeddbc",
          300: "#e4ca99",
          400: "#d7ae6e",
          500: "#c9934e",
          600: "#bc8b41",
          700: "#9d6f2f",
          800: "#7d5826",
          900: "#5f421c",
        },
        navy: {
          50: "#e8edf6",
          100: "#d0dced",
          200: "#a1b8db",
          300: "#7295c9",
          400: "#4371b7",
          500: "#144ea5",
          600: "#012352",
          700: "#011f49",
          800: "#011b3f",
          900: "#011736",
        },
      },
    },
  },
  plugins: [],
};

export default config;
