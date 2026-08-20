import type { Metadata } from "next";
import TestimonialsManager from "@/components/admin/TestimonialsManager";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminTestimonialsPage() {
  return <TestimonialsManager />;
}
