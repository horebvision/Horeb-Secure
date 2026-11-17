import type { MetadataRoute } from 'next';

/**
 * Manifeste de l'application installable (PWA), servi sur /manifest.webmanifest.
 * Icônes : générées par scripts/generate-pwa-icons.js. Une icône « any » pleine et une « maskable »
 * distincte par taille : une icône à la fois any et maskable est rognée sur Android.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'HOREB SECURE — Sécurité Opérationnelle & Intervention',
    short_name: 'HOREB SECURE',
    description: 'HOREB SECURE — Protéger Aujourd’hui, Demain | Plateforme de Sécurité de Proximité',
    lang: 'fr',
    dir: 'ltr',
    start_url: '/login',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'portrait',
    background_color: '#020617',
    theme_color: '#020617',
    categories: ['security', 'business', 'utilities'],
    prefer_related_applications: false,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
