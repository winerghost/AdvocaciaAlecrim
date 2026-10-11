// ESLint (flat config). `next lint` foi removido no Next 16, então o lint
// roda direto pelo ESLint (`npm run lint`).
// Não usamos eslint-config-next de propósito: ele puxa @next/eslint-plugin-next
// -> fast-glob -> micromatch -> braces (CVE GHSA-vfj7-8cjw-p6xm, sem versão
// corrigida), o que traria o `npm audit` de volta a "high". Em troca, usamos
// typescript-eslint + react-hooks + jsx-a11y.
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";

// O código tem `eslint-disable @next/next/no-img-element` (herdado do
// eslint-config-next). Sem o plugin instalado, o ESLint reclamaria de "regra
// não encontrada"; este stub só registra o nome da regra (sem checar nada).
const nextStub = { rules: { "no-img-element": { meta: { schema: [] }, create: () => ({}) } } };

export default tseslint.config(
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "public/**"] },
  { linterOptions: { reportUnusedDisableDirectives: "off" } },
  ...tseslint.configs.recommended,
  jsxA11y.flatConfigs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks, "@next/next": nextStub },
    rules: {
      // Fundo do modal (clique fora) e container que trata Esc: o teclado é
      // coberto por listener de Escape; o elemento em si não é um controle.
      "jsx-a11y/no-static-element-interactions": "off",
      // Regiões roláveis (prévia de artigo, sugestão da IA) recebem foco de
      // propósito para o teclado conseguir rolar o conteúdo.
      "jsx-a11y/no-noninteractive-tabindex": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
);
