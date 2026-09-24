-- Row Level Security su tutte le tabelle (public e sandbox), senza policy.
-- La chiave anon e' pubblica: senza RLS l'API REST di Supabase esponeva le
-- tabelle (users, sessions, sales...) a chiunque. Senza policy anon e
-- authenticated non vedono nulla; il gestionale non ne risente perche' si
-- collega come proprietario delle tabelle (DATABASE_URL), che la RLS non tocca.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, tablename FROM pg_tables
           WHERE schemaname IN ('public', 'sandbox') AND NOT rowsecurity LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', r.schemaname, r.tablename);
  END LOOP;
END $$;
