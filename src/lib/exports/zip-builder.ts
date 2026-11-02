/**
 * SECURIA V2 — ZIP ARCHIVE BUILDER FOR EXPORT CENTER
 * Assemble une archive ZIP sécurisée contenant :
 * - /manifest.csv
 * - /reports/REPORT-XXXX.pdf (fichiers Proof of Intervention complets)
 * - /photos/REPORT-XXXX/ (preuves photographiques autorisées)
 */

import JSZip from 'jszip';
import { ProofOfIntervention } from '@/lib/interventions/types';
import { generateProofOfInterventionPdf } from '@/lib/interventions/pdf-generator';
import { proofToCsvRow, generateInterventionsCsv } from './csv-builder';

export interface ZipArchiveOptions {
  includePhotos?: boolean;
  signatureStatuses?: Record<string, string>;
}

export async function buildExportZipBuffer(
  proofs: ProofOfIntervention[],
  options: ZipArchiveOptions = {}
): Promise<{ buffer: Buffer; filename: string }> {
  const zip = new JSZip();

  // 1. Génération du manifest CSV
  const csvRows = proofs.map((proof) => {
    const sigStatus = options.signatureStatuses?.[proof.id] || 'NOT_SIGNED';
    return proofToCsvRow(proof, sigStatus);
  });
  const csvContent = generateInterventionsCsv(csvRows);
  zip.file('manifest.csv', csvContent);

  // 2. Dossier des rapports PDF : /reports/
  const reportsFolder = zip.folder('reports');
  const photosFolder = options.includePhotos ? zip.folder('photos') : null;

  for (let i = 0; i < proofs.length; i++) {
    const proof = proofs[i];
    const safeRef = proof.alert_number.replace(/[^a-zA-Z0-9_-]/g, '_');
    const reportFilename = `REPORT-${safeRef}.pdf`;

    // Génération du PDF officiel de l'intervention
    const pdfBuffer = await generateProofOfInterventionPdf(proof);
    if (reportsFolder) {
      reportsFolder.file(reportFilename, pdfBuffer);
    }

    // 3. Dossier des photos : /photos/REPORT-XXXX/ (si demandé et photos existantes)
    if (photosFolder && proof.report.photos && proof.report.photos.length > 0) {
      const interventionPhotoFolder = photosFolder.folder(`REPORT-${safeRef}`);
      if (interventionPhotoFolder) {
        proof.report.photos.forEach((photo, pIdx) => {
          if (photo.url && photo.url.startsWith('data:image')) {
            try {
              // Extraction des données base64
              const matches = photo.url.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
              if (matches && matches.length === 3) {
                const ext = matches[1].includes('png') ? 'png' : 'jpg';
                const photoBuffer = Buffer.from(matches[2], 'base64');
                interventionPhotoFolder.file(`PHOTO-${String(pIdx + 1).padStart(2, '0')}.${ext}`, photoBuffer);
              }
            } catch {
              // En cas d'erreur de décodage photo, on continue sans bloquer le ZIP
            }
          }
        });
      }
    }
  }

  // 4. Génération de l'archive binaire
  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  // 5. Nom de fichier déterministe et sanitisé (Section 10)
  const todayStr = new Date().toISOString().split('T')[0];
  const filename = `SECURIA_EXPORT_${todayStr}_${proofs.length}_ITEMS.zip`;

  return { buffer: zipBuffer, filename };
}
