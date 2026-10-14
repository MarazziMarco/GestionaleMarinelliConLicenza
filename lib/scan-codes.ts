// La pistola non "manda un codice": simula una tastiera, e preme i tasti del
// layout US. Windows, impostato in italiano, legge quegli stessi tasti con la
// mappa italiana, quindi i segni di punteggiatura escono sbagliati: il trattino
// di VT-261014121530-472 arriva come ' (e, su altre configurazioni, come : / ecc.).
// Lettere e cifre invece coincidono fra i due layout e arrivano sempre giuste.
//
// Qui traduciamo all'indietro: dal carattere che Windows ha prodotto torniamo a
// quello che la pistola voleva digitare.

// Carattere ricevuto (layout italiano) -> carattere inteso (layout US).
// Ogni riga e' lo stesso tasto fisico, prima senza e poi con lo shift.
const US_FROM_IT: Record<string, string> = {
  "'": "-", "?": "_",   // tasto a destra dello 0
  "ì": "=", "^": "+",   // tasto a destra del precedente
  "è": "[", "é": "{",   // tasto a destra della P
  "+": "]", "*": "}",   // tasto a destra del precedente
  "ù": "\\", "§": "|",  // tasto a destra della A'
  "ò": ";", "ç": ":",   // tasto a destra della L
  "à": "'", "°": "\"",  // tasto a destra del precedente
  "\\": "`", "|": "~",  // tasto a sinistra della Z
  ";": "<", ":": ">",   // virgola e punto con shift
  "-": "/", "_": "?",   // tasto a destra del punto
  "\"": "@", "£": "#",  // cifre con shift
  "&": "^", "/": "&",
  "(": "*", ")": "(", "=": ")",
};

/** Riporta al layout US il testo digitato dalla pistola e letto da Windows in italiano. */
export function translateUsLayout(raw: string) {
  let out = "";
  for (const char of raw) out += US_FROM_IT[char] ?? char;
  return out;
}

/**
 * Le letture plausibili di un codice sparato dalla pistola, dalla piu probabile
 * alla meno: prima com'e arrivato (pistola gia configurata in italiano, oppure
 * codice digitato a mano), poi tradotto dal layout US.
 */
export function scanVariants(raw: string) {
  const code = raw.trim();
  const translated = translateUsLayout(code);
  return translated === code ? [code] : [code, translated];
}

/** Vero se il codice e il numero di uno scontrino, con o senza separatori. */
export function isReceiptCode(raw: string) {
  return /^(vt|gs)[^a-z0-9]*\d{6,}/i.test(raw.trim());
}

/** Forma canonica di un codice: sole lettere e cifre maiuscole. */
export function compactCode(raw: string) {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}
