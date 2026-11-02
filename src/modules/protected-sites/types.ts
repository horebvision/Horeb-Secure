export type SiteType = 'RESIDENCE' | 'COMMERCE' | 'ENTREPRISE' | 'AUTRE';

export interface ProtectedSite {
  id: string;
  user_id: string;
  organization_id?: string | null;
  name: string;
  site_type: SiteType;
  address: string;
  city?: string | null;
  postal_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  access_instructions?: string | null;
  is_default: boolean;
  created_at: string;
  updated_at?: string;
}

export type CreateProtectedSiteDto = Omit<ProtectedSite, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type UpdateProtectedSiteDto = Partial<CreateProtectedSiteDto>;
