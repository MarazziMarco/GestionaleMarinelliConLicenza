import { createPdf, euro, type PdfField } from "../../../lib/pdf";
import { compactCode } from "../../../lib/scan-codes";
import { withDbScope } from "../../../lib/db";
import { currentUser, database, ensureDatabase, json } from "../../../lib/runtime-db";

async function all<T>(sql: string, ...bindings: unknown[]) {
  const result = await database().prepare(sql).bind(...bindings).all<T>();
  return result.results ?? [];
}

function pdfResponse(bytes: Uint8Array, filename: string, disposition: "attachment" | "inline" = "attachment") {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${filename.replace(/[^a-zA-Z0-9_.-]/g, "-")}"`,
      "Cache-Control": "no-store",
    },
  });
}

function dateTime(value: string) {
  return value ? new Date(value).toLocaleString("it-IT") : "-";
}

function dateOnly(value: string) {
  return value ? new Date(value).toLocaleDateString("it-IT") : "-";
}

async function getImpl(request: Request) {
  await ensureDatabase();
  const user = await currentUser(request);
  if (!user || user.mustChangePassword) return json({ error: "Sessione scaduta o cambio password obbligatorio." }, 401);
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "";
  const id = Number(url.searchParams.get("id"));
  if (!Number.isFinite(id) || id <= 0) return json({ error: "Documento non valido." }, 400);

  if (type === "receipt" || type === "courtesy" || type === "fiscal-receipt") {
    const sale = await database().prepare(`SELECT s.id, s.receipt_no AS receiptNo, s.store, s.total, s.cash_amount AS cashAmount, s.card_amount AS cardAmount, s.bank_amount AS bankAmount, s.gift_amount AS giftAmount, s.fiscal_document_type AS fiscalDocumentType, s.created_at AS createdAt, COALESCE(CASE WHEN c.customer_type = 'company' THEN c.company_name ELSE TRIM(c.first_name || ' ' || c.last_name) END, 'Cliente non associato') AS customerName FROM sales s LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id = ?`).bind(id).first<{ id: number; receiptNo: string; store: string; total: number; cashAmount: number; cardAmount: number; bankAmount: number; giftAmount: number; fiscalDocumentType: string; createdAt: string; customerName: string }>();
    if (!sale) return json({ error: "Vendita non trovata." }, 404);
    if (user.role !== "admin" && sale.store !== user.store) return json({ error: "Documento non disponibile per questa cassa." }, 403);
    if (type === "fiscal-receipt" && (sale.bankAmount <= 0 || sale.fiscalDocumentType !== "receipt")) return json({ error: "Scontrino fiscale automatico non disponibile per questa vendita." }, 404);
    const items = await all<{ description: string; quantity: number; unitPrice: number; lineTotal: number }>(`SELECT description, quantity, unit_price AS unitPrice, line_total AS lineTotal FROM sale_items WHERE sale_id = ? ORDER BY id`, id);
    // Sullo scontrino di cortesia i prezzi sono nascosti per impostazione predefinita:
    // il prezzo pagato resta leggibile solo scansionando il codice a barre in fondo.
    // Con `prices=1` la cassa puo comunque stamparlo con gli importi in chiaro.
    const hidePrices = type === "courtesy" && url.searchParams.get("prices") !== "1";
    const fields: PdfField[] = [
      { label: "Rif. acquisto", value: sale.receiptNo },
      { label: "Data", value: dateTime(sale.createdAt) },
      { label: "Cliente", value: sale.customerName },
      { label: "Punto vendita", value: sale.store },
    ];
    const table = hidePrices
      ? {
          headers: ["Articolo", "Quantita"],
          x: [60, 535],
          align: ["l", "r"] as ("l" | "r")[],
          rows: items.map((item) => [item.description, String(item.quantity)]),
        }
      : {
          headers: ["Articolo", "Qta", "Prezzo", "Totale"],
          x: [60, 400, 465, 535],
          align: ["l", "r", "r", "r"] as ("l" | "r")[],
          rows: items.map((item) => [item.description, String(item.quantity), euro(item.unitPrice), euro(item.lineTotal)]),
        };
    const payments = hidePrices
      ? []
      : ([
          { label: "Contanti", value: sale.cashAmount },
          { label: "Carta", value: sale.cardAmount },
          { label: "Bonifico", value: sale.bankAmount },
          { label: "Buono regalo", value: sale.giftAmount },
        ] as const).filter((payment) => payment.value > 0).map((payment) => ({ label: payment.label, value: euro(payment.value) }));
    const totals = hidePrices ? undefined : [...payments, { label: "Totale", value: euro(sale.total), strong: true }];
    const note = hidePrices
      ? "Prezzi omessi. Presentare questo promemoria al punto vendita: scansionando il codice a barre la cassa rivede la transazione completa."
      : type === "courtesy"
        ? "Documento di cortesia senza valore fiscale."
        : type === "fiscal-receipt"
          ? "Scontrino generato automaticamente per incasso tramite bonifico bancario."
          : "Ristampa interna di una vendita gia effettuata.";
    const title = type === "courtesy" ? "Scontrino di cortesia" : type === "fiscal-receipt" ? "Scontrino fiscale" : "Scontrino interno";
    // Code 128 col numero scontrino: scansionandolo la cassa richiama la vendita
    // intera (righe, sconti, pagamenti), non il solo importo. Si codificano sole
    // lettere e cifre perche la pistola traduce male i segni di punteggiatura;
    // sotto le barre resta stampato il numero vero, col trattino.
    const saleBarcode = { value: compactCode(sale.receiptNo), label: sale.receiptNo, kind: "code128" as const, caption: "SCANSIONARE IN CASSA PER RIVEDERE TUTTA LA TRANSAZIONE" };
    return pdfResponse(createPdf({ title, store: sale.store, note, fields, table, totals, barcode: saleBarcode }), `${type}-${sale.receiptNo}.pdf`);
  }

  if (type === "gift") {
    const gift = await database().prepare(`SELECT code, beneficiary, initial_value AS initialValue, balance, expires_at AS expiresAt, store, created_at AS createdAt FROM gift_cards WHERE id = ?`).bind(id).first<{ code: string; beneficiary: string; initialValue: number; balance: number; expiresAt: string; store: string; createdAt: string }>();
    if (!gift) return json({ error: "Buono non trovato." }, 404);
    if (user.role !== "admin" && gift.store !== user.store) return json({ error: "Documento non disponibile per questa cassa." }, 403);
    return pdfResponse(createPdf({
      title: "Buono regalo",
      store: gift.store,
      note: "UN REGALO PER LA TUA PROSSIMA AVVENTURA",
      noteAlign: "center",
      highlight: { caption: "Valore del buono", value: euro(gift.initialValue), rounded: true },
      fields: [
        { label: "Destinatario", value: gift.beneficiary, full: true },
        { label: "Codice buono", value: gift.code },
        { label: "Emissione", value: dateOnly(gift.createdAt) },
        { label: "Valido fino al", value: gift.expiresAt ? dateOnly(gift.expiresAt) : "Nessuna scadenza" },
        { label: "Saldo attuale", value: euro(gift.balance) },
        { label: "Emesso da", value: gift.store, full: true },
      ],
      barcode: { value: gift.code, caption: "CODICE BUONO - PRESENTARE ALLA CASSA" },
    }), `buono-${gift.code}.pdf`);
  }

  if (type === "reservation") {
    const reservation = await database().prepare(`SELECT r.id, r.code, r.store, r.description, r.kind, r.total_price AS totalPrice, r.deposit_amount AS depositAmount, r.balance_due AS balanceDue, r.status, r.expected_delivery AS expectedDelivery, r.created_at AS createdAt, COALESCE(CASE WHEN c.customer_type = 'company' THEN c.company_name ELSE TRIM(c.first_name || ' ' || c.last_name) END, 'Cliente non associato') AS customerName, COALESCE(c.phone, '') AS customerPhone FROM reservations r LEFT JOIN customers c ON c.id = r.customer_id WHERE r.id = ?`).bind(id).first<{ id: number; code: string; store: string; description: string; kind: string; totalPrice: number; depositAmount: number; balanceDue: number; status: string; expectedDelivery: string; createdAt: string; customerName: string; customerPhone: string }>();
    if (!reservation) return json({ error: "Prenotazione non trovata." }, 404);
    if (user.role !== "admin" && reservation.store !== user.store) return json({ error: "Documento non disponibile per questa cassa." }, 403);
    const items = await all<{ description: string; quantity: number; unitPrice: number; discountPercent: number }>(`SELECT description, quantity, unit_price AS unitPrice, discount_percent AS discountPercent FROM reservation_items WHERE reservation_id = ? ORDER BY id`, reservation.id);
    const repair = reservation.kind === "repair";
    const fields: PdfField[] = [
      { label: repair ? "Rif. lavorazione" : "Rif. pratica", value: reservation.code },
      { label: "Cliente", value: `${reservation.customerName}${reservation.customerPhone ? ` - ${reservation.customerPhone}` : ""}` },
    ];
    if (!items.length) fields.push({ label: repair ? "Calzatura" : "Articolo", value: reservation.description, full: true });
    fields.push(
      { label: repair ? "Presa in carico" : "Data pratica", value: dateOnly(reservation.createdAt) },
      { label: repair ? "Consegna prevista" : "Ritiro previsto", value: reservation.expectedDelivery ? dateOnly(reservation.expectedDelivery) : "Da concordare" },
      { label: repair ? "Preventivo" : "Prezzo totale", value: euro(reservation.totalPrice) },
      { label: "Acconto ricevuto", value: euro(reservation.depositAmount) },
      { label: "Stato", value: reservation.status },
      { label: "Punto vendita", value: reservation.store },
    );
    const table = items.length
      ? {
          headers: [repair ? "Lavorazione" : "Articolo", "Qta", "Prezzo", "Sconto", "Totale"],
          x: [60, 372, 428, 476, 535],
          align: ["l", "r", "r", "r", "r"] as ("l" | "r")[],
          rows: items.map((item) => [item.description, String(item.quantity), euro(item.unitPrice), item.discountPercent > 0 ? `${item.discountPercent}%` : "-", euro(item.quantity * item.unitPrice * (1 - item.discountPercent / 100))]),
        }
      : undefined;
    return pdfResponse(createPdf({
      title: repair ? "Ricevuta risuolatura" : "Prenotazione con acconto",
      store: reservation.store,
      note: repair ? "Lavorazione soggetta alla verifica tecnica del laboratorio." : "Promemoria della pratica: presentare questo documento al ritiro.",
      highlight: { value: `${repair ? "SALDO PREVISTO" : "SALDO RESIDUO"} - ${euro(reservation.balanceDue)}` },
      fields,
      table,
      barcode: { value: reservation.code, caption: "SCANSIONARE IN CASSA PER RICHIAMARE E SALDARE" },
    }), `${repair ? "risuolatura" : "prenotazione"}-${reservation.code}.pdf`);
  }

  if (type === "ddt") {
    const transfer = await database().prepare(`SELECT id, code, from_store AS fromStore, to_store AS toStore, sender, receiver, carrier, transport_reason AS transportReason, created_at AS createdAt FROM transfers WHERE id = ?`).bind(id).first<{ id: number; code: string; fromStore: string; toStore: string; sender: string; receiver: string; carrier: string; transportReason: string; createdAt: string }>();
    if (!transfer) return json({ error: "Trasferimento non trovato." }, 404);
    if (user.role !== "admin" && transfer.fromStore !== user.store) return json({ error: "Documento non disponibile per questa cassa." }, 403);
    const items = await all<{ sku: string; name: string; color: string; size: string; quantity: number }>(`SELECT p.sku, p.name, p.color, p.size, ti.quantity FROM transfer_items ti JOIN products p ON p.id = ti.product_id WHERE ti.transfer_id = ?`, id);
    return pdfResponse(createPdf({
      title: "Documento di trasporto",
      store: transfer.fromStore,
      note: "Trasferimento merce fra punti vendita.",
      fields: [
        { label: "Numero DDT", value: transfer.code },
        { label: "Data", value: dateTime(transfer.createdAt) },
        { label: "Mittente", value: transfer.sender || transfer.fromStore },
        { label: "Ricevente", value: transfer.receiver || transfer.toStore },
        { label: "Vettore", value: transfer.carrier || "Mezzo proprio" },
        { label: "Causale", value: transfer.transportReason },
        { label: "Da", value: transfer.fromStore },
        { label: "A", value: transfer.toStore },
      ],
      table: {
        headers: ["Codice", "Articolo", "Quantita"],
        x: [60, 180, 535],
        align: ["l", "l", "r"] as ("l" | "r")[],
        rows: items.map((item) => [item.sku, `${item.name} ${item.color ?? ""} ${item.size ?? ""}`.trim(), String(item.quantity)]),
      },
      footer: "DOCUMENTO DI TRASPORTO - COPIA NON FISCALE",
    }), `DDT-${transfer.code}.pdf`);
  }

  if (type === "document") {
    if (user.role !== "admin") return json({ error: "Funzione riservata all'amministratore." }, 403);
    const document = await database().prepare(`SELECT id, number, type, recipient, recipient_vat_number AS recipientVatNumber, recipient_pec AS recipientPec, recipient_sdi_code AS recipientSdiCode, recipient_address AS recipientAddress, recipient_postal_code AS recipientPostalCode, recipient_city AS recipientCity, recipient_province AS recipientProvince, origin, payment_method AS paymentMethod, net_total AS netTotal, tax_total AS taxTotal, total, created_at AS createdAt FROM business_documents WHERE id = ?`).bind(id).first<{ id: number; number: string; type: string; recipient: string; recipientVatNumber: string; recipientPec: string; recipientSdiCode: string; recipientAddress: string; recipientPostalCode: string; recipientCity: string; recipientProvince: string; origin: string; paymentMethod: string; netTotal: number; taxTotal: number; total: number; createdAt: string }>();
    if (!document) return json({ error: "Documento non trovato." }, 404);
    const items = await all<{ description: string; quantity: number; unitPrice: number; lineTotal: number; taxRate: number; taxAmount: number; grossTotal: number }>(`SELECT description, quantity, unit_price AS unitPrice, line_total AS lineTotal, tax_rate AS taxRate, tax_amount AS taxAmount, gross_total AS grossTotal FROM business_document_items WHERE document_id = ? ORDER BY id`, id);
    const location = [document.recipientPostalCode, document.recipientCity, document.recipientProvince].filter(Boolean).join(" ");
    const invoice = document.type === "invoice";
    const fields: PdfField[] = [
      { label: invoice ? "Numero fattura" : "Numero preventivo", value: document.number },
      { label: "Data", value: dateOnly(document.createdAt) },
      { label: "Destinatario", value: document.recipient, full: true },
    ];
    if (document.recipientVatNumber) fields.push({ label: "P.IVA destinatario", value: document.recipientVatNumber });
    if (document.recipientSdiCode) fields.push({ label: "Codice SDI", value: document.recipientSdiCode });
    const address = [document.recipientAddress, location].filter(Boolean).join(" - ");
    if (address) fields.push({ label: "Indirizzo", value: address, full: true });
    if (document.recipientPec) fields.push({ label: "PEC", value: document.recipientPec });
    fields.push(
      { label: "Pagamento", value: document.paymentMethod === "bank" ? "Bonifico bancario" : document.paymentMethod === "card" ? "Carta" : "Contanti" },
      { label: "Origine merce", value: document.origin, full: true },
    );
    const table = {
      headers: ["Descrizione", "Qta", "Prezzo", "IVA%", "Totale"],
      x: [60, 372, 428, 476, 535],
      align: ["l", "r", "r", "r", "r"] as ("l" | "r")[],
      rows: items.map((item) => [item.description, String(item.quantity), euro(item.unitPrice), `${item.taxRate}%`, euro(item.grossTotal)]),
    };
    const totals = [
      { label: "Imponibile", value: euro(document.netTotal) },
      { label: "IVA", value: euro(document.taxTotal) },
      { label: "Totale documento", value: euro(document.total), strong: true },
    ];
    const disposition = url.searchParams.get("inline") === "1" ? "inline" : "attachment";
    return pdfResponse(createPdf({
      title: invoice ? "Fattura" : "Preventivo",
      note: "Prezzi unitari e imponibili indicati IVA esclusa.",
      fields,
      table,
      totals,
      footer: invoice ? "DOCUMENTO FISCALE" : "PREVENTIVO - DOCUMENTO NON FISCALE",
    }), `${document.number}.pdf`, disposition);
  }
  return json({ error: "Tipo di documento non disponibile." }, 404);
}

export const GET = (request: Request) => withDbScope(() => getImpl(request));
