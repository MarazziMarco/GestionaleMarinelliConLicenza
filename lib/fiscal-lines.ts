// Righe per lo scontrino RT: logica pura, condivisa dal server e dai test.
//
// Il buono speso in cassa e' una riga carrello a prezzo negativo (gift_redemption).
// Il registratore non accetta articoli a prezzo negativo (la RCH risponde NACK):
// la riga si toglie e il suo valore confluisce nell'aggiustamento sul totale, che
// il ponte stampa come "SCONTO TOTALE" (=V-). Il buono e' gia' stato certificato
// quando e' stato venduto, quindi lo scontrino resta della sola differenza.

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

export function buildFiscalLines(items: FiscalItem[], total: number) {
  const lines: FiscalLine[] = items
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
  const adjustment = round2(total - subtotal);
  const hasReturn = lines.some((line) => line.itemType === "return");
  // Senza resi un documento da zero euro non si stampa: la RCH non lo chiude
  // (nessun pagamento) e non c'e' nulla da certificare.
  const printable = hasReturn || Math.abs(total) > 0.005;
  return { lines, subtotal, adjustment, printable };
}
