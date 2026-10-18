import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Eraser, FileSignature, PenLine } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { http, errMsg } from "@/lib/api";
import { Field } from "./AppointmentDialog";
import { useAuth } from "@/lib/auth";

const informativa = (doctor) => `Ai sensi degli artt. 13 e 9 del Reg. UE 2016/679, il titolare del trattamento (${doctor}) tratta i dati personali e sanitari del minore esclusivamente per finalità di diagnosi, cura e gestione amministrativa della visita. I dati sono conservati con crittografia AES-256, accessibili solo al medico e non diffusi. Il genitore può esercitare in ogni momento i diritti di accesso, rettifica, cancellazione e revoca del consenso contattando lo studio. [Testo da validare con il proprio consulente privacy/DPO]`;

export const SignaturePad = ({ onChange }) => {
  const ref = useRef(null);
  const drawing = useRef(false);
  useEffect(() => {
    const c = ref.current;
    const r = c.getBoundingClientRect();
    c.width = r.width * 2;
    c.height = r.height * 2;
    const g = c.getContext("2d");
    g.scale(2, 2);
    g.lineWidth = 2.2;
    g.lineCap = "round";
    g.strokeStyle = "#0A192F";
  }, []);
  const pos = (e) => { const r = ref.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const down = (e) => { drawing.current = true; const g = ref.current.getContext("2d"); g.beginPath(); g.moveTo(...pos(e)); ref.current.setPointerCapture(e.pointerId); };
  const move = (e) => { if (!drawing.current) return; const g = ref.current.getContext("2d"); g.lineTo(...pos(e)); g.stroke(); };
  const up = () => { if (!drawing.current) return; drawing.current = false; onChange(ref.current.toDataURL("image/png")); };
  const clear = () => { const c = ref.current; c.getContext("2d").clearRect(0, 0, c.width, c.height); onChange(null); };
  return (
    <div className="relative">
      <canvas ref={ref} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} className="h-32 w-full touch-none rounded-2xl border border-dashed border-slate-300 bg-slate-50" data-testid="consent-signature-pad" />
      <span className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-slate-400">Firma del genitore / tutore</span>
      <button onClick={clear} className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-white px-2 py-1 text-xs text-slate-600 shadow-sm" data-testid="consent-signature-clear"><Eraser size={12} /> Cancella</button>
    </div>
  );
};

export const ConsentDialog = ({ patient, open, onClose, onSaved }) => {
  const { user } = useAuth();
  const [f, setF] = useState({ signer_name: "", signer_relation: "Madre", privacy_policy: false, health_data: false, email_reports: false, method: "firma_tablet" });
  const [signature, setSignature] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) { setF((x) => ({ ...x, signer_name: (patient?.guardian || "").replace(/^[^:]+:\s*/, "") })); setSignature(null); }
  }, [open, patient]);

  const save = async () => {
    if (!f.privacy_policy || !f.health_data) return toast.error("Informativa e trattamento dei dati sanitari sono obbligatori");
    if (!f.signer_name.trim()) return toast.error("Inserisci il nome del firmatario");
    if (f.method === "firma_tablet" && !signature) return toast.error("Manca la firma");
    setBusy(true);
    try {
      await http.post(`/patients/${patient.id}/consents`, { ...f, signature: f.method === "firma_tablet" ? signature : null });
      toast.success("Consenso informato registrato");
      onSaved?.();
      onClose();
    } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  const Check = ({ k, label, required }) => (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-night hover:border-night">
      <input type="checkbox" checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} className="mt-0.5 h-4 w-4 accent-[#0A192F]" data-testid={`consent-${k}`} />
      <span>{label} {required ? <span className="text-red-600">*</span> : <span className="text-slate-500">(facoltativo)</span>}</span>
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl bg-white sm:max-w-lg" data-testid="consent-dialog" data-lenis-prevent>
        <DialogHeader><DialogTitle className="flex items-center gap-2 font-display text-3xl font-normal text-night"><ShieldCheck className="text-night" /> Consenso informato</DialogTitle></DialogHeader>
        <p className="max-h-32 overflow-y-auto rounded-2xl bg-[#F4F5F7] p-4 text-xs leading-relaxed text-slate-700" data-testid="consent-informativa">{informativa(user?.name || "il medico")}</p>
        <div className="grid gap-2">
          <Check k="privacy_policy" label="Dichiaro di aver letto l'informativa privacy" required />
          <Check k="health_data" label="Acconsento al trattamento dei dati sanitari del minore (art. 9 GDPR)" required />
          <Check k="email_reports" label="Acconsento a ricevere referti e comunicazioni via email" />
        </div>
        <div className="grid grid-cols-[1fr_130px] gap-3">
          <Field label="Firmatario"><Input value={f.signer_name} onChange={(e) => setF({ ...f, signer_name: e.target.value })} data-testid="consent-signer-input" /></Field>
          <Field label="Relazione">
            <select value={f.signer_relation} onChange={(e) => setF({ ...f, signer_relation: e.target.value })} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm" data-testid="consent-relation-select">
              {["Madre", "Padre", "Tutore legale"].map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[["firma_tablet", "Firma su tablet", PenLine], ["modulo_cartaceo", "Modulo cartaceo", FileSignature]].map(([v, l, Icon]) => (
            <button key={v} onClick={() => setF({ ...f, method: v })} className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium ${f.method === v ? "bg-night text-white" : "border border-slate-200 text-slate-600"}`} data-testid={`consent-method-${v}`}><Icon size={15} /> {l}</button>
          ))}
        </div>
        {f.method === "firma_tablet" ? <SignaturePad onChange={setSignature} /> : <p className="text-xs text-slate-600">Il modulo firmato su carta va conservato in studio.</p>}
        <button onClick={save} disabled={busy} className="rounded-full bg-night py-3.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60" data-testid="consent-save-btn">Registra consenso</button>
      </DialogContent>
    </Dialog>
  );
};
