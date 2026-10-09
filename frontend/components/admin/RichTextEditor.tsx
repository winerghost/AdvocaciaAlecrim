"use client";

import {
  ChangeEvent,
  ReactNode,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Extension } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import { IMAGE_ACCEPT_ATTR, uploadAdminImage } from "@/lib/adminUpload";
import "./rich-text-editor.css";

type Align = "left" | "center" | "right" | "justify";

// Classes aceitas só na LEITURA (HTML antigo/colado); a gravação é por style.
const ALIGN_CLASS: Record<Align, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
  justify: "text-justify",
};
const ALIGN_VALUES = Object.keys(ALIGN_CLASS) as Align[];

/**
 * Alinhamento de texto gravado como style="text-align: ..." em p/h2/h3/h4:
 * o sanitizador do backend remove todo atributo class e só preserva esse
 * style. Na leitura aceita o style e também as classes text-center etc.
 * "Esquerda" é o padrão e não gera atributo nenhum.
 */
const TextAlignClass = Extension.create({
  name: "textAlignClass",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          textAlign: {
            default: null,
            parseHTML: (element: HTMLElement) => {
              const fromClass = ALIGN_VALUES.find((a) => element.classList.contains(ALIGN_CLASS[a]));
              const value = (element.style.textAlign as Align | "") || fromClass;
              return value && value !== "left" && ALIGN_VALUES.includes(value) ? value : null;
            },
            renderHTML: (attributes: Record<string, unknown>) => {
              const value = attributes.textAlign as Align | null;
              return value && ALIGN_VALUES.includes(value)
                ? { style: `text-align: ${value}` }
                : {};
            },
          },
        },
      },
    ];
  },

  addKeyboardShortcuts() {
    const apply = (align: Align) => () => {
      const textAlign = align === "left" ? null : align;
      return this.editor
        .chain()
        .updateAttributes("paragraph", { textAlign })
        .updateAttributes("heading", { textAlign })
        .run();
    };
    return {
      "Mod-Shift-l": apply("left"),
      "Mod-Shift-e": apply("center"),
      "Mod-Shift-r": apply("right"),
      "Mod-Shift-j": apply("justify"),
    };
  },
});

// Só o que a allowlist do backend aceita: sem h1, sem cor, sem tabela.
// No TipTap 3 o StarterKit já inclui Link e Underline.
const EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [2, 3, 4] },
    link: {
      openOnClick: false,
      autolink: true,
      defaultProtocol: "https",
      HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
    },
  }),
  Image.configure({ inline: false, allowBase64: false }),
  TextAlignClass,
  Placeholder.configure({ placeholder: "Comece a escrever o artigo..." }),
];

/**
 * Nonce da CSP do documento atual. É lido do DOM (qualquer <script> que o
 * Next emitiu o carrega) em vez de vir por prop do servidor: numa navegação
 * client-side o servidor gera um nonce NOVO para a requisição do payload,
 * mas a CSP que vale continua sendo a do documento já carregado.
 */
function documentNonce(): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce || undefined;
}

const ICON_PROPS = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const ICONS = {
  undo: (
    <svg {...ICON_PROPS}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  ),
  redo: (
    <svg {...ICON_PROPS}>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
    </svg>
  ),
  bold: (
    <svg {...ICON_PROPS}>
      <path d="M6 4h8a4 4 0 0 1 0 8H6z" />
      <path d="M6 12h9a4 4 0 0 1 0 8H6z" />
    </svg>
  ),
  italic: (
    <svg {...ICON_PROPS}>
      <line x1="19" y1="4" x2="10" y2="4" />
      <line x1="14" y1="20" x2="5" y2="20" />
      <line x1="15" y1="4" x2="9" y2="20" />
    </svg>
  ),
  underline: (
    <svg {...ICON_PROPS}>
      <path d="M6 4v6a6 6 0 0 0 12 0V4" />
      <line x1="4" y1="20" x2="20" y2="20" />
    </svg>
  ),
  strike: (
    <svg {...ICON_PROPS}>
      <path d="M16 4H9a3 3 0 0 0-2.83 4" />
      <path d="M14 12a4 4 0 0 1 0 8H6" />
      <line x1="4" y1="12" x2="20" y2="12" />
    </svg>
  ),
  alignLeft: (
    <svg {...ICON_PROPS}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="15" y2="12" />
      <line x1="3" y1="18" x2="18" y2="18" />
    </svg>
  ),
  alignCenter: (
    <svg {...ICON_PROPS}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="7" y1="12" x2="17" y2="12" />
      <line x1="5" y1="18" x2="19" y2="18" />
    </svg>
  ),
  alignRight: (
    <svg {...ICON_PROPS}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="9" y1="12" x2="21" y2="12" />
      <line x1="6" y1="18" x2="21" y2="18" />
    </svg>
  ),
  alignJustify: (
    <svg {...ICON_PROPS}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  ),
  bulletList: (
    <svg {...ICON_PROPS}>
      <line x1="9" y1="6" x2="21" y2="6" />
      <line x1="9" y1="12" x2="21" y2="12" />
      <line x1="9" y1="18" x2="21" y2="18" />
      <line x1="4" y1="6" x2="4.01" y2="6" />
      <line x1="4" y1="12" x2="4.01" y2="12" />
      <line x1="4" y1="18" x2="4.01" y2="18" />
    </svg>
  ),
  orderedList: (
    <svg {...ICON_PROPS}>
      <line x1="10" y1="6" x2="21" y2="6" />
      <line x1="10" y1="12" x2="21" y2="12" />
      <line x1="10" y1="18" x2="21" y2="18" />
      <path d="M4 6h1v4" />
      <path d="M4 10h2" />
      <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
    </svg>
  ),
  quote: (
    <svg {...ICON_PROPS}>
      <path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z" />
      <path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z" />
    </svg>
  ),
  rule: (
    <svg {...ICON_PROPS}>
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="8" y1="6" x2="16" y2="6" opacity="0.4" />
      <line x1="8" y1="18" x2="16" y2="18" opacity="0.4" />
    </svg>
  ),
  link: (
    <svg {...ICON_PROPS}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  image: (
    <svg {...ICON_PROPS}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  ),
  clear: (
    <svg {...ICON_PROPS}>
      <path d="M4 7V4h16v3" />
      <path d="M5 20h6" />
      <path d="M13 4 8 20" />
      <path d="m15 15 5 5" />
      <path d="m20 15-5 5" />
    </svg>
  ),
};

function ToolbarButton({
  label,
  onClick,
  active = false,
  disabled = false,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Evita que o clique tire o foco (e a seleção) de dentro do texto.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`rte-btn${active ? " rte-btn--active" : ""}`}
    >
      {children}
    </button>
  );
}

function imageFilesFrom(data: DataTransfer | null): File[] {
  if (!data) return [];
  return Array.from(data.files).filter((file) => file.type.startsWith("image/"));
}

// Aceita o que o usuário costuma digitar ("site.com.br", "/blog/x",
// "mailto:...") e devolve um href utilizável, ou null se for algo que o
// backend não aceita (ele só mantém http(s), mailto, /caminho e #ancora).
function normalizeHref(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(value)) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  return `https://${value}`;
}

type Props = {
  /**
   * HTML inicial. Para trocar de documento, remonte o componente com outra
   * `key`; para substituir o texto do documento aberto, use o `setContent`
   * da ref (RichTextEditorHandle).
   */
  value: string;
  onChange: (html: string) => void;
  /** Avisa quando há upload de imagem em andamento (pra segurar o "Salvar"). */
  onUploadingChange?: (uploading: boolean) => void;
  /** Chamado quando o upload volta 401 (sessão expirada). */
  onUnauthorized?: () => void;
};

export type RichTextEditorHandle = {
  /**
   * Troca o documento inteiro por `html` (sugestão da IA). É uma transação
   * comum do editor: dispara o `onChange` como se o usuário tivesse digitado
   * e entra no histórico, então Desfazer (Ctrl+Z) traz o texto anterior.
   * Devolve false se o editor ainda não estiver pronto.
   */
  setContent: (html: string) => boolean;
};

export default forwardRef<RichTextEditorHandle, Props>(function RichTextEditor(
  { value, onChange, onUploadingChange, onUnauthorized },
  ref
) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [pendingUploads, setPendingUploads] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  // Callbacks em ref: o useEditor captura as opções uma vez só, então os
  // handlers precisam ler sempre a versão mais recente das props.
  const onChangeRef = useRef(onChange);
  const onUploadingChangeRef = useRef(onUploadingChange);
  const onUnauthorizedRef = useRef(onUnauthorized);
  const uploadRef = useRef<(file: File, pos?: number) => void>(() => {});
  useEffect(() => {
    onChangeRef.current = onChange;
    onUploadingChangeRef.current = onUploadingChange;
    onUnauthorizedRef.current = onUnauthorized;
  });

  const editor = useEditor({
    extensions: EXTENSIONS,
    content: value,
    // O TipTap injeta um <style> no <head> com o CSS básico do editor. A CSP
    // (proxy.ts, style-src-elem) só aceita <style> com o nonce da página;
    // sem isto o navegador descartaria esse CSS.
    injectNonce: documentNonce(),
    // Next renderiza este componente no servidor também: sem isso o TipTap
    // tenta montar o DOM no SSR e gera erro de hidratação.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "article-content rte-content",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Conteúdo do artigo",
      },
      handlePaste: (_view, event) => {
        // Texto copiado do Word/Docs vem com HTML + uma "foto" do trecho;
        // nesse caso deixa o TipTap colar o HTML normalmente.
        if (event.clipboardData?.types.includes("text/html")) return false;
        const files = imageFilesFrom(event.clipboardData);
        if (files.length === 0) return false;
        event.preventDefault();
        files.forEach((file) => uploadRef.current(file));
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        // `moved` = arrastar algo de dentro do próprio editor: comportamento padrão.
        if (moved) return false;
        const files = imageFilesFrom(event.dataTransfer);
        if (files.length === 0) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        files.forEach((file) => uploadRef.current(file, pos));
        return true;
      },
    },
    onUpdate: ({ editor: instance }) => onChangeRef.current(instance.getHTML()),
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  });

  useImperativeHandle(
    ref,
    () => ({
      setContent: (html) => {
        if (!editor || editor.isDestroyed) return false;
        return editor.commands.setContent(html);
      },
    }),
    [editor]
  );

  // Estado da barra (o que está ativo na seleção atual) e contagem de
  // palavras, recalculados a cada transação do editor.
  const state = useEditorState({
    editor,
    selector: ({ editor: instance }) => {
      if (!instance) return null;
      const text = instance.getText().trim();
      const align: Align =
        instance.getAttributes("heading").textAlign ||
        instance.getAttributes("paragraph").textAlign ||
        "left";
      return {
        bold: instance.isActive("bold"),
        italic: instance.isActive("italic"),
        underline: instance.isActive("underline"),
        strike: instance.isActive("strike"),
        block: instance.isActive("heading", { level: 2 })
          ? "h2"
          : instance.isActive("heading", { level: 3 })
            ? "h3"
            : instance.isActive("heading", { level: 4 })
              ? "h4"
              : "p",
        align,
        bulletList: instance.isActive("bulletList"),
        orderedList: instance.isActive("orderedList"),
        blockquote: instance.isActive("blockquote"),
        link: instance.isActive("link"),
        canUndo: instance.can().undo(),
        canRedo: instance.can().redo(),
        words: text ? text.split(/\s+/).length : 0,
        characters: text.length,
      };
    },
  });

  const uploadImage = useCallback(
    async (file: File, pos?: number) => {
      if (!editor) return;
      setUploadError(null);
      setPendingUploads((n) => n + 1);
      const result = await uploadAdminImage(file);
      setPendingUploads((n) => n - 1);

      if (!result.ok) {
        setUploadError(result.message);
        if (result.unauthorized) onUnauthorizedRef.current?.();
        return;
      }
      if (editor.isDestroyed) return;

      // Nome do arquivo (sem extensão) como texto alternativo inicial.
      const alt = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
      const node = { type: "image", attrs: { src: result.url, alt } };
      const chain = editor.chain().focus();
      // A posição do "soltar" pode ter ficado inválida se o texto mudou
      // enquanto o upload acontecia - nesse caso insere no cursor.
      if (typeof pos === "number" && pos <= editor.state.doc.content.size) {
        chain.insertContentAt(pos, node).run();
      } else {
        chain.insertContent(node).run();
      }
    },
    [editor]
  );

  useEffect(() => {
    uploadRef.current = uploadImage;
  }, [uploadImage]);

  useEffect(() => {
    onUploadingChangeRef.current?.(pendingUploads > 0);
  }, [pendingUploads]);

  useEffect(() => {
    if (linkOpen) linkInputRef.current?.focus();
  }, [linkOpen]);

  function handleFilePicked(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    // Limpa o input pra permitir escolher o mesmo arquivo de novo depois.
    event.target.value = "";
    files.forEach((file) => uploadImage(file));
  }

  function setAlign(align: Align) {
    if (!editor) return;
    const textAlign = align === "left" ? null : align;
    editor
      .chain()
      .focus()
      .updateAttributes("paragraph", { textAlign })
      .updateAttributes("heading", { textAlign })
      .run();
  }

  function setBlock(block: string) {
    if (!editor) return;
    const chain = editor.chain().focus();
    if (block === "h2") chain.setHeading({ level: 2 }).run();
    else if (block === "h3") chain.setHeading({ level: 3 }).run();
    else if (block === "h4") chain.setHeading({ level: 4 }).run();
    else chain.setParagraph().run();
  }

  function clearFormatting() {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .unsetAllMarks()
      .clearNodes()
      .updateAttributes("paragraph", { textAlign: null })
      .run();
  }

  function openLinkBar() {
    if (!editor) return;
    setLinkValue((editor.getAttributes("link").href as string | undefined) ?? "");
    setLinkError(null);
    setLinkOpen(true);
  }

  function closeLinkBar() {
    setLinkOpen(false);
    setLinkError(null);
    editor?.commands.focus();
  }

  function applyLink() {
    if (!editor) return;
    const href = normalizeHref(linkValue);
    if (!href) {
      setLinkError("Informe um endereço válido (ex.: https://exemplo.com.br).");
      return;
    }
    if (editor.state.selection.empty && !editor.isActive("link")) {
      // Sem texto selecionado: insere o próprio endereço já como link.
      editor
        .chain()
        .focus()
        .insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] })
        .run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkOpen(false);
    setLinkError(null);
  }

  function removeLink() {
    editor?.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkOpen(false);
    setLinkError(null);
  }

  const ready = Boolean(editor && state);
  const uploading = pendingUploads > 0;

  return (
    <div className={`rte${focused ? " rte--focused" : ""}`}>
      <div className="rte-top">
        <div className="rte-toolbar" role="toolbar" aria-label="Formatação do texto">
          <div className="rte-group">
            <ToolbarButton
              label="Desfazer (Ctrl+Z)"
              disabled={!ready || !state?.canUndo}
              onClick={() => editor?.chain().focus().undo().run()}
            >
              {ICONS.undo}
            </ToolbarButton>
            <ToolbarButton
              label="Refazer (Ctrl+Y)"
              disabled={!ready || !state?.canRedo}
              onClick={() => editor?.chain().focus().redo().run()}
            >
              {ICONS.redo}
            </ToolbarButton>
          </div>

          <span className="rte-sep" aria-hidden="true" />

          <select
            className="rte-select"
            aria-label="Estilo do texto"
            title="Estilo do texto"
            disabled={!ready}
            value={state?.block ?? "p"}
            onChange={(e) => setBlock(e.target.value)}
          >
            <option value="p">Parágrafo</option>
            <option value="h2">Título 2</option>
            <option value="h3">Título 3</option>
            <option value="h4">Título 4</option>
          </select>

          <span className="rte-sep" aria-hidden="true" />

          <div className="rte-group">
            <ToolbarButton
              label="Negrito (Ctrl+B)"
              disabled={!ready}
              active={state?.bold}
              onClick={() => editor?.chain().focus().toggleBold().run()}
            >
              {ICONS.bold}
            </ToolbarButton>
            <ToolbarButton
              label="Itálico (Ctrl+I)"
              disabled={!ready}
              active={state?.italic}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
            >
              {ICONS.italic}
            </ToolbarButton>
            <ToolbarButton
              label="Sublinhado (Ctrl+U)"
              disabled={!ready}
              active={state?.underline}
              onClick={() => editor?.chain().focus().toggleUnderline().run()}
            >
              {ICONS.underline}
            </ToolbarButton>
            <ToolbarButton
              label="Tachado"
              disabled={!ready}
              active={state?.strike}
              onClick={() => editor?.chain().focus().toggleStrike().run()}
            >
              {ICONS.strike}
            </ToolbarButton>
          </div>

          <span className="rte-sep" aria-hidden="true" />

          <div className="rte-group">
            <ToolbarButton
              label="Alinhar à esquerda (Ctrl+Shift+L)"
              disabled={!ready}
              active={state?.align === "left"}
              onClick={() => setAlign("left")}
            >
              {ICONS.alignLeft}
            </ToolbarButton>
            <ToolbarButton
              label="Centralizar (Ctrl+Shift+E)"
              disabled={!ready}
              active={state?.align === "center"}
              onClick={() => setAlign("center")}
            >
              {ICONS.alignCenter}
            </ToolbarButton>
            <ToolbarButton
              label="Alinhar à direita (Ctrl+Shift+R)"
              disabled={!ready}
              active={state?.align === "right"}
              onClick={() => setAlign("right")}
            >
              {ICONS.alignRight}
            </ToolbarButton>
            <ToolbarButton
              label="Justificar (Ctrl+Shift+J)"
              disabled={!ready}
              active={state?.align === "justify"}
              onClick={() => setAlign("justify")}
            >
              {ICONS.alignJustify}
            </ToolbarButton>
          </div>

          <span className="rte-sep" aria-hidden="true" />

          <div className="rte-group">
            <ToolbarButton
              label="Lista com marcadores"
              disabled={!ready}
              active={state?.bulletList}
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
            >
              {ICONS.bulletList}
            </ToolbarButton>
            <ToolbarButton
              label="Lista numerada"
              disabled={!ready}
              active={state?.orderedList}
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            >
              {ICONS.orderedList}
            </ToolbarButton>
            <ToolbarButton
              label="Citação"
              disabled={!ready}
              active={state?.blockquote}
              onClick={() => editor?.chain().focus().toggleBlockquote().run()}
            >
              {ICONS.quote}
            </ToolbarButton>
            <ToolbarButton
              label="Linha horizontal"
              disabled={!ready}
              onClick={() => editor?.chain().focus().setHorizontalRule().run()}
            >
              {ICONS.rule}
            </ToolbarButton>
          </div>

          <span className="rte-sep" aria-hidden="true" />

          <div className="rte-group">
            <ToolbarButton
              label={state?.link ? "Editar link" : "Inserir link"}
              disabled={!ready}
              active={state?.link || linkOpen}
              onClick={() => (linkOpen ? closeLinkBar() : openLinkBar())}
            >
              {ICONS.link}
            </ToolbarButton>
            <ToolbarButton
              label="Inserir imagem"
              disabled={!ready}
              onClick={() => fileInputRef.current?.click()}
            >
              {ICONS.image}
            </ToolbarButton>
            <ToolbarButton
              label="Limpar formatação"
              disabled={!ready}
              onClick={clearFormatting}
            >
              {ICONS.clear}
            </ToolbarButton>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept={IMAGE_ACCEPT_ATTR}
            multiple
            hidden
            onChange={handleFilePicked}
          />
        </div>

        {linkOpen && (
          <div className="rte-linkbar">
            <input
              ref={linkInputRef}
              type="text"
              inputMode="url"
              aria-label="Endereço do link"
              placeholder="https://exemplo.com.br"
              value={linkValue}
              onChange={(e) => setLinkValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyLink();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  closeLinkBar();
                }
              }}
            />
            <button type="button" className="rte-linkbar-primary" onClick={applyLink}>
              Aplicar
            </button>
            {state?.link && (
              <button type="button" className="rte-linkbar-danger" onClick={removeLink}>
                Remover link
              </button>
            )}
            <button type="button" onClick={closeLinkBar}>
              Cancelar
            </button>
            {linkError && <span className="rte-linkbar-error">{linkError}</span>}
          </div>
        )}
      </div>

      <div className="rte-canvas">
        <div className="rte-sheet">
          {editor ? (
            <EditorContent editor={editor} />
          ) : (
            <div className="rte-loading">Carregando editor...</div>
          )}
        </div>
      </div>

      <div className="rte-footer">
        <span aria-live="polite">
          {uploading ? (
            <span className="rte-status">
              <span className="rte-spinner" aria-hidden="true" />
              {pendingUploads > 1
                ? `Enviando ${pendingUploads} imagens...`
                : "Enviando imagem..."}
            </span>
          ) : uploadError ? (
            <span className="rte-status rte-status--error" role="alert">
              {uploadError}
              <button type="button" onClick={() => setUploadError(null)}>
                Fechar
              </button>
            </span>
          ) : (
            "Dica: cole ou arraste imagens direto para dentro do texto."
          )}
        </span>
        <span>
          {state?.words ?? 0} {state?.words === 1 ? "palavra" : "palavras"} ·{" "}
          {state?.characters ?? 0} caracteres
        </span>
      </div>
    </div>
  );
});
