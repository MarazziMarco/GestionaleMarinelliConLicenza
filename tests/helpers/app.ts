import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// DB di test isolato: nessun DATABASE_URL -> l'app usa pglite (Postgres in-process),
// su una cartella temporanea unica per esecuzione. Niente Docker, niente DB reale.
// Le env vanno impostate PRIMA di importare le route (lib/db.ts crea pglite all'import).
process.env.PGLITE_PATH = mkdtempSync(join(tmpdir(), "gestionale-test-"));
delete process.env.DATABASE_URL;
process.env.DEV_LOGIN = "1";
process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "placeholder";
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder";

export type TestApi = {
  post: (body: Record<string, unknown>) => Promise<Response>;
  get: (view: string, params?: Record<string, string>) => Promise<Response>;
  cookie: string;
};

/** Avvia l'app in-process su pglite, esegue il dev-login admin e restituisce i client HTTP. */
export async function boot(): Promise<TestApi> {
  const auth = await import("../../app/api/auth/route");
  const data = await import("../../app/api/data/route");
  const login = await auth.POST(new Request("http://test/api/auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "dev-login" }),
  }));
  if (login.status !== 200) throw new Error(`dev-login fallito: ${login.status} ${await login.text()}`);
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  const post = (body: Record<string, unknown>) => data.POST(new Request("http://test/api/data", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  }));
  const get = (view: string, params: Record<string, string> = {}) => data.GET(new Request(
    `http://test/api/data?${new URLSearchParams({ view, ...params }).toString()}`,
    { headers: { cookie } },
  ));
  return { post, get, cookie };
}
