import { eur } from "@/lib/api";

const Row = ({ label, value, strong, testid }) => (
  <div className={`flex items-center justify-between py-1.5 text-sm ${strong ? "border-t border-[var(--hair)] pt-2.5 font-semibold text-[var(--fg)]" : "text-[var(--fg2)]"}`}>
    <span>{label}</span><span className="font-mono" data-testid={testid}>{value}</span>
  </div>
);

export const InvoiceTotals = ({ t, clientType }) => {
  if (!t) return null;
  const forf = t.regime === "forfettario";
  return (
    <div className="rounded-2xl bg-[var(--raised)] p-4" data-testid="invoice-totals">
      <Row label={forf ? "Non soggetto IVA (forfettario)" : "Esente art. 10 n. 18"} value={eur(t.esente)} testid="invoice-total-esente" />
      {!forf && <Row label="Imponibile IVA 22%" value={eur(t.imponibile)} testid="invoice-total-imponibile" />}
      {!forf && <Row label="IVA 22%" value={eur(t.iva)} testid="invoice-total-iva" />}
      {t.stamp > 0 && <Row label={`Bollo 2 € (${t.stamp_charge === "paziente" ? "a carico del paziente" : "a carico del medico"})`} value={t.stamp_charge === "paziente" ? eur(t.stamp) : "—"} testid="invoice-total-stamp" />}
      <Row label="Totale fattura" value={eur(t.total)} strong testid="invoice-total" />
      {t.ritenuta > 0 && <><Row label="Ritenuta d'acconto 20%" value={`- ${eur(t.ritenuta)}`} testid="invoice-total-ritenuta" /><Row label="Netto a pagare" value={eur(t.due)} strong testid="invoice-total-due" /></>}
      <p className="mt-2 text-xs text-[var(--fg2)]" data-testid="invoice-regime-note">
        {forf ? "Regime forfettario: in fattura la dicitura obbligatoria e \"operazione non soggetta a ritenuta\"." : clientType === "azienda" ? "Regime ordinario: ritenuta d'acconto del 20% perché il cliente è un'azienda o un ente." : "Regime ordinario: nessuna ritenuta verso le persone fisiche."}
      </p>
    </div>
  );
};
