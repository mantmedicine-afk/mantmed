import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Loader2, MailCheck, Hourglass, Stethoscope, Baby } from "lucide-react";
import { LogoMark } from "@/components/dash/Logo";
import { api, errMsg } from "@/lib/api";

const inp = "h-12 w-full rounded-xl border border-white/15 bg-white/5 px-4 text-sm text-white outline-none transition-colors placeholder:text-slate-400 focus:border-[#C9CCD3] focus:bg-white/10";
const CONSENT_TEXT = "Informativa privacy e consenso al trattamento dei dati sanitari v1.0";

const DOCTOR_FIELDS = [
  ["first_name", "Nome", "Mario"], ["last_name", "Cognome", "Rossi"], ["specialty", "Specializzazione", "Pediatria"],
  ["order_number", "Numero iscrizione Ordine", "RC 1234"], ["email", "Email professionale", "nome@studio.it", "email"],
  ["phone", "Telefono", "+39 333 1234567", "tel"], ["studio_address", "Sede dello studio", "Via Roma 1, Reggio Calabria", "text", true],
];
const PARENT_FIELDS = [
  ["first_name", "Nome", "Giulia"], ["last_name", "Cognome", "Russo"], ["child_fiscal_code", "Codice fiscale del bambino", "RSSSFO24E41H224K", "text", true],
  ["email", "Email (la stessa comunicata allo studio)", "nome@email.it", "email"], ["phone", "Cellulare", "333 1234567", "tel"],
];

const Shell = ({ icon: Icon, kicker, title, children }) => (
  <div className="grain relative min-h-screen overflow-hidden bg-[#0A192F] px-5 py-10 text-white" data-testid="register-page">
    <div className="relative mx-auto max-w-2xl">
      <Link to="/" className="inline-flex items-center gap-3" data-testid="register-home-link"><LogoMark size={34} light /><span className="font-display text-2xl">MantMed</span></Link>
      <div className="mt-10 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-[#C9CCD3]"><Icon size={14} /> {kicker}</div>
      <h1 className="mt-2 font-display text-4xl leading-tight sm:text-5xl">{title}</h1>
      <motion.div initial={{ y: 12 }} animate={{ y: 0 }} className="mt-8 rounded-[28px] border border-[#C9CCD3]/25 bg-white/[0.04] p-6 backdrop-blur-xl sm:p-8">{children}</motion.div>
    </div>
  </div>
);

const CodeStep = ({ email, onDone, onBack }) => {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { onDone(await api.registerVerify({ email, code })); } catch (err) { toast.error(errMsg(err)); }
    setBusy(false);
  };
  return (
    <form onSubmit={submit} data-testid="register-code-form">
      <MailCheck className="text-[#C9CCD3]" />
      <p className="mt-3 text-sm text-slate-200">Abbiamo inviato un codice a 6 cifre a <strong className="text-white">{email}</strong>. Lo inserisca qui sotto: scade tra 15 minuti.</p>
      <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoFocus placeholder="000000" className={`${inp} mt-5 text-center font-mono text-2xl tracking-[0.5em]`} data-testid="register-code-input" />
      <button disabled={busy || code.length !== 6} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-[#0A192F] disabled:opacity-50" data-testid="register-code-submit">{busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />} Verifica email</button>
      <button type="button" onClick={onBack} className="mt-3 w-full text-sm text-slate-300 underline underline-offset-4" data-testid="register-code-back">Correggi i dati o invia un nuovo codice</button>
    </form>
  );
};

const Pending = () => (
  <div className="text-center" data-testid="register-pending">
    <Hourglass className="mx-auto text-[#C9CCD3]" size={34} />
    <h2 className="mt-4 font-display text-3xl">Registrazione ricevuta</h2>
    <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-200">Email verificata. Il team MantMed verificherà i suoi dati professionali e attiverà la licenza: riceverà un'email appena potrà accedere al suo studio.</p>
    <Link to="/" className="mt-6 inline-flex h-11 items-center rounded-full border border-[#C9CCD3]/40 px-6 text-sm" data-testid="register-pending-home">Torna al sito</Link>
  </div>
);

export default function Register({ role }) {
  const doctor = role === "doctor";
  const nav = useNavigate();
  const [f, setF] = useState({ password: "", confirm: "", terms: false, privacy_policy: false, health_data: false });
  const [step, setStep] = useState("form");
  const [busy, setBusy] = useState(false);
  const [params] = useSearchParams();
  const [invite, setInvite] = useState(null);
  const token = params.get("invito");
  useEffect(() => {
    if (doctor || !token) return;
    api.inviteInfo(token).then((inv) => { setInvite(inv); setF((p) => ({ ...p, email: inv.email, child_fiscal_code: inv.child_fiscal_code })); })
      .catch((e) => toast.error(errMsg(e)));
  }, [doctor, token]);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (f.password !== f.confirm) return toast.error("Le password non coincidono");
    if (doctor ? !f.terms : !(f.privacy_policy && f.health_data)) return toast.error("Per proseguire servono i consensi obbligatori");
    setBusy(true);
    try { const { confirm, ...body } = f; await api.registerStart({ ...body, role }); setStep("code"); }
    catch (err) { toast.error(errMsg(err)); }
    setBusy(false);
  };
  const done = (r) => {
    if (r?.role === "parent") { toast.success(r.linked ? "Account attivo: cartella collegata" : "Account attivo"); nav("/portale"); }
    else setStep("pending");
  };

  const fields = doctor ? DOCTOR_FIELDS : PARENT_FIELDS;
  return (
    <Shell icon={doctor ? Stethoscope : Baby} kicker={doctor ? "Registrazione professionisti sanitari" : "Portale Paziente · genitori e tutori"}
      title={doctor ? <>Porti il suo studio <span className="italic text-[#C9CCD3]">su MantMed.</span></> : <>Referti e appuntamenti <span className="italic text-[#C9CCD3]">di suo figlio.</span></>}>
      {step === "pending" && <Pending />}
      {step === "code" && <CodeStep email={(f.email || "").trim().toLowerCase()} onDone={done} onBack={() => setStep("form")} />}
      {step === "form" && (
        <form onSubmit={submit} className="space-y-4" data-testid={`register-${role}-form`}>
          {invite && <p className="rounded-2xl border border-[#C9CCD3]/30 bg-white/5 p-4 text-sm text-slate-200" data-testid="register-invite-banner">Invito di <strong className="text-white">{invite.doctor}</strong> per il portale di {invite.patient_first}: email e codice fiscale sono già compilati.</p>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {fields.map(([k, label, ph, type = "text", wide]) => (
              <label key={k} className={wide ? "sm:col-span-2" : ""}>
                <span className="mb-1.5 block text-[11px] uppercase tracking-[0.16em] text-[#C9CCD3]">{label}</span>
                <input required type={type} value={f[k] ?? ""} onChange={set(k)} placeholder={ph} className={`${inp} ${k === "child_fiscal_code" ? "font-mono uppercase" : ""}`} data-testid={`register-${k}-input`} />
              </label>
            ))}
            <label><span className="mb-1.5 block text-[11px] uppercase tracking-[0.16em] text-[#C9CCD3]">Password</span><input required type="password" autoComplete="new-password" value={f.password} onChange={set("password")} placeholder="Almeno 10 caratteri, lettere e numeri" className={inp} data-testid="register-password-input" /></label>
            <label><span className="mb-1.5 block text-[11px] uppercase tracking-[0.16em] text-[#C9CCD3]">Conferma password</span><input required type="password" autoComplete="new-password" value={f.confirm} onChange={set("confirm")} className={inp} data-testid="register-confirm-input" /></label>
          </div>
          {!doctor && <p className="text-xs leading-relaxed text-slate-300">La cartella di suo figlio viene collegata automaticamente solo se codice fiscale ed email coincidono con quelli registrati dallo studio.</p>}
          {doctor ? (
            <Check id="terms" checked={f.terms} onChange={set("terms")} text="Ho letto l'informativa privacy e acconsento al trattamento dei miei dati per la verifica professionale e l'attivazione della licenza MantMed." />
          ) : (
            <>
              <Check id="privacy_policy" checked={f.privacy_policy} onChange={set("privacy_policy")} text={`Ho letto l'informativa privacy (${CONSENT_TEXT}).`} />
              <Check id="health_data" checked={f.health_data} onChange={set("health_data")} text="Acconsento al trattamento dei dati sanitari di mio figlio per consultare referti, consensi e appuntamenti nel Portale Paziente (art. 9 Reg. UE 2016/679)." />
            </>
          )}
          <button disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-[#0A192F] transition-transform hover:-translate-y-0.5 disabled:opacity-60" data-testid="register-submit-btn">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />} {doctor ? "Invia richiesta di registrazione" : "Crea il mio account"}
          </button>
          <div className="flex flex-wrap justify-between gap-2 text-sm text-slate-300">
            <Link to="/" className="inline-flex items-center gap-1 underline-offset-4 hover:underline" data-testid="register-back-link"><ArrowLeft size={14} /> Torna al sito</Link>
            <Link to={doctor ? "/app" : "/portale"} className="text-white underline underline-offset-4" data-testid="register-login-link">Ha già un account? Accedi</Link>
          </div>
        </form>
      )}
    </Shell>
  );
}

const Check = ({ id, checked, onChange, text }) => (
  <label className="flex items-start gap-3 text-xs leading-relaxed text-slate-200">
    <input type="checkbox" checked={checked} onChange={onChange} className="mt-0.5 h-4 w-4 shrink-0 accent-white" data-testid={`register-${id}-checkbox`} />
    <span>{text}</span>
  </label>
);
