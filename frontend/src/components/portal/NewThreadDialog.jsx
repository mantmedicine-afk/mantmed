import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api, errMsg } from "@/lib/api";
import { UrgencyNotice } from "./UrgencyNotice";

export const TEMPLATES = {
  certificato_sportivo: { title: "Certificato di idoneità sportiva", body: "Gentile dottore, vorrei richiedere il certificato di idoneità all'attività sportiva per mio figlio/a. Resto in attesa di indicazioni su eventuali visite o esami necessari.",
    fields: [{ label: "Sport praticato", required: true }, { label: "Tipo di attività", options: ["Non agonistica", "Agonistica"] }, { label: "Società / Scuola" }, { label: "Serve entro il", type: "date" }] },
  ricetta: { title: "Ricetta ripetibile", body: "Gentile dottore, avrei bisogno del rinnovo della ricetta per la terapia in corso.",
    fields: [{ label: "Farmaco", required: true }, { label: "Dosaggio / posologia" }, { label: "Numero confezioni", options: ["1", "2", "3"] }, { label: "Ultima prescrizione" }] },
  info: { title: "Richiesta di informazioni", body: "", fields: [] },
  clinico: { title: "Dubbio clinico non urgente", body: "", fields: [] },
};

const inp = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-night outline-none focus:border-night";
const Label = ({ children }) => <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">{children}</span>;
const slug = (s) => s.toLowerCase().replace(/[^a-z]+/g, "-");

const FieldInput = ({ f, value, onChange }) => (
  <label className="block"><Label>{f.label}{f.required ? " *" : ""}</Label>
    {f.options ? (
      <select value={value || f.options[0]} onChange={(e) => onChange(e.target.value)} className={inp} data-testid={`new-thread-field-${slug(f.label)}`}>{f.options.map((o) => <option key={o}>{o}</option>)}</select>
    ) : (
      <input type={f.type || "text"} maxLength={300} required={f.required} value={value || ""} onChange={(e) => onChange(e.target.value)} className={inp} data-testid={`new-thread-field-${slug(f.label)}`} />
    )}
  </label>
);

export const NewThreadDialog = ({ kind, kids, onClose, onSent }) => {
  const tpl = TEMPLATES[kind] ?? TEMPLATES.info;
  const [to, setTo] = useState(kids[0] ? `${kids[0].patient.id}|${kids[0].doctor.id}` : "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState(tpl.body);
  const [vals, setVals] = useState({});
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const [patient_id, owner_id] = to.split("|");
    const fields = tpl.fields.map((f) => ({ label: f.label, value: vals[f.label] ?? (f.options ? f.options[0] : "") })).filter((f) => f.value.trim());
    setBusy(true);
    try { const t = await api.portalNewThread({ patient_id, owner_id, kind, subject, body, fields }); toast.success("Messaggio inviato allo studio"); onSent(t); }
    catch (err) { toast.error(errMsg(err)); }
    setBusy(false);
  };
  return (
    <Dialog open={!!kind} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl bg-white sm:max-w-lg" data-testid="new-thread-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-3xl font-normal text-night">{tpl.title}</DialogTitle>
          <DialogDescription className="text-sm text-slate-600">Il messaggio arriva direttamente allo specialista scelto. Riceverà una notifica qui nel portale quando risponde.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <label className="block"><Label>Figlio e specialista</Label>
            <select value={to} onChange={(e) => setTo(e.target.value)} className={inp} data-testid="new-thread-recipient">
              {kids.map((k) => <option key={`${k.patient.id}|${k.doctor.id}`} value={`${k.patient.id}|${k.doctor.id}`}>{k.patient.name} · {k.doctor.name} ({k.doctor.specialty})</option>)}
            </select></label>
          {(kind === "info" || kind === "clinico") && <label className="block"><Label>Oggetto</Label><input maxLength={120} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={tpl.title} className={inp} data-testid="new-thread-subject" /></label>}
          {tpl.fields.length > 0 && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{tpl.fields.map((f) => <FieldInput key={f.label} f={f} value={vals[f.label]} onChange={(v) => setVals({ ...vals, [f.label]: v })} />)}</div>}
          <UrgencyNotice ownerId={to.split("|")[1]} patientId={to.split("|")[0]} />
          <label className="block"><Label>Messaggio *</Label><textarea rows={4} required minLength={2} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Descriva la sua richiesta…" className={`${inp} h-auto resize-none py-2`} data-testid="new-thread-body" /></label>
          <button disabled={busy || !to || body.trim().length < 2} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-night text-sm font-semibold text-white disabled:opacity-60" data-testid="new-thread-submit">{busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Invia allo studio</button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
