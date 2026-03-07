import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NIFTY Intelligence — Pro Trading Dashboard',
  description: 'Real-time NIFTY 50 options analytics: GEX, market structure, institutional flow, opening range, signal scoring, and AI analysis for intraday traders.',
  keywords: 'NIFTY, options, OI, open interest, trading, PCR, max pain, gamma exposure, BOS, CHoCH, FII, DII',
  authors: [{ name: 'NIFTY Intelligence' }],
};

export const viewport: Viewport = {
  themeColor: '#060910',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-background text-text-primary font-sans antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
