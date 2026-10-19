import type { Metadata } from "next";
import ActivityLog from "@/components/admin/ActivityLog";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminActivityPage() {
  return <ActivityLog />;
}
