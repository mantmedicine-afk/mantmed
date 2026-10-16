import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, Lock, ShieldCheck, Server, FileCheck2, AlertTriangle, CheckCircle2, ScrollText } from "lucide-react";
import { http } from "@/lib/api";
import { TwoFactorCard } from "./Security";

const ACTION = { accesso_passaporto: "Accesso al passaporto", referto_pdf: "Referto PDF generato", referto_email: "Referto inviato via email", consenso_registrato: "Consenso registrato", consenso_revocato: "Consenso revocato" };
const STEPS = [
  "Crea un cluster su MongoDB Atlas scegliendo la regione Francoforte (eu-central-1) o Milano (eu-south-1).",
  "Abilita la crittografia a riposo del cluster e, se disponibile, il backup in regione UE.",
  "Aggiungi gli IP di uscita di Emergent alla allowlist del cluster (elenco su app.emergent.sh/ip-addresses).",
  "Nel pannello Secrets → System keys imposta MONGO_URL e DB_NAME del nuovo cluster e DATA_REGION (es. eu-central-1 Francoforte).",
  "Esegui il redeploy: questo pannello mostrerà il database in UE. Per l'hosting dell'app in UE valuta un provider esterno qualificato ACN.",
];

export const CompliancePanel = ({ onClose }) => {
  const [d, setD] = useState(null);
  useEffect(() => {
    http.get("/compliance/status").then((r) => setD(r.data)).catch(() => setD(null));
  }, []);
  const enc = d?.encryption;
  const totalDocs = enc?.collections?.reduce((s, c) => s + c.documents, 0) ?? 0;
  const encDocs = enc?.collections?.reduce((s, c) => s + c.encrypted, 0) ?? 0;

  return (
    <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="fixed inset-0 z-50 overflow-auto bg-paper" data-testid="compliance-panel" data-lenis-prevent>
      <header className="grain relative bg-night text-white">
        <div className="relative z-10 mx-auto flex max-w-[1280px] items-start justify-between px-5 py-8 lg:px-10">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-[#C9CCD3]">Impostazioni · Sicurezza e GDPR</div>
            <h2 className="mt-2 font-display text-5xl">Conformità dei dati sanitari</h2>
          </div>
          <button onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full border border-white/20 hover:bg-white hover:text-night" data-testid="compliance-close-btn" aria-label="Chiudi"><X size={18} /></button>
        </div>
      </header>
      <main className="mx-auto grid max-w-[1280px] grid-cols-1 gap-4 px-5 py-8 lg:grid-cols-2 lg:px-10">
        <Card icon={Lock} title="Crittografia a riposo" ok={encDocs === totalDocs} id="compliance-encryption">
          <div className="font-display text-4xl text-night">{enc?.algorithm ?? "—"}</div>
          <p className="mt-1 text-sm text-slate-600">{encDocs} / {totalDocs} documenti con campi sanitari crittografati · impronta chiave <span className="font-mono">{enc?.key_fingerprint}</span></p>
          <p className="text-sm text-slate-600">{enc?.key_storage}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(enc?.collections ?? []).map((c) => (
              <div key={c.collection} className="rounded-xl bg-[#F4F5F7] px-3 py-2" title={c.fields.join(", ")}>
                <div className="text-xs capitalize text-slate-500">{c.collection}</div>
                <div className="font-mono text-sm text-night">{c.encrypted}/{c.documents}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card icon={ShieldCheck} title="Protezione in transito e accesso" ok id="compliance-transit">
          <Row label="Connessione">HTTPS/TLS con HSTS</Row>
          <Row label="Cookie di sessione">{d?.transit?.cookies}</Row>
          <Row label="Sessione">{d?.transit?.session}</Row>
          <Row label="Accesso">Account unico del medico · blocco 15 min dopo 5 tentativi · 2FA opzionale</Row>
          <Row label="Inattività">Chiusura automatica della sessione (server e browser)</Row>
        </Card>
        <Card icon={Server} title="Localizzazione del database" ok={d?.database?.eu} id="compliance-database">
          <Row label="Provider">{d?.database?.provider}</Row>
          <Row label="Regione">{d?.database?.region}</Row>
          {!d?.database?.eu && <p className="mt-3 flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800"><AlertTriangle size={16} className="mt-0.5 shrink-0" /> I dati non risiedono ancora in UE. Segui la guida qui sotto per collegare un cluster europeo prima di usare dati reali.</p>}
          <ol className="mt-3 space-y-2" data-testid="compliance-eu-guide">
            {STEPS.map((s, i) => <li key={i} className="flex gap-3 text-sm text-slate-700"><span className="font-mono text-xs text-slate-400">0{i + 1}</span>{s}</li>)}
          </ol>
        </Card>
        <Card icon={FileCheck2} title="Consensi informati" ok={d && d.consents.with_consent === d.consents.patients} id="compliance-consents">
          <div className="font-display text-4xl text-night">{d?.consents?.with_consent ?? 0} / {d?.consents?.patients ?? 0}</div>
          <p className="text-sm text-slate-600">pazienti con consenso privacy valido · {d?.consents?.version}</p>
          <p className="mt-2 text-sm text-slate-600">Senza consenso valido la visita non può essere avviata; l'invio email richiede il consenso specifico.</p>
        </Card>
        <TwoFactorCard />
        <Card icon={ScrollText} title="Registro accessi (audit)" ok id="compliance-audit" wide>
          {(d?.audit ?? []).length === 0 ? <p className="text-sm text-slate-500">Nessun evento registrato.</p> : (
            <ul className="divide-y divide-slate-100">
              {d.audit.map((a, i) => (
                <li key={i} className="flex justify-between gap-3 py-2 text-sm"><span className="text-night">{ACTION[a.action] ?? a.action}{a.subject ? ` · ${a.subject}` : ""}</span><span className="shrink-0 font-mono text-xs text-slate-500">{new Date(a.at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}</span></li>
              ))}
            </ul>
          )}
        </Card>
        <Card icon={AlertTriangle} title="Adempimenti a carico del titolare" ok={false} id="compliance-todo" wide>
          <p className="text-sm text-slate-700">Nomina dei responsabili esterni e DPA con i fornitori · registro dei trattamenti · DPIA per dati sanitari · validazione dell'informativa con il consulente privacy/DPO · hosting dell'app su infrastruttura qualificata in UE.</p>
        </Card>
      </main>
    </motion.div>
  );
};

const Card = ({ icon: Icon, title, ok, children, id, wide }) => (
  <section className={`rounded-3xl border border-slate-200 bg-white p-6 ${wide ? "lg:col-span-2" : ""}`} data-testid={id}>
    <div className="mb-3 flex items-center justify-between">
      <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-slate-600"><Icon size={16} className="text-night" /> {title}</h3>
      {ok ? <CheckCircle2 size={18} className="text-emerald-600" /> : <AlertTriangle size={18} className="text-amber-600" />}
    </div>
    {children}
  </section>
);

const Row = ({ label, children }) => (
  <div className="flex justify-between gap-4 border-b border-slate-100 py-2 text-sm last:border-0"><span className="text-slate-500">{label}</span><span className="text-right text-night">{children ?? "—"}</span></div>
);
