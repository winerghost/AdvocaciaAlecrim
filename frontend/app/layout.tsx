import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dr. Alecrim | Advocacia em Palmas e todo o Tocantins",
  description:
    "Advogado atuante em Palmas e em todo o Tocantins, com foco em Direito das Sucessões, Previdenciário, Trabalhista e Cível.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-white text-navy antialiased">{children}</body>
    </html>
  );
}
