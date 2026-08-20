import type { Metadata } from "next";
import LeadsManager from "@/components/admin/LeadsManager";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLeadsPage() {
  return <LeadsManager />;
}
