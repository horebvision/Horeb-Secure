# SÉCURITÉ, ISOLATION MULTI-TENANT & RLS (PHASE 7)

## 1. Sécurité Côté Serveur & Dérivation de l'Organisation

Toutes les routes d'API critiques (`/api/payments/create`, `/api/sync/batch`, `/api/fiscal/invoices/:id/pdf`, `/api/admin/payments/reconciliation`) appliquent la règle d'isolation stricte :
- **L'identifiant d'organisation (`organization_id`) n'est JAMAIS extrait aveuglément du corps de requête client.**
- Il est **dérivé côté serveur** à partir de la session authentifiée (`authenticateApiRequest(req)`).
- Toute tentative de forge d'organisation est neutralisée côté serveur.

---

## 2. Row Level Security (RLS) PostgreSQL

La migration `20260930500000_phase7_payments_fiscal_offline.sql` protège chaque table nouvellement introduite :
- **`payment_transactions`** :
  - `SELECT` : Accordé aux administrateurs de la même organisation (`organization_id = auth.jwt()->>'organization_id'`) et aux rôles système `ADMIN`.
  - `INSERT` / `UPDATE` : Verrouillé au rôle service-role ou gestionnaire habilité.
- **`payment_webhook_events`** :
  - Restreint aux administrateurs de plateforme (`role = 'ADMIN'`).
- **`offline_sync_events`** :
  - `SELECT` / `INSERT` : Strictement restreint à l'organisation de l'agent.
- **`fiscal_configurations`** :
  - Lecture pour les membres de l'organisation, écriture pour l'administrateur d'organisation ou de plateforme.

---

## 3. Protection Cryptographique & Non-Répudiation

1. **Scellé fiscal SHA-256** : Empreinte immuable sur les factures et avoirs.
2. **Signature HMAC-SHA256 sur les webhooks** : Vérification stricte des signatures entrantes et sortantes.
3. **Zéro exposition de secrets** : Clés privées de paiement et secrets de webhooks sont stockés exclusivement dans les variables d'environnement serveur Netlify / Supabase.
