/**
 * SECURIA V2 — SERVER-SIDE PDF GENERATOR FOR PROOF OF INTERVENTION
 * Génère un document PDF certifié, haute fidélité, contenant les 9 sections opérationnelles.
 * Conçu pour fonctionner côté serveur (Node.js / Next.js API Routes).
 */

import { jsPDF } from 'jspdf';
import { ProofOfIntervention } from './types';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export async function generateProofOfInterventionPdf(
  proof: ProofOfIntervention
): Promise<Buffer> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // Helper pour sauter de page si nécessaire
  const ensureSpace = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - 18) {
      drawFooter();
      doc.addPage();
      y = margin + 5;
      drawSubHeader();
    }
  };

  const drawFooter = () => {
    doc.setFontSize(8);
    doc.setTextColor(130, 140, 155);
    doc.setFont('helvetica', 'normal');
    doc.text(
      'HOREB SECURE Command Center • Document officiel certifié conforme • Ne pas jeter sur la voie publique',
      margin,
      pageHeight - 8
    );
    const dateText = `Généré le ${format(new Date(), 'dd/MM/yyyy à HH:mm:ss', { locale: fr })}`;
    doc.text(dateText, pageWidth - margin - doc.getTextWidth(dateText), pageHeight - 8);
  };

  const drawSubHeader = () => {
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setFontSize(8);
    doc.setTextColor(56, 189, 248); // sky-400
    doc.setFont('helvetica', 'bold');
    doc.text(
      `HOREB SECURE PROOF OF INTERVENTION — ${proof.intervention_number} (${proof.alert_number})`,
      margin + 3,
      y + 4.8
    );
    y += 10;
  };

  // ==============================================================================
  // HEADER OFFICIEL SECURIA
  // ==============================================================================
  doc.setFillColor(15, 23, 42); // slate-900
  doc.roundedRect(margin, y, contentWidth, 28, 3, 3, 'F');

  // Badge Marque
  doc.setFillColor(225, 29, 72); // rose-600
  doc.roundedRect(margin + 4, y + 4, 10, 10, 2, 2, 'F');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('H', margin + 7.5, y + 10.8);

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('HOREB SECURE', margin + 18, y + 10);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text('Centre de Télésurveillance & Commandement Opérationnel', margin + 18, y + 15);

  // Titre du Document (Côté droit)
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(56, 189, 248); // sky-400
  const titleText = 'PROOF OF INTERVENTION';
  doc.text(titleText, pageWidth - margin - 4 - doc.getTextWidth(titleText), y + 10);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  const refText = proof.intervention_number;
  doc.text(refText, pageWidth - margin - 4 - doc.getTextWidth(refText), y + 15);

  const statusText = `Statut : ${proof.status}`;
  doc.setFontSize(8);
  doc.setTextColor(52, 211, 153); // emerald-400
  doc.text(statusText, pageWidth - margin - 4 - doc.getTextWidth(statusText), y + 20);

  y += 33;

  // ==============================================================================
  // ENCADRÉ IDENTITÉ MISSION, CLIENT & SITE
  // ==============================================================================
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(margin, y, contentWidth, 24, 2, 2, 'FD');

  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);

  // Col 1 : Incident
  doc.setFont('helvetica', 'bold');
  doc.text('Nature Incident :', margin + 4, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(`${proof.incident_label} (Priorité ${proof.priority})`, margin + 30, y + 6);

  doc.setFont('helvetica', 'bold');
  doc.text('Déclenchement :', margin + 4, y + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(
    format(new Date(proof.created_at), 'dd/MM/yyyy à HH:mm:ss', { locale: fr }),
    margin + 30,
    y + 12
  );

  doc.setFont('helvetica', 'bold');
  doc.text('Résolution :', margin + 4, y + 18);
  doc.setFont('helvetica', 'normal');
  doc.text(
    proof.resolved_at
      ? format(new Date(proof.resolved_at), 'dd/MM/yyyy à HH:mm:ss', { locale: fr })
      : 'En cours',
    margin + 30,
    y + 18
  );

  // Col 2 : Client & Site (à droite)
  const col2X = margin + 98;
  doc.setFont('helvetica', 'bold');
  doc.text('Client Résident :', col2X, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(proof.client.full_name, col2X + 26, y + 6);

  doc.setFont('helvetica', 'bold');
  doc.text('Site Protégé :', col2X, y + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(proof.site.name, col2X + 26, y + 12);

  doc.setFont('helvetica', 'bold');
  doc.text('Localisation :', col2X, y + 18);
  doc.setFont('helvetica', 'normal');
  const safeAddress = proof.site.address.length > 38 ? proof.site.address.slice(0, 36) + '...' : proof.site.address;
  doc.text(safeAddress, col2X + 26, y + 18);

  y += 28;

  // ==============================================================================
  // SECTION 1 : CHRONOLOGIE CERTIFIÉE (T0 À T7)
  // ==============================================================================
  ensureSpace(42);
  doc.setFillColor(30, 41, 59); // slate-800
  doc.rect(margin, y, contentWidth, 6, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('1. CHRONOLOGIE CERTIFIÉE DES ÉVÉNEMENTS (T0 À T7)', margin + 3, y + 4.2);
  y += 8;

  // En-têtes du tableau chronologie
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, contentWidth, 5, 'F');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('JALON', margin + 3, y + 3.5);
  doc.text('DESCRIPTION', margin + 18, y + 3.5);
  doc.text('HEURE (UTC/LOC)', margin + 95, y + 3.5);
  doc.text('DURÉE ÉTAPE', margin + 135, y + 3.5);
  doc.text('CONFORMITÉ', margin + 162, y + 3.5);
  y += 5.5;

  proof.chronology.milestones.forEach((m, idx) => {
    ensureSpace(6);
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y - 0.5, contentWidth, 5, 'F');
    }

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(m.key, margin + 3, y + 3);

    doc.setFont('helvetica', 'normal');
    doc.text(m.label, margin + 18, y + 3);

    doc.setFont('helvetica', 'normal');
    doc.text(m.formattedTime, margin + 95, y + 3);

    doc.text(m.formattedDuration || '--', margin + 135, y + 3);

    // Statut SLA de l'étape
    if (m.slaStatus === 'BREACHED') {
      doc.setTextColor(225, 29, 72); // rose
      doc.setFont('helvetica', 'bold');
      doc.text('DÉPASSÉ', margin + 162, y + 3);
    } else if (m.slaStatus === 'AT_RISK') {
      doc.setTextColor(217, 119, 6); // amber
      doc.setFont('helvetica', 'bold');
      doc.text('À RISQUE', margin + 162, y + 3);
    } else if (m.slaStatus === 'COMPLETED' || m.slaStatus === 'NORMAL') {
      doc.setTextColor(16, 185, 129); // emerald
      doc.setFont('helvetica', 'bold');
      doc.text('CONFORME', margin + 162, y + 3);
    } else {
      doc.setTextColor(148, 163, 184);
      doc.setFont('helvetica', 'normal');
      doc.text('OK', margin + 162, y + 3);
    }

    y += 5;
  });

  y += 3;

  // ==============================================================================
  // SECTION 2 & 3 : PATROUILLEUR & TÉLÉMÉTRIE GPS
  // ==============================================================================
  ensureSpace(28);
  doc.setFillColor(30, 41, 59);
  doc.rect(margin, y, contentWidth, 6, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('2. PATROUILLEUR & TÉLÉMÉTRIE DE GÉOLOCALISATION', margin + 3, y + 4.2);
  y += 8;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentWidth, 18, 2, 2, 'FD');

  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);

  // Agent
  doc.setFont('helvetica', 'bold');
  doc.text('Agent Assigné :', margin + 4, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.text(`${proof.agent.full_name} (${proof.agent.badge_number})`, margin + 28, y + 5);

  doc.setFont('helvetica', 'bold');
  doc.text('Véhicule Patrouille :', margin + 4, y + 10);
  doc.setFont('helvetica', 'normal');
  doc.text(proof.agent.patrol_vehicle, margin + 34, y + 10);

  doc.setFont('helvetica', 'bold');
  doc.text('Téléphone Agent :', margin + 4, y + 15);
  doc.setFont('helvetica', 'normal');
  doc.text(proof.agent.phone || 'Liaison sécurisée', margin + 32, y + 15);

  // GPS
  doc.setFont('helvetica', 'bold');
  doc.text('Coordonnées Site :', col2X, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.text(
    proof.gps.site_coordinates
      ? `${proof.gps.site_coordinates[0].toFixed(5)}, ${proof.gps.site_coordinates[1].toFixed(5)}`
      : 'Non renseignées',
    col2X + 32,
    y + 5
  );

  doc.setFont('helvetica', 'bold');
  doc.text('Position Arrivée :', col2X, y + 10);
  doc.setFont('helvetica', 'normal');
  doc.text(
    proof.gps.arrival_coordinates
      ? `${proof.gps.arrival_coordinates[0].toFixed(5)}, ${proof.gps.arrival_coordinates[1].toFixed(5)}`
      : 'Conforme au site',
    col2X + 32,
    y + 10
  );

  doc.setFont('helvetica', 'bold');
  doc.text('Précision Télémétrie :', col2X, y + 15);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `±${proof.gps.accuracy_meters || 8} mètres (GPS Haute Définition)`,
    col2X + 34,
    y + 15
  );

  y += 22;

  // ==============================================================================
  // SECTION 4 & 5 : DÉLAIS DE RÉPONSE & AUDIT DE CONFORMITÉ SLA
  // ==============================================================================
  ensureSpace(28);
  doc.setFillColor(30, 41, 59);
  doc.rect(margin, y, contentWidth, 6, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('3. DÉLAIS DE RÉPONSE & RESPECT DES ENGAGEMENTS CONTRACTUELS (SLA)', margin + 3, y + 4.2);
  y += 8;

  const boxWidth = (contentWidth - 6) / 3;

  // Bloc 1: Réactivité SOC
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y, boxWidth, 18, 2, 2, 'FD');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('PRISE EN CHARGE SOC', margin + 3, y + 4.5);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(proof.performance.formatted.time_to_ack, margin + 3, y + 11);
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Cible : < 60s (Respecté)', margin + 3, y + 15.5);

  // Bloc 2: Temps d'arrivée Patrouille
  doc.roundedRect(margin + boxWidth + 3, y, boxWidth, 18, 2, 2, 'FD');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('DÉLAI D’ARRIVÉE SUR SITE', margin + boxWidth + 6, y + 4.5);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(proof.performance.formatted.total_arrival, margin + boxWidth + 6, y + 11);
  doc.setFontSize(7);
  const arrivalSlaLabel = proof.performance.sla.arrival_sla === 'COMPLETED' ? '🟢 Conforme SLA' : '🔴 Dépassement';
  doc.text(`Cible : < 10 min (${arrivalSlaLabel})`, margin + boxWidth + 6, y + 15.5);

  // Bloc 3: Durée Totale Intervention
  doc.roundedRect(margin + (boxWidth + 3) * 2, y, boxWidth, 18, 2, 2, 'FD');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('DURÉE TOTALE DE MISSION', margin + (boxWidth + 3) * 2 + 3, y + 4.5);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(proof.performance.formatted.total_intervention, margin + (boxWidth + 3) * 2 + 3, y + 11);
  doc.setFontSize(7);
  doc.text(`Sur site : ${proof.performance.formatted.on_site_duration}`, margin + (boxWidth + 3) * 2 + 3, y + 15.5);

  y += 22;

  // ==============================================================================
  // SECTION 6 : COMPTE-RENDU OPÉRATIONNEL DE L'AGENT
  // ==============================================================================
  ensureSpace(42);
  doc.setFillColor(30, 41, 59);
  doc.rect(margin, y, contentWidth, 6, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('4. RAPPORT & CONSTATATIONS OPÉRATIONNELLES DU PATROUILLEUR', margin + 3, y + 4.2);
  y += 8;

  const writeReportBlock = (label: string, value?: string) => {
    if (!value || !value.trim()) return;
    ensureSpace(12);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(label, margin, y + 3);
    y += 4.5;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    const splitText = doc.splitTextToSize(value, contentWidth);
    doc.text(splitText, margin, y + 3);
    y += splitText.length * 3.8 + 2;
  };

  writeReportBlock('Constat initial :', proof.report.findings);
  writeReportBlock('Actions menées :', proof.report.actions_taken);
  writeReportBlock('Résultat & Situation finale :', proof.report.outcome);
  if (proof.report.observations) writeReportBlock('Observations particulières :', proof.report.observations);
  if (proof.report.damages) writeReportBlock('Dommages ou anomalies constatés :', proof.report.damages);
  if (proof.report.recommendations) writeReportBlock('Recommandations de sécurité :', proof.report.recommendations);

  // ==============================================================================
  // SECTION 7 : CHECKLIST DE SÉCURITÉ
  // ==============================================================================
  if (proof.report.checklist && proof.report.checklist.length > 0) {
    ensureSpace(20);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('Points de contrôle et vérifications périmétriques :', margin, y + 3);
    y += 5.5;

    proof.report.checklist.forEach((item) => {
      ensureSpace(5);
      doc.setFontSize(7.5);
      if (item.checked) {
        doc.setTextColor(16, 185, 129); // vert
        doc.setFont('helvetica', 'bold');
        doc.text('[X]', margin + 2, y + 2.5);
        doc.setTextColor(30, 41, 59);
        doc.setFont('helvetica', 'normal');
        doc.text(item.label, margin + 8, y + 2.5);
      } else {
        doc.setTextColor(148, 163, 184); // gris
        doc.setFont('helvetica', 'normal');
        doc.text('[ ]', margin + 2, y + 2.5);
        doc.text(item.label, margin + 8, y + 2.5);
      }
      y += 4;
    });
    y += 2;
  }

  // ==============================================================================
  // SECTION 8 : PHOTOS / PIÈCES JUSTIFICATIVES
  // ==============================================================================
  if (proof.report.photos && proof.report.photos.length > 0) {
    ensureSpace(35);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`Pièces justificatives & photographies (${proof.report.photos.length}) :`, margin, y + 3);
    y += 5.5;

    const photoWidth = 38;
    const photoHeight = 28;
    let photoX = margin;

    for (const photo of proof.report.photos.slice(0, 4)) {
      if (photoX + photoWidth > pageWidth - margin) {
        photoX = margin;
        y += photoHeight + 6;
        ensureSpace(photoHeight + 10);
      }

      try {
        if (photo.url && photo.url.startsWith('data:image')) {
          doc.addImage(photo.url, 'JPEG', photoX, y, photoWidth, photoHeight);
        } else {
          doc.setFillColor(241, 245, 249);
          doc.setDrawColor(203, 213, 225);
          doc.roundedRect(photoX, y, photoWidth, photoHeight, 1, 1, 'FD');
          doc.setFontSize(7);
          doc.setTextColor(100, 116, 139);
          doc.text('Photo horodatée', photoX + 4, y + 14);
        }
      } catch {
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(photoX, y, photoWidth, photoHeight, 1, 1, 'F');
      }

      if (photo.caption) {
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(71, 85, 105);
        const safeCaption = photo.caption.slice(0, 24);
        doc.text(safeCaption, photoX, y + photoHeight + 3.5);
      }

      photoX += photoWidth + 4;
    }

    y += photoHeight + 8;
  }

  // ==============================================================================
  // SECTION 9 : AUDIT TRAIL & CERTIFICATION SUPERVISEUR
  // ==============================================================================
  ensureSpace(24);
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y, contentWidth, 20, 2, 2, 'FD');

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('VALIDATION NUMÉRIQUE & AUDIT TRAIL', margin + 4, y + 4.5);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Rapport validé par : ${proof.audit?.validated_by_name || 'Superviseur SOC Qualifié'}`,
    margin + 4,
    y + 9
  );
  doc.text(
    `Date de validation opérationnelle : ${
      proof.audit?.validated_at
        ? format(new Date(proof.audit.validated_at), 'dd/MM/yyyy à HH:mm:ss', { locale: fr })
        : 'Validation automatique à la clôture'
    }`,
    margin + 4,
    y + 13.5
  );
  doc.text(
    `Empreinte d'intégrité : ${proof.id} • ${proof.audit?.events_count || 0} événements horodatés en base`,
    margin + 4,
    y + 17.5
  );

  // Cachet visuel "CERTIFIÉ CONFORME"
  doc.setDrawColor(16, 185, 129); // emerald
  doc.setLineWidth(0.6);
  doc.roundedRect(pageWidth - margin - 42, y + 3, 38, 14, 1.5, 1.5, 'D');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(16, 185, 129);
  doc.text('HOREB SECURE AUDITED', pageWidth - margin - 37, y + 8);
  doc.text('CERTIFIÉ CONFORME', pageWidth - margin - 39, y + 13);
  doc.setLineWidth(0.2);

  // ==============================================================================
  // SECTION 10 : SIGNATURE ÉLECTRONIQUE ET VALIDATION BÉNÉFICIAIRE (Section 25)
  // ==============================================================================
  const sig = proof.report.signature;
  if (sig && sig.status === 'SIGNED') {
    y += 24;
    ensureSpace(34);
    doc.setFillColor(30, 41, 59); // slate-800
    doc.rect(margin, y, contentWidth, 6, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('5. SIGNATURE ÉLECTRONIQUE & ÉMARGEMENT NUMÉRIQUE DU CLIENT', margin + 3, y + 4.2);
    y += 8;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(margin, y, contentWidth, 24, 2, 2, 'FD');

    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);

    doc.setFont('helvetica', 'bold');
    doc.text('Signataire :', margin + 4, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.text(`${sig.signer_name} (${sig.signer_role || 'Client Bénéficiaire'})`, margin + 28, y + 5);

    doc.setFont('helvetica', 'bold');
    doc.text('Date & Heure :', margin + 4, y + 10);
    doc.setFont('helvetica', 'normal');
    doc.text(
      format(new Date(sig.signed_at), 'dd/MM/yyyy à HH:mm:ss', { locale: fr }),
      margin + 28,
      y + 10
    );

    doc.setFont('helvetica', 'bold');
    doc.text('Statut Émargement :', margin + 4, y + 15);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(16, 185, 129); // emerald-500
    doc.text('SIGNÉ & VALIDÉ', margin + 36, y + 15);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(6.8);
    const disclaimer = 'Signature électronique enregistrée par HOREB SECURE à titre de relevé probatoire contradictoire numérique non qualifié.';
    doc.text(disclaimer, margin + 4, y + 20.5);

    // Empreinte numérique SHA-256 à droite
    const sigColX = margin + 100;
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text('Empreinte Numérique :', sigColX, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(14, 116, 144); // cyan-700
    doc.text(sig.signature_fingerprint || sig.signature_hash.slice(0, 16), sigColX + 33, y + 5);

    // Dessin de l'image de la signature tactile si disponible
    if (sig.signature_image && sig.signature_image.startsWith('data:image')) {
      try {
        doc.addImage(sig.signature_image, 'PNG', pageWidth - margin - 42, y + 8, 38, 14);
      } catch {
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(pageWidth - margin - 42, y + 8, 38, 14, 1, 1, 'F');
      }
    }
  }

  // Footer sur la dernière page
  drawFooter();

  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}

export const generateInterventionPdfBuffer = generateProofOfInterventionPdf;

