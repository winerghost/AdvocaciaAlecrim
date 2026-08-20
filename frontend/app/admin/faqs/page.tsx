import type { Metadata } from "next";
import FaqsManager from "@/components/admin/FaqsManager";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminFaqsPage() {
  return <FaqsManager />;
}
