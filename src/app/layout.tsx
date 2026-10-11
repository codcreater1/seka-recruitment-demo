import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

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
    <html lang="pl" className={jakarta.variable} suppressHydrationWarning>
      <head>
        <script
          // apply the stored theme and text size before the first paint (no flash)
          dangerouslySetInnerHTML={{
            __html:
              "try{var d=document.documentElement,t=localStorage.getItem('panel-rekrutacji-theme');if(t==='light'||t==='dark')d.setAttribute('data-theme',t);var z=localStorage.getItem('panel-rekrutacji-size');if(z!=='s'&&z!=='m'&&z!=='l')z=window.devicePixelRatio>=1.2?'m':'l';d.setAttribute('data-size',z)}catch(e){}",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
