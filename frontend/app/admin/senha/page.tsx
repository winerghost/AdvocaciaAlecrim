import type { Metadata } from "next";
import ChangePasswordForm from "@/components/admin/ChangePasswordForm";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminChangePasswordPage() {
  return <ChangePasswordForm />;
}
