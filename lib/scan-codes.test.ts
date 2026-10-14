import { describe, it, expect } from "vitest";
import { compactCode, isReceiptCode } from "./scan-codes";

// La pistola digita col layout US: il trattino puo arrivare come uno qualunque
// di questi segni a seconda della tastiera configurata su Windows.
const separators = ["-", "'", ":", "/", "?", "_", ".", "ì", "è"];

describe("compactCode", () => {
  it("toglie i separatori dal numero scontrino", () => {
    expect(compactCode("VT-261014121530-472")).toBe("VT261014121530472");
    expect(compactCode("GS-260930084511-108")).toBe("GS260930084511108");
  });

  it("dà lo stesso risultato qualunque segno produca la pistola", () => {
    for (const separator of separators) {
      expect(compactCode(`VT${separator}261014121530${separator}472`)).toBe("VT261014121530472");
    }
  });

  it("accetta il codice già compatto e le minuscole", () => {
    expect(compactCode("vt261014121530472")).toBe("VT261014121530472");
    expect(compactCode("  VT-261014121530-472  ")).toBe("VT261014121530472");
  });

  it("lascia intatti gli EAN di prodotti, buoni e acconti", () => {
    expect(compactCode("2000000000017")).toBe("2000000000017");
    expect(compactCode("8001234567890")).toBe("8001234567890");
  });
});

describe("isReceiptCode", () => {
  it("riconosce il numero scontrino con qualunque separatore e anche senza", () => {
    for (const separator of separators) {
      expect(isReceiptCode(`VT${separator}261014121530${separator}472`)).toBe(true);
    }
    expect(isReceiptCode("VT261014121530472")).toBe(true);
    expect(isReceiptCode("gs-260930084511-108")).toBe(true);
  });

  it("non scambia un EAN per uno scontrino", () => {
    expect(isReceiptCode("2000000000017")).toBe(false);
    expect(isReceiptCode("8001234567890")).toBe(false);
  });
});
