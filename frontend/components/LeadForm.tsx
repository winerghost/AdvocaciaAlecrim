"use client";

import { FormEvent, useState } from "react";
import { PRIVACY_PATH } from "@/lib/constants";

type Status = "idle" | "loading" | "success" | "error";

export default function LeadForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setErrorMsg(null);

    const form = event.currentTarget;
    const data = new FormData(form);

    const payload = {
      name: data.get("name"),
      phone: data.get("phone"),
      email: data.get("email") || null,
      area: data.get("area") || null,
      message: data.get("message") || null,
      consent: data.get("consent") === "on",
      website: data.get("website") || "", // honeypot
    };

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorMsg(
          body?.error === "validation_error"
            ? "Confira os campos obrigatórios e o aceite de uso dos dados."
            : "Não foi possível enviar agora. Tente novamente em instantes."
        );
        setStatus("error");
        return;
      }

      form.reset();
      setStatus("success");
    } catch {
      setErrorMsg("Falha de conexão. Tente novamente.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="bg-ba-steel/[0.22] p-6 text-center text-ba-text shadow-ba-ring-accent">
        <p className="font-semibold">Mensagem enviada!</p>
        <p className="mt-1 text-sm text-ba-text/70">
          Retornamos o contato o quanto antes. Se preferir, fale agora pelo WhatsApp.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Honeypot - mantido fora da view para humanos, bots preenchem */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

      <div className="grid gap-4 sm:grid-cols-2">
        <input
          name="name"
          maxLength={120}
          required
          placeholder="Nome completo"
          className="rounded-[4px] border border-ba-steel/70 bg-ba-steel/[0.16] px-4 py-3 text-base text-ba-text sm:text-sm placeholder:text-ba-text/50 transition-colors duration-300 focus:border-ba-accent focus:outline-none"
        />
        <input
          name="phone"
          maxLength={20}
          required
          placeholder="Telefone / WhatsApp"
          className="rounded-[4px] border border-ba-steel/70 bg-ba-steel/[0.16] px-4 py-3 text-base text-ba-text sm:text-sm placeholder:text-ba-text/50 transition-colors duration-300 focus:border-ba-accent focus:outline-none"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <input
          name="email"
          maxLength={254}
          type="email"
          placeholder="E-mail (opcional)"
          className="rounded-[4px] border border-ba-steel/70 bg-ba-steel/[0.16] px-4 py-3 text-base text-ba-text sm:text-sm placeholder:text-ba-text/50 transition-colors duration-300 focus:border-ba-accent focus:outline-none"
        />
        <select
          name="area"
          defaultValue=""
          className="rounded-[4px] border border-ba-steel/70 bg-ba-steel/[0.16] px-4 py-3 text-base text-ba-text sm:text-sm transition-colors duration-300 focus:border-ba-accent focus:outline-none"
        >
          <option value="" disabled className="text-ba-bg">
            Área de interesse
          </option>
          <option className="text-ba-bg" value="Inventário Judicial">Inventário Judicial</option>
          <option className="text-ba-bg" value="Aposentadoria">Aposentadoria</option>
          <option className="text-ba-bg" value="Ação Trabalhista">Ação Trabalhista</option>
          <option className="text-ba-bg" value="Ação Cível">Ação Cível</option>
          <option className="text-ba-bg" value="Outro">Outro</option>
        </select>
      </div>

      <textarea
        name="message"
        maxLength={2000}
        rows={4}
        placeholder="Conte brevemente o seu caso"
        className="w-full rounded-[4px] border border-ba-steel/70 bg-ba-steel/[0.16] px-4 py-3 text-base text-ba-text sm:text-sm placeholder:text-ba-text/50 transition-colors duration-300 focus:border-ba-accent focus:outline-none"
      />

      <label className="flex items-start gap-2 text-xs text-ba-text/70">
        <input type="checkbox" name="consent" required className="mt-0.5 accent-ba-accent" />
        <span>
          Autorizo o uso dos meus dados para retorno de contato, conforme a LGPD. Leia o{" "}
          {/* Nova aba: não perde o que já foi digitado no formulário. */}
          <a
            href={PRIVACY_PATH}
            target="_blank"
            rel="noopener"
            className="text-ba-text underline underline-offset-2 transition-colors duration-300 hover:text-ba-accent"
          >
            Aviso de Privacidade
          </a>
          .
        </span>
      </label>

      {status === "error" && errorMsg && <p className="text-sm text-red-400">{errorMsg}</p>}

      <button
        type="submit"
        disabled={status === "loading"}
        className="ba-btn ba-btn-primary w-full disabled:opacity-60 sm:w-auto"
      >
        {status === "loading" ? "Enviando..." : "Enviar mensagem"}
      </button>
    </form>
  );
}
