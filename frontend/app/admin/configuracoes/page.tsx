import { redirect } from "next/navigation";
import { ADMIN_SETTINGS_ITEMS } from "@/lib/adminSettingsNav";

// /admin/configuracoes não tem conteúdo próprio: leva para a primeira aba.
export default function AdminSettingsIndexPage() {
  redirect(ADMIN_SETTINGS_ITEMS[0].href);
}
