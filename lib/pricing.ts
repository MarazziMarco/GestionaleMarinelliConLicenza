// Logica pura di prezzi/pagamenti/documenti: niente DB, niente React.
// Estratta qui per poterla riusare (client + server) e testare con Vitest.

export type Discountable = { price: number; discountPercent?: number; discountExpiresAt?: string | null };

/** Sconto promozionale attivo: percentuale > 0 e non scaduto. */
export function discountActive(p: Discountable, now: Date = new Date()): boolean {
  return (p.discountPercent ?? 0) > 0 && (!p.discountExpiresAt || new Date(`${p.discountExpiresAt}T23:59:59`) >= now);
}

/** Prezzo effettivo: listino scontato se la promo è attiva, altrimenti listino. */
export function effectivePrice(p: Discountable, now: Date = new Date()): number {
  return discountActive(p, now) ? Math.round(p.price * (1 - (p.discountPercent ?? 0) / 100) * 100) / 100 : p.price;
}

/** Importo del buono da scalare su una vendita: mai oltre il saldo né il totale carrello. */
export function giftRedemptionAmount(balance: number, cartTotal: number): number {
  return Math.round(Math.min(Math.max(0, balance), Math.max(0, cartTotal)) * 100) / 100;
}

/** La somma dei pagamenti coincide col totale (tolleranza 2 centesimi). */
export function paymentsMatch(parts: { cash?: number; card?: number; bank?: number; gift?: number }, total: number): boolean {
  const sum = (parts.cash ?? 0) + (parts.card ?? 0) + (parts.bank ?? 0) + (parts.gift ?? 0);
  return Math.abs(sum - total) <= 0.02;
}

/** Resto da dare (mai negativo). */
export function changeDue(received: number, total: number): number {
  return Math.max(0, Math.round((received - total) * 100) / 100);
}

/** Numero documento progressivo per anno e tipo: FAT 2026/001, PREV 2026/001. */
export function computeNextDocumentNumber(existingNumbers: string[], type: string, year: number): string {
  const prefix = type === "invoice" ? "FAT" : "PREV";
  let max = 0;
  for (const number of existingNumbers) {
    const parsed = parseInt(String(number).split("/").pop() ?? "", 10);
    if (Number.isFinite(parsed) && parsed > max) max = parsed;
  }
  return `${prefix} ${year}/${String(max + 1).padStart(3, "0")}`;
}
