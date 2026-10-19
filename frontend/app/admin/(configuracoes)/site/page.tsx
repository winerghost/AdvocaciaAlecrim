import type { Metadata } from "next";
import SiteSettingsForm from "@/components/admin/SiteSettingsForm";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminSiteSettingsPage() {
  return <SiteSettingsForm />;
}
