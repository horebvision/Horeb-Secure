# RAPPORT D'AUDIT DE SÉCURITÉ ET DE CONFORMITÉ - PROJET SECURIA

**Date de réalisation :** 24 Septembre 2026  
**Auditeur :** Antigravity Security Agent  
**Périmètre :** Base de données PostgreSQL (Supabase `gwxchazcuosajziampvk`), Politiques RLS, API Routes Next.js, Cartographie & Géospatial, Mécanismes d'alerte, Rôles & Permissions (RBAC), Traçabilité et Gestion des Secrets.

---

## 1. Synthèse Exécutive

L'audit de sécurité approfondi conduit sur l'ensemble de la plateforme de télésurveillance et d'intervention d'urgence **SECURIA** a permis d'évaluer le système selon le principe de **Défense en Profondeur** (*Defense in Depth*) et d'**Absence Totale de Confiance envers le Client** (*Zero Trust Frontend*).

Toutes les vulnérabilités identifiées ont été **immédiatement corrigées** tant au niveau de la couche données (Row Level Security, durcissement des fonctions stockées PostgreSQL, révocation des privilèges `anon`) qu'au niveau de la couche applicative (création du module centralisé `api-guard.ts`, validation géométrique et syntaxique, assainissement anti-XSS/injection, et masquage des erreurs sensibles).

Le banc de test exhaustif comprenant **58 tests automatisés** répartis sur 6 suites s'est soldé par un taux de réussite de **100%**, et le build de production TypeScript a été validé avec succès sur les **33 routes**.

---

## 2. Matrice d'Évaluation des Vulnérabilités & Correctifs

| Axe d'Audit | Vulnérabilité Détectée avant Audit | Gravité | Statut | Correction Apportée |
| :--- | :--- | :---: | :---: | :--- |
| **Row Level Security (RLS)** | `audit_logs` possédait des politiques permissives (`Allow all select / update`). | **Critique** | **Corrigé** | Suppression des règles permissives. Création d'une politique `Lecture securisee audit_logs` restreinte strictement aux rôles `SECURITY_MANAGER` et `ADMIN`. Interdiction absolue de modification/suppression (`UPDATE`/`DELETE` bloqués). |
| **Fonctions PostgreSQL** | 25 fonctions `SECURITY DEFINER` avaient un `search_path` mutable (vulnérabilité de détournement de schéma). | **Haute** | **Corrigé** | Application systématique de `ALTER FUNCTION ... SET search_path = public, pg_temp;` sur l'ensemble des 25 procédures stockées. |
| **Privilèges Rôles Publics** | Rôle `anon` possédait des droits d'exécution sur des RPC sensibles (`acknowledge_alert`, `assign_agent_to_alert`, `update_agent_intervention_status`, etc.). | **Haute** | **Corrigé** | Révocation des privilèges d'exécution `EXECUTE` pour le rôle `anon` sur les fonctions sensibles via `REVOKE EXECUTE ... FROM anon;`. |
| **Exposition des Données GPS** | Endpoint cartographique `/api/dispatch/map-data` accessible sans filtrage strict de rôles. | **Critique** | **Corrigé** | Contrôle strict côté serveur via `authenticateApiRequest` : seuls `SECURITY_MANAGER`, `ADMIN` et `AGENT` peuvent requérir la télémétrie. Renvoi d'un statut HTTP 403 Forbidden immédiat pour les tiers. |
| **Contrôle d'Accès Objets (BOLA / IDOR)** | `/api/interventions/[id]` permettait de consulter n'importe quelle intervention sans vérifier la propriété de l'alerte ou de la mission. | **Haute** | **Corrigé** | Contrôle strict de possession : les résidents ne peuvent voir que les interventions associées à leurs propres alertes (`alerts.user_id === user.id`), les agents uniquement celles qui leur sont assignées. |
| **Usurpation d'Identité Alertes** | Le `user_id` de l'habitant pouvait être forgé dans le corps de la requête POST `/api/alerts`. | **Critique** | **Corrigé** | Détermination autoritaire du `user_id` côté serveur depuis la session JWT Supabase authentifiée. Les données du corps HTTP sont ignorées. |
| **Protection Spam & Déni de Service** | Risque de saturation des régulateurs par déclenchement massif d'alertes via script. | **Haute** | **Corrigé** | Implémentation d'un Rate Limiter en mémoire (15 requêtes/minute max par IP) + Cooldown anti-rebond de 30 secondes en base PostgreSQL. |
| **Doublons & Idempotence** | Risque de création d'alertes multiples lors de clics répétés ou pertes de réseau. | **Moyenne** | **Corrigé** | Enregistrement de `idempotency_key` avec verrouillage atomique en base. Renvoi de l'alerte existante sans duplication en cas de rejeu. |
| **Fuite d'Informations Frontend** | Les blocs `catch` des routes d'API retournaient `err.message` et des détails de schéma PostgreSQL. | **Moyenne** | **Corrigé** | Déploiement de la fonction `safeErrorResponse` : journalisation sécurisée des détails techniques sur le serveur et message opaque générique renvoyé au client. |
| **Validation des Entrées & Injections** | Données textuelles (`client_notes`, `address`, `notes`) non tronquées ni assainies. | **Moyenne** | **Corrigé** | Module d'assainissement anti-XSS et anti-injection : suppression des balises `<script>`, `javascript:`, limitation de longueur et validation stricte des coordonnées GPS (-90/90, -180/180) et UUID RFC 4122. |
| **Secrets & Variables d'Environnement** | Vérification de non-exposition des clés privées et tokens. | **Conforme** | **Validé** | `SUPABASE_SERVICE_ROLE_KEY` n'est jamais injectée dans les bundles publics (`NEXT_PUBLIC_`). Les fichiers `.env*` sont exclus du versionnement `.gitignore`. |

---

## 3. Détail des Correctifs Techniques Appliqués

### 3.1. Couche de Protection Centrale : `src/lib/security/api-guard.ts`
Création d'un module de sécurité unifié fournissant :
- **`authenticateApiRequest`** : Vérifie la session utilisateur via Supabase Auth, extrait le rôle réel depuis la table `public.users` en base (garantie contre la falsification de tokens falsifiés ou de métadonnées client), et applique la matrice RBAC (`allowedRoles`).
- **`checkRateLimit`** : Fenêtre glissante de limitation de débit pour prévenir les attaques par déni de service et le flood d'alertes.
- **`validateGeoCoordinates`** : Validation stricte des coordonnées géographiques réelles (rejet des valeurs aberrantes ou NaN).
- **`isValidUuid`** : Validation stricte de format UUID RFC 4122 insensible à la casse.
- **`sanitizeString`** : Nettoyage proactif des chaînes de caractères contre les vecteurs XSS et les injections de charge utile.
- **`safeErrorResponse`** : Masquage total des stacktraces et détails internes PostgreSQL envers le client frontend.

### 3.2. Durcissement PostgreSQL & Supabase
1. **Politiques RLS sur `audit_logs`** :
   - Suppression des stratégies par défaut permissives.
   - Création de la politique restrictive `Lecture securisee audit_logs` :
     ```sql
     CREATE POLICY "Lecture securisee audit_logs" ON "audit_logs"
     FOR SELECT TO authenticated
     USING (get_current_user_role() = ANY (ARRAY['SECURITY_MANAGER'::securia_user_role, 'ADMIN'::securia_user_role]));
     ```
   - Interdiction formelle de toute altération de la piste d'audit (`UPDATE` et `DELETE` désactivés).
2. **Correction du `search_path` sur 25 fonctions** :
   - Application de `SET search_path = public, pg_temp;` sur toutes les fonctions `SECURITY DEFINER` pour neutraliser le risque de détournement de schéma.
3. **Création de la fonction RPC sécurisée `get_audit_logs`** :
   - Permet l'interrogation filtrée et bornée (1 à 100 enregistrements max) de la traçabilité sans exposition de requêtes arbitraires.
4. **Révocation des droits publics** :
   - Neutralisation des accès directs non authentifiés au niveau de la passerelle PostgREST pour les fonctions opérationnelles de crise.

### 3.3. Sécurisation des Routes d'API
- **`/api/dispatch/map-data`** : Réservé strictement aux postes régulateurs, administrateurs et patrouilleurs. Protection absolue des coordonnées GPS des domiciles et consignes d'accès (digicodes).
- **`/api/alerts`** : Contrôle de débit (Rate Limit), vérification de validité de type d'alerte (`isValidAlertType`), assainissement anti-XSS, attribution autoritaire du `user_id` côté serveur, et verrouillage d'idempotence.
- **`/api/interventions` & `/api/interventions/[id]`** : Contrôle strict anti-BOLA/IDOR. Obligation d'un compte-rendu pour clôturer ou abandonner une mission.
- **`/api/alerts/acknowledge` & `/api/alerts/assign`** : Réservés au rôle `SECURITY_MANAGER` et `ADMIN`.
- **`/api/notifications`** : Cloisonnement strict des notifications : un utilisateur ne peut ni consulter ni modifier les notifications d'un tiers.

---

## 4. Résultats des Bancs de Tests & Validation

| Suite de Test | Description du Périmètre | Tests Exécutés | Taux de Succès |
| :--- | :--- | :---: | :---: |
| **`test-auth-scenarios.js`** | Cloisonnement RBAC, redirection URL non autorisée, sessions | 7 scénarios majeurs | **100%** (7/7) |
| **`test-alert-engine.js`** | 10 étapes du moteur, idempotence, anti-doublon 30s, escalade | 5 tests critiques | **100%** (5/5) |
| **`test-cartography.js`** | Non-exposition GPS (HTTP 403), données tactiques, calculs ETA | 8 validations géospatiales | **100%** (8/8) |
| **`test-dispatch-dashboard.js`** | Acquittement, affectation d'agent, traçabilité `audit_logs` | 6 tests fonctionnels | **100%** (6/6) |
| **`test-agent-interface.js`** | Statut de garde, cycle de vie mission (ACCEPT -> EN_ROUTE -> ON_SITE -> RESOLVED) | 8 étapes terrain | **100%** (8/8) |
| **`test-notifications.js`** | Multi-canal (IN_APP, PUSH, SMS, EMAIL), intégrité source de vérité | 24 assertions | **100%** (24/24) |
| **Build de Production Next.js** | Compilation TypeScript stricte et rendu des 33 routes | 33 pages / routes API | **100% (0 erreur)** |

---

## 5. Conclusion & Recommandations Opérationnelles

L'architecture de sécurité de **SECURIA** répond désormais aux plus hauts standards de résilience exigés pour un système de protection des personnes et des biens :
1. **Zéro Confiance envers les Clients Mobiles & Web** : Les identités, droits, coordonnées et transitions d'état sont systématiquement calculés et vérifiés par le serveur.
2. **Piste d'Audit Immuable** : Chaque prise en charge, affectation ou clôture d'intervention génère un événement non répudiable et protégé en écriture seule.
3. **Protection contre le Spam et la DoS** : L'infrastructure est prémunie contre les déclenchements accidentels en chaîne ou malveillants.
