import type { ReactNode } from "react";

// Desenho de cada avatar padrão. Quais ids existem é o Flask que diz
// (`avatar_presets` em /api/admin/me); id sem desenho aqui cai nas iniciais.
type Preset = { label: string; bg: string; glyph: ReactNode };

const STROKE = {
  fill: "none",
  stroke: "#fff",
  strokeWidth: 3,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const AVATAR_PRESET_ART: Record<string, Preset> = {
  balanca: {
    label: "Balança",
    bg: "#2f5d50",
    glyph: (
      <g {...STROKE}>
        <path d="M32 16v32M22 48h20M18 22h28" />
        <path d="M18 22l-6 12h12zM46 22l-6 12h12z" />
      </g>
    ),
  },
  livro: {
    label: "Livro",
    bg: "#7a4b2a",
    glyph: (
      <g {...STROKE}>
        <path d="M32 22c-5-4-11-4-16-3v24c5-1 11-1 16 3 5-4 11-4 16-3V19c-5-1-11-1-16 3z" />
        <path d="M32 22v24" />
      </g>
    ),
  },
  pilar: {
    label: "Pilar",
    bg: "#44506b",
    glyph: (
      <g {...STROKE}>
        <path d="M18 22h28l-14-7zM20 48h24M22 26v18M32 26v18M42 26v18" />
      </g>
    ),
  },
  folha: {
    label: "Folha",
    bg: "#4f7a3a",
    glyph: (
      <g {...STROKE}>
        <path d="M20 44c0-16 10-26 26-26 0 16-10 26-26 26z" />
        <path d="M20 44l14-14" />
      </g>
    ),
  },
  pena: {
    label: "Pena",
    bg: "#6b3f6b",
    glyph: (
      <g {...STROKE}>
        <path d="M44 18c-12 2-20 12-22 26l-4 4" />
        <path d="M44 18c0 12-8 22-22 26M30 30h8" />
      </g>
    ),
  },
  escudo: {
    label: "Escudo",
    bg: "#8a3b33",
    glyph: (
      <g {...STROKE}>
        <path d="M32 16l14 5v10c0 9-6 15-14 18-8-3-14-9-14-18V21z" />
        <path d="M26 32l4 4 8-8" />
      </g>
    ),
  },
  estrela: {
    label: "Estrela",
    bg: "#a0742a",
    glyph: (
      <g {...STROKE}>
        <path d="M32 16l4.7 9.6 10.6 1.5-7.7 7.5 1.8 10.5L32 40.1l-9.4 5 1.8-10.5-7.7-7.5 10.6-1.5z" />
      </g>
    ),
  },
  monograma: {
    label: "Monograma A",
    bg: "#1f3a5f",
    glyph: (
      <g {...STROKE}>
        <path d="M22 46l10-28 10 28M26 36h12" />
      </g>
    ),
  },
};

export function PresetArt({ id, className }: { id: string; className?: string }) {
  const preset = AVATAR_PRESET_ART[id];
  if (!preset) return null;
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="32" fill={preset.bg} />
      {preset.glyph}
    </svg>
  );
}
