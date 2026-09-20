/**
 * Verifica lato server dei token Supabase Auth.
 *
 * Il client fa login con Supabase Auth e manda l'access_token; qui lo validiamo
 * e ricaviamo l'email. Il resto (ruolo, negozio, sessione cookie) resta gestito
 * dalla tabella `users` e da `sessions`, come prima con Firebase.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let admin: SupabaseClient | null = null;

function adminClient(): SupabaseClient {
  if (admin) return admin;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY non configurate.");
  }
  admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  return admin;
}

export function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export type SupabaseIdentity = { id: string; email: string };

/** Valida l'access_token Supabase e ritorna id+email, o null. */
export async function verifySupabaseToken(accessToken: string): Promise<SupabaseIdentity | null> {
  if (!accessToken) return null;
  const { data, error } = await adminClient().auth.getUser(accessToken);
  if (error || !data.user?.email) return null;
  return { id: data.user.id, email: data.user.email.toLowerCase() };
}

async function findAuthUserByEmail(email: string) {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await adminClient().auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const found = data.users.find((u) => u.email?.toLowerCase() === target);
    if (found) return found;
    if (data.users.length < 200) break;
  }
  return null;
}

export async function createAuthUser(email: string, password: string) {
  const { error } = await adminClient().auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(error.message);
}

export async function setAuthUserPassword(email: string, password: string) {
  const user = await findAuthUserByEmail(email);
  if (!user) throw new Error("Utente Supabase non trovato.");
  const { error } = await adminClient().auth.admin.updateUserById(user.id, { password, email_confirm: true });
  if (error) throw new Error(error.message);
}

export async function deleteAuthUser(email: string) {
  const user = await findAuthUserByEmail(email);
  if (!user) return;
  const { error } = await adminClient().auth.admin.deleteUser(user.id);
  if (error) throw new Error(error.message);
}
