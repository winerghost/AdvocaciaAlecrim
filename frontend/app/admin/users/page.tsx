import type { Metadata } from "next";
import UsersManager from "@/components/admin/UsersManager";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminUsersPage() {
  return <UsersManager />;
}
