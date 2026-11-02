/**
-- SECURIA V2.12.0 — TYPES DU DOMAINE SECRÉTARIAT & REGISTRE DES VISITEURS
-- Module de secrétariat pour la gestion des visiteurs à l'accueil interne.
-*/

export type VisitStatus = 'PRESENT' | 'CHECKED_OUT' | 'CANCELLED';

export type VisitReason =
  | 'RENDEZ_VOUS'
  | 'LIVRAISON'
  | 'ENTRETIEN'
  | 'MAINTENANCE'
  | 'COMMERCIAL'
  | 'ADMINISTRATIF'
  | 'AUTRE';

export type IdentityDocumentType =
  | 'CNI'
  | 'PASSEPORT'
  | 'PERMIS'
  | 'CARTE_SEJOUR'
  | 'BADGE_PRO'
  | 'AUTRE';

export type SignatureStatus = 'SIGNED' | 'REFUSED' | 'UNAVAILABLE' | 'UNSIGNED';

export interface VisitorIdentityDocument {
  id: string;
  organization_id: string;
  visitor_person_id: string;
  document_type: 'RECTO' | 'VERSO';
  storage_path: string;
  file_size_bytes?: number | null;
  mime_type?: string | null;
  captured_at: string;
  uploaded_by?: string | null;
  retention_until?: string | null;
  deleted_at?: string | null;
  created_at: string;
  // Signed URL éphémère fournie dynamiquement lors d'une consultation autorisée
  signed_url?: string | null;
}

export interface VisitorPerson {
  id: string;
  organization_id: string;
  visit_id: string;
  full_name: string;
  phone?: string | null;
  identity_document_type: IdentityDocumentType;
  identity_number_last4?: string | null;
  identity_number_encrypted?: string | null;
  identity_expiry_date?: string | null;
  arrival_at: string;
  departure_at?: string | null;
  duration_minutes?: number | null;
  signature_storage_path?: string | null;
  signature_data_url?: string | null;
  signed_at?: string | null;
  signature_consent: boolean;
  signature_status: SignatureStatus;
  signature_refusal_reason?: string | null;
  status: VisitStatus;
  created_at: string;
  updated_at: string;
  documents?: VisitorIdentityDocument[];
}

export interface VisitorVisit {
  id: string;
  organization_id: string;
  site_id?: string | null;
  site_name?: string | null;
  visit_reference: string;
  visit_reason: VisitReason;
  host_name?: string | null;
  host_department?: string | null;
  visitor_company?: string | null;
  status: VisitStatus;
  notes?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
  people_count?: number;
  people?: VisitorPerson[];
}

export interface CreatePersonInput {
  full_name: string;
  phone?: string;
  identity_document_type: IdentityDocumentType;
  identity_number?: string;
  identity_expiry_date?: string;
  // Photos de pièces d'identité encodées base64 ou uploadées
  recto_photo_data?: string; // data:image/jpeg;base64,...
  verso_photo_data?: string;
  // Signature électronique
  signature_data?: string; // data:image/png;base64,...
  signature_consent?: boolean;
  signature_status?: SignatureStatus;
  signature_refusal_reason?: string;
}

export interface CreateVisitInput {
  site_id?: string;
  visit_reason: VisitReason;
  host_name?: string;
  host_department?: string;
  visitor_company?: string;
  notes?: string;
  people: CreatePersonInput[];
}

export interface SecretariatStats {
  currently_present: number;
  today_arrivals: number;
  today_departures: number;
  active_visits_count: number;
  average_duration_minutes: number;
}
