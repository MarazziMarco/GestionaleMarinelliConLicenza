import { describe, it, expect } from "vitest";
import { discountActive, effectivePrice, giftRedemptionAmount, paymentsMatch, changeDue, computeNextDocumentNumber } from "./pricing";

const NOW = new Date("2026-09-21T10:00:00");

describe("discountActive / effectivePrice", () => {
  it("nessuno sconto -> prezzo di listino", () => {
    expect(effectivePrice({ price: 100 }, NOW)).toBe(100);
    expect(effectivePrice({ price: 100, discountPercent: 0 }, NOW)).toBe(100);
    expect(discountActive({ price: 100, discountPercent: 0 }, NOW)).toBe(false);
  });
  it("sconto attivo -> prezzo scontato arrotondato", () => {
    expect(effectivePrice({ price: 120, discountPercent: 20 }, NOW)).toBe(96);
    expect(effectivePrice({ price: 21, discountPercent: 20 }, NOW)).toBe(16.8);
    expect(effectivePrice({ price: 129.9, discountPercent: 10 }, NOW)).toBe(116.91);
  });
  it("scadenza futura -> sconto valido; scaduta -> listino", () => {
    expect(effectivePrice({ price: 100, discountPercent: 50, discountExpiresAt: "2026-12-31" }, NOW)).toBe(50);
    expect(effectivePrice({ price: 100, discountPercent: 50, discountExpiresAt: "2026-01-01" }, NOW)).toBe(100);
  });
  it("scade oggi -> ancora valido fino a fine giornata", () => {
    expect(discountActive({ price: 100, discountPercent: 50, discountExpiresAt: "2026-09-21" }, NOW)).toBe(true);
  });
});

describe("giftRedemptionAmount", () => {
  it("usa il minore tra saldo e totale", () => {
    expect(giftRedemptionAmount(100, 120)).toBe(100); // buono minore
    expect(giftRedemptionAmount(100, 80)).toBe(80);   // totale minore -> residuo sul buono
    expect(giftRedemptionAmount(50, 50)).toBe(50);
  });
  it("mai negativo", () => {
    expect(giftRedemptionAmount(-10, 120)).toBe(0);
    expect(giftRedemptionAmount(100, -5)).toBe(0);
  });
  it("arrotonda a 2 decimali", () => {
    expect(giftRedemptionAmount(33.333, 100)).toBe(33.33);
  });
});

describe("paymentsMatch", () => {
  it("somma pagamenti = totale", () => {
    expect(paymentsMatch({ cash: 20, gift: 100 }, 120)).toBe(true);
    expect(paymentsMatch({ cash: 120 }, 120)).toBe(true);
    expect(paymentsMatch({ card: 60, cash: 60 }, 120)).toBe(true);
  });
  it("tollera 2 centesimi, rifiuta oltre", () => {
    expect(paymentsMatch({ cash: 120.02 }, 120)).toBe(true);
    expect(paymentsMatch({ cash: 119 }, 120)).toBe(false);
  });
});

describe("changeDue", () => {
  it("resto positivo, mai negativo", () => {
    expect(changeDue(50, 42)).toBe(8);
    expect(changeDue(40, 42)).toBe(0);
    expect(changeDue(100.5, 100.3)).toBe(0.2);
  });
});

describe("computeNextDocumentNumber", () => {
  it("primo documento dell'anno", () => {
    expect(computeNextDocumentNumber([], "invoice", 2026)).toBe("FAT 2026/001");
    expect(computeNextDocumentNumber([], "quote", 2026)).toBe("PREV 2026/001");
  });
  it("progressivo da max esistente", () => {
    expect(computeNextDocumentNumber(["FAT 2026/001", "FAT 2026/002"], "invoice", 2026)).toBe("FAT 2026/003");
    expect(computeNextDocumentNumber(["FAT 2026/001", "FAT 2026/007", "FAT 2026/003"], "invoice", 2026)).toBe("FAT 2026/008");
  });
  it("ignora numeri malformati", () => {
    expect(computeNextDocumentNumber(["FAT-vecchio-xyz", "FAT 2026/004"], "invoice", 2026)).toBe("FAT 2026/005");
  });
  it("padding a 3 cifre", () => {
    expect(computeNextDocumentNumber(["PREV 2026/099"], "quote", 2026)).toBe("PREV 2026/100");
  });
});
