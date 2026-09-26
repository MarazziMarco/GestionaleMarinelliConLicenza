// Righe per lo scontrino RT: logica pura, condivisa dal server e dai test.
//
// Il registratore RCH rifiuta sia gli articoli a prezzo negativo (NACK) sia lo
// sconto sul subtotale che il ponte manderebbe per l'aggiustamento ("=V-", errore
// E5 in negozio il 26/09). Per questo il buono speso (riga gift_redemption) e lo
// sconto/arrotondamento sul totale vengono ripartiti sui prezzi delle righe
// vendita: il ponte stampa solo articoli a prezzo netto, come per lo sconto riga,
// e l'aggiustamento resta a zero. Il buono e' gia' stato certificato quando e'
// stato venduto, quindi lo scontrino resta della sola differenza.
//
// Il ponte stampa ogni riga come prezzo unitario (lineTotal / quantita', in
// centesimi) x quantita': una riga con quantita' > 1 il cui totale non e'
// divisibile al centesimo viene divisa in due righe, cosi' la somma resta esatta.

export type FiscalItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  itemType: string;
  metadata: unknown;
};

export type FiscalLine = FiscalItem & { lineTotal: number };

const round2 = (value: number) => Math.round(value * 100) / 100;
const DISCOUNTABLE = new Set(["product", "service"]);

function isDiscountable(line: FiscalLine) {
  return DISCOUNTABLE.has(line.itemType) && line.quantity > 0 && Number.isInteger(line.quantity) && line.lineTotal > 0;
}

// Divide una riga in (q - r) pezzi a u centesimi e r pezzi a u + 1 centesimi.
function splitExact(line: FiscalLine, totalCents: number): FiscalLine[] {
  const quantity = line.quantity;
  const unit = Math.floor(totalCents / quantity);
  const rest = totalCents - unit * quantity;
  const part = (qty: number, unitCents: number): FiscalLine => ({ ...line, quantity: qty, lineTotal: (unitCents * qty) / 100 });
  if (rest === 0) return [part(quantity, unit)];
  return [part(quantity - rest, unit), part(rest, unit + 1)].filter((l) => l.quantity > 0);
}

export function buildFiscalLines(items: FiscalItem[], total: number) {
  let lines: FiscalLine[] = items
    .filter((item) => item.itemType !== "gift_redemption")
    .map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountPercent: item.discountPercent,
      lineTotal: round2(item.quantity * item.unitPrice * (1 - item.discountPercent / 100)),
      itemType: item.itemType,
      metadata: item.metadata,
    }));
  const subtotal = round2(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const hasReturn = lines.some((line) => line.itemType === "return");

  const targetCents = Math.round(total * 100);
  const fixedCents = lines.filter((line) => !isDiscountable(line)).reduce((sum, line) => sum + Math.round(line.lineTotal * 100), 0);
  const discountable = lines.filter(isDiscountable);
  const currentCents = discountable.reduce((sum, line) => sum + Math.round(line.lineTotal * 100), 0);
  const wantedCents = targetCents - fixedCents;
  if (discountable.length && currentCents > 0 && wantedCents >= 0) {
    // Ripartizione proporzionale in centesimi; l'arrotondamento residuo va sulla riga piu' grande.
    const allocated = new Map<FiscalLine, number>();
    for (const line of discountable) allocated.set(line, Math.round((Math.round(line.lineTotal * 100) * wantedCents) / currentCents));
    const residue = wantedCents - [...allocated.values()].reduce((sum, value) => sum + value, 0);
    const largest = discountable.reduce((best, line) => (allocated.get(line)! > allocated.get(best)! ? line : best));
    allocated.set(largest, Math.max(0, allocated.get(largest)! + residue));
    // Un articolo finito a 0 euro (buono quasi pari al totale) non va mandato: la RCH non lo accetta.
    lines = lines.flatMap((line) => (allocated.has(line) ? splitExact(line, allocated.get(line)!).filter((part) => part.lineTotal > 0) : [line]));
  }

  const adjustment = round2(total - lines.reduce((sum, line) => sum + line.lineTotal, 0));
  // Senza resi un documento da zero euro non si stampa: la RCH non lo chiude
  // (nessun pagamento) e non c'e' nulla da certificare.
  const printable = hasReturn || Math.abs(total) > 0.005;
  return { lines, subtotal, adjustment, printable };
}
