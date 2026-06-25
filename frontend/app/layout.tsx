import type { Metadata } from 'next';
import { Fraunces, Inter, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { StellarProvider } from '@/lib/wallet';
import { ToastProvider } from '@/components/Toast';
import { Header } from '@/components/Header';

// Editorial serif with optical sizing - the "star-atlas" display voice.
const display = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});
const body = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Orbid · Sealed-bid auctions, settled by proof',
  description:
    'A trustless sealed-bid Vickrey NFT auction on Stellar. Bids stay sealed; the winner pays the second-highest price, proven by zero-knowledge.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="font-body">
        <div className="starfield" aria-hidden />
        <StellarProvider>
          <ToastProvider>
            <Header />
            <main className="mx-auto min-h-[calc(100vh-60px)] max-w-6xl px-4 pb-20 pt-8 sm:px-6">
              {children}
            </main>
            <footer className="border-t border-border/60 py-8 text-center">
              <p className="eyebrow">Stellar testnet · Protocol 25</p>
              <p className="mt-2 text-xs text-faint">
                Bids are encrypted client-side and settled by zero-knowledge proof.
              </p>
            </footer>
          </ToastProvider>
        </StellarProvider>
      </body>
    </html>
  );
}
