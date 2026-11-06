import { useEffect, useState } from "react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Loader2, ShieldCheck, Share2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api, errMsg } from "@/lib/api";
import { day } from "./ui";

export const shareUrl = (token) => `${window.location.origin}/p/${token}`;
export const SCOPES = { summary: "Solo riepilogo", full: "Passaporto completo" };
const DUR = [["24h", "24 ore"], ["7d", "7 giorni"], ["30d", "30 giorni"]];
const pill = (on) => `rounded-2xl px-4 py-3 text-left text-sm transition-colors ring-1 ${on ? "bg-[var(--accent)] text-[var(--ink)] ring-[var(--accent)]" : "bg-[var(--surface)] text-[var(--fg)] ring-[var(--sel)] hover:ring-[var(--accent)]"}`;

const Informativa = ({ onOk }) => {
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); try { await api.givePassportConsent(); onOk(); } catch (e) { toast.error(errMsg(e)); } setBusy(false); };
  return (
    <div className="space-y-4" data-testid="share-consent-step">
      <div className="max-h-[42vh] space-y-2 overflow-y-auto rounded-2xl bg-[var(--raised)] p-4 text-sm leading-relaxed text-[var(--fg)]" data-testid="share-informativa">
        <p><b>Cosa succede quando condivide.</b> Lei decide di mostrare a un medico di sua scelta i dati sanitari del paziente, in sola lettura e solo fino alla scadenza che sceglie.</p>
        <p><b>Cosa vede il medico.</b> Solo riepilogo (allergie, patologie, terapie, vaccinazioni) oppure il passaporto completo (anche crescita, visite, referti PDF e bilanci). Il codice fiscale non viene mai mostrato. I referti che lei nasconde non compaiono.</p>
        <p><b>Come è protetto.</b> Serve il link o il QR code e un codice di 6 cifre che lei comunica al medico. Ogni apertura viene registrata (nome indicato dal medico, data e ora) e la vede nel Registro accessi.</p>
        <p><b>Revoca.</b> Può togliere l'accesso in qualsiasi momento con "Revoca"; i link scaduti o revocati non funzionano più.</p>
        <p><b>Importazione.</b> Solo se lo autorizza, un medico che usa MantMed può copiare questi dati nella propria cartella clinica e da quel momento li tratta come titolare autonomo.</p>
        <p>Maggiori dettagli nell'<Link to="/privacy" target="_blank" className="font-medium underline underline-offset-4">informativa privacy</Link>.</p>
      </div>
      <label className="flex items-start gap-3 text-sm text-[var(--fg)]"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-1 h-4 w-4" data-testid="share-consent-checkbox" /> Ho letto l'informativa e acconsento, come genitore o tutore, alla condivisione dei dati sanitari di mio figlio con i medici che sceglierò.</label>
      <button onClick={go} disabled={!ok || busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] text-sm font-medium text-[var(--ink)] disabled:opacity-50" data-testid="share-consent-accept">{busy ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} Do il consenso e continuo</button>
    </div>
  );
};

const Options = ({ pid, onDone }) => {
  const [f, setF] = useState({ scope: "summary", duration: "24h", allow_import: false });
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); try { onDone(await api.createPassportShare(pid, f)); } catch (e) { toast.error(errMsg(e)); } setBusy(false); };
  return (
    <div className="space-y-4" data-testid="share-options-step">
      <div className="text-sm font-medium text-[var(--fg)]">Cosa mostrare</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <button onClick={() => setF({ ...f, scope: "summary" })} className={pill(f.scope === "summary")} data-testid="share-scope-summary"><b>Solo riepilogo</b><div className="text-xs opacity-80">Allergie, terapie, patologie e vaccini</div></button>
        <button onClick={() => setF({ ...f, scope: "full" })} className={pill(f.scope === "full")} data-testid="share-scope-full"><b>Passaporto completo</b><div className="text-xs opacity-80">Anche crescita, visite, referti e bilanci</div></button>
      </div>
      <div className="text-sm font-medium text-[var(--fg)]">Per quanto tempo</div>
      <div className="grid grid-cols-3 gap-2">{DUR.map(([k, l]) => <button key={k} onClick={() => setF({ ...f, duration: k })} className={`${pill(f.duration === k)} text-center`} data-testid={`share-duration-${k}`}>{l}</button>)}</div>
      <label className="flex items-start gap-3 text-sm text-[var(--fg)]"><input type="checkbox" checked={f.allow_import} onChange={(e) => setF({ ...f, allow_import: e.target.checked })} className="mt-1 h-4 w-4" data-testid="share-allow-import" /> Permetto ai medici che usano MantMed di importare questi dati nella loro cartella clinica</label>
      <button onClick={go} disabled={busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] text-sm font-medium text-[var(--ink)] disabled:opacity-50" data-testid="share-create-btn">{busy ? <Loader2 size={15} className="animate-spin" /> : <Share2 size={15} />} Genera QR code e link</button>
    </div>
  );
};

export const ShareResult = ({ s }) => {
  const url = shareUrl(s.token);
  const copy = () => navigator.clipboard?.writeText(url).then(() => toast.success("Link copiato")).catch(() => toast.error("Copia non riuscita"));
  return (
    <div className="min-w-0 space-y-4 text-center" data-testid="share-result">
      <div className="mx-auto w-fit rounded-3xl bg-white p-4"><QRCodeSVG value={url} size={184} data-testid="share-qr" /></div>
      <div className="flex items-center gap-2 rounded-full bg-[var(--raised)] py-1 pl-4 pr-1 text-left"><span className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--fg)]" data-testid="share-link">{url}</span><button onClick={copy} className="flex h-9 items-center gap-1.5 rounded-full bg-[var(--accent)] px-3 text-xs font-medium text-[var(--ink)]" data-testid="share-copy-link"><Copy size={13} /> Copia</button></div>
      <div><div className="text-xs uppercase tracking-[0.2em] text-[var(--fg2)]">Codice da comunicare al medico</div><div className="mt-1 font-mono text-4xl font-semibold tracking-[0.3em] text-[var(--fg)]" data-testid="share-code">{s.code}</div></div>
      <p className="text-xs text-[var(--fg2)]">{SCOPES[s.scope]} · valido fino al {day(s.expires_at)} alle {new Date(s.expires_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}. Comunichi il codice a voce o al telefono, non insieme al link.</p>
    </div>
  );
};

export const ShareDialog = ({ pid, open, onClose, onCreated }) => {
  const [step, setStep] = useState("loading");
  const [made, setMade] = useState(null);
  useEffect(() => {
    if (!open) return;
    setMade(null); setStep("loading");
    api.passportConsent().then((r) => setStep(r.consent ? "options" : "consent")).catch((e) => { toast.error(errMsg(e)); onClose(); });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = (s) => { setMade(s); setStep("done"); onCreated(); };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="z-[60] max-h-[92vh] overflow-y-auto rounded-3xl bg-[var(--surface)] sm:max-w-lg [&>*]:min-w-0" data-testid="share-dialog">
        <DialogHeader><DialogTitle className="text-2xl font-semibold text-[var(--fg)]">{step === "consent" ? "Prima di condividere" : step === "done" ? "Passaporto condiviso" : "Condividi con un medico"}</DialogTitle>
          <DialogDescription className="text-[var(--fg2)]">{step === "consent" ? "Informativa sulla condivisione del passaporto sanitario" : step === "done" ? "Mostri il QR code al medico o gli invii il link." : "Scelga cosa mostrare e per quanto tempo."}</DialogDescription></DialogHeader>
        {step === "loading" && <Loader2 className="mx-auto animate-spin text-[var(--fg)]" />}
        {step === "consent" && <Informativa onOk={() => setStep("options")} />}
        {step === "options" && <Options pid={pid} onDone={done} />}
        {step === "done" && made && <ShareResult s={made} />}
      </DialogContent>
    </Dialog>
  );
};
