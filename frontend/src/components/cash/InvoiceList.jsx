import { toast } from "sonner";
import { FileText, FileCode2, CheckCircle2, XCircle } from "lucide-react";
import { api, errMsg, eur } from "@/lib/api";
import { methodLabel } from "@/components/dash/CashPanel";
import { Badge, fmtDate } from "./ui";

const act = "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium text-[var(--fg)] transition-colors hover:bg-[var(--raised)]";

const Actions = ({ i, onChange }) => {
  const run = (fn, ok) => fn().then((r) => { if (ok) toast.success(ok); if (r?.id) onChange?.(); }).catch((e) => toast.error(errMsg(e)));
  return (
    <div className="flex justify-end gap-1">
      <button onClick={() => run(() => api.invoicePdf(i.id))} className={act} data-testid={`invoice-pdf-${i.id}`}><FileText size={13} /> PDF</button>
      {i.client_type === "azienda" && <button onClick={() => run(() => api.invoiceXml(i.id))} className={act} data-testid={`invoice-xml-${i.id}`}><FileCode2 size={13} /> XML SdI</button>}
      {i.status === "da_incassare" && <button onClick={() => run(() => api.payInvoice(i.id), "Fattura segnata come pagata")} className={act} data-testid={`invoice-pay-${i.id}`}><CheckCircle2 size={13} /> Incassata</button>}
      {i.status !== "annullata" && !(i.legacy && i.method === "online") && <button onClick={() => window.confirm(`Annullare la fattura ${i.number ?? ""}? Il numero resta occupato.`) && run(() => api.cancelInvoice(i.id), "Fattura annullata")} className={`${act} text-[var(--fg2)] hover:text-[var(--alert)]`} data-testid={`invoice-cancel-${i.id}`}><XCircle size={13} /> Annulla</button>}
    </div>
  );
};

export const InvoiceList = ({ items, onChange, empty = "Nessuna fattura." }) => (
  <div className="overflow-x-auto rounded-3xl border border-[var(--hair)] bg-[var(--surface)]" data-testid="invoice-list">
    <table className="w-full min-w-[820px] text-left text-sm">
      <thead className="bg-[var(--accent)] text-[11px] uppercase tracking-[0.14em] text-[var(--ink)]">
        <tr>{["N.", "Data", "Intestatario", "Paziente", "Studio", "Metodo", "Totale", "Stato", ""].map((h, k) => <th key={k} className={`px-4 py-2.5 font-semibold ${h === "Totale" ? "text-right" : ""}`}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {items.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-[var(--fg2)]" data-testid="invoice-list-empty">{empty}</td></tr>}
        {items.map((i) => (
          <tr key={i.id} className="border-t border-[var(--hair)] text-[var(--fg)]" data-testid={`invoice-row-${i.id}`}>
            <td className="px-4 py-2.5 font-mono text-xs" data-testid={`invoice-number-${i.id}`}>{i.number ?? "s.n."}</td>
            <td className="px-4 py-2.5 font-mono text-xs">{fmtDate(i.date)}</td>
            <td className="px-4 py-2.5 font-medium">{i.payer}{i.client_type === "azienda" && <span className="ml-1.5 text-[10px] uppercase tracking-wider text-[var(--fg2)]">{i.sdi_status ? "SdI · simulazione" : "azienda"}</span>}</td>
            <td className="px-4 py-2.5 text-[var(--fg2)]">{i.patient_name}</td>
            <td className="px-4 py-2.5 text-[var(--fg2)]">{i.clinic || "—"}</td>
            <td className="px-4 py-2.5">{methodLabel(i.method)}</td>
            <td className="px-4 py-2.5 text-right font-mono" data-testid={`invoice-total-${i.id}`}>{eur(i.totals.due)}</td>
            <td className="px-4 py-2.5"><Badge status={i.status} testid={`invoice-status-${i.id}`} /></td>
            <td className="px-4 py-2.5"><Actions i={i} onChange={onChange} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
