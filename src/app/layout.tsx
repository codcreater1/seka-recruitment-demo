import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import './views.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Panel rekrutacji',
  description: 'Demonstracyjny panel zarządzania rekrutacją: zgłoszenia według miast, statusy, profile kandydatów.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" className={jakarta.variable}>
      <body>{children}</body>
    </html>
  );
}
