"use client";

import { useState } from "react";
import type { Avatar } from "@/lib/adminAvatar";
import { AVATAR_PRESET_ART, PresetArt } from "@/components/admin/avatarPresets";

const SIZES = {
  sm: "h-8 w-8 text-xs",
  md: "h-12 w-12 text-sm",
  lg: "h-24 w-24 text-2xl",
};

function initials(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name || "").trim() || (email || "").split("@")[0] || "";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : source.slice(0, 2);
  return letters.toUpperCase() || "?";
}

type Props = {
  avatar: Avatar;
  name?: string | null;
  email?: string | null;
  size?: keyof typeof SIZES;
  /** Texto alternativo. Vazio = decorativo (o nome já aparece ao lado). */
  alt?: string;
};

// Mostra a foto, o avatar padrão ou, sem nenhum dos dois, as iniciais.
export default function AdminAvatar({ avatar, name, email, size = "md", alt = "" }: Props) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const box = `${SIZES[size]} inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full`;
  const a11y = alt ? { role: "img", "aria-label": alt } : { "aria-hidden": true };

  if (avatar?.type === "photo" && failedUrl !== avatar.url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- imagem que exige login (cookie); o otimizador do Next não tem o cookie
      <img
        src={avatar.url}
        alt={alt}
        aria-hidden={alt ? undefined : true}
        className={`${box} object-cover`}
        onError={() => setFailedUrl(avatar.url)}
      />
    );
  }

  if (avatar?.type === "preset" && AVATAR_PRESET_ART[avatar.preset]) {
    return (
      <span className={box} {...a11y}>
        <PresetArt id={avatar.preset} className="h-full w-full" />
      </span>
    );
  }

  return (
    <span className={`${box} bg-adm-accent font-semibold text-white`} {...a11y}>
      {initials(name, email)}
    </span>
  );
}
