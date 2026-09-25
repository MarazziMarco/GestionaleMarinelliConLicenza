import { describe, expect, it } from "vitest";
import { canonicalCategory, categoryKey, categoryNames } from "./categories";

describe("categories", () => {
  it("rimuove gli spazi e accorpa differenze di maiuscole", () => {
    expect(categoryNames([" Scarpe ", "scarpe", "SCARPE ", " Zaini", ""])).toEqual(["Scarpe", "Zaini"]);
    expect(categoryKey("  SCARPE ")).toBe(categoryKey("scarpe"));
  });

  it("riusa il nome esistente quando si inserisce una categoria", () => {
    expect(canonicalCategory("  scarpe  ", ["Scarpe", "Zaini"])).toBe("Scarpe");
    expect(canonicalCategory("  Guanti  ", ["Scarpe"])).toBe("Guanti");
  });

  it("non mantiene categorie prive di prodotti", () => {
    expect(categoryNames(["Scarpe"])).toEqual(["Scarpe"]);
  });
});