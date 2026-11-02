# ARCHITECTURE AGENT OFFLINE-FIRST (PHASE 7)

## 1. Objectif Terrain

Les agents de sécurité opèrent fréquemment dans des conditions de connectivité dégradées (2G/3G instable, sous-sols de centres commerciaux, parkings souterrains, zones blanches).

L'architecture Offline-First permet à l'agent de :
1. Consulter les détails d'une mission précédemment affectée.
2. Signaler son statut opérationnel (`ARRIVED`, `RESOLVED`).
3. Enregistrer des coordonnées GPS matérielles horodatées.
4. Remplir la checklist et rédiger des notes de rapport.
5. Capturer et compresser des photos de constat terrain.

---

## 2. Stockage Local Sécurisé (IndexedDB)

La base `securia_agent_db` comprend 5 magasins d'objets (ObjectStores) :
1. **`missions`** (Key: `id`) : Cache des interventions actives et archivées de l'agent.
2. **`outbox`** (Key: `client_event_id`) : File d'attente des opérations à synchroniser vers le serveur.
3. **`gps_queue`** (Key: auto-increment `id`) : Relevés GPS locaux en attente de synchronisation.
4. **`draft_reports`** (Key: `intervention_id`) : Rapports intermédiaires non finalisés.
5. **`offline_photos`** (Key: `id`) : Photos compressées (max 1024px, JPEG 0.75) associées aux interventions.

---

## 3. Règle Critique : Zéro Fausse Confirmation

> [!WARNING]
> L'interface agent n'affiche **JAMAIS** *"Rapport envoyé"* ou *"Statut confirmé"* lorsque l'appareil est hors ligne.
> Le message affiché est explicitement :
> *"Enregistré sur l'appareil — en attente de synchronisation"* avec badge orange.
> Ce n'est qu'après accusé de réception du serveur que le badge passe au vert *"Synchronisé"*.

---

## 4. Purge des Données au Logout

Pour prévenir toute fuite de données lors d'un changement de session sur un appareil partagé :
- L'appel à `authService.signOut()` invoque automatiquement `offlineDb.clearAllUserData()`.
- L'ensemble des tables IndexedDB est réinitialisé à vide avant la déconnexion.
