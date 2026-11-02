# SECURIA V2 — PHASE 4 : EXPORT CENTER, SIGNATURE ÉLECTRONIQUE & WEBHOOKS PARTENAIRES

## 1. Vue d'Ensemble & Architecture

La Phase 4 élève la plateforme SECURIA au standard industriel pour la distribution automatisée et la certification des preuves d'intervention :

```
                    SECURIA CORE PLATFORM
                              |
        +---------------------+---------------------+
        |                     |                     |
   EXPORT CENTER       SIGNATURE TACTILE     PARTNER WEBHOOKS
        |                     |                     |
        v                     v                     v
   Archive ZIP/CSV       POI Numérique          Assurances
 (27 cols + PDFs)     (Hash SHA-256 + PDF)   (HMAC-SHA256 + Retries)
        |                     |                     |
        +---------------------+---------------------+
                              |
                         AUDIT TRAIL
```

---

## 2. Module A — Export Center

### Capacités
- **Filtrage serveur multi-critères :** Période (début / fin), Site protégé, Type d'incident, Criticité, Statut d'intervention, Respect SLA, Agent patrouilleur, Recherche textuelle.
- **Limitation sécurisée :** Plafond serveur à 500 interventions par requête pour protéger la mémoire.
- **Récapitulatif CSV :** 27 colonnes minimales certifiées (RFC 4180 avec BOM UTF-8 `\uFEFF` pour compatibilité Excel internationale).
- **Archive ZIP Structurée :**
  - `/manifest.csv`
  - `/reports/REPORT-XXXX.pdf` (génération vectorielle PDF avec cachets d'intégrité)
  - `/photos/REPORT-XXXX/` (photos haute définition avec horodatage si autorisées)
- **Sécurité des Téléchargements :**
  - Jetons HMAC éphémères (`download_token`) liés à l'organisation et au job d'export.
  - Rétention temporaire stricte de 24h avec statut `EXPIRED`.
- **Interfaces :**
  - Supervision SOC : `/dispatch/exports`
  - Espace Client : `/client-portal/interventions` (bouton *Exporter mes interventions*)

---

## 3. Module B — Signature Électronique Tactile

### Capacités
- **Composant SignaturePad :** Interface tactile mobile-first adaptée aux smartphones et tablettes des clients ou résidents sur site.
- **Consentement Égalitaire Obligatoire :** Case à cocher obligatoire avant toute capture du tracé de signature.
- **Empreinte Cryptographique :** Hash SHA-256 canonique incluant `intervention_id`, `report_version`, `signer_name`, `signer_role`, `signed_at`, `consent_text` et l'en-tête du tracé.
- **Immutabilité & Versioning :** Interdiction d'écraser silencieusement un rapport déjà signé. Toute modification ultérieure requiert une incrémentation de version (`report_version: 2, 3...`).
- **Section 10 PDF :** Intégration dans le Proof of Intervention PDF de la section *Signature Électronique*, avec nom, rôle, date, heure, empreinte numérique, tracé visuel et clause de réserve juridique.
- **Révocation Auditable :** Révocation motivée réservée aux superviseurs SOC avec traçabilité intégrale (`SIGNATURE_REVOKED`).

---

## 4. Module C — Webhooks Partenaires (Assurances & Systèmes Tiers)

### Capacités
- **Gestion des Partenaires :** Configuration sécurisée pour compagnies d'assurance (`INSURER`), systèmes clients (`CLIENT_SYSTEM`), et partenaires sécurité (`SECURITY_PARTNER`).
- **Secret HMAC :** Génération cryptographique (`whsec_...`), affichage unique lors de la création ou rotation, aucun stockage en clair dans les logs ou le frontend.
- **Signature & Anti-Rejeu :**
  - En-tête `X-SECURIA-Signature` : Signature HMAC-SHA256 hexadécimale du message `timestamp.payload`.
  - En-tête `X-SECURIA-Timestamp` : Horodatage Unix en millisecondes avec fenêtre anti-rejeu stricte de 300 secondes (5 minutes).
- **Idempotence :** Contrainte d'unicité `partner_id + event_id` sur la table `webhook_deliveries`.
- **Moteur de Réessai avec Backoff Exponentiel :**
  - Réessai automatique sur codes d'erreur 408, 429, 500, 502, 503, 504 et timeouts réseau.
  - Paliers : 30 secondes, 2 minutes, 10 minutes, 30 minutes, 2 heures (5 essais maximum).
- **Protection Anti-SSRF :**
  - HTTPS strictement obligatoire.
  - Blocage total des adresses de métadonnées cloud (`169.254.169.254`), réseaux privés RFC 1918 (`10.x`, `192.168.x`, `172.16.x`), domaines internes (`.local`, `.internal`, `.lan`).
- **Événements Supportés :** `REPORT_VALIDATED`, `REPORT_SIGNED`, `INTERVENTION_RESOLVED`.
- **Interface Partenaires :** `/dispatch/integrations` (alias `/settings/integrations`).

---

## 5. Guide Opérateur & Administrateur

### Comment Exporter des Rapports ?
1. Rendez-vous sur `/dispatch/exports` depuis le menu de navigation du Command Center.
2. Définissez la période souhaitée et appliquez vos filtres (Site, Statut, SLA, Agent).
3. Consultez la prévisualisation instantanée (nombre d'interventions, SLA respectés / dépassés).
4. Cliquez sur **Générer l'Archive ZIP & CSV**.
5. Cliquez sur **Télécharger l'Archive Sécurisée** dès la fin de l'assemblage.

### Comment Signer Électroniquement une Intervention ?
1. Le client accède à son intervention sur `/client-portal/interventions/[id]`.
2. Si le rapport est clôturé, la section **Signature Électronique du Rapport** apparaît.
3. Le signataire vérifie son nom et son rôle (Client / Représentant).
4. Il coche obligatoirement : *"Je confirme avoir pris connaissance des informations..."*.
5. Il appose sa signature au doigt sur le pavé tactile.
6. Il clique sur **Signer et valider le rapport**.
7. Le rapport est immédiatement certifié et le PDF signé devient téléchargeable.

### Comment Configurer un Partenaire Webhook ?
1. Rendez-vous sur `/dispatch/integrations`.
2. Cliquez sur **+ Nouveau Partenaire**.
3. Renseignez le nom de la compagnie d'assurance ou du partenaire.
4. Saisissez l'URL de notification (HTTPS obligatoire).
5. Cochez les événements souhaités (`REPORT_VALIDATED`, `REPORT_SIGNED`, etc.).
6. Cliquez sur **Générer & Activer**.
7. **IMPORTANT :** Copiez immédiatement le secret HMAC affiché. Il ne sera plus jamais visible.

### Comment Tester un Webhook ?
1. Sur `/dispatch/integrations`, repérez le partenaire.
2. Cliquez sur le bouton **Tester**.
3. Un événement synthétique marqué `"test": true` est immédiatement signé et expédié.
4. Le code HTTP de réponse et le résultat s'affichent instantanément.

### Comment Roter un Secret Webhook ?
1. Cliquez sur le bouton **Secret** du partenaire.
2. Confirmez l'avertissement de rotation.
3. Le nouveau secret HMAC est généré, l'ancien est immédiatement révoqué, et le nouveau secret est affiché pour copie.

### Comment Réessayer une Livraison Échouée ?
1. Cliquez sur **Livraisons** pour ouvrir le journal des envois.
2. Repérez la livraison en statut `FAILED` ou `RETRYING`.
3. Cliquez sur **Réessayer** pour relancer immédiatement une expédition signée.
