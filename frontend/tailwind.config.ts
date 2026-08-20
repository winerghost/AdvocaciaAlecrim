import type { Config } from "tailwindcss";

// Tokens extraídos da landing original (Dr. Alecrim.dc.html) para manter
// a mesma paleta durante a migração (ver PLANO-MIGRACAO.md, Fase 1).
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#0f172a",
        gold: "#d4af37",
        "gold-dark": "#b4941f",
        "slate-bg": "#f8fafc",
        "slate-muted": "#64748b",
      },
    },
  },
  plugins: [],
};

export default config;
