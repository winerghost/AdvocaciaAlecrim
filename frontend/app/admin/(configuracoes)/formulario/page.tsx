import type { Metadata } from "next";
import LeadFormSettings from "@/components/admin/LeadFormSettings";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLeadFormPage() {
  return <LeadFormSettings />;
}
