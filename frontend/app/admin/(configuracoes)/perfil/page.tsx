import type { Metadata } from "next";
import ProfileSettings from "@/components/admin/ProfileSettings";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminProfilePage() {
  return <ProfileSettings />;
}
