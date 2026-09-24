import { describe, it, expect, beforeAll } from "vitest";
import { boot, type TestApi } from "./helpers/app";

type Product = { id: number; name: string; price: number; viterboQty: number; viterboReserved: number };
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
