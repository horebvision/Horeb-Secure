'use client';

import React from 'react';
import { BookOpen, KeyRound, ShieldCheck, Terminal, ExternalLink } from 'lucide-react';

export default function ApiDocumentationPage() {
  const endpoints = [
    {
      method: 'GET',
      path: '/api/v1/alerts',
      scope: 'alerts:read',
      desc: 'Récupère la liste paginée des alertes de l’organisation avec filtres par statut.',
      params: '?limit=50&status=PENDING',
      response: `{
  "success": true,
  "count": 2,
  "alerts": [
    {
      "id": "a1b2c3d4-...",
      "alert_number": "ALT-2026-0001",
      "type": "INTRUSION",
      "priority": "HIGH",
      "status": "IN_PROGRESS",
      "created_at": "2026-09-30T10:00:00Z"
    }
  ]
}`,
    },
    {
      method: 'GET',
      path: '/api/v1/interventions',
      scope: 'interventions:read',
      desc: 'Récupère l’historique des interventions déclenchées avec horodatages T1 à T7.',
      params: '?limit=50',
      response: `{
  "success": true,
  "count": 1,
  "interventions": [
    {
      "id": "e5f6g7h8-...",
      "intervention_number": "INT-2026-0001",
      "status": "COMPLETED",
      "assigned_at": "2026-09-30T10:01:00Z",
      "arrived_at": "2026-09-30T10:09:00Z",
      "resolved_at": "2026-09-30T10:25:00Z"
    }
  ]
}`,
    },
    {
      method: 'GET',
      path: '/api/v1/agents',
      scope: 'agents:read',
      desc: 'Liste des agents de sécurité de l’organisation avec statut de garde et position GPS.',
      params: '?status=ON_DUTY',
      response: `{
  "success": true,
  "count": 1,
  "agents": [
    {
      "id": "ag_123...",
      "full_name": "Moussa Diop",
      "badge_number": "SEC-042",
      "duty_status": "ON_DUTY",
      "current_location": {
        "latitude": 14.7167,
        "longitude": -17.4677
      }
    }
  ]
}`,
    },
    {
      method: 'GET',
      path: '/api/v1/sites',
      scope: 'sites:read',
      desc: 'Liste des sites protégés de l’organisation avec coordonnées géographiques.',
      params: '',
      response: `{
  "success": true,
  "count": 1,
  "sites": [
    {
      "id": "site_456...",
      "name": "Entrepôt Logistique Nord",
      "address": "Zone Industrielle",
      "latitude": 14.72,
      "longitude": -17.45
    }
  ]
}`,
    },
    {
      method: 'GET',
      path: '/api/v1/clients',
      scope: 'clients:read',
      desc: 'Liste des comptes clients rattachés à l’organisation.',
      params: '',
      response: `{
  "success": true,
  "count": 1,
  "clients": [
    {
      "id": "cli_789...",
      "full_name": "Société Alpha",
      "email": "contact@alpha.com",
      "is_active": true
    }
  ]
}`,
    },
    {
      method: 'GET',
      path: '/api/v1/analytics',
      scope: 'analytics:read',
      desc: 'Agrégats analytiques certifiés : 17 KPIs exécutifs et tendances.',
      params: '?range=30d',
      response: `{
  "success": true,
  "data": {
    "kpis": {
      "totalAlerts": 142,
      "totalInterventions": 98,
      "slaComplianceRateFormatted": "94.8%",
      "avgArrivalTime": "8m 12s"
    }
  }
}`,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-cyan-400" />
            Spécification API Publique v1
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Guide d’intégration RESTful pour les systèmes partenaires, ERP et centres de télésurveillance.
          </p>
        </div>

        <a
          href="/api/v1/openapi.json"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-400 text-xs font-bold"
        >
          <span>Spécification OpenAPI 3.0 (JSON)</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Authentification Header Spec */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-cyan-400" />
          Protocole d'Authentification
        </h3>
        <p className="text-xs text-slate-300 leading-relaxed">
          Toutes les requêtes vers les endpoints <code>/api/v1/*</code> doivent obligatoirement inclure votre clé API dans le header HTTP :
        </p>

        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-cyan-300">
          X-SECURIA-API-KEY: sec_live_9a7f3e82...
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 text-xs">
          <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
            <span className="font-bold text-white block">Isolation Multi-Tenant</span>
            <span className="text-slate-400 mt-0.5 block">Chaque clé API est rattachée strictement à une seule organisation.</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
            <span className="font-bold text-white block">RBAC &amp; Scopes</span>
            <span className="text-slate-400 mt-0.5 block">Seuls les endpoints autorisés par vos permissions configurées répondent en 200 OK.</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
            <span className="font-bold text-white block">Sécurité Zéro-Clair</span>
            <span className="text-slate-400 mt-0.5 block">Les clés sont hachées SHA-256 et ne peuvent être révélées rétroactivement.</span>
          </div>
        </div>
      </div>

      {/* Endpoints Reference */}
      <div className="space-y-6">
        <h3 className="text-base font-bold text-white">Points d'Entrée API v1 Disponibles</h3>

        {endpoints.map((ep) => (
          <div key={ep.path} className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-xs font-bold bg-cyan-950 border border-cyan-500/40 text-cyan-300">
                  {ep.method}
                </span>
                <span className="font-mono text-sm font-bold text-white">{ep.path}</span>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
                Scope requis : {ep.scope}
              </span>
            </div>

            <p className="text-xs text-slate-300">{ep.desc}</p>

            {ep.params && (
              <div className="text-xs text-slate-400">
                Paramètres optionnels : <code className="text-cyan-300">{ep.params}</code>
              </div>
            )}

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Exemple de Réponse JSON (200 OK)</span>
              <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-emerald-300 overflow-x-auto">
                {ep.response}
              </pre>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
