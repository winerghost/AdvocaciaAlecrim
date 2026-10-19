"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { mfaErrorMessage, redirectIfUnauthorized } from "@/lib/adminMfaClient";
import MfaCodeField from "@/components/admin/MfaCodeField";

// Segredo TOTP e códigos de recuperação vivem SÓ em estado React, enquanto a
// tela está aberta: nunca em localStorage, URL ou console. O QR é gerado no
// próprio navegador (biblioteca `qrcode`), então o segredo não passa por
// nenhum serviço externo.

type Mode = "idle" | "setup-password" | "setup-confirm" | "codes" | "disable" | "regen";

type Me = {
  mfa_enabled: boolean;
  recovery_codes_remaining: number | null;
};

type Setup = { secret: string; qr: string };

const INPUT_CLASS =
  "w-full rounded-sm border border-adm-border-strong px-3 py-2 text-sm text-adm-ink focus:border-adm-focus focus:outline-hidden focus:ring-3 focus:ring-adm-accent/25";
const LABEL_CLASS = "mb-1 block text-xs font-semibold text-adm-body";
const PRIMARY_BTN =
  "rounded-sm bg-adm-accent px-5 py-2 text-sm font-semibold text-white transition hover:bg-adm-accent-strong disabled:opacity-60";
const SECONDARY_BTN =
  "rounded-sm border border-adm-border-strong px-5 py-2 text-sm font-semibold text-adm-body transition hover:border-adm-accent disabled:opacity-60";
const ERROR_CLASS =
  "rounded-sm border border-adm-danger-line bg-adm-danger-soft px-3 py-2 text-sm text-adm-danger-ink";

const SINGLE_USE_NOTICE =
  "Cada código vale uma vez; se pedir outro código logo em seguida, aguarde o próximo (30 s) ou use um código de recuperação.";

function errorMessage(status: number, error: unknown): string {
  const mfaMessage = mfaErrorMessage(status, error);
  if (mfaMessage) return mfaMessage;
  switch (error) {
    case "invalid_current_password":
      return "Senha atual incorreta.";
    case "mfa_already_enabled":
      return "A verificação em duas etapas já está ativa.";
    case "mfa_not_setup":
      return "Não há ativação em andamento. Reinicie a ativação.";
    case "mfa_not_enabled":
      return "A verificação em duas etapas não está ativa.";
    default:
      return "Não foi possível concluir agora. Tente novamente.";
  }
}

async function postJson(
  url: string,
  payload: unknown
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: body as Record<string, unknown> };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

export default function SecuritySettings() {
  const [me, setMe] = useState<Me | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [mode, setMode] = useState<Mode>("idle");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Desativar/regenerar: usar código de recuperação em vez do TOTP.
  const [recoveryMode, setRecoveryMode] = useState(false);

  const loadMe = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/me", { cache: "no-store" });
      if (!res.ok) throw new Error("me_failed");
      const data = await res.json();
      setMe({
        mfa_enabled: data?.mfa_enabled === true,
        recovery_codes_remaining:
          typeof data?.recovery_codes_remaining === "number" ? data.recovery_codes_remaining : null,
      });
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial do estado do MFA
    void loadMe();
  }, [loadMe]);

  function reset() {
    setMode("idle");
    setSetup(null);
    setRecoveryCodes([]);
    setCopied(false);
    setErrorMsg(null);
    setNotice(null);
    setRecoveryMode(false);
  }

  // Falha de uma chamada ao Flask: sessão caída volta ao login; estado
  // divergente do servidor é ressincronizado em vez de só mostrar o erro.
  function fail(r: { status: number; body: Record<string, unknown> }) {
    const error = r.body.error;
    if (redirectIfUnauthorized(r.status, error)) return;
    if (error === "mfa_already_enabled") {
      reset();
      void loadMe();
    } else if (error === "mfa_not_setup") {
      setSetup(null);
      setMode("setup-password");
    }
    setErrorMsg(errorMessage(r.status, error));
  }

  async function startSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMsg(null);
    const form = event.currentTarget;
    const currentPassword = String(new FormData(form).get("current_password") || "");

    setBusy(true);
    try {
      const r = await postJson("/api/admin/mfa/setup", { current_password: currentPassword });
      const secret = r.body.secret;
      const uri = r.body.otpauth_uri;
      if (!r.ok || typeof secret !== "string" || typeof uri !== "string") {
        fail(r);
        return;
      }
      // Importa sob demanda: a biblioteca só pesa quando alguém ativa o MFA.
      const QRCode = (await import("qrcode")).default;
      const qr = await QRCode.toDataURL(uri, { errorCorrectionLevel: "M", margin: 1, width: 220 });
      form.reset();
      setSetup({ secret, qr });
      setMode("setup-confirm");
    } catch {
      setErrorMsg("Falha de conexão. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMsg(null);
    const form = event.currentTarget;
    const code = String(new FormData(form).get("code") || "").trim();

    setBusy(true);
    try {
      const r = await postJson("/api/admin/mfa/enable", { code });
      if (!r.ok || !isStringArray(r.body.recovery_codes)) {
        fail(r);
        return;
      }
      setSetup(null);
      setRecoveryCodes(r.body.recovery_codes);
      setMode("codes");
      void loadMe();
    } catch {
      setErrorMsg("Falha de conexão. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function submitWithPasswordAndCode(
    event: FormEvent<HTMLFormElement>,
    url: string,
    onSuccess: (body: Record<string, unknown>) => void
  ) {
    event.preventDefault();
    setErrorMsg(null);
    const form = event.currentTarget;
    const data = new FormData(form);

    setBusy(true);
    try {
      const value = String(data.get("code") || "").trim();
      const r = await postJson(url, {
        current_password: String(data.get("current_password") || ""),
        ...(recoveryMode ? { recovery_code: value } : { code: value }),
      });
      if (!r.ok) {
        fail(r);
        return;
      }
      form.reset();
      onSuccess(r.body);
    } catch {
      setErrorMsg("Falha de conexão. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  function handleDisable(event: FormEvent<HTMLFormElement>) {
    void submitWithPasswordAndCode(event, "/api/admin/mfa/disable", () => {
      reset();
      setNotice(`Verificação em duas etapas desativada. ${SINGLE_USE_NOTICE}`);
      void loadMe();
    });
  }

  function handleRegen(event: FormEvent<HTMLFormElement>) {
    void submitWithPasswordAndCode(event, "/api/admin/mfa/recovery-codes", (body) => {
      if (!isStringArray(body.recovery_codes)) {
        setErrorMsg("Resposta inesperada do servidor.");
        return;
      }
      setRecoveryCodes(body.recovery_codes);
      setMode("codes");
      void loadMe();
    });
  }

  async function copyCodes() {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function downloadCodes() {
    const blob = new Blob(
      [
        "Códigos de recuperação - Advocacia Alecrim (painel admin)\n",
        "Cada código vale uma única vez. Guarde em local seguro.\n\n",
        recoveryCodes.join("\n"),
        "\n",
      ],
      { type: "text/plain;charset=utf-8" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "codigos-de-recuperacao-alecrim.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const errorBox = errorMsg ? (
    <p role="alert" className={ERROR_CLASS}>
      {errorMsg}
    </p>
  ) : null;

  const codeField = (
    <div>
      <label className={LABEL_CLASS} htmlFor="code">
        Código do aplicativo autenticador (6 dígitos)
      </label>
      <input
        id="code"
        name="code"
        type="text"
        inputMode="numeric"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        autoComplete="one-time-code"
        className={INPUT_CLASS}
      />
    </div>
  );

  const passwordField = (
    <div>
      <label className={LABEL_CLASS} htmlFor="current_password">
        Senha atual
      </label>
      <input
        id="current_password"
        name="current_password"
        type="password"
        maxLength={128}
        required
        autoComplete="current-password"
        className={INPUT_CLASS}
      />
    </div>
  );

  function renderBody() {
    if (loadError) {
      return (
        <div className="space-y-3 p-4">
          <p className={ERROR_CLASS}>Não foi possível carregar o estado da verificação.</p>
          <button type="button" onClick={() => void loadMe()} className={SECONDARY_BTN}>
            Tentar de novo
          </button>
        </div>
      );
    }
    if (!me) {
      return <p className="p-4 text-sm text-adm-body">Carregando...</p>;
    }

    if (mode === "codes") {
      return (
        <div className="space-y-4 p-4">
          <p className="rounded-sm border border-adm-border bg-adm-surface px-3 py-2 text-sm text-adm-body">
            Guarde estes códigos em local seguro. Cada um vale uma única vez e serve para entrar se
            você perder o aplicativo. Eles <strong>não serão mostrados de novo</strong>.
          </p>
          <p className="text-sm text-adm-body">{SINGLE_USE_NOTICE}</p>
          <ul
            className="grid grid-cols-2 gap-2 font-mono text-sm text-adm-ink"
            aria-label="Códigos de recuperação"
          >
            {recoveryCodes.map((c) => (
              <li key={c} className="rounded-sm border border-adm-border px-3 py-1.5">
                {c}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void copyCodes()} className={SECONDARY_BTN}>
              Copiar
            </button>
            <button type="button" onClick={downloadCodes} className={SECONDARY_BTN}>
              Baixar .txt
            </button>
            <span role="status" className="text-sm text-adm-success-ink">
              {copied ? "Copiado." : ""}
            </span>
          </div>
          <button type="button" onClick={reset} className={PRIMARY_BTN}>
            Já guardei os códigos
          </button>
        </div>
      );
    }

    if (mode === "setup-password") {
      return (
        <form onSubmit={startSetup} className="space-y-4 p-4">
          <p className="text-sm text-adm-body">Confirme sua senha para começar.</p>
          {passwordField}
          {errorBox}
          <div className="flex gap-3">
            <button type="submit" disabled={busy} className={PRIMARY_BTN}>
              {busy ? "Aguarde..." : "Continuar"}
            </button>
            <button type="button" onClick={reset} disabled={busy} className={SECONDARY_BTN}>
              Cancelar
            </button>
          </div>
        </form>
      );
    }

    if (mode === "setup-confirm" && setup) {
      return (
        <form onSubmit={confirmSetup} className="space-y-4 p-4">
          <p className="text-sm text-adm-body">
            1. No aplicativo autenticador (Google Authenticator, Authy, 1Password etc.), escaneie o
            QR code ou digite a chave manualmente.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL gerada no navegador */}
          <img
            src={setup.qr}
            alt="QR code para configurar o aplicativo autenticador"
            width={220}
            height={220}
            className="rounded-sm border border-adm-border"
          />
          <p className="text-sm text-adm-body">
            Chave para digitação manual:{" "}
            <code className="break-all rounded-sm bg-adm-surface px-1.5 py-0.5 font-mono text-adm-ink">
              {setup.secret}
            </code>
          </p>
          <p className="text-sm text-adm-body">
            2. Digite o código de 6 dígitos que o aplicativo mostra para confirmar.
          </p>
          {codeField}
          {errorBox}
          <div className="flex gap-3">
            <button type="submit" disabled={busy} className={PRIMARY_BTN}>
              {busy ? "Verificando..." : "Ativar"}
            </button>
            <button type="button" onClick={reset} disabled={busy} className={SECONDARY_BTN}>
              Cancelar
            </button>
          </div>
        </form>
      );
    }

    if (mode === "disable" || mode === "regen") {
      const disabling = mode === "disable";
      return (
        <form onSubmit={disabling ? handleDisable : handleRegen} className="space-y-4 p-4">
          <p className="text-sm text-adm-body">
            {disabling
              ? "Para desativar, confirme sua senha e um código do aplicativo (ou de recuperação)."
              : "Os códigos atuais deixam de valer. Confirme sua senha e um código do aplicativo (ou de recuperação)."}
          </p>
          {passwordField}
          <MfaCodeField id="code" onModeChange={setRecoveryMode} />
          {errorBox}
          <div className="flex gap-3">
            <button type="submit" disabled={busy} className={PRIMARY_BTN}>
              {busy ? "Aguarde..." : disabling ? "Desativar verificação" : "Gerar novos códigos"}
            </button>
            <button type="button" onClick={reset} disabled={busy} className={SECONDARY_BTN}>
              Cancelar
            </button>
          </div>
        </form>
      );
    }

    // mode === "idle"
    return (
      <div className="space-y-4 p-4">
        <p className="text-sm text-adm-body" role="status">
          Verificação em duas etapas:{" "}
          <strong className={me.mfa_enabled ? "text-adm-success-ink" : "text-adm-ink"}>
            {me.mfa_enabled ? "ativa" : "desativada"}
          </strong>
          {me.mfa_enabled && me.recovery_codes_remaining !== null
            ? ` · ${me.recovery_codes_remaining} código(s) de recuperação restante(s)`
            : ""}
        </p>
        <p className="text-sm text-adm-body">
          {me.mfa_enabled
            ? "Ao entrar, além da senha será pedido um código do aplicativo autenticador."
            : "Adicione uma segunda etapa ao login com um aplicativo autenticador (TOTP)."}
        </p>
        {errorBox}
        {notice && (
          <p
            role="status"
            className="rounded-sm border border-adm-border bg-adm-surface px-3 py-2 text-sm text-adm-body"
          >
            {notice}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          {me.mfa_enabled ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setRecoveryMode(false);
                  setErrorMsg(null);
                  setNotice(null);
                  setMode("regen");
                }}
                className={SECONDARY_BTN}
              >
                Gerar novos códigos de recuperação
              </button>
              <button
                type="button"
                onClick={() => {
                  setRecoveryMode(false);
                  setErrorMsg(null);
                  setNotice(null);
                  setMode("disable");
                }}
                className={SECONDARY_BTN}
              >
                Desativar
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setMode("setup-password")} className={PRIMARY_BTN}>
              Ativar verificação em duas etapas
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md space-y-6">
      <div className="rounded-sm border border-adm-border bg-white shadow-xs">
        <div className="border-b border-adm-border px-4 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-adm-ink">
            Verificação em duas etapas
          </h2>
        </div>
        {renderBody()}
      </div>
    </div>
  );
}
