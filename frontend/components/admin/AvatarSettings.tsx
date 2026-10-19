"use client";

import { ChangeEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AdminAvatar from "@/components/admin/AdminAvatar";
import { AVATAR_PRESET_ART, PresetArt } from "@/components/admin/avatarPresets";
import { type Avatar, type AvatarResult, chooseAvatarPreset, removeAvatar, uploadAvatar } from "@/lib/adminAvatar";
import { ERROR_BOX, HINT_CLASS, SECONDARY_BTN, SettingsCard, SUCCESS_BOX } from "@/components/admin/settingsUi";

type Props = {
  avatar: Avatar;
  presets: string[];
  name: string;
  email: string;
  onChange: (avatar: Avatar) => void;
};

type Message = { kind: "ok" | "error"; text: string } | null;

// Só monta a tela e envia: tipo, tamanho, dimensões e lista de avatares são
// decididos pelo Flask, e a mensagem de erro vem da resposta dele.
export default function AvatarSettings({ avatar, presets, name, email, onChange }: Props) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "preset" | "remove" | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const available = presets.filter((id) => AVATAR_PRESET_ART[id]);

  async function apply(kind: "upload" | "preset" | "remove", action: () => Promise<AvatarResult>, okText: string) {
    setBusy(kind);
    setMessage(null);
    const result = await action();
    setBusy(null);
    if (result.ok) {
      onChange(result.avatar);
      setMessage({ kind: "ok", text: okText });
      router.refresh(); // atualiza o avatar do topo do painel
      return true;
    }
    if (result.unauthorized) {
      window.location.assign("/login");
      return false;
    }
    setMessage({ kind: "error", text: result.message });
    return false;
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // permite escolher o mesmo arquivo de novo
    if (file) await apply("upload", () => uploadAvatar(file), "Foto atualizada.");
  }

  async function handleRemove() {
    const done = await apply("remove", removeAvatar, avatar?.type === "photo" ? "Foto removida." : "Avatar removido.");
    if (done) fileInput.current?.focus();
  }

  const selectedPreset = avatar?.type === "preset" ? avatar.preset : null;

  return (
    <SettingsCard
      title="Foto do perfil"
      description="Aparece no topo do painel. Envie uma foto ou escolha um dos avatares padrão."
    >
      <div className="flex flex-wrap items-center gap-5" aria-busy={busy !== null}>
        <AdminAvatar avatar={avatar} name={name} email={email} size="lg" alt="Sua foto de perfil" />
        <div className="space-y-2">
          <div className="flex flex-wrap gap-3">
            <label className={`${SECONDARY_BTN} cursor-pointer focus-within:ring-2 focus-within:ring-adm-accent/40`}>
              {busy === "upload" ? "Enviando..." : avatar?.type === "photo" ? "Trocar foto" : "Enviar foto"}
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFile}
                disabled={busy !== null}
                className="sr-only"
              />
            </label>
            {avatar && (
              <button type="button" onClick={handleRemove} disabled={busy !== null} className={SECONDARY_BTN}>
                {busy === "remove" ? "Removendo..." : avatar.type === "photo" ? "Remover foto" : "Remover avatar"}
              </button>
            )}
          </div>
          <p className={HINT_CLASS}>JPEG, PNG ou WebP. A foto é recortada em quadrado.</p>
        </div>
      </div>

      {available.length > 0 && (
        <fieldset disabled={busy !== null}>
          <legend className="mb-2 text-sm font-semibold text-adm-ink">Avatares padrão</legend>
          <div className="flex flex-wrap gap-3">
            {available.map((id) => {
              const label = AVATAR_PRESET_ART[id].label;
              const checked = selectedPreset === id;
              return (
                <label key={id} className="cursor-pointer" title={label}>
                  <input
                    type="radio"
                    name="avatar_preset"
                    value={id}
                    checked={checked}
                    onChange={() => apply("preset", () => chooseAvatarPreset(id), `Avatar "${label}" escolhido.`)}
                    className="peer sr-only"
                  />
                  <span className="sr-only">{label}</span>
                  <span
                    className={`block h-12 w-12 rounded-full ring-offset-2 ring-offset-adm-surface transition peer-focus-visible:ring-2 peer-focus-visible:ring-adm-accent ${
                      checked ? "ring-2 ring-adm-accent" : "opacity-80 hover:opacity-100"
                    }`}
                  >
                    <PresetArt id={id} className="h-full w-full" />
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {message && (
        <p role={message.kind === "ok" ? "status" : "alert"} className={message.kind === "ok" ? SUCCESS_BOX : ERROR_BOX}>
          {message.text}
        </p>
      )}
    </SettingsCard>
  );
}
