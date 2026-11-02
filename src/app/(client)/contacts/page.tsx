'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSecuria } from '@/lib/store/securia-context';
import { authFetch } from '@/lib/utils/api-client';
import {
  PhoneCall,
  Plus,
  Trash2,
  ArrowLeft,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  Users,
  Loader2,
} from 'lucide-react';

interface ContactItem {
  id: string;
  name: string;
  relation: string;
  phone: string;
  priority_order?: number;
  priority?: number;
}

export default function ContactsPage() {
  const { currentUser, refreshProfile } = useSecuria();

  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('Famille proche');
  const [phone, setPhone] = useState('');
  const [priority, setPriority] = useState(1);

  // Chargement des contacts réels depuis l'API REST
  const loadContacts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/contacts');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.contacts)) {
          setContacts(
            data.contacts.map((c: any) => ({
              id: c.id,
              name: c.name,
              relation: c.relation,
              phone: c.phone,
              priority: c.priority_order ?? 1,
              priority_order: c.priority_order ?? 1,
            }))
          );
        }
      } else {
        // Fallback context si API indisponible
        if (currentUser?.emergency_contacts && currentUser.emergency_contacts.length > 0) {
          setContacts(
            currentUser.emergency_contacts.map((c, i) => ({
              id: c.id || `c-${i}`,
              name: c.name,
              relation: c.relation || 'Proche',
              phone: c.phone,
              priority: (c as any).priority_order || i + 1,
            }))
          );
        }
      }
    } catch (err: any) {
      console.warn('[ContactsPage] Note chargement:', err);
      if (currentUser?.emergency_contacts && currentUser.emergency_contacts.length > 0) {
        setContacts(
          currentUser.emergency_contacts.map((c, i) => ({
            id: c.id || `c-${i}`,
            name: c.name,
            relation: c.relation || 'Proche',
            phone: c.phone,
            priority: (c as any).priority_order || i + 1,
          }))
        );
      }
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  // Ajout persistant d'un contact d'urgence
  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) {
      setError('Veuillez renseigner le nom et le numéro de téléphone.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await authFetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          relation: relation.trim(),
          phone: phone.trim(),
          priority_order: priority,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erreur lors de l’ajout du contact.');
      }

      setSuccess(`Le contact ${name} a été enregistré avec succès.`);
      setName('');
      setPhone('');
      setRelation('Famille proche');
      setPriority(1);
      setIsModalOpen(false);

      // Rechargement immédiat et synchronisation du profil
      await loadContacts();
      await refreshProfile();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Impossible d’enregistrer le contact.');
    } finally {
      setSubmitting(false);
    }
  };

  // Suppression persistante d'un contact
  const handleDelete = async (id: string, contactName: string) => {
    if (!window.confirm(`Supprimer ${contactName} de vos contacts d'urgence ?`)) {
      return;
    }

    setDeletingId(id);
    setError(null);
    setSuccess(null);

    try {
      const res = await authFetch(`/api/contacts?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erreur lors de la suppression.');
      }

      setSuccess(`Contact ${contactName} supprimé avec succès.`);
      setContacts((prev) => prev.filter((c) => c.id !== id));
      await refreshProfile();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Impossible de supprimer le contact.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Tableau de bord</span>
        </Link>

        <button
          onClick={() => {
            setError(null);
            setIsModalOpen(true);
          }}
          className="py-2 px-3.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-cyan-900/30 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Ajouter un contact</span>
        </button>
      </div>

      {/* En-tête */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
        <div className="flex items-center space-x-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Contacts d'Urgence</h1>
            <p className="text-xs text-slate-400">
              Personnes averties instantanément par SMS et appel lors d’un déclenchement SOS
            </p>
          </div>
        </div>
      </div>

      {/* Messages de retour */}
      {success && (
        <div className="p-4 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-2xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Liste des contacts d'urgence */}
      <div className="space-y-3">
        {loading ? (
          <div className="p-10 text-center rounded-3xl bg-slate-900/60 border border-slate-800 text-slate-400 space-y-3">
            <Loader2 className="w-6 h-6 text-cyan-400 animate-spin mx-auto" />
            <p className="text-xs text-slate-400">Chargement de vos contacts d'urgence...</p>
          </div>
        ) : contacts.length === 0 ? (
          <div className="p-8 text-center rounded-3xl bg-slate-900/60 border border-slate-800 text-slate-400">
            <Users className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-bold text-white mb-1">Aucun contact d’urgence configuré</p>
            <p className="text-xs text-slate-400 mb-4">
              Cliquez sur « Ajouter un contact » pour enregistrer vos proches.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="py-2 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Créer mon premier contact</span>
            </button>
          </div>
        ) : (
          contacts.map((contact, index) => (
            <div
              key={contact.id}
              className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between shadow-lg hover:border-slate-700 transition-all"
            >
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400 text-xs font-bold font-mono">
                  #{index + 1}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-bold text-white">{contact.name}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-800/80 text-cyan-300">
                      Priorité {contact.priority || contact.priority_order || index + 1}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 block mt-0.5">{contact.relation}</span>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <a
                  href={`tel:${contact.phone}`}
                  className="py-1.5 px-3 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-500/40 text-emerald-300 font-mono text-xs font-bold flex items-center gap-1.5 transition-colors"
                  title="Appeler maintenant"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  <span>{contact.phone}</span>
                </a>

                <button
                  onClick={() => handleDelete(contact.id, contact.name)}
                  disabled={deletingId === contact.id}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 border border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
                  title="Supprimer ce contact"
                >
                  {deletingId === contact.id ? (
                    <Loader2 className="w-4 h-4 animate-spin text-rose-400" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Note d'information */}
      <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400 space-y-1.5">
        <div className="flex items-center space-x-2 text-cyan-400 font-bold">
          <ShieldAlert className="w-4 h-4" />
          <span>Protocole de transmission d’alerte</span>
        </div>
        <p className="leading-relaxed">
          Lorsqu'une alerte est déclenchée, HOREB SECURE avertit en priorité absolue le Centre de Télésurveillance et l'agent patrouilleur le plus proche, puis relaie les coordonnées GPS à vos contacts d'urgence enregistrés.
        </p>
      </div>

      {/* Modal d'ajout de contact */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-left">
            <h3 className="text-lg font-bold text-white mb-1">Nouveau Contact d'Urgence</h3>
            <p className="text-xs text-slate-400 mb-4">
              Ce contact sera prévenu dès l'ouverture d'une intervention à votre domicile.
            </p>

            <form onSubmit={handleAddContact} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Nom et Prénom</label>
                <input
                  type="text"
                  required
                  placeholder="Ex : Sarah Kouassi"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={submitting}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Lien de parenté / Relation</label>
                <select
                  value={relation}
                  onChange={(e) => setRelation(e.target.value)}
                  disabled={submitting}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-60"
                >
                  <option value="Conjoint(e) / Époux(se)">Conjoint(e) / Époux(se)</option>
                  <option value="Enfant / Parent proche">Enfant / Parent proche</option>
                  <option value="Voisin direct">Voisin direct</option>
                  <option value="Gardien d’immeuble">Gardien d’immeuble</option>
                  <option value="Médecin traitant">Médecin traitant</option>
                  <option value="Autre personne de confiance">Autre personne de confiance</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Numéro de téléphone direct</label>
                <input
                  type="tel"
                  required
                  placeholder="+225 07 00 00 00 00"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={submitting}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Ordre de priorité d'appel</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                  disabled={submitting}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-60"
                >
                  <option value={1}>Priorité 1 (Appelé en premier)</option>
                  <option value={2}>Priorité 2 (Appelé en second)</option>
                  <option value={3}>Priorité 3 (Appelé en soutien)</option>
                </select>
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer disabled:opacity-60"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold transition-all shadow-md shadow-cyan-900/30 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Enregistrement...</span>
                    </>
                  ) : (
                    <span>Enregistrer</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
