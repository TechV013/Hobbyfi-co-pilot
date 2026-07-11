import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "HobbyFi Copilot",
  description: "AI-powered assistant for HobbyFi vendors",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
