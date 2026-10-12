import type { Metadata } from 'next';
// the typeface is bundled with the app (no request to Google at build time or at run time)
import '@fontsource-variable/plus-jakarta-sans';
import './globals.css';

export const metadata: Metadata = {
  title: 'Panel rekrutacji',
  description: 'Demonstracyjny panel zarządzania rekrutacją: zgłoszenia według miast, statusy, profile kandydatów.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" suppressHydrationWarning>
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
