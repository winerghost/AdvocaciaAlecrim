"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { mfaErrorMessage, redirectIfUnauthorized } from "@/lib/adminMfaClient";
import { fieldErrorMessage } from "@/lib/adminSettingsClient";
import { formatDateTime } from "@/lib/adminFormat";
import { type Avatar, parseAvatar } from "@/lib/adminAvatar";
import AvatarSettings from "@/components/admin/AvatarSettings";
import {
  ERROR_BOX,
  FieldError,
  HINT_CLASS,
  INPUT_CLASS,
  INPUT_ERROR_CLASS,
  LABEL_CLASS,
  LoadingOrError,
  PRIMARY_BTN,
  ReauthFields,
  SettingsCard,
  SUCCESS_BOX,
} from "@/components/admin/settingsUi";

type Me = {
  id: number;
  email: string;
  name: string;
  mfa_enabled: boolean;
  recovery_codes_remaining: number | null;
  created_at: string | null;
  last_login_at: string | null;
  password_changed_at: string | null;
  avatar: Avatar;
  avatar_presets: string[];
};

type Message = { kind: "ok" | "error"; text: string } | null;

const LOW_RECOVERY_CODES = 2;

export default function ProfileSettings() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "error" | "ready">("loading");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [mfaRequired, setMfaRequired] = useState(false);
  const [reauthKey, setReauthKey] = useState(0);

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const res = await fetch("/api/admin/me", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (redirectIfUnauthorized(res.status, body?.error)) return;
      if (!res.ok || typeof body?.email !== "string") {
        setLoadState("error");
        return;
      }
      setMe({
        ...(body as Me),
        avatar: parseAvatar(body.avatar),
        avatar_presets: Array.isArray(body.avatar_presets)
          ? body.avatar_presets.filter((id: unknown): id is string => typeof id === "string")
          : [],
      });
      setName(body.name ?? "");
      setEmail(body.email);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial da conta
    void load();
  }, [load]);

  if (loadState !== "ready" || !me) {
    return (
      <div className="max-w-2xl">
        <LoadingOrError status={loadState === "ready" ? "loading" : loadState} onRetry={load} />
      </div>
    );
  }

  const emailChanged = email.trim().toLowerCase() !== me.email;
  const lowCodes =
    me.mfa_enabled &&
    typeof me.recovery_codes_remaining === "number" &&
    me.recovery_codes_remaining <= LOW_RECOVERY_CODES;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!me) return;
    setMessage(null);
    setFieldErrors({});

    const payload: Record<string, string> = {};
    if (name.trim() !== me.name) payload.name = name;
    if (emailChanged) {
      const data = new FormData(event.currentTarget);
      payload.email = email;
      payload.current_password = String(data.get("current_password") ?? "");
      const code = String(data.get("code") ?? "").trim();
      if (code) payload.code = code;
    }
    if (Object.keys(payload).length === 0) {
      setMessage({ kind: "error", text: "Nenhuma alteração para salvar." });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (redirectIfUnauthorized(res.status, body?.error)) return;
      if (res.ok && body?.data) {
        setMe({ ...me, name: body.data.name, email: body.data.email });
        setName(body.data.name);
        setEmail(body.data.email);
        setMfaRequired(false);
        setReauthKey((k) => k + 1);
        setMessage({ kind: "ok", text: "Perfil atualizado." });
        router.refresh(); // nome/e-mail do topo do painel
        return;
      }
      const error = body?.error;
      if (error === "mfa_code_required") setMfaRequired(true);
      if (body?.details && typeof body.details === "object") setFieldErrors(body.details);
      setMessage({
        kind: "error",
        text:
          mfaErrorMessage(res.status, error) ??
          (error === "invalid_current_password"
            ? "Senha atual incorreta."
            : error === "email_taken"
              ? "Esse e-mail já é usado por outro administrador."
              : error === "validation_error"
                ? "Revise os campos destacados."
                : error === "no_changes"
                  ? "Nenhuma alteração para salvar."
                  : "Não foi possível salvar agora. Tente novamente."),
      });
    } catch {
      setMessage({ kind: "error", text: "Falha de conexão. Tente novamente." });
    } finally {
      setSaving(false);
    }
  }

  const nameError = fieldErrorMessage(fieldErrors.name);
  const emailError = fieldErrorMessage(fieldErrors.email);

  return (
    <div className="max-w-2xl space-y-6">
      {lowCodes && (
        <p role="alert" className={ERROR_BOX}>
          Restam só {me.recovery_codes_remaining} código(s) de recuperação.{" "}
          <Link href="/admin/seguranca" className="font-semibold underline">
            Gere novos códigos em Segurança
          </Link>{" "}
          antes que acabem.
        </p>
      )}

      <AvatarSettings
        avatar={me.avatar}
        presets={me.avatar_presets}
        name={me.name}
        email={me.email}
        onChange={(avatar) => setMe({ ...me, avatar })}
      />

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        <SettingsCard title="Seus dados" description="O e-mail é o que você usa para entrar no painel.">
          <div>
            <label className={LABEL_CLASS} htmlFor="profile_name">
              Nome
            </label>
            <input
              id="profile_name"
              type="text"
              maxLength={120}
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? "profile_name-error" : undefined}
              className={`${INPUT_CLASS} ${nameError ? INPUT_ERROR_CLASS : ""}`}
            />
            <FieldError id="profile_name-error" message={nameError} />
          </div>
          <div>
            <label className={LABEL_CLASS} htmlFor="profile_email">
              E-mail de acesso
            </label>
            <input
              id="profile_email"
              type="email"
              maxLength={254}
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={emailError ? true : undefined}
              aria-describedby={`profile_email-hint${emailError ? " profile_email-error" : ""}`}
              className={`${INPUT_CLASS} ${emailError ? INPUT_ERROR_CLASS : ""}`}
            />
            <p id="profile_email-hint" className={HINT_CLASS}>
              Trocar o e-mail pede sua senha{me.mfa_enabled ? " e o código do autenticador" : ""}.
            </p>
            <FieldError id="profile_email-error" message={emailError} />
          </div>
        </SettingsCard>

        {emailChanged && <ReauthFields key={reauthKey} mfaEnabled={me.mfa_enabled || mfaRequired} />}

        {message && (
          <p role={message.kind === "ok" ? "status" : "alert"} className={message.kind === "ok" ? SUCCESS_BOX : ERROR_BOX}>
            {message.text}
          </p>
        )}

        <button type="submit" disabled={saving} className={PRIMARY_BTN}>
          {saving ? "Salvando..." : "Salvar perfil"}
        </button>
      </form>

      <SettingsCard title="Resumo da conta">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold text-adm-muted">Verificação em duas etapas</dt>
            <dd className="text-adm-ink">
              {me.mfa_enabled ? (
                "Ativa"
              ) : (
                <>
                  Desativada ·{" "}
                  <Link href="/admin/seguranca" className="font-semibold text-adm-accent underline">
                    ativar
                  </Link>
                </>
              )}
            </dd>
          </div>
          {me.mfa_enabled && (
            <div>
              <dt className="text-xs font-semibold text-adm-muted">Códigos de recuperação restantes</dt>
              <dd className="text-adm-ink">{me.recovery_codes_remaining ?? "-"}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs font-semibold text-adm-muted">Último login</dt>
            <dd className="text-adm-ink">{formatDateTime(me.last_login_at) ?? "Sem registro"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-adm-muted">Senha alterada em</dt>
            <dd className="text-adm-ink">{formatDateTime(me.password_changed_at) ?? "Sem registro"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-adm-muted">Conta criada em</dt>
            <dd className="text-adm-ink">{formatDateTime(me.created_at) ?? "-"}</dd>
          </div>
        </dl>
        <p className={HINT_CLASS}>
          Veja todos os acessos em{" "}
          <Link href="/admin/atividade" className="font-semibold text-adm-accent underline">
            Atividade
          </Link>
          .
        </p>
      </SettingsCard>
    </div>
  );
}
