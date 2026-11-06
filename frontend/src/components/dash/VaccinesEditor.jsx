import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Syringe, Plus, Trash2 } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { DateInput } from "@/components/ui/it-date";

const box = "rounded-3xl border border-[var(--hair)] bg-[var(--surface)] p-5 lg:col-span-2";
const inp = "h-10 rounded-xl border border-[var(--hair)] bg-[var(--surface)] px-3 text-sm text-[var(--fg)] outline-none focus:border-[var(--accent)]";
const today = () => new Date().toISOString().slice(0, 10);

/** Scheda paziente: vaccinazioni eseguite (alimentano il Passaporto sanitario del genitore). */
export const VaccinesEditor = ({ patientId }) => {
  const [cal, setCal] = useState([]);
  const [v, setV] = useState(null);
  const [f, setF] = useState({ code: "esa", name: "", dose: 1, date: today() });
  const load = useCallback(() => api.vaccinations(patientId).then(setV).catch((e) => toast.error(errMsg(e))), [patientId]);
  useEffect(() => { load(); api.vaccineCalendar().then(setCal).catch(() => setCal([])); }, [load]);
  const add = async () => {
    try { await api.addVaccination(patientId, { ...f, dose: Number(f.dose) }); toast.success("Vaccinazione registrata nel passaporto"); setF((x) => ({ ...x, name: "" })); load(); } catch (e) { toast.error(errMsg(e)); }
  };
  const [ask, setAsk] = useState("");
  const del = async (id) => { if (ask !== id) return setAsk(id); setAsk(""); try { await api.deleteVaccination(id); toast.success("Vaccinazione eliminata"); load(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <section className={box} data-testid="vaccines-editor">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-[var(--fg2)]"><Syringe size={14} /> Vaccinazioni</div>
      <div className="mt-3 flex flex-wrap gap-2">
        <select value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} className={`${inp} min-w-[220px] flex-1`} data-testid="vaccine-code-select">
          {cal.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}<option value="altro">Altro vaccino…</option>
        </select>
        {f.code === "altro" && <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Nome del vaccino" className={inp} data-testid="vaccine-name-input" />}
        <input type="number" min={1} max={10} value={f.dose} onChange={(e) => setF({ ...f, dose: e.target.value })} className={`${inp} w-20`} aria-label="Dose" data-testid="vaccine-dose-input" />
        <DateInput max={today()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className={inp} data-testid="vaccine-date-input" />
        <button onClick={add} className="flex h-10 items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 text-sm font-medium text-[var(--ink)]" data-testid="vaccine-add-btn"><Plus size={14} /> Registra</button>
      </div>
      <ul className="mt-3 divide-y divide-[var(--sel)] text-sm" data-testid="vaccines-list">
        {(v?.done ?? []).map((x) => (
          <li key={x.id} className="flex items-center justify-between gap-3 py-2" data-testid={`vaccine-row-${x.id}`}>
            <span><b>{x.name}</b> · dose {x.dose} · {new Date(`${x.date}T12:00:00`).toLocaleDateString("it-IT")}<span className="text-[var(--fg2)]"> · {x.by}</span></span>
            {ask === x.id ? <button onClick={() => del(x.id)} className="h-9 rounded-full bg-[var(--alert)] px-3 text-xs font-semibold text-[var(--ink)]" data-testid={`vaccine-delete-confirm-${x.id}`}>Confermi eliminazione</button>
              : <button onClick={() => del(x.id)} className="grid h-9 w-9 place-items-center rounded-full text-[var(--fg2)] hover:text-[var(--alert)]" aria-label="Elimina" data-testid={`vaccine-delete-${x.id}`}><Trash2 size={15} /></button>}
          </li>
        ))}
        {v && !v.done.length && <li className="py-2 text-[var(--fg2)]">Nessuna vaccinazione registrata.</li>}
      </ul>
      {v?.upcoming?.length > 0 && <p className="mt-2 text-xs text-[var(--fg2)]" data-testid="vaccines-next">Prossime: {v.upcoming.map((x) => `${x.name} (dose ${x.dose}) dal ${new Date(`${x.due}T12:00:00`).toLocaleDateString("it-IT")}`).join(" · ")}</p>}
    </section>
  );
};
