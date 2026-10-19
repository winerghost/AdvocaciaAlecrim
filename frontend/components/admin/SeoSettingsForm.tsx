"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import MediaPickerModal from "@/components/admin/MediaPickerModal";
import { useMfaEnabled } from "@/lib/adminMfaClient";
import { fieldErrorMessage, useSettingsForm } from "@/lib/adminSettingsClient";
import { IMAGE_ACCEPT_ATTR, uploadAdminImage } from "@/lib/adminUpload";
import type { SiteSettings } from "@/lib/siteContact";
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
  SECONDARY_BTN,
  SettingsCard,
  SUCCESS_BOX,
} from "@/components/admin/settingsUi";

type SeoKey = "seo_home_title" | "seo_home_description" | "seo_blog_title" | "seo_blog_description";

const FIELDS: { key: SeoKey; label: string; max: number; multiline?: boolean; placeholder: string }[] = [
  { key: "seo_home_title", label: "Título da página inicial", max: 70, placeholder: "Advocacia Alecrim" },
  {
    key: "seo_home_description",
    label: "Descrição da página inicial",
    max: 170,
    multiline: true,
    placeholder:
      "Advogado atuante em Palmas e em todo o Tocantins, com foco em Direito das Sucessões, Previdenciário, Trabalhista e Cível.",
  },
  { key: "seo_blog_title", label: "Título do blog", max: 70, placeholder: "Artigos e orientações jurídicas" },
  {
    key: "seo_blog_description",
    label: "Descrição do blog",
    max: 170,
    multiline: true,
    placeholder:
      "Artigos e orientações em linguagem clara sobre inventário e sucessões, aposentadoria, direito trabalhista e cível, pelo escritório Advocacia Alecrim.",
  },
];

function redirectToLogin() {
  window.location.assign("/login");
}

export default function SeoSettingsForm() {
  const form = useSettingsForm<SiteSettings>("site", "SEO salvo. Buscadores e redes sociais leem os novos dados na próxima visita.");
  const { mfaEnabled } = useMfaEnabled();
  // Imagem escolhida nesta edição; `undefined` = ainda a que está salva.
  const [image, setImage] = useState<string | undefined>(undefined);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Partial<Record<SeoKey, number>>>({});

  if (form.state.status !== "ready") {
    return (
      <div className="max-w-2xl">
        <LoadingOrError status={form.state.status} onRetry={form.reload} />
      </div>
    );
  }

  const values = form.state.data.values;
  const currentImage = image ?? values.og_image;

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    const result = await uploadAdminImage(file);
    setUploading(false);
    if (result.ok) {
      setImage(result.url);
    } else if (result.unauthorized) {
      redirectToLogin();
    } else {
      setUploadError(result.message);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const changes: Record<string, unknown> = {};
    for (const field of FIELDS) {
      const raw = String(data.get(field.key) ?? "");
      if (raw.trim() !== values[field.key]) changes[field.key] = raw;
    }
    if (currentImage !== values.og_image) changes.og_image = currentImage;
    if (await form.submit(event.currentTarget, changes)) setImage(undefined);
  }

  return (
    <form key={form.formKey} onSubmit={handleSubmit} className="max-w-2xl space-y-6" noValidate>
      <SettingsCard
        title="Buscadores (Google)"
        description="Título e descrição que aparecem no resultado de busca e ao compartilhar o link. Deixe vazio para usar o texto padrão (mostrado em cinza)."
      >
        {FIELDS.map((field) => {
          const error = fieldErrorMessage(form.fieldErrors[field.key]);
          const count = counts[field.key] ?? values[field.key].length;
          const common = {
            id: `seo_${field.key}`,
            name: field.key,
            maxLength: field.max,
            defaultValue: values[field.key],
            placeholder: field.placeholder,
            "aria-invalid": error ? true : undefined,
            "aria-describedby": `seo_${field.key}-count${error ? ` seo_${field.key}-error` : ""}`,
            className: `${INPUT_CLASS} ${error ? INPUT_ERROR_CLASS : ""}`,
            onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
              setCounts((c) => ({ ...c, [field.key]: e.target.value.length })),
          };
          return (
            <div key={field.key}>
              <label className={LABEL_CLASS} htmlFor={common.id}>
                {field.label}
              </label>
              {field.multiline ? <textarea rows={3} {...common} /> : <input type="text" {...common} />}
              <p id={`seo_${field.key}-count`} className={HINT_CLASS}>
                {count}/{field.max} caracteres
              </p>
              <FieldError id={`seo_${field.key}-error`} message={error} />
            </div>
          );
        })}
      </SettingsCard>

      <SettingsCard
        title="Imagem de compartilhamento"
        description="Aparece ao enviar o link do site no WhatsApp e nas redes. Ideal: 1200 × 630 px. Sem imagem escolhida, vale a padrão do site."
      >
        {currentImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- prévia de upload do próprio painel
          <img src={currentImage} alt="Imagem de compartilhamento escolhida" className="max-h-48 rounded-sm border border-adm-border" />
        ) : (
          <p className="text-sm text-adm-muted">Usando a imagem padrão do site.</p>
        )}
        <div className="flex flex-wrap gap-3">
          <label className={`${SECONDARY_BTN} cursor-pointer`}>
            {uploading ? "Enviando..." : "Enviar imagem"}
            <input type="file" accept={IMAGE_ACCEPT_ATTR} onChange={handleUpload} disabled={uploading} className="sr-only" />
          </label>
          <button type="button" onClick={() => setPickerOpen(true)} className={SECONDARY_BTN}>
            Escolher da galeria
          </button>
          {currentImage && (
            <button type="button" onClick={() => setImage("")} className="text-sm font-medium text-adm-muted hover:text-adm-ink">
              Voltar para a padrão
            </button>
          )}
        </div>
        {uploadError && (
          <p role="alert" className={ERROR_BOX}>
            {uploadError}
          </p>
        )}
        <FieldError id="seo_og_image-error" message={fieldErrorMessage(form.fieldErrors.og_image)} />
        <p className={HINT_CLASS}>A imagem só passa a valer depois de salvar.</p>
      </SettingsCard>

      <MediaPickerModal
        open={pickerOpen}
        selectedUrl={currentImage || undefined}
        onClose={() => setPickerOpen(false)}
        onSelect={(url) => {
          setImage(url);
          setPickerOpen(false);
        }}
        onUnauthorized={redirectToLogin}
      />

      <ReauthFields mfaEnabled={mfaEnabled || form.mfaRequired} />

      {form.message && (
        <p role={form.message.kind === "ok" ? "status" : "alert"} className={form.message.kind === "ok" ? SUCCESS_BOX : ERROR_BOX}>
          {form.message.text}
        </p>
      )}

      <button type="submit" disabled={form.saving} className={PRIMARY_BTN}>
        {form.saving ? "Salvando..." : "Salvar SEO"}
      </button>
    </form>
  );
}
