// Páginas da seção "Configurações" do painel. Usado pelo grupo da sidebar
// (AdminSidebar) e pelas abas do topo (SettingsTabs): para uma nova página
// de configurações, basta criar a rota em app/admin/(configuracoes)/ e
// adicionar uma entrada aqui.
export type AdminSettingsItem = {
  href: string;
  label: string;
};

export const ADMIN_SETTINGS_ITEMS: AdminSettingsItem[] = [
  { href: "/admin/seguranca", label: "Segurança" },
  { href: "/admin/senha", label: "Senha" },
];

export function isAdminPathActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
