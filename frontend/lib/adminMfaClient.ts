"use client";

import { useEffect, useState } from "react";

// Apoio do lado do navegador para telas do painel que exigem o 2º fator
// (criar/excluir admin, trocar senha, gerenciar o MFA).

/**
 * Se o admin logado tem MFA ativo (GET /api/admin/me). `null` enquanto carrega
 * ou se a consulta falhar - nesse caso o formulário segue sem o campo e o
 * Flask responde `mfa_code_required`, que `markRequired` trata.
 */
export function useMfaEnabled(): {
  mfaEnabled: boolean | null;
  markRequired: () => void;
} {
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/me", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setMfaEnabled(data.mfa_enabled === true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return { mfaEnabled, markRequired: () => setMfaEnabled(true) };
}

/**
 * Sessão expirada/inválida (401 `unauthorized`): volta para o login. Devolve
 * true se redirecionou, para o chamador parar o fluxo.
 */
export function redirectIfUnauthorized(status: number, error: unknown): boolean {
  if (status === 401 && error === "unauthorized") {
    window.location.assign("/login");
    return true;
  }
  return false;
}

/** Mensagem para os erros de 2º fator em ações protegidas; null se não for um. */
export function mfaErrorMessage(status: number, error: unknown): string | null {
  if (status === 429 || error === "rate_limited") {
    return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  }
  if (error === "mfa_code_required") {
    return "Informe o código do autenticador (ou um código de recuperação).";
  }
  if (error === "invalid_code") {
    return "Código inválido ou expirado. Cada código vale uma vez: se acabou de usar este, aguarde o próximo (30 s) ou use um código de recuperação.";
  }
  return null;
}
