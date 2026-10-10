"use client";

/**
 * Cancello di licenza. Avvolge l'app: controlla la licenza all'avvio e, SOLO se
 * risulta scaduta, mostra una schermata di blocco al posto del gestionale.
 *
 * Quando la licenza e' valida (o lo stato e' sconosciuto, es. rete assente) non
 * mostra nulla di suo: l'utente vede il gestionale normale, senza alcun avviso.
 */
import { useEffect, useState } from "react";
import { controllaLicenza } from "../lib/licenza";

export default function LicenseGate({ children }: { children: React.ReactNode }) {
  const [bloccato, setBloccato] = useState(false);

  useEffect(() => {
    let attivo = true;
    controllaLicenza().then((r) => {
      if (attivo) setBloccato(r.stato === "scaduta");
    });
    return () => {
      attivo = false;
    };
  }, []);

  if (bloccato) {
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          padding: "2rem",
          textAlign: "center",
          background: "#05090c",
          color: "#e6edf3",
          fontFamily: "var(--font-manrope), system-ui, sans-serif",
        }}
      >
        <h1 style={{ fontSize: "1.4rem", margin: 0 }}>Licenza scaduta</h1>
        <p style={{ margin: 0, opacity: 0.8, maxWidth: "28rem" }}>
          Il gestionale è temporaneamente bloccato. Contatta lo sviluppatore per
          riattivarlo.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
