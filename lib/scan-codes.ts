// Il lettore di codici a barre "digita" i caratteri con layout di tastiera US.
// Su Windows in italiano il tasto del trattino cade sull'apostrofo, quindi uno
// scontrino VT-261014121530-472 arriva come VT'261014121530'472 (e con altri
// layout puo diventare VT/..., VT?..., ecc.).
//
// Nei numeri scontrino l'unico segno e il trattino: se il codice comincia per
// VT o GS seguito da un separatore qualsiasi, ogni separatore torna trattino.
// Gli EAN di prodotti, buoni e acconti sono sole cifre e restano intatti.
const RECEIPT_PREFIX = /^(vt|gs)[^a-z0-9]/i;

export function normalizeScannedCode(raw: string) {
  const code = raw.trim();
  if (!RECEIPT_PREFIX.test(code)) return code;
  return code.toUpperCase().replace(/[^A-Z0-9]+/g, "-");
}

/** Vero se il codice e il numero di uno scontrino (dopo la normalizzazione). */
export function isReceiptCode(code: string) {
  return /^(VT|GS)-/.test(code);
}
