import { describe, it, expect } from "vitest";
import { buildFiscalLines } from "./fiscal-lines";

const product = (unitPrice: number, quantity = 1, discountPercent = 0) => ({ description: "Giacca", quantity, unitPrice, discountPercent, itemType: "product", metadata: {} });
const gift = (amount: number) => ({ description: "Buono 123", quantity: 1, unitPrice: -amount, discountPercent: 0, itemType: "gift_redemption", metadata: { code: "123" } });
const ret = (unitPrice: number) => ({ description: "Reso Giacca", quantity: -1, unitPrice, discountPercent: 0, itemType: "return", metadata: {} });

const cents = (value: number) => Math.round(value * 100);
// Quello che il ponte RCH manda al registratore: prezzo unitario in centesimi x quantita'.
const printedCents = (lines: { quantity: number; lineTotal: number }[]) =>
  lines.reduce((sum, l) => sum + Math.round(cents(l.lineTotal) / l.quantity) * l.quantity, 0);

describe("buildFiscalLines", () => {
  it("vendita semplice: righe invariate, nessun aggiustamento", () => {
    const out = buildFiscalLines([product(100)], 100);
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0].lineTotal).toBe(100);
    expect(out.adjustment).toBe(0);
    expect(out.printable).toBe(true);
  });

  it("sconto sul totale (caso reale E5 del 26/09): ripartito sulle righe, niente =V-", () => {
    const out = buildFiscalLines([product(45), product(100, 1, 30), product(45, 1, 30)], 146);
    expect(out.adjustment).toBe(0);
    expect(out.lines.every((l) => l.lineTotal >= 0)).toBe(true);
    expect(printedCents(out.lines)).toBe(14600);
  });

  it("buono: niente riga negativa e niente sconto sul totale, il prezzo riga scende", () => {
    const out = buildFiscalLines([product(159), gift(125)], 34);
    expect(out.lines.map((l) => l.itemType)).toEqual(["product"]);
    expect(out.lines[0].lineTotal).toBe(34);
    expect(out.adjustment).toBe(0);
  });

  it("buono + sconto su piu' righe: totale stampato identico al totale vendita", () => {
    const out = buildFiscalLines([product(100), product(59.9), gift(20)], 129.9);
    expect(out.adjustment).toBe(0);
    expect(printedCents(out.lines)).toBe(12990);
  });

  it("quantita' > 1 non divisibile al centesimo: la riga si divide, il totale resta esatto", () => {
    const out = buildFiscalLines([product(1.23, 7, 10)], 7.75);
    expect(out.adjustment).toBe(0);
    expect(out.lines.reduce((s, l) => s + l.quantity, 0)).toBe(7);
    expect(out.lines.every((l) => cents(l.lineTotal) % l.quantity === 0)).toBe(true);
    expect(printedCents(out.lines)).toBe(775);
  });

  it("buono che copre tutto: totale zero, nessuno scontrino da stampare", () => {
    const out = buildFiscalLines([product(159), gift(159)], 0);
    expect(out.printable).toBe(false);
  });

  it("reso: la riga resta com'e' (serve al documento di reso) e si stampa anche a totale zero", () => {
    const out = buildFiscalLines([ret(50), product(50)], 0);
    expect(out.lines.map((l) => l.itemType)).toEqual(["return", "product"]);
    expect(out.lines[0].lineTotal).toBe(-50);
    expect(out.lines[1].lineTotal).toBe(50);
    expect(out.printable).toBe(true);
  });

  it("cambio con sconto: lo sconto va sulla parte vendita, il reso non si tocca", () => {
    const out = buildFiscalLines([ret(50), product(80)], 25);
    expect(out.lines[0].lineTotal).toBe(-50);
    expect(out.lines[1].lineTotal).toBe(75);
    expect(out.adjustment).toBe(0);
  });
});
