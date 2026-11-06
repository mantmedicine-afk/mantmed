import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2, UserCheck, X } from "lucide-react";
import { http, errMsg } from "@/lib/api";

const inp = "h-11 w-full rounded-xl border border-[var(--hair)] bg-[var(--raised)] px-3 text-sm outline-none focus:border-[var(--accent)]";
const fmt = (d) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("it-IT") : "");
const TIPI = [["tutore_legale", "Tutore legale"], ["amministratore_sostegno", "Amministratore di sostegno"]];

const LegalForm = ({ pid, onDone }) => {
  const [f, setF] = useState({ name: "", email: "", tipo: "tutore_legale", document: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    setBusy(true);
    try { await http.post(`/patients/${pid}/access/legal`, f); toast.success("Accesso con documento di nomina attivato"); onDone(); }
    catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2" data-testid="legal-access-form">
      <input value={f.name} onChange={set("name")} placeholder="Nome e cognome" className={inp} data-testid="legal-access-name" />
      <input type="email" value={f.email} onChange={set("email")} placeholder="Email del suo account" className={inp} data-testid="legal-access-email" />
      <select value={f.tipo} onChange={set("tipo")} className={inp} data-testid="legal-access-tipo">{TIPI.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <input value={f.document} onChange={set("document")} placeholder="Documento di nomina (autorità, numero, data)" className={inp} data-testid="legal-access-document" />
      <button onClick={save} disabled={busy} className="flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--ink)] disabled:opacity-60 sm:col-span-2" data-testid="legal-access-save">
        {busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Attiva accesso con documento di nomina
      </button>
    </div>
  );
};

// Scheda paziente: chi accede dal Portale e con quale titolo (paziente, tutori, nomina, deleghe), più la data dei 18 anni
export const PortalAccess = ({ patientId }) => {
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(false);
  const load = useCallback(() => http.get(`/patients/${patientId}/access`).then((r) => setD(r.data)).catch(() => {}), [patientId]);
  useEffect(() => { load(); }, [load]);
  if (!d) return null;
  const revoke = async (g) => {
    if (!window.confirm(`Revocare l'accesso di ${g.name}? Non vedrà più la cartella nel Portale.`)) return;
    try { await http.delete(`/patients/${patientId}/access/legal/${g.id}`); toast.success("Accesso revocato"); load(); } catch (e) { toast.error(errMsg(e)); }
  };
  const active = d.grants.filter((g) => !g.revoked_at);
  return (
    <section className="mb-6 rounded-3xl border border-[var(--hair)] bg-[var(--surface)] p-5" data-testid="portal-access">
      <h3 className="font-display text-2xl text-[var(--fg)]">Accessi al Portale</h3>
      <p className="mt-1 text-sm text-[var(--fg2)]" data-testid="portal-access-age">
        {d.adult ? "Paziente maggiorenne: accede con il proprio account; i familiari solo con sua delega revocabile." : `Paziente minorenne: fino a due tutori. Il ${fmt(d.adult_on)} l'accesso dei tutori si chiude e il paziente riceve l'invito (avviso 30 giorni prima).`}
      </p>
      {!d.rules_active && <p className="mt-2 rounded-xl bg-[var(--late-bg)] px-3 py-2 text-xs text-[var(--fg)]" data-testid="portal-access-pending">Le nuove regole di accesso (tutori, 18 anni, nomine, deleghe) si attivano dopo la conversione degli account: fino ad allora il portale funziona come prima.</p>}
      <ul className="mt-3 space-y-2">
        {d.accounts.length === 0 && <li className="text-sm text-[var(--fg2)]" data-testid="portal-access-none">Nessun account collegato.</li>}
        {d.accounts.map((a) => (
          <li key={a.email} className="flex flex-wrap items-center gap-2 text-sm text-[var(--fg)]" data-testid="portal-access-account"><UserCheck size={15} /> <strong>{a.name}</strong> <span className="text-[var(--fg2)]">{a.email} · {a.label}</span></li>
        ))}
      </ul>
      {active.length > 0 && (
        <ul className="mt-3 space-y-2">
          {active.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[var(--raised)] px-3 py-2 text-sm text-[var(--fg)]" data-testid={`portal-access-grant-${g.id}`}>
              <span><strong>{g.name}</strong> · {g.kind === "legale" ? TIPI.find(([v]) => v === g.tipo)?.[1] : "Familiare delegato dal paziente"}{g.document ? ` · ${g.document}` : ""}</span>
              {g.kind === "legale" && <button onClick={() => revoke(g)} className="flex items-center gap-1 rounded-full border border-[var(--hair)] px-3 py-1 text-xs font-semibold" data-testid={`portal-access-revoke-${g.id}`}><X size={12} /> Revoca</button>}
            </li>
          ))}
        </ul>
      )}
      <button onClick={() => setOpen((o) => !o)} className="mt-4 text-sm font-semibold text-[var(--fg)] underline underline-offset-4" data-testid="legal-access-toggle">{open ? "Chiudi" : "Tutore legale o amministratore di sostegno"}</button>
      {open && <LegalForm pid={patientId} onDone={() => { setOpen(false); load(); }} />}
    </section>
  );
};
