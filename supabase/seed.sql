-- ==============================================================================
-- PROJET SECURIA - DONNÉES DE DÉMONSTRATION LOCALES / DÉVELOPPEMENT (SEED)
-- Adapté pour le schéma complet : public.users, security_agents, owner_id
-- STRICTEMENT LOCALISÉ EN CÔTE D'IVOIRE (ABIDJAN)
-- STRICTEMENT DESTINÉ À L'ENVIRONNEMENT LOCAL ISOLÉ — JAMAIS EXÉCUTÉ EN PRODUCTION
-- ==============================================================================

-- 1. ORGANISATION DE SÉCURITÉ
INSERT INTO public.organizations (id, name, code, phone, email, address, city, postal_code, is_active)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'SECURIA Command Center Côte d''Ivoire',
  'SECURIA-CI-01',
  '+225 27 22 40 50 60',
  'dispatch.abidjan@securia.ci',
  'Boulevard Valéry Giscard d''Estaing, Marcory',
  'Abidjan',
  '01 BP 1234',
  true
) ON CONFLICT (code) DO NOTHING;

-- 2. CENTRE DE SÉCURITÉ OPÉRATIONNEL
INSERT INTO public.security_centers (id, organization_id, name, code, phone, email, address, city, postal_code, latitude, longitude, is_active)
VALUES (
  '202a6970-8afb-44cf-9455-aa16e2c7cbd1',
  '11111111-1111-1111-1111-111111111111',
  'Poste Central de Sécurité & Télésurveillance Abidjan',
  'PC-ABJ-01',
  '+225 27 20 21 22 23',
  'dispatch.plateau@securia.ci',
  'Avenue Delafosse, Le Plateau',
  'Abidjan',
  '01 BP 5678',
  5.3285,
  -4.0180,
  true
) ON CONFLICT (code) DO NOTHING;

-- 3. ENTRÉES D'AUTHENTIFICATION LOCALES (auth.users)
-- Permet de satisfaire la contrainte de clé étrangère public.users.id REFERENCES auth.users(id)
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
VALUES
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '00000000-0000-0000-0000-000000000000',
    'marc.koffi@client.ci',
    '$2a$10$abcdefghijklmnopqrstuuNOPQRSTUVWXYZ0123456789abcdefghijk',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Marc Koffi"}'::jsonb,
    now(),
    now(),
    'authenticated',
    'authenticated'
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '00000000-0000-0000-0000-000000000000',
    'karim.traore@agent.securia.ci',
    '$2a$10$abcdefghijklmnopqrstuuNOPQRSTUVWXYZ0123456789abcdefghijk',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Karim Traoré"}'::jsonb,
    now(),
    now(),
    'authenticated',
    'authenticated'
  ),
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    '00000000-0000-0000-0000-000000000000',
    'bakary.diomande@agent.securia.ci',
    '$2a$10$abcdefghijklmnopqrstuuNOPQRSTUVWXYZ0123456789abcdefghijk',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Bakary Diomandé"}'::jsonb,
    now(),
    now(),
    'authenticated',
    'authenticated'
  ),
  (
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    '00000000-0000-0000-0000-000000000000',
    'aminata.kone@dispatch.securia.ci',
    '$2a$10$abcdefghijklmnopqrstuuNOPQRSTUVWXYZ0123456789abcdefghijk',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Aminata Koné"}'::jsonb,
    now(),
    now(),
    'authenticated',
    'authenticated'
  ),
  (
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    '00000000-0000-0000-0000-000000000000',
    'admin@securia.ci',
    '$2a$10$abcdefghijklmnopqrstuuNOPQRSTUVWXYZ0123456789abcdefghijk',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Alexandre Bamba"}'::jsonb,
    now(),
    now(),
    'authenticated',
    'authenticated'
  )
ON CONFLICT (id) DO NOTHING;

-- 4. UTILISATEURS APPLICATIFS (public.users)
INSERT INTO public.users (id, email, full_name, phone, role, organization_id, security_center_id, is_active)
VALUES
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'marc.koffi@client.ci',
    'Marc Koffi',
    '+225 07 12 34 56 78',
    'USER'::securia_user_role,
    '11111111-1111-1111-1111-111111111111',
    '202a6970-8afb-44cf-9455-aa16e2c7cbd1',
    true
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'karim.traore@agent.securia.ci',
    'Karim Traoré (Patrouille Moto Cocody)',
    '+225 05 44 55 66 77',
    'AGENT'::securia_user_role,
    '11111111-1111-1111-1111-111111111111',
    '202a6970-8afb-44cf-9455-aa16e2c7cbd1',
    true
  ),
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'bakary.diomande@agent.securia.ci',
    'Bakary Diomandé (Intervention 4x4 Plateau)',
    '+225 01 33 22 11 00',
    'AGENT'::securia_user_role,
    '11111111-1111-1111-1111-111111111111',
    '202a6970-8afb-44cf-9455-aa16e2c7cbd1',
    true
  ),
  (
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'aminata.kone@dispatch.securia.ci',
    'Aminata Koné (Chef de Salle Régulation)',
    '+225 27 22 40 50 61',
    'SECURITY_MANAGER'::securia_user_role,
    '11111111-1111-1111-1111-111111111111',
    '202a6970-8afb-44cf-9455-aa16e2c7cbd1',
    true
  ),
  (
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    'admin@securia.ci',
    'Alexandre Bamba (Superviseur National CI)',
    '+225 07 88 99 00 11',
    'ADMIN'::securia_user_role,
    '11111111-1111-1111-1111-111111111111',
    '202a6970-8afb-44cf-9455-aa16e2c7cbd1',
    true
  )
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  organization_id = EXCLUDED.organization_id;

-- 5. AGENTS DE SÉCURITÉ DE TERRAIN (public.security_agents)
INSERT INTO public.security_agents (id, user_id, organization_id, security_center_id, badge_number, duty_status, patrol_vehicle, current_latitude, current_longitude, is_active)
VALUES
  (
    '55555555-5555-5555-5555-555555555555',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '11111111-1111-1111-1111-111111111111',
    '202a6970-8afb-44cf-9455-aa16e2c7cbd1',
    'SEC-CI-A01',
    'AVAILABLE'::securia_agent_duty_status,
    'Patrouille Moto Cocody',
    5.3536,
    -4.0012,
    true
  ),
  (
    '66666666-6666-6666-6666-666666666666',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    '11111111-1111-1111-1111-111111111111',
    '202a6970-8afb-44cf-9455-aa16e2c7cbd1',
    'SEC-CI-B02',
    'AVAILABLE'::securia_agent_duty_status,
    'Véhicule d’Intervention 4x4 Plateau',
    5.3262,
    -4.0198,
    true
  )
ON CONFLICT (badge_number) DO NOTHING;

-- 6. SITES PROTÉGÉS (public.protected_sites) - owner_id pointe vers public.users
INSERT INTO public.protected_sites (id, owner_id, organization_id, security_center_id, name, site_type, address, city, postal_code, latitude, longitude, access_instructions, is_default)
VALUES
  (
    '22222222-2222-2222-2222-222222222222',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '11111111-1111-1111-1111-111111111111',
    '202a6970-8afb-44cf-9455-aa16e2c7cbd1',
    'Résidence Palmier Cocody Ambassades',
    'RESIDENCE'::securia_site_type,
    'Rue des Ambassades, Cocody',
    'Abidjan',
    '08 BP 489',
    5.3536,
    -4.0012,
    'Poste de garde principal à l''entrée. Portail automatisé et vidéosurveillance périphérique.',
    true
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '11111111-1111-1111-1111-111111111111',
    '202a6970-8afb-44cf-9455-aa16e2c7cbd1',
    'Siège Entreprise & Tour Plateau',
    'COMMERCE'::securia_site_type,
    'Avenue Chardy, Le Plateau',
    'Abidjan',
    '01 BP 2001',
    5.3262,
    -4.0198,
    'Contrôle d''accès biométrique au rez-de-chaussée. Poste de sécurité au hall d''accueil.',
    false
  )
ON CONFLICT (id) DO NOTHING;

-- 7. CONTACTS D'URGENCE (public.emergency_contacts)
INSERT INTO public.emergency_contacts (id, user_id, name, relation, phone, priority_order)
VALUES
  (
    '77777777-7777-7777-7777-777777777771',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Affoué Koffi',
    'Épouse',
    '+225 07 98 76 54 32',
    1
  ),
  (
    '77777777-7777-7777-7777-777777777772',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Poste Police Nationale Cocody',
    'Secours',
    '170 / 111',
    2
  )
ON CONFLICT (id) DO NOTHING;

-- 8. ALERTE DE DÉMONSTRATION EN COURS (public.alerts)
INSERT INTO public.alerts (
  id,
  alert_number,
  user_id,
  site_id,
  organization_id,
  security_center_id,
  type,
  priority,
  status,
  latitude,
  longitude,
  location_address,
  is_silent,
  client_notes,
  assigned_agent_id,
  created_at
)
VALUES (
  '44444444-4444-4444-4444-444444444444',
  'SEC-2026-0042',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  '202a6970-8afb-44cf-9455-aa16e2c7cbd1',
  'INTRUSION'::securia_alert_type,
  'CRITICAL'::securia_alert_priority,
  'EN_ROUTE'::securia_alert_status,
  5.3536,
  -4.0012,
  'Rue des Ambassades, Cocody, Abidjan',
  false,
  'Déclenchement capteur périmétrique zone ouest de la résidence.',
  '55555555-5555-5555-5555-555555555555',
  now() - interval '12 minutes'
) ON CONFLICT (alert_number) DO NOTHING;

-- 9. HISTORIQUE DE L'ALERTE EN COURS (public.alert_events)
INSERT INTO public.alert_events (alert_id, actor_id, from_status, to_status, event_type, comment, created_at)
VALUES
  (
    '44444444-4444-4444-4444-444444444444',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    NULL,
    'SENT'::securia_alert_status,
    'ALERT_CREATED',
    'Alerte INTRUSION déclenchée par Marc Koffi depuis l''application mobile.',
    now() - interval '12 minutes'
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'SENT'::securia_alert_status,
    'ACKNOWLEDGED'::securia_alert_status,
    'STATUS_CHANGE',
    'Alerte réceptionnée et prise en charge par Aminata Koné (Régulatrice).',
    now() - interval '10 minutes'
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'ACKNOWLEDGED'::securia_alert_status,
    'ASSIGNED'::securia_alert_status,
    'AGENT_ASSIGNED',
    'Affectation de l''agent d''intervention Karim Traoré (Patrouille Moto Cocody).',
    now() - interval '8 minutes'
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'ASSIGNED'::securia_alert_status,
    'EN_ROUTE'::securia_alert_status,
    'STATUS_CHANGE',
    'L''agent Karim Traoré a accepté la mission et se rend sur place en patrouille moto.',
    now() - interval '4 minutes'
  )
ON CONFLICT DO NOTHING;
