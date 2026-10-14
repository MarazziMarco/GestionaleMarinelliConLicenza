import { describe, it, expect } from "vitest";
import { code128Bits } from "./pdf";

const startB = "11010010000"; // simbolo 104 (211214)
const stop = "1100011101011"; // simbolo 106 (2331112)

// Decodifica indipendente: dai moduli torna alle larghezze, poi ai valori dei simboli.
const patterns = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232",
];

function decode(bits: string) {
  // I 13 moduli finali sono lo STOP: il resto sono simboli da 11 moduli.
  expect(bits.endsWith(stop)).toBe(true);
  const body = bits.slice(0, -stop.length);
  expect(body.length % 11).toBe(0);
  const values: number[] = [];
  for (let offset = 0; offset < body.length; offset += 11) {
    const chunk = body.slice(offset, offset + 11);
    // Conta le corse di 1 e 0 alternate: sono le larghezze del simbolo.
    const widths = (chunk.match(/1+|0+/g) ?? []).map((run) => String(run.length)).join("");
    const value = patterns.indexOf(widths);
    expect(value).toBeGreaterThanOrEqual(0);
    values.push(value);
  }
  const start = values.shift();
  const check = values.pop();
  expect(start).toBe(104);
  let expected = 104;
  values.forEach((value, index) => { expected += value * (index + 1); });
  expect(check).toBe(expected % 103);
  return values.map((value) => String.fromCharCode(value + 32)).join("");
}

describe("code128Bits", () => {
  it("apre con Start B e chiude con lo Stop", () => {
    const bits = code128Bits("49.99");
    expect(bits).not.toBeNull();
    expect(bits!.startsWith(startB)).toBe(true);
    expect(bits!.endsWith(stop)).toBe(true);
    // 5 caratteri + start + checksum = 7 simboli da 11 moduli, piu i 13 dello stop.
    expect(bits!.length).toBe(7 * 11 + 13);
  });

  it("il prezzo scansionato torna identico", () => {
    for (const price of ["0.50", "9.90", "49.99", "1250.00"]) {
      expect(decode(code128Bits(price)!)).toBe(price);
    }
  });

  it("normalizza i caratteri fuori ASCII e scarta il vuoto", () => {
    expect(code128Bits("")).toBeNull();
    expect(decode(code128Bits("49.99 €")!)).toBe("49.99 EUR");
  });
});
