"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Status = "idle" | "loading" | "error";

export default function LoginForm() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");

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

      router.push("/admin");
      router.refresh();
    } catch {
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-white/70" htmlFor="email">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          className="w-full rounded-md border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/50 focus:border-gold focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-white/70" htmlFor="password">
          Senha
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-md border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/50 focus:border-gold focus:outline-none"
        />
      </div>

      {status === "error" && <p className="text-sm text-red-400">E-mail ou senha inválidos.</p>}

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full rounded-md bg-gold px-6 py-3 text-sm font-semibold text-navy transition hover:bg-gold-dark disabled:opacity-60"
      >
        {status === "loading" ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
