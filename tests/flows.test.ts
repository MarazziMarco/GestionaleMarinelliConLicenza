import { describe, it, expect, beforeAll } from "vitest";
import { boot, type TestApi } from "./helpers/app";
import { computeReorderRows } from "../lib/inventory";
import { categoryKey, categoryNames } from "../lib/categories";

type Product = { id: number; name: string; category: string; price: number; viterboQty: number; viterboReserved: number; viterboReorderLevel: number; viterboTracked: number; granSassoQty: number; granSassoReserved: number; granSassoReorderLevel: number; granSassoTracked: number };
type Sale = { id: number; receiptNo: string; total: number };
type Gift = { code: string; balance: number };
type SaleItem = { id: number; saleId: number; productId: number | null };
type Bootstrap = { products: Product[]; sales: Sale[]; gifts: Gift[]; saleItems: SaleItem[] };

let api: TestApi;
const bootstrap = async (): Promise<Bootstrap> => (await api.get("bootstrap")).json();
const round2 = (n: number) => Math.round(n * 100) / 100;

beforeAll(async () => { api = await boot(); });

describe("flusso vendita (pglite)", () => {
  it("vende un prodotto: crea scontrino e scala la giacenza", async () => {
    const before = await bootstrap();
    const product = before.products.find((p) => p.viterboQty - p.viterboReserved > 0)!;
    expect(product).toBeTruthy();
    const total = product.price;
    const res = await api.post({
      action: "createSale", store: "Viterbo", total, cashAmount: total,
      items: [{ productId: product.id, description: product.name, quantity: 1, unitPrice: product.price, discountPercent: 0, itemType: "product", metadata: {} }],
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.receiptNo).toBeTruthy();
    const after = await bootstrap();
    expect(after.products.find((p) => p.id === product.id)!.viterboQty).toBe(product.viterboQty - 1);
    expect(after.sales.length).toBe(before.sales.length + 1);
  });

  it("rifiuta se i pagamenti non coprono il totale", async () => {
    const before = await bootstrap();
    const product = before.products.find((p) => p.viterboQty - p.viterboReserved > 0)!;
    const res = await api.post({
      action: "createSale", store: "Viterbo", total: product.price, cashAmount: product.price - 5,
      items: [{ productId: product.id, description: product.name, quantity: 1, unitPrice: product.price, discountPercent: 0, itemType: "product", metadata: {} }],
    });
    expect(res.status).toBe(400);
    const after = await bootstrap();
    expect(after.sales.length).toBe(before.sales.length); // nessuna vendita registrata
  });

  it("buono speso come sconto: scontrino della differenza e saldo azzerato", async () => {
    const created = await (await api.post({ action: "createGift", beneficiary: "Cliente Test", value: 100, store: "Viterbo" })).json();
    expect(created.code).toBeTruthy();
    const before = await bootstrap();
    const product = before.products.find((p) => p.price >= 100 && p.viterboQty - p.viterboReserved > 0)!;
    expect(product).toBeTruthy();
    const use = 100;
    const total = round2(product.price - use);
    const res = await api.post({
      action: "createSale", store: "Viterbo", total, cashAmount: total,
      items: [
        { productId: product.id, description: product.name, quantity: 1, unitPrice: product.price, discountPercent: 0, itemType: "product", metadata: {} },
        { productId: null, description: `Buono ${created.code}`, quantity: 1, unitPrice: -use, discountPercent: 0, itemType: "gift_redemption", metadata: { code: created.code } },
      ],
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    const after = await bootstrap();
    const sale = after.sales.find((s) => s.receiptNo === body.receiptNo)!;
    expect(sale.total).toBeCloseTo(total, 2); // scontrino = differenza
    expect(after.gifts.find((g) => g.code === created.code)!.balance).toBe(0); // buono usato
  });

  it("reso di un prodotto venduto: rimborso e giacenza riaccreditata", async () => {
    const before = await bootstrap();
    const product = before.products.find((p) => p.viterboQty - p.viterboReserved > 0 && p.price > 0)!;
    expect(product).toBeTruthy();
    const baseQty = product.viterboQty;
    // 1) vendita
    const sale = await (await api.post({
      action: "createSale", store: "Viterbo", total: product.price, cashAmount: product.price,
      items: [{ productId: product.id, description: product.name, quantity: 1, unitPrice: product.price, discountPercent: 0, itemType: "product", metadata: {} }],
    })).json();
    const mid = await bootstrap();
    expect(mid.products.find((p) => p.id === product.id)!.viterboQty).toBe(baseQty - 1);
    const saleItem = mid.saleItems.find((si) => si.saleId === sale.saleId && si.productId === product.id)!;
    expect(saleItem).toBeTruthy();
    // 2) reso collegato alla riga originale
    const res = await api.post({
      action: "createSale", store: "Viterbo", total: -product.price, cashAmount: -product.price,
      items: [{ productId: product.id, description: product.name, quantity: -1, unitPrice: product.price, discountPercent: 0, itemType: "return", metadata: { originalSaleItemId: saleItem.id } }],
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    const after = await bootstrap();
    expect(after.products.find((p) => p.id === product.id)!.viterboQty).toBe(baseQty); // giacenza tornata
    expect(after.sales.find((s) => s.receiptNo === body.receiptNo)!.total).toBeCloseTo(-product.price, 2);
  });

  it("stesso client_ref: niente doppio scontrino né doppio scarico", async () => {
    const before = await bootstrap();
    const product = before.products.find((p) => p.viterboQty - p.viterboReserved > 0)!;
    const baseQty = product.viterboQty;
    const ref = `ref-${Math.random().toString(16).slice(2)}`;
    const payload = { action: "createSale", store: "Viterbo", total: product.price, cashAmount: product.price, clientRef: ref, items: [{ productId: product.id, description: product.name, quantity: 1, unitPrice: product.price, discountPercent: 0, itemType: "product", metadata: {} }] };
    const first = await (await api.post(payload)).json();
    const second = await (await api.post(payload)).json();
    expect(first.receiptNo).toBeTruthy();
    expect(second.receiptNo).toBe(first.receiptNo); // stessa vendita
    expect(second.duplicate).toBe(true);
    const after = await bootstrap();
    expect(after.products.find((p) => p.id === product.id)!.viterboQty).toBe(baseQty - 1); // scalato una sola volta
  });

  it("blocca un reso non collegato a una vendita reale", async () => {
    const before = await bootstrap();
    const product = before.products.find((p) => p.price > 0)!;
    const res = await api.post({
      action: "createSale", store: "Viterbo", total: -product.price, cashAmount: -product.price,
      items: [{ productId: product.id, description: product.name, quantity: -1, unitPrice: product.price, discountPercent: 0, itemType: "return", metadata: { originalSaleItemId: 999999 } }],
    });
    expect(res.status).toBeGreaterThanOrEqual(400); // vendita originale inesistente
  });
});

describe("catalogo per negozio (pglite)", () => {
  it("riusa la categoria e non riordina nell'altro negozio", async () => {
    const before = await bootstrap();
    const existingCategory = before.products[0].category;
    const suffix = Math.random().toString(36).slice(2, 10);
    const response = await api.post({
      action: "createProduct", name: "Articolo prova negozio", brand: "Marca prova",
      category: `  ${existingCategory.toLocaleUpperCase("it")}  `,
      sku: `TEST-${suffix}`, eans: [`TEST-EAN-${suffix}`], color: "Nero", size: "Unica", price: 10,
      viterboQty: 0, granSassoQty: 1,
    });
    expect(response.status).toBe(200);
    const created = await response.json();
    const after = await bootstrap();
    const product = after.products.find((item) => item.id === created.productId)!;
    expect(product).toBeTruthy();
    expect(product.viterboTracked).toBe(0);
    expect(product.granSassoTracked).toBe(1);
    expect(categoryKey(product.category)).toBe(categoryKey(existingCategory));
    expect(categoryNames(after.products.map((item) => item.category)).filter((name) => categoryKey(name) === categoryKey(existingCategory))).toHaveLength(1);
    const rows = computeReorderRows([product], { globalMinEnabled: false, globalMin: 2, suggestTransfers: true, transferSafety: 0 });
    expect(rows.map((row) => row.store)).toEqual(["Gran Sasso"]);
  });
});