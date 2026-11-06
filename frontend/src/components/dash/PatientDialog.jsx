import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, errMsg } from "@/lib/api";
import { Field } from "./AppointmentDialog";

const EMPTY = { name: "", birth_date: "", sex: "F", fiscal_code: "", guardian: "", guardian_email: "", guardian_fiscal_code: "", guardian2: "", guardian2_email: "", patient_email: "", allergies: "", chronic_conditions: "", therapies: "", blood_group: "", notes: "" };

export const PatientDialog = ({ value, onClose, onSaved }) => {
  const [f, setF] = useState(EMPTY);
  const isEdit = Boolean(value?.id);
  useEffect(() => {
    if (value) setF({ ...EMPTY, ...value });
  }, [value]);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    if (!f.name.trim() || !f.birth_date) return toast.error("Nome e data di nascita sono obbligatori");
    const cf = f.fiscal_code.trim().toUpperCase();
    if (cf && !/^[A-Z0-9]{16}$/.test(cf)) return toast.error("Il codice fiscale deve avere 16 caratteri");
    const mail = (f.guardian_email || "").trim();
    const bad = [["guardian_email", "del primo tutore"], ["guardian2_email", "del secondo tutore"], ["patient_email", "del paziente"]].find(([k]) => (f[k] || "").trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f[k].trim()));
    if (bad) return toast.error(`Email ${bad[1]} non valida`);
    const body = { name: f.name, birth_date: f.birth_date, sex: f.sex, fiscal_code: cf, guardian: f.guardian, guardian_fiscal_code: (f.guardian_fiscal_code || "").trim().toUpperCase(), guardian_email: mail, guardian2: f.guardian2 ?? "", guardian2_email: (f.guardian2_email || "").trim(), patient_email: (f.patient_email || "").trim(), allergies: f.allergies, chronic_conditions: f.chronic_conditions ?? "", therapies: f.therapies ?? "", blood_group: f.blood_group ?? "", notes: f.notes };
    try {
      const p = isEdit ? await api.updatePatient(value.id, body) : await api.addPatient(body);
      toast.success(isEdit ? "Passaporto aggiornato" : "Paziente aggiunto al passaporto sanitario");
      onSaved(p);
      onClose();
    } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <Dialog open={Boolean(value)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="z-[60] max-h-[92vh] overflow-y-auto rounded-3xl bg-[var(--surface)] sm:max-w-md" data-testid="patient-dialog">
        <DialogHeader><DialogTitle className="font-display text-3xl font-normal text-[var(--fg)]">{isEdit ? "Modifica paziente" : "Nuovo paziente"}</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <Field label="Nome e cognome"><Input value={f.name} onChange={set("name")} data-testid="patient-name-input" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data di nascita"><Input type="date" value={f.birth_date} onChange={set("birth_date")} data-testid="patient-birth-input" /></Field>
            <Field label="Sesso">
              <div className="flex gap-2">
                {[["F", "F"], ["M", "M"]].map(([v, l]) => (
                  <button key={v} onClick={() => setF((p) => ({ ...p, sex: v }))} className={`h-10 flex-1 rounded-xl text-sm font-medium ${f.sex === v ? "bg-[var(--accent)] text-[var(--ink)]" : "border border-[var(--hair)] text-[var(--fg2)]"}`} data-testid={`patient-sex-${v}`}>{l}</button>
                ))}
              </div>
            </Field>
          </div>
          <Field label="Codice fiscale"><Input value={f.fiscal_code} onChange={set("fiscal_code")} maxLength={16} className="font-mono uppercase" data-testid="patient-cf-input" /></Field>
          <Field label="Email del paziente (se maggiorenne: referti e accesso al portale)"><Input type="email" value={f.patient_email ?? ""} onChange={set("patient_email")} placeholder="nome@email.it" data-testid="patient-email-input" /></Field>
          <Field label="Primo genitore / tutore"><Input value={f.guardian} onChange={set("guardian")} placeholder="es. Nome Cognome" data-testid="patient-guardian-input" /></Field>
          <Field label="Codice fiscale del genitore / tutore (per il FSE)"><Input value={f.guardian_fiscal_code ?? ""} onChange={set("guardian_fiscal_code")} maxLength={16} className="font-mono uppercase" data-testid="patient-guardian-cf-input" /></Field>
          <Field label="Email del primo tutore (minorenne: referti e portale)"><Input type="email" value={f.guardian_email} onChange={set("guardian_email")} placeholder="nome@email.it" data-testid="patient-guardian-email-input" /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Secondo genitore / tutore"><Input value={f.guardian2 ?? ""} onChange={set("guardian2")} placeholder="facoltativo" data-testid="patient-guardian2-input" /></Field>
            <Field label="Email del secondo tutore"><Input type="email" value={f.guardian2_email ?? ""} onChange={set("guardian2_email")} placeholder="facoltativa" data-testid="patient-guardian2-email-input" /></Field>
          </div>
          <Field label="Allergie"><Input value={f.allergies} onChange={set("allergies")} data-testid="patient-allergies-input" /></Field>
          <Field label="Patologie croniche"><Input value={f.chronic_conditions ?? ""} onChange={set("chronic_conditions")} placeholder="es. asma, celiachia" data-testid="patient-chronic-input" /></Field>
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Field label="Terapie in corso"><Input value={f.therapies ?? ""} onChange={set("therapies")} data-testid="patient-therapies-input" /></Field>
            <Field label="Gruppo sanguigno"><select value={f.blood_group ?? ""} onChange={set("blood_group")} className="h-10 w-full rounded-md border border-[var(--hair)] bg-[var(--surface)] px-2 text-sm text-[var(--fg)]" data-testid="patient-blood-group-select"><option value="">Non noto</option>{["0 Rh+", "0 Rh-", "A Rh+", "A Rh-", "B Rh+", "B Rh-", "AB Rh+", "AB Rh-"].map((g) => <option key={g}>{g}</option>)}</select></Field>
          </div>
          <Field label="Note cliniche"><Input value={f.notes} onChange={set("notes")} data-testid="patient-notes-input" /></Field>
        </div>
        <div className="mt-2 flex justify-end">
          <button onClick={save} className="rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-medium text-[var(--ink)] transition-transform hover:-translate-y-0.5" data-testid="patient-save-btn">Salva</button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
