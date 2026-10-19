import type { Metadata } from "next";
import NotificationSettingsForm from "@/components/admin/NotificationSettingsForm";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminNotificationSettingsPage() {
  return <NotificationSettingsForm />;
}
