import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import './globals.css';
export const metadata: Metadata = {
  title: 'TerraLab · Human insight. Earth intelligence.',
  description:
    'A thoughtful workspace for satellite image classification. Explore GeoTIFF imagery, guide active learning, and build better land-cover models.',
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
