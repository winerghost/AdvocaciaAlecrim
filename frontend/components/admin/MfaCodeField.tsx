"use client";

import { useState } from "react";

const INPUT_CLASS =
  "w-full rounded-sm border border-adm-border-strong px-3 py-2 text-sm text-adm-ink focus:border-adm-focus focus:outline-hidden focus:ring-3 focus:ring-adm-accent/25";

/**
 * Campo do 2º fator com alternância entre código do autenticador (6 dígitos)
 * e código de recuperação. Pode ser controlado (`value`/`onChange`) ou lido
 * via FormData pelo `name`. `onModeChange` avisa quem precisa saber qual dos
 * dois está em uso (para escolher a chave do payload).
 */
export default function MfaCodeField({
  id,
  name = "code",
  value,
  onChange,
  onModeChange,
}: {
  id: string;
  name?: string;
  value?: string;
  onChange?: (value: string) => void;
  onModeChange?: (recovery: boolean) => void;
}) {
  const [recovery, setRecovery] = useState(false);

  function toggle() {
    const next = !recovery;
    setRecovery(next);
    onChange?.("");
    onModeChange?.(next);
  }

  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-adm-body" htmlFor={id}>
        {recovery ? "Código de recuperação" : "Código do autenticador (6 dígitos)"}
      </label>
      <input
        // `key` remonta o campo ao alternar, limpando o valor digitado.
        key={recovery ? "recovery" : "totp"}
        id={id}
        name={name}
        type="text"
        required
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        {...(recovery
          ? { maxLength: 64, autoComplete: "off", autoCapitalize: "none", spellCheck: false }
          : { maxLength: 6, inputMode: "numeric" as const, pattern: "[0-9]{6}", autoComplete: "one-time-code" })}
        className={INPUT_CLASS}
      />
      <button
        type="button"
        onClick={toggle}
        className="mt-1 text-xs font-medium text-adm-accent underline-offset-2 hover:underline"
      >
        {recovery ? "Usar código do aplicativo" : "Usar código de recuperação"}
      </button>
    </div>
  );
}
