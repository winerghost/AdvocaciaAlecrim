import SettingsTabs from "@/components/admin/SettingsTabs";

// Layout compartilhado das páginas de configurações. O route group
// "(configuracoes)" não entra na URL: as rotas continuam /admin/seguranca,
// /admin/senha etc. A autenticação continua em app/admin/layout.tsx.
export default function AdminSettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-lg font-bold text-adm-ink">Configurações</h1>
        <p className="text-sm text-adm-muted">
          Segurança da sua conta, dados de contato do site e avisos de novos contatos.
        </p>
      </div>
      <SettingsTabs />
      {children}
    </div>
  );
}
