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
        <label className="sr-only" htmlFor="email">
          E-mail
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[#adb5bd]">
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
            name="email"
            type="email"
            required
            autoComplete="username"
            placeholder="E-mail"
            className="w-full rounded border border-[#ced4da] bg-white py-2.5 pl-9 pr-3 text-sm text-[#343a40] placeholder:text-[#adb5bd] focus:border-[#80bdff] focus:outline-none focus:ring focus:ring-[#007bff]/25"
          />
        </div>
      </div>

      <div>
        <label className="sr-only" htmlFor="password">
          Senha
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[#adb5bd]">
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
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="Senha"
            className="w-full rounded border border-[#ced4da] bg-white py-2.5 pl-9 pr-3 text-sm text-[#343a40] placeholder:text-[#adb5bd] focus:border-[#80bdff] focus:outline-none focus:ring focus:ring-[#007bff]/25"
          />
        </div>
      </div>

      {status === "error" && (
        <p className="rounded border border-[#f5c2c7] bg-[#f8d7da] px-3 py-2 text-sm text-[#842029]">
          E-mail ou senha inválidos.
        </p>
      )}

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full rounded bg-[#007bff] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0069d9] disabled:opacity-60"
      >
        {status === "loading" ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
