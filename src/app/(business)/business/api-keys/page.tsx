'use client';

import React, { useEffect, useState } from 'react';
import { KeyRound, Plus, Trash2, Copy, Check, ShieldAlert, RefreshCw } from 'lucide-react';
import { ApiKey, ApiKeyScope, ALL_API_KEY_SCOPES } from '@/lib/api-keys/types';
import { authFetch } from '@/lib/utils/api-client';

export default function ApiKeysManagementPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal création
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<ApiKeyScope[]>(['alerts:read', 'interventions:read']);
  const [expiryDays, setExpiryDays] = useState<number>(90);
  const [creating, setCreating] = useState(false);

  // Clé nouvellement générée (affichée une seule fois)
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchKeys = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await authFetch('/api/business/api-keys');
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Erreur API Keys');
      setKeys(json.keys || []);
    } catch (err: any) {
      setError(err.message || 'Impossible de joindre le gestionnaire de clés');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) return;

    try {
      setCreating(true);
      setError(null);
      const res = await authFetch('/api/business/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: keyName.trim(),
          permissions: selectedScopes,
          expiresInDays: expiryDays > 0 ? expiryDays : undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Erreur de génération');

      setGeneratedKey(json.plainTextApiKey);
      setShowCreateModal(false);
      setKeyName('');
      await fetchKeys();
    } catch (err: any) {
      setError(err.message || 'Échec de création de la clé');
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeKey = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir révoquer cette clé API ? Cette action est irréversible.')) return;

    try {
      setError(null);
      const res = await authFetch(`/api/business/api-keys/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Erreur de révocation');
      await fetchKeys();
    } catch (err: any) {
      setError(err.message || 'Échec de révocation de la clé');
    }
  };

  const toggleScope = (scope: ApiKeyScope) => {
    if (selectedScopes.includes(scope)) {
      setSelectedScopes(selectedScopes.filter((s) => s !== scope));
    } else {
      setSelectedScopes([...selectedScopes, scope]);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-cyan-400" />
            Gestion des Clés API Publiques (v1)
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Les clés API permettent à vos applications externes et partenaires d’accéder aux données avec des scopes RBAC stricts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Générer une Clé API</span>
          </button>
          <button
            onClick={fetchKeys}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/50 text-rose-200 text-sm">
          {error}
        </div>
      )}

      {/* Alerte Clé Générée Unique */}
      {generatedKey && (
        <div className="p-6 rounded-2xl bg-cyan-950/40 border border-cyan-500/60 space-y-3">
          <div className="flex items-center gap-2 text-cyan-300 font-bold text-sm">
            <ShieldAlert className="w-5 h-5 text-cyan-400" />
            <span>Nouvelle Clé API Générée — Copiez-la maintenant !</span>
          </div>
          <p className="text-xs text-slate-300">
            Pour des raisons de sécurité absolue, la clé en clair est <strong>affichée une seule et unique fois</strong>.
            Seul son hash SHA-256 est conservé sur nos serveurs.
          </p>
          <div className="flex items-center gap-2 pt-2">
            <code className="p-3 rounded-xl bg-slate-900 border border-cyan-500/40 font-mono text-cyan-300 text-xs flex-1 break-all select-all">
              {generatedKey}
            </code>
            <button
              onClick={() => copyToClipboard(generatedKey)}
              className="flex items-center gap-1.5 px-4 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copié' : 'Copier'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Tableau des clés API */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
        <h3 className="text-base font-bold text-white">Clés API Actives et Révoquées</h3>

        {keys.length === 0 ? (
          <div className="text-xs text-slate-500 py-12 text-center">Aucune clé API configurée pour cette organisation.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-3">Nom</th>
                  <th className="p-3">Préfixe</th>
                  <th className="p-3">Permissions (Scopes)</th>
                  <th className="p-3">Dernière utilisation</th>
                  <th className="p-3">Expiration</th>
                  <th className="p-3">Statut</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {keys.map((k) => (
                  <tr key={k.id} className="hover:bg-slate-800/40">
                    <td className="p-3 font-semibold text-white">{k.name}</td>
                    <td className="p-3 font-mono text-cyan-300">{k.key_prefix}...</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {(k.scopes || []).map((p: ApiKeyScope) => (
                          <span
                            key={p}
                            className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 text-slate-400">
                      {k.last_used_at ? new Date(k.last_used_at).toLocaleString('fr-FR') : 'Jamais'}
                    </td>
                    <td className="p-3 text-slate-400">
                      {k.expires_at ? new Date(k.expires_at).toLocaleDateString('fr-FR') : 'Illimitée'}
                    </td>
                    <td className="p-3">
                      {k.revoked_at ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          Révoquée
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {!k.revoked_at && (
                        <button
                          onClick={() => handleRevokeKey(k.id)}
                          title="Révoquer définitivement cette clé"
                          className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 text-rose-300"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Création Clé API */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-cyan-400" />
                Générer une Nouvelle Clé API
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateKey} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Nom d'application ou partenaire *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: ERP Facturation / SOC Externe"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Durée de validité (Jours)
                </label>
                <select
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:border-cyan-500 focus:outline-none"
                >
                  <option value={30}>30 Jours</option>
                  <option value={90}>90 Jours (Recommandé)</option>
                  <option value={180}>180 Jours</option>
                  <option value={365}>1 An</option>
                  <option value={0}>Illimitée</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-2">
                  Permissions &amp; Scopes Autorisés *
                </label>
                <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto p-2 bg-slate-950/60 rounded-xl border border-slate-800">
                  {ALL_API_KEY_SCOPES.map((item) => {
                    const isChecked = selectedScopes.includes(item.scope);
                    return (
                      <label
                        key={item.scope}
                        className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border transition-colors ${
                          isChecked
                            ? 'bg-cyan-950/50 border-cyan-500/40 text-cyan-200'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-850'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleScope(item.scope)}
                          className="rounded text-cyan-600 focus:ring-cyan-500"
                        />
                        <div>
                          <span className="font-mono text-[11px] font-bold">{item.scope}</span>
                          <span className="text-[10px] text-slate-400 block">{item.label}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-semibold"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={creating || !keyName.trim() || selectedScopes.length === 0}
                  className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold disabled:opacity-50"
                >
                  {creating ? 'Génération...' : 'Créer la Clé'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
