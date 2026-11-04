import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Plus, ReceiptText } from "lucide-react";
import { api, eur } from "@/lib/api";
import { InvoiceList } from "./InvoiceList";
import { ClinicFilter, Kicker, btnMain } from "./ui";

const LABELS = { today: "Oggi", month: "Questo mese", year: "Quest'anno" };

const StatCard = ({ k, s, i }) => (
  <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} className={`grain relative overflow-hidden rounded-3xl p-5 ${i === 0 ? "bg-[var(--accent)] text-[var(--ink)]" : "border border-[var(--hair)] bg-[var(--surface)] text-[var(--fg)]"}`} data-testid={`cash-stat-${k}`}>
    <div className="relative text-[11px] uppercase tracking-[0.2em] opacity-70">Incassi · {LABELS[k]}</div>
    <div className="relative mt-2 font-display text-5xl leading-none" data-testid={`cash-stat-${k}-total`}>{eur(s?.total)}</div>
    <div className="relative mt-4 space-y-1.5">
      {(s?.by_clinic ?? []).filter((c) => c.clinic !== "Altro" || c.total).map((c) => (
        <div key={c.clinic} className="flex items-center justify-between text-sm" data-testid={`cash-stat-${k}-${c.clinic.toLowerCase().replace(/\s+/g, "-")}`}>
          <span className="opacity-75">{c.clinic === "Altro" ? "Senza studio" : c.clinic}</span><span className="font-mono">{eur(c.total)}</span>
        </div>
      ))}
    </div>
  </motion.div>
);

export const CashHome = ({ refreshKey, onNew, onChange }) => {
  const [clinic, setClinic] = useState("");
  const [data, setData] = useState(null);
  const load = useCallback(() => api.cashOverview(clinic).then(setData).catch(() => setData(null)), [clinic]);
  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <div className="space-y-6" data-testid="cash-home">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">{["today", "month", "year"].map((k, i) => <StatCard key={k} k={k} i={i} s={data?.stats?.[k]} />)}</div>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <Kicker icon={ReceiptText}>Fatture recenti</Kicker>
          {data?.to_collect?.count > 0 && <p className="mt-1 text-sm text-[var(--alert)]" data-testid="cash-to-collect">{data.to_collect.count} da incassare · {eur(data.to_collect.total)}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ClinicFilter clinics={data?.clinics ?? []} value={clinic} onChange={setClinic} />
          <button onClick={onNew} className={btnMain} data-testid="cash-new-invoice-btn"><Plus size={16} /> Nuova fattura</button>
        </div>
      </div>
      <InvoiceList items={data?.recent ?? []} onChange={() => { load(); onChange?.(); }} empty="Nessuna fattura: crei la prima da una visita o con «Nuova fattura»." />
    </div>
  );
};
