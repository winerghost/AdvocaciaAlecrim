"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Status = "idle" | "loading" | "error";
type Step = "credentials" | "mfa";

const INPUT_CLASS =
  "w-full rounded-sm border border-adm-border-strong bg-white px-3 py-2.5 text-sm text-adm-ink placeholder:text-adm-faint focus:border-adm-focus focus:outline-hidden focus:ring-3 focus:ring-adm-accent/25";

export default function LoginForm() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [step, setStep] = useState<Step>("credentials");
  const [useRecovery, setUseRecovery] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const mfaInputRef = useRef<HTMLInputElement>(null);

  // Ao entrar no 2º passo (ou trocar código <-> recuperação) leva o foco ao
  // campo, para quem usa teclado/leitor de tela seguir direto.
  useEffect(() => {
    if (step === "mfa") mfaInputRef.current?.focus();
  }, [step, useRecovery]);

  function backToCredentials(message: string | null = null) {
    setStep("credentials");
    setUseRecovery(false);
    setErrorMsg(message);
    setStatus(message ? "error" : "idle");
  }

  async function handleMfaSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setErrorMsg(null);

    const data = new FormData(event.currentTarget);
    const value = String(data.get("mfa_value") || "").trim();
    // O mfa_token não passa por aqui: está num cookie httpOnly que só o
    // servidor Next lê (app/api/admin/login/mfa/route.ts).
    const payload = useRecovery ? { recovery_code: value } : { code: value };

    try {
      const res = await fetch("/api/admin/login/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        router.push("/admin");
        router.refresh();
        return;
      }

      const body = await res.json().catch(() => ({}));
      if (res.status === 401 && body?.error === "invalid_mfa_token") {
        // O passo expirou (5 min) ou o token foi invalidado: recomeça.
        backToCredentials("A verificação expirou. Entre novamente com e-mail e senha.");
        return;
      }
      if (res.status === 429) {
        setErrorMsg("Muitas tentativas. Aguarde alguns minutos e tente novamente.");
      } else if (res.status === 400 || res.status === 401) {
        setErrorMsg("Código inválido ou expirado.");
      } else {
        // 403 (bloqueio cross-site), 502 (backend fora), 5xx etc.
        setErrorMsg("Não foi possível verificar agora. Tente novamente.");
      }
      setStatus("error");
    } catch {
      setErrorMsg("Falha de conexão. Tente novamente.");
      setStatus("error");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setErrorMsg(null);

    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      email: data.get("email"),
      password: data.get("password"),
    };

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        // Mensagem sempre genérica - nunca revela se o e-mail existe, se
        // foi rate-limitado etc.
        setStatus("error");
        return;
      }

      const body = await res.json().catch(() => ({}));
      if (body?.mfa_required === true) {
        // Senha ok, falta o 2º fator. A senha sai do formulário agora.
        form.reset();
        setStep("mfa");
        setStatus("idle");
        return;
      }

      router.push("/admin");
      router.refresh();
    } catch {
      setStatus("error");
    }
  }

  if (step === "mfa") {
    return (
      <form onSubmit={handleMfaSubmit} className="space-y-4">
        <p className="text-sm text-adm-body">
          {useRecovery
            ? "Digite um dos códigos de recuperação que você guardou."
            : "Digite o código de 6 dígitos do seu aplicativo autenticador."}
        </p>

        <div>
          <label className="sr-only" htmlFor="mfa_value">
            {useRecovery ? "Código de recuperação" : "Código de verificação"}
          </label>
          {useRecovery ? (
            <input
              key="recovery"
              ref={mfaInputRef}
              id="mfa_value"
              name="mfa_value"
              type="text"
              required
              maxLength={64}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Código de recuperação"
              className={INPUT_CLASS}
            />
          ) : (
            <input
              key="code"
              ref={mfaInputRef}
              id="mfa_value"
              name="mfa_value"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              required
              maxLength={6}
              autoComplete="one-time-code"
              placeholder="000000"
              className={`${INPUT_CLASS} tracking-widest`}
            />
          )}
        </div>

        {status === "error" && errorMsg && (
          <p
            role="alert"
            className="rounded-sm border border-adm-danger-line bg-adm-danger-soft px-3 py-2 text-sm text-adm-danger-ink"
          >
            {errorMsg}
          </p>
        )}

        <button
          type="submit"
          disabled={status === "loading"}
          className="w-full rounded-sm bg-adm-accent px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-adm-accent-strong disabled:opacity-60"
        >
          {status === "loading" ? "Verificando..." : "Verificar"}
        </button>

        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => backToCredentials()}
            className="font-medium text-adm-body underline-offset-2 hover:underline"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={() => {
              setUseRecovery((v) => !v);
              setErrorMsg(null);
              setStatus("idle");
            }}
            className="font-medium text-adm-accent underline-offset-2 hover:underline"
          >
            {useRecovery ? "Usar código do aplicativo" : "Usar código de recuperação"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="sr-only" htmlFor="email">
          E-mail
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-adm-faint">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </span>
          <input
            id="email"
            maxLength={255}
            name="email"
            type="email"
            required
            autoComplete="username"
            placeholder="E-mail"
            className="w-full rounded-sm border border-adm-border-strong bg-white py-2.5 pl-9 pr-3 text-sm text-adm-ink placeholder:text-adm-faint focus:border-adm-focus focus:outline-hidden focus:ring-3 focus:ring-adm-accent/25"
          />
        </div>
      </div>

      <div>
        <label className="sr-only" htmlFor="password">
          Senha
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-adm-faint">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </span>
          <input
            id="password"
            maxLength={128}
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="Senha"
            className="w-full rounded-sm border border-adm-border-strong bg-white py-2.5 pl-9 pr-3 text-sm text-adm-ink placeholder:text-adm-faint focus:border-adm-focus focus:outline-hidden focus:ring-3 focus:ring-adm-accent/25"
          />
        </div>
      </div>

      {status === "error" && (
        <p
          role="alert"
          className="rounded-sm border border-adm-danger-line bg-adm-danger-soft px-3 py-2 text-sm text-adm-danger-ink"
        >
          {errorMsg ?? "E-mail ou senha inválidos."}
        </p>
      )}

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full rounded-sm bg-adm-accent px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-adm-accent-strong disabled:opacity-60"
      >
        {status === "loading" ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
