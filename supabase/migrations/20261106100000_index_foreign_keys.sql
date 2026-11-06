-- =============================================================================
-- Index des clés étrangères
-- =============================================================================
-- Toute clé étrangère mono-colonne du schéma public sans index en tête reçoit
-- un index B-tree. Sans index, chaque jointure (alerte → site, intervention →
-- organisation…) et chaque suppression en cascade parcourt la table entière :
-- invisible à faible volume, bloquant à l'échelle.
-- Tables actuellement petites : création non concurrente, verrou de quelques ms.
-- Idempotent (IF NOT EXISTS + détection dynamique).
-- =============================================================================

BEGIN;

DO $$
DECLARE
  r RECORD;
  v_name text;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, cl.relname AS tname, a.attname AS col
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND array_length(c.conkey, 1) = 1
      AND NOT EXISTS (
        SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1]
      )
  LOOP
    v_name := left('idx_fk_' || r.tname || '_' || r.col, 63);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (%I)', v_name, r.tbl, r.col);
  END LOOP;
END $$;

COMMIT;
