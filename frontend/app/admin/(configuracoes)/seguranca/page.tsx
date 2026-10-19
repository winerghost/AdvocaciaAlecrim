import type { Metadata } from "next";
import SecuritySettings from "@/components/admin/SecuritySettings";
import SessionsCard from "@/components/admin/SessionsCard";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminSecurityPage() {
  return (
    <div className="space-y-6">
      <SecuritySettings />
      <SessionsCard />
    </div>
  );
}
