import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';

export const metadata: Metadata = {
  title: {
    default: 'KairoForge — AI-Powered Indian Stock Research',
    template: '%s | KairoForge',
  },
  description:
    'Discover, screen, and analyze Indian stocks with AI. Ask natural language questions about NSE/BSE stocks and get data-driven insights.',
  keywords: ['Indian stocks', 'NSE', 'BSE', 'stock screener', 'AI stock analysis', 'fundamental analysis'],
  authors: [{ name: 'KairoForge' }],
  openGraph: {
    title: 'KairoForge — AI-Powered Indian Stock Research',
    description: 'Discover, screen, and analyze Indian stocks with AI.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans bg-[#0A0A0F] text-[#e0e0f0] min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
