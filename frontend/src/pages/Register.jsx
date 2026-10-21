import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { AlertCircle, ArrowLeft, ArrowRight, Loader2, Hourglass, Stethoscope, Baby } from "lucide-react";
import { LogoMark } from "@/components/dash/Logo";
import { api, errMsg } from "@/lib/api";
import { VALIDATORS, EMAIL_RE, serverFieldErrors } from "@/lib/validators";
import { RegisterField, FieldMsg } from "@/components/auth/RegisterField";
import { CodeStep } from "@/components/auth/CodeStep";
import { Strength } from "@/components/auth/PasswordRules";

const CONSENT_TEXT = "Informativa privacy e consenso al trattamento dei dati sanitari v1.0";

const DOCTOR_FIELDS = [
  ["first_name", "Nome", "es. Mario"], ["last_name", "Cognome", "es. Rossi"], ["specialty", "Specializzazione", "es. Pediatria"],
  ["order_number", "Numero iscrizione Ordine", "es. RC 1234"], ["email", "Email professionale", "es. nome@studio.it", "email"],
  ["phone", "Telefono", "es. +39 333 1234567", "tel"], ["studio_address", "Sede dello studio", "es. Via Roma 1, Reggio Calabria", "text", true],
];
const PARENT_FIELDS = [
  ["first_name", "Nome", "es. Giulia"], ["last_name", "Cognome", "es. Russo"], ["child_fiscal_code", "Codice fiscale del bambino", "16 caratteri, es. RSSMRA…", "text", true],
  ["email", "Email (la stessa comunicata allo studio)", "es. nome@email.it", "email"], ["phone", "Cellulare", "es. 333 1234567", "tel"],
];

const Shell = ({ icon: Icon, kicker, title, children }) => (
  <div className="grain relative min-h-screen overflow-hidden bg-[#0A192F] px-5 py-10 text-white" data-testid="register-page">
    <div className="relative mx-auto max-w-2xl">
      <Link to="/" className="inline-flex items-center gap-3" data-testid="register-home-link"><LogoMark size={34} light /><span className="font-display text-2xl">MantMed</span></Link>
      <div className="mt-10 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-[#C9CCD3]"><Icon size={14} /> {kicker}</div>
      <h1 className="mt-2 font-display text-4xl leading-tight sm:text-5xl">{title}</h1>
      <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mt-8 rounded-[28px] border border-[#C9CCD3]/25 bg-white/[0.04] p-6 backdrop-blur-xl sm:p-8">{children}</motion.div>
    </div>
  </div>
);

const Pending = () => (
  <div className="text-center" data-testid="register-pending">
    <Hourglass className="mx-auto text-[#C9CCD3]" size={34} />
    <h2 className="mt-4 font-display text-3xl">Registrazione ricevuta</h2>
    <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-200">Email verificata. Il team MantMed verificherà i suoi dati professionali e attiverà la licenza: riceverà un'email appena potrà accedere al suo studio.</p>
    <Link to="/" className="mt-6 inline-flex h-11 items-center rounded-full border border-[#C9CCD3]/40 px-6 text-sm" data-testid="register-pending-home">Torna al sito</Link>
  </div>
);

const Redirecting = () => (
  <div className="py-8 text-center" data-testid="register-redirecting">
    <Loader2 className="mx-auto animate-spin text-[#C9CCD3]" size={30} />
    <p className="mt-4 font-display text-2xl">Account attivo</p>
    <p className="mt-1 text-sm text-slate-300">Apertura del Portale Paziente…</p>
  </div>
);

const useEmailCheck = (email, valid) => {
  const [state, setState] = useState({ email: "", status: "idle" });
  const check = async () => {
    const e = (email || "").trim().toLowerCase();
    if (!valid || state.email === e) return;
    setState({ email: e, status: "checking" });
    try { const r = await api.emailAvailable(e); setState({ email: e, status: r.available ? "ok" : "taken" }); }
    catch { setState({ email: e, status: "idle" }); }
  };
  const current = state.email === (email || "").trim().toLowerCase() ? state.status : "idle";
  return { status: current, check, markTaken: () => setState({ email: (email || "").trim().toLowerCase(), status: "taken" }) };
};

const fieldError = (k, f) => (k === "confirm" ? (f.confirm && f.confirm === f.password ? "" : f.confirm ? "Le password non coincidono" : "Ripeta la password") : VALIDATORS[k]?.(f[k]) || "");

export default function Register({ role }) {
  const doctor = role === "doctor";
  const nav = useNavigate();
  const formRef = useRef(null);
  const [f, setF] = useState({ password: "", confirm: "", terms: false, privacy_policy: false, health_data: false });
  const [touched, setTouched] = useState({});
  const [serverErr, setServerErr] = useState({});
  const [general, setGeneral] = useState("");
  const [step, setStep] = useState("form");
  const [busy, setBusy] = useState(false);
  const [params] = useSearchParams();
  const [invite, setInvite] = useState(null);
  const token = params.get("invito");
  const fields = doctor ? DOCTOR_FIELDS : PARENT_FIELDS;
  const keys = [...fields.map(([k]) => k), "password", "confirm"];
  const emailCheck = useEmailCheck(f.email, EMAIL_RE.test((f.email || "").trim()));

  useEffect(() => {
    if (doctor || !token) return;
    api.inviteInfo(token).then((inv) => { setInvite(inv); setF((p) => ({ ...p, email: inv.email, child_fiscal_code: inv.child_fiscal_code })); })
      .catch((e) => setGeneral(errMsg(e)));
  }, [doctor, token]);

  const set = (k) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : k === "child_fiscal_code" ? e.target.value.toUpperCase().replace(/\s/g, "") : e.target.value;
    setF((p) => ({ ...p, [k]: v }));
    setServerErr((s) => ({ ...s, [k]: "" }));
  };
  const blur = (k) => () => { setTouched((t) => ({ ...t, [k]: true })); if (k === "email") emailCheck.check(); };
  const show = (k) => touched[k] || (f[k] && String(f[k]).length >= (k === "child_fiscal_code" ? 16 : 99));
  const errOf = (k) => serverErr[k] || (k === "email" && emailCheck.status === "taken" ? "Email già registrata: acceda dalla pagina di login" : "") || (show(k) ? fieldError(k, f) : "");
  const consentsOk = doctor ? f.terms : f.privacy_policy && f.health_data;

  const body = () => { const { confirm, ...b } = f; return { ...b, email: (b.email || "").trim(), role }; };
  const submit = async (e) => {
    e.preventDefault();
    setGeneral("");
    setTouched(Object.fromEntries([...keys, "consents"].map((k) => [k, true])));
    const bad = keys.find((k) => fieldError(k, f)) || (emailCheck.status === "taken" && "email");
    if (bad || !consentsOk) {
      formRef.current?.querySelector(`[name="${bad || "consents"}"]`)?.focus();
      return toast.error("Controlli i campi evidenziati");
    }
    setBusy(true);
    try { await api.registerStart(body()); setStep("code"); }
    catch (err) {
      const fe = serverFieldErrors(err);
      if (fe) { setServerErr(fe); if (fe.email) emailCheck.markTaken(); formRef.current?.querySelector(`[name="${Object.keys(fe)[0]}"]`)?.focus(); }
      else setGeneral(errMsg(err));
      toast.error(fe ? Object.values(fe)[0] : errMsg(err));
    }
    setBusy(false);
  };
  const done = async (r) => {
    if (r?.role !== "parent") return setStep("pending");
    setStep("redirect");
    toast.success(r.linked ? "Account attivo: cartella di suo figlio collegata" : "Account attivo: benvenuto nel Portale Paziente");
    setTimeout(() => nav("/portale", { replace: true }), 700);
  };

  const pwOk = !fieldError("password", f);
  return (
    <Shell icon={doctor ? Stethoscope : Baby} kicker={doctor ? "Registrazione professionisti sanitari" : "Portale Paziente · genitori e tutori"}
      title={doctor ? <>Porti il suo studio <span className="italic text-[#C9CCD3]">su MantMed.</span></> : <>Referti e appuntamenti <span className="italic text-[#C9CCD3]">di suo figlio.</span></>}>
      {step === "pending" && <Pending />}
      {step === "redirect" && <Redirecting />}
      {step === "code" && <CodeStep email={(f.email || "").trim().toLowerCase()} onDone={done} onBack={() => setStep("form")} onResend={() => api.registerStart(body())} />}
      {step === "form" && (
        <form ref={formRef} onSubmit={submit} noValidate className="space-y-4" data-testid={`register-${role}-form`}>
          {invite && <p className="rounded-2xl border border-[#C9CCD3]/30 bg-white/5 p-4 text-sm text-slate-200" data-testid="register-invite-banner">Invito di <strong className="text-white">{invite.doctor}</strong> per il portale di {invite.patient_first}: email e codice fiscale sono già compilati.</p>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {fields.map(([k, label, ph, type = "text", wide]) => (
              <RegisterField key={k} name={k} label={label} wide={wide} type={type} value={f[k] ?? ""} onChange={set(k)} onBlur={blur(k)} placeholder={ph}
                maxLength={k === "child_fiscal_code" ? 16 : undefined} className={k === "child_fiscal_code" ? "font-mono uppercase" : ""} error={errOf(k)}
                busy={k === "email" && emailCheck.status === "checking" ? "Verifica disponibilità…" : ""}
                ok={k === "email" ? (emailCheck.status === "ok" && !errOf(k) ? "Email disponibile" : "") : k === "child_fiscal_code" && f[k]?.length === 16 && !errOf(k) ? "Codice fiscale valido" : ""} />
            ))}
            <RegisterField name="password" label="Password" type="password" autoComplete="new-password" value={f.password} onChange={set("password")} onBlur={blur("password")}
              placeholder="Min. 10 caratteri, lettere, numeri e simbolo" error={errOf("password")} ok={pwOk ? "Password robusta" : ""} />
            <RegisterField name="confirm" label="Conferma password" type="password" autoComplete="new-password" value={f.confirm} onChange={set("confirm")} onBlur={blur("confirm")}
              error={errOf("confirm") || (f.confirm.length >= f.password.length && f.confirm && f.confirm !== f.password ? "Le password non coincidono" : "")} ok={f.confirm && f.confirm === f.password ? "Le password coincidono" : ""} />
          </div>
          {f.password && <Strength pw={f.password} prefix="register" />}
          {!doctor && <p className="text-xs leading-relaxed text-slate-300">La cartella di suo figlio viene collegata automaticamente solo se codice fiscale ed email coincidono con quelli registrati dallo studio.</p>}
          <div className="space-y-3">
            {doctor ? (
              <Check id="terms" checked={f.terms} onChange={set("terms")} text="Ho letto l'informativa privacy e acconsento al trattamento dei miei dati per la verifica professionale e l'attivazione della licenza MantMed." />
            ) : (
              <>
                <Check id="privacy_policy" checked={f.privacy_policy} onChange={set("privacy_policy")} text={`Ho letto l'informativa privacy (${CONSENT_TEXT}).`} />
                <Check id="health_data" checked={f.health_data} onChange={set("health_data")} text="Acconsento al trattamento dei dati sanitari di mio figlio per consultare referti, consensi e appuntamenti nel Portale Paziente (art. 9 Reg. UE 2016/679)." />
              </>
            )}
            {touched.consents && !consentsOk && <FieldMsg id="register-consents" error="Per proseguire servono i consensi obbligatori" />}
          </div>
          {general && <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-200" data-testid="register-general-error"><AlertCircle size={16} className="mt-0.5 shrink-0" /> {general}</p>}
          <button disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-[#0A192F] transition-transform hover:-translate-y-0.5 disabled:opacity-60" data-testid="register-submit-btn">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />} {busy ? "Invio in corso…" : doctor ? "Invia richiesta di registrazione" : "Crea il mio account"}
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
    <input type="checkbox" name={id === "health_data" || id === "terms" ? "consents" : id} checked={checked} onChange={onChange} className="mt-0.5 h-4 w-4 shrink-0 accent-white" data-testid={`register-${id}-checkbox`} />
    <span>{text}</span>
  </label>
);
