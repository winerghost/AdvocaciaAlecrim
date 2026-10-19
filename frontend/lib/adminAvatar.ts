// Foto/avatar do admin (Configurações > Perfil). Só fala com os route
// handlers do Next e traduz as respostas: formato, tamanho, dimensões e a
// lista de avatares padrão são regras do Flask (app/services/avatar.py).

export type Avatar = { type: "photo"; url: string } | { type: "preset"; preset: string } | null;

export type AvatarResult =
  | { ok: true; avatar: Avatar }
  | { ok: false; message: string; unauthorized: boolean };

// Só decide o que é seguro pôr num <img src>: um caminho da própria rota de
// avatares. Não é validação do arquivo (isso é do backend).
const PHOTO_URL = /^\/api\/admin\/avatars\/[a-f0-9]{32}\.webp$/;

export function parseAvatar(value: unknown): Avatar {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (item.type === "photo" && typeof item.url === "string" && PHOTO_URL.test(item.url)) {
    return { type: "photo", url: item.url };
  }
  if (item.type === "preset" && typeof item.preset === "string") {
    return { type: "preset", preset: item.preset };
  }
  return null;
}

const ERRORS: Record<string, string> = {
  invalid_image: "Não foi possível usar esse arquivo. Envie uma foto em JPEG, PNG ou WebP.",
  file_too_large: "O arquivo é grande demais. Envie uma foto menor.",
  image_too_small: "A foto é pequena demais. Use uma imagem com pelo menos 64 × 64 px.",
  image_too_large_dimensions: "A foto tem resolução alta demais. Reduza o tamanho e tente de novo.",
  invalid_preset: "Esse avatar não está disponível.",
  storage_error: "Não foi possível salvar a foto agora. Tente novamente.",
  too_many_requests: "Muitas alterações seguidas. Aguarde um pouco e tente de novo.",
  forbidden: "Ação bloqueada. Recarregue a página e tente de novo.",
  unauthorized: "Sua sessão expirou. Entre novamente para continuar.",
};

async function send(url: string, init: RequestInit): Promise<AvatarResult> {
  try {
    const res = await fetch(url, init);
    const body = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, avatar: parseAvatar(body?.data?.avatar) };
    const code =
      res.status === 401 ? "unauthorized" : res.status === 429 ? "too_many_requests" : String(body?.error ?? "");
    return {
      ok: false,
      message: ERRORS[code] ?? "Não foi possível atualizar a foto agora. Tente novamente.",
      unauthorized: res.status === 401,
    };
  } catch {
    return { ok: false, message: "Falha de conexão. Tente novamente.", unauthorized: false };
  }
}

export function uploadAvatar(file: File): Promise<AvatarResult> {
  const body = new FormData();
  body.append("file", file, file.name);
  return send("/api/admin/me/avatar", { method: "POST", body });
}

export function chooseAvatarPreset(preset: string): Promise<AvatarResult> {
  return send("/api/admin/me/avatar/preset", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ preset }),
  });
}

export function removeAvatar(): Promise<AvatarResult> {
  return send("/api/admin/me/avatar", { method: "DELETE" });
}
