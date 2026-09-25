# Backup del database (produzione)

Il gestionale è in uso reale: **serve un backup automatico + una prova di ripristino**.
Due livelli, meglio averli entrambi.

## 1) Backup nativo Supabase (PRIMARIO, consigliato)

È la via più affidabile: lo fa l'infrastruttura Supabase.

1. Supabase → progetto → **Database → Backups**.
2. Verifica che i **backup giornalieri** siano attivi. Il **Point-in-Time Recovery (PITR)**
   (ripristino al minuto) è disponibile sui piani a pagamento: se il negozio ci lavora ogni
   giorno, vale i pochi € al mese.
3. Ripristino: dalla stessa pagina, "Restore" a una data/ora. (Test: vedi sotto.)

Sul piano gratuito i backup nativi non sono scaricabili né ripristinabili dalla dashboard: il livello 2 è indispensabile.

## 2) Copia esterna con GitHub Actions (SECONDARIO, portabile)

Un dump `pg_dump` giornaliero salvato come artifact su GitHub (scaricabile). Utile come
copia indipendente da Supabase.

### Attivazione (una volta)
1. **Connection string diretta**: Supabase → **Project Settings → Database → Connection string**.
   Usa la **"Session pooler"** o la **"Direct connection"** (porta **5432**), NON la
   "Transaction pooler" (6543): `pg_dump` non funziona sul pooler in modalità transazione.
2. GitHub → repo → **Settings → Secrets and variables → Actions → New repository secret**:
   - nome: `BACKUP_DATABASE_URL`
   - valore: la connection string del punto 1 (con la password).
3. Il workflow è già in `.github/workflows/backup.yml` (copia in
   [`backup.workflow.yml`](./backup.workflow.yml)). Usa `pg_dump` 17: deve essere di versione
   uguale o superiore al server Supabase (oggi 17.6), altrimenti si rifiuta di partire.
4. Tab **Actions → Backup DB → Run workflow** per provarlo subito. Poi gira ogni notte.

I dump contengono gli schemi `public` e `sandbox` (tutti i dati del gestionale). Non includono gli
account di login Supabase (schema `auth`, pochi utenti, si ricreano) né le foto prodotto (Supabase
Storage). Restano 30 giorni come artifact (scaricabili da ogni run, solo da chi ha accesso al repo privato). Per conservarli più a
lungo, scaricali periodicamente o cambia `retention-days`.

## Ripristino da un dump (`.sql.gz`)

⚠️ Ripristinare **sovrascrive**. Non ripristinare sul DB di produzione per "guardare":
crea un progetto/DB nuovo e ripristina lì per ispezionare.

```bash
# in un DB VUOTO di destinazione
gunzip -c backup-AAAAMMGG-HHMM.sql.gz | psql "postgresql://...:5432/postgres"
```

## Prova di ripristino (da fare almeno una volta)

Un backup non testato non è un backup:
1. Crea un progetto Supabase temporaneo (o un Postgres locale).
2. Ripristina l'ultimo dump con il comando sopra.
3. Verifica che ci siano prodotti, vendite, clienti (conteggi coerenti).
4. Elimina il progetto temporaneo.
