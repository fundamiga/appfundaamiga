import type { Metadata } from "next";
import "./globals.css";
import AIChatWidget from "@/components/AIChatWidget";

export const metadata: Metadata = {
  title: "Fundamiga",
  description: "Sistema de liquidación de personal",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        {children}
        <AIChatWidget />
      </body>
    </html>
  );
}
