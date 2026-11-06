import { useRef, useState } from "react";
import { toast } from "sonner";
import { Trash2, ChevronDown, ImagePlus, Loader2, X } from "lucide-react";
import { http, errMsg } from "@/lib/api";
import { TimeInput } from "@/components/ui/it-date";

const DAYS = [[1, "Lun"], [2, "Mar"], [3, "Mer"], [4, "Gio"], [5, "Ven"], [6, "Sab"], [7, "Dom"]];
export const PALETTE = ["#2F6F8F", "#B5651D", "#5A7D3A", "#8E4B7E", "#C0392B", "#3E5C9A", "#A07D1C", "#2E8B7A"];
export const METHODS = [["contanti", "Contanti"], ["carta", "Carta / Bancomat"], ["bonifico", "Bonifico"], ["pos", "POS"], ["online", "Online dal portale"]];
const inp = "h-10 rounded-xl border border-[var(--hair)] bg-[var(--surface)] px-3 text-sm text-[var(--fg)] outline-none focus:border-[var(--accent)]";
const small = "text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--fg2)]";

const Logo = ({ c, i, set }) => {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  if (!c.id) return <p className="text-xs text-[var(--fg2)]">Salvi il nuovo studio per caricare il logo.</p>;
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    try { const r = await http.post(`/settings/clinics/${c.id}/logo`, fd); set({ ...c, logo: r.data.logo }); toast.success("Logo caricato: comparirà sui nuovi documenti di questo studio"); }
    catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  const remove = async () => {
    try { await http.delete(`/settings/clinics/${c.id}/logo`); set({ ...c, logo: "" }); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="flex items-center gap-3">
      {c.logo ? <img src={`${process.env.REACT_APP_BACKEND_URL}/api/settings/clinics/${c.id}/logo?v=${encodeURIComponent(c.logo)}`} alt="Logo dello studio" className="h-14 w-14 rounded-xl border border-[var(--hair)] bg-white object-contain p-1" data-testid={`schedule-clinic-logo-img-${i}`} />
        : <div className="grid h-14 w-14 place-items-center rounded-xl border border-dashed border-[var(--hair)] text-[var(--fg2)]"><ImagePlus size={18} /></div>}
      <input ref={ref} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => upload(e.target.files?.[0])} data-testid={`schedule-clinic-logo-input-${i}`} />
      <button type="button" onClick={() => ref.current?.click()} disabled={busy} className="flex h-9 items-center gap-1.5 rounded-full border border-[var(--hair)] px-3 text-xs font-semibold text-[var(--fg)]" data-testid={`schedule-clinic-logo-btn-${i}`}>{busy && <Loader2 size={13} className="animate-spin" />}{c.logo ? "Cambia logo" : "Carica logo"}</button>
      {c.logo && <button type="button" onClick={remove} className="flex h-9 items-center gap-1 rounded-full px-2 text-xs text-[var(--fg2)] hover:text-[var(--alert)]" data-testid={`schedule-clinic-logo-remove-${i}`}><X size={13} /> Rimuovi</button>}
    </div>
  );
};

// Listino dello studio: eredita il listino generale; qui si cambia tariffa/durata o si toglie una prestazione
const PriceList = ({ c, i, services, set }) => {
  const over = c.prices ?? {};
  const upd = (sid, patch) => set({ ...c, prices: { ...over, [sid]: { ...(over[sid] ?? {}), ...patch } } });
  return (
    <div className="space-y-1.5" data-testid={`schedule-clinic-prices-${i}`}>
      {services.filter((s) => s.name.trim() && s.id).map((s, j) => {
        const o = over[s.id] ?? {};
        return (
          <div key={s.id} className={`grid grid-cols-[1fr_80px_90px_auto] items-center gap-2 text-sm ${o.off ? "opacity-50" : ""}`}>
            <span className="truncate text-[var(--fg)]">{s.name}</span>
            <input type="number" min={5} max={240} step={5} value={o.duration ?? ""} placeholder={`${s.duration}′`} onChange={(e) => upd(s.id, { duration: e.target.value ? Number(e.target.value) : null })} className={`${inp} w-full`} aria-label={`Durata ${s.name}`} data-testid={`schedule-clinic-dur-${i}-${j}`} />
            <input type="number" min={0} max={5000} step={1} value={o.price ?? ""} placeholder={`${s.price} €`} onChange={(e) => upd(s.id, { price: e.target.value === "" ? null : Number(e.target.value) })} className={`${inp} w-full`} aria-label={`Tariffa ${s.name}`} data-testid={`schedule-clinic-price-${i}-${j}`} />
            <label className="flex items-center gap-1 text-xs text-[var(--fg2)]"><input type="checkbox" checked={!o.off} onChange={(e) => upd(s.id, { off: !e.target.checked })} data-testid={`schedule-clinic-offered-${i}-${j}`} /> offerta</label>
          </div>
        );
      })}
      <p className="text-[11px] text-[var(--fg2)]">Campi vuoti = valori del listino generale. Le nuove prestazioni si personalizzano dopo il salvataggio; rinominarle non cambia le personalizzazioni.</p>
    </div>
  );
};

export const ClinicCard = ({ c, i, set, onRemove, services }) => {
  const [open, setOpen] = useState(false);
  const h = c.hours;
  const setH = (k, v) => set({ ...c, hours: { ...h, [k]: v } });
  const methods = c.methods ?? METHODS.map(([m]) => m);
  return (
    <div className="rounded-2xl border border-[var(--hair)] p-4" style={{ boxShadow: `inset 4px 0 0 ${c.color || PALETTE[i % PALETTE.length]}` }} data-testid={`schedule-clinic-${i}`}>
      <div className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[180px_1fr_auto]">
        <input value={c.name} onChange={(e) => set({ ...c, name: e.target.value })} placeholder="Nome studio" className={inp} data-testid={`schedule-clinic-name-${i}`} />
        <input value={c.address} onChange={(e) => set({ ...c, address: e.target.value })} placeholder="Indirizzo" className={`${inp} col-span-2 sm:col-span-1`} data-testid={`schedule-clinic-address-${i}`} />
        {onRemove && <button type="button" onClick={onRemove} className="row-start-1 grid h-10 w-10 place-items-center rounded-xl border border-[var(--hair)] text-[var(--fg2)] hover:text-[var(--alert)] sm:row-start-auto" aria-label="Rimuovi studio" data-testid={`schedule-clinic-remove-${i}`}><Trash2 size={15} /></button>}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {DAYS.map(([d, l]) => (
          <button key={d} type="button" onClick={() => setH("days", h.days.includes(d) ? h.days.filter((x) => x !== d) : [...h.days, d].sort())} aria-pressed={h.days.includes(d)} className={`h-9 w-11 rounded-full text-xs font-medium transition-colors ${h.days.includes(d) ? "bg-[var(--accent)] text-[var(--ink)]" : "border border-[var(--hair)] text-[var(--fg2)] hover:border-[var(--accent)]"}`} data-testid={`schedule-day-${i}-${d}`}>{l}</button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 text-sm text-[var(--fg2)]">
        dalle <TimeInput value={h.start} onChange={(e) => setH("start", e.target.value)} className={inp} data-testid={`schedule-start-${i}`} />
        alle <TimeInput value={h.end} onChange={(e) => setH("end", e.target.value)} className={inp} data-testid={`schedule-end-${i}`} />
      </div>
      <button type="button" onClick={() => setOpen((o) => !o)} className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-[var(--fg)]" aria-expanded={open} data-testid={`schedule-clinic-more-${i}`}>
        <ChevronDown size={15} className={`transition-transform ${open ? "rotate-180" : ""}`} /> Contatti, colore, intestazione, listino e pagamenti
      </button>
      {open && (
        <div className="mt-3 space-y-4" data-testid={`schedule-clinic-details-${i}`}>
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={c.phone ?? ""} onChange={(e) => set({ ...c, phone: e.target.value })} placeholder="Telefono dello studio" className={inp} data-testid={`schedule-clinic-phone-${i}`} />
            <input type="email" value={c.email ?? ""} onChange={(e) => set({ ...c, email: e.target.value })} placeholder="Email dello studio (facoltativa)" className={inp} data-testid={`schedule-clinic-email-${i}`} />
          </div>
          <div>
            <div className={small}>Colore in agenda</div>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {PALETTE.map((col) => <button key={col} type="button" onClick={() => set({ ...c, color: col })} aria-label={`Colore ${col}`} aria-pressed={c.color === col} className={`h-8 w-8 rounded-full ring-offset-2 ring-offset-[var(--surface)] ${c.color === col ? "ring-2 ring-[var(--fg)]" : ""}`} style={{ background: col }} data-testid={`schedule-clinic-color-${i}-${col.slice(1)}`} />)}
            </div>
          </div>
          <div>
            <div className={small}>Intestazione dei documenti</div>
            <textarea value={c.header ?? ""} onChange={(e) => set({ ...c, header: e.target.value })} maxLength={300} rows={2} placeholder="Es. Poliambulatorio San Luca · Aut. sanitaria n. 123/2020" className={`${inp} mt-1.5 h-auto w-full py-2`} data-testid={`schedule-clinic-header-${i}`} />
            <div className="mt-2"><Logo c={c} i={i} set={set} /></div>
            <p className="mt-1 text-[11px] text-[var(--fg2)]">Vale per i nuovi referti, ricevute e fatture di questo studio: i documenti già emessi restano invariati.</p>
          </div>
          <div>
            <div className={small}>Metodi di pagamento accettati</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {METHODS.map(([m, l]) => {
                const on = methods.includes(m);
                return <button key={m} type="button" aria-pressed={on} onClick={() => set({ ...c, methods: on ? methods.filter((x) => x !== m) : [...methods, m] })} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${on ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--ink)]" : "border-[var(--hair)] text-[var(--fg2)]"}`} data-testid={`schedule-clinic-method-${i}-${m}`}>{l}</button>;
              })}
            </div>
          </div>
          <div>
            <div className={small}>Listino dello studio (durata e tariffa)</div>
            <div className="mt-1.5"><PriceList c={c} i={i} services={services} set={set} /></div>
          </div>
        </div>
      )}
    </div>
  );
};
