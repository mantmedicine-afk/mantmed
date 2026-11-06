import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Lock, Ban, Download, Stethoscope, ShieldCheck } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { PassportBody } from "@/components/passport/PassportBody";
import { LogoMark } from "@/components/dash/Logo";
import { day } from "@/components/passport/ui";

const useNoIndex = () => useEffect(() => {
  const m = Object.assign(document.createElement("meta"), { name: "robots", content: "noindex, nofollow, noarchive" });
  document.head.appendChild(m);
  const t = document.title;
  document.title = "Passaporto sanitario condiviso · MantMed";
  return () => { m.remove(); document.title = t; };
}, []);

const Gone = () => (
  <div className="mx-auto mt-16 max-w-md rounded-3xl bg-[var(--surface)] p-8 text-center ring-1 ring-[var(--sel)]" data-testid="shared-gone">
    <Ban className="mx-auto text-[var(--fg2)]" size={32} />
    <h1 className="mt-3 text-2xl font-semibold text-[var(--fg)]">Accesso non più disponibile</h1>
    <p className="mt-2 text-sm text-[var(--fg2)]">Il link è scaduto o il paziente (o il tutore) ha revocato la condivisione. Chieda alla famiglia di condividere di nuovo il passaporto.</p>
  </div>
);

const Unlock = ({ token, onOpen }) => {
  const [f, setF] = useState({ viewer_name: "", code: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { onOpen(await api.openSharedPassport(token, f)); } catch (x) { if (x.response?.status === 410) onOpen(null); else setErr(errMsg(x)); }
    setBusy(false);
  };
  const inp = "h-12 w-full rounded-2xl border border-[var(--hair)] bg-[var(--bg)] px-4 text-[var(--fg)] outline-none focus:border-[var(--accent)]";
  return (
    <form onSubmit={go} className="mx-auto mt-12 max-w-md space-y-4 rounded-3xl bg-[var(--surface)] p-7 ring-1 ring-[var(--sel)]" data-testid="shared-unlock-form">
      <Lock className="text-[var(--fg)]" size={26} />
      <h1 className="text-2xl font-semibold text-[var(--fg)]">Passaporto sanitario condiviso</h1>
      <p className="text-sm text-[var(--fg2)]">Sola lettura. Indichi il suo nome e cognome (il paziente o il tutore lo vedrà nel registro accessi) e il codice di 6 cifre ricevuto dalla famiglia.</p>
      <input value={f.viewer_name} onChange={(e) => setF({ ...f, viewer_name: e.target.value })} placeholder="es. Dott. Mario Rossi" className={inp} autoComplete="name" data-testid="shared-viewer-name" />
      <input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.replace(/\D/g, "").slice(0, 6) })} placeholder="Codice a 6 cifre" inputMode="numeric" className={`${inp} font-mono tracking-[0.3em]`} data-testid="shared-code-input" />
      {err && <p className="text-sm text-[var(--alert)]" data-testid="shared-error">{err}</p>}
      <button disabled={busy || f.viewer_name.trim().length < 3 || f.code.length !== 6} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] text-sm font-medium text-[var(--ink)] disabled:opacity-50" data-testid="shared-open-btn">{busy && <Loader2 size={15} className="animate-spin" />} Apri il passaporto</button>
    </form>
  );
};

const DoctorBar = ({ view }) => {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const run = async () => { setBusy(true); try { setDone(await api.importPassport(view.key)); toast.success("Dati importati nella sua cartella"); } catch (e) { toast.error(errMsg(e)); } setBusy(false); };
  if (!view.import.mantmed_doctor) return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-[var(--raised)] p-5" data-testid="shared-mantmed-promo">
      <div className="flex items-center gap-3 text-[var(--fg)]"><Stethoscope size={20} /><span className="font-medium">Gestisci i tuoi pazienti con MantMed</span></div>
      <Link to="/registrati/medico" className="flex h-10 items-center rounded-full bg-[var(--accent)] px-4 text-sm font-medium text-[var(--ink)]" data-testid="shared-register-link">Registrati come medico</Link>
    </div>
  );
  if (!view.import.allowed) return <p className="rounded-3xl bg-[var(--raised)] p-5 text-sm text-[var(--fg2)]" data-testid="shared-import-not-allowed">Il genitore non ha autorizzato l'importazione di questi dati nella cartella.</p>;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-[var(--raised)] p-5" data-testid="shared-import-box">
      <div className="text-sm text-[var(--fg)]">{done ? `${done.created ? "Nuovo paziente creato" : "Cartella esistente aggiornata"} · ${done.measurements} misure e ${done.vaccinations} vaccinazioni aggiunte` : "Il genitore ha autorizzato l'importazione nella sua cartella MantMed."}</div>
      {done ? <Link to="/app/pazienti" className="flex h-10 items-center rounded-full border border-[var(--hair)] px-4 text-sm font-medium text-[var(--fg)]" data-testid="shared-open-folder">Apri i pazienti</Link>
        : <button onClick={run} disabled={busy} className="flex h-10 items-center gap-2 rounded-full bg-[var(--accent)] px-4 text-sm font-medium text-[var(--ink)] disabled:opacity-60" data-testid="shared-import-btn">{busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Importa nella cartella</button>}
    </div>
  );
};

export default function SharedPassport() {
  const { token } = useParams();
  const [info, setInfo] = useState(undefined);
  const [view, setView] = useState(undefined);
  useNoIndex();
  useEffect(() => {
    api.me().catch(() => api.refresh().catch(() => null)).finally(() => api.sharedPassportInfo(token).then(setInfo).catch(() => setInfo({ available: false })));
  }, [token]);
  const pdf = (cid) => api.sharedPassportPdf(view.key, cid).catch((e) => { if (e.response?.status === 410) setView(null); else throw e; });
  const gone = info?.available === false || view === null;
  return (
    <div className="min-h-screen bg-[var(--bg)] px-5 pb-16" data-testid="shared-passport-page">
      <header className="mx-auto flex max-w-[1100px] items-center justify-between py-5"><span className="flex items-center gap-2 font-semibold text-[var(--fg)]"><LogoMark size={30} /> MantMed</span>
        {view && <span className="flex items-center gap-1.5 text-xs text-[var(--fg2)]" data-testid="shared-expiry"><ShieldCheck size={13} /> Sola lettura · fino al {day(view.expires_at)}</span>}</header>
      {info === undefined && <Loader2 className="mx-auto mt-20 animate-spin text-[var(--fg)]" />}
      {gone && <Gone />}
      {!gone && info && !view && <Unlock token={token} onOpen={setView} />}
      {!gone && view && (
        <main className="mx-auto max-w-[1100px] space-y-5">
          <div><h1 className="text-3xl font-semibold text-[var(--fg)]" data-testid="shared-child-name">{view.data.child.name}</h1>
            <div className="text-sm text-[var(--fg2)]">{view.data.child.age_label} · {view.data.child.sex === "F" ? "nata" : "nato"} il {day(view.data.child.birth_date)} · {view.scope === "full" ? "Passaporto completo" : "Solo riepilogo"}</div>
            {view.data.contact && <div className="text-sm text-[var(--fg2)]" data-testid="shared-contact">Genitore: {view.data.contact.name}{view.data.contact.phone ? ` · ${view.data.contact.phone}` : ""}</div>}</div>
          <DoctorBar view={view} />
          <PassportBody data={view.data} onPdf={view.scope === "full" ? pdf : undefined} />
        </main>
      )}
    </div>
  );
}
