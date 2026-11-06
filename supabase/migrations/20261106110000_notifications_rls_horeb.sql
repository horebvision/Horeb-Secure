-- =============================================================================
-- Notifications : règles d'accès propres à Horeb Secure
-- =============================================================================
-- Avant :
--  - INSERT ouvert à tout utilisateur (WITH CHECK true) : n'importe qui pouvait
--    créer une notification (lien piégé) chez n'importe quel destinataire ;
--  - SELECT/UPDATE via is_admin(), fonction d'une autre application qui lit
--    public.profiles (alimentée depuis les métadonnées libres d'inscription).
-- Après :
--  - lecture / marquage « lu » : le destinataire, ou le Super Admin plateforme ;
--  - écriture : réservée au serveur (clé secrète) et aux fonctions SECURITY DEFINER.
-- Le temps réel (postgres_changes) applique ces règles : chaque utilisateur ne
-- reçoit que ses propres notifications.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS "Admins or triggers can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their notifications" ON public.notifications;
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
DROP POLICY IF EXISTS notifications_update_own ON public.notifications;

CREATE POLICY notifications_select_own ON public.notifications FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.app_is_platform_admin());

CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR public.app_is_platform_admin())
WITH CHECK (user_id = auth.uid() OR public.app_is_platform_admin());

REVOKE INSERT, DELETE ON public.notifications FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications (user_id, created_at DESC);

COMMIT;
