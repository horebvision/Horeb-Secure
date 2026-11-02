import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SecuriaProvider } from '@/lib/store/securia-context';
import { Navbar } from '@/components/shared/Navbar';
import { OfflineBanner } from '@/components/shared/OfflineBanner';
import { MobileBottomNav } from '@/components/client/MobileBottomNav';
import { MainWrapper } from '@/components/shared/MainWrapper';
import { PwaServiceWorkerRegister } from '@/components/shared/PwaServiceWorkerRegister';
import { PwaInstallPrompt } from '@/components/shared/PwaInstallPrompt';

export const viewport: Viewport = {
  themeColor: '#020617',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: 'HOREB SECURE — Protéger Aujourd’hui, Demain | Plateforme Opérationnelle de Sécurité',
  description:
    'Plateforme moderne de sécurité de proximité, dispatch d’urgence en temps réel, télésurveillance et intervention rapide.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'HOREB SECURE',
  },
  icons: {
    icon: [
      { url: '/favicon.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className="dark h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-100 selection:bg-red-500 selection:text-white">
        <PwaServiceWorkerRegister />
        <PwaInstallPrompt />
        <SecuriaProvider>
          <OfflineBanner />
          <Navbar />
          <MainWrapper>{children}</MainWrapper>
          <MobileBottomNav />
        </SecuriaProvider>
      </body>
    </html>
  );
}
