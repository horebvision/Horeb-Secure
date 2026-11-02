# SECURIA — Guide Développeur

> Plateforme de gestion des alertes de sécurité privée  
> Version : 1.0.0 | Stack : Next.js 16 · Supabase · TypeScript · Tailwind CSS v4

---

## Table des Matières

1. [Architecture Générale](#1-architecture-générale)
2. [Base de Données](#2-base-de-données)
3. [Variables d'Environnement](#3-variables-denvironnement)
4. [Installation & Développement](#4-installation--développement)
5. [Déploiement](#5-déploiement)
6. [Rôles & Permissions](#6-rôles--permissions)
7. [Workflow des Alertes](#7-workflow-des-alertes)
8. [Système de Notifications](#8-système-de-notifications)
9. [Cartographie](#9-cartographie)
10. [Sécurité](#10-sécurité)
11. [Tests](#11-tests)
12. [Monitoring](#12-monitoring)

---

## 1. Architecture Générale

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser / Mobile)                        │
│   React 19 · Next.js App Router · Tailwind CSS v4 · Leaflet (Maps)      │
└──────────────────────────────────────┬──────────────────────────────────┘
                                       │ HTTPS / WSS
┌──────────────────────────────────────▼──────────────────────────────────┐
│                       NEXT.JS 16 SERVER (Edge / Node.js)                 │
│  Middleware (auth + RBAC)  ·  API Routes  ·  Server Components           │
│  src/middleware.ts          src/app/api/  src/app/(routes)/              │
└──────────────────────────────────────┬──────────────────────────────────┘
                                       │ Supabase JS SDK (server)
┌──────────────────────────────────────▼──────────────────────────────────┐
│                          SUPABASE (Backend-as-a-Service)                  │
│  PostgreSQL 15 · Row Level Security · Realtime · Storage · Auth           │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────────────┐  │
│  │  Auth (JWT)     │  │  PostgREST API   │  │  Realtime (WebSocket)  │  │
│  └─────────────────┘  └──────────────────┘  └────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Structure du Projet

```
securia/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (admin)/            # Dashboard administrateur
│   │   ├── (agent)/            # Interface agent de sécurité
│   │   ├── (auth)/             # Pages d'authentification
│   │   ├── (client)/           # Interface utilisateur/client
│   │   ├── (dispatch)/         # Dashboard centre de sécurité
│   │   ├── api/                # API Routes (server-side)
│   │   │   ├── alerts/         # CRUD alertes
│   │   │   ├── agents/         # Gestion des agents
│   │   │   ├── health/         # Health check endpoint
│   │   │   ├── interventions/  # CRUD interventions
│   │   │   └── notifications/  # Notifications système
│   │   └── unauthorized/       # Page d'accès refusé
│   │
│   ├── components/             # Composants React réutilisables
│   ├── core/                   # Logique métier centrale
│   ├── lib/                    # Utilitaires partagés
│   │   ├── config/
│   │   │   └── env.ts          # Configuration d'environnement centralisée
│   │   ├── security/
│   │   │   └── api-guard.ts    # Auth, RBAC, rate limiting, validation
│   │   ├── supabase/
│   │   │   ├── client.ts       # Client browser
│   │   │   ├── server.ts       # Client server (cookies)
│   │   │   └── admin.ts        # Client service_role (admin uniquement)
│   │   ├── geo/                # Utilitaires géospatials
│   │   └── logger.ts           # Logger structuré
│   │
│   ├── modules/                # Modules métier
│   │   ├── alerts/             # Moteur des alertes
│   │   ├── agents/             # Gestion des agents
│   │   ├── auth/               # Authentification
│   │   ├── interventions/      # Gestion des interventions
│   │   ├── notifications/      # Système de notifications
│   │   ├── organizations/      # Multi-tenant
│   │   ├── protected-sites/    # Sites protégés
│   │   ├── security-centers/   # Centres de sécurité
│   │   └── users/              # Gestion des utilisateurs
│   │
│   └── middleware.ts           # Middleware Next.js (auth + RBAC)
│
├── supabase/
│   ├── migrations/             # Migrations SQL ordonnées
│   └── seed.sql                # Données de test (DEV uniquement)
│
├── scripts/                    # Scripts utilitaires (tests, migration)
├── .env.example                # Template des variables d'environnement
├── next.config.ts              # Configuration Next.js (headers, images...)
└── vercel.json                 # Configuration déploiement Vercel
```

---

## 2. Base de Données

### Tables Principales

| Table | Description |
|---|---|
| `users` | Profils utilisateurs (liés à `auth.users`) |
| `organizations` | Organisations clientes (multi-tenant) |
| `security_centers` | Centres de sécurité par organisation |
| `protected_sites` | Sites protégés par organisation |
| `alerts` | Alertes de sécurité (source de vérité) |
| `alert_events` | Historique des événements par alerte |
| `interventions` | Interventions des agents |
| `notifications` | Notifications internes |
| `audit_logs` | Journal d'audit de toutes les actions |

### Schéma Simplifié des Relations

```
organizations
    ├── security_centers (1:N)
    ├── protected_sites  (1:N)
    └── users            (1:N via organization_id)

alerts
    ├── alert_events     (1:N — historique des changements de statut)
    ├── interventions    (1:N — une alerte peut générer plusieurs tentatives)
    └── notifications    (1:N)

users (role=AGENT)
    └── interventions    (1:N via agent_id)
```

### Statuts des Alertes

```
PENDING → RECEIVED → ASSIGNED → IN_PROGRESS → RESOLVED
                                             → CANCELLED
                                             → ESCALATED
```

### Row Level Security (RLS)

Toutes les tables ont RLS activé. Les règles garantissent :
- Un `USER` ne voit que les alertes de ses propres sites.
- Un `AGENT` ne voit que les interventions qui lui sont assignées.
- Un `SECURITY_MANAGER` voit toutes les données de son organisation.
- Un `ADMIN` a un accès global via les fonctions `SECURITY DEFINER`.

> ⚠️ Ne jamais désactiver RLS sur une table en production.

### Fonctions RPC Sécurisées

Les opérations critiques passent par des fonctions `SECURITY DEFINER` :

| Fonction | Description |
|---|---|
| `trigger_alert_engine(...)` | Crée une alerte de façon idempotente |
| `get_user_alerts(user_id)` | Retourne les alertes de l'utilisateur |
| `get_intervention_detail(id, user_id)` | Retourne le détail d'une intervention |

### Migrations

Les migrations sont dans `supabase/migrations/` et doivent être appliquées dans l'ordre de leur préfixe de date. Pour appliquer les migrations sur un nouveau projet :

```bash
# 1. Installer Supabase CLI
npm install -g supabase

# 2. Lier au projet
supabase link --project-ref YOUR_PROJECT_REF

# 3. Appliquer les migrations
supabase db push
```

---

## 3. Variables d'Environnement

Voir `.env.example` pour la liste complète et commentée.

### Variables Obligatoires

| Variable | Description | Exposition |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase | Client + Serveur |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé anonyme Supabase | Client + Serveur |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service_role | **Serveur uniquement** |

### Variables Recommandées

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_APP_URL` | URL publique de l'app (pour les redirections) |
| `NEXT_PUBLIC_APP_ENV` | `development` / `staging` / `production` |

> **Règle absolue** : Les variables préfixées `NEXT_PUBLIC_` sont embarquées dans le bundle client. Ne jamais y mettre de secrets.

---

## 4. Installation & Développement

### Prérequis

- Node.js >= 20
- npm >= 10
- Un projet Supabase actif

### Démarrage Rapide

```bash
# 1. Cloner le dépôt
git clone <repo-url> securia
cd securia

# 2. Installer les dépendances
npm ci

# 3. Configurer l'environnement
cp .env.example .env.local
# Éditer .env.local avec vos credentials Supabase

# 4. Vérifier la configuration
npm run env:check

# 5. Appliquer les migrations (si premier démarrage)
supabase link --project-ref YOUR_PROJECT_REF
supabase db push

# 6. Démarrer le serveur de développement
npm run dev
```

L'application est disponible sur [http://localhost:3000](http://localhost:3000).

### Scripts Disponibles

| Script | Description |
|---|---|
| `npm run dev` | Serveur de développement (Turbopack) |
| `npm run build` | Build de production |
| `npm start` | Démarrer en mode production |
| `npm run lint` | Vérification ESLint |
| `npm run lint:fix` | Correction automatique ESLint |
| `npm run type-check` | Vérification TypeScript sans compilation |
| `npm run env:check` | Vérification de la présence de `.env.local` |
| `npm run db:types` | Génération des types TypeScript depuis le schéma Supabase |

---

## 5. Déploiement

### Vercel (Recommandé)

1. **Importer le projet** sur [vercel.com](https://vercel.com).
2. **Définir les variables d'environnement** dans Vercel Dashboard > Settings > Environment Variables :
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_APP_URL` (URL de production)
   - `NEXT_PUBLIC_APP_ENV=production`
3. **Déployer** — Vercel détecte automatiquement Next.js.

La région CDG1 (Paris) est préconfigurée dans `vercel.json` pour minimiser la latence.

### Docker / Auto-hébergé

Décommenter `output: "standalone"` dans `next.config.ts`, puis :

```bash
# Build
docker build -t securia .

# Run
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_SUPABASE_URL=... \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
  -e SUPABASE_SERVICE_ROLE_KEY=... \
  securia
```

### Environnements Séparés

| Environnement | Branche Git | Projet Supabase |
|---|---|---|
| Development | `feature/*` | Projet dev dédié |
| Staging | `main` | Projet staging dédié |
| Production | `release/*` ou tags | Projet production |

> ⚠️ **Ne jamais utiliser le projet Supabase de production pour les tests ou le développement.**

---

## 6. Rôles & Permissions

| Rôle | Interface | Capacités |
|---|---|---|
| `USER` | `/dashboard` | Créer/voir ses propres alertes, gérer ses sites |
| `AGENT` | `/agent` | Voir et gérer les interventions assignées |
| `SECURITY_MANAGER` | `/dispatch` | Voir toutes les alertes de l'organisation, affecter les agents |
| `ADMIN` | `/admin` | Accès complet, gestion des utilisateurs et organisations |

### Contrôle des Permissions

Les permissions sont vérifiées à **trois niveaux** :

1. **Middleware** (`src/middleware.ts`) — Bloque les requêtes non autorisées dès la couche HTTP.
2. **API Guard** (`src/lib/security/api-guard.ts`) — Vérifie le rôle en base de données (source de vérité), résistant à la falsification des métadonnées JWT.
3. **Row Level Security** — Couche finale en base de données, impossible à contourner depuis l'application.

---

## 7. Workflow des Alertes

```
Utilisateur appuie sur [ALERTE]
         │
         ▼
POST /api/alerts
         │
         ▼
api-guard.ts (auth + rate limit)
         │
         ▼
alert-engine.service.ts
  1. Valider utilisateur & site protégé
  2. Vérifier idempotence (hash événement)
  3. Insérer dans `alerts` (statut: PENDING)
  4. Insérer premier événement dans `alert_events`
  5. Envoyer notification Realtime au dashboard dispatch
  6. Créer notifications pour SECURITY_MANAGER
  7. Démarrer timer d'escalade (si alerte critique)
         │
         ▼
Dashboard Dispatch reçoit l'alerte en temps réel
         │
         ▼
SECURITY_MANAGER → [PRENDRE EN CHARGE] → statut: RECEIVED
         │
         ▼
SECURITY_MANAGER → [AFFECTER UN AGENT] → statut: ASSIGNED
         │
         ▼
AGENT reçoit notification → [ACCEPTER] → statut: IN_PROGRESS
         │
    ┌────┴────┐
    ▼         ▼
[EN ROUTE]  [ARRIVÉ]
    │         │
    └────┬────┘
         ▼
[INTERVENTION TERMINÉE] → statut: RESOLVED
```

### Escalade Automatique

Si une alerte de priorité `CRITICAL` ou `HIGH` n'est pas prise en charge dans le délai configuré, elle est escaladée et une notification est envoyée au `SECURITY_MANAGER`.

### Idempotence

Chaque déclenchement d'alerte génère un hash basé sur `(user_id, site_id, type, timestamp_minute)`. Si un hash identique existe déjà en base, la requête retourne l'alerte existante sans en créer une nouvelle.

---

## 8. Système de Notifications

### Architecture Multi-Canal

```
Événement (ex: alerte créée)
         │
         ▼
notifications.service.ts
         │
    ┌────┴──────────────────────┐
    ▼                           ▼
Notifications internes    Canal externe (Phase 2)
(table `notifications`)   Push / SMS / Email
         │
         ▼
Realtime Supabase (WebSocket)
         │
         ▼
Interface utilisateur mise à jour en temps réel
```

### Types de Notifications

| Type | Destinataire | Déclencheur |
|---|---|---|
| `ALERT_CREATED` | SECURITY_MANAGER | Nouvelle alerte |
| `ALERT_ASSIGNED` | USER + AGENT | Agent affecté |
| `AGENT_EN_ROUTE` | USER | Agent en déplacement |
| `AGENT_ARRIVED` | USER | Agent sur place |
| `ALERT_RESOLVED` | USER | Intervention terminée |
| `ESCALATION` | SECURITY_MANAGER | Délai dépassé |

> **Source de vérité** : La table `alerts` reste toujours la source canonique de l'état du système. Les notifications sont des indicateurs, jamais des sources de vérité.

---

## 9. Cartographie

La cartographie utilise **Leaflet + OpenStreetMap** (aucune clé API requise pour le MVP).

### Ce qui est implémenté (MVP)

- Affichage de la localisation des sites protégés.
- Affichage de la localisation de l'alerte (si coordonnées GPS disponibles).
- Vue carte dans le dashboard dispatch.

### Architecture pour les phases suivantes

| Fonctionnalité | Technologie prévue |
|---|---|
| Suivi temps réel des agents | Supabase Realtime + GPS client |
| Géofencing | PostGIS (extension PostgreSQL) |
| Calcul de distance | PostGIS `ST_Distance()` |
| Estimation temps d'arrivée | API routing (OSRM ou Google Maps) |

> ⚠️ Les coordonnées GPS ne sont jamais exposées directement au client. Elles sont toujours filtrées et masquées par les RPC et API routes.

---

## 10. Sécurité

### Principes Fondamentaux

1. **Ne jamais faire confiance au frontend** — Toute validation est répétée côté serveur.
2. **Moindre privilège** — Chaque composant n'accède qu'aux données dont il a besoin.
3. **Defense in depth** — Middleware + API Guard + RLS + RPC SECURITY DEFINER.

### Headers de Sécurité

Configurés dans `next.config.ts` :
- `Content-Security-Policy` — Restreint les origines autorisées.
- `Strict-Transport-Security` — Force HTTPS en production.
- `X-Frame-Options: DENY` — Prévient le clickjacking.
- `X-Content-Type-Options: nosniff` — Prévient le MIME sniffing.
- `Permissions-Policy` — Désactive les APIs navigateur non utilisées.

### Rate Limiting

Implémenté en mémoire dans `api-guard.ts`. Pour la production à fort trafic, migrer vers **Upstash Redis** (voir `.env.example`).

### Gestion des Secrets

- Jamais de secret dans le code source.
- Variables d'environnement via plateforme de déploiement.
- `.env.local` exclu du dépôt via `.gitignore`.
- `SUPABASE_SERVICE_ROLE_KEY` uniquement côté serveur.

---

## 11. Tests

### Campagne de Tests

Les scripts de test sont dans `scripts/` :

```bash
# Test complet
node scripts/test-master-campaign.js

# Tests spécifiques
node scripts/test-auth.js
node scripts/test-agent-interface.js
node scripts/test-notifications.js
node scripts/test-cartography.js
```

> Les tests utilisent un cookie `securia_role` pour simuler les rôles sans session Supabase réelle. **Cette fonctionnalité doit être désactivée en production.**

### Ce qui est couvert

- ✅ Authentification (inscription, connexion, déconnexion, mot de passe oublié)
- ✅ Permissions RBAC (accès croisé entre utilisateurs/organisations)
- ✅ Workflow complet des alertes (PENDING → RESOLVED)
- ✅ Interface agent (acceptation, statuts, historique)
- ✅ Dashboard dispatch (temps réel, affectation)
- ✅ Anti-doublons et idempotence des alertes
- ✅ Cas limites (GPS indisponible, perte de connexion, spam)

---

## 12. Monitoring

### Health Check

```
GET /api/health
```

Retourne `200 OK` si tous les systèmes sont opérationnels, `503` sinon.

### Logs

- **Développement** : Logs colorés et lisibles dans la console.
- **Production** : Logs JSON structurés compatibles avec Vercel Logs, Datadog, et Loki.

Usage dans le code :

```typescript
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'alert-engine' });
log.info('Alerte créée', { alertId, userId });
log.error('Erreur base de données', { table: 'alerts' }, error);
```

### Métriques Recommandées (Phase 2)

- Latence de création d'alerte (P50, P95, P99)
- Temps de prise en charge moyen (PENDING → RECEIVED)
- Temps d'intervention moyen (ASSIGNED → RESOLVED)
- Taux d'alertes escaladées
- Uptime du service (via `/api/health`)

---

## Contacts & Support

Pour toute question technique, se référer à la base de code et aux rapports :

- [Rapport d'audit de sécurité](./audit_securite_rapport.md)
- [Rapport de campagne de tests](./campagne_tests_rapport.md)
