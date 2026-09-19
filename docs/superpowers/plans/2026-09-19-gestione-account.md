# Gestione account — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** L'admin crea/elenca/reimposta-password/elimina account (Admin, Cassa Viterbo, Cassa Gran Sasso) dalle Impostazioni; i profili di login vengono dal DB.

**Architecture:** Login invariato via Supabase Auth con email `username@gestionale.local`; il profilo (ruolo/sede) si risolve dalla tabella `users` (fallback ai 4 storici). Le azioni admin creano/aggiornano/eliminano sia la riga `users` sia l'utente Supabase Auth (service role).

**Tech Stack:** Next.js 16, TypeScript, Postgres via shim, `@supabase/supabase-js` (service role), API `app/api/data/route.ts`.

**Verifica (niente test runner):** `npx tsc --noEmit` + `npx next build` (0 errori) + check manuale. Git: `/opt/homebrew/bin/git`. Commit a fine task.

**Spec:** `docs/superpowers/specs/2026-09-19-gestione-account-design.md`

---

## Task 1: Convenzione email + helper Supabase Auth

**Files:** `lib/user-profiles.ts`, `lib/supabase-server.ts`

- [ ] **Step 1: `emailForUsername` generalizzato**

In `lib/user-profiles.ts`, sostituire la funzione `emailForUsername` con:
```ts
export function emailForUsername(username: string): string | null {
  const key = username.trim().toLowerCase();
  if (loginProfiles[key]) return loginProfiles[key].email;
  return /^[a-z0-9._-]{3,32}$/.test(key) ? `${key}@gestionale.local` : null;
}
```
(Così qualsiasi username creato dall'admin ha un'email valida; i 4 storici restano dalla mappa.)

- [ ] **Step 2: Helper auth admin in `lib/supabase-server.ts`**

Aggiungere in fondo a `lib/supabase-server.ts`:
```ts
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
  if (!user) return; // già assente: ok
  const { error } = await adminClient().auth.admin.deleteUser(user.id);
  if (error) throw new Error(error.message);
}
```
`adminClient` è già definito nel file (usa SUPABASE_URL + SERVICE_ROLE_KEY).

- [ ] **Step 3: Verifica**

Run: `npx tsc --noEmit && npx next build` → 0 errori.

- [ ] **Step 4: Commit**

```bash
/opt/homebrew/bin/git add lib/user-profiles.ts lib/supabase-server.ts
/opt/homebrew/bin/git commit -m "Account: email per-username generalizzata + helper Supabase Auth (crea/reset/elimina)"
```

---

## Task 2: Login risolve il profilo dal DB (nuovi account)

**Files:** `app/api/auth/route.ts`

- [ ] **Step 1: `applicationUserForEmail` legge prima la tabella users**

Sostituire la funzione `applicationUserForEmail` con:
```ts
async function applicationUserForEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  const username = normalized.replace(/@gestionale\.local$/, "").split("@")[0];
  // 1) Profilo dalla tabella users (account creati dall'admin + storici già presenti)
  const existing = await database().prepare(`SELECT id, username, display_name AS displayName, role, store, must_change_password AS mustChangePassword FROM users WHERE LOWER(username) = ?`)
    .bind(username).first<SessionUser>();
  if (existing) return { ...existing, mustChangePassword: 0 };
  // 2) Fallback storico (admin/viterbo/gran-sasso/test): crea la riga se manca
  const profile = profileFromEmail(normalized);
  if (!profile) return null;
  await database().prepare(`INSERT OR IGNORE INTO users (username, display_name, role, store, password_salt, password_hash, password_iterations, must_change_password, created_at) VALUES (?, ?, ?, ?, ?, ?, 100000, 0, ?)`)
    .bind(profile.username, profile.displayName, profile.role, profile.store, crypto.randomUUID(), crypto.randomUUID(), new Date().toISOString()).run();
  const created = await database().prepare(`SELECT id, username, display_name AS displayName, role, store, must_change_password AS mustChangePassword FROM users WHERE username = ?`)
    .bind(profile.username).first<SessionUser>();
  return created ? { ...created, mustChangePassword: 0 } : null;
}
```
(Nota: `LOWER(username) = ?` con username già in minuscolo. Il shim traduce `LOWER`.)

- [ ] **Step 2: Verifica**

Run: `npx tsc --noEmit && npx next build` → 0 errori.

- [ ] **Step 3: Commit**

```bash
/opt/homebrew/bin/git add app/api/auth/route.ts
/opt/homebrew/bin/git commit -m "Account: il login risolve ruolo/sede dalla tabella users (fallback storici)"
```

---

## Task 3: API — elenco account + createUser / resetUserPassword / deleteUser

**Files:** `app/api/data/route.ts`

- [ ] **Step 1: Import helper auth**

In cima a `app/api/data/route.ts`, aggiungere agli import da `../../../lib/supabase-server`:
```ts
import { createAuthUser, setAuthUserPassword, deleteAuthUser } from "../../../lib/supabase-server";
```
(Se il file non importa già da supabase-server, aggiungere la riga import.)

- [ ] **Step 2: Elenco account nel bootstrap (solo admin)**

In `bootstrap()`, prima del `return`, aggiungere:
```ts
  const accounts = user.role === "admin"
    ? await all<{ id: number; username: string; role: string; store: string | null; displayName: string }>(`SELECT id, username, role, store, display_name AS displayName FROM users ORDER BY username`)
    : [];
```
E aggiungere `accounts` all'oggetto ritornato (prima di `generatedAt`).

- [ ] **Step 3: Azioni account**

Aggiungere vicino alle altre action (es. dopo `deleteCustomer`):
```ts
function storeForRole(role: string): Store | null {
  return role === "viterbo" ? "Viterbo" : role === "gran_sasso" ? "Gran Sasso" : null;
}

async function createUser(user: SessionUser, body: JsonMap) {
  const denied = adminOnly(user); if (denied) return denied;
  const username = stringValue(body.username).trim().toLowerCase();
  const password = stringValue(body.password);
  const role = stringValue(body.role);
  const displayName = stringValue(body.displayName).trim() || username;
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) return json({ error: "Username non valido (3-32, minuscole, . _ -)." }, 400);
  if (password.length < 6) return json({ error: "La password deve avere almeno 6 caratteri." }, 400);
  if (!["admin", "viterbo", "gran_sasso"].includes(role)) return json({ error: "Ruolo non valido." }, 400);
  const exists = await database().prepare(`SELECT id FROM users WHERE LOWER(username) = ?`).bind(username).first();
  if (exists) return json({ error: "Username già esistente." }, 409);
  const email = `${username}@gestionale.local`;
  await createAuthUser(email, password);
  await database().prepare(`INSERT INTO users (username, display_name, role, store, password_salt, password_hash, password_iterations, must_change_password, created_at) VALUES (?, ?, ?, ?, ?, ?, 100000, 0, ?)`)
    .bind(username, displayName, role, storeForRole(role), crypto.randomUUID(), crypto.randomUUID(), new Date().toISOString()).run();
  await logActivity({ user, action: "create", entity: "account", detail: `${username} · ${role}` });
  return json({ ok: true });
}

async function resetUserPassword(user: SessionUser, body: JsonMap) {
  const denied = adminOnly(user); if (denied) return denied;
  const username = stringValue(body.username).trim().toLowerCase();
  const password = stringValue(body.password);
  if (password.length < 6) return json({ error: "La password deve avere almeno 6 caratteri." }, 400);
  const row = await database().prepare(`SELECT id FROM users WHERE LOWER(username) = ?`).bind(username).first();
  if (!row) return json({ error: "Account non trovato." }, 404);
  await setAuthUserPassword(`${username}@gestionale.local`, password);
  await logActivity({ user, action: "update", entity: "account", detail: `reset password ${username}` });
  return json({ ok: true });
}

async function deleteUser(user: SessionUser, body: JsonMap) {
  const denied = adminOnly(user); if (denied) return denied;
  const username = stringValue(body.username).trim().toLowerCase();
  if (username === user.username.toLowerCase()) return json({ error: "Non puoi eliminare il tuo account." }, 409);
  if (username === "test") return json({ error: "L'account di prova non è eliminabile." }, 409);
  const row = await database().prepare(`SELECT id, role FROM users WHERE LOWER(username) = ?`).bind(username).first<{ id: number; role: string }>();
  if (!row) return json({ error: "Account non trovato." }, 404);
  if (row.role === "admin") {
    const admins = await database().prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin'`).first<{ n: number }>();
    if ((admins?.n ?? 0) <= 1) return json({ error: "Deve restare almeno un amministratore." }, 409);
  }
  await deleteAuthUser(`${username}@gestionale.local`);
  await database().prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(row.id).run();
  await database().prepare(`DELETE FROM users WHERE id = ?`).bind(row.id).run();
  await logActivity({ user, action: "delete", entity: "account", detail: username });
  return json({ ok: true });
}
```
Verifica: `adminOnly`, `stringValue`, `logActivity`, `all`, `database`, `Store`, `json`, `crypto` sono già usati nel file (adegua se i nomi differiscono). `user.username` esiste su `SessionUser`.

- [ ] **Step 4: Registrare le azioni**

Dove sono mappate le action POST, aggiungere:
```ts
  if (action === "createUser") return createUser(auth.user, body);
  if (action === "resetUserPassword") return resetUserPassword(auth.user, body);
  if (action === "deleteUser") return deleteUser(auth.user, body);
```

- [ ] **Step 5: Verifica**

Run: `npx tsc --noEmit && npx next build` → 0 errori.

- [ ] **Step 6: Commit**

```bash
/opt/homebrew/bin/git add app/api/data/route.ts
/opt/homebrew/bin/git commit -m "Account: API elenco + createUser/resetUserPassword/deleteUser (admin, Supabase Auth)"
```

---

## Task 4: UI — sezione Account in Impostazioni

**Files:** `app/gestionale.tsx`

- [ ] **Step 1: Tipo Bootstrap + account**

Nel tipo `Bootstrap`, aggiungere:
```ts
accounts?: { id: number; username: string; role: string; store: string | null; displayName: string }[];
```

- [ ] **Step 2: Passare data + reload a Settings**

Nel `content` map, la voce `settings` attuale (`settings: <Settings theme={theme} setTheme={setTheme} isAdmin={user.role === "admin"} />`) diventa:
```tsx
settings: <Settings theme={theme} setTheme={setTheme} isAdmin={user.role === "admin"} data={data} reload={reload} />,
```

- [ ] **Step 3: Sezione Account nel componente Settings**

Cambiare la firma di `Settings` in:
```tsx
function Settings({ theme, setTheme, isAdmin, data, reload }: { theme: "dark" | "light"; setTheme: (value: "dark" | "light") => void; isAdmin: boolean; data: Bootstrap; reload: () => Promise<void> }) {
```
Aggiungere stato e azioni all'inizio del corpo:
```tsx
  const [showNew, setShowNew] = useState(false);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const accounts = data.accounts ?? [];
  const roleLabel = (r: string, s: string | null) => r === "admin" ? "Amministratore" : `Cassa ${s ?? ""}`.trim();
  async function removeAccount(username: string) {
    if (!confirm(`Eliminare l'account ${username}?`)) return; setError("");
    try { await post("deleteUser", { username }); await reload(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Errore."); }
  }
```
Dopo il pannello "Tema", quando `isAdmin`, inserire il pannello Account (prima del pannello "SICUREZZA ACCESSI", che puoi rimuovere o tenere):
```tsx
    {isAdmin && <div className="panel"><div className="panel-title"><div><p className="eyebrow">ACCOUNT</p><h2>Utenti e accessi</h2></div><button className="primary" onClick={() => setShowNew(true)}><MaterialIcon>person_add</MaterialIcon> Nuovo account</button></div>{error && <div className="alert danger">{error}</div>}<div className="table-wrap"><table><thead><tr><th>Username</th><th>Nome</th><th>Ruolo</th><th>Azioni</th></tr></thead><tbody>{accounts.map((account) => <tr key={account.id}><td><strong>{account.username}</strong></td><td>{account.displayName}</td><td>{roleLabel(account.role, account.store)}</td><td><div className="table-actions"><button className="secondary small" onClick={() => setResetFor(account.username)}>Reset password</button>{account.username !== "test" && <button className="text-button negative" onClick={() => void removeAccount(account.username)}>Elimina</button>}</div></td></tr>)}</tbody></table></div></div>}
    {showNew && <Modal title="Nuovo account" onClose={() => setShowNew(false)}><AccountForm reload={reload} onClose={() => setShowNew(false)} /></Modal>}
    {resetFor && <Modal title={`Reset password · ${resetFor}`} onClose={() => setResetFor(null)}><PasswordResetForm username={resetFor} reload={reload} onClose={() => setResetFor(null)} /></Modal>}
```
Rimuovere il vecchio pannello statico "SICUREZZA ACCESSI" (elenco fisso admin/viterbo/gran-sasso) perché ora la tabella Account lo sostituisce.

- [ ] **Step 4: Componenti AccountForm + PasswordResetForm**

Aggiungere vicino a `Settings`:
```tsx
function AccountForm({ reload, onClose }: { reload: () => Promise<void>; onClose: () => void }) {
  const [username, setUsername] = useState(""); const [displayName, setDisplayName] = useState(""); const [role, setRole] = useState("viterbo"); const [password, setPassword] = useState("");
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (isClientTestMode()) { setError("Modalità TEST attiva: account non creato."); return; }
    setSaving(true);
    try { await post("createUser", { username, displayName, role, password }); await reload(); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Errore."); }
    finally { setSaving(false); }
  }
  return <form className="stack" onSubmit={save}><div className="form-grid"><ClearableInput label="Username" value={username} onChange={setUsername} required /><ClearableInput label="Nome visualizzato" value={displayName} onChange={setDisplayName} /><label className="field"><span>Ruolo</span><select value={role} onChange={(event) => setRole(event.target.value)}><option value="admin">Amministratore</option><option value="viterbo">Cassa Viterbo</option><option value="gran_sasso">Cassa Gran Sasso</option></select></label><ClearableInput label="Password (min 6)" type="text" value={password} onChange={setPassword} required /></div>{error && <div className="alert danger">{error}</div>}<div className="form-actions"><button type="button" className="secondary" onClick={onClose}>Annulla</button><button className="primary" disabled={saving}>{saving ? "Creazione…" : "Crea account"}</button></div></form>;
}

function PasswordResetForm({ username, reload, onClose }: { username: string; reload: () => Promise<void>; onClose: () => void }) {
  const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (isClientTestMode()) { setError("Modalità TEST attiva: password non modificata."); return; }
    setSaving(true);
    try { await post("resetUserPassword", { username, password }); await reload(); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Errore."); }
    finally { setSaving(false); }
  }
  return <form className="stack" onSubmit={save}><p className="muted">Nuova password per <strong>{username}</strong> (min 6 caratteri).</p><ClearableInput label="Nuova password" type="text" value={password} onChange={setPassword} required /><div className="form-actions"><button type="button" className="secondary" onClick={onClose}>Annulla</button><button className="primary" disabled={saving}>{saving ? "Salvataggio…" : "Reimposta password"}</button></div></form>;
}
```
Verifica: `Modal`, `ClearableInput`, `post`, `isClientTestMode`, `MaterialIcon` in scope (sì).

- [ ] **Step 5: Verifica**

Run: `npx tsc --noEmit && npx next build` → 0 errori.

- [ ] **Step 6: Commit**

```bash
/opt/homebrew/bin/git add app/gestionale.tsx
/opt/homebrew/bin/git commit -m "Account: gestione in Impostazioni (elenco, nuovo account, reset password, elimina)"
```

---

## Task 5: Verifica end-to-end

- [ ] **Step 1: Build pulito** — Run: `npx tsc --noEmit && npx next build` → 0 errori.

- [ ] **Step 2: Checklist manuale (admin reale, NON test/sandbox)**

- Impostazioni → Account: compaiono admin/viterbo/gran-sasso (e test).
- Nuovo account: username `mario`, ruolo Cassa Viterbo, password `mario123` → compare in elenco.
- Logout → login `mario` / `mario123` → vede la Cassa di Viterbo (menu cassiere).
- Reset password di `mario` → nuovo login con la nuova password funziona.
- Elimina `mario` → non accede più. Verificare: non si può eliminare se stessi, `test`, o l'ultimo admin.
- Gli account storici continuano a loggare.
- Cassiere: in Impostazioni vede solo il Tema (niente Account).
- TEST mode: creazione/reset/elimina bloccati.

> Nota: eseguire il test degli account con un **account reale** (non `test`, che è sandbox) perché la tabella `users` reale sta nello schema public.

- [ ] **Step 3: Commit (se fix)**

```bash
/opt/homebrew/bin/git add -A
/opt/homebrew/bin/git commit -m "Account: rifiniture dopo verifica end-to-end"
```

---

## Self-review (coverage spec)

- Profili dal DB (email username@gestionale.local, fallback storici) → Task 1 (emailForUsername) + Task 2 (applicationUserForEmail). ✓
- createUser (Supabase Auth + users, store da ruolo, validazioni) → Task 3. ✓
- resetUserPassword (admin) → Task 3. ✓
- deleteUser (vincoli self/test/ultimo admin) → Task 3. ✓
- Elenco accounts (admin) nel bootstrap → Task 3. ✓
- UI in Impostazioni (tabella, Nuovo account, reset, elimina; cassieri solo tema) → Task 4. ✓
- Sicurezza (adminOnly, password solo su Supabase, TEST guard) → Task 3/4. ✓

Coerenza tipi/nomi: `accounts` (bootstrap + Bootstrap type + Settings), azioni `createUser`/`resetUserPassword`/`deleteUser`, helper `createAuthUser`/`setAuthUserPassword`/`deleteAuthUser`, `storeForRole`.
