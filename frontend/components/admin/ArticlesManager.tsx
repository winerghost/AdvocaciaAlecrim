"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AiAssist, {
  type AiAssistController,
  type AiNextStep,
  isContentEmpty,
  useAiAssist,
} from "@/components/admin/AiAssist";
import RichTextEditor, { type RichTextEditorHandle } from "@/components/admin/RichTextEditor";
import type { AdminArticle } from "@/lib/adminTypes";
import { extractList } from "@/lib/adminTypes";
import { IMAGE_ACCEPT_ATTR, uploadAdminImage } from "@/lib/adminUpload";

const INPUT_CLASS =
  "w-full rounded border border-adm-border-strong px-3 py-2 text-sm text-adm-ink focus:border-adm-focus focus:outline-none focus:ring focus:ring-adm-accent/25";
const LABEL_CLASS = "mb-1 block text-xs font-semibold text-adm-body";
const BTN_PRIMARY =
  "rounded bg-adm-accent px-5 py-2 text-sm font-semibold text-white transition hover:bg-adm-accent-strong disabled:opacity-60";
const BTN_SUCCESS =
  "rounded bg-adm-success px-5 py-2 text-sm font-semibold text-white transition hover:bg-adm-success-strong disabled:opacity-60";
const BTN_NEUTRAL =
  "rounded border border-adm-border-strong bg-white px-5 py-2 text-sm text-adm-body transition hover:bg-adm-canvas disabled:opacity-60";
const BTN_ROW =
  "rounded border px-2.5 py-2.5 text-xs lg:py-1 font-semibold transition disabled:opacity-60";

const TITLE_MAX = 200;
const EXCERPT_MAX = 500;
// Mesmo formato que o backend exige para cover_image.
const MEDIA_PATH = /^\/api\/media\/[a-f0-9]{32}\.(jpg|png|webp|gif)$/;

type Status = "published" | "scheduled" | "draft";
type StatusFilter = "all" | Status;

const STATUS_LABELS: Record<Status, string> = {
  published: "Publicado",
  scheduled: "Agendado",
  draft: "Rascunho",
};

const STATUS_BADGE: Record<Status, string> = {
  published: "border border-adm-success bg-adm-success-soft text-adm-success-ink",
  scheduled: "border border-adm-warning bg-adm-warning-soft text-adm-warning-ink",
  draft: "border border-adm-border-strong bg-adm-canvas text-adm-muted",
};

type FormState = {
  title: string;
  slug: string;
  excerpt: string;
  cover_image: string;
  // Valor do <input type="datetime-local">: horário LOCAL, "AAAA-MM-DDTHH:mm".
  published_at: string;
  content: string;
  // Estado gravado no backend (não é um campo editável: muda pelos botões).
  published: boolean;
};

type FieldName = "title" | "slug" | "excerpt" | "cover_image" | "published_at" | "content";
type FieldErrors = Partial<Record<FieldName, string[]>>;

type SaveAction = "draft" | "publish" | "keep" | "unpublish";

type PreviewData = {
  from: "list" | "form";
  title: string;
  excerpt: string;
  cover_image: string | null;
  // SEMPRE HTML já sanitizado pelo backend (leitura do artigo salvo ou
  // POST /api/admin/articles/preview). Nunca o HTML cru do editor.
  content: string;
  date: Date | null;
  status: Status;
  // Só preenchido quando o artigo já está no ar (publicado e não agendado).
  publicUrl: string | null;
  unsaved: boolean;
};

type PendingLeave = { kind: "close" } | { kind: "navigate"; href: string };

const EMPTY_FORM: FormState = {
  title: "",
  slug: "",
  excerpt: "",
  cover_image: "",
  published_at: "",
  content: "",
  published: false,
};

const GENERAL_ERRORS: Record<string, string> = {
  validation_error: "Confira os campos destacados.",
  slug_already_exists: "Já existe um artigo com esse endereço (slug). Escolha outro.",
  invalid_json: "Não foi possível enviar os dados. Tente novamente.",
  invalid_id: "Artigo inválido.",
  not_found: "Artigo não encontrado. Ele pode ter sido excluído.",
  too_many_requests: "Muitas tentativas. Aguarde e tente novamente.",
  file_too_large: "A imagem passa do limite de 5 MB.",
  invalid_image: "Arquivo inválido. Envie uma imagem JPEG, PNG, WebP ou GIF.",
};

// Mensagens padrão do validador do backend (marshmallow) -> português.
// O que não casar com nenhuma regra é exibido como veio.
const FIELD_MESSAGE_RULES: Array<[RegExp, string]> = [
  [/missing data for required field/i, "Campo obrigatório."],
  [/may not be null|may not be (empty|blank)/i, "Campo obrigatório."],
  [/shorter than minimum length|length must be between/i, "Texto fora do tamanho permitido."],
  [/longer than maximum length/i, "Texto acima do tamanho máximo."],
  [/not a valid (datetime|date)/i, "Data inválida."],
  [/not a valid (string|boolean|url)/i, "Valor inválido."],
  [/already exists|slug_already_exists/i, "Já está em uso por outro artigo."],
  [/string does not match expected pattern|invalid slug/i, "Use só letras minúsculas, números e hífens."],
  [/unknown field/i, "Campo não reconhecido."],
];

function translateFieldMessage(message: string): string {
  const rule = FIELD_MESSAGE_RULES.find(([pattern]) => pattern.test(message));
  return rule ? rule[1] : message;
}

function isFieldName(name: string): name is FieldName {
  return ["title", "slug", "excerpt", "cover_image", "published_at", "content"].includes(name);
}

/** Traduz a resposta de erro do backend em mensagem geral + erros por campo. */
function describeError(data: unknown, fallback: string): { message: string; fields: FieldErrors } {
  const body = (data && typeof data === "object" ? data : {}) as {
    error?: unknown;
    details?: unknown;
  };
  const code = typeof body.error === "string" ? body.error : "";
  const fields: FieldErrors = {};

  if (body.details && typeof body.details === "object") {
    for (const [name, raw] of Object.entries(body.details as Record<string, unknown>)) {
      if (!isFieldName(name)) continue;
      const list = Array.isArray(raw) ? raw : [raw];
      fields[name] = list.map((item) => translateFieldMessage(String(item)));
    }
  }
  if (code === "slug_already_exists") {
    fields.slug = ["Já existe um artigo com esse endereço."];
  }

  return { message: GENERAL_ERRORS[code] ?? fallback, fields };
}

/** "Direito do Consumidor: 5 dicas!" -> "direito-do-consumidor-5-dicas" */
function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/g, "");
}

// Versão usada enquanto o usuário digita o slug à mão: não corta o hífen
// do final, senão seria impossível digitar "minha-" antes de "pagina".
function slugifyTyping(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 120);
}

// O backend manda datas em ISO 8601 UTC. Se vier sem indicação de fuso
// ("2026-01-05T12:00:00"), tratamos como UTC em vez de deixar o navegador
// interpretar como horário local.
function parseApiDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const hasZone = /(z|[+-]\d{2}:?\d{2})$/i.test(value);
  const date = new Date(hasZone || !value.includes("T") ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Date -> valor do datetime-local (componentes no fuso do navegador).
function toLocalInput(date: Date | null): string {
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

// Valor do datetime-local (horário local) -> Date. `new Date("AAAA-MM-DDTHH:mm")`
// sem fuso é interpretado como local pela especificação; toISOString() depois
// converte para UTC.
function fromLocalInput(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatLongDate(date: Date | null): string {
  if (!date) return "";
  return date.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

function statusOf(published: boolean, date: Date | null): Status {
  if (!published) return "draft";
  return date && date.getTime() > Date.now() ? "scheduled" : "published";
}

function toForm(article: AdminArticle): FormState {
  return {
    title: article.title ?? "",
    slug: article.slug ?? "",
    excerpt: article.excerpt ?? "",
    cover_image: article.cover_image ?? "",
    published_at: toLocalInput(parseApiDate(article.published_at)),
    content: article.content ?? "",
    published: Boolean(article.published),
  };
}

function extractArticle(json: unknown): AdminArticle | null {
  const data = (json as { data?: unknown } | null)?.data ?? json;
  if (data && typeof data === "object" && typeof (data as AdminArticle).id === "number") {
    return data as AdminArticle;
  }
  return null;
}

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages || messages.length === 0) return null;
  return <p className="mt-1 text-xs text-adm-danger-ink">{messages.join(" ")}</p>;
}

export default function ArticlesManager() {
  const router = useRouter();

  // ---- Lista ----
  const [items, setItems] = useState<AdminArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  // ---- Formulário (null = fechado) ----
  const [form, setForm] = useState<FormState | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  // Fotografia do formulário no último carregamento/salvamento, pra saber
  // se há alterações não salvas.
  const [baseline, setBaseline] = useState("");
  // Slug gravado no backend (o do formulário pode ter sido editado e ainda não salvo).
  const [savedSlug, setSavedSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState<SaveAction | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [editorUploading, setEditorUploading] = useState(false);
  // Trocar a key remonta o editor com o conteúdo novo.
  const [editorKey, setEditorKey] = useState(0);
  const [pendingLeave, setPendingLeave] = useState<PendingLeave | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  // Identifica o pedido de pré-visualização em andamento: se o formulário
  // for fechado (ou outro pedido começar) antes da resposta, ela é ignorada.
  const previewRequestRef = useRef(0);

  const coverInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<RichTextEditorHandle>(null);

  const dirty = form !== null && JSON.stringify(form) !== baseline;
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  // Sessão expirada (401): os outros managers só caem no /login na próxima
  // navegação. Aqui, se houver texto não salvo, NÃO redirecionamos - o
  // usuário perderia o artigo. Mostramos um aviso com link pra entrar de
  // novo em outra aba (o cookie é compartilhado) e ele salva em seguida.
  const handleUnauthorized = useCallback(() => {
    if (dirtyRef.current) {
      setSessionExpired(true);
    } else {
      window.location.assign("/login");
    }
  }, []);

  // Assistente de IA do título, do conteúdo e do resumo (um pedido por campo,
  // sempre a partir de um clique - nada é pedido ao abrir o formulário).
  const titleAi = useAiAssist("title", handleUnauthorized);
  const contentAi = useAiAssist("content", handleUnauthorized);
  const excerptAi = useAiAssist("excerpt", handleUnauthorized);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/articles", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      if (!res.ok) {
        setError("Não foi possível carregar os artigos.");
        return;
      }
      setItems(extractList<AdminArticle>(data));
    } catch {
      setError("Falha de conexão.");
    } finally {
      setLoading(false);
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    load();
  }, [load]);

  // Aviso do navegador ao fechar/recarregar a aba com alterações não salvas,
  // e interceptação de cliques em links do painel (menu lateral etc.), que
  // são navegação client-side e não disparam o beforeunload.
  useEffect(() => {
    if (!dirty) return;

    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    function onClickCapture(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      // Links dentro do texto que está sendo editado não navegam.
      if (anchor.closest(".rte")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.hash) return;
      // Só preventDefault (sem stopPropagation): o <Link> do Next ignora o
      // clique já cancelado, e os outros handlers (fechar o menu mobile)
      // continuam rodando.
      event.preventDefault();
      setPendingLeave({ kind: "navigate", href: url.pathname + url.search + url.hash });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClickCapture, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, [dirty]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (needle && !item.title.toLowerCase().includes(needle)) return false;
      if (statusFilter === "all") return true;
      return statusOf(item.published, parseApiDate(item.published_at)) === statusFilter;
    });
  }, [items, query, statusFilter]);

  // ---- Abrir / fechar formulário ----

  function openForm(next: FormState, id: number | null) {
    setForm(next);
    setBaseline(JSON.stringify(next));
    setEditingId(id);
    setSavedSlug(id ? next.slug : "");
    // Artigo existente: não mexe no slug sozinho (mudaria a URL já divulgada).
    setSlugTouched(Boolean(id));
    setFieldErrors({});
    setPendingLeave(null);
    setSessionExpired(false);
    setEditorKey((k) => k + 1);
    titleAi.reset();
    contentAi.reset();
    excerptAi.reset();
    setError(null);
    setSuccess(null);
    setConfirmingId(null);
    window.scrollTo({ top: 0 });
  }

  function closeForm() {
    setForm(null);
    setEditingId(null);
    setBaseline("");
    setFieldErrors({});
    setPendingLeave(null);
    setSessionExpired(false);
    setPreview(null);
    previewRequestRef.current += 1;
    setPreviewLoading(false);
    setEditorUploading(false);
    titleAi.reset();
    contentAi.reset();
    excerptAi.reset();
  }

  function startCreate() {
    openForm(EMPTY_FORM, null);
  }

  async function fetchArticle(id: number): Promise<AdminArticle | null> {
    setError(null);
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/articles/${id}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        handleUnauthorized();
        return null;
      }
      const article = res.ok ? extractArticle(data) : null;
      if (!article) {
        setError(describeError(data, "Não foi possível abrir o artigo.").message);
        return null;
      }
      return article;
    } catch {
      setError("Falha de conexão.");
      return null;
    } finally {
      setBusyId(null);
    }
  }

  async function startEdit(id: number) {
    const article = await fetchArticle(id);
    if (article) openForm(toForm(article), article.id);
  }

  function requestClose() {
    if (dirty) {
      setPendingLeave({ kind: "close" });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      closeForm();
    }
  }

  function confirmLeave() {
    const target = pendingLeave;
    closeForm();
    if (target?.kind === "navigate") router.push(target.href);
  }

  // ---- Campos ----

  function patch(changes: Partial<FormState>) {
    setForm((current) => (current ? { ...current, ...changes } : current));
  }

  function clearFieldError(name: FieldName) {
    setFieldErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function handleTitleChange(title: string) {
    clearFieldError("title");
    patch(slugTouched ? { title } : { title, slug: slugify(title) });
  }

  function handleSlugChange(raw: string) {
    clearFieldError("slug");
    const slug = slugifyTyping(raw);
    // Apagar o slug inteiro devolve o preenchimento automático pelo título.
    setSlugTouched(slug !== "");
    patch({ slug: slug === "" && form ? slugify(form.title) : slug });
  }

  const handleContentChange = useCallback((content: string) => {
    setForm((current) => (current ? { ...current, content } : current));
    setFieldErrors((current) => {
      if (!current.content) return current;
      const next = { ...current };
      delete next.content;
      return next;
    });
  }, []);

  // Sugestões da IA aceitas pelo admin. No conteúdo, o texto entra pelo
  // próprio editor: o onChange dele (handleContentChange) atualiza o
  // formulário e limpa o erro do campo, igual a quando se digita.
  function applyTitleSuggestion(text: string): boolean {
    // Mesmo caminho da digitação: limpa o erro e só mexe no slug enquanto
    // ele ainda é o automático (nunca em artigo já salvo).
    handleTitleChange(text);
    return true;
  }

  function applyContentSuggestion(html: string): boolean {
    return editorRef.current?.setContent(html) ?? false;
  }

  function applyExcerptSuggestion(text: string): boolean {
    clearFieldError("excerpt");
    patch({ excerpt: text });
    return true;
  }

  // "Próximo passo" oferecido depois de aplicar uma sugestão: só aparece se
  // o campo de destino estiver vazio e livre, e só roda com o clique.
  function aiNextStep(
    target: AiAssistController,
    label: string,
    anchorId: string
  ): AiNextStep[] {
    if (!form || isContentEmpty(form.content)) return [];
    if (form[target.field].trim() !== "") return [];
    if (target.state.phase === "loading" || target.state.phase === "suggestion") return [];
    const input = { title: form.title, content: form.content, excerpt: form.excerpt };
    return [
      {
        label,
        onClick: () => {
          target.run("draft", input);
          document.getElementById(anchorId)?.scrollIntoView({ block: "center", behavior: "smooth" });
        },
      },
    ];
  }

  async function handleCoverPicked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    clearFieldError("cover_image");
    setCoverUploading(true);
    const result = await uploadAdminImage(file);
    setCoverUploading(false);

    if (!result.ok) {
      setFieldErrors((current) => ({ ...current, cover_image: [result.message] }));
      if (result.unauthorized) handleUnauthorized();
      return;
    }
    patch({ cover_image: result.url });
  }

  // ---- Salvar ----

  async function save(action: SaveAction) {
    if (!form || saving) return;
    setError(null);
    setSuccess(null);
    setPendingLeave(null);

    const title = form.title.trim();
    const cover = form.cover_image.trim();
    const localErrors: FieldErrors = {};
    if (!title) localErrors.title = ["Informe o título."];
    if (isContentEmpty(form.content)) localErrors.content = ["Escreva o conteúdo do artigo."];
    if (cover && !MEDIA_PATH.test(cover)) {
      localErrors.cover_image = [
        "Use o caminho de uma imagem já enviada (ex.: /api/media/arquivo.jpg) ou envie um arquivo.",
      ];
    }
    if (form.published_at && !fromLocalInput(form.published_at)) {
      localErrors.published_at = ["Data inválida."];
    }
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      setError(GENERAL_ERRORS.validation_error);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const published =
      action === "publish" ? true : action === "keep" ? form.published : false;
    const date = fromLocalInput(form.published_at);
    // Publicando sem data: grava o momento atual (mesma regra do backend,
    // aplicada aqui pra não depender de como ele trata published_at nulo).
    const publishedAt = date ?? (published ? new Date() : null);

    const isCreate = editingId === null;
    const slug = form.slug.trim().replace(/-+$/g, "");
    // Slug explícito repetido volta 400 slug_already_exists; o sufixo
    // automático (-2, -3) do backend só vale quando o slug vai vazio. Então:
    // enquanto o slug ainda é o automático (não editado à mão), manda ""
    // e deixa o backend gerar a partir do título. Na edição, só manda o
    // slug se ele mudou - omitir mantém o atual.
    const slugValue = slugTouched ? slug : "";
    const slugField: { slug?: string } = isCreate || slug !== savedSlug ? { slug: slugValue } : {};

    const payload = {
      title,
      ...slugField,
      excerpt: form.excerpt.trim(),
      cover_image: cover || null,
      content: form.content,
      published,
      published_at: publishedAt ? publishedAt.toISOString() : null,
    };

    setSaving(action);
    try {
      const res = await fetch(isCreate ? "/api/admin/articles" : `/api/admin/articles/${editingId}`, {
        method: isCreate ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        setSessionExpired(true);
        return;
      }
      if (!res.ok) {
        const described = describeError(data, "Não foi possível salvar o artigo.");
        setFieldErrors(described.fields);
        setError(described.message);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      setSessionExpired(false);
      setFieldErrors({});

      const article = extractArticle(data);
      if (article) {
        // Atualiza slug/data/status com o que o backend gravou, mas mantém
        // no editor o HTML que o usuário está vendo: o HTML sanitizado pode
        // voltar serializado de outro jeito (mesmo conteúdo), e remontar o
        // editor a cada "Salvar" faria perder o cursor e o histórico de
        // desfazer. O editor só emite o que a allowlist aceita; ao reabrir
        // o artigo, o conteúdo carregado é o gravado.
        const next = toForm({ ...article, content: form.content });
        setForm(next);
        setBaseline(JSON.stringify(next));
        setEditingId(article.id);
        setSavedSlug(next.slug);
        setSlugTouched(true);
      } else {
        const next = { ...form, published, published_at: toLocalInput(publishedAt) };
        setForm(next);
        setBaseline(JSON.stringify(next));
      }

      setSuccess(
        action === "publish"
          ? "Artigo publicado."
          : action === "unpublish"
            ? "Artigo despublicado e salvo como rascunho."
            : action === "draft"
              ? "Rascunho salvo."
              : "Alterações salvas."
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
      load();
    } catch {
      setError("Falha de conexão. Suas alterações continuam aqui - tente salvar de novo.");
    } finally {
      setSaving(null);
    }
  }

  // ---- Ações da lista ----

  async function togglePublished(item: AdminArticle) {
    setError(null);
    setSuccess(null);
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/admin/articles/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: !item.published }),
      });
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          describeError(
            data,
            item.published ? "Não foi possível despublicar." : "Não foi possível publicar."
          ).message
        );
        return;
      }
      setSuccess(item.published ? "Artigo despublicado." : "Artigo publicado.");
      await load();
    } catch {
      setError("Falha de conexão.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: number) {
    setError(null);
    setSuccess(null);
    setConfirmingId(null);
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/articles/${id}`, { method: "DELETE" });
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(describeError(data, "Não foi possível excluir.").message);
        return;
      }
      setSuccess("Artigo excluído.");
      await load();
    } catch {
      setError("Falha de conexão.");
    } finally {
      setBusyId(null);
    }
  }

  // ---- Pré-visualização ----

  async function previewFromList(id: number) {
    const article = await fetchArticle(id);
    if (!article) return;
    const date = parseApiDate(article.published_at);
    const status = statusOf(article.published, date);
    setPreview({
      from: "list",
      title: article.title,
      excerpt: article.excerpt ?? "",
      cover_image: article.cover_image,
      // Artigo salvo: GET /api/admin/articles/<id> já devolve o conteúdo
      // re-sanitizado pelo backend, não precisa do endpoint de prévia.
      content: article.content ?? "",
      date,
      status,
      publicUrl: status === "published" ? `/blog/${article.slug}` : null,
      unsaved: false,
    });
    window.scrollTo({ top: 0 });
  }

  // O HTML do formulário ainda não passou pelo backend: é a saída do editor
  // (ou algo colado nele). Antes de injetá-lo na página com
  // dangerouslySetInnerHTML, pedimos ao backend a versão sanitizada - o
  // mesmo sanitizador do salvamento, então a prévia mostra exatamente o que
  // seria publicado (ex.: imagem de outro site colada no texto some, porque
  // só /api/media/... é aceito). Se a chamada falhar, a prévia NÃO abre:
  // não existe caminho que renderize o HTML cru.
  async function previewFromForm() {
    if (!form || previewLoading) return;
    const snapshot = form;
    const wasDirty = dirty;
    const requestId = ++previewRequestRef.current;

    setError(null);
    setSuccess(null);
    setPreviewLoading(true);

    let content: string;
    try {
      const res = await fetch("/api/admin/articles/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: snapshot.content }),
      });
      const data = await res.json().catch(() => ({}));
      if (requestId !== previewRequestRef.current) return;

      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      const sanitized = (data as { data?: { content?: unknown } } | null)?.data?.content;
      if (!res.ok || typeof sanitized !== "string") {
        const described = describeError(data, "Não foi possível gerar a pré-visualização.");
        // "Campo obrigatório" aqui só significa editor vazio.
        setError(
          res.status === 413
            ? "O conteúdo é grande demais para pré-visualizar."
            : described.fields.content
              ? `Não foi possível pré-visualizar o conteúdo: ${described.fields.content.join(" ")}`
              : described.message
        );
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      content = sanitized;
    } catch {
      if (requestId !== previewRequestRef.current) return;
      setError("Falha de conexão. Não foi possível gerar a pré-visualização.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    } finally {
      if (requestId === previewRequestRef.current) setPreviewLoading(false);
    }

    const date = fromLocalInput(snapshot.published_at);
    const cover = snapshot.cover_image.trim();
    const status = statusOf(snapshot.published, date);
    setPreview({
      from: "form",
      title: snapshot.title.trim(),
      excerpt: snapshot.excerpt.trim(),
      cover_image: MEDIA_PATH.test(cover) ? cover : null,
      content,
      date,
      status,
      publicUrl: status === "published" && savedSlug ? `/blog/${savedSlug}` : null,
      unsaved: wasDirty,
    });
    window.scrollTo({ top: 0 });
  }

  // ---- Render ----

  const alerts = (
    <>
      {sessionExpired && (
        <div className="rounded border border-adm-warning-line bg-adm-warning-soft px-4 py-3 text-sm text-adm-warning-ink">
          Sua sessão expirou. Suas alterações continuam nesta tela:{" "}
          <a href="/login" target="_blank" rel="noopener noreferrer" className="font-semibold underline">
            entre novamente em outra aba
          </a>{" "}
          e depois clique em salvar de novo.
        </div>
      )}
      {error && (
        <p className="rounded border border-adm-danger-line bg-adm-danger-soft px-4 py-3 text-sm text-adm-danger-ink">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded border border-adm-success-line bg-adm-success-soft px-4 py-3 text-sm text-adm-success-ink">
          {success}
        </p>
      )}
    </>
  );

  // -- Pré-visualização --
  if (preview) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-bold text-adm-ink">Pré-visualização do artigo</h1>
          <div className="flex flex-wrap items-center gap-2">
            {preview.publicUrl && (
              <a
                href={preview.publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-adm-accent px-4 py-2 text-sm font-semibold text-adm-accent transition hover:bg-adm-accent hover:text-white"
              >
                Abrir no site ↗
              </a>
            )}
            <button type="button" onClick={() => setPreview(null)} className={BTN_PRIMARY}>
              {preview.from === "form" ? "Voltar à edição" : "Voltar à lista"}
            </button>
          </div>
        </div>

        <p className="rounded border border-adm-info-line bg-adm-info-soft px-4 py-3 text-sm text-adm-info-ink">
          <span className={`mr-2 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[preview.status]}`}>
            {STATUS_LABELS[preview.status]}
          </span>
          {preview.unsaved
            ? "Mostrando as alterações ainda não salvas. O site só muda depois de salvar."
            : preview.status === "published"
              ? "É assim que o artigo aparece para os visitantes."
              : "Este artigo ainda não está visível no site."}
        </p>

        <div className="rounded border border-adm-border bg-white shadow-sm">
          <article className="article-preview mx-auto max-w-3xl break-words px-5 py-10 sm:px-8">
            {preview.cover_image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview.cover_image}
                alt=""
                className="mb-8 aspect-[16/9] w-full rounded object-cover"
              />
            )}
            <h1 className="text-3xl font-bold leading-tight text-adm-ink sm:text-4xl">
              {preview.title || "(Sem título)"}
            </h1>
            {preview.date && (
              <p className="mt-3 text-sm text-adm-muted">{formatLongDate(preview.date)}</p>
            )}
            {preview.excerpt && (
              <p className="mt-5 text-lg leading-relaxed text-adm-body">{preview.excerpt}</p>
            )}
            <hr className="my-8 border-adm-border" />
            {isContentEmpty(preview.content) ? (
              <p className="text-sm text-adm-muted">O artigo ainda não tem conteúdo.</p>
            ) : (
              // preview.content é sempre HTML devolvido pelo backend já
              // sanitizado (ver PreviewData) - mesma classe usada no site.
              <div
                className="article-content"
                dangerouslySetInnerHTML={{ __html: preview.content }}
              />
            )}
          </article>
        </div>
      </div>
    );
  }

  // -- Formulário (tela cheia dentro do painel) --
  if (form) {
    const busy = saving !== null || previewLoading;
    const blocked = busy || coverUploading || editorUploading;
    const coverValue = form.cover_image.trim();
    const coverValid = MEDIA_PATH.test(coverValue);
    const currentStatus = statusOf(form.published, fromLocalInput(form.published_at));

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-lg font-bold text-adm-ink">
              {editingId ? "Editar artigo" : "Novo artigo"}
            </h1>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_BADGE[currentStatus]}`}>
              {STATUS_LABELS[currentStatus]}
            </span>
            {dirty && <span className="text-xs text-adm-warning-strong">Alterações não salvas</span>}
          </div>
          <button type="button" onClick={requestClose} className={BTN_NEUTRAL}>
            ← Voltar à lista
          </button>
        </div>

        {pendingLeave && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded border border-adm-warning-line bg-adm-warning-soft px-4 py-3 text-sm text-adm-warning-ink"
          >
            <span>Há alterações não salvas. Se sair agora, elas serão perdidas.</span>
            <span className="flex gap-2">
              <button
                type="button"
                onClick={() => setPendingLeave(null)}
                className="rounded border border-adm-border-strong bg-white whitespace-nowrap px-3 py-2.5 text-xs font-semibold lg:py-1.5 text-adm-body transition hover:bg-adm-canvas"
              >
                Continuar editando
              </button>
              <button
                type="button"
                onClick={confirmLeave}
                className="rounded bg-adm-danger whitespace-nowrap px-3 py-2.5 text-xs font-semibold lg:py-1.5 text-white transition hover:bg-adm-danger-strong"
              >
                Sair sem salvar
              </button>
            </span>
          </div>
        )}

        {alerts}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          {/* Coluna principal: título + conteúdo */}
          <div className="min-w-0 space-y-4">
            <div className="rounded border border-adm-border bg-white p-4 shadow-sm">
              <label htmlFor="article-title" className={LABEL_CLASS}>
                Título
              </label>
              <input
                id="article-title"
                value={form.title}
                maxLength={TITLE_MAX}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Título do artigo"
                className={`${INPUT_CLASS} text-base font-semibold`}
              />
              <FieldError messages={fieldErrors.title} />
              <AiAssist
                id="article-title-ai"
                className="mt-3"
                ai={titleAi}
                title={form.title}
                content={form.content}
                excerpt={form.excerpt}
                maxLength={TITLE_MAX}
                onApply={applyTitleSuggestion}
                nextSteps={aiNextStep(excerptAi, "Gerar o resumo com a IA", "article-excerpt-ai")}
              />
            </div>

            <div>
              <span className={LABEL_CLASS}>Conteúdo</span>
              <AiAssist
                className="mb-2"
                ai={contentAi}
                title={form.title}
                content={form.content}
                excerpt={form.excerpt}
                onApply={applyContentSuggestion}
                nextSteps={[
                  ...aiNextStep(titleAi, "Sugerir um título", "article-title-ai"),
                  ...aiNextStep(excerptAi, "Gerar o resumo com a IA", "article-excerpt-ai"),
                ]}
              />
              <RichTextEditor
                key={editorKey}
                ref={editorRef}
                value={form.content}
                onChange={handleContentChange}
                onUploadingChange={setEditorUploading}
                onUnauthorized={handleUnauthorized}
              />
              <FieldError messages={fieldErrors.content} />
            </div>
          </div>

          {/* Coluna lateral: publicação, endereço, resumo, capa */}
          <div className="space-y-4">
            <div className="space-y-4 rounded border border-adm-border bg-white p-4 shadow-sm">
              <div>
                <label htmlFor="article-slug" className={LABEL_CLASS}>
                  Endereço (slug)
                </label>
                <input
                  id="article-slug"
                  value={form.slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="gerado-a-partir-do-titulo"
                  spellCheck={false}
                  autoComplete="off"
                  className={INPUT_CLASS}
                />
                <p className="mt-1 break-all text-xs text-adm-muted">
                  URL final: <span className="font-medium text-adm-ink">/blog/{form.slug || "…"}</span>
                </p>
                {editingId !== null && form.published && form.slug !== savedSlug && (
                  <p className="mt-1 text-xs text-adm-warning-strong">
                    Atenção: mudar o endereço de um artigo publicado quebra os links já
                    compartilhados.
                  </p>
                )}
                <FieldError messages={fieldErrors.slug} />
              </div>

              <div>
                <label htmlFor="article-date" className={LABEL_CLASS}>
                  Data de publicação
                </label>
                <input
                  id="article-date"
                  type="datetime-local"
                  value={form.published_at}
                  onChange={(e) => {
                    clearFieldError("published_at");
                    patch({ published_at: e.target.value });
                  }}
                  className={INPUT_CLASS}
                />
                <p className="mt-1 text-xs text-adm-muted">
                  No seu horário local. Em branco, vale o momento em que você publicar. Uma data
                  futura deixa o artigo como “Agendado”.
                </p>
                <FieldError messages={fieldErrors.published_at} />
              </div>
            </div>

            <div className="rounded border border-adm-border bg-white p-4 shadow-sm">
              <label htmlFor="article-excerpt" className={LABEL_CLASS}>
                Resumo
              </label>
              <textarea
                id="article-excerpt"
                rows={5}
                maxLength={EXCERPT_MAX}
                value={form.excerpt}
                onChange={(e) => {
                  clearFieldError("excerpt");
                  patch({ excerpt: e.target.value });
                }}
                placeholder="Texto curto que aparece na listagem do blog e nos resultados de busca."
                className={INPUT_CLASS}
              />
              <p
                className={`mt-1 text-right text-xs ${
                  form.excerpt.length >= EXCERPT_MAX ? "text-adm-danger-ink" : "text-adm-muted"
                }`}
              >
                {form.excerpt.length}/{EXCERPT_MAX}
              </p>
              <FieldError messages={fieldErrors.excerpt} />
              <AiAssist
                id="article-excerpt-ai"
                className="mt-3"
                ai={excerptAi}
                title={form.title}
                content={form.content}
                excerpt={form.excerpt}
                maxLength={EXCERPT_MAX}
                onApply={applyExcerptSuggestion}
                nextSteps={aiNextStep(titleAi, "Sugerir um título", "article-title-ai")}
              />
            </div>

            <div className="rounded border border-adm-border bg-white p-4 shadow-sm">
              <span className={LABEL_CLASS}>Imagem de capa</span>

              {coverValid ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverValue}
                  alt="Pré-visualização da capa"
                  className="mb-3 aspect-[16/9] w-full rounded border border-adm-border object-cover"
                />
              ) : (
                <div className="mb-3 flex aspect-[16/9] w-full items-center justify-center rounded border border-dashed border-adm-border-strong bg-adm-canvas text-xs text-adm-muted">
                  {coverUploading ? "Enviando imagem..." : "Sem imagem de capa"}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={coverUploading}
                  onClick={() => coverInputRef.current?.click()}
                  className="rounded border border-adm-accent whitespace-nowrap px-3 py-2.5 text-xs font-semibold lg:py-1.5 text-adm-accent transition hover:bg-adm-accent hover:text-white disabled:opacity-60"
                >
                  {coverUploading ? "Enviando..." : coverValid ? "Trocar imagem" : "Enviar imagem"}
                </button>
                {coverValue && (
                  <button
                    type="button"
                    disabled={coverUploading}
                    onClick={() => {
                      clearFieldError("cover_image");
                      patch({ cover_image: "" });
                    }}
                    className="rounded border border-adm-danger whitespace-nowrap px-3 py-2.5 text-xs font-semibold lg:py-1.5 text-adm-danger transition hover:bg-adm-danger hover:text-white disabled:opacity-60"
                  >
                    Remover
                  </button>
                )}
                <input
                  ref={coverInputRef}
                  type="file"
                  accept={IMAGE_ACCEPT_ATTR}
                  hidden
                  onChange={handleCoverPicked}
                />
              </div>

              <label htmlFor="article-cover" className={`${LABEL_CLASS} mt-3`}>
                Ou cole o caminho de uma imagem já enviada
              </label>
              <input
                id="article-cover"
                value={form.cover_image}
                onChange={(e) => {
                  clearFieldError("cover_image");
                  patch({ cover_image: e.target.value });
                }}
                placeholder="/api/media/arquivo.jpg"
                spellCheck={false}
                autoComplete="off"
                className={INPUT_CLASS}
              />
              <p className="mt-1 text-xs text-adm-muted">JPEG, PNG, WebP ou GIF, até 5 MB.</p>
              <FieldError messages={fieldErrors.cover_image} />
            </div>
          </div>
        </div>

        {/* Barra de ações sempre visível no rodapé da tela */}
        <div className="sticky bottom-0 z-30 -mx-4 flex flex-wrap items-center gap-3 border-t border-adm-border bg-white px-4 py-3 shadow-[0_-2px_6px_rgba(0,0,0,0.06)] sm:-mx-6 sm:px-6">
          {form.published ? (
            <>
              <button type="button" disabled={blocked} onClick={() => save("keep")} className={BTN_PRIMARY}>
                {saving === "keep" ? "Salvando..." : "Salvar alterações"}
              </button>
              <button
                type="button"
                disabled={blocked}
                onClick={() => save("unpublish")}
                className="rounded border border-adm-danger bg-white px-5 py-2 text-sm font-semibold text-adm-danger transition hover:bg-adm-danger hover:text-white disabled:opacity-60"
              >
                {saving === "unpublish" ? "Despublicando..." : "Despublicar"}
              </button>
            </>
          ) : (
            <>
              <button type="button" disabled={blocked} onClick={() => save("draft")} className={BTN_PRIMARY}>
                {saving === "draft" ? "Salvando..." : "Salvar rascunho"}
              </button>
              <button type="button" disabled={blocked} onClick={() => save("publish")} className={BTN_SUCCESS}>
                {saving === "publish" ? "Publicando..." : "Publicar"}
              </button>
            </>
          )}
          <button type="button" disabled={busy} onClick={previewFromForm} className={BTN_NEUTRAL}>
            {previewLoading ? "Gerando prévia..." : "Visualizar"}
          </button>
          <button type="button" disabled={busy} onClick={requestClose} className={BTN_NEUTRAL}>
            Cancelar
          </button>
          {editorUploading && (
            <span className="text-xs text-adm-muted">Aguardando o envio da imagem...</span>
          )}
        </div>
      </div>
    );
  }

  // -- Lista --
  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-adm-ink">Artigos</h1>

      {alerts}

      <div className="rounded border border-adm-border bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-adm-border px-4 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-adm-ink">
            Artigos do blog
          </h2>
          <button
            type="button"
            onClick={startCreate}
            className="rounded bg-adm-accent whitespace-nowrap px-3 py-2.5 text-xs font-semibold lg:py-1.5 text-white transition hover:bg-adm-accent-strong"
          >
            + Novo artigo
          </button>
        </div>

        <div className="flex flex-wrap gap-3 border-b border-adm-border px-4 py-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por título..."
            aria-label="Buscar por título"
            className={`${INPUT_CLASS} max-w-xs`}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            aria-label="Filtrar por status"
            className={`${INPUT_CLASS} max-w-[12rem] bg-white`}
          >
            <option value="all">Todos os status</option>
            <option value="published">Publicados</option>
            <option value="scheduled">Agendados</option>
            <option value="draft">Rascunhos</option>
          </select>
        </div>

        {loading ? (
          <p className="px-4 py-6 text-sm text-adm-muted">Carregando...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-adm-canvas text-xs font-bold uppercase tracking-wide text-adm-muted">
                <tr>
                  <th className="px-4 py-3">Capa</th>
                  <th className="px-4 py-3">Título</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Publicação</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-adm-border">
                {filtered.map((item) => {
                  const date = parseApiDate(item.published_at);
                  const status = statusOf(item.published, date);
                  const rowBusy = busyId === item.id;
                  return (
                    <tr key={item.id} className="hover:bg-adm-canvas">
                      <td className="px-4 py-3">
                        {item.cover_image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.cover_image}
                            alt=""
                            loading="lazy"
                            className="h-12 w-20 rounded border border-adm-border object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-20 items-center justify-center rounded border border-dashed border-adm-border-strong bg-adm-canvas text-[10px] text-adm-faint">
                            sem capa
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-adm-ink">{item.title}</div>
                        <div className="text-xs text-adm-muted">/blog/{item.slug}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${STATUS_BADGE[status]}`}
                        >
                          {STATUS_LABELS[status]}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-adm-body">
                        {formatDateTime(date)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          {confirmingId === item.id ? (
                            <>
                              <span className="self-center text-xs text-adm-danger-ink">
                                Excluir este artigo?
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDelete(item.id)}
                                className="rounded bg-adm-danger px-2.5 py-2.5 text-xs lg:py-1 font-semibold text-white transition hover:bg-adm-danger-strong"
                              >
                                Confirmar
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmingId(null)}
                                className="rounded border border-adm-border-strong px-2.5 py-2.5 text-xs lg:py-1 text-adm-body transition hover:bg-adm-canvas"
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={rowBusy}
                                onClick={() => startEdit(item.id)}
                                className={`${BTN_ROW} border-adm-accent text-adm-accent hover:bg-adm-accent hover:text-white`}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                disabled={rowBusy}
                                onClick={() => previewFromList(item.id)}
                                className={`${BTN_ROW} border-adm-muted text-adm-body hover:bg-adm-muted hover:text-white`}
                              >
                                Visualizar
                              </button>
                              <button
                                type="button"
                                disabled={rowBusy}
                                onClick={() => togglePublished(item)}
                                className={`${BTN_ROW} ${
                                  item.published
                                    ? "border-adm-warning-strong text-adm-warning-strong hover:bg-adm-warning-strong hover:text-white"
                                    : "border-adm-success text-adm-success hover:bg-adm-success hover:text-white"
                                }`}
                              >
                                {item.published ? "Despublicar" : "Publicar"}
                              </button>
                              <button
                                type="button"
                                disabled={rowBusy}
                                onClick={() => setConfirmingId(item.id)}
                                className={`${BTN_ROW} border-adm-danger text-adm-danger hover:bg-adm-danger hover:text-white`}
                              >
                                Excluir
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-adm-muted">
                      {items.length === 0
                        ? "Nenhum artigo cadastrado."
                        : "Nenhum artigo encontrado com esses filtros."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
