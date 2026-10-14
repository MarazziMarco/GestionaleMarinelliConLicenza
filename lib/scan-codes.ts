// Il lettore di codici a barre "digita" i caratteri come una tastiera, ma col
// layout US: su Windows in italiano i segni di punteggiatura cadono su tasti
// diversi, e lo stesso trattino puo arrivare come ' : / o altro ancora.
// Lettere e cifre invece coincidono fra i due layout e arrivano sempre giuste.
//
// Percio nei codici a barre degli scontrini stampiamo solo lettere e cifre
// (VT261014121530472), mentre sotto resta leggibile il numero vero
// (VT-261014121530-472). Qui riportiamo qualunque forma a quella compatta:
// cosi funzionano sia i codici nuovi, sia quelli vecchi col trattino, sia il
// numero digitato a mano.

/** Vero se il codice e il numero di uno scontrino, con o senza separatori. */
export function isReceiptCode(raw: string) {
  return /^(vt|gs)[^a-z0-9]*\d{6,}/i.test(raw.trim());
}

/** Forma canonica di un codice: sole lettere e cifre maiuscole. */
export function compactCode(raw: string) {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}
