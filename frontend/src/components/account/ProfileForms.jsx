import { useState } from "react";
import { toast } from "sonner";
import { UserRound, Stethoscope } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, Field, SaveBtn, inp } from "./ui";

const useSave = (fn, onSaved) => {
  const { setUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const save = async (e, body) => {
    e.preventDefault();
    setBusy(true);
    try { const r = await fn(body); onSaved(r); setUser((u) => (u ? { ...u, name: r.name } : u)); toast.success("Dati aggiornati"); } catch (err) { toast.error(errMsg(err)); }
    setBusy(false);
  };
  return [busy, save];
};

export const ParentProfile = ({ data, onSaved }) => {
  const [f, setF] = useState(data.profile);
  const [busy, save] = useSave(api.saveParentProfile, onSaved);
  const set = (k) => (e) => setF({ ...f, [k]: k === "fiscal_code" ? e.target.value.toUpperCase().slice(0, 16) : e.target.value });
  return (
    <Card id="account-personal" icon={UserRound} title="Dati personali e anagrafica" text="I suoi dati di genitore o tutore. Codice fiscale, indirizzo e telefono sono conservati cifrati.">
      <form onSubmit={(e) => save(e, f)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nome"><input required value={f.first_name} onChange={set("first_name")} className={inp} data-testid="account-first-name" /></Field>
        <Field label="Cognome"><input required value={f.last_name} onChange={set("last_name")} className={inp} data-testid="account-last-name" /></Field>
        <Field label="Codice fiscale"><input value={f.fiscal_code} onChange={set("fiscal_code")} placeholder="RSSMRA80A01H224X" className={`${inp} font-mono uppercase`} data-testid="account-fiscal-code" /></Field>
        <Field label="Telefono"><input type="tel" value={f.phone} onChange={set("phone")} className={inp} data-testid="account-phone" /></Field>
        <Field label="Indirizzo" wide><input value={f.address} onChange={set("address")} placeholder="Via, numero civico, CAP, città" className={inp} data-testid="account-address" /></Field>
        <div className="sm:col-span-2"><SaveBtn busy={busy} testId="account-personal-save" /></div>
      </form>
    </Card>
  );
};

export const DoctorProfile = ({ data, onSaved }) => {
  const [f, setF] = useState(data.profile);
  const [busy, save] = useSave(api.saveDoctorProfile, onSaved);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Card id="account-professional" icon={Stethoscope} title="Profilo professionale" text="Questi dati compaiono nell'intestazione di referti e ricevute e nel Portale Paziente.">
      <form onSubmit={(e) => save(e, f)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Titolo"><select value={f.title} onChange={set("title")} className={inp} data-testid="account-title">{["Dott.", "Dott.ssa", "Dr."].map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Specializzazione"><input required value={f.specialty} onChange={set("specialty")} className={inp} data-testid="account-specialty" /></Field>
        <Field label="Nome"><input required value={f.first_name} onChange={set("first_name")} className={inp} data-testid="account-first-name" /></Field>
        <Field label="Cognome"><input required value={f.last_name} onChange={set("last_name")} className={inp} data-testid="account-last-name" /></Field>
        <Field label="N. iscrizione all'Albo"><input required value={f.order_number} onChange={set("order_number")} className={inp} data-testid="account-order-number" /></Field>
        <Field label="Telefono professionale"><input required type="tel" value={f.phone} onChange={set("phone")} className={inp} data-testid="account-phone" /></Field>
        <Field label="Indirizzo dello studio" wide><input required value={f.studio_address} onChange={set("studio_address")} className={inp} data-testid="account-studio-address" /></Field>
        <Field label="Email di contatto per i pazienti" wide><input type="email" value={f.contact_email} onChange={set("contact_email")} className={inp} data-testid="account-contact-email" /></Field>
        <div className="sm:col-span-2"><SaveBtn busy={busy} testId="account-professional-save" /></div>
      </form>
    </Card>
  );
};
