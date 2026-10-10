"use client";

/**
 * Controllo licenza del gestionale.
 *
 * Legge la data di scadenza da un progetto Supabase SEPARATO (account dello
 * sviluppatore), diverso da quello dei dati. La chiave e' la anon pubblica: puo'
 * solo leggere (vedi supabase/licenza.sql), quindi dal browser non si puo'
 * cambiare la scadenza.
 *
 * Fail-open: se il progetto licenze non e' configurato o non e' raggiungibile,
 * lo stato e' "sconosciuto" e il gestionale NON viene bloccato. Cosi' un problema
 * di rete non ferma per sbaglio il negozio: si blocca solo su una scadenza certa.
 */
import { createClient } from "@supabase/supabase-js";

const CLIENTE = "marinelli";

export type StatoLicenza =
  | { stato: "valida"; scadenza: Date }
  | { stato: "scaduta"; scadenza: Date }
  | { stato: "sconosciuto" };

export async function controllaLicenza(): Promise<StatoLicenza> {
  const url = process.env.NEXT_PUBLIC_LICENSE_URL;
  const key = process.env.NEXT_PUBLIC_LICENSE_ANON_KEY;
  if (!url || !key) return { stato: "sconosciuto" };

  try {
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await sb
      .from("licenze")
      .select("valid_until")
      .eq("cliente", CLIENTE)
      .single();

    if (error || !data) return { stato: "sconosciuto" };

    const scadenza = new Date(data.valid_until as string);
    if (Number.isNaN(scadenza.getTime())) return { stato: "sconosciuto" };

    return scadenza.getTime() > Date.now()
      ? { stato: "valida", scadenza }
      : { stato: "scaduta", scadenza };
  } catch {
    return { stato: "sconosciuto" };
  }
}
