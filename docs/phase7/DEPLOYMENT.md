# DÉPLOIEMENT & VARIABLES D'ENVIRONNEMENT (PHASE 7)

## 1. Environnement de Production

- **URL de Production** : `https://securia-pilot.netlify.app`
- **Site ID Netlify** : `9f73d443-9f21-4685-ab45-bd040d0b9a16`
- **Deploy ID Phase 7 v2.7.0** : `6abdbe3f08a76e1da1123464`
- **Runtime** : Next.js 16.3.6 (Webpack) sur Netlify Server Functions (`@netlify/plugin-nextjs` v5.16.1)

---

## 2. Variables d'Environnement Requises

### Variables Publiques (Client)
```bash
NEXT_PUBLIC_SUPABASE_URL=https://...supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### Variables Serveur Privées (Paiement & Sécurité)
```bash
# Activation et credentials passerelle CI / UEMOA (optionnels tant qu'aucun contrat n'est actif)
PAYMENT_PROVIDER_ENABLED=false # Mettre à 'true' dès que les contrats réels sont signés
PAYMENT_API_KEY=wave_ci_live_...
PAYMENT_API_SECRET=...
PAYMENT_WEBHOOK_SECRET=whsec_ci_live_...
PAYMENT_ENVIRONMENT=production # ou 'sandbox'

# Configuration Fiscale
FISCAL_DEFAULT_TAX_RATE=0.18
FISCAL_VALIDATION_STATUS=PENDING_REGULATORY_APPROVAL
```
