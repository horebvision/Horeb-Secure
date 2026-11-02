import { NextRequest } from 'next/server';
import { authenticateApiRequest } from '@/lib/security/api-guard';
import type { UserRole } from '@/modules/users/types';

export interface EffectiveSession {
  userId: string;
  user_id: string;
  email: string;
  role: UserRole;
  organizationId: string | null;
  organization_id: string | null;
}

/**
 * Récupère la session effective et vérifiée de la requête API courante
 */
export async function getEffectiveSession(req: NextRequest): Promise<EffectiveSession | null> {
  const { user } = await authenticateApiRequest(req);
  if (!user) return null;

  return {
    userId: user.id,
    user_id: user.id,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
    organization_id: user.organizationId,
  };
}
