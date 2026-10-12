import type { Metadata } from "next";
import SecuritySettings from "@/components/admin/SecuritySettings";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminSecurityPage() {
  return <SecuritySettings />;
}
