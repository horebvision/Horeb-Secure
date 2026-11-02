'use client';

import React, { useState, useEffect } from 'react';
import {
  Server,
  Activity,
  Plus,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Cpu,
  HardDrive,
  Copy,
  Check,
  ShieldAlert,
  Radio,
  ExternalLink,
} from 'lucide-react';
import { VideoGateway } from '@/lib/video/types';
import { authFetch } from '@/lib/utils/api-client';

export function GatewayRegistryTable() {
  const [gateways, setGateways] = useState<VideoGateway[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedGateway, setSelectedGateway] = useState<VideoGateway | null>(null);
  const [diagnosticData, setDiagnosticData] = useState<any>(null);
  const [loadingDiag, setLoadingDiag] = useState<boolean>(false);

  // Modal création
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [createName, setCreateName] = useState<string>('');
  const [createSiteId, setCreateSiteId] = useState<string>('');
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
  const [createdGateway, setCreatedGateway] = useState<any>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const fetchGateways = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/video/gateways');
      const data = await res.json();
      if (data.success) {
        setGateways(data.gateways || []);
      }
    } catch (err) {
      console.error('Erreur chargement passerelles:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSites = async () => {
    try {
      const res = await authFetch('/api/sites');
      const data = await res.json();
      if (data.sites) setSites(data.sites);
    } catch {}
  };

  useEffect(() => {
    fetchGateways();
    fetchSites();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName || !createSiteId) return;

    try {
      const res = await authFetch('/api/video/gateways', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName,
          protected_site_id: createSiteId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCreatedGateway(data);
        fetchGateways();
      }
    } catch (err) {
      console.error('Erreur création passerelle:', err);
    }
  };

  const handleOpenDiagnostic = async (gw: VideoGateway) => {
    setSelectedGateway(gw);
    setLoadingDiag(true);
    try {
      const res = await authFetch(`/api/video/gateways/${gw.id}`);
      const data = await res.json();
      if (data.success) {
        setDiagnosticData(data.diagnostic);
      }
    } catch {
      setDiagnosticData(null);
    } finally {
      setLoadingDiag(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir révoquer cette passerelle Edge ? Elle ne pourra plus transmettre de flux ni d’événements.')) {
      return;
    }

    try {
      const res = await authFetch(`/api/video/gateways/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchGateways();
        if (selectedGateway?.id === id) setSelectedGateway(null);
      }
    } catch (err) {
      console.error('Erreur révocation:', err);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Barre d'action supérieure */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Passerelles Matérielles Edge (LAN Client)</h2>
            <p className="text-xs text-slate-400">
              {gateways.length} passerelle(s) enregistrée(s) — Découverte ONVIF locale & streaming sécurisé
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchGateways}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Rafraîchir"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => {
              setCreatedGateway(null);
              setCreateName('');
              setIsCreateOpen(true);
            }}
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center gap-2 transition-all shadow-lg shadow-purple-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>Nouvelle Passerelle</span>
          </button>
        </div>
      </div>

      {/* Tableau des passerelles */}
      <div className="overflow-hidden rounded-2xl bg-slate-900/40 border border-slate-800/80">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/60 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-5 py-3.5 font-semibold">Passerelle</th>
                <th className="px-5 py-3.5 font-semibold">Site Protégé</th>
                <th className="px-5 py-3.5 font-semibold">Statut</th>
                <th className="px-5 py-3.5 font-semibold">Caméras</th>
                <th className="px-5 py-3.5 font-semibold">Dernier Heartbeat</th>
                <th className="px-5 py-3.5 font-semibold">Version</th>
                <th className="px-5 py-3.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-slate-500">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-purple-400" />
                    Chargement des passerelles Edge...
                  </td>
                </tr>
              ) : gateways.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-slate-500">
                    Aucune passerelle Edge configurée. Cliquez sur "Nouvelle Passerelle" pour connecter un boîtier local.
                  </td>
                </tr>
              ) : (
                gateways.map((gw) => (
                  <tr key={gw.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-white">{gw.name}</div>
                      <div className="text-xs font-mono text-purple-400">{gw.gateway_code}</div>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-300">
                      {gw.site_name || gw.protected_site_id.slice(0, 8)}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                          gw.status === 'ONLINE'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : gw.status === 'PENDING'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : gw.status === 'REVOKED'
                            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            gw.status === 'ONLINE'
                              ? 'bg-emerald-400 animate-pulse'
                              : gw.status === 'PENDING'
                              ? 'bg-amber-400'
                              : gw.status === 'REVOKED'
                              ? 'bg-red-400'
                              : 'bg-slate-500'
                          }`}
                        />
                        {gw.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs font-mono">
                      <span className="text-emerald-400 font-bold">{gw.cameras_online_count || 0}</span>
                      <span className="text-slate-500"> / </span>
                      <span className="text-slate-300">{gw.cameras_count || 0}</span>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-400 font-mono">
                      {gw.last_heartbeat_at ? new Date(gw.last_heartbeat_at).toLocaleTimeString() : 'Jamais'}
                    </td>
                    <td className="px-5 py-4 text-xs font-mono text-slate-400">
                      v{gw.version}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenDiagnostic(gw)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-cyan-400 flex items-center gap-1 transition-colors"
                        >
                          <Activity className="w-3.5 h-3.5" />
                          <span>Diagnostic</span>
                        </button>
                        {gw.status !== 'REVOKED' && (
                          <button
                            onClick={() => handleRevoke(gw.id)}
                            className="p-1 rounded-lg bg-slate-800/80 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                            title="Révoquer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Création & Appairage */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2 text-purple-400">
                <Server className="w-5 h-5" />
                <h3 className="font-bold text-white text-base">Enregistrer une Passerelle Edge</h3>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {!createdGateway ? (
              <form onSubmit={handleCreate} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Nom de la passerelle</label>
                  <input
                    type="text"
                    required
                    placeholder="ex: Boîtier NUC Résidence Cocody"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Site protégé associé</label>
                  <select
                    required
                    value={createSiteId}
                    onChange={(e) => setCreateSiteId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="">Sélectionner un site protégé...</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[11px] leading-relaxed">
                  💡 Un code temporaire d'appairage sera généré. Il vous suffira de le saisir sur le boîtier physique lors de son premier branchement sur le réseau du client.
                </div>

                <div className="flex justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setIsCreateOpen(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold"
                  >
                    Générer Code d’Appairage
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4 text-xs">
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Passerelle initialisée avec succès</span>
                  </div>
                  <p className="text-[11px] text-emerald-300/80">
                    Ce code est valable pendant <strong>20 minutes</strong>. Entrez cette commande sur la machine locale :
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-purple-300 flex items-center justify-between">
                  <span>securia-gateway pair --code {createdGateway.pairing_instructions?.code}</span>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        `securia-gateway pair --code ${createdGateway.pairing_instructions?.code}`
                      )
                    }
                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                    title="Copier la commande"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => setIsCreateOpen(false)}
                    className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold"
                  >
                    Terminé
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Diagnostic Temps Réel */}
      {selectedGateway && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-white text-base">
                  Diagnostic Edge Gateway : {selectedGateway.name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedGateway(null)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {loadingDiag ? (
              <div className="py-12 text-center text-slate-500">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-cyan-400" />
                Interrogation du diagnostic en cours...
              </div>
            ) : diagnosticData ? (
              <div className="space-y-4 text-xs">
                {/* Ligne d'états rapides */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
                    <div className="text-[10px] text-slate-400 font-medium">Liaison Cloud</div>
                    <div className="text-sm font-bold text-emerald-400 mt-0.5">
                      {diagnosticData.cloud_connection}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
                    <div className="text-[10px] text-slate-400 font-medium">Authentification</div>
                    <div className="text-sm font-bold text-purple-400 mt-0.5">
                      {diagnosticData.authentication}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
                    <div className="text-[10px] text-slate-400 font-medium">Dernier Battement</div>
                    <div className="text-sm font-bold text-slate-200 mt-0.5 font-mono">
                      {diagnosticData.last_heartbeat_seconds_ago < 9999
                        ? `${diagnosticData.last_heartbeat_seconds_ago}s`
                        : 'N/A'}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
                    <div className="text-[10px] text-slate-400 font-medium">Découverte ONVIF</div>
                    <div className="text-sm font-bold text-cyan-400 mt-0.5">
                      {diagnosticData.onvif_discovery_status}
                    </div>
                  </div>
                </div>

                {/* Métriques Système */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-3">
                  <div className="flex items-center justify-between text-slate-300 font-semibold">
                    <span className="flex items-center gap-1.5">
                      <Cpu className="w-4 h-4 text-amber-400" />
                      Charge Processeur & Mémoire Locale
                    </span>
                    <span className="font-mono text-xs text-slate-500">
                      IP: {diagnosticData.ip_address_local}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-1">
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                        <span>CPU</span>
                        <span className="font-bold text-white">
                          {diagnosticData.metrics?.cpu_pct ?? 12}%
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-amber-400 rounded-full"
                          style={{ width: `${diagnosticData.metrics?.cpu_pct ?? 12}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                        <span>Mémoire RAM</span>
                        <span className="font-bold text-white">
                          {diagnosticData.metrics?.mem_used_mb ?? 340} Mo /{' '}
                          {diagnosticData.metrics?.mem_total_mb ?? 3800} Mo
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-cyan-400 rounded-full"
                          style={{
                            width: `${Math.round(
                              ((diagnosticData.metrics?.mem_used_mb ?? 340) /
                                (diagnosticData.metrics?.mem_total_mb ?? 3800)) *
                                100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Caméras locales supervisées */}
                <div className="space-y-2">
                  <div className="font-semibold text-slate-300">
                    Caméras Locales Découvertes ({diagnosticData.cameras_total})
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1.5">
                    {diagnosticData.cameras && diagnosticData.cameras.length > 0 ? (
                      diagnosticData.cameras.map((c: any) => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs"
                        >
                          <span className="font-medium text-white">{c.name}</span>
                          <div className="flex items-center gap-2 font-mono text-[11px]">
                            <span className="text-slate-500">{c.protocol}</span>
                            <span
                              className={`px-2 py-0.5 rounded font-bold ${
                                c.status === 'ONLINE'
                                  ? 'text-emerald-400 bg-emerald-500/10'
                                  : 'text-slate-400 bg-slate-800'
                              }`}
                            >
                              {c.status}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-4 text-slate-500 text-xs">
                        Aucune caméra physique détectée pour l'instant par cette passerelle.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-red-400">
                Impossible de charger le diagnostic de la passerelle.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
