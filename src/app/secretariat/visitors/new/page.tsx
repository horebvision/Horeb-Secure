'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  Users,
  Camera,
  PenTool,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  ShieldCheck,
  Clock,
  Sparkles,
} from 'lucide-react';
import { authFetch } from '@/lib/utils/api-client';
import { IdentityCameraModal } from '@/components/secretariat/IdentityCameraModal';
import { VisitorSignatureModal } from '@/components/secretariat/VisitorSignatureModal';
import type { VisitReason, IdentityDocumentType, SignatureStatus } from '@/lib/secretariat/types';

const VISIT_REASONS: { value: VisitReason; label: string }[] = [
  { value: 'RENDEZ_VOUS', label: 'Rendez-vous professionnel' },
  { value: 'LIVRAISON', label: 'Livraison / Colis' },
  { value: 'ENTRETIEN', label: 'Entretien d’embauche' },
  { value: 'MAINTENANCE', label: 'Intervention technique / Maintenance' },
  { value: 'COMMERCIAL', label: 'Rendez-vous commercial' },
  { value: 'ADMINISTRATIF', label: 'Démarche administrative' },
  { value: 'AUTRE', label: 'Autre motif' },
];

const DOC_TYPES: { value: IdentityDocumentType; label: string }[] = [
  { value: 'CNI', label: 'Carte Nationale d’Identité (CNI)' },
  { value: 'PASSEPORT', label: 'Passeport' },
  { value: 'PERMIS', label: 'Permis de conduire' },
  { value: 'CARTE_SEJOUR', label: 'Carte de séjour / Résident' },
  { value: 'BADGE_PRO', label: 'Badge professionnel' },
  { value: 'AUTRE', label: 'Autre document' },
];

interface FormPerson {
  tempId: string;
  fullName: string;
  phone: string;
  docType: IdentityDocumentType;
  docNumber: string;
  docExpiry: string;
  rectoPhoto?: string;
  versoPhoto?: string;
  signatureData?: string;
  signatureStatus: SignatureStatus;
  refusalReason?: string;
  consent: boolean;
}

export default function NewVisitorVisitPage() {
  const router = useRouter();

  // Étape 1 : Dossier d'accueil
  const [visitReason, setVisitReason] = useState<VisitReason>('RENDEZ_VOUS');
  const [hostName, setHostName] = useState('');
  const [hostDepartment, setHostDepartment] = useState('');
  const [visitorCompany, setVisitorCompany] = useState('');
  const [notes, setNotes] = useState('');
  const [siteId, setSiteId] = useState<string>('');

  // Sites de l'organisation
  const [sites, setSites] = useState<any[]>([]);

  // Étape 2 : Visiteurs associés
  const [people, setPeople] = useState<FormPerson[]>([
    {
      tempId: 'p-1',
      fullName: '',
      phone: '',
      docType: 'CNI',
      docNumber: '',
      docExpiry: '',
      signatureStatus: 'UNSIGNED',
      consent: false,
    },
  ]);

  // Modals Caméra et Signature
  const [cameraModal, setCameraModal] = useState<{
    isOpen: boolean;
    personIndex: number;
    docType: 'RECTO' | 'VERSO';
    visitorName: string;
  }>({
    isOpen: false,
    personIndex: 0,
    docType: 'RECTO',
    visitorName: '',
  });

  const [signatureModal, setSignatureModal] = useState<{
    isOpen: boolean;
    personIndex: number;
    visitorName: string;
  }>({
    isOpen: false,
    personIndex: 0,
    visitorName: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Charger les sites protégés de l'organisation
  useEffect(() => {
    async function fetchSites() {
      try {
        const res = await authFetch('/api/sites');
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.sites)) {
            setSites(data.sites);
            if (data.sites.length > 0) {
              setSiteId(data.sites[0].id);
            }
          }
        }
      } catch (e) {
        console.warn('Erreur fetch sites:', e);
      }
    }
    fetchSites();
  }, []);

  // Gestion des personnes dans le groupe
  const addPerson = () => {
    setPeople((prev) => [
      ...prev,
      {
        tempId: `p-${Date.now()}`,
        fullName: '',
        phone: '',
        docType: 'CNI',
        docNumber: '',
        docExpiry: '',
        signatureStatus: 'UNSIGNED',
        consent: false,
      },
    ]);
  };

  const removePerson = (index: number) => {
    if (people.length <= 1) return;
    setPeople((prev) => prev.filter((_, i) => i !== index));
  };

  const updatePerson = (index: number, fields: Partial<FormPerson>) => {
    setPeople((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...fields };
      return copy;
    });
  };

  // Soumission finale du formulaire
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    for (let i = 0; i < people.length; i++) {
      if (!people[i].fullName.trim()) {
        setError(`Le nom et prénom du visiteur #${i + 1} sont obligatoires.`);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const payload = {
        site_id: siteId || undefined,
        visit_reason: visitReason,
        host_name: hostName.trim() || undefined,
        host_department: hostDepartment.trim() || undefined,
        visitor_company: visitorCompany.trim() || undefined,
        notes: notes.trim() || undefined,
        people: people.map((p) => ({
          full_name: p.fullName.trim(),
          phone: p.phone.trim() || undefined,
          identity_document_type: p.docType,
          identity_number: p.docNumber.trim() || undefined,
          identity_expiry_date: p.docExpiry || undefined,
          recto_photo_data: p.rectoPhoto || undefined,
          verso_photo_data: p.versoPhoto || undefined,
          signature_data: p.signatureData || undefined,
          signature_status: p.signatureStatus,
          signature_consent: p.consent,
          signature_refusal_reason: p.refusalReason || undefined,
        })),
      };

      const res = await authFetch('/api/secretariat/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok && data.success && data.visit) {
        router.push(`/secretariat/visitors/${data.visit.id}`);
      } else {
        setError(data.error || 'Erreur lors de l’enregistrement de la visite.');
      }
    } catch (err: any) {
      setError(err.message || 'Erreur réseau.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Navigation retour */}
        <div className="flex items-center gap-3">
          <Link
            href="/secretariat"
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full text-[11px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800/60 mb-1">
              <Building2 className="w-3 h-3 text-amber-400" />
              <span>Accueil & Entrée des Locaux</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">
              Enregistrement d’une Visite
            </h1>
            <p className="text-xs text-slate-400">
              Saisie du motif, vérification d’identité et recueil de la signature individuelle.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2.5 animate-in fade-in">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* SECTION 1 : Renseignements Généraux de la Visite */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-amber-600/30 text-amber-400 text-xs flex items-center justify-center font-black">
                  1
                </span>
                <span>Objet & Destination de la Visite</span>
              </h2>
              <span className="text-[11px] text-slate-500">Heure serveur automatique</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Motif de la Visite *</label>
                <select
                  value={visitReason}
                  onChange={(e) => setVisitReason(e.target.value as VisitReason)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  {VISIT_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Société ou Organisme d’Origine</label>
                <input
                  type="text"
                  value={visitorCompany}
                  onChange={(e) => setVisitorCompany(e.target.value)}
                  placeholder="Ex: Entreprise partenaire, DHL, Particulier..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Personne à Rencontrer (Hôte)</label>
                <input
                  type="text"
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  placeholder="Ex: M. Coulibaly, Mme Traoré..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Service / Département</label>
                <input
                  type="text"
                  value={hostDepartment}
                  onChange={(e) => setHostDepartment(e.target.value)}
                  placeholder="Ex: Direction Générale, Comptabilité, IT..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            {sites.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Site d’Accueil Interne</label>
                <select
                  value={siteId}
                  onChange={(e) => setSiteId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.address}, {s.city})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Observations / Remarques</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Colis déposé, badge provisoire remis #04..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* SECTION 2 : Identité & Pièces des Visiteurs */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-cyan-600/30 text-cyan-400 text-xs flex items-center justify-center font-black">
                  2
                </span>
                <span>Visiteur(s) Associé(s) ({people.length})</span>
              </h2>

              <button
                type="button"
                onClick={addPerson}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-cyan-400" />
                <span>+ Ajouter une autre personne</span>
              </button>
            </div>

            {people.map((person, idx) => (
              <div
                key={person.tempId}
                className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4 relative shadow-xl"
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
                    <Users className="w-4 h-4 text-cyan-400" />
                    <span>Visiteur #{idx + 1}</span>
                  </span>

                  {people.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePerson(idx)}
                      className="p-1 rounded-lg text-slate-500 hover:text-rose-400 transition-colors"
                      title="Retirer ce visiteur"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">Nom et Prénom(s) *</label>
                    <input
                      type="text"
                      required
                      value={person.fullName}
                      onChange={(e) => updatePerson(idx, { fullName: e.target.value })}
                      placeholder="Ex: KOUASSI Jean-Yves"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">Téléphone de contact</label>
                    <input
                      type="tel"
                      value={person.phone}
                      onChange={(e) => updatePerson(idx, { phone: e.target.value })}
                      placeholder="Ex: +225 07 00 00 00 00"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">Type de Document</label>
                    <select
                      value={person.docType}
                      onChange={(e) => updatePerson(idx, { docType: e.target.value as IdentityDocumentType })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    >
                      {DOC_TYPES.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">Numéro de la Pièce (Optionnel)</label>
                    <input
                      type="text"
                      value={person.docNumber}
                      onChange={(e) => updatePerson(idx, { docNumber: e.target.value })}
                      placeholder="Ex: C0123456789"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                </div>

                {/* Boutons Scan Photo Pièce (Recto & Verso) */}
                <div className="pt-2">
                  <span className="block text-xs font-bold text-slate-400 mb-2">
                    Photos de la Pièce d'Identité (Stockage Chiffré Privé) :
                  </span>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Recto */}
                    <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-white block">Recto du document</span>
                        <span className="text-[10px] text-slate-500">
                          {person.rectoPhoto ? '✓ Photo capturée' : 'Non photographié'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setCameraModal({
                            isOpen: true,
                            personIndex: idx,
                            docType: 'RECTO',
                            visitorName: person.fullName || `Visiteur #${idx + 1}`,
                          })
                        }
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                          person.rectoPhoto
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                        }`}
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>{person.rectoPhoto ? 'Modifier' : 'Scanner'}</span>
                      </button>
                    </div>

                    {/* Verso */}
                    <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-white block">Verso du document</span>
                        <span className="text-[10px] text-slate-500">
                          {person.versoPhoto ? '✓ Photo capturée' : 'Facultatif'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setCameraModal({
                            isOpen: true,
                            personIndex: idx,
                            docType: 'VERSO',
                            visitorName: person.fullName || `Visiteur #${idx + 1}`,
                          })
                        }
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                          person.versoPhoto
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                        }`}
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>{person.versoPhoto ? 'Modifier' : 'Scanner'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Signature Électronique */}
                <div className="pt-2">
                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <PenTool className="w-4 h-4 text-cyan-400" />
                        <span className="text-xs font-bold text-white">Signature Électronique du Visiteur</span>
                      </div>
                      <span className="text-[11px] text-slate-400 block">
                        Statut :{' '}
                        <strong
                          className={
                            person.signatureStatus === 'SIGNED'
                              ? 'text-emerald-400'
                              : person.signatureStatus === 'REFUSED'
                              ? 'text-rose-400'
                              : 'text-amber-400'
                          }
                        >
                          {person.signatureStatus === 'SIGNED'
                            ? '✓ Signée numériquement'
                            : person.signatureStatus === 'REFUSED'
                            ? `✕ Refus déclarée (${person.refusalReason})`
                            : 'En attente de signature'}
                        </strong>
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setSignatureModal({
                          isOpen: true,
                          personIndex: idx,
                          visitorName: person.fullName || `Visiteur #${idx + 1}`,
                        })
                      }
                      className="px-4 py-2 rounded-xl bg-cyan-950 border border-cyan-700/60 text-cyan-300 hover:bg-cyan-900/60 font-bold text-xs flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
                    >
                      <PenTool className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{person.signatureData || person.signatureStatus !== 'UNSIGNED' ? 'Modifier la signature' : 'Faire signer le visiteur'}</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* SECTION 3 : Récapitulatif & Validation */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                La validation enregistrera automatiquement l’horodatage serveur de l'arrivée dans le registre de sécurité.
              </span>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Link
                href="/secretariat"
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
              >
                Annuler
              </Link>

              <button
                type="submit"
                disabled={isSubmitting}
                className="py-3 px-7 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-amber-950/50 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isSubmitting ? 'Enregistrement en cours...' : 'Valider & Enregistrer l’Entrée'}</span>
              </button>
            </div>
          </div>
        </form>

        {/* Modal Caméra */}
        <IdentityCameraModal
          isOpen={cameraModal.isOpen}
          onClose={() => setCameraModal({ ...cameraModal, isOpen: false })}
          documentType={cameraModal.docType}
          visitorName={cameraModal.visitorName}
          onCapture={(base64) => {
            if (cameraModal.docType === 'RECTO') {
              updatePerson(cameraModal.personIndex, { rectoPhoto: base64 });
            } else {
              updatePerson(cameraModal.personIndex, { versoPhoto: base64 });
            }
          }}
        />

        {/* Modal Signature */}
        <VisitorSignatureModal
          isOpen={signatureModal.isOpen}
          onClose={() => setSignatureModal({ ...signatureModal, isOpen: false })}
          visitorName={signatureModal.visitorName}
          onSave={({ signatureDataUrl, signatureStatus, consent, refusalReason }) => {
            updatePerson(signatureModal.personIndex, {
              signatureData: signatureDataUrl,
              signatureStatus,
              consent,
              refusalReason,
            });
          }}
        />
      </div>
    </div>
  );
}
