import { describe, it, expect } from "vitest";
import { normalizeScannedCode, isReceiptCode } from "./scan-codes";

describe("normalizeScannedCode", () => {
  it("lascia intatto un numero scontrino gia corretto", () => {
    expect(normalizeScannedCode("VT-261014121530-472")).toBe("VT-261014121530-472");
    expect(normalizeScannedCode("GS-260930084511-108")).toBe("GS-260930084511-108");
  });

  it("riporta a trattino l'apostrofo dello scanner con layout italiano", () => {
    expect(normalizeScannedCode("VT'261014121530'472")).toBe("VT-261014121530-472");
    expect(normalizeScannedCode("gs'260930084511'108")).toBe("GS-260930084511-108");
  });

  it("vale anche per gli altri segni prodotti da layout diversi", () => {
    for (const separator of ["/", "?", "ì", "_", "."]) {
      expect(normalizeScannedCode(`VT${separator}261014121530${separator}472`)).toBe("VT-261014121530-472");
    }
  });

  it("non tocca gli EAN di prodotti, buoni e acconti", () => {
    expect(normalizeScannedCode("2000000000017")).toBe("2000000000017");
    expect(normalizeScannedCode("8001234567890")).toBe("8001234567890");
  });

  it("non tocca un codice che inizia per lettere ma non e uno scontrino", () => {
    expect(normalizeScannedCode("AB'123")).toBe("AB'123");
  });

  it("riconosce come scontrino solo i codici normalizzati", () => {
    expect(isReceiptCode(normalizeScannedCode("VT'261014121530'472"))).toBe(true);
    expect(isReceiptCode(normalizeScannedCode("2000000000017"))).toBe(false);
  });
});
