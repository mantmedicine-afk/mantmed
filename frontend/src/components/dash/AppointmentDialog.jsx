import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, CLINICS, errMsg } from "@/lib/api";
import { PatientSelect } from "./PatientSelect";
import { DateInput, TimeInput } from "@/components/ui/it-date";

const empty = () => ({ date: new Date().toLocaleDateString("sv-SE"), clinic: CLINICS[0], time: "09:00", patient_name: "", patient_id: null, visit_type: "Visita pediatrica", duration: 30, status: "programmato" });
const STATUSES = [["programmato", "Programmato"], ["in_attesa", "In attesa"], ["in_corso", "In corso"], ["completato", "Completato"]];

export const AppointmentDialog = ({ value, onClose, onSaved, patients = [] }) => {
  const [f, setF] = useState(empty);
  const isEdit = Boolean(value?.id);
  useEffect(() => {
    if (value) setF({ ...empty(), ...value });
  }, [value]);
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v?.target ? v.target.value : v }));

  const save = async () => {
    if (!f.patient_name.trim()) return toast.error("Seleziona il paziente");
    const body = { date: f.date, clinic: f.clinic, time: f.time, patient_name: f.patient_name, patient_id: f.patient_id, visit_type: f.visit_type, duration: Number(f.duration) || 30, status: f.status };
    try {
      isEdit ? await api.updateAppointment(value.id, body) : await api.addAppointment(body);
      toast.success(isEdit ? "Appuntamento aggiornato" : "Appuntamento aggiunto");
      onSaved();
      onClose();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const remove = async () => {
    try { await api.deleteAppointment(value.id); toast.success("Appuntamento eliminato"); onSaved(); onClose(); }
    catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <Dialog open={Boolean(value)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-3xl bg-[var(--surface)] sm:max-w-md" data-testid="appointment-dialog">
        <DialogHeader><DialogTitle className="font-display text-3xl font-normal text-[var(--fg)]">{isEdit ? "Modifica appuntamento" : "Nuovo appuntamento"}</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <Field label="Paziente"><PatientSelect patients={patients} value={f.patient_id} onChange={(p) => setF((x) => ({ ...x, patient_id: p.id, patient_name: p.name }))} testId="appointment-patient-select" /></Field>
          <Field label="Tipo di visita"><Input value={f.visit_type} onChange={set("visit_type")} data-testid="appointment-type-input" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data"><DateInput className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm md:text-sm" value={f.date ?? ""} onChange={set("date")} data-testid="appointment-date-input" /></Field>
            <Field label="Orario"><TimeInput className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm md:text-sm" value={f.time} onChange={set("time")} data-testid="appointment-time-input" /></Field>
          </div>
          <div className="grid grid-cols-1 gap-3">
            <Field label="Studio">
              <Select value={f.clinic} onValueChange={set("clinic")}>
                <SelectTrigger data-testid="appointment-clinic-select"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[var(--surface)]">{CLINICS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Stato">
            <Select value={f.status} onValueChange={set("status")}>
              <SelectTrigger data-testid="appointment-status-select"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[var(--surface)]">{STATUSES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          {isEdit ? <button onClick={remove} className="text-sm font-medium text-[var(--alert)] hover:underline" data-testid="appointment-delete-btn">Elimina</button> : <span />}
          <button onClick={save} className="rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-medium text-[var(--ink)] transition-transform hover:-translate-y-0.5 active:scale-95" data-testid="appointment-save-btn">Salva</button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const Field = ({ label, children }) => (
  <div className="grid gap-1.5"><Label className="text-xs uppercase tracking-[0.16em] text-[var(--fg2)]">{label}</Label>{children}</div>
);
