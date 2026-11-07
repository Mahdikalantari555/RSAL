import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "TerraLoop · Active Learning Studio",
  description:
    "Human-in-the-loop satellite image classification: upload GeoTIFF scenes, review uncertainty-ranked suggestions and retrain with a few clicks.",
};

export const viewport: Viewport = {
  themeColor: "#070c14",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
