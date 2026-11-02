# CONFORMITÉ FISCALE & FACTURATION IMMUTABLE (PHASE 7)

## 1. Positionnement & Statut Réglementaire

> [!IMPORTANT]
> **TRANSPARENCE FISCALE & JURIDIQUE :**
> SECURIA n'allègue aucune certification DGI (Direction Générale des Impôts de Côte d'Ivoire) non validée officiellement.
> Tous les documents et métadonnées portent explicitement la mention :
> *"Configuration fiscale en attente de validation réglementaire"*.

---

## 2. Moteur Fiscal (TaxEngine)

- **Territoire de référence** : Côte d'Ivoire & zone UEMOA.
- **Taux de taxe standard** : TVA de 18% (`DEFAULT_CI_TAX_RATE = 0.18`).
- **Précision monétaire stricte** : Tous les calculs monétaires en Francs CFA (`XOF` / `FCFA`) sont arrondis à l'entier le plus proche (`Math.round`), éliminant tout artefact de calcul en virgule flottante IEEE 754.

### Exemple de calcul
- Montant HT : `49 000 FCFA`
- TVA 18% : `8 820 FCFA`
- Montant TTC : `57 820 FCFA`

---

## 3. Immuabilité & Scellé Cryptographique SHA-256

Dès qu'une facture quitte le statut `DRAFT` pour passer en `OPEN`, `PAID` ou `ISSUED` :
1. La propriété `is_immutable` est fixée à `true`.
2. Un scellé cryptographique SHA-256 est calculé :
   `SHA256(id : invoiceNumber : total : organizationId)`
3. Toute tentative ultérieure de modification de la facture via l'API ou le service métier lève l'exception `INVOICE_IS_IMMUTABLE` (HTTP 403).

---

## 4. Gestion des Avoirs (Credit Notes) et Annulations

Conformément aux règles de comptabilité générale :
- **Avoir (Credit Note)** : Pour toute réduction ou rectification, une note d'avoir officielle est émise avec un numéro au format `AVO-YYYY-XXXXXX`, un montant négatif, et un rattachement explicite à la facture d'origine (`original_invoice_id`).
- **Annulation formelle** : Le statut passe à `CANCELLED` avec mention du motif de l'annulation et de l'administrateur responsable dans le journal d'audit.

---

## 5. Spécifications du PDF Fiscal

Le générateur `FiscalPdfGenerator` produit des documents PDF vectoriels avec styles distincts selon le type de pièce :
- **FACTURE** : Entête professionnel, badge cyan, tableau des prestations en FCFA, mention légale émetteur et client.
- **FACTURE PROFORMA** : Filigrane proforma, badge bleu.
- **AVOIR** : Badge ambre, montants négatifs, référence à la facture d'origine.
- **FACTURE ANNULÉE** : Filigrane rouge *"ANNULÉE"*, motif de rejet consigné.
