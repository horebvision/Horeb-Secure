/**
 * SECURIA V2.11.1 — MODULE CLIENTS & GESTION DES COMPTES CLIENTS
 * Modèle relationnel B2B : Organization (Société de sécurité) -> Clients -> (Sites, Users, Alerts, Interventions)
 */

export type ClientType =
  | 'PARTICULIER'
  | 'ENTREPRISE'
  | 'RESIDENCE'
  | 'COPROPRIETE'
  | 'COMMERCE'
  | 'INDUSTRIE'
  | 'BANQUE'
  | 'HOTEL'
  | 'INSTITUTION'
  | 'AUTRE';

export type ClientStatus = 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'ARCHIVED';

export interface Client {
  id: string;
  organization_id: string;
  name: string;
  client_type: ClientType;
  primary_contact_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  status: ClientStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Métriques calculées
  sites_count?: number;
  users_count?: number;
}

export interface CreateClientInput {
  name: string;
  client_type?: ClientType;
  primary_contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  status?: ClientStatus;
  notes?: string | null;
  // Optionnel : création du premier site dans le même workflow
  initial_site?: {
    name: string;
    site_type?: string;
    address: string;
    city?: string;
    postal_code?: string;
    access_instructions?: string;
  };
}

export interface UpdateClientInput {
  name?: string;
  client_type?: ClientType;
  primary_contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  status?: ClientStatus;
  notes?: string | null;
}

export interface ClientInvitation {
  id: string;
  organization_id: string;
  client_id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: 'USER';
  token: string;
  allowed_site_ids: string[];
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
  expires_at: string;
  invited_by: string | null;
  created_at: string;
  used_at: string | null;
}

export interface InviteClientUserInput {
  email: string;
  full_name: string;
  phone?: string | null;
  function_title?: string | null;
  allowed_site_ids?: string[];
}
