import { describe, it, expect } from "vitest";
import { computeReorderRows, computeUnsoldGroups, type StockProduct, type ReorderSettings } from "./inventory";

const settings: ReorderSettings = { globalMinEnabled: false, globalMin: 2, suggestTransfers: true, transferSafety: 0 };

function product(over: Partial<StockProduct> & { id: number }): StockProduct {
  return { viterboQty: 0, viterboReserved: 0, viterboReorderLevel: 2, granSassoQty: 0, granSassoReserved: 0, granSassoReorderLevel: 2, ...over };
}

describe("computeReorderRows", () => {
  it("include solo chi è a/ sotto la soglia", () => {
    const rows = computeReorderRows([product({ id: 1, viterboQty: 5, granSassoQty: 5 })], settings);
    expect(rows).toHaveLength(0); // sopra soglia in entrambi
    const low = computeReorderRows([product({ id: 2, viterboQty: 1, granSassoQty: 5 })], settings);
    expect(low).toHaveLength(1);
    expect(low[0].store).toBe("Viterbo");
  });
  it("priorità: urgent se esaurito, critical se molto basso, low altrimenti", () => {
    expect(computeReorderRows([product({ id: 1, viterboQty: 0, granSassoReorderLevel: 0 })], settings)[0].priority).toBe("urgent");
    const crit = computeReorderRows([product({ id: 1, viterboQty: 1, viterboReorderLevel: 4, granSassoReorderLevel: 0 })], settings)[0];
    expect(crit.priority).toBe("critical"); // 1 <= floor(4/2)=2
    const low = computeReorderRows([product({ id: 1, viterboQty: 2, viterboReorderLevel: 2, granSassoReorderLevel: 0 })], settings)[0];
    expect(low.priority).toBe("low"); // 2 > floor(2/2)=1
  });
  it("quantità suggerita porta sopra la soglia", () => {
    const r = computeReorderRows([product({ id: 1, viterboQty: 0, viterboReorderLevel: 3, granSassoReorderLevel: 0 })], settings)[0];
    expect(r.suggested).toBe(4); // min+1-available = 3+1-0
  });
  it("trasferimento suggerito dall'altro negozio se c'è surplus", () => {
    const r = computeReorderRows([product({ id: 1, viterboQty: 0, viterboReorderLevel: 2, granSassoQty: 10, granSassoReorderLevel: 2 })], settings);
    const vt = r.find((x) => x.store === "Viterbo")!;
    expect(vt.transferAmount).toBe(3); // min(suggested=3, otherAvail 10 - otherMin 2 - safety 0)
    expect(vt.otherStore).toBe("Gran Sasso");
  });
  it("niente trasferimento se suggestTransfers off", () => {
    const r = computeReorderRows([product({ id: 1, viterboQty: 0, granSassoQty: 10 })], { ...settings, suggestTransfers: false });
    expect(r.find((x) => x.store === "Viterbo")!.transferAmount).toBe(0);
  });
  it("globalMin sovrascrive le soglie per variante", () => {
    const r = computeReorderRows([product({ id: 1, viterboQty: 4, viterboReorderLevel: 1, granSassoQty: 4, granSassoReorderLevel: 1 })], { ...settings, globalMinEnabled: true, globalMin: 5 });
    expect(r).toHaveLength(2); // 4 <= 5 in entrambi
  });
  it("non riordina articoli mai trattati in quel negozio, ma conserva gli esauriti", () => {
    const rows = computeReorderRows([
      product({ id: 1, viterboTracked: 0, granSassoTracked: 1, granSassoQty: 1 }),
      product({ id: 2, viterboTracked: 1, granSassoTracked: 0, viterboQty: 0 }),
    ], settings);
    expect(rows.map((row) => [row.productId, row.store])).toEqual([[1, "Gran Sasso"], [2, "Viterbo"]]);
  });
  it("scope limita a un negozio", () => {
    const r = computeReorderRows([product({ id: 1, viterboQty: 0, granSassoQty: 0 })], settings, "Viterbo");
    expect(r).toHaveLength(1);
    expect(r[0].store).toBe("Viterbo");
  });
});

describe("computeUnsoldGroups", () => {
  const NOW = new Date("2026-09-21T00:00:00").getTime();
  const prods = [
    { id: 1, variantGroup: "g-scarpa", viterboQty: 3, granSassoQty: 2 },
    { id: 2, variantGroup: "g-scarpa", viterboQty: 1, granSassoQty: 0 },
    { id: 3, variantGroup: null, viterboQty: 0, granSassoQty: 0 }, // niente stock
    { id: 4, variantGroup: "g-venduta", viterboQty: 5, granSassoQty: 0 },
  ];
  it("raggruppa per modello e include chi ha venduto <= minSold con giacenza", () => {
    const items = [{ itemType: "product", createdAt: "2026-09-20T10:00:00", variantGroup: "g-venduta", productId: 4, quantity: 3 }];
    const groups = computeUnsoldGroups(prods, items, { unsoldDays: 365, minSold: 0 }, NOW);
    const keys = groups.map((g) => g.key);
    expect(keys).toContain("g:g-scarpa"); // 0 venduti, stock 6
    expect(keys).not.toContain("g:g-venduta"); // venduto 3 > 0
    expect(keys).not.toContain("p:3"); // stock 0
    const scarpa = groups.find((g) => g.key === "g:g-scarpa")!;
    expect(scarpa.stock).toBe(6);
    expect(scarpa.ids.sort()).toEqual([1, 2]);
  });
  it("le vendite fuori dal periodo non contano", () => {
    const items = [{ itemType: "product", createdAt: "2024-01-01T10:00:00", variantGroup: "g-venduta", productId: 4, quantity: 3 }];
    const groups = computeUnsoldGroups(prods, items, { unsoldDays: 365, minSold: 0 }, NOW);
    expect(groups.map((g) => g.key)).toContain("g:g-venduta"); // vendita vecchia -> conta 0
  });
  it("minSold alza la soglia dei 'pochi venduti'", () => {
    const items = [{ itemType: "product", createdAt: "2026-09-20T10:00:00", variantGroup: "g-venduta", productId: 4, quantity: 2 }];
    const groups = computeUnsoldGroups(prods, items, { unsoldDays: 365, minSold: 2 }, NOW);
    expect(groups.map((g) => g.key)).toContain("g:g-venduta"); // 2 <= 2
  });
  it("ignora righe non prodotto", () => {
    const items = [{ itemType: "gift", createdAt: "2026-09-20T10:00:00", variantGroup: "g-venduta", productId: 4, quantity: 9 }];
    const groups = computeUnsoldGroups(prods, items, { unsoldDays: 365, minSold: 0 }, NOW);
    expect(groups.map((g) => g.key)).toContain("g:g-venduta"); // il gift non conta come vendita
  });
});
