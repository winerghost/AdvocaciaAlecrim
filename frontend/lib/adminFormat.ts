// Formatação usada nas telas do painel (Perfil, Atividade).

/** ISO 8601 -> "18/10/2026 14:05" no horário de Brasília. */
export function formatDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

/** Resumo legível do User-Agent: "Chrome · Windows". Nada de parser
 * completo - só o suficiente para reconhecer o próprio dispositivo. */
export function describeUserAgent(ua: string | null | undefined): string {
  if (!ua) return "Navegador desconhecido";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Navegador";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad|iOS/.test(ua)
        ? "iPhone/iPad"
        : /Mac OS X|Macintosh/.test(ua)
          ? "Mac"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  return os ? `${browser} · ${os}` : browser;
}

const EVENT_LABELS: Record<string, string> = {
  login_success: "Entrou no painel",
  login_password_ok: "Senha correta (aguardando 2º fator)",
  login_failed: "Tentativa de login falhou",
  mfa_login_success: "Entrou no painel (com 2º fator)",
  mfa_login_failed: "Código do 2º fator recusado no login",
  mfa_recovery_code_used: "Usou um código de recuperação",
  logout: "Saiu do painel",
  password_changed: "Trocou a senha",
  password_change_failed: "Falha ao trocar a senha",
  password_rehashed: "Senha atualizada para o formato novo",
  mfa_setup_started: "Começou a ativar o 2º fator",
  mfa_setup_failed: "Falha ao ativar o 2º fator",
  mfa_enable_failed: "Falha ao ativar o 2º fator",
  mfa_enabled: "Ativou o 2º fator",
  mfa_disabled: "Desativou o 2º fator",
  mfa_disable_failed: "Falha ao desativar o 2º fator",
  mfa_recovery_codes_regenerated: "Gerou novos códigos de recuperação",
  mfa_recovery_codes_failed: "Falha ao gerar novos códigos",
  mfa_secret_unreadable: "Segredo do 2º fator ilegível",
  sessions_revoked_others: "Encerrou as outras sessões",
  profile_updated: "Atualizou o perfil",
  profile_update_failed: "Falha ao atualizar o perfil",
  rate_limited: "Bloqueado por excesso de tentativas",
  article_created: "Criou um artigo",
  article_updated: "Editou um artigo",
  article_deleted: "Excluiu um artigo",
  media_uploaded: "Enviou uma imagem",
  service_created: "Criou um serviço",
  service_updated: "Editou um serviço",
  service_deleted: "Excluiu um serviço",
  testimonial_created: "Criou um depoimento",
  testimonial_updated: "Editou um depoimento",
  testimonial_deleted: "Excluiu um depoimento",
  faq_created: "Criou uma pergunta do FAQ",
  faq_updated: "Editou uma pergunta do FAQ",
  faq_deleted: "Excluiu uma pergunta do FAQ",
  leads_listed: "Abriu a lista de leads",
  lead_status_changed: "Mudou o status de um lead",
  lead_deleted: "Excluiu um lead",
  admin_user_created: "Criou um administrador",
  admin_user_create_failed: "Falha ao criar administrador",
  admin_user_deleted: "Excluiu um administrador",
  admin_user_delete_failed: "Falha ao excluir administrador",
  settings_changed: "Alterou configurações",
  settings_change_failed: "Falha ao alterar configurações",
  settings_test_email_sent: "Enviou e-mail de teste",
};

export function eventLabel(event: string): string {
  return EVENT_LABELS[event] ?? event;
}

/** Evento que merece destaque visual (falha ou ação de risco). */
export function isWarningEvent(event: string): boolean {
  return /failed|rate_limited|unreadable|mfa_disabled|recovery_code_used/.test(event);
}
