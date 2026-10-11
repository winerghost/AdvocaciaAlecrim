"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listAdminUploads, type UploadedImage } from "@/lib/adminUpload";

type Props = {
  open: boolean;
  /** URL (/api/media/...) da imagem hoje selecionada, para destacá-la. */
  selectedUrl?: string;
  onClose: () => void;
  onSelect: (url: string) => void;
  onUnauthorized: () => void;
};

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function usageLabel(image: UploadedImage): string {
  if (!image.in_use) return "Não usada em nenhum artigo";
  const titles = Array.from(new Set(image.used_in.map((u) => u.title)));
  const shown = titles.slice(0, 2).join(", ");
  return titles.length > 2 ? `Em uso: ${shown} e mais ${titles.length - 2}` : `Em uso: ${shown}`;
}

/**
 * Galeria das imagens já enviadas pelo painel. O usuário escolhe pela
 * miniatura em vez de digitar o caminho `/api/media/<uuid>.jpg`.
 */
export default function MediaPickerModal({ open, selectedUrl, onClose, onSelect, onUnauthorized }: Props) {
  const [items, setItems] = useState<UploadedImage[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const requestId = useRef(0);
  // Em ref: o pai pode passar uma função nova a cada render, e isso não pode
  // disparar um novo carregamento da galeria.
  const onUnauthorizedRef = useRef(onUnauthorized);
  useEffect(() => {
    onUnauthorizedRef.current = onUnauthorized;
  }, [onUnauthorized]);

  const load = useCallback(async (target: number) => {
    const current = ++requestId.current;
    setLoading(true);
    setError(null);
    const result = await listAdminUploads(target);
    if (current !== requestId.current) return; // resposta de uma abertura anterior
    setLoading(false);

    if (!result.ok) {
      setError(result.message);
      if (result.unauthorized) onUnauthorizedRef.current();
      return;
    }
    setItems((prev) => (target === 1 ? result.items : [...prev, ...result.items]));
    setPage(result.page);
    setPages(result.pages);
  }, []);

  // Abre: carrega a primeira página, prende o foco e trava o scroll do fundo.
  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setItems([]);
    setPage(1);
    setPages(1);
    void load(1);
    closeRef.current?.focus();

    return () => {
      requestId.current++;
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, load]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="media-picker-title"
        className="flex w-full max-w-4xl flex-col bg-white shadow-lg sm:max-h-[85vh] sm:rounded sm:border sm:border-adm-border"
      >
        <div className="flex items-center justify-between gap-3 border-b border-adm-border px-4 py-3">
          <h2 id="media-picker-title" className="text-sm font-semibold text-adm-ink">
            Escolher imagem já enviada
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded border border-adm-border px-3 py-2.5 text-xs font-semibold text-adm-ink transition hover:bg-adm-canvas lg:py-1.5"
          >
            Fechar
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4" aria-live="polite" aria-busy={loading}>
          {error && (
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded border border-adm-danger px-3 py-2 text-xs text-adm-danger-ink">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => void load(items.length === 0 ? 1 : page + 1)}
                className="rounded border border-adm-danger px-3 py-1.5 font-semibold transition hover:bg-adm-danger hover:text-white"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <p className="py-10 text-center text-sm text-adm-muted">
              Nenhuma imagem enviada ainda. Feche esta janela e use &quot;Enviar imagem&quot;.
            </p>
          )}

          {items.length > 0 && (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((image) => {
                const selected = image.url === selectedUrl;
                const label = `${usageLabel(image)} — enviada em ${formatDate(image.created_at)}`;
                return (
                  <li key={image.filename}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      aria-label={`Usar esta imagem. ${label}`}
                      onClick={() => onSelect(image.url)}
                      className={`block w-full overflow-hidden rounded border text-left transition hover:border-adm-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-adm-accent ${
                        selected ? "border-adm-accent ring-2 ring-adm-accent" : "border-adm-border"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={image.url}
                        alt=""
                        loading="lazy"
                        className="aspect-square w-full bg-adm-canvas object-cover"
                      />
                      <span className="block space-y-0.5 px-2 py-1.5 text-[11px] leading-snug">
                        <span
                          className={`block font-semibold ${image.in_use ? "text-adm-ink" : "text-adm-muted"}`}
                        >
                          {selected ? "Selecionada" : image.in_use ? "Em uso" : "Não usada"}
                        </span>
                        <span className="block truncate text-adm-muted">
                          {image.in_use ? usageLabel(image).replace("Em uso: ", "") : "Sem artigo"}
                        </span>
                        <span className="block text-adm-muted">{formatDate(image.created_at)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {loading && <p className="py-6 text-center text-xs text-adm-muted">Carregando imagens...</p>}

          {!loading && page < pages && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => void load(page + 1)}
                className="rounded border border-adm-accent px-4 py-2.5 text-xs font-semibold text-adm-accent transition hover:bg-adm-accent hover:text-white lg:py-1.5"
              >
                Carregar mais
              </button>
            </div>
          )}
        </div>

        <p className="border-t border-adm-border px-4 py-2 text-[11px] text-adm-muted">
          Imagens &quot;Não usadas&quot; são apagadas automaticamente após 24 horas. Ao escolher uma, salve o
          artigo para mantê-la.
        </p>
      </div>
    </div>
  );
}
