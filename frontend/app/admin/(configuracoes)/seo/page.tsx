import type { Metadata } from "next";
import SeoSettingsForm from "@/components/admin/SeoSettingsForm";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminSeoPage() {
  return <SeoSettingsForm />;
}
