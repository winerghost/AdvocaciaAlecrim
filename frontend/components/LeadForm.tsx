"use client";

import { FormEvent, useState } from "react";

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
      <div className="rounded-lg border border-gold/40 bg-white/5 p-6 text-center text-slate-bg">
        <p className="font-semibold">Mensagem enviada!</p>
        <p className="mt-1 text-sm text-slate-bg/80">
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
          required
          placeholder="Nome completo"
          className="rounded-md border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/50 focus:border-gold focus:outline-none"
        />
        <input
          name="phone"
          required
          placeholder="Telefone / WhatsApp"
          className="rounded-md border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/50 focus:border-gold focus:outline-none"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <input
          name="email"
          type="email"
          placeholder="E-mail (opcional)"
          className="rounded-md border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/50 focus:border-gold focus:outline-none"
        />
        <select
          name="area"
          defaultValue=""
          className="rounded-md border border-white/15 bg-white/5 px-4 py-3 text-sm text-white focus:border-gold focus:outline-none"
        >
          <option value="" disabled className="text-navy">
            Área de interesse
          </option>
          <option className="text-navy" value="Inventário Judicial">Inventário Judicial</option>
          <option className="text-navy" value="Aposentadoria">Aposentadoria</option>
          <option className="text-navy" value="Ação Trabalhista">Ação Trabalhista</option>
          <option className="text-navy" value="Ação Cível">Ação Cível</option>
          <option className="text-navy" value="Outro">Outro</option>
        </select>
      </div>

      <textarea
        name="message"
        rows={4}
        placeholder="Conte brevemente o seu caso"
        className="w-full rounded-md border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/50 focus:border-gold focus:outline-none"
      />

      <label className="flex items-start gap-2 text-xs text-white/70">
        <input type="checkbox" name="consent" required className="mt-0.5" />
        Autorizo o uso dos meus dados para retorno de contato, conforme a LGPD.
      </label>

      {status === "error" && errorMsg && <p className="text-sm text-red-400">{errorMsg}</p>}

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full rounded-md bg-gold px-6 py-3 text-sm font-semibold text-navy transition hover:bg-gold-dark disabled:opacity-60 sm:w-auto"
      >
        {status === "loading" ? "Enviando..." : "Enviar mensagem"}
      </button>
    </form>
  );
}
