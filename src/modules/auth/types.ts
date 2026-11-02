import { UserRole } from '../users/types';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  fullName: string;
  phone: string;
  organizationId?: string | null;
}

export interface AuthSession {
  user: AuthUser;
  token: string;
  expiresAt: number;
}

export interface LoginCredentials {
  email: string;
  password?: string;
  role?: UserRole;
}

export interface RegisterData {
  email: string;
  fullName: string;
  phone: string;
  role?: UserRole;
  organizationId?: string;
}
