import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "var(--color-bg)",
          raised: "var(--color-surface)",
          alt: "var(--color-surface-alt)",
          muted: "var(--color-surface-muted)",
        },
        ink: {
          DEFAULT: "var(--color-text-primary)",
          muted: "var(--color-text-muted)",
          faint: "var(--color-text-faint)",
        },
        border: {
          DEFAULT: "var(--color-border)",
        },
        accent: {
          DEFAULT: "var(--color-accent)",
          soft: "var(--color-accent-light)",
        },
        teal: {
          DEFAULT: "var(--color-teal)",
          light: "var(--color-teal-light)",
        },
      },
      boxShadow: {
        soft:
          "0 1px 2px rgba(15, 57, 76, 0.04), 0 4px 12px rgba(15, 57, 76, 0.06)",
        nav: "0 -2px 16px rgba(15, 57, 76, 0.06)",
      },
      maxWidth: {
        shell: "28rem",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
