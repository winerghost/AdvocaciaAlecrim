"use client";

import { useState } from "react";
import { redirectIfUnauthorized } from "@/lib/adminMfaClient";
import { ERROR_BOX, SECONDARY_BTN, SettingsCard, SUCCESS_BOX } from "@/components/admin/settingsUi";

// "Sair de outros dispositivos": derruba todas as sessões e mantém só esta
// (o proxy grava no cookie o token novo que o Flask devolve).
export default function SessionsCard() {
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [confirming, setConfirming] = useState(false);

  async function revoke() {
    setStatus("loading");
    try {
      const res = await fetch("/api/admin/sessions/revoke-others", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const body = await res.json().catch(() => ({}));
      if (redirectIfUnauthorized(res.status, body?.error)) return;
      setStatus(res.ok ? "ok" : "error");
    } catch {
      setStatus("error");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="max-w-md">
      <SettingsCard
        title="Sessões"
        description="Encerra o acesso em qualquer outro computador ou celular onde você entrou no painel. Esta sessão continua aberta."
      >
        {status === "ok" && (
          <p role="status" className={SUCCESS_BOX}>
            Pronto. As outras sessões foram encerradas.
          </p>
        )}
        {status === "error" && (
          <p role="alert" className={ERROR_BOX}>
            Não foi possível encerrar as sessões agora. Tente novamente.
          </p>
        )}
        {confirming ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-adm-body">Encerrar todas as outras sessões?</span>
            <button type="button" onClick={revoke} disabled={status === "loading"} className={SECONDARY_BTN}>
              {status === "loading" ? "Encerrando..." : "Sim, encerrar"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-sm font-medium text-adm-muted hover:text-adm-ink"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setStatus("idle");
              setConfirming(true);
            }}
            className={SECONDARY_BTN}
          >
            Sair de outros dispositivos
          </button>
        )}
      </SettingsCard>
    </div>
  );
}
