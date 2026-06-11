import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "AI News",
    template: "%s | AI News",
  },
  description: "Read and manage AI news posts.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <div className="min-h-screen">
          <SiteHeader />
          {children}
        </div>
      </body>
    </html>
  );
}
