import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { UploadCloud, ShieldCheck, ShieldX, Loader2, ArrowLeft, Fingerprint, AlertTriangle } from "lucide-react";
import { LogoMark } from "@/components/dash/Logo";
import { api, errMsg } from "@/lib/api";

const CHANNEL = { studio_tablet: "firmato su tablet in studio", portale: "firmato dal Portale Paziente", cartaceo: "modulo cartaceo" };
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export default function Verify() {
  const input = useRef(null);
  const [state, setState] = useState({ status: "idle" });
  const [drag, setDrag] = useState(false);

  const check = async (file) => {
    if (!file) return;
    if (file.type && file.type !== "application/pdf") return setState({ status: "error", message: "Selezioni un file PDF scaricato da MantMed" });
    setState({ status: "busy", name: file.name });
    try {
      const hash = toHex(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
      const r = await api.verifyDocument(hash);
      setState({ status: r.valid ? "valid" : "invalid", name: file.name, hash, r });
    } catch (e) { setState({ status: "error", message: errMsg(e) }); }
  };

  return (
    <div className="min-h-screen bg-[#0A192F] text-white" data-testid="verify-page">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-6">
        <Link to="/" className="flex items-center gap-3"><LogoMark size={36} light /><span className="font-display text-2xl">MantMed</span></Link>
        <Link to="/" className="flex h-10 items-center gap-2 rounded-full border border-[#C9CCD3]/30 px-4 text-sm text-[#C9CCD3] hover:border-white hover:text-white"><ArrowLeft size={15} /> Home</Link>
      </header>
      <main className="mx-auto max-w-3xl px-5 pb-16 pt-6">
        <div className="text-[11px] uppercase tracking-[0.24em] text-[#C9CCD3]">Verifica documento</div>
        <h1 className="mt-2 font-display text-5xl leading-tight">Integrità di un PDF firmato</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-300">Carichi un consenso o un documento firmato con MantMed. L'impronta SHA-256 viene calcolata sul suo dispositivo: il file non viene inviato. Se coincide con quella registrata al momento della firma, il documento non è stato alterato.</p>

        <button type="button" onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); check(e.dataTransfer.files?.[0]); }}
          className={`mt-8 flex w-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed px-6 py-14 transition-colors ${drag ? "border-white bg-white/10" : "border-[#C9CCD3]/40 hover:border-white"}`}
          data-testid="verify-dropzone">
          {state.status === "busy" ? <Loader2 className="animate-spin" size={28} /> : <UploadCloud size={28} className="text-[#C9CCD3]" />}
          <span className="text-base font-medium">{state.status === "busy" ? `Verifica di ${state.name}…` : "Trascini qui il PDF o tocchi per sceglierlo"}</span>
        </button>
        <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { check(e.target.files?.[0]); e.target.value = ""; }} data-testid="verify-file-input" />

        {state.status === "valid" && (
          <div className="mt-6 rounded-3xl bg-white p-6 text-night" data-testid="verify-result-valid">
            <div className="flex items-center gap-3"><ShieldCheck className="text-emerald-600" size={26} /><div className="font-display text-3xl">Documento integro</div></div>
            <p className="mt-2 text-sm text-slate-600">Il file corrisponde esattamente al documento archiviato al momento della firma.</p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Documento</dt><dd>{state.r.title}</dd></div>
              <div><dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Codice</dt><dd className="font-mono" data-testid="verify-result-code">{state.r.code}</dd></div>
              <div><dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Firmato</dt><dd>{new Date(state.r.signed_at).toLocaleString("it-IT", { dateStyle: "long", timeStyle: "short" })} · {CHANNEL[state.r.channel] ?? state.r.channel}</dd></div>
              <div><dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Firmatario</dt><dd>{state.r.signer_initials}</dd></div>
            </dl>
            {state.r.revoked_at && <p className="mt-4 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-900" data-testid="verify-result-revoked"><AlertTriangle size={16} /> Integro, ma il consenso non è più valido dal {new Date(state.r.revoked_at).toLocaleDateString("it-IT")} (revocato o sostituito).</p>}
            <p className="mt-4 flex items-center gap-2 break-all font-mono text-[11px] text-slate-500"><Fingerprint size={12} className="shrink-0" /> {state.hash}</p>
          </div>
        )}
        {state.status === "invalid" && (
          <div className="mt-6 rounded-3xl bg-white p-6 text-night" data-testid="verify-result-invalid">
            <div className="flex items-center gap-3"><ShieldX className="text-rose-600" size={26} /><div className="font-display text-3xl">Nessuna corrispondenza</div></div>
            <p className="mt-2 text-sm text-slate-600">L'impronta di questo file non risulta nell'archivio MantMed: il documento potrebbe essere stato modificato, oppure non è un originale scaricato da MantMed.</p>
            <p className="mt-4 flex items-center gap-2 break-all font-mono text-[11px] text-slate-500"><Fingerprint size={12} className="shrink-0" /> {state.hash}</p>
          </div>
        )}
        {state.status === "error" && <p className="mt-6 rounded-2xl bg-rose-500/15 px-4 py-3 text-sm text-rose-100" data-testid="verify-result-error">{state.message}</p>}
      </main>
    </div>
  );
}
