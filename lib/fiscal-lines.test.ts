import { describe, it, expect } from "vitest";
import { buildFiscalLines } from "./fiscal-lines";

const product = (unitPrice: number, quantity = 1, discountPercent = 0) => ({ description: "Giacca", quantity, unitPrice, discountPercent, itemType: "product", metadata: {} });
const gift = (amount: number) => ({ description: "Buono 123", quantity: 1, unitPrice: -amount, discountPercent: 0, itemType: "gift_redemption", metadata: { code: "123" } });
const ret = (unitPrice: number) => ({ description: "Reso Giacca", quantity: -1, unitPrice, discountPercent: 0, itemType: "return", metadata: {} });

describe("buildFiscalLines", () => {
  it("vendita semplice: righe invariate, nessun aggiustamento", () => {
    const out = buildFiscalLines([product(100)], 100);
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0].lineTotal).toBe(100);
    expect(out.subtotal).toBe(100);
    expect(out.adjustment).toBe(0);
    expect(out.printable).toBe(true);
  });

  it("buono: niente riga a prezzo negativo, diventa sconto sul totale", () => {
    const out = buildFiscalLines([product(159), gift(125)], 34);
    expect(out.lines.map((l) => l.itemType)).toEqual(["product"]);
    expect(out.lines.every((l) => l.lineTotal >= 0)).toBe(true);
    expect(out.subtotal).toBe(159);
    expect(out.adjustment).toBe(-125);
    expect(out.printable).toBe(true);
  });

  it("buono + sconto sul totale: un solo aggiustamento complessivo", () => {
    const out = buildFiscalLines([product(100), gift(20)], 70);
    expect(out.adjustment).toBe(-30);
  });

  it("buono che copre tutto: totale zero, nessuno scontrino da stampare", () => {
    const out = buildFiscalLines([product(159), gift(159)], 0);
    expect(out.printable).toBe(false);
  });

  it("reso: la riga resta (serve al documento di reso) e si stampa anche a totale zero", () => {
    const out = buildFiscalLines([ret(50), product(50)], 0);
    expect(out.lines.map((l) => l.itemType)).toEqual(["return", "product"]);
    expect(out.lines[0].lineTotal).toBe(-50);
    expect(out.printable).toBe(true);
  });
});
