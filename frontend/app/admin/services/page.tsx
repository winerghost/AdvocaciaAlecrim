import type { Metadata } from "next";
import ServicesManager from "@/components/admin/ServicesManager";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminServicesPage() {
  return <ServicesManager />;
}
