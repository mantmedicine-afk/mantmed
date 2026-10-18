import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Send, Clock, CreditCard, Store, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api, errMsg, eur } from "@/lib/api";

const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };
const DAYS = ["", "lun", "mar", "mer", "gio", "ven", "sab", "dom"];

const Slots = ({ q, value, onPick, bump, onQuote }) => {
  const [res, setRes] = useState(null);
  const key = `${q.doctor_id}|${q.patient_id}|${q.clinic}|${q.service}|${q.date}|${bump}`;
  useEffect(() => {
    if (!q.patient_id || !q.clinic || !q.date || !q.service) return undefined;
    let alive = true;
    setRes(null);
    api.portalSlots(q).then((r) => { if (alive) { setRes(r); onQuote(r?.quote ?? null); } }).catch((e) => { if (alive) { setRes({ slots: [], error: errMsg(e) }); onQuote(null); } });
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

const PayOption = ({ id, active, disabled, onPick, icon: Icon, title, text }) => (
  <button type="button" disabled={disabled} onClick={() => onPick(id)} aria-pressed={active} className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${active ? "border-night bg-night text-white" : "border-slate-200 bg-white text-night hover:border-night"}`} data-testid={`portal-pay-${id}`}>
    <Icon size={18} className="mt-0.5 shrink-0" />
    <span><span className="block text-sm font-semibold">{title}</span><span className={`block text-xs ${active ? "text-slate-200" : "text-slate-600"}`}>{text}</span></span>
  </button>
);

const PayChoice = ({ quote, value, onPick }) => (
  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" data-testid="portal-pay-choice">
    <PayOption id="online" active={value === "online"} disabled={!quote?.online} onPick={onPick} icon={CreditCard} title="Paga Online ora"
      text={quote?.online ? `${eur(quote.total)}${quote.stamp ? ` (incl. bollo ${eur(quote.stamp)})` : ""} · carta, Apple Pay, Google Pay · conferma immediata` : "Non disponibile per questa prestazione"} />
    <PayOption id="studio" active={value === "studio"} onPick={onPick} icon={Store} title="Paga in Studio" text="Al momento della visita · la richiesta attende la conferma dello studio" />
  </div>
);

export const RequestDialog = ({ open, onClose, kids, initial, onSent }) => {
  const [f, setF] = useState(null);
  const cur = f ?? { patient_id: initial, doctor_id: "", clinic: "", service: "", date: tomorrow(), time: "", note: "" };
  const kid = kids.find((k) => k.patient.id === cur.patient_id) ?? kids[0];
  const [net, setNet] = useState([]);
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    api.portalNetwork().then((r) => alive && setNet(r)).catch(() => { if (alive) { setNet([]); toast.error("Elenco specialisti non disponibile: può prenotare con il suo medico"); } });
    return () => { alive = false; };
  }, [open]);
  const children = kids.filter((k, i) => kids.findIndex((x) => x.group === k.group) === i);
  const doctors = net.length ? net : (kid ? [{ id: kid.doctor.id, name: kid.doctor.name, specialty: kid.doctor.specialty, clinics: kid.doctor.clinics ?? [], services: [] }] : []);
  const doctor = doctors.find((d) => d.id === (cur.doctor_id || kid?.doctor?.id)) ?? doctors[0];
  const clinics = doctor?.clinics ?? [];
  const clinic = clinics.some((c) => c.name === cur.clinic) ? cur.clinic : clinics[0]?.name || "";
  const services = (doctor?.services ?? []).map((s) => s.name);
  const service = services.includes(cur.service) ? cur.service : services[0] || "";
  const set = (k) => (e) => setF({ ...cur, [k]: e.target.value, ...(k === "note" ? {} : { time: "" }) });
  const [busy, setBusy] = useState(false);
  const [bump, setBump] = useState(0);
  const [quote, setQuote] = useState(null);
  const [payPick, setPayPick] = useState("online");
  const pay = payPick === "online" && quote?.online ? "online" : "studio";
  const close = () => { setF(null); onClose(); };
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const body = { ...cur, patient_id: kid.patient.id, doctor_id: doctor?.id ?? "", clinic, service };
    if (pay === "online") {
      try { const r = await api.portalCheckout({ ...body, origin_url: window.location.origin }); window.location.assign(r.checkout_url); return; }
      catch (err) { toast.error(errMsg(err)); if (err?.response?.status === 409) { setF({ ...cur, time: "" }); setBump((b) => b + 1); } setBusy(false); return; }
    }
    try { await api.portalRequest(body); toast.success("Richiesta inviata: riceverà un'email quando lo studio la conferma"); onSent(); close(); }
    catch (err) { toast.error(errMsg(err)); if (err?.response?.status === 409) { setF({ ...cur, time: "" }); setBump((b) => b + 1); } }
    setBusy(false);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl bg-white sm:max-w-lg" data-testid="portal-request-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-3xl font-normal text-night">Richiedi appuntamento</DialogTitle>
          <DialogDescription className="text-sm text-slate-600">Pagando online l'appuntamento è confermato subito. Scegliendo di pagare in studio, la richiesta arriva come "in attesa di conferma" e data e ora possono essere adattate dal medico.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <label className="block"><Label>Figlio</Label>
            <select value={kid?.group ?? ""} onChange={(e) => setF({ ...cur, patient_id: kids.find((k) => k.group === e.target.value)?.patient.id, time: "" })} className={inp} data-testid="portal-request-child">{children.map((k) => <option key={k.group} value={k.group}>{k.patient.name}</option>)}</select></label>
          <label className="block"><Label>Scegli Specialista / Medico</Label>
            <select value={doctor?.id ?? ""} onChange={(e) => setF({ ...cur, doctor_id: e.target.value, clinic: "", service: "", time: "" })} className={inp} data-testid="portal-request-doctor">{doctors.map((d) => <option key={d.id} value={d.id}>{d.name} - {d.specialty}</option>)}</select></label>
          <label className="block"><Label>Studio</Label>
            <select value={clinic} onChange={set("clinic")} className={inp} data-testid="portal-request-clinic">{clinics.map((c) => <option key={c.name} value={c.name}>{c.name}{c.address ? ` · ${c.address}` : ""}</option>)}</select></label>
          <div><Label>Prestazione</Label>
            <div className="flex flex-wrap gap-2">{services.map((s, i) => (
              <button key={s} type="button" onClick={() => setF({ ...cur, service: s, time: "" })} aria-pressed={service === s} className={`rounded-full px-4 py-2 text-sm transition-colors ${service === s ? "bg-night text-white" : "border border-slate-200 text-night hover:border-night"}`} data-testid={`portal-request-service-${i}`}>{s}</button>
            ))}</div></div>
          <label className="block"><Label>Data desiderata</Label><input type="date" min={new Date().toISOString().slice(0, 10)} value={cur.date} onChange={set("date")} required className={inp} data-testid="portal-request-date" /></label>
          <div><Label>Orari liberi</Label><Slots q={{ patient_id: kid?.patient.id, doctor_id: doctor?.id ?? "", clinic, service, date: cur.date }} value={cur.time} bump={bump} onQuote={setQuote} onPick={(t) => setF({ ...cur, time: t })} /></div>
          <label className="block"><Label>Note per lo studio</Label><textarea rows={3} maxLength={1000} value={cur.note} onChange={set("note")} placeholder="Es. febbre da ieri, preferenza pomeriggio…" className={`${inp} h-auto resize-none py-2`} data-testid="portal-request-note" /></label>
          <div><Label>Pagamento</Label><PayChoice quote={quote} value={pay} onPick={setPayPick} /></div>
          <button disabled={busy || !kid || !cur.time} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-night text-sm font-semibold text-white disabled:opacity-60" data-testid="portal-request-submit">{busy ? <Loader2 size={16} className="animate-spin" /> : pay === "online" ? <Lock size={16} /> : <Send size={16} />} {pay === "online" ? `Paga ${eur(quote?.total)} e conferma` : "Invia richiesta"}</button>
          {pay === "online" && <p className="text-center text-xs text-slate-600" data-testid="portal-pay-note">Pagamento sicuro su Stripe. Annullando fino a 12 ore prima riceve il rimborso completo.</p>}
        </form>
      </DialogContent>
    </Dialog>
  );
};
