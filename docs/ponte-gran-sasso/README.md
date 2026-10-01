# Ponte RT Gran Sasso: problema aperto (diagnosi del 2026-10-01)

Nota di sola **diagnosi**: niente e' stato ancora corretto. Il sintomo esatto in
negozio non e' stato ancora riferito, quindi i candidati sono in ordine di
probabilita'.

## Punto di partenza

Il pacchetto del Gran Sasso e' fermo al 25/09 e non ha mai ricevuto gli
allineamenti fatti su Viterbo:

```
git log -- public/rt-bridge/viterbo     ->  341e389, dfc2db6, 922614c, 799c97a, 1d4317a
git log -- public/rt-bridge/gran-sasso  ->                   922614c, 799c97a, 1d4317a
Marinelli-RT-Gran-Sasso.zip  22119 B  25 set 13:14
Marinelli-RT-Viterbo.zip     17787 B   1 ott 19:04
```

**Pero' le due casse sono hardware diverso** (`lib/runtime-db.ts:285-287`):

| Negozio | Registratore | Adapter del ponte |
| --- | --- | --- |
| Viterbo | RCH PRINT! 3.0 RT | `rch_standard_tcp` |
| Gran Sasso | Epson FP-81 II RT (FPMate) | `epson_fpmate` |

Quindi i fix di Viterbo (identificativo pacchetto, `=S`/`=V-`, `=T4` senza
importo, scarto del buffer residuo) **non riguardano il Gran Sasso**: non sono
quelli il problema. Il problema e' che l'ultima modifica lato server,
`7151c77` "RT: sconto sul totale e buoni ripartiti sulle righe", e' stata
validata solo sul percorso RCH, e il percorso Epson non e' stato toccato.

## Candidato 1 (il piu' probabile): il ramo Epson ignora `payload.adjustment`

In `lib/fiscal-lines.ts` lo sconto sul totale viene ripartito solo sulle righe
"scontabili" (`isDiscountable`: solo `product` e `service`, quantita' intera
> 0, totale > 0). Se la vendita non ha righe di quel tipo - acconto o saldo
prenotazione, risuolatura, reso, "varie" con quantita' non intera - lo sconto
**resta in `adjustment`**.

- Il ponte RCH lo stampa: `=S` seguito da `=V-/SCONTO TOTALE`.
- `Invoke-EpsonFpMate` (`public/rt-bridge/gran-sasso/MarinelliRTBridge.ps1:432-460`)
  emette solo `printRecItem` -> `printRecSubtotal` -> `printRecTotal`, senza mai
  un `printRecItemAdjustment`.

Risultato: la somma degli articoli e' maggiore del pagamento e l'FP-81 non
chiude il documento. Per costruzione succede **solo** al Gran Sasso.

## Candidato 2: resi e cambi

Il ramo Epson pretende `originalFiscalReference` completa (data, `zRepNumber`,
`fiscalReceiptNumber`, matricola). Se lo scontrino originale non e' stato
stampato da questo ponte, o se `Get-EpsonFiscalReference` non ha trovato quei
tag nell'output di FPMate, parte:

```
Reso Epson non inviato: mancano data, chiusura, documento o matricola fiscale originali.
```

Il percorso RCH non ha questo vincolo.

## Candidato 3: buono con credito residuo

Il server manda `{ method: "gift", amount: giftAmount }` con importo
**negativo** (`app/api/data/route.ts:1086`, "BUONO CREDITO RESIDUO"), mentre
`Add-EpsonPayments` scarta tutto cio' che non e' `> 0`: pagamento incompleto,
documento che resta aperto.

## Candidato 4: configurazione FPMate

Serve Output File attivo e timestamp disattivato in EpsonFpMateConfig,
altrimenti ogni stampa muore su `EpsonFpMate non ha creato il file di esito.`

## Non e' un bug, ma va saputo

`completeLocalFiscalJob` rifiuta tutto cio' che non e' Viterbo
(`app/api/data/route.ts:1192`). Al Gran Sasso il job viene chiuso dal ponte
stesso con `action=complete` su `/api/fiscal`, quindi funziona; l'effetto
collaterale e' che a Gran Sasso **manca la conferma "ha stampato davvero?"**
dell'operatore: se FPMate risponde OK ma la carta non e' avanzata, il
gestionale segna comunque "stampato".

## Per chiudere la diagnosi servono

1. Cosa si vede in cassa: errore a schermo, scontrino che resta aperto, nessuna
   stampa?
2. Le ultime righe di `C:\ProgramData\MarinelliRTBridge\GranSasso\bridge.log`.
