import { SIRIO_LOGO, RRTREK_LOGO, type BrandLogo } from "./brand-logos";

// --- Identita dei punti vendita -------------------------------------------------
// Ogni documento esce con il marchio del negozio che lo ha emesso:
// Sirio per Viterbo, RR Trek Gran Sasso per Gran Sasso.
type Brand = { logo: BrandLogo; contacts: string[] };

const SIRIO: Brand = {
  logo: SIRIO_LOGO,
  contacts: ["Strada Cassia Nord km 85+800, Viterbo", "Tel. 0761 411322"],
};

const RRTREK: Brand = {
  logo: RRTREK_LOGO,
  contacts: ["CONTATTI DEL PUNTO VENDITA DA CONFERMARE"],
};

export function brandForStore(store?: string): Brand {
  return /gran\s*sasso/i.test(store ?? "") ? RRTREK : SIRIO;
}

const LEGAL_LINE = "Marinelli Stefano - P.IVA 02504600566";

// --- Geometria del foglio A4 ----------------------------------------------------
const PAGE_W = 595; // 210 mm
const PAGE_H = 842; // 297 mm
const LEFT = 52;
const RIGHT = 543;
const WIDTH = RIGHT - LEFT;
const CENTER = (LEFT + RIGHT) / 2;
const COL_GAP = 19;
const COL_W = (WIDTH - COL_GAP) / 2;
const COL_X = [LEFT, LEFT + COL_W + COL_GAP];
const FIELD_H = 44;

// Il blocco in fondo alla pagina (codice a barre, fascia nera, riga legale) e fisso:
// il contenuto si ferma sopra questi limiti.
const FOOTER_BAR_Y = 56;
const FOOTER_BAR_H = 26;
const BARCODE_BARS_Y = 126;
const BARCODE_BARS_H = 56;
const CONTENT_FLOOR_WITH_BARCODE = 200;
const CONTENT_FLOOR_PLAIN = 96;

type PdfTable = {
  headers: string[];
  rows: string[][];
  x: number[]; // ancora orizzontale per colonna (sinistra se align 'l', destra se 'r')
  align: ("l" | "r")[];
};

type PdfTotal = { label: string; value: string; strong?: boolean };

// Campo della griglia: etichetta minuscola in alto, valore sotto, filetto di chiusura.
// Con `full: true` occupa l'intera larghezza invece di mezza colonna.
export type PdfField = { label: string; value: string; full?: boolean };

// Riquadro con l'importo in evidenza (valore del buono, saldo residuo, ...).
export type PdfHighlight = { value: string; caption?: string; rounded?: boolean };

// Codice a barre del documento: EAN-13 (richiamo rapido in cassa) oppure Code 128
// (testo libero, usato per il numero scontrino). Con `printValue: false` si
// stampano solo le barre, cosi il valore resta leggibile solo con lo scanner.
// `label` stampa sotto le barre un testo diverso da quello codificato: serve agli
// scontrini, dove si codificano sole lettere e cifre ma si legge il numero vero.
type PdfBarcode = { value: string; kind?: "ean13" | "code128"; caption?: string; printValue?: boolean; label?: string };

type PdfOptions = {
  title: string;
  store?: string;
  note?: string; // riga di cortesia sotto la fascia del titolo
  noteAlign?: "left" | "center";
  highlight?: PdfHighlight | null;
  fields?: PdfField[];
  lines?: string[];
  barcode?: string | PdfBarcode | null;
  table?: PdfTable;
  totals?: PdfTotal[];
  footer?: string; // testo della fascia nera in fondo
};

const eanL = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const eanG = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const eanR = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const eanParity = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

// Code 128: larghezze (barra/spazio alternati) dei simboli 0-106; l'ultimo e lo STOP.
const code128Patterns = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

// Larghezze Helvetica (unità/1000) per allineare a destra i prezzi.
const helvWidths: Record<string, number> = { " ": 278, "!": 278, "\"": 355, "#": 556, "$": 556, "%": 889, "&": 667, "'": 191, "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278, "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556, "8": 556, "9": 556, ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556, "@": 1015, A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611, "[": 278, "\\": 278, "]": 278, "^": 469, _: 556, "`": 333, a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500, "{": 334, "|": 260, "}": 334, "~": 584 };

function textWidth(value: string, size: number, tracking = 0) {
  let units = 0;
  for (const char of value) units += helvWidths[char] ?? 556;
  return units / 1000 * size + tracking * Math.max(value.length - 1, 0);
}

function ascii(value: string) {
  return value.replaceAll("·", "-").replaceAll("€", "EUR").replace(/[’‘]/g, "'").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7E]/g, "?");
}

function escapePdf(value: string) {
  return ascii(value).replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

// Arrotonda le coordinate: evita code stream pieni di decimali inutili.
function n(value: number) {
  return Number(value.toFixed(2));
}

function barcodeBits(code: string) {
  if (!/^\d{13}$/.test(code)) return null;
  const first = Number(code[0]);
  const parity = eanParity[first];
  let bits = "101";
  for (let index = 1; index <= 6; index += 1) {
    const digit = Number(code[index]);
    bits += parity[index - 1] === "L" ? eanL[digit] : eanG[digit];
  }
  bits += "01010";
  for (let index = 7; index <= 12; index += 1) bits += eanR[Number(code[index])];
  return `${bits}101`;
}

// Code 128 set B (ASCII 32-126) con cifra di controllo modulo 103.
export function code128Bits(value: string) {
  const text = ascii(value);
  if (!text || /[^\x20-\x7E]/.test(text)) return null;
  const codes = [104];
  for (const char of text) codes.push(char.charCodeAt(0) - 32);
  let checksum = 104;
  for (let index = 1; index < codes.length; index += 1) checksum += codes[index] * index;
  codes.push(checksum % 103, 106);
  let bits = "";
  for (const code of codes) {
    let bar = true;
    for (const width of code128Patterns[code]) {
      bits += (bar ? "1" : "0").repeat(Number(width));
      bar = !bar;
    }
  }
  return bits;
}

function textCommand(value: string, x: number, y: number, size: number, bold = false, gray = "0", tracking = 0) {
  return `${gray} g BT /${bold ? "F2" : "F1"} ${size} Tf ${n(tracking)} Tc ${n(x)} ${n(y)} Td (${escapePdf(value)}) Tj ET 0 Tc`;
}

// Testo allineato a destra: il bordo destro finisce in `right`.
function textRight(value: string, right: number, y: number, size: number, bold = false, gray = "0", tracking = 0) {
  return textCommand(value, right - textWidth(ascii(value), size, tracking), y, size, bold, gray, tracking);
}

// Testo centrato attorno all'ascissa `center`.
function textCenter(value: string, center: number, y: number, size: number, bold = false, gray = "0", tracking = 0) {
  return textCommand(value, center - textWidth(ascii(value), size, tracking) / 2, y, size, bold, gray, tracking);
}

// Tronca il testo alla larghezza disponibile invece di tagliarlo a un numero fisso di caratteri.
function fit(value: string, maxWidth: number, size: number) {
  const text = ascii(value);
  if (textWidth(text, size) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && textWidth(`${cut}...`, size) > maxWidth) cut = cut.slice(0, -1);
  return `${cut}...`;
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number) {
  const k = 0.5523;
  return [
    `${n(cx - rx)} ${n(cy)} m`,
    `${n(cx - rx)} ${n(cy + ry * k)} ${n(cx - rx * k)} ${n(cy + ry)} ${n(cx)} ${n(cy + ry)} c`,
    `${n(cx + rx * k)} ${n(cy + ry)} ${n(cx + rx)} ${n(cy + ry * k)} ${n(cx + rx)} ${n(cy)} c`,
    `${n(cx + rx)} ${n(cy - ry * k)} ${n(cx + rx * k)} ${n(cy - ry)} ${n(cx)} ${n(cy - ry)} c`,
    `${n(cx - rx * k)} ${n(cy - ry)} ${n(cx - rx)} ${n(cy - ry * k)} ${n(cx - rx)} ${n(cy)} c S`,
  ].join(" ");
}

function roundRectPath(x: number, y: number, w: number, h: number, r: number) {
  const k = 0.5523 * r;
  return [
    `${n(x + r)} ${n(y)} m`,
    `${n(x + w - r)} ${n(y)} l`,
    `${n(x + w - r + k)} ${n(y)} ${n(x + w)} ${n(y + r - k)} ${n(x + w)} ${n(y + r)} c`,
    `${n(x + w)} ${n(y + h - r)} l`,
    `${n(x + w)} ${n(y + h - r + k)} ${n(x + w - r + k)} ${n(y + h)} ${n(x + w - r)} ${n(y + h)} c`,
    `${n(x + r)} ${n(y + h)} l`,
    `${n(x + r - k)} ${n(y + h)} ${n(x)} ${n(y + h - r + k)} ${n(x)} ${n(y + h - r)} c`,
    `${n(x)} ${n(y + r)} l`,
    `${n(x)} ${n(y + r - k)} ${n(x + r - k)} ${n(y)} ${n(x + r)} ${n(y)} c`,
  ].join(" ");
}

// Filigrana: curve di livello e creste di montagna appena accennate, come nei fac-simile.
function watermark() {
  const out = ["q 0.925 G 0.7 w"];
  for (let index = 0; index < 7; index += 1) {
    const radius = 48 + index * 30;
    out.push(ellipsePath(28, 232, radius * 0.72, radius));
  }
  for (let index = 0; index < 6; index += 1) {
    const radius = 42 + index * 26;
    out.push(ellipsePath(575, 648, radius * 0.66, radius));
  }
  out.push("0.945 G 1 w");
  for (let index = 0; index < 4; index += 1) {
    const drop = index * 16;
    out.push(`${n(300 - drop)} ${n(118 + drop)} m ${n(372 - drop)} ${n(206 + drop)} l ${n(412 - drop)} ${n(166 + drop)} l ${n(500 - drop)} ${n(252 + drop)} l ${n(560)} ${n(196 + drop)} l S`);
  }
  out.push("Q");
  return out;
}

export function createPdf(options: PdfOptions) {
  const brand = brandForStore(options.store);
  const commands: string[] = [...watermark()];

  // Intestazione: logo del punto vendita centrato e recapiti sotto.
  const logoMaxW = 160;
  const logoMaxH = 74;
  const logoScale = Math.min(logoMaxW / brand.logo.width, logoMaxH / brand.logo.height);
  const logoW = brand.logo.width * logoScale;
  const logoH = brand.logo.height * logoScale;
  const logoTop = 822;
  commands.push(`q ${n(logoW)} 0 0 ${n(logoH)} ${n(CENTER - logoW / 2)} ${n(logoTop - logoH)} cm /Im0 Do Q`);

  let headerY = logoTop - logoH - 16;
  for (const contact of brand.contacts) {
    commands.push(textCenter(contact, CENTER, headerY, 9, false, "0.2"));
    headerY -= 12;
  }

  // Fascia nera con il titolo del documento.
  const titleBarH = 30;
  const titleBarY = headerY - 8 - titleBarH;
  commands.push(`q 0 g ${LEFT} ${n(titleBarY)} ${WIDTH} ${titleBarH} re f Q`);
  commands.push(textCenter(options.title.toUpperCase(), CENTER, titleBarY + 10, 15, false, "1", 1.1));

  let y = titleBarY;
  if (options.note) {
    y -= 16;
    const note = fit(options.note, WIDTH, 7.5);
    commands.push(options.noteAlign === "center"
      ? textCenter(note, CENTER, y, 7.5, false, "0.3", 0.6)
      : textCommand(note, LEFT, y, 7.5, false, "0.3"));
    y -= 18;
  } else {
    y -= 22;
  }

  // Riquadro dell'importo in evidenza.
  if (options.highlight) {
    const boxH = options.highlight.caption ? 54 : 40;
    const boxY = y - boxH;
    if (options.highlight.rounded) commands.push(`q 0 G 1.2 w ${roundRectPath(LEFT, boxY, WIDTH, boxH, 12)} S Q`);
    else commands.push(`q 0 G 1.2 w ${LEFT} ${n(boxY)} ${WIDTH} ${boxH} re S Q`);
    if (options.highlight.caption) {
      commands.push(textCenter(options.highlight.caption.toUpperCase(), CENTER, boxY + boxH - 16, 7.5, false, "0.3", 0.8));
      commands.push(textCenter(options.highlight.value, CENTER, boxY + 12, 18, false, "0"));
    } else {
      commands.push(textCenter(options.highlight.value, CENTER, boxY + 13, 16, false, "0"));
    }
    y = boxY - 26;
  }

  const hasBarcode = Boolean(options.barcode);
  const floor = hasBarcode ? CONTENT_FLOOR_WITH_BARCODE : CONTENT_FLOOR_PLAIN;

  // Griglia dei campi: etichetta piccola, valore, filetto di chiusura.
  const fields = options.fields ?? [];
  let pending: PdfField | null = null;
  const drawField = (field: PdfField, x: number, cellW: number, top: number) => {
    commands.push(textCommand(field.label.toUpperCase(), x, top - 10, 6.5, false, "0.45", 0.7));
    commands.push(textCommand(fit(field.value, cellW, 11), x, top - 27, 11, false, "0.05"));
    commands.push(`q 0.82 G 0.6 w ${n(x)} ${n(top - 35)} m ${n(x + cellW)} ${n(top - 35)} l S Q`);
  };
  for (const field of fields) {
    if (y - FIELD_H < floor) break;
    if (field.full) {
      if (pending) { drawField(pending, COL_X[0], COL_W, y); pending = null; y -= FIELD_H; }
      if (y - FIELD_H < floor) break;
      drawField(field, LEFT, WIDTH, y);
      y -= FIELD_H;
      continue;
    }
    if (!pending) { pending = field; continue; }
    drawField(pending, COL_X[0], COL_W, y);
    drawField(field, COL_X[1], COL_W, y);
    pending = null;
    y -= FIELD_H;
  }
  if (pending && y - FIELD_H >= floor) { drawField(pending, COL_X[0], COL_W, y); y -= FIELD_H; }

  // Righe libere (DDT e documenti commerciali).
  const lines = options.lines ?? [];
  let rendered = 0;
  for (const line of lines) {
    if (y - 15 < floor) break;
    rendered += 1;
    if (line.startsWith("---")) {
      commands.push(`q 0.82 G 0.6 w ${LEFT} ${n(y + 4)} m ${RIGHT} ${n(y + 4)} l S Q`);
      y -= 10;
      continue;
    }
    const [left, right] = line.split("\t");
    if (/^(TOTALE|SALDO|IMPORTO DA PAGARE)/i.test(line)) {
      commands.push(`q 0 g ${LEFT} ${n(y - 5)} ${WIDTH} 19 re f Q`);
      commands.push(textCommand(fit(left ?? line, WIDTH - 110, 11), LEFT + 9, y, 11, true, "1"));
      if (right !== undefined) commands.push(textRight(right, RIGHT - 9, y, 11, true, "1"));
      y -= 23;
      continue;
    }
    const emphasized = /^(Numero|Codice|Cliente|Data|Negozio|Valore|Acconto|Totale concordato|Prodotti prenotati|Prodotti da risuolare|Descrizione|Mittente|Ricevente|Vettore|Causale)/i.test(left ?? line);
    if (right !== undefined) {
      commands.push(textCommand(fit(left, WIDTH - 110, 10), LEFT, y, 10, emphasized, "0.05"));
      commands.push(textRight(right, RIGHT, y, 10, false, "0.05"));
    } else {
      commands.push(textCommand(fit(line, WIDTH, 10), LEFT, y, 10, emphasized, "0.05"));
    }
    y -= 15;
  }
  if (rendered < lines.length) {
    commands.push(textCommand(`Altre ${lines.length - rendered} voci non visualizzate`, LEFT, y, 8, true, "0.3"));
    y -= 15;
  }

  if (options.table) {
    const table = options.table;
    const rowH = 16;
    y -= 6;
    commands.push(`q 0 g ${LEFT} ${n(y - 5)} ${WIDTH} ${rowH} re f Q`);
    table.headers.forEach((header, index) => {
      if (table.align[index] === "r") commands.push(textRight(header, table.x[index], y, 8, true, "1", 0.4));
      else commands.push(textCommand(header, table.x[index], y, 8, true, "1", 0.4));
    });
    y -= rowH;
    let drawn = 0;
    for (const row of table.rows) {
      if (y - rowH < floor) break;
      if (drawn % 2 === 1) commands.push(`q 0.96 g ${LEFT} ${n(y - 5)} ${WIDTH} ${rowH} re f Q`);
      row.forEach((cell, index) => {
        const limit = index === 0 ? table.x[1] - table.x[0] - 14 : 90;
        if (table.align[index] === "r") commands.push(textRight(cell, table.x[index], y, 8.5, false, "0.05"));
        else commands.push(textCommand(fit(cell, limit, 8.5), table.x[index], y, 8.5, false, "0.05"));
      });
      y -= rowH;
      drawn += 1;
    }
    if (drawn < table.rows.length) { commands.push(textCommand(`Altre ${table.rows.length - drawn} righe non visualizzate`, LEFT, y, 8, true, "0.3")); y -= rowH; }
  }

  if (options.totals) {
    const rowH = 18;
    y -= 8;
    for (const total of options.totals) {
      if (y - rowH < floor) break;
      if (total.strong) {
        commands.push(`q 0 g ${n(CENTER)} ${n(y - 5)} ${n(RIGHT - CENTER)} ${rowH} re f Q`);
        commands.push(textCommand(total.label.toUpperCase(), CENTER + 9, y, 10, true, "1", 0.5));
        commands.push(textRight(total.value, RIGHT - 9, y, 10, true, "1"));
      } else {
        commands.push(textRight(total.label, CENTER + 140, y, 10, false, "0.35"));
        commands.push(textRight(total.value, RIGHT - 9, y, 10, false, "0.05"));
      }
      y -= rowH;
    }
  }

  // Codice a barre ancorato in fondo, sopra la fascia nera.
  const barcode: PdfBarcode | null = typeof options.barcode === "string" ? { value: options.barcode } : (options.barcode ?? null);
  const isCode128 = barcode?.kind === "code128";
  const bits = barcode ? (isCode128 ? code128Bits(barcode.value) : barcodeBits(barcode.value)) : null;
  if (bits && barcode) {
    // Modulo ridotto quando il codice e lungo, per lasciare almeno 12 moduli di zona
    // bianca per lato: con il numero scontrino il codice resta comunque leggibile.
    const moduleWidth = Math.min(1.9, 440 / (bits.length + 24));
    const startX = (PAGE_W - bits.length * moduleWidth) / 2;
    commands.push("0 g");
    for (let index = 0; index < bits.length; index += 1) {
      if (bits[index] !== "1") continue;
      const guard = !isCode128 && (index < 3 || (index >= 45 && index < 50) || index >= 92);
      commands.push(`${n(startX + index * moduleWidth)} ${BARCODE_BARS_Y} ${n(moduleWidth)} ${guard ? BARCODE_BARS_H + 7 : BARCODE_BARS_H} re f`);
    }
    commands.push(textCenter(barcode.caption ?? "EAN PER RICHIAMO RAPIDO IN CASSA", CENTER, 112, 6.5, false, "0.45", 0.8));
    if (barcode.printValue !== false) commands.push(textCenter(barcode.label ?? barcode.value, CENTER, 97, 10, true, "0"));
  }

  // Fascia nera di chiusura e riga legale.
  commands.push(`q 0 g ${LEFT} ${FOOTER_BAR_Y} ${WIDTH} ${FOOTER_BAR_H} re f Q`);
  commands.push(textCenter(options.footer ?? "DOCUMENTO NON FISCALE", CENTER, FOOTER_BAR_Y + 9, 9.5, false, "1", 1));
  commands.push(textCenter(LEGAL_LINE, CENTER, 40, 7, false, "0.45", 0.3));

  const stream = `${commands.join("\n")}\n`;
  const encoder = new TextEncoder();
  const streamBytes = encoder.encode(stream);
  const logoBytes = Uint8Array.from(atob(brand.logo.base64), (char) => char.charCodeAt(0));

  // Serializzazione con oggetti misti testo + immagine binaria (JPEG /DCTDecode).
  const parts: Uint8Array[] = [];
  let length = 0;
  const offsets: number[] = [0];
  const pushText = (text: string) => { const bytes = encoder.encode(text); parts.push(bytes); length += bytes.length; };
  const pushBytes = (bytes: Uint8Array) => { parts.push(bytes); length += bytes.length; };
  const startObject = () => { offsets.push(length); };

  pushText("%PDF-1.4\n%PDFBIN\n"); // header

  startObject();
  pushText("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  startObject();
  pushText("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  startObject();
  pushText(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> /XObject << /Im0 7 0 R >> >> /Contents 6 0 R >>\nendobj\n`);
  startObject();
  pushText("4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");
  startObject();
  pushText("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n");
  startObject();
  pushText(`6 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n`);
  pushBytes(streamBytes);
  pushText("endstream\nendobj\n");
  startObject();
  pushText(`7 0 obj\n<< /Type /XObject /Subtype /Image /Width ${brand.logo.width} /Height ${brand.logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoBytes.length} >>\nstream\n`);
  pushBytes(logoBytes);
  pushText("\nendstream\nendobj\n");

  const xref = length;
  const objectCount = 7;
  let tail = `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objectCount; index += 1) tail += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  tail += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  pushText(tail);

  const output = new Uint8Array(length);
  let position = 0;
  for (const part of parts) { output.set(part, position); position += part.length; }
  return output;
}

export function euro(value: number) {
  return `${value.toFixed(2)} EUR`;
}
