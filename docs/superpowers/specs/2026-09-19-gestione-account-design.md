# Gestione account (admin) — Design

Data: 2026-09-19
Stato: approvato dall'utente.

## Obiettivo

Permettere all'amministratore di **creare, elencare, reimpostare la password ed
eliminare** gli account, dalla pagina **Impostazioni**. Ogni account è
**Admin** oppure **Cassa Viterbo** / **Cassa Gran Sasso** (più account per la
stessa sede consentiti). I profili non sono più fissi nel codice ma sul database.

## Decisioni (utente)

1. Ruoli: **Admin / Cassa Viterbo / Cassa Gran Sasso** (più account per ruolo ok).
2. Gestione **in Impostazioni** (solo admin).
3. Password: **solo l'admin** crea/reimposta (nessun cambio self).

## Fuori scope

- **Nuove sedi** (multi-negozio) → progetto separato.
- Cambio password da parte del singolo utente.
- Disabilita temporanea (usiamo elimina).

## Architettura

### Profili dal database (non più mappa fissa)
Convenzione email Supabase Auth: `username@gestionale.local`.
- Client `emailForUsername(username)` = `` `${username}@gestionale.local` `` (nessuna
  mappa hardcoded → qualsiasi username creato dall'admin funziona al login).
- Server `profileFromEmail(email)`:
  1. ricava `username` = parte prima di `@`;
  2. cerca la riga in `users` (username → role, store, display_name);
  3. se trovata, costruisce il profilo da lì;
  4. altrimenti **fallback** alla mappa storica `loginProfiles`
     (admin/viterbo/gran-sasso/test) per non rompere gli accessi esistenti;
  5. se nessuno → `null` (accesso negato).
- `emailForUsername` mantiene comunque il fallback storico per i 4 nomi noti.
- Il routing **sandbox** resta per username (`SANDBOX_USERS = {test}`): invariato.

### Creazione account — API `createUser` (admin)
Input: `username`, `password`, `role` (`admin` | `viterbo` | `gran_sasso`),
`displayName`.
Validazioni:
- `username`: minuscole, `^[a-z0-9._-]{3,32}$`, univoco (case-insensitive); non
  può coincidere con un username esistente.
- `password`: ≥ 6 caratteri (requisito Supabase).
- `role` tra i tre ammessi.
Comportamento:
- email = `username@gestionale.local`.
- `supabase.auth.admin.createUser({ email, password, email_confirm: true })`
  (service role, lato server). Se l'email esiste già → errore chiaro.
- `store` derivato: `admin`→`NULL`, `viterbo`→`Viterbo`, `gran_sasso`→`Gran Sasso`.
- INSERT in `users` (username, display_name, role, store, password_salt/hash
  placeholder random, password_iterations, must_change_password 0, created_at).
  (La password vera vive solo su Supabase Auth; i campi hash restano placeholder
  come per gli account esistenti.)
- `logActivity` create/user.

### Reset password — API `resetUserPassword` (admin)
Input: `username` (o `id`), `password` (≥6).
- Trova l'auth user Supabase per email (`admin.listUsers` paginato, match email) →
  `admin.updateUserById(id, { password, email_confirm: true })`.
- `logActivity` update/user (senza la password nel dettaglio).

### Eliminazione account — API `deleteUser` (admin)
Input: `username` (o `id`).
- Vincoli: non l'utente corrente (self), non `test`, non l'**ultimo admin**
  (conta gli admin in `users`; se ne resta uno e è quello → 409).
- Elimina la riga `users`; elimina l'auth user Supabase (per email).
- `logActivity` delete/user.

### Elenco account — bootstrap
`bootstrap()` ritorna `accounts` **solo per admin**: `[{ id, username, role, store,
displayName }]` da `users` (ordinati per username). Per i cassieri: `accounts` vuoto.

## UI — Impostazioni (solo admin)

Nuova sezione **"Account"** (sopra o sotto "Tema"):
- Tabella: **Username · Nome · Ruolo · Sede**, con azioni per riga **Reset
  password** e **Elimina** (disabilitati per self / test / ultimo admin).
- Pulsante **"Nuovo account"** → modal: Username, Nome visualizzato, Ruolo
  (select: Amministratore / Cassa Viterbo / Cassa Gran Sasso), Password.
- Reset password → modal con nuova password.
- Messaggi di errore/successo inline.
I cassieri continuano a vedere in Impostazioni solo il **Tema** (sezione Account
non renderizzata).

## Sicurezza

- Tutte le azioni account: `adminOnly` lato server.
- Password mai salvata nel DB del gestionale (solo Supabase Auth).
- TEST mode: nessuna scrittura (guard globale).
- Nessun auto-lockout: self-delete e rimozione ultimo admin bloccate.

## Componenti / file

- `lib/user-profiles.ts`: `emailForUsername` generalizzato (`username@gestionale.local`
  con fallback storico); `profileFromEmail` diventa async e legge `users`
  (con fallback) — oppure spostare la risoluzione DB in `route.ts`/`auth`.
  NOTA implementativa: la lettura DB va fatta dove c'è accesso al DB
  (`app/api/auth/route.ts` già usa `applicationUserForEmail`); `user-profiles`
  resta la mappa storica di fallback + la convenzione email.
- `app/api/auth/route.ts`: `applicationUserForEmail` legge la riga `users` per
  email/username; se assente usa il fallback storico (crea la riga come oggi).
- `app/api/data/route.ts`: `bootstrap()` ritorna `accounts` (admin); azioni
  `createUser`, `resetUserPassword`, `deleteUser` (usano `adminClient` di
  `supabase-server`).
- `lib/supabase-server.ts`: helper `createAuthUser(email,password)`,
  `setAuthUserPassword(email,password)`, `deleteAuthUser(email)`.
- `app/gestionale.tsx`: tipo `Bootstrap` con `accounts`; `Settings` con la sezione
  Account (tabella + modali) per l'admin; client login `emailForUsername`.

## Criteri di successo

1. L'admin crea un account "mario" ruolo Cassa Viterbo con password: l'account
   compare in elenco e può fare login (`mario` / password) vedendo la cassa di
   Viterbo.
2. L'admin reimposta la password di un account → il nuovo accesso funziona.
3. L'admin elimina un account → non può più accedere; non può eliminare se stesso,
   `test`, o l'ultimo admin.
4. Gli account storici (admin/viterbo/gran-sasso/test) continuano a funzionare.
5. I cassieri non vedono la gestione account.
6. `tsc` e `next build` verdi; TEST mode non scrive; password mai nel DB gestionale.
