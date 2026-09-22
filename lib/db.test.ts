import { describe, expect, it } from "vitest";
import { translateSql } from "./db";

describe("translateSql JSON SQLite -> Postgres", () => {
  it("traduce i ticket fiscali memorizzati nel payload", () => {
    const { text } = translateSql(
      "SELECT id FROM fiscal_jobs WHERE json_extract(payload, '$.localTicketHash') = ? AND json_extract(payload, '$.localTicketExpiresAt') > ?",
    );

    expect(text).toBe(
      "SELECT id FROM fiscal_jobs WHERE (payload::jsonb ->> 'localTicketHash') = ? AND (payload::jsonb ->> 'localTicketExpiresAt') > ?",
    );
  });

  it("traduce colonne qualificate e mantiene validi i CAST", () => {
    const { text } = translateSql(
      "SELECT CAST(json_extract(si.metadata, '$.originalSaleItemId') AS INTEGER) AS originalId FROM sale_items si",
    );

    expect(text).toBe(
      "SELECT CAST((si.metadata::jsonb ->> 'originalSaleItemId') AS INTEGER) AS \"originalId\" FROM sale_items si",
    );
  });
});
