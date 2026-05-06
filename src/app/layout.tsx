import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Autron Dash",
  description: "Dashboard de gestão de pedidos, follow-up, estoque e faturamento",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased bg-slate-950 text-slate-100">
        {children}
      </body>
    </html>
  );
}
