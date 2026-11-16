// Planet'Claim — gestion des comptes par l'administrateur.
// Tourne chez Supabase (Edge Function). La clé service_role reste côté serveur :
// elle n'est jamais envoyée au navigateur.
// Seul un membre "admin" (table public.members), e-mail confirmé, peut l'appeler.
//
// Actions (POST JSON) :
//   { action: "list" }                                   -> comptes + dernière connexion
//   { action: "create", email, name, role, password? }   -> crée le compte + l'accès
//   { action: "reset",  email }                          -> nouveau mot de passe provisoire
//   { action: "delete", email }                          -> supprime le compte + l'accès
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ROLES = ["admin", "staff", "cf"];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fail = (status: number, error: string) => json({ error }, status);

// Mot de passe provisoire : 14 caractères sans caractères ambigus (0/O, 1/l/I).
function tempPassword(): string {
  const A = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const r = crypto.getRandomValues(new Uint32Array(14));
  let p = "";
  for (const x of r) p += A[x % A.length];
  return p.slice(0, 4) + "-" + p.slice(4, 9) + "-" + p.slice(9);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail(405, "Méthode non autorisée");

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Qui appelle ? (jeton de session de l'utilisateur connecté)
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: who } = await sb.auth.getUser(token);
  const me = who?.user;
  if (!me || !me.email) return fail(401, "Connexion requise");
  const myEmail = me.email.toLowerCase();
  const { data: mine } = await sb.from("members").select("role").eq("email", myEmail).maybeSingle();
  if (!me.email_confirmed_at || mine?.role !== "admin") return fail(403, "Réservé aux administrateurs");

  let body: Record<string, string> = {};
  try { body = await req.json(); } catch { return fail(400, "Requête invalide"); }
  const email = String(body.email || "").trim().toLowerCase();
  const okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;

  // Recherche d'un compte par e-mail (l'API admin ne filtre pas par e-mail).
  async function findUser(mail: string) {
    for (let page = 1; page <= 50; page++) {
      const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      const u = data.users.find((x) => (x.email || "").toLowerCase() === mail);
      if (u) return u;
      if (data.users.length < 200) return null;
    }
    return null;
  }

  try {
    switch (body.action) {
      case "list": {
        const out: Record<string, unknown>[] = [];
        for (let page = 1; page <= 50; page++) {
          const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
          if (error) throw error;
          data.users.forEach((u) => out.push({
            email: (u.email || "").toLowerCase(),
            created: u.created_at, last: u.last_sign_in_at || null,
            confirmed: !!u.email_confirmed_at,
          }));
          if (data.users.length < 200) break;
        }
        return json({ users: out });
      }

      case "create": {
        if (!okEmail) return fail(400, "Adresse e-mail invalide");
        const role = String(body.role || "staff");
        if (!ROLES.includes(role)) return fail(400, "Rôle invalide");
        const name = String(body.name || "").trim().slice(0, 80);
        const password = body.password ? String(body.password) : tempPassword();
        if (password.length < 10) return fail(400, "Mot de passe : 10 caractères minimum");

        let created = true;
        const { error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
        if (error) {
          // Compte déjà existant : on (re)donne simplement l'accès, sans toucher à son mot de passe.
          if (!/already|registered|exists/i.test(error.message)) throw error;
          created = false;
        }
        const { error: e2 } = await sb.from("members").upsert({ email, role, name, added: Date.now() });
        if (e2) throw e2;
        return json({ ok: true, created, email, password: created ? password : null });
      }

      case "reset": {
        if (!okEmail) return fail(400, "Adresse e-mail invalide");
        const u = await findUser(email);
        if (!u) return fail(404, "Aucun compte pour cet e-mail");
        const password = tempPassword();
        const { error } = await sb.auth.admin.updateUserById(u.id, { password, email_confirm: true });
        if (error) throw error;
        return json({ ok: true, email, password });
      }

      case "delete": {
        if (!okEmail) return fail(400, "Adresse e-mail invalide");
        if (email === myEmail) return fail(400, "Vous ne pouvez pas supprimer votre propre compte");
        const { error: e1 } = await sb.from("members").delete().eq("email", email);
        if (e1) throw e1;
        const u = await findUser(email);
        if (u) { const { error } = await sb.auth.admin.deleteUser(u.id); if (error) throw error; }
        return json({ ok: true, email });
      }

      default:
        return fail(400, "Action inconnue");
    }
  } catch (e) {
    console.error(e);
    return fail(500, "Erreur serveur : " + ((e as Error).message || String(e)));
  }
});
