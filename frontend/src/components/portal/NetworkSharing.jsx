import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Share2, ShieldCheck, Undo2, PenLine } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SignaturePad } from "@/components/dash/ConsentDialog";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const day = (iso) => new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });

const SignDialog = ({ open, onClose, entries, text, onSigned }) => {
  const { user } = useAuth();
  const [sel, setSel] = useState([]);
  const [name, setName] = useState("");
  const [ok, setOk] = useState(false);
  const [sig, setSig] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) { setSel(entries.map((e) => e.patient.id)); setName(user?.name ?? ""); setOk(false); setSig(null); }
    return undefined;
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const submit = async () => {
    if (sel.length < 2) return toast.error("Selezioni almeno due specialisti");
    if (!ok) return toast.error("Serve il consenso esplicito");
    if (!sig) return toast.error("Manca la firma");
    setBusy(true);
    try { await api.createShare({ patient_ids: sel, signer_name: name, accepted: ok, signature: sig }); toast.success("Consenso firmato: gli specialisti selezionati vedono i referti in sola lettura"); onSigned(); onClose(); }
    catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl bg-white sm:max-w-lg" data-testid="share-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-3xl font-normal text-night">Condivisione tra specialisti</DialogTitle>
          <DialogDescription className="text-sm text-slate-600">Scelga gli specialisti che seguono {entries[0]?.patient.name} e che potranno consultare reciprocamente i referti.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {entries.map((e) => (
            <label key={e.patient.id} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-night hover:border-night">
              <input type="checkbox" checked={sel.includes(e.patient.id)} onChange={() => toggle(e.patient.id)} className="h-4 w-4 accent-[#0A192F]" data-testid={`share-member-${e.patient.id}`} />
              <span><span className="font-medium">{e.doctor.name}</span> · {e.doctor.specialty}</span>
            </label>
          ))}
        </div>
        <p className="max-h-32 overflow-y-auto rounded-2xl bg-[#F4F5F7] p-4 text-xs leading-relaxed text-slate-700" data-testid="share-informativa">{text}</p>
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-night hover:border-night">
          <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#0A192F]" data-testid="share-accept" />
          <span>Ho letto l'informativa e acconsento alla condivisione dei referti tra gli specialisti selezionati <span className="text-red-600">*</span></span>
        </label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome e cognome del firmatario" className="h-11 rounded-xl border border-slate-200 px-3 text-sm text-night outline-none focus:border-night" data-testid="share-signer" />
        <SignaturePad onChange={setSig} />
        <button onClick={submit} disabled={busy} className="flex h-12 items-center justify-center gap-2 rounded-full bg-night text-sm font-semibold text-white disabled:opacity-60" data-testid="share-submit">{busy ? <Loader2 size={16} className="animate-spin" /> : <PenLine size={16} />} Firma e attiva la condivisione</button>
      </DialogContent>
    </Dialog>
  );
};

export const NetworkSharing = ({ entries }) => {
  const [data, setData] = useState({ items: [], text: "" });
  const [open, setOpen] = useState(false);
  const load = useCallback(() => { api.sharing().then(setData).catch(() => {}); }, []);
  useEffect(() => {
    load();
  }, [load]);
  const ids = entries.map((e) => e.patient.id);
  const active = data.items.find((s) => !s.revoked_at && s.members.some((m) => ids.includes(m.patient_id)));
  const nameOf = (pid) => entries.find((e) => e.patient.id === pid)?.doctor;
  const revoke = async () => {
    try { await api.revokeShare(active.id); toast.success("Consenso revocato: la condivisione è interrotta"); load(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4" data-testid={`share-card-${entries[0].group}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-medium text-night"><Share2 size={15} /> Medicina di squadra · condivisione referti</div>
          {active ? (
            <p className="mt-1 text-sm text-slate-600" data-testid="share-active">Attiva dal {day(active.signed_at)} tra {active.members.map((m) => nameOf(m.patient_id)?.name).filter(Boolean).join(", ")}.</p>
          ) : entries.length < 2 ? (
            <p className="mt-1 text-sm text-slate-600" data-testid="share-need-two">Disponibile quando {entries[0].patient.name} è seguito/a da almeno due specialisti della rete: prenoti una visita scegliendo un altro specialista.</p>
          ) : <p className="mt-1 text-sm text-slate-600" data-testid="share-none">Nessuna condivisione: ogni specialista vede solo i propri referti.</p>}
        </div>
        {active ? (
          <button onClick={revoke} className="flex h-10 items-center gap-1.5 rounded-full border border-slate-200 px-4 text-sm text-rose-700 hover:border-rose-700" data-testid="share-revoke-btn"><Undo2 size={14} /> Revoca consenso</button>
        ) : entries.length >= 2 && (
          <button onClick={() => setOpen(true)} className="flex h-10 items-center gap-1.5 rounded-full bg-night px-4 text-sm font-medium text-white" data-testid="share-open-btn"><ShieldCheck size={14} /> Autorizza la condivisione</button>
        )}
      </div>
      <SignDialog open={open} onClose={() => setOpen(false)} entries={entries} text={data.text} onSigned={load} />
    </div>
  );
};
