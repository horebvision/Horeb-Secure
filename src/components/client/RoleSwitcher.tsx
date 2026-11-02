'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useSecuria } from '@/lib/store/securia-context';
import { type UserRole, isPlatformAdminUser } from '@/modules/users/types';
import { Shield, Radio, User, Layers } from 'lucide-react';

export function RoleSwitcher() {
  const router = useRouter();
  const { currentRole, setCurrentRole, currentUser, authUser } = useSecuria();

  const handleRoleChange = (newRole: UserRole) => {
    setCurrentRole(newRole);
    if (typeof document !== 'undefined') {
      document.cookie = `securia_role=${newRole}; path=/; max-age=604800; SameSite=Lax`;
    }
    if (newRole === 'USER') router.push('/dashboard');
    else if (newRole === 'SECRETARY') router.push('/secretariat');
    else if (newRole === 'AGENT') router.push('/agent');
    else if (newRole === 'SECURITY_MANAGER') router.push('/dispatch');
    else if (newRole === 'ADMIN') {
      const isPlatform = isPlatformAdminUser({
        role: newRole,
        email: currentUser?.email || authUser?.email,
        organizationId: currentUser?.organization_id || authUser?.organization_id,
        isPlatformAdmin: currentUser?.is_platform_admin ?? authUser?.is_platform_admin,
      });
      router.push(isPlatform ? '/admin' : '/dispatch');
    }
  };

  return (
    <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-2xl p-1">
      <select
        value={currentRole}
        onChange={(e) => handleRoleChange(e.target.value as UserRole)}
        className="bg-transparent text-xs font-bold text-slate-200 focus:outline-none cursor-pointer px-2 py-1"
      >
        <option value="AGENT" className="bg-slate-900 text-white">
          🛡️ Agent Patrouille
        </option>
        <option value="SECRETARY" className="bg-slate-900 text-white">
          🏛️ Secrétariat
        </option>
        <option value="SECURITY_MANAGER" className="bg-slate-900 text-white">
          📡 Centre Sécurité
        </option>
        <option value="USER" className="bg-slate-900 text-white">
          👤 Résident (Client)
        </option>
        <option value="ADMIN" className="bg-slate-900 text-white">
          ⚡ Administrateur
        </option>
      </select>
    </div>
  );
}
