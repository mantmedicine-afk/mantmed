import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Download, Printer, Wallet, FileText } from "lucide-react";
import { api, errMsg, eur } from "@/lib/api";
import { METHODS, methodLabel } from "./CashPanel";

const todayLocal = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });

export const CashRegister = ({ refreshKey }) => {
  const [day, setDay] = useState(todayLocal());
  const [data, setData] = useState({ items: [], summary: null });
  const load = useCallback(() => {
    api.payments({ start: day, end: day }).then(setData).catch(() => setData({ items: [], summary: null }));
  }, [day]);
  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const s = data.summary;
  const exportCsv = async () => {
    try { await api.exportPayments({ start: day, end: day }); toast.success("Registro esportato in CSV"); } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <section className="mx-auto max-w-[1440px] px-5 pb-10 lg:px-8" data-testid="cash-register">
      <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }} transition={{ duration: 0.6 }}>
        <div className="flex flex-col gap-4 border-t border-slate-200 pt-8 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-slate-500"><Wallet size={13} /> Registro cassa rapido</div>
            <h2 className="mt-1 font-display text-4xl text-night">Riepilogo <span className="italic text-slate-500">giornaliero</span></h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <input type="date" value={day} max={todayLocal()} onChange={(e) => setDay(e.target.value || todayLocal())} className="h-11 rounded-full border border-slate-200 bg-white px-4 text-sm text-night outline-none focus:border-night" data-testid="cash-day-input" />
            <button onClick={() => { document.body.classList.add("print-cash"); window.print(); document.body.classList.remove("print-cash"); }} className="flex h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-night hover:border-night" data-testid="cash-print-btn"><Printer size={15} /> Stampa</button>
            <button onClick={exportCsv} className="flex h-11 items-center gap-2 rounded-full bg-night px-5 text-sm font-medium text-white transition-transform hover:-translate-y-0.5" data-testid="cash-export-btn"><Download size={15} /> Esporta per il commercialista</button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="cash-summary">
          <div className="grain relative overflow-hidden rounded-3xl bg-night p-5 text-white">
            <div className="relative text-[11px] uppercase tracking-[0.2em] text-[#C9CCD3]">Totale incassato</div>
            <div className="relative mt-2 font-display text-5xl leading-none" data-testid="cash-total">{eur(s?.total)}</div>
            <div className="relative mt-2 text-xs text-slate-300">{s?.count ?? 0} movimenti · {new Date(`${day}T12:00:00`).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</div>
          </div>
          {METHODS.map(({ id, label, icon: Icon }) => {
            const m = s?.by_method?.find((x) => x.method === id);
            const pct = s?.total ? Math.round(((m?.total ?? 0) / s.total) * 100) : 0;
            return (
              <div key={id} className="rounded-3xl border border-slate-200 bg-white p-5" data-testid={`cash-method-total-${id}`}>
                <div className="flex items-center justify-between text-sm text-slate-600"><span className="flex min-w-0 items-center gap-2"><Icon size={16} className="shrink-0 text-night" /> <span className="truncate">{label}</span></span><span className="font-mono text-xs">{m?.count ?? 0}</span></div>
                <div className="mt-2 font-display text-4xl text-night">{eur(m?.total)}</div>
                <div className="mt-3 h-1.5 rounded-full bg-[#ECEDEF]"><motion.div className="h-full rounded-full bg-night" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }} /></div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_2.2fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Per studio</div>
            {(s?.by_clinic ?? []).map((c) => (
              <div key={c.clinic} className="mt-3 flex items-center justify-between border-b border-slate-100 pb-3 text-sm last:border-0" data-testid={`cash-clinic-${c.clinic.toLowerCase().replace(/\s+/g, "-")}`}>
                <span className="text-night">{c.clinic} <span className="text-xs text-slate-500">· {c.count}</span></span>
                <span className="font-mono text-night">{eur(c.total)}</span>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white" data-testid="cash-movements">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-night text-[11px] uppercase tracking-[0.14em] text-white">
                <tr>{["Ora", "Paziente", "Prestazione", "Studio", "Metodo", "Importo", ""].map((h, i) => <th key={i} className={`px-4 py-2.5 font-semibold ${h === "Importo" ? "text-right" : ""}`}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {data.items.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Nessun incasso registrato in questa giornata.</td></tr>}
                {data.items.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100 text-night" data-testid={`cash-row-${p.id}`}>
                    <td className="px-4 py-2.5 font-mono text-xs">{new Date(p.created_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="px-4 py-2.5 font-medium">{p.patient_name}</td>
                    <td className="px-4 py-2.5 text-slate-600">{p.service}</td>
                    <td className="px-4 py-2.5 text-slate-600">{p.clinic || "—"}</td>
                    <td className="px-4 py-2.5">{methodLabel(p.method)}</td>
                    <td className={`px-4 py-2.5 text-right font-mono ${p.amount < 0 ? "text-rose-700" : ""}`}>{eur(p.amount)}</td>
                    <td className="px-4 py-2.5 text-right">{p.receipt_no && !p.refund_of && (
                      <button onClick={() => api.doctorReceipt(p.id).catch((e) => toast.error(errMsg(e)))} className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-night underline-offset-4 hover:underline" data-testid={`cash-receipt-${p.id}`}><FileText size={13} /> Ricevuta {p.receipt_no}</button>
                    )}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>
    </section>
  );
};
