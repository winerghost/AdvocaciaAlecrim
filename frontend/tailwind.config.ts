import type { Config } from "tailwindcss";

// Os tokens "ba-*" são o design system do site (landing e blog). Eles
// apontam para variáveis CSS definidas no escopo `.theme-ba` em
// app/globals.css - as cores usam canais RGB ("0 126 243") para aceitar
// alpha do Tailwind (ex.: `bg-ba-steel/[0.14]`, `text-ba-text/70`). O valor
// depois da vírgula em `var(--x, ...)` é só um fallback para o caso de a
// classe ser usada fora de `.theme-ba`.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Cor da marca (logo e o nome "Alecrim" no cabeçalho) - só para isso.
        gold: "#d4af37",
        "ba-bg": "rgb(var(--ba-bg, 0 4 23) / <alpha-value>)",
        "ba-accent": "rgb(var(--ba-accent, 0 126 243) / <alpha-value>)",
        "ba-steel": "rgb(var(--ba-steel, 41 67 99) / <alpha-value>)",
        "ba-text": "rgb(var(--ba-text, 236 240 243) / <alpha-value>)",
        // Faixas claras do tema (área de leitura do artigo, caixa do autor).
        "ba-accent-ink": "rgb(var(--ba-accent-ink, 0 98 196) / <alpha-value>)",
        "ba-slate": "rgb(var(--ba-slate, 51 65 92) / <alpha-value>)",
        "ba-mist": "rgb(var(--ba-mist, 242 246 250) / <alpha-value>)",
        // Painel admin e login (tema claro) - variáveis em :root, globals.css.
        "adm-accent": "rgb(var(--adm-accent, 0 126 243) / <alpha-value>)",
        "adm-accent-strong": "rgb(var(--adm-accent-strong, 0 98 196) / <alpha-value>)",
        "adm-focus": "rgb(var(--adm-focus, 128 190 249) / <alpha-value>)",
        "adm-ink": "rgb(var(--adm-ink, 13 21 38) / <alpha-value>)",
        "adm-ink-soft": "rgb(var(--adm-ink-soft, 30 41 59) / <alpha-value>)",
        "adm-on-dark": "rgb(var(--adm-on-dark, 203 213 225) / <alpha-value>)",
        "adm-body": "rgb(var(--adm-body, 51 65 92) / <alpha-value>)",
        "adm-muted": "rgb(var(--adm-muted, 100 116 139) / <alpha-value>)",
        "adm-faint": "rgb(var(--adm-faint, 148 163 184) / <alpha-value>)",
        "adm-border": "rgb(var(--adm-border, 219 227 236) / <alpha-value>)",
        "adm-border-strong": "rgb(var(--adm-border-strong, 197 207 219) / <alpha-value>)",
        "adm-canvas": "rgb(var(--adm-canvas, 242 246 250) / <alpha-value>)",
        "adm-surface": "rgb(var(--adm-surface, 248 250 252) / <alpha-value>)",
        "adm-surface-2": "rgb(var(--adm-surface-2, 232 238 245) / <alpha-value>)",
        "adm-danger": "rgb(var(--adm-danger, 220 53 69) / <alpha-value>)",
        "adm-danger-strong": "rgb(var(--adm-danger-strong, 187 45 59) / <alpha-value>)",
        "adm-danger-ink": "rgb(var(--adm-danger-ink, 132 32 41) / <alpha-value>)",
        "adm-danger-soft": "rgb(var(--adm-danger-soft, 248 215 218) / <alpha-value>)",
        "adm-danger-line": "rgb(var(--adm-danger-line, 245 194 199) / <alpha-value>)",
        "adm-success": "rgb(var(--adm-success, 40 167 69) / <alpha-value>)",
        "adm-success-strong": "rgb(var(--adm-success-strong, 33 136 56) / <alpha-value>)",
        "adm-success-ink": "rgb(var(--adm-success-ink, 21 87 36) / <alpha-value>)",
        "adm-success-soft": "rgb(var(--adm-success-soft, 212 237 218) / <alpha-value>)",
        "adm-success-line": "rgb(var(--adm-success-line, 195 230 203) / <alpha-value>)",
        "adm-warning": "rgb(var(--adm-warning, 255 193 7) / <alpha-value>)",
        "adm-warning-strong": "rgb(var(--adm-warning-strong, 180 83 9) / <alpha-value>)",
        "adm-warning-ink": "rgb(var(--adm-warning-ink, 102 77 3) / <alpha-value>)",
        "adm-warning-soft": "rgb(var(--adm-warning-soft, 255 243 205) / <alpha-value>)",
        "adm-warning-line": "rgb(var(--adm-warning-line, 255 236 181) / <alpha-value>)",
        "adm-info-ink": "rgb(var(--adm-info-ink, 8 66 152) / <alpha-value>)",
        "adm-info-soft": "rgb(var(--adm-info-soft, 207 226 255) / <alpha-value>)",
        "adm-info-line": "rgb(var(--adm-info-line, 182 212 254) / <alpha-value>)",
      },
      fontFamily: {
        // --font-figtree é injetada por next/font em app/layout.tsx.
        figtree: ["var(--font-figtree)", "Helvetica", "Arial", "sans-serif"],
      },
      maxWidth: {
        "ba-container": "var(--ba-container, 1240px)",
        "ba-prose": "var(--ba-prose, 740px)",
        "ba-article": "var(--ba-article, 924px)",
      },
      borderRadius: {
        "ba-pill": "var(--ba-radius-pill, 999px)",
        "ba-card": "var(--ba-radius-card, 0px)",
      },
      boxShadow: {
        "ba-card": "var(--ba-shadow-card, 0 26px 60px -30px rgba(0, 0, 0, 0.9))",
        "ba-cta": "var(--ba-shadow-cta, 0 18px 44px -20px rgba(0, 126, 243, 0.9))",
        // "Bordas" de 1px desenhadas por dentro (não mexem no box model).
        "ba-ring": "inset 0 0 0 1px rgb(var(--ba-steel, 41 67 99) / 0.5)",
        "ba-ring-strong": "inset 0 0 0 1px rgb(var(--ba-steel, 41 67 99) / 0.6)",
        "ba-ring-accent": "inset 0 0 0 1px rgb(var(--ba-accent, 0 126 243) / 0.75)",
        "ba-ring-text": "inset 0 0 0 1px rgb(var(--ba-text, 236 240 243) / 0.4)",
      },
      letterSpacing: {
        "ba-display": "-0.035em",
        "ba-heading": "-0.034em",
        "ba-h3": "0.04em",
        "ba-nav": "0.12em",
        "ba-eyebrow": "0.2em",
        "ba-eyebrow-wide": "0.3em",
      },
      fontSize: {
        // 74px e 56px são a escala de desktop - o clamp reduz no mobile.
        "ba-h1": [
          "clamp(2.5rem, 1.2rem + 5.6vw, 4.625rem)",
          { lineHeight: "1.02", letterSpacing: "-0.035em", fontWeight: "800" },
        ],
        "ba-h2": [
          "clamp(2rem, 1.15rem + 3.6vw, 3.5rem)",
          { lineHeight: "1.04", letterSpacing: "-0.034em", fontWeight: "800" },
        ],
        // Título de artigo: menor que o H1 porque títulos de artigo são longos.
        "ba-title": [
          "clamp(1.875rem, 4.6vw, 3.625rem)",
          { lineHeight: "1.05", letterSpacing: "-0.035em", fontWeight: "800" },
        ],
        "ba-cta": [
          "clamp(1.75rem, 3.4vw, 3rem)",
          { lineHeight: "1.06", letterSpacing: "-0.034em", fontWeight: "800" },
        ],
        "ba-h3": ["1.5rem", { lineHeight: "1.2", letterSpacing: "0.04em", fontWeight: "800" }],
        "ba-item": ["1.3125rem", { lineHeight: "1.25", fontWeight: "700" }],
        "ba-lead": ["clamp(1.0625rem, 1rem + 0.35vw, 1.1875rem)", { lineHeight: "1.62" }],
        "ba-body": ["1.0625rem", { lineHeight: "1.6" }],
        "ba-body-sm": ["0.9375rem", { lineHeight: "1.65" }],
        "ba-nav": ["0.8125rem", { lineHeight: "1", letterSpacing: "0.12em", fontWeight: "600" }],
        "ba-button": ["0.875rem", { lineHeight: "1", letterSpacing: "0.12em", fontWeight: "700" }],
        "ba-eyebrow": ["0.75rem", { lineHeight: "1.2", letterSpacing: "0.2em", fontWeight: "700" }],
      },
    },
  },
  plugins: [],
};

export default config;
