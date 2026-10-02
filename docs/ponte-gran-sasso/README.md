# Ponte RT Gran Sasso: perché non stampa e come sistemarlo

Aggiornato il 2026-10-02. Nota di **diagnosi**: nel ponte non è stato ancora
corretto niente. Per installare la correzione bisogna andare sul PC di cassa del
Gran Sasso.

## Cosa è successo

Al Gran Sasso c'è stato **un solo tentativo di stampa**: il 30/09, una vendita di
prova da 0,10 € (`GS-260930153154-113`).

| Ora | Cosa succede |
| --- | --- |
| 15:31:54 | Il ponte riceve lo scontrino e lo prende in carico: chiave e collegamento funzionano |
| … | Nessuna risposta dal ponte, né "stampato" né "errore" |
| 15:35:14 | Dopo 200 secondi la pagina della cassa rinuncia: "Il registratore non ha concluso la stampa entro il tempo previsto" |
| da allora | Il ponte non si è più fatto sentire col gestionale |

Il ponte non è andato in errore: **si è bloccato**.

## Differenza tra Viterbo e Gran Sasso

Il ponte dovrebbe fare solo da traduttore fra gestionale e cassa. A Viterbo è
così, al Gran Sasso no.

**Viterbo (cassa RCH PRINT! 3.0 RT):**

```
gestionale → ponte (traduce) → rete locale → cassa RCH (192.168.1.210)
```

Il ponte trasforma lo scontrino nei comandi RCH e li manda direttamente alla
cassa. Nessun altro programma in mezzo.

**Gran Sasso (cassa Epson FP-81 II RT):**

```
gestionale → ponte (traduce) → file XML su disco → EpsonFpMate.exe → cassa Epson
```

Il ponte non parla con la cassa. Scrive lo scontrino in un file e lancia
**EpsonFpMate**, un programma di Epson installato sul PC, che poi parla con la
cassa. In mezzo c'è un programma in più che il ponte non controlla.

## Perché si blocca (causa molto probabile)

1. Il ponte lancia EpsonFpMate e **aspetta che si chiuda, senza limite di
   tempo** (`Start-Process ... -Wait` in `Invoke-EpsonXmlDocument`,
   `public/rt-bridge/gran-sasso/MarinelliRTBridge.ps1`).
2. Dal 25/09 (commit `922614c`) il ponte del Gran Sasso parte all'accensione
   come utente **SISTEMA**. SISTEMA gira dietro le quinte, senza schermo.
3. EpsonFpMate è un programma con finestre. Lanciato come SISTEMA, se mostra una
   finestra o un messaggio (errore, configurazione, stampante non trovata)
   nessuno lo vede e nessuno lo chiude. Il ponte resta in attesa per sempre.
4. Il ponte fa una cosa alla volta: bloccato lì, non risponde più neanche alla
   pagina della cassa.
5. Le impostazioni di EpsonFpMate (quale stampante, quale porta) potrebbero
   stare nell'utente Windows di chi l'ha configurato, che SISTEMA non vede.

Spiega perché il problema c'è **solo al Gran Sasso**: anche a Viterbo il ponte
gira come SISTEMA, ma parla con la RCH via rete e non apre programmi con
finestre.

## Prima cosa da controllare: come è collegata la cassa Epson

Guardare il cavo dietro la cassa del Gran Sasso.

### Caso A — cassa collegata in rete (cavo di rete) — soluzione migliore

Le casse Epson RT collegate in rete accettano lo scontrino direttamente dalla
rete, con lo **stesso XML** che il ponte scrive già oggi nel file, mandato a un
indirizzo della cassa tipo `http://<ip-cassa>/cgi-bin/fpmate.cgi`.

- Il ponte del Gran Sasso diventa come quello di Viterbo: solo traduttore, via
  rete.
- Niente EpsonFpMate, niente problema dell'utente SISTEMA, niente blocchi.
- Serve l'**indirizzo IP della cassa**: si legge stampando dalla cassa lo
  scontrino di configurazione o di rete.
- Se la cassa ha la presa di rete ma oggi è collegata in USB, si può spostarla
  in rete.

### Caso B — cassa collegata via USB

Serve per forza EpsonFpMate. Il programma sempre acceso c'è già: è il ponte, che
lancia EpsonFpMate per ogni scontrino. EpsonFpMate stampa e si chiude da solo.

Correzioni da fare:

- Il ponte parte **all'accesso a Windows con l'utente del negozio**, non
  all'accensione come SISTEMA. Così EpsonFpMate ha lo schermo e le sue
  impostazioni.
- Il PC deve **entrare in Windows da solo** all'accensione (accesso automatico),
  altrimenti il ponte non parte finché qualcuno non fa l'accesso. Si imposta una
  volta sul posto.
- **Limite di tempo** sull'attesa di EpsonFpMate (circa 60 secondi): se si
  pianta, il ponte lo chiude, segna l'errore con un messaggio chiaro e resta
  vivo.
- Più scritte nel registro `bridge.log` per capire dove si ferma.

## Controlli utili che può fare chiunque sia in negozio

1. **Gestione attività** sul PC della cassa: se c'è `EpsonFpMate.exe` aperto
   con utente **SYSTEM**, la diagnosi è confermata.
2. Le ultime righe di
   `C:\ProgramData\MarinelliRTBridge\GranSasso\bridge.log`.
3. Il cavo dietro la cassa: rete o USB (vedi sopra).

## Altri punti già visti (meno urgenti)

- **Resi e cambi:** risolti dal commit `8218680` del 02/10. Il reso non va più
  alla cassa, si stampa solo la differenza, quindi il ponte Epson non riceve più
  righe di reso né il riferimento allo scontrino originale.
- **Buono con credito residuo:** risolto dallo stesso commit. Un documento a
  totale negativo non si stampa più.
- **Sconto sul totale senza righe scontabili** (es. solo acconto o saldo
  prenotazione): lo sconto resta in `adjustment` e il ramo Epson non lo stampa
  (manca `printRecItemAdjustment`), quindi il documento non torna. Caso raro, da
  sistemare insieme al resto.
- **Configurazione EpsonFpMate** (solo caso B): serve Output File attivo e
  timestamp disattivato, altrimenti il ponte dà "EpsonFpMate non ha creato il
  file di esito".
- **Conferma "ha stampato davvero?":** a Viterbo l'operatore conferma che lo
  scontrino è uscito; al Gran Sasso no. Se EpsonFpMate risponde OK ma la carta
  non avanza, il gestionale segna comunque "stampato".

## Nota

Il ponte nuovo va comunque reinstallato sul PC di cassa del Gran Sasso: un
passaggio sul posto serve in entrambi i casi. Conviene preparare la versione
giusta (A o B) prima di andare.
