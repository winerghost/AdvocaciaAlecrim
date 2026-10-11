// Upload de imagem do painel (capa do artigo e imagens dentro do texto).
// Roda no navegador e fala só com o route handler do Next
// (app/api/admin/uploads/route.ts), que anexa o token e repassa ao Flask.

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const IMAGE_ACCEPT_ATTR = ACCEPTED_IMAGE_TYPES.join(",");

export const UPLOAD_ERRORS: Record<string, string> = {
  invalid_image: "Arquivo inválido. Envie uma imagem JPEG, PNG, WebP ou GIF.",
  file_too_large: "A imagem passa do limite de 5 MB.",
  unauthorized: "Sua sessão expirou. Entre novamente para continuar.",
  too_many_requests: "Muitas tentativas. Aguarde e tente novamente.",
};

export type UploadResult =
  | { ok: true; url: string }
  | { ok: false; message: string; unauthorized: boolean };

export async function uploadAdminImage(file: File): Promise<UploadResult> {
  // Checagem local só pra dar resposta imediata; o backend valida de novo.
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return { ok: false, message: UPLOAD_ERRORS.invalid_image, unauthorized: false };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, message: UPLOAD_ERRORS.file_too_large, unauthorized: false };
  }

  const body = new FormData();
  body.append("file", file, file.name);

  try {
    const res = await fetch("/api/admin/uploads", { method: "POST", body });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const unauthorized = res.status === 401;
      const code = unauthorized
        ? "unauthorized"
        : res.status === 413
          ? "file_too_large"
          : String(data?.error ?? "");
      return {
        ok: false,
        message: UPLOAD_ERRORS[code] ?? "Não foi possível enviar a imagem.",
        unauthorized,
      };
    }

    const url = data?.data?.url ?? data?.url;
    if (typeof url !== "string" || !url) {
      return { ok: false, message: "Não foi possível enviar a imagem.", unauthorized: false };
    }
    return { ok: true, url };
  } catch {
    return { ok: false, message: "Falha de conexão ao enviar a imagem.", unauthorized: false };
  }
}

// ---- Galeria: imagens já enviadas ----

export type UploadedImage = {
  url: string;
  filename: string;
  size: number;
  created_at: string;
  in_use: boolean;
  used_in: Array<{ id: number; title: string; as: "cover" | "content" }>;
  /** Só nas imagens sem uso: quando a limpeza automática pode apagá-la. */
  purge_after?: string;
};

export type UploadListResult =
  | { ok: true; items: UploadedImage[]; page: number; pages: number; total: number }
  | { ok: false; message: string; unauthorized: boolean };

const MEDIA_URL = /^\/api\/media\/[a-f0-9]{32}\.(jpg|png|webp|gif)$/;

export async function listAdminUploads(page = 1): Promise<UploadListResult> {
  try {
    const res = await fetch(`/api/admin/uploads?page=${page}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const unauthorized = res.status === 401;
      return {
        ok: false,
        message: unauthorized ? UPLOAD_ERRORS.unauthorized : "Não foi possível carregar as imagens.",
        unauthorized,
      };
    }

    const rows: unknown[] = Array.isArray(data?.data) ? data.data : [];
    // Descarta qualquer item fora do formato esperado: a URL vai para um
    // <img src> e para o campo de capa.
    const items = rows.filter(
      (row): row is UploadedImage =>
        !!row && typeof row === "object" && MEDIA_URL.test(String((row as UploadedImage).url))
    );
    return {
      ok: true,
      items,
      page: Number(data?.meta?.page) || page,
      pages: Number(data?.meta?.pages) || 1,
      total: Number(data?.meta?.total) || items.length,
    };
  } catch {
    return { ok: false, message: "Falha de conexão ao carregar as imagens.", unauthorized: false };
  }
}
