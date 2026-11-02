-- ==============================================================================
-- SECURIA V2.12.0 — PHASE 12 : SECRÉTARIAT INTERNE & REGISTRE NUMÉRIQUE DES VISITEURS
-- Module de secrétariat pour la gestion des visiteurs à l'accueil interne de la société.
-- Isolation multi-tenant stricte, non-destructif, RLS et traçabilité d'audit.
-- ==============================================================================

-- 0. EXTENSION DU TYPE ENUM DES RÔLES UTILISATEURS
ALTER TYPE public.securia_user_role ADD VALUE IF NOT EXISTS 'SECRETARY';

-- 1. TABLE DES VISITES (Dossier d'accueil)
CREATE TABLE IF NOT EXISTS public.visitor_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  site_id UUID REFERENCES public.protected_sites(id) ON DELETE SET NULL,
  visit_reference TEXT NOT NULL,
  visit_reason TEXT NOT NULL DEFAULT 'RENDEZ_VOUS',
  host_name TEXT,
  host_department TEXT,
  visitor_company TEXT,
  status TEXT NOT NULL DEFAULT 'PRESENT', -- 'PRESENT', 'CHECKED_OUT', 'CANCELLED'
  notes TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexation de performance pour visitor_visits
CREATE INDEX IF NOT EXISTS idx_visitor_visits_org ON public.visitor_visits(organization_id);
CREATE INDEX IF NOT EXISTS idx_visitor_visits_site ON public.visitor_visits(site_id);
CREATE INDEX IF NOT EXISTS idx_visitor_visits_status ON public.visitor_visits(status);
CREATE INDEX IF NOT EXISTS idx_visitor_visits_created ON public.visitor_visits(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_visits_ref ON public.visitor_visits(visit_reference);

-- 2. TABLE DES PERSONNES VISITEUSES ASSOCIÉES (Gestion individuelle des visiteurs)
CREATE TABLE IF NOT EXISTS public.visitor_visit_people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  visit_id UUID NOT NULL REFERENCES public.visitor_visits(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  identity_document_type TEXT NOT NULL DEFAULT 'CNI', -- 'CNI', 'PASSEPORT', 'PERMIS', 'CARTE_SEJOUR', 'BADGE_PRO', 'AUTRE'
  identity_number_last4 TEXT, -- 4 derniers caractères pour affichage sécurisé
  identity_number_encrypted TEXT, -- Numéro protégé
  identity_expiry_date DATE,
  arrival_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  departure_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  signature_storage_path TEXT,
  signature_data_url TEXT,
  signed_at TIMESTAMPTZ,
  signature_consent BOOLEAN DEFAULT false,
  signature_status TEXT NOT NULL DEFAULT 'UNSIGNED', -- 'SIGNED', 'REFUSED', 'UNAVAILABLE', 'UNSIGNED'
  signature_refusal_reason TEXT,
  status TEXT NOT NULL DEFAULT 'PRESENT', -- 'PRESENT', 'CHECKED_OUT', 'CANCELLED'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexation de performance pour visitor_visit_people
CREATE INDEX IF NOT EXISTS idx_visitor_people_org ON public.visitor_visit_people(organization_id);
CREATE INDEX IF NOT EXISTS idx_visitor_people_visit ON public.visitor_visit_people(visit_id);
CREATE INDEX IF NOT EXISTS idx_visitor_people_status ON public.visitor_visit_people(status);
CREATE INDEX IF NOT EXISTS idx_visitor_people_arrival ON public.visitor_visit_people(arrival_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_people_name ON public.visitor_visit_people(full_name);

-- 3. TABLE DES PIÈCES D'IDENTITÉ NUMÉRISÉES (Stockage sécurisé privé)
CREATE TABLE IF NOT EXISTS public.visitor_identity_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  visitor_person_id UUID NOT NULL REFERENCES public.visitor_visit_people(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL DEFAULT 'RECTO', -- 'RECTO', 'VERSO'
  storage_path TEXT NOT NULL,
  file_size_bytes INTEGER,
  mime_type TEXT DEFAULT 'image/jpeg',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  retention_until TIMESTAMPTZ DEFAULT (now() + INTERVAL '90 days'),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visitor_docs_org ON public.visitor_identity_documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_visitor_docs_person ON public.visitor_identity_documents(visitor_person_id);
CREATE INDEX IF NOT EXISTS idx_visitor_docs_retention ON public.visitor_identity_documents(retention_until);

-- 4. POLITIQUES DE SÉCURITÉ RLS (Row Level Security)
ALTER TABLE public.visitor_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitor_visit_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitor_identity_documents ENABLE ROW LEVEL SECURITY;

-- Politique d'accès par organisation pour visitor_visits
DROP POLICY IF EXISTS p_visitor_visits_org_access ON public.visitor_visits;
CREATE POLICY p_visitor_visits_org_access ON public.visitor_visits
  FOR ALL
  TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN')
  );

-- Politique d'accès par organisation pour visitor_visit_people
DROP POLICY IF EXISTS p_visitor_people_org_access ON public.visitor_visit_people;
CREATE POLICY p_visitor_people_org_access ON public.visitor_visit_people
  FOR ALL
  TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN')
  );

-- Politique d'accès par organisation pour visitor_identity_documents
DROP POLICY IF EXISTS p_visitor_docs_org_access ON public.visitor_identity_documents;
CREATE POLICY p_visitor_docs_org_access ON public.visitor_identity_documents
  FOR ALL
  TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN')
  );

-- 5. FONCTION RPC DE CHECKOUT ATOMIQUE POUR UN VISITEUR (Anti double-checkout & Concurrence)
CREATE OR REPLACE FUNCTION public.checkout_visitor_person(
  p_person_id UUID,
  p_actor_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_person RECORD;
  v_visit RECORD;
  v_now TIMESTAMPTZ := now();
  v_duration INTEGER;
  v_all_checked_out BOOLEAN;
BEGIN
  -- 1. Récupération avec verrouillage pessimiste
  SELECT * INTO v_person
  FROM public.visitor_visit_people
  WHERE id = p_person_id
  FOR UPDATE;

  IF v_person.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Visiteur introuvable');
  END IF;

  IF v_person.status = 'CHECKED_OUT' OR v_person.departure_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Ce visiteur a déjà été enregistré en sortie',
      'departure_at', v_person.departure_at
    );
  END IF;

  -- 2. Calcul durée en minutes
  v_duration := GREATEST(1, ROUND(EXTRACT(EPOCH FROM (v_now - v_person.arrival_at)) / 60)::integer);

  -- 3. Mise à jour de la personne
  UPDATE public.visitor_visit_people
  SET
    status = 'CHECKED_OUT',
    departure_at = v_now,
    duration_minutes = v_duration,
    updated_at = v_now
  WHERE id = p_person_id;

  -- 4. Vérifier si toutes les personnes de la visite sont sorties
  SELECT NOT EXISTS (
    SELECT 1 FROM public.visitor_visit_people
    WHERE visit_id = v_person.visit_id AND status = 'PRESENT'
  ) INTO v_all_checked_out;

  IF v_all_checked_out THEN
    UPDATE public.visitor_visits
    SET status = 'CHECKED_OUT', updated_at = v_now
    WHERE id = v_person.visit_id;
  END IF;

  -- 5. Audit log
  INSERT INTO public.audit_logs (
    id, user_id, action, entity_type, entity_id, details, created_at
  ) VALUES (
    gen_random_uuid(),
    COALESCE(p_actor_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    'VISITOR_CHECKED_OUT',
    'secretariat',
    p_person_id,
    jsonb_build_object(
      'organization_id', v_person.organization_id,
      'visit_id', v_person.visit_id,
      'duration_minutes', v_duration,
      'departure_at', v_now
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'person_id', p_person_id,
    'visit_id', v_person.visit_id,
    'departure_at', v_now,
    'duration_minutes', v_duration,
    'all_checked_out', v_all_checked_out
  );
END;
$$;
