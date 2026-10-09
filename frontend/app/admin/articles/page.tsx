import type { Metadata } from "next";
import ArticlesManager from "@/components/admin/ArticlesManager";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminArticlesPage() {
  return <ArticlesManager />;
}
