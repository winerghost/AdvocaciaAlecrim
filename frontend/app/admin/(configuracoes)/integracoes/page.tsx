import type { Metadata } from "next";
import IntegrationSettingsForm from "@/components/admin/IntegrationSettingsForm";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminIntegrationsPage() {
  return <IntegrationSettingsForm />;
}
