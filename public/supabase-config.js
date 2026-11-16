/* Configuration Supabase (Project Settings > API).
   - url     : « Project URL »
   - anonKey : clé « anon public » ou « publishable »
   Ces deux valeurs ne sont pas secrètes : la sécurité repose sur la connexion + supabase/schema.sql.
   NE JAMAIS mettre ici la clé « service_role » / « secret ». */
window.SUPABASE_CONFIG = {
  url: "https://gaiphcrrhkgnsnkqicpx.supabase.co",
  // Identifiant de la fonction de gestion des comptes (fin de son URL dans Supabase > Edge Functions)
  adminFunction: "rapid-responder",
  anonKey: "sb_publishable_gj34SKmR0kb_DSP-t05aCQ_UZR13MGy"
};
