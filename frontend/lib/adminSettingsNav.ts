// Páginas da seção "Configurações" do painel. A sidebar (AdminSidebar) mostra
// só um link "Configurações" (ADMIN_SETTINGS_HREF); as subpáginas aparecem
// como abas no topo (SettingsTabs). Para uma nova página de configurações,
// basta criar a rota em app/admin/(configuracoes)/ e adicionar uma entrada aqui.
export const ADMIN_SETTINGS_HREF = "/admin/configuracoes";

export type AdminSettingsItem = {
  href: string;
  label: string;
};

// A primeira entrada é o destino de /admin/configuracoes.
export const ADMIN_SETTINGS_ITEMS: AdminSettingsItem[] = [
  { href: "/admin/perfil", label: "Perfil" },
  { href: "/admin/seguranca", label: "Segurança" },
  { href: "/admin/senha", label: "Senha" },
  { href: "/admin/atividade", label: "Atividade" },
  { href: "/admin/site", label: "Site" },
  { href: "/admin/seo", label: "SEO" },
  { href: "/admin/formulario", label: "Formulário" },
  { href: "/admin/notificacoes", label: "Notificações" },
  { href: "/admin/integracoes", label: "Integrações" },
];

export function isAdminPathActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
