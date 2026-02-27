import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nifty Options Intelligence Dashboard',
  description: 'Real-time NIFTY options analytics for intraday traders',
  keywords: 'NIFTY, options, OI, open interest, trading dashboard, PCR, max pain',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-background text-text-primary font-sans antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
