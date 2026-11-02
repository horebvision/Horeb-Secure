'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Building2,
  ChevronDown,
  Check,
  Building,
  Shield,
  Layers,
  Sparkles,
} from 'lucide-react';
import { authFetch } from '@/lib/utils/api-client';

interface OrgSummary {
  id: string;
  name: string;
  commercialName?: string | null;
  plan?: string | null;
  status?: string | null;
}

export function OrganizationSwitcher() {
  const [currentOrg, setCurrentOrg] = useState<OrgSummary | null>(null);
  const [availableOrgs, setAvailableOrgs] = useState<OrgSummary[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Charger l'organisation courante
  useEffect(() => {
    let isMounted = true;

    async function loadCurrent() {
      try {
        const res = await authFetch('/api/organization');
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.id) {
            setCurrentOrg({
              id: data.id,
              name: data.commercial_name || data.commercialName || data.name || 'HOREB SECURE',
              commercialName: data.commercial_name || data.commercialName,
              plan: data.plan || 'BUSINESS_OS',
              status: data.status || 'ACTIVE',
            });
          }
        }
      } catch (err) {
        // Fallback silencieux
      }
    }

    // Charger les organisations disponibles si l'utilisateur est admin ou multi-org
    async function loadAvailable() {
      try {
        const res = await authFetch('/api/admin/organizations');
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.organizations && data.organizations.length > 0) {
            setAvailableOrgs(data.organizations);
          }
        }
      } catch {
        // Non-admin ou organisation unique
      }
    }

    loadCurrent();
    loadAvailable();

    return () => {
      isMounted = false;
    };
  }, []);

  // Fermer le menu lors d'un clic extérieur
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectOrg = async (orgId: string) => {
    if (currentOrg && currentOrg.id === orgId) {
      setIsOpen(false);
      return;
    }

    setIsSwitching(true);
    try {
      // Stockage immédiat local et persistant du choix d'organisation
      try {
        localStorage.setItem('securia_org_id', orgId);
        document.cookie = `securia_org_id=${encodeURIComponent(orgId)}; path=/; max-age=2592000; SameSite=Lax${typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''}`;
      } catch {}

      const res = await authFetch('/api/organization/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: orgId }),
      });
      const data = await res.json();
      if (data.success) {
        // Recharger complètement la page pour réinitialiser RLS, caches et stores
        window.location.reload();
      } else {
        alert(data.error || 'Erreur lors du basculement d\'organisation');
        setIsSwitching(false);
      }
    } catch (err: any) {
      alert('Erreur: ' + err.message);
      setIsSwitching(false);
    }
  };

  const displayName = currentOrg?.name || 'HOREB SECURE';
  const planLabel = (currentOrg?.plan || 'BUSINESS_OS').replace('_', ' ');
  const canSwitch = availableOrgs.length > 1;

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => canSwitch && setIsOpen(!isOpen)}
        disabled={!canSwitch || isSwitching}
        className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-xl border transition-all text-left ${
          canSwitch
            ? 'bg-slate-900/90 border-slate-700/80 hover:border-blue-500/60 hover:bg-slate-800/90 cursor-pointer'
            : 'bg-slate-900/60 border-slate-800 text-slate-300 cursor-default'
        }`}
        title={canSwitch ? 'Changer d\'organisation' : `Organisation active : ${displayName}`}
      >
        <div className="p-1 rounded-lg bg-blue-950/60 border border-blue-800/40 text-blue-400 shrink-0">
          <Building2 className="w-3.5 h-3.5" />
        </div>

        <div className="flex flex-col min-w-0 justify-center">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs font-bold text-white truncate max-w-[85px] xs:max-w-[110px] sm:max-w-[160px]">
              {displayName}
            </span>
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                currentOrg?.status === 'TRIAL'
                  ? 'bg-amber-400'
                  : currentOrg?.status === 'SUSPENDED'
                  ? 'bg-red-400'
                  : 'bg-emerald-400'
              }`}
            />
          </div>
          <span className="hidden sm:inline text-[10px] text-slate-400 font-mono tracking-tight leading-none mt-0.5">
            {planLabel}
          </span>
        </div>

        {canSwitch && (
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 transition-transform ml-0.5 shrink-0 ${
              isOpen ? 'rotate-180 text-blue-400' : ''
            }`}
          />
        )}
      </button>

      {/* Menu déroulant des organisations */}
      {isOpen && canSwitch && (
        <div className="absolute right-0 sm:left-0 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl shadow-black/80 z-50 overflow-hidden py-1 animate-in fade-in duration-150">
          <div className="px-3 py-2 border-b border-slate-800/80 bg-slate-950/50">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Espaces Entreprises
            </span>
          </div>

          <div className="max-h-60 overflow-y-auto divide-y divide-slate-800/40">
            {availableOrgs.map((org) => {
              const isSelected = currentOrg?.id === org.id;

              return (
                <button
                  key={org.id}
                  onClick={() => handleSelectOrg(org.id)}
                  disabled={isSwitching}
                  className={`w-full px-3 py-2.5 text-left flex items-center justify-between text-xs transition hover:bg-slate-800/60 ${
                    isSelected ? 'bg-blue-950/30 text-blue-300 font-semibold' : 'text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <div className="truncate">
                      <div className="truncate">{org.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {org.plan} • {org.status}
                      </div>
                    </div>
                  </div>

                  {isSelected && <Check className="w-4 h-4 text-blue-400 shrink-0 ml-2" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
