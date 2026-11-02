# SECURIA — Configuration des Variables d'Environnement Netlify

Ce document détaille les variables d'environnement nécessaires au fonctionnement de **SECURIA MVP v1.0.0** sur la plateforme **Netlify** en environnement **Staging / Pilote Réel Multi-Appareils**.

> ⚠️ **RÈGLE CRITIQUE DE SÉCURITÉ** :  
> Ne committez **JAMAIS** de secrets, tokens ou clés de service dans le code source ou dans les dépôts Git.  
> Les variables privées ne doivent jamais commencer par le préfixe `NEXT_PUBLIC_`.

---

## 1. Tableau de Référence des Variables d'Environnement

| Variable | Type | Utilisation | Obligatoire |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_APP_NAME` | **PUBLIC** (Client & Serveur) | Nom affiché de la plateforme (ex: `SECURIA`) | OUI |
| `NEXT_PUBLIC_APP_VERSION` | **PUBLIC** (Client & Serveur) | Version logicielle déployée (ex: `1.0.0`) | OUI |
| `NEXT_PUBLIC_APP_URL` | **PUBLIC** (Client & Serveur) | URL publique absolue Netlify sans slash final (ex: `https://votre-site.netlify.app`) | OUI |
| `NEXT_PUBLIC_APP_ENV` | **PUBLIC** (Client & Serveur) | Environnement d'exécution (`staging` ou `production`) | OUI |
| `NEXT_PUBLIC_SUPABASE_URL` | **PUBLIC** (Client & Serveur) | URL du projet Supabase pour requêtes REST & Realtime | OUI |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **PUBLIC** (Client & Serveur) | Clé publique anonyme Supabase régie par les règles RLS | OUI |
| `SUPABASE_SERVICE_ROLE_KEY` | **SERVEUR** (Secret Privé) | Clé administrative Supabase (Server Components, API routes, /api/pilot/reset) | OUI |
| `NODE_ENV` | **SERVEUR** (Automatique) | Défini à `production` par le moteur de build Netlify | OUI (Auto) |
| `ENABLE_TEST_AUTH` | **SERVEUR** (Optionnel) | Laisser à `false` ou absent en Staging/Pilote réel afin d'interdire l'usurpation via headers | NON (Défaut: false) |

---

## 2. Emplacement dans le Tableau de Bord Netlify

Pour configurer ces variables de façon sécurisée dans Netlify :

1. Connectez-vous à votre console [Netlify](https://app.netlify.com).
2. Sélectionnez votre site (ex: `securia-pilot`).
3. Accédez à **Site configuration** > **Environment variables**.
4. Cliquez sur **Add a variable** (ou **Import from a .env file**).
5. Renseignez chaque clé avec sa valeur respective.
6. Spécifiez les scopes appropriés :
   - Pour `NEXT_PUBLIC_*` : Scope `All scopes` (Builds, Functions, Post-processing).
   - Pour `SUPABASE_SERVICE_ROLE_KEY` : Scope `Functions` (Serverless Functions / API Routes) et `Builds`.
7. Enregistrez les modifications.

---

## 3. Procédure de Vérification Sécurisée (Sans Fuite de Valeurs)

Après déploiement, vérifiez la bonne détection des variables sans jamais afficher leur contenu sensible :

1. **Via la route de diagnostic Health Check :**
   ```bash
   curl -I https://votre-site.netlify.app/api/health
   ```
   - Doit répondre avec le code HTTP `200 OK`.
   - Le corps JSON confirme l'état de l'environnement (`"environment": { "ok": true }` en mode dev ou `"status": "ok"` en mode production).

2. **Via la route de supervision Pilote :**
   ```bash
   curl https://votre-site.netlify.app/api/pilot/status
   ```
   - Doit répondre avec le code HTTP `200 OK`.
   - Confirme `"system": { "api": "ONLINE", "database": "ONLINE", "auth": "OK" }`.

3. **Protection contre l'exposition :**
   - Ouvrez la console développeur de votre navigateur sur `https://votre-site.netlify.app`.
   - Tapez `window.process?.env`.
   - Seules les variables préfixées par `NEXT_PUBLIC_` sont visibles.
   - `SUPABASE_SERVICE_ROLE_KEY` est strictement absente et inaccessible côté navigateur.
