import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Send, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api, errMsg } from "@/lib/api";

const SERVICES = ["Prima visita", "Bilancio di salute", "Visita di controllo", "Visita urgente"];
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };
const DAYS = ["", "lun", "mar", "mer", "gio", "ven", "sab", "dom"];

const Slots = ({ q, value, onPick, bump }) => {
  const [res, setRes] = useState(null);
  const key = `${q.patient_id}|${q.clinic}|${q.service}|${q.date}|${bump}`;
  useEffect(() => {
    if (!q.patient_id || !q.clinic || !q.date) return undefined;
    let alive = true;
    setRes(null);
    api.portalSlots(q).then((r) => alive && setRes(r)).catch((e) => alive && setRes({ slots: [], error: errMsg(e) }));
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!res) return <Loader2 size={16} className="animate-spin text-night" />;
  const slots = Array.isArray(res.slots) ? res.slots : [];
  const h = res.hours;
  return (
    <div data-testid="portal-request-slots">
      {h && <p className="mb-2 flex items-center gap-1.5 text-xs text-slate-600"><Clock size={12} /> Aperto {h.days.map((d) => DAYS[d]).join(", ")} {h.start}-{h.end} · durata {res.duration} min</p>}
      {slots.length === 0 ? <p className="rounded-xl bg-[#F4F5F7] p-3 text-sm text-slate-600" data-testid="portal-request-no-slots">{res.error || "Nessun orario libero in questa data: provi un altro giorno o un altro studio."}</p> : (
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
          {slots.map((s) => (
            <button key={s} type="button" onClick={() => onPick(s)} aria-pressed={value === s} className={`h-10 rounded-xl font-mono text-sm transition-colors ${value === s ? "bg-night text-white" : "border border-slate-200 text-night hover:border-night"}`} data-testid={`portal-slot-${s.replace(":", "")}`}>{s}</button>
          ))}
        </div>
      )}
    </div>
  );
};
const inp = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-night outline-none focus:border-night";
const Label = ({ children }) => <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">{children}</span>;

export const RequestDialog = ({ open, onClose, kids, initial, onSent }) => {
  const [f, setF] = useState(null);
  const cur = f ?? { patient_id: initial, clinic: "", service: SERVICES[0], date: tomorrow(), time: "", note: "" };
  const kid = kids.find((k) => k.patient.id === cur.patient_id) ?? kids[0];
  const clinics = kid?.doctor?.clinics ?? [];
  const clinic = cur.clinic || clinics[0]?.name || "";
  const set = (k) => (e) => setF({ ...cur, [k]: e.target.value, ...(k === "note" ? {} : { time: "" }) });
  const [busy, setBusy] = useState(false);
  const [bump, setBump] = useState(0);
  const close = () => { setF(null); onClose(); };
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await api.portalRequest({ ...cur, patient_id: kid.patient.id, clinic }); toast.success("Richiesta inviata: riceverà un'email quando lo studio la conferma"); onSent(); close(); }
    catch (err) { toast.error(errMsg(err)); if (err?.response?.status === 409) { setF({ ...cur, time: "" }); setBump((b) => b + 1); } }
    setBusy(false);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl bg-white sm:max-w-lg" data-testid="portal-request-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-3xl font-normal text-night">Richiedi appuntamento</DialogTitle>
          <DialogDescription className="text-sm text-slate-600">La richiesta arriva allo studio come "in attesa di conferma". Data e ora possono essere adattate dal medico.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <label className="block"><Label>Figlio</Label>
            <select value={kid?.patient.id ?? ""} onChange={(e) => setF({ ...cur, patient_id: e.target.value, clinic: "", time: "" })} className={inp} data-testid="portal-request-child">{kids.map((k) => <option key={k.patient.id} value={k.patient.id}>{k.patient.name}</option>)}</select></label>
          <label className="block"><Label>Studio</Label>
            <select value={clinic} onChange={set("clinic")} className={inp} data-testid="portal-request-clinic">{clinics.map((c) => <option key={c.name} value={c.name}>{c.name}{c.address ? ` · ${c.address}` : ""}</option>)}</select></label>
          <div><Label>Prestazione</Label>
            <div className="flex flex-wrap gap-2">{SERVICES.map((s) => (
              <button key={s} type="button" onClick={() => setF({ ...cur, service: s, time: "" })} aria-pressed={cur.service === s} className={`rounded-full px-4 py-2 text-sm transition-colors ${cur.service === s ? "bg-night text-white" : "border border-slate-200 text-night hover:border-night"}`} data-testid={`portal-request-service-${s.split(" ")[0].toLowerCase()}`}>{s}</button>
            ))}</div></div>
          <label className="block"><Label>Data desiderata</Label><input type="date" min={new Date().toISOString().slice(0, 10)} value={cur.date} onChange={set("date")} required className={inp} data-testid="portal-request-date" /></label>
          <div><Label>Orari liberi</Label><Slots q={{ patient_id: kid?.patient.id, clinic, service: cur.service, date: cur.date }} value={cur.time} bump={bump} onPick={(t) => setF({ ...cur, time: t })} /></div>
          <label className="block"><Label>Note per lo studio</Label><textarea rows={3} maxLength={1000} value={cur.note} onChange={set("note")} placeholder="Es. febbre da ieri, preferenza pomeriggio…" className={`${inp} h-auto resize-none py-2`} data-testid="portal-request-note" /></label>
          <button disabled={busy || !kid || !cur.time} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-night text-sm font-semibold text-white disabled:opacity-60" data-testid="portal-request-submit">{busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Invia richiesta</button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
