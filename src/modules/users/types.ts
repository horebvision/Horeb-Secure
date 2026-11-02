export type UserRole = 'USER' | 'AGENT' | 'SECURITY_MANAGER' | 'ADMIN' | 'SECRETARY';

export interface EmergencyContact {
  id?: string;
  name: string;
  relation: string;
  phone: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  role: UserRole;
  organization_id: string | null;
  security_center_id?: string | null;
  agent_status?: 'OFF_DUTY' | 'AVAILABLE' | 'BUSY' | 'DISPATCHED' | 'EN_ROUTE' | 'ON_SITE';
  duty_status?: 'OFF_DUTY' | 'AVAILABLE' | 'BUSY' | 'DISPATCHED' | 'EN_ROUTE' | 'ON_SITE';
  badge_number?: string | null;
  agent_name?: string | null;
  user?: any;
  users?: any;
  patrol_vehicle?: string | null;
  avatar_url?: string | null;
  current_latitude?: number | null;
  current_longitude?: number | null;
  last_location_update?: string | null;
  heading?: number | null;
  speed?: number | null;
  emergency_contacts?: EmergencyContact[];
  is_active: boolean;
  is_platform_admin?: boolean;
  created_at: string;
  updated_at: string;
}

export const MASTER_PLATFORM_ORG_ID = '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517';
export const STAGING_COMMAND_CENTER_ORG_ID = '11111111-1111-1111-1111-111111111111';
export const SUPER_ADMIN_EMAIL = 'ahossancedric22@gmail.com';
export const STAGING_SUPER_ADMIN_EMAIL = 'test-superadmin@staging.securia.internal';

/**
 * Détermine de façon autoritaire et unifiée si un utilisateur est un Super Admin Plateforme (SECURIA SaaS)
 * ou un Administrateur d'Entreprise Cliente (Tenant).
 */
export function isPlatformAdminUser(params: {
  role?: string | null;
  email?: string | null;
  organizationId?: string | null;
  isPlatformAdmin?: boolean | null;
}): boolean {
  if (params.role !== 'ADMIN') return false;
  if (params.isPlatformAdmin === true) return true;
  if (params.email) {
    const emailLower = params.email.toLowerCase().trim();

    // Vérification auprès des emails administrateurs configurés dans l'environnement
    const envAdminEmails = (process.env.PLATFORM_ADMIN_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (envAdminEmails.includes(emailLower)) return true;

    // Administrateur plateforme certifié
    if (emailLower === SUPER_ADMIN_EMAIL.toLowerCase()) return true;

    // Environnement de test / staging isolé uniquement
    if (process.env.NODE_ENV !== 'production' && process.env.ENABLE_TEST_AUTH === 'true') {
      if (emailLower === STAGING_SUPER_ADMIN_EMAIL.toLowerCase()) return true;
    }
  }
  if (params.organizationId === MASTER_PLATFORM_ORG_ID) return true;
  return false;
}
