// Logica pura di magazzino: riordino/trasferimenti suggeriti e invenduti.
// Niente DB, niente React: riusabile (pagine + dashboard) e testabile.

export type Store = "Viterbo" | "Gran Sasso";

export type StockProduct = {
  id: number;
  viterboQty: number; viterboReserved: number; viterboReorderLevel: number;
  granSassoQty: number; granSassoReserved: number; granSassoReorderLevel: number;
};

export type ReorderSettings = { globalMinEnabled: boolean; globalMin: number; suggestTransfers: boolean; transferSafety: number };

export type ReorderRow = {
  productId: number; store: Store; available: number; minimum: number; suggested: number;
  otherStore: Store; otherAvailable: number; transferAmount: number; priority: "urgent" | "critical" | "low";
};

/** Righe sotto scorta per negozio, con quantità da ordinare e trasferimento suggerito. */
export function computeReorderRows(products: StockProduct[], settings: ReorderSettings, scope: "Tutti" | Store = "Tutti"): ReorderRow[] {
  const rows: ReorderRow[] = [];
  const stores: Store[] = scope === "Tutti" ? ["Viterbo", "Gran Sasso"] : [scope];
  for (const p of products) {
    for (const store of stores) {
      const viterbo = p.viterboQty - p.viterboReserved;
      const granSasso = p.granSassoQty - p.granSassoReserved;
      const available = store === "Viterbo" ? viterbo : granSasso;
      const minimum = settings.globalMinEnabled ? settings.globalMin : (store === "Viterbo" ? p.viterboReorderLevel : p.granSassoReorderLevel);
      if (available > minimum) continue;
      const otherStore: Store = store === "Viterbo" ? "Gran Sasso" : "Viterbo";
      const otherAvailable = store === "Viterbo" ? granSasso : viterbo;
      const otherMinimum = settings.globalMinEnabled ? settings.globalMin : (store === "Viterbo" ? p.granSassoReorderLevel : p.viterboReorderLevel);
      const suggested = Math.max(1, minimum + 1 - available);
      const transferAmount = settings.suggestTransfers ? Math.min(suggested, Math.max(0, otherAvailable - otherMinimum - settings.transferSafety)) : 0;
      const priority: ReorderRow["priority"] = available <= 0 ? "urgent" : available <= Math.max(1, Math.floor(minimum / 2)) ? "critical" : "low";
      rows.push({ productId: p.id, store, available, minimum, suggested, otherStore, otherAvailable, transferAmount, priority });
    }
  }
  return rows;
}

export type UnsoldProduct = { id: number; variantGroup: string | null; viterboQty: number; granSassoQty: number };
export type UnsoldSaleItem = { itemType: string; createdAt: string; variantGroup: string | null; productId: number | null; quantity: number };
export type UnsoldSettings = { unsoldDays: number; minSold: number };
export type UnsoldGroup = { key: string; ids: number[]; stock: number; sold: number };

const groupKey = (variantGroup: string | null | undefined, id: number | null) => variantGroup ? `g:${variantGroup}` : `p:${id}`;

/** Modelli fermi/invenduti: aggregati per variantGroup, venduti <= minSold nel periodo e con giacenza. */
export function computeUnsoldGroups(products: UnsoldProduct[], saleItems: UnsoldSaleItem[], settings: UnsoldSettings, now: number): UnsoldGroup[] {
  const cutoff = now - settings.unsoldDays * 86400000;
  const sold = new Map<string, number>();
  for (const it of saleItems) {
    if (it.itemType !== "product" || new Date(it.createdAt).getTime() < cutoff) continue;
    const k = groupKey(it.variantGroup, it.productId);
    sold.set(k, (sold.get(k) ?? 0) + it.quantity);
  }
  const groups = new Map<string, UnsoldGroup>();
  for (const p of products) {
    const k = groupKey(p.variantGroup, p.id);
    const g = groups.get(k) ?? { key: k, ids: [], stock: 0, sold: 0 };
    g.ids.push(p.id);
    g.stock += p.viterboQty + p.granSassoQty;
    groups.set(k, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, sold: sold.get(g.key) ?? 0 }))
    .filter((g) => g.stock > 0 && g.sold <= settings.minSold);
}
