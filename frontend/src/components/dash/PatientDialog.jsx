import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, errMsg } from "@/lib/api";
import { Field } from "./AppointmentDialog";

const EMPTY = { name: "", birth_date: "", sex: "F", guardian: "", allergies: "", notes: "" };

export const PatientDialog = ({ value, onClose, onSaved }) => {
  const [f, setF] = useState(EMPTY);
  const isEdit = Boolean(value?.id);
  useEffect(() => {
    if (value) setF({ ...EMPTY, ...value });
  }, [value]);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    if (!f.name.trim() || !f.birth_date) return toast.error("Nome e data di nascita sono obbligatori");
    const body = { name: f.name, birth_date: f.birth_date, sex: f.sex, guardian: f.guardian, allergies: f.allergies, notes: f.notes };
    try {
      const p = isEdit ? await api.updatePatient(value.id, body) : await api.addPatient(body);
      toast.success(isEdit ? "Passaporto aggiornato" : "Paziente aggiunto al passaporto sanitario");
      onSaved(p);
      onClose();
    } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <Dialog open={Boolean(value)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="z-[60] rounded-3xl bg-white sm:max-w-md" data-testid="patient-dialog">
        <DialogHeader><DialogTitle className="font-display text-3xl font-normal text-night">{isEdit ? "Modifica paziente" : "Nuovo paziente"}</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <Field label="Nome e cognome"><Input value={f.name} onChange={set("name")} data-testid="patient-name-input" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data di nascita"><Input type="date" value={f.birth_date} onChange={set("birth_date")} data-testid="patient-birth-input" /></Field>
            <Field label="Sesso">
              <div className="flex gap-2">
                {[["F", "F"], ["M", "M"]].map(([v, l]) => (
                  <button key={v} onClick={() => setF((p) => ({ ...p, sex: v }))} className={`h-10 flex-1 rounded-xl text-sm font-medium ${f.sex === v ? "bg-night text-white" : "border border-slate-200 text-slate-600"}`} data-testid={`patient-sex-${v}`}>{l}</button>
                ))}
              </div>
            </Field>
          </div>
          <Field label="Genitore / tutore"><Input value={f.guardian} onChange={set("guardian")} placeholder="es. Mamma: Nome Cognome" data-testid="patient-guardian-input" /></Field>
          <Field label="Allergie"><Input value={f.allergies} onChange={set("allergies")} data-testid="patient-allergies-input" /></Field>
          <Field label="Note cliniche"><Input value={f.notes} onChange={set("notes")} data-testid="patient-notes-input" /></Field>
        </div>
        <div className="mt-2 flex justify-end">
          <button onClick={save} className="rounded-full bg-night px-6 py-3 text-sm font-medium text-white transition-transform hover:-translate-y-0.5" data-testid="patient-save-btn">Salva</button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
