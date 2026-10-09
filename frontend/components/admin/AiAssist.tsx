"use client";

import { useEffect, useId, useRef, useState } from "react";

export type AiField = "title" | "content" | "excerpt";
export type AiAction = "draft" | "improve" | "fix";

type AiInput = { title: string; content: string; excerpt: string };

type AiState =
  | { phase: "idle" }
  | { phase: "loading"; action: AiAction }
  // `options` = alternativas para escolher (só o título traz mais de uma).
  // `source` = valor do campo quando o pedido saiu, pra avisar se o admin
  // mexeu no texto enquanto a IA trabalhava.
  | { phase: "suggestion"; action: AiAction; text: string; options: string[]; source: string }
  | { phase: "error"; action: AiAction; message: string; notConfigured: boolean }
  | { phase: "applied"; previous: string; applied: string };

export const AI_INSTRUCTIONS_MAX = 1000;

const TITLE_OPTIONS_MAX = 3;

const FIELD_NAMES: Record<AiField, string> = {
  title: "título",
  content: "conteúdo",
  excerpt: "resumo",
};

const INTROS: Record<AiField, string> = {
  title: "sugere opções de título para você escolher.",
  content: "escreve ou revisa o texto do artigo. Nada muda sem você aplicar.",
  excerpt: "resume o artigo em poucas linhas para a listagem do blog.",
};

const ACTION_LABELS: Record<AiField, Record<AiAction, string>> = {
  title: { draft: "Sugerir título", improve: "Melhorar", fix: "Corrigir erros" },
  content: { draft: "Redigir com IA", improve: "Melhorar", fix: "Corrigir erros" },
  excerpt: { draft: "Redigir com IA", improve: "Melhorar", fix: "Corrigir erros" },
};

const LOADING_LABELS: Record<AiField, Record<AiAction, string>> = {
  title: {
    draft: "Pensando em opções de título... Pode levar alguns segundos.",
    improve: "Melhorando o título... Pode levar alguns segundos.",
    fix: "Corrigindo a ortografia e a gramática do título... Pode levar alguns segundos.",
  },
  content: {
    draft: "Redigindo o rascunho do artigo... Um artigo completo pode levar até um minuto.",
    improve: "Melhorando o texto do artigo... Um artigo completo pode levar até um minuto.",
    fix: "Corrigindo a ortografia e a gramática do artigo... Um artigo completo pode levar até um minuto.",
  },
  excerpt: {
    draft: "Redigindo o resumo... Pode levar alguns segundos.",
    improve: "Melhorando o resumo... Pode levar alguns segundos.",
    fix: "Corrigindo a ortografia e a gramática do resumo... Pode levar alguns segundos.",
  },
};

const SUGGESTION_TITLES: Record<AiAction, string> = {
  draft: "Rascunho sugerido pela IA",
  improve: "Versão melhorada sugerida pela IA",
  fix: "Versão corrigida sugerida pela IA",
};

const REVIEW_NOTE =
  "Isto é só uma sugestão. Confira o texto antes de publicar: a IA pode errar leis, prazos e outros fatos jurídicos.";

const AI_ERRORS: Record<string, string> = {
  ai_not_configured:
    "O assistente de IA ainda não foi configurado. Falta cadastrar a chave da OpenAI na configuração do servidor. O artigo pode ser escrito e salvo normalmente sem ele.",
  ai_auth_error:
    "A OpenAI recusou a chave configurada no servidor. Ela pode estar incorreta ou ter sido revogada.",
  ai_rate_limited:
    "Muitos pedidos em pouco tempo, ou o limite de uso da IA foi atingido. Aguarde um instante e tente de novo.",
  ai_timeout: "A IA demorou demais para responder. Tente de novo, ou com um texto mais curto.",
  ai_upstream_error:
    "O serviço de IA falhou ou devolveu uma resposta que não pôde ser usada. Tente de novo em instantes.",
  validation_error: "Não foi possível enviar o pedido. Confira o texto do campo e tente de novo.",
  too_large: "O texto é grande demais para a IA processar de uma vez. Tente com um texto mais curto.",
  unavailable:
    "O assistente de IA não está disponível neste servidor no momento. O artigo pode ser escrito e salvo normalmente sem ele.",
  unauthorized: "Sua sessão expirou. Entre novamente e repita o pedido.",
  network: "Falha de conexão. Verifique a internet e tente de novo.",
  generic: "Não foi possível obter a sugestão da IA. Tente de novo.",
};

// O código do backend manda; o status cobre respostas sem corpo JSON (o 429
// do limitador, uma página de erro do proxy na frente do site, o 404 de um
// backend que ainda não tem a rota etc.).
const STATUS_ERRORS: Record<number, string> = {
  400: AI_ERRORS.validation_error,
  404: AI_ERRORS.unavailable,
  413: AI_ERRORS.too_large,
  429: AI_ERRORS.ai_rate_limited,
  502: AI_ERRORS.ai_upstream_error,
  503: AI_ERRORS.unavailable,
  504: AI_ERRORS.ai_timeout,
};

function errorCode(data: unknown): string {
  const raw = (data as { error?: unknown } | null)?.error;
  return typeof raw === "string" ? raw : "";
}

function describeAiError(status: number, data: unknown): string {
  const raw = errorCode(data);
  const code = raw === "invalid_json" ? "validation_error" : raw;
  if (code === "validation_error") {
    // `details` do backend diz qual campo do artigo foi recusado.
    const details = (data as { details?: unknown } | null)?.details;
    const named = (["title", "content", "excerpt"] as const)
      .filter((key) => details && typeof details === "object" && key in details)
      .map((key) => FIELD_NAMES[key]);
    if (named.length > 0) {
      return `Não foi possível enviar o pedido. Confira o texto do campo ${named.join(", ")} e tente de novo.`;
    }
  }
  if (code.startsWith("ai_") || code === "validation_error") {
    if (Object.prototype.hasOwnProperty.call(AI_ERRORS, code)) return AI_ERRORS[code];
  }
  return STATUS_ERRORS[status] ?? AI_ERRORS.generic;
}

// O editor devolve "<p></p>" quando está vazio. Conta como conteúdo se
// sobrar texto depois de tirar as tags, ou se houver imagem/linha.
export function isContentEmpty(html: string): boolean {
  if (/<(img|hr)\b/i.test(html)) return false;
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() === "";
}

function countImages(html: string): number {
  return (html.match(/<img\b/gi) ?? []).length;
}

/** Alternativas de título. Se `options` não for uma lista de textos não vazios, vale só o `text`. */
function titleOptions(raw: unknown, text: string): string[] {
  const valid =
    Array.isArray(raw) &&
    raw.length > 0 &&
    raw.every((item) => typeof item === "string" && item.trim() !== "");
  if (!valid) return [text];
  const unique = new Set((raw as string[]).map((item) => item.trim()));
  return Array.from(unique).slice(0, TITLE_OPTIONS_MAX);
}

// Depois do primeiro "ai_not_configured" a resposta não vai mudar sozinha:
// os próximos cliques (em qualquer campo) mostram o aviso direto, sem novo
// pedido. "Verificar de novo" força uma tentativa, e um sucesso limpa a marca.
let aiNotConfigured = false;

/**
 * Estado do assistente de IA de UM campo do artigo. Fica no ArticlesManager
 * (e não dentro do <AiAssist>) porque abrir a pré-visualização desmonta o
 * formulário: assim o pedido em andamento e a sugestão ainda não revisada
 * sobrevivem à ida e volta.
 *
 * Nada aqui roda sozinho: só há pedido ao backend dentro de `run`, chamado
 * por um clique. Falha, resposta estranha ou cancelamento terminam em um
 * estado de erro/repouso deste hook e nunca tocam o valor do campo.
 */
export function useAiAssist(field: AiField, onUnauthorized: () => void) {
  const [state, setState] = useState<AiState>({ phase: "idle" });
  // Painel "o que a IA deve escrever?" (só existe no rascunho do conteúdo).
  const [composing, setComposing] = useState(false);
  const [instructions, setInstructions] = useState("");
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function run(action: AiAction, input: AiInput, options?: { force?: boolean }) {
    // Um pedido por campo de cada vez.
    if (controllerRef.current) return;
    setComposing(false);

    const fail = (message: string, notConfigured = false) =>
      setState({ phase: "error", action, message, notConfigured });
    if (aiNotConfigured && !options?.force) {
      fail(AI_ERRORS.ai_not_configured, true);
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    const isDraft = action === "draft";
    const note = isDraft && field === "content" ? instructions.trim() : "";
    setState({ phase: "loading", action });

    try {
      // Sem timeout no cliente: um artigo inteiro pode levar perto de um
      // minuto. Quem desiste é o admin (Cancelar) ou o backend (504).
      const res = await fetch("/api/admin/articles/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field,
          action,
          title: input.title.trim(),
          ...(field !== "content" || !isDraft ? { content: input.content } : {}),
          ...(field === "title" || (field === "excerpt" && !isDraft)
            ? { excerpt: input.excerpt }
            : {}),
          ...(note ? { instructions: note } : {}),
        }),
        signal: controller.signal,
      });
      // Corpo vazio ou que não é JSON (página de erro em HTML) vira {}.
      const data: unknown = await res.json().catch(() => ({}));
      if (controller.signal.aborted) return;

      if (res.status === 401) {
        onUnauthorized();
        fail(AI_ERRORS.unauthorized);
        return;
      }
      if (!res.ok) {
        aiNotConfigured = errorCode(data) === "ai_not_configured";
        fail(describeAiError(res.status, data), aiNotConfigured);
        return;
      }
      const payload = (data as { data?: { text?: unknown; options?: unknown } } | null)?.data;
      const raw = payload?.text;
      const text = typeof raw !== "string" ? "" : field === "content" ? raw : raw.trim();
      if (field === "content" ? isContentEmpty(text) : text === "") {
        fail(AI_ERRORS.ai_upstream_error);
        return;
      }
      aiNotConfigured = false;
      setState({
        phase: "suggestion",
        action,
        text,
        options: field === "title" ? titleOptions(payload?.options, text) : [text],
        source: input[field],
      });
    } catch {
      if (controller.signal.aborted) return;
      fail(AI_ERRORS.network);
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }

  function cancel() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState({ phase: "idle" });
  }

  function dismiss() {
    setState({ phase: "idle" });
  }

  function markApplied(previous: string, applied: string) {
    setState({ phase: "applied", previous, applied });
  }

  /** Volta ao estado inicial (formulário aberto/fechado). */
  function reset() {
    cancel();
    setComposing(false);
    setInstructions("");
  }

  return {
    field,
    state,
    composing,
    setComposing,
    instructions,
    setInstructions,
    /** True depois que o servidor avisou que a chave da IA não foi cadastrada. */
    knownNotConfigured: () => aiNotConfigured,
    run,
    cancel,
    dismiss,
    markApplied,
    reset,
  };
}

export type AiAssistController = ReturnType<typeof useAiAssist>;

/** Sugestão de continuação mostrada depois de aplicar um texto ("gerar o resumo agora"). */
export type AiNextStep = { label: string; onClick: () => void };

const DISABLED_STYLE = "aria-disabled:cursor-not-allowed aria-disabled:opacity-50";
const AI_BTN = `whitespace-nowrap rounded border border-adm-border-strong bg-white px-2.5 py-2.5 text-xs font-semibold text-adm-body transition hover:border-adm-accent hover:text-adm-accent ${DISABLED_STYLE} aria-disabled:hover:border-adm-border-strong aria-disabled:hover:text-adm-body lg:py-1.5`;
// Ação indicada para o estado atual do campo (vazio: redigir; com texto: melhorar/corrigir).
const AI_BTN_LEAD = `whitespace-nowrap rounded border border-adm-accent bg-white px-2.5 py-2.5 text-xs font-semibold text-adm-accent transition hover:bg-adm-accent hover:text-white ${DISABLED_STYLE} aria-disabled:hover:bg-white aria-disabled:hover:text-adm-accent lg:py-1.5`;
const AI_BTN_PRIMARY = `whitespace-nowrap rounded border border-adm-accent bg-adm-accent px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-adm-accent-strong ${DISABLED_STYLE} aria-disabled:hover:bg-adm-accent lg:py-1.5`;
const AI_LINK = "whitespace-nowrap py-1 text-xs font-semibold underline";

const SPARKLE = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-adm-accent"
  >
    <path d="m10 4 2 5.5 5.5 2-5.5 2-2 5.5-2-5.5-5.5-2 5.5-2z" />
    <path d="m19 2 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
  </svg>
);

type Props = {
  ai: AiAssistController;
  title: string;
  content: string;
  excerpt: string;
  /** Limite do campo (título, resumo): a sugestão é cortada nele antes de aplicar. */
  maxLength?: number;
  /** Grava o texto no campo. Devolve false se não foi possível (editor ainda carregando). */
  onApply: (text: string) => boolean;
  /** Próximos passos oferecidos depois de aplicar (nunca disparados sozinhos). */
  nextSteps?: AiNextStep[];
  id?: string;
  className?: string;
};

/**
 * Assistente de IA de um campo do artigo: uma linha dizendo o que a IA faz
 * ali, as ações (cada uma com o que faz ou o que falta para usá-la) e o
 * painel da sugestão. A IA nunca escreve direto no campo: o retorno fica em
 * revisão até o admin aplicar ou descartar.
 */
export default function AiAssist({
  ai,
  title,
  content,
  excerpt,
  maxLength,
  onApply,
  nextSteps = [],
  id,
  className = "",
}: Props) {
  const { field, state, composing, instructions } = ai;
  const baseId = useId();
  const instructionsId = `${baseId}-instructions`;
  const rootRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const instructionsRef = useRef<HTMLTextAreaElement>(null);
  const buttonRefs = useRef<Partial<Record<AiAction, HTMLButtonElement | null>>>({});
  const [applyFailed, setApplyFailed] = useState(false);

  const input = { title, content, excerpt };
  const current = input[field];
  const fieldName = FIELD_NAMES[field];
  const labels = ACTION_LABELS[field];
  const hasTitle = title.trim() !== "";
  const hasExcerpt = excerpt.trim() !== "";
  const contentEmpty = isContentEmpty(content);
  const fieldEmpty = field === "content" ? contentEmpty : current.trim() === "";

  // O que cada ação faz - ou, se não dá para usá-la agora, o que preencher.
  const needsText = `Disponíveis quando houver texto no ${fieldName}.`;
  const notes: Record<AiAction, { text: string; missing: boolean }> = {
    draft:
      field === "content"
        ? {
            missing: false,
            text: !contentEmpty
              ? "Escreve um novo rascunho a partir do título e do que você pedir."
              : hasTitle
                ? "Escreve um rascunho a partir do título; você pode dizer o que abordar."
                : "Escreve um rascunho: preencha o título ou descreva o assunto no passo seguinte.",
          }
        : field === "excerpt"
          ? !contentEmpty
            ? { missing: false, text: "A IA resume o conteúdo do artigo." }
            : hasTitle
              ? {
                  missing: false,
                  text: "Escreve um resumo a partir do título. Escrevendo o conteúdo antes, o resumo fica melhor.",
                }
              : {
                  missing: true,
                  text: "Escreva antes o conteúdo (ou ao menos o título) para a IA ter o que resumir.",
                }
          : contentEmpty && !hasExcerpt
            ? {
                missing: true,
                text: "Disponível quando houver conteúdo ou resumo. Para começar do zero, use “Redigir com IA” no Conteúdo e descreva o assunto: não precisa de título.",
              }
            : { missing: false, text: "Sugere até três títulos a partir do conteúdo e do resumo." },
    improve: fieldEmpty
      ? { missing: true, text: needsText }
      : {
          missing: false,
          text:
            field === "title"
              ? "Sugere versões mais claras do seu título, sem mudar o assunto."
              : "Reescreve seu texto para ficar mais claro, sem mudar os fatos.",
        },
    fix: fieldEmpty
      ? { missing: true, text: needsText }
      : { missing: false, text: "Corrige ortografia e gramática, sem reescrever." },
  };

  // Campo vazio: começa por redigir. Com texto: melhorar/corrigir vêm antes.
  // Ações vizinhas com a mesma explicação dividem a linha.
  const order: AiAction[] = fieldEmpty ? ["draft", "improve", "fix"] : ["improve", "fix", "draft"];
  const rows: { actions: AiAction[]; text: string }[] = [];
  for (const action of order) {
    const last = rows[rows.length - 1];
    if (last && last.text === notes[action].text) last.actions.push(action);
    else rows.push({ actions: [action], text: notes[action].text });
  }
  const leads = rows[0].actions;

  const busyReason =
    state.phase === "loading"
      ? "Aguarde o pedido em andamento ou cancele-o."
      : state.phase === "suggestion"
        ? "Aplique ou descarte a sugestão atual primeiro."
        : null;

  const canDraftContent = hasTitle || instructions.trim() !== "";
  const cut = (text: string) => (maxLength ? text.slice(0, maxLength).trim() : text);
  const suggestion = state.phase === "suggestion" ? cut(state.text) : "";
  // Ao melhorar/corrigir, a IA pode devolver o texto sem alguma imagem do artigo.
  const lostImages =
    field === "content" && state.phase === "suggestion" && state.action !== "draft"
      ? countImages(content) - countImages(suggestion)
      : 0;
  const options =
    state.phase === "suggestion" ? Array.from(new Set(state.options.map(cut).filter(Boolean))) : [];

  // A sugestão pode chegar um minuto depois do clique: só leva o foco para
  // ela se o admin não estiver digitando em outro lugar da página (nesse
  // caso quem avisa é a região aria-live).
  const phase = state.phase;
  useEffect(() => {
    if (phase !== "suggestion") return;
    const active = document.activeElement;
    if (!active || active === document.body || rootRef.current?.contains(active)) {
      headingRef.current?.focus();
    }
  }, [phase]);

  useEffect(() => {
    if (composing) instructionsRef.current?.focus();
  }, [composing]);

  // Os botões das ações nunca saem da tela: é para eles que o foco volta
  // quando um painel (instrução, sugestão, erro) fecha.
  // Repete o foco depois do render: aplicar um texto muda a ordem das ações
  // (o campo deixa de estar vazio) e o botão pode ser movido no DOM.
  const pendingFocus = useRef<AiAction | null>(null);
  useEffect(() => {
    if (!pendingFocus.current) return;
    buttonRefs.current[pendingFocus.current]?.focus();
    pendingFocus.current = null;
  });

  function focusAction(action: AiAction) {
    buttonRefs.current[action]?.focus();
    pendingFocus.current = action;
  }

  function trigger(action: AiAction) {
    if (busyReason || notes[action].missing) return;
    setApplyFailed(false);
    // Sem a chave no servidor não adianta pedir a instrução: o aviso sai direto.
    if (field === "content" && action === "draft" && !ai.knownNotConfigured()) {
      ai.setComposing(!composing);
      return;
    }
    ai.run(action, input);
  }

  function submitDraft() {
    if (!canDraftContent) return;
    focusAction("draft");
    ai.run("draft", input);
  }

  function closeComposer() {
    focusAction("draft");
    ai.setComposing(false);
  }

  function retry(action: AiAction) {
    focusAction(action);
    setApplyFailed(false);
    ai.run(action, input, { force: true });
  }

  function apply(text: string) {
    if (state.phase !== "suggestion" || !text) return;
    if (!onApply(text)) {
      setApplyFailed(true);
      return;
    }
    setApplyFailed(false);
    focusAction(state.action);
    ai.markApplied(current, text);
  }

  function discard() {
    if (state.phase !== "suggestion") return;
    setApplyFailed(false);
    focusAction(state.action);
    ai.dismiss();
  }

  function cancel() {
    if (state.phase !== "loading") return;
    focusAction(state.action);
    ai.cancel();
  }

  function undoApplied() {
    if (state.phase !== "applied") return;
    onApply(state.previous);
    ai.dismiss();
  }

  return (
    <div ref={rootRef} id={id} className={`space-y-2 ${className}`}>
      <div role="group" aria-label={`Assistente de IA para o ${fieldName}`} className="space-y-1.5">
        <p className="text-xs text-adm-muted">
          {SPARKLE}
          <span className="font-semibold text-adm-body">Assistente de IA:</span> {INTROS[field]}
        </p>
        {rows.map((row, index) => {
          const noteId = `${baseId}-note-${index}`;
          return (
            <div key={row.actions.join("-")} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {row.actions.map((action) => {
                const reason = busyReason ?? (notes[action].missing ? notes[action].text : null);
                const opensComposer = field === "content" && action === "draft";
                return (
                  <button
                    key={action}
                    ref={(node) => {
                      buttonRefs.current[action] = node;
                    }}
                    type="button"
                    // aria-disabled (e não disabled): o botão continua alcançável
                    // pelo teclado e o motivo é lido/mostrado.
                    aria-disabled={reason ? true : undefined}
                    aria-describedby={noteId}
                    aria-expanded={opensComposer ? composing : undefined}
                    title={reason ?? undefined}
                    onClick={() => trigger(action)}
                    className={leads.includes(action) ? AI_BTN_LEAD : AI_BTN}
                  >
                    {labels[action]}
                  </button>
                );
              })}
              <span id={noteId} className="min-w-0 flex-1 basis-44 text-xs text-adm-muted">
                {row.text}
              </span>
            </div>
          );
        })}
      </div>

      {composing && (
        <div
          className="space-y-2 rounded border border-adm-border bg-adm-surface p-3"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              closeComposer();
            }
          }}
        >
          <label htmlFor={instructionsId} className="block text-xs font-semibold text-adm-body">
            {hasTitle
              ? "Quer orientar a IA? (opcional)"
              : "Sobre o que é o artigo? Descreva o assunto (ou preencha o título)."}
          </label>
          <textarea
            ref={instructionsRef}
            id={instructionsId}
            rows={4}
            maxLength={AI_INSTRUCTIONS_MAX}
            value={instructions}
            onChange={(e) => ai.setInstructions(e.target.value)}
            placeholder="Ex.: Artigo para passageiros que tiveram o voo cancelado. Explicar em linguagem simples o direito a reembolso ou reacomodação, a assistência que a companhia deve dar no aeroporto, quando cabe indenização e quais documentos guardar."
            className="w-full rounded border border-adm-border-strong bg-white px-3 py-2 text-sm text-adm-ink focus:border-adm-focus focus:outline-none focus:ring focus:ring-adm-accent/25"
          />
          <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-adm-muted">
            <span className="min-w-0 break-words">
              {hasTitle
                ? `A IA parte do título “${title.trim()}”. Diga aqui o assunto, para quem é o texto e os pontos a cobrir.`
                : "Diga o assunto, para quem é o texto e os pontos a cobrir."}
              {contentEmpty ? "" : " O texto atual só é substituído se você aplicar o rascunho."}
            </span>
            <span>
              {instructions.length}/{AI_INSTRUCTIONS_MAX}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-disabled={canDraftContent ? undefined : true}
              title={
                canDraftContent
                  ? undefined
                  : "Preencha o título do artigo ou descreva o assunto para a IA ter de onde partir."
              }
              onClick={submitDraft}
              className={AI_BTN_PRIMARY}
            >
              Gerar rascunho
            </button>
            <button type="button" onClick={closeComposer} className={AI_BTN}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Sempre montada, pra leitores de tela anunciarem a troca de estado. */}
      <div aria-live="polite" role="status">
        {state.phase === "loading" && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-adm-info-line bg-adm-info-soft px-3 py-2 text-xs text-adm-info-ink">
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-adm-info-line border-t-adm-info-ink"
            />
            <span className="min-w-0 flex-1 basis-40">{LOADING_LABELS[field][state.action]}</span>
            <button type="button" onClick={cancel} className={AI_LINK}>
              Cancelar
            </button>
          </div>
        )}

        {state.phase === "error" && (
          // "Não configurado" é um estado esperado, não uma falha: tom de aviso.
          <div
            className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded border px-3 py-2 text-xs ${
              state.notConfigured
                ? "border-adm-warning-line bg-adm-warning-soft text-adm-warning-ink"
                : "border-adm-danger-line bg-adm-danger-soft text-adm-danger-ink"
            }`}
          >
            <span className="min-w-0 flex-1 basis-40">{state.message}</span>
            {!notes[state.action].missing && (
              <button type="button" onClick={() => retry(state.action)} className={AI_LINK}>
                {state.notConfigured ? "Verificar de novo" : "Tentar de novo"}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                focusAction(state.action);
                ai.dismiss();
              }}
              className={AI_LINK}
            >
              Fechar
            </button>
          </div>
        )}

        {state.phase === "applied" && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-adm-success-line bg-adm-success-soft px-3 py-2 text-xs text-adm-success-ink">
            <span className="min-w-0 flex-1 basis-40">
              {field === "content"
                ? "Sugestão aplicada ao conteúdo. Revise o texto; para voltar ao anterior, use o botão Desfazer do editor (Ctrl+Z)."
                : `Sugestão aplicada ao ${fieldName}.`}
            </span>
            {field !== "content" && current === state.applied && state.previous !== state.applied && (
              <button type="button" onClick={undoApplied} className={AI_LINK}>
                Desfazer
              </button>
            )}
            <button type="button" onClick={ai.dismiss} className={AI_LINK}>
              Fechar
            </button>
            {nextSteps.length > 0 && (
              <span className="flex basis-full flex-wrap items-center gap-x-3 gap-y-1">
                <span>Próximo passo, se quiser:</span>
                {nextSteps.map((step) => (
                  <button key={step.label} type="button" onClick={step.onClick} className={AI_LINK}>
                    {step.label}
                  </button>
                ))}
              </span>
            )}
          </div>
        )}

        {state.phase === "suggestion" && <span className="sr-only">Sugestão da IA pronta para revisão.</span>}
      </div>

      {state.phase === "suggestion" && (
        <section
          aria-labelledby={`${baseId}-title`}
          className="space-y-3 rounded border border-adm-info-line bg-adm-surface p-3"
        >
          <h2
            ref={headingRef}
            id={`${baseId}-title`}
            tabIndex={-1}
            className="text-sm font-bold text-adm-ink focus:outline-none"
          >
            {field !== "title"
              ? SUGGESTION_TITLES[state.action]
              : options.length > 1
                ? "Títulos sugeridos pela IA"
                : "Título sugerido pela IA"}
          </h2>
          <p className="rounded border border-adm-warning-line bg-adm-warning-soft px-3 py-2 text-xs text-adm-warning-ink">
            {REVIEW_NOTE}
          </p>

          {field === "content" && (
            // state.text é sempre HTML devolvido pelo backend já sanitizado
            // (POST /api/admin/articles/ai) - mesmo padrão e mesma classe da
            // pré-visualização do artigo. Nunca o HTML cru do editor.
            <div
              role="region"
              aria-label="Texto sugerido"
              tabIndex={0}
              className="max-h-[60vh] overflow-y-auto break-words rounded border border-adm-border bg-white px-5 py-6 sm:px-8"
            >
              <div className="article-content" dangerouslySetInnerHTML={{ __html: suggestion }} />
            </div>
          )}

          {field === "excerpt" && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="min-w-0">
                <p className="mb-1 text-xs font-semibold text-adm-muted">Resumo atual</p>
                <p className="whitespace-pre-wrap break-words rounded border border-adm-border bg-adm-canvas px-3 py-2 text-sm text-adm-body">
                  {excerpt.trim() || "(vazio)"}
                </p>
              </div>
              <div className="min-w-0">
                <p className="mb-1 text-xs font-semibold text-adm-muted">
                  Sugestão ({suggestion.length}
                  {maxLength ? `/${maxLength}` : ""} caracteres)
                </p>
                <p className="whitespace-pre-wrap break-words rounded border border-adm-focus bg-white px-3 py-2 text-sm text-adm-ink">
                  {suggestion}
                </p>
              </div>
            </div>
          )}

          {field === "title" && (
            // Títulos são texto puro: entram como filhos de texto do React,
            // nunca como HTML.
            <div className="space-y-2">
              <p className="break-words text-xs text-adm-muted">
                Título atual:{" "}
                <span className="font-semibold text-adm-body">{title.trim() || "(vazio)"}</span>
              </p>
              <ul className="space-y-2">
                {options.map((option) => (
                  <li key={option}>
                    <button
                      type="button"
                      onClick={() => apply(option)}
                      className="group w-full rounded border border-adm-border-strong bg-white px-3 py-2 text-left transition hover:border-adm-accent"
                    >
                      <span className="block break-words text-sm font-semibold text-adm-ink">
                        {option}
                      </span>
                      <span className="text-xs font-semibold text-adm-accent group-hover:underline">
                        Usar este título
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-adm-muted">
            {state.source !== current
              ? `O ${fieldName} foi alterado depois que esta sugestão foi pedida. `
              : ""}
            {field === "title"
              ? "Clique em uma opção para usá-la como título; dá para editar depois."
              : fieldEmpty
                ? `Aplicar preenche o ${fieldName} com este texto.`
                : `Aplicar substitui o ${fieldName} atual por este texto.`}
            {field === "content" ? " Dá para desfazer no editor (Ctrl+Z)." : ""}
          </p>
          {lostImages > 0 && (
            <p className="text-xs text-adm-warning-strong">
              {lostImages === 1
                ? "Atenção: esta sugestão tem uma imagem a menos que o texto atual."
                : `Atenção: esta sugestão tem ${lostImages} imagens a menos que o texto atual.`}{" "}
              Se aplicar, insira de novo pelo editor o que faltar.
            </p>
          )}
          {applyFailed && (
            <p role="alert" className="text-xs text-adm-danger-ink">
              O editor ainda está carregando. Tente aplicar de novo em instantes.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {field !== "title" && (
              <button type="button" onClick={() => apply(suggestion)} className={AI_BTN_PRIMARY}>
                Aplicar
              </button>
            )}
            <button type="button" onClick={discard} className={AI_BTN}>
              Descartar
            </button>
            {!notes[state.action].missing && (
              <button
                type="button"
                onClick={() => {
                  const action = state.action;
                  focusAction(action);
                  ai.dismiss();
                  ai.run(action, input);
                }}
                className={`${AI_LINK} text-adm-body`}
              >
                {field === "title" ? "Gerar outras opções" : "Gerar outra sugestão"}
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
