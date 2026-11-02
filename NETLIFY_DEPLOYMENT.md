# SECURIA — Guide de Déploiement Netlify

## Environnement Staging / Pilote Réel Multi-Appareils

Ce guide fournit la procédure complète étape par étape pour déployer **SECURIA MVP v1.0.0** sur **Netlify** et orchestrer un test opérationnel multi-appareils (Client 4G, SOC Ordinateur, Agent 4G/5G).

---

## 1. Pré-requis

Avant de procéder au déploiement, assurez-vous de disposer de :

* Un compte **Netlify** actif ([netlify.com](https://www.netlify.com)).
* Un compte **Supabase** avec le projet SECURIA opérationnel.
* Les identifiants et clés API Supabase :
  * URL du projet (`https://<project-ref>.supabase.co`)
  * Clé publique anonyme (`anon_key`)
  * Clé administrative secrète (`service_role_key`)
* Un dépôt Git distant hébergé (GitHub, GitLab, ou Bitbucket) contenant le code source de SECURIA.
* La suite de tests validée localement :
  * `npm run type-check` : 0 erreur
  * `npm run build` : 40 routes générées, 0 erreur
  * `test-pilot-real.js` : 47/47 tests réussis.

---

## 2. Connexion du Repository

1. Connectez-vous sur la console [Netlify App](https://app.netlify.com).
2. Cliquez sur le bouton **"Add new site"** > **"Import an existing project"**.
3. Choisissez votre fournisseur Git (ex: **GitHub**).
4. Accordez l'autorisation à Netlify d'accéder au dépôt `Securia`.
5. Sélectionnez la branche principale dédiée au Staging/Pilote (ex: `main` ou `staging`).

---

## 3. Configuration Build

Netlify détecte automatiquement le framework Next.js grâce à la configuration présente dans le fichier `netlify.toml` :

* **Base directory** : Laisser vide (racine du projet).
* **Build command** : `npm run build`
* **Publish directory** : `.next`
* **Package manager** : `npm`

---

## 4. Configuration Node.js

SECURIA requiert **Node.js 20 LTS** ou version supérieure.  
Le projet intègre les fichiers de verrouillage suivants :

* Fichier `.nvmrc` : `20`
* Fichier `netlify.toml` : `NODE_VERSION = "20"`
* Fichier `package.json` : `"engines": { "node": ">=20.0.0" }`

Netlify utilisera automatiquement le runtime Node.js 20 LTS lors de la phase de compilation.

---

## 5. Variables d'Environnement

Dans la section **Site configuration** > **Environment variables** du projet Netlify, configurez les variables suivantes :

| Clé | Valeur recommandée | Portée / Scope |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_APP_NAME` | `SECURIA` | All scopes |
| `NEXT_PUBLIC_APP_VERSION` | `1.0.0` | All scopes |
| `NEXT_PUBLIC_APP_URL` | `https://<nom-de-votre-site>.netlify.app` | All scopes |
| `NEXT_PUBLIC_APP_ENV` | `staging` | All scopes |
| `NEXT_PUBLIC_SUPABASE_URL` | *Votre URL Supabase* | All scopes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *Votre clé anon Supabase* | All scopes |
| `SUPABASE_SERVICE_ROLE_KEY` | *Votre clé service_role Supabase* | Functions, Builds |
| `ENABLE_TEST_AUTH` | `false` | Functions, Builds |

*(Consultez le document `NETLIFY_ENV_SETUP.md` pour le détail de chaque variable).*

---

## 6. Configuration Supabase

Vérifiez les paramètres de sécurité et de connectivité dans le tableau de bord Supabase :

1. **Réseau & IP :**
   * Supabase autorise par défaut les connexions entrantes sécurisées HTTPS/WSS depuis les adresses IP dynamiques des plateformes serverless telles que Netlify.
2. **Realtime :**
   * Dans **Database** > **Replication**, confirmez que la réplication Realtime est active sur les tables `alerts`, `alert_events`, `interventions`, et `security_agents`.
3. **RLS (Row Level Security) :**
   * Confirmez que RLS est actif sur toutes les tables de sécurité.

---

## 7. Configuration Supabase Auth & Redirections

Dans la console Supabase, accédez à **Authentication** > **URL Configuration** :

### Site URL
Renseignez l'URL fournie par Netlify :
```text
https://<nom-de-votre-site>.netlify.app
```

### Redirect URLs (Allowed Callback URLs)
Ajoutez les URLs autorisées pour conserver la flexibilité entre dev local et pilote :
```text
http://localhost:3000/**
https://<nom-de-votre-site>.netlify.app/**
https://*.netlify.app/**
```

---

## 8. Déploiement

1. Cliquez sur **"Deploy site"** dans l'interface Netlify (ou poussez un commit sur votre branche connectée).
2. Suivez le déroulement du build dans **Deploys** > **Building**.
3. Le journal de build doit afficher :
   ```text
   ▲ Next.js 16.3.6 (Turbopack)
   ✓ Compiled successfully
   ✓ Generating static pages (40/40)
   Site is live ✨
   ```
4. Notez l'URL attribuée par Netlify (ex: `https://securia-pilot.netlify.app`).

---

## 9. Vérification Post-Déploiement

Exécutez les contrôles de bon fonctionnement à distance :

### A. Health Check
```bash
curl https://<nom-de-votre-site>.netlify.app/api/health
```
*Réponse attendue :* `HTTP 200 OK` avec `{"status":"ok","version":"1.0.0"}`.

### B. Statut Pilote
```bash
curl https://<nom-de-votre-site>.netlify.app/api/pilot/status
```
*Réponse attendue :* `HTTP 200 OK` avec les données de l'organisation `SECURIA PILOT`.

### C. Vérification de l'anti-spoofing des headers
```bash
curl -X POST https://<nom-de-votre-site>.netlify.app/api/pilot/reset \
  -H "x-user-id: fa000000-0000-0000-0000-000000000013" \
  -H "x-user-role: SECURITY_MANAGER"
```
*Réponse attendue :* `HTTP 401` ou `HTTP 403` (l'usurpation sans session GoTrue est immédiatement bloquée).

---

## 10. Tests Multi-Appareils (Scénario Opérationnel Réel)

Préparez trois terminaux physiques connectés à des réseaux distincts :

```text
📱 APPAREIL 1 : SMARTPHONE CLIENT (Connexion 4G/5G)
   URL : https://<nom-de-votre-site>.netlify.app/dashboard
   Compte : client.pilote@securia.org
   Mot de passe : PilotPass2026!

💻 APPAREIL 2 : POSTE DE COMMANDE SOC (Connexion Wi-Fi / Fibre)
   URL : https://<nom-de-votre-site>.netlify.app/dispatch
   Compte : soc.pilote@securia.org
   Mot de passe : PilotPass2026!

📱 APPAREIL 3 : SMARTPHONE AGENT DE SÉCURITÉ (Connexion 4G/5G)
   URL : https://<nom-de-votre-site>.netlify.app/agent
   Compte : agent.pilote@securia.org
   Mot de passe : PilotPass2026!
```

### Déroulement du Scénario :
1. **Étape 1 — Déclenchement :** Le Client appuie 3 secondes sur le bouton SOS d'urgence (`/dashboard`).
2. **Étape 2 — Notification SOC :** Le SOC voit l'alerte apparaître instantanément sur sa console (`/dispatch`).
3. **Étape 3 — Prise en charge :** L'opérateur SOC clique sur **"Acquitter"** (statut passe à `ACKNOWLEDGED`).
4. **Étape 4 — Affectation :** Le SOC affecte la mission à l'Agent Pilote (statut `ASSIGNED`).
5. **Étape 5 — Réception Agent :** Le smartphone de l'agent sonne et affiche la mission (`/agent`).
6. **Étape 6 — Acceptation & Départ :** L'agent clique sur **"Accepter"**, puis **"En route"** (statut `EN_ROUTE`).
7. **Étape 7 — Arrivée :** L'agent confirme son arrivée sur site (statut `ARRIVED`).
8. **Étape 8 — Rapport & Clôture :** L'agent saisit le rapport d'intervention et valide la résolution (statut `RESOLVED`).
9. **Étape 9 — Confirmation Client :** Le smartphone du Client affiche en temps réel la clôture et la chronologie certifiée.

---

## 11. Dépannage (Troubleshooting)

### Problème : Erreur 500 sur les appels API ou le statut pilote
* **Cause :** Variable `SUPABASE_SERVICE_ROLE_KEY` manquante ou restreinte au mauvais scope.
* **Résolution :** Rendez-vous dans Netlify > *Site configuration* > *Environment variables*, vérifiez que `SUPABASE_SERVICE_ROLE_KEY` est bien présente pour le scope *Functions* et relancez un déploiement (*Trigger deploy* > *Clear cache and deploy site*).

### Problème : La carte tactique n'affiche pas les tuiles sombres
* **Cause :** Blocage CSP ou restrictions réseau.
* **Résolution :** Le fichier `next.config.ts` inclut déjà les serveurs ArcGIS et OpenStreetMap dans `img-src`. Vérifiez que l'appareil dispose d'un accès Internet sortant.

### Problème : Supabase Realtime ne synchronise pas instantanément sur mobile
* **Cause :** Mode économie d'énergie du smartphone fermant les WebSockets ou pare-feu mobile restreignant le protocole `wss://`.
* **Résolution :** Le composant `useRealtime` active automatiquement le fallback polling adaptatif (rafraîchissement HTTP toutes les 3 à 5 secondes). Le système reste 100% opérationnel même en l'absence de WebSockets.

---

## 12. Procédure de Rollback

En cas d'anomalie détectée en Staging :

1. Dans le tableau de bord Netlify, rendez-vous dans l'onglet **"Deploys"**.
2. Recherchez le dernier déploiement fonctionnel validé dans l'historique.
3. Cliquez sur les options du déploiement (`...`) et sélectionnez **"Publish deploy"**.
4. Le retour en arrière est instantané (moins de 2 secondes) et ne nécessite aucune recompilation.
