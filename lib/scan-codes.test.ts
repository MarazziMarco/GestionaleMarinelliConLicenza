import { describe, it, expect } from "vitest";
import { compactCode, isReceiptCode, scanVariants, translateUsLayout } from "./scan-codes";

const RECEIPT = "VT-261014121530-472";

describe("translateUsLayout", () => {
  it("riporta a trattino l'apostrofo, cioè lo stesso tasto nei due layout", () => {
    expect(translateUsLayout("VT'261014121530'472")).toBe(RECEIPT);
  });

  it("traduce gli altri segni che la pistola sbaglia", () => {
    const coppie: [string, string][] = [
      ["ì", "="], ["è", "["], ["+", "]"], ["ù", "\\"], ["ò", ";"], ["à", "'"],
      ["-", "/"], ["_", "?"], ["?", "_"], [";", "<"], [":", ">"], ["/", "&"],
    ];
    for (const [ricevuto, inteso] of coppie) expect(translateUsLayout(ricevuto)).toBe(inteso);
  });

  it("non tocca lettere e cifre, che fra i due layout coincidono", () => {
    expect(translateUsLayout("VT261014121530472")).toBe("VT261014121530472");
    expect(translateUsLayout("2000000000017")).toBe("2000000000017");
  });
});

describe("scanVariants", () => {
  it("prova prima il codice com'è arrivato, poi quello tradotto", () => {
    expect(scanVariants("VT'261014121530'472")).toEqual(["VT'261014121530'472", RECEIPT]);
  });

  it("per un codice senza segni speciali resta una sola lettura", () => {
    expect(scanVariants(RECEIPT)).toEqual([RECEIPT, "VT/261014121530/472"]);
    expect(scanVariants("2000000000017")).toEqual(["2000000000017"]);
  });
});

describe("compactCode", () => {
  it("toglie i separatori, qualunque segno abbia prodotto la pistola", () => {
    for (const separator of ["-", "'", ":", "/", "?", "_", ".", "ì", "è"]) {
      expect(compactCode(`VT${separator}261014121530${separator}472`)).toBe("VT261014121530472");
    }
  });

  it("accetta il codice già compatto, gli spazi e le minuscole", () => {
    expect(compactCode("  vt-261014121530-472 ")).toBe("VT261014121530472");
  });

  it("lascia intatti gli EAN di prodotti, buoni e acconti", () => {
    expect(compactCode("2000000000017")).toBe("2000000000017");
  });
});

describe("isReceiptCode", () => {
  it("riconosce il numero scontrino con qualunque separatore e anche senza", () => {
    for (const separator of ["-", "'", ":", "/", "?", "_", ".", ""]) {
      expect(isReceiptCode(`VT${separator}261014121530${separator}472`)).toBe(true);
    }
    expect(isReceiptCode("gs-260930084511-108")).toBe(true);
  });

  it("non scambia un EAN per uno scontrino", () => {
    expect(isReceiptCode("2000000000017")).toBe(false);
    expect(isReceiptCode("8001234567890")).toBe(false);
  });
});
