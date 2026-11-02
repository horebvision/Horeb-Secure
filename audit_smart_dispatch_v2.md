# 🛡️ RAPPORT D'AUDIT PRÉ-IMPLÉMENTATION — SECURIA V2
## PHASE 1 : SMART DISPATCH ENGINE

**Date :** 29 septembre 2026  
**Auteur :** Antigravity Agentic Assistant  
**Projet :** SECURIA V2 — Évolution incrémentale du Dispatch  
**Règle absolue :** Non-régression totale de SECURIA V1 en production  

---

## 1. Audit de l'Architecture & des Données Existantes (V1)

### 1.1 Tables de Données et Schéma PostgreSQL

L'introspection directe de la base de données de production (`gwxchazcuosajziampvk.supabase.co`) confirme les structures exactes suivantes :

| Table Existante | Colonnes Principales | Rôle dans le Smart Dispatch V2 |
| :--- | :--- | :--- |
| **`public.organizations`** | `id`, `name`, `code`, `is_active` | **Isolation stricte** : Chaque alerte et chaque agent appartient à une organisation. Le moteur doit filtrer par `organization_id`. |
| **`public.users`** | `id`, `email`, `full_name`, `phone`, `role`, `organization_id`, `is_active` | Profil utilisateur et rôle (`AGENT`, `SECURITY_MANAGER`, `ADMIN`, `USER`). |
| **`public.security_agents`** | `id`, `user_id`, `organization_id`, `badge_number`, `duty_status`, `patrol_vehicle`, `current_latitude`, `current_longitude`, `last_location_update`, `is_active` | **Fiche opérationnelle agent** : Contient déjà la position GPS temps réel, l'horodatage de mise à jour et le statut de service. **Aucun besoin d'ajouter de nouvelles colonnes GPS.** |
| **`public.alerts`** | `id`, `alert_number`, `user_id`, `site_id`, `organization_id`, `assigned_agent_id`, `intervention_id`, `type`, `priority`, `status`, `latitude`, `longitude`, `location_address` | **Dossier incident** : Point de départ de l'assignation. Contient les coordonnées GPS de l'incident et l'agent assigné. |
| **`public.interventions`** | `id`, `alert_id`, `agent_id`, `status`, `assigned_at`, `accepted_at`, `en_route_at`, `arrived_at`, `resolved_at`, `report` | **Cycle d'intervention** : Statuts (`PENDING`, `ACCEPTED`, `EN_ROUTE`, `ON_SITE`, `COMPLETED`, `ABORTED`). Permet de calculer la **charge actuelle (workload)** de chaque agent. |
| **`public.alert_events`** | `id`, `alert_id`, `actor_id`, `from_status`, `to_status`, `event_type`, `comment`, `metadata`, `created_at` | Journalisation immuable des événements d'alerte (notamment `AGENT_ASSIGNED`). |
| **`public.notifications`** | `id`, `user_id`, `title`, `message`, `type`, `link`, `is_read`, `created_at`, `alert_id`, `agent_id`, `role` | Notification en temps réel de l'agent désigné pour acceptation/refus. |
| **`public.protected_sites`** | `id`, `owner_id`, `organization_id`, `name`, `latitude`, `longitude`, `address`, `access_instructions` | Données de site avec coordonnées GPS servant de fallback si l'appareil client n'a pas de fix GPS. |

> [!IMPORTANT]
> **Conclusion sur le Schéma :**  
> Les colonnes nécessaires au Smart Dispatch (`current_latitude`, `current_longitude`, `last_location_update`, `duty_status`, `organization_id`) **existent déjà toutes** dans `security_agents`. **Aucune migration DDL altérant ou dupliquant ces champs n'est requise.** Une migration légère d'indexes de performance peut être proposée si nécessaire.

---

### 1.2 Statuts Opérationnels Réels des Agents

Dans PostgreSQL (Type énuméré `agent_duty_status`), les statuts réels sont :

```
             +----------------+
             |    OFF_DUTY    | (Hors service / non éligible)
             +----------------+
                     |
            (Prise de poste)
                     v
             +----------------+
      +----> |   AVAILABLE    | (En patrouille / Éligible prioritaire)
      |      +----------------+
      |              |
(Mission clôturée) (Mission affectée)
      |              v
      |      +----------------+
      |      |   DISPATCHED   | (Mission notifiée, en attente d'acceptation ou en route)
      |      +----------------+
      |              |
      |        (Arrivé sur site)
      |              v
      |      +----------------+
      +----- |      BUSY      | (Sur site, en cours d'intervention)
             +----------------+
```

- `AVAILABLE` : **Candidat prioritaire** (Score max disponibilité).
- `DISPATCHED` : Candidat si multi-intervention permise, sinon pénalisé ou exclu selon configuration.
- `BUSY` : Déjà engagé sur les lieux d'un incident (pénalisé ou exclu).
- `OFF_DUTY` : **Exclu d'office** (non opérationnel).

---

### 1.3 Système Géospatial & Estimation d'Arrivée (ETA) Existants

Le fichier [`src/lib/geo/geo-engine.ts`](file:///c:/Users/HP%20ELTEBOO/Desktop/Securia/src/lib/geo/geo-engine.ts) fournit déjà les algorithmes certifiés :
1. `calculateHaversineDistance(coord1, coord2)` : Calcul orthodromique précis au mètre près.
2. `estimateArrivalTime(distanceKm, isEmergency)` :
   - Vitesse d'urgence paramétrée à **50 km/h** en zone urbaine.
   - Vitesse standard à **35 km/h**.
   - Marge trafic de **+15%**.
   - Temps incompressible minimum de **1 minute**.

> [!TIP]
> Nous allons centraliser les constantes de vitesse et seuils de dispatch dans un fichier de configuration unique : [`src/lib/dispatch/dispatch-config.ts`](file:///c:/Users/HP%20ELTEBOO/Desktop/Securia/src/lib/dispatch/dispatch-config.ts) afin qu'aucune constante ne soit dispersée dans le code.

---

### 1.4 Système d'Assignation Existant (`POST /api/alerts/assign`)

1. **Procédure RPC Supabase :** `assign_agent_to_alert(p_alert_id, p_agent_id, p_dispatcher_id, p_notes)`.
2. **Fallback Applicatif dans l'API :**
   - Résout l'agent (`security_agents`).
   - Met à jour `alerts` (`status = 'ASSIGNED'`, `assigned_agent_id = targetAgentId`).
   - Met à jour `security_agents.duty_status = 'BUSY'`.
   - Insère un événement dans `alert_events` (`AGENT_ASSIGNED`).
   - Déclenche `NotificationService.send()` pour l'agent (`type: 'AGENT_ASSIGNED'`, lien `/agent`).

#### Vulnérabilités & Lacunes Identifiées dans V1 :
1. **Risque de Race Condition (Double Assignation) :** Deux dispatchers peuvent assigner la même alerte simultanément ou assigner un agent qui vient d'être pris par un autre incident une seconde plus tôt.
2. **Cloisonnement Organisationnel incomplet dans le fallback :** L'API actuelle ne valide pas explicitement que `agent.organization_id === alert.organization_id`.
3. **Absence de Moteur de Décision :** La modale d'assignation [`AssignAgentModal.tsx`](file:///c:/Users/HP%20ELTEBOO/Desktop/Securia/src/components/dispatch/AssignAgentModal.tsx) affiche une liste brute non ordonnée, sans score, sans ETA chiffrée et sans recommandation explicable.

---

## 2. Spécification Détaillée du Moteur Smart Dispatch V2

### 2.1 Algorithme de Scoring Multi-Critères (0 à 100 points)

Le score est déterministe et totalement explicable via la formule pondérée :

$$\text{Score Total} = S_{\text{dispo}} (30) + S_{\text{dist}} (30) + S_{\text{gps}} (15) + S_{\text{charge}} (15) + S_{\text{statut}} (10)$$

#### 1. Disponibilité Opérationnelle (30 points)
- `duty_status === 'AVAILABLE'` : **30 pts**
- `duty_status === 'DISPATCHED'` (sans intervention critique) : **10 pts**
- `duty_status === 'BUSY'` : **0 pt**
- `duty_status === 'OFF_DUTY'` : **0 pt (et exclusion)**

#### 2. Proximité Géographique (30 points)
- $d \le 1.0\text{ km}$ : **30 pts**
- $1.0\text{ km} < d \le 2.5\text{ km}$ : **25 pts**
- $2.5\text{ km} < d \le 5.0\text{ km}$ : **18 pts**
- $5.0\text{ km} < d \le 8.0\text{ km}$ : **10 pts**
- $8.0\text{ km} < d \le 12.0\text{ km}$ : **5 pts**
- $d > 12.0\text{ km}$ : **0 pt**
- Coordonnées GPS inconnues : **0 pt** + Alerte "GPS indisponible"

#### 3. Fraîcheur de la Balise GPS (15 points)
- $\Delta t < 30\text{ secondes}$ : **15 pts** (100% — Temps réel certifié)
- $30\text{s} \le \Delta t < 2\text{ minutes}$ : **12 pts** (80% — Récent)
- $2\text{min} \le \Delta t < 5\text{ minutes}$ : **8 pts** (50% — Acceptable)
- $5\text{min} \le \Delta t < 15\text{ minutes}$ : **3 pts** (20% — Ancien)
- $\Delta t \ge 15\text{ minutes}$ ou inconnu : **0 pt**

#### 4. Charge Opérationnelle / Workload (15 points)
- 0 intervention active : **15 pts** (100% de disponibilité)
- 1 intervention en cours (statut `PENDING` ou `ACCEPTED`) : **5 pts**
- $\ge 2$ interventions en cours : **0 pt** (Saturation)

#### 5. Statut & Véhicule d'Intervention (10 points)
- Compte agent actif + Véhicule motorisé rapide (voiture/moto) : **10 pts**
- Patrouille à pied ou sans véhicule spécifié : **5 pts**

---

### 2.2 Structure des Données de Recommandation

La fonction centrale `calculateDispatchScore(agent, alert, context)` et `recommendBestAgent(alertId)` produiront la structure typée suivante :

```typescript
export interface DispatchCandidate {
  agentId: string;
  userId: string;
  agentName: string;
  badgeNumber: string;
  phone: string;
  patrolVehicle: string;
  dutyStatus: AgentDutyStatus;
  
  // Métriques géographiques
  distanceKm: number | null;
  formattedDistance: string;
  estimatedArrivalMinutes: number | null;
  formattedEta: string;
  
  // Télémétrie GPS
  hasGps: boolean;
  gpsAgeSeconds: number | null;
  gpsFreshnessLabel: string;
  
  // Charge
  activeInterventionsCount: number;
  
  // Scoring
  totalScore: number; // 0 à 100
  scoreBreakdown: {
    availability: number;
    distance: number;
    gpsFreshness: number;
    workload: number;
    operationalStatus: number;
  };
  
  // Explications SOC
  reasons: string[];
  warnings: string[];
  isEligible: boolean;
}

export interface SmartDispatchRecommendation {
  alertId: string;
  alertNumber: string;
  organizationId: string;
  recommendedAgent: DispatchCandidate | null;
  candidates: DispatchCandidate[];
  generatedAt: string;
}
```

---

## 3. Plan d'Implémentation Étape par Étape

```
[ÉTAPE 1 : Audit]  ===> Terminé (Ce rapport)
       ↓
[ÉTAPE 2 : Rapport d'Audit & Validation] ===> En cours de transmission
       ↓
[ÉTAPE 3 : Architecture Code & Moteur de Scoring]
       ├── src/lib/dispatch/dispatch-types.ts
       ├── src/lib/dispatch/dispatch-config.ts
       ├── src/lib/dispatch/dispatch-distance.ts
       ├── src/lib/dispatch/dispatch-score.ts
       └── src/lib/dispatch/dispatch-engine.ts
       ↓
[ÉTAPE 4 & 5 : Récupération Candidats & Moteur de Recommandation]
       └── Intégration filtrage strict par organization_id et exclusion agents inactifs
       ↓
[ÉTAPE 6 : API Serveur Sécurisée]
       └── GET /api/dispatch/recommendation?alert_id=...
       ↓
[ÉTAPE 7 : UI SOC / Dispatch]
       └── Refonte de AssignAgentModal.tsx & Intégration sur le Dashboard SOC
           - Bloc "AGENT RECOMMANDÉ" avec Score 0-100, ETA, Distance, Raisons
           - Liste des "AUTRES AGENTS"
           - Bouton "CHOISIR MANUELLEMENT" pour préserver le contrôle humain
       ↓
[ÉTAPE 8 : Sécurisation de l'Assignation (Anti-Race Condition)]
       └── Renforcement de POST /api/alerts/assign avec vérification atomique :
           - Même organisation
           - Alerte non encore assignée
           - Agent non pris entre-temps
       ↓
[ÉTAPE 9 & 10 : Notifications & Synchronisation Realtime / Polling Fallback]
       └── Écoute des mises à jour agents/interventions pour recalcul dynamique
       ↓
[ÉTAPE 11 : Intégration Cartographique Leaflet]
       └── Mise en valeur visuelle de l'agent recommandé sur TacticalDispatchMap
       ↓
[ÉTAPE 12 & 13 : Campagne de Tests Unitaires et End-to-End]
       └── 24 scénarios de test (proximité, surcharge, offline, race condition, multi-org)
       ↓
[ÉTAPE 14 & 15 : Build Production & Rapport Final de Clôture]
```

---

## 4. Matrice de Non-Régression V1

| Composant V1 Existant | Risque de Régression | Mesure de Protection Stricte |
| :--- | :--- | :--- |
| **Panic Button Client (`USER`)** | Nul | Aucun fichier client modifié. L'API `POST /api/alerts` reste inchangée. |
| **Console Agent (`AGENT`)** | Faible | Conservation intégrale de `GET /api/agent/dashboard` et du format de notification `MISSION_ASSIGNED`. |
| **Assignation Manuelle SOC** | Nul | L'opérateur SOC conserve toujours le choix manuel de n'importe quel agent éligible. |
| **Cartographie Leaflet** | Nul | Les couches existantes (sites, patrouilles, alertes) sont intégralement conservées. |
| **Supabase Realtime & Polling** | Nul | Le hook `useRealtimeSubscription` (canal `alerts` et `interventions`) reste le canal primaire. |
| **Isolation Multi-Organisation** | Zéro Tolérance | Vérification côté serveur obligatoire sur `organization_id`. |
| **Service Role Key** | Sécurité | Utilisée strictement côté serveur dans les Server Components et API Routes. |
