import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, CLINICS, errMsg } from "@/lib/api";
import { Field } from "./AppointmentDialog";

const EMPTY = { name: "", clinic: CLINICS[0], reason: "", age: "", priority: "normale" };

export const WaitingDialog = ({ value, onClose, onSaved }) => {
  const [f, setF] = useState(EMPTY);
  const isEdit = Boolean(value?.id);
  useEffect(() => {
    if (value) setF({ ...EMPTY, ...value, age: value.age ?? "" });
  }, [value]);
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v?.target ? v.target.value : v }));

  const save = async () => {
    if (!f.name.trim() || !f.reason.trim()) return toast.error("Nome e motivo sono obbligatori");
    const body = { name: f.name, clinic: f.clinic, reason: f.reason, priority: f.priority, age: f.age === "" ? null : Number(f.age) };
    try {
      isEdit ? await api.updateWaiting(value.id, body) : await api.addWaiting(body);
      toast.success(isEdit ? "Paziente aggiornato" : "Paziente aggiunto in sala d'attesa");
      onSaved();
      onClose();
    } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <Dialog open={Boolean(value)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-3xl bg-white sm:max-w-md" data-testid="waiting-dialog">
        <DialogHeader><DialogTitle className="font-display text-3xl font-normal text-night">{isEdit ? "Modifica paziente" : "Nuovo paziente in attesa"}</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-[1fr_90px] gap-3">
            <Field label="Nome e cognome"><Input value={f.name} onChange={set("name")} data-testid="waiting-name-input" /></Field>
            <Field label="Età"><Input type="number" value={f.age} onChange={set("age")} data-testid="waiting-age-input" /></Field>
          </div>
          <Field label="Motivo della visita"><Input value={f.reason} onChange={set("reason")} data-testid="waiting-reason-input" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Studio">
              <Select value={f.clinic} onValueChange={set("clinic")}>
                <SelectTrigger data-testid="waiting-clinic-select"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-white">{CLINICS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Priorità">
              <Select value={f.priority} onValueChange={set("priority")}>
                <SelectTrigger data-testid="waiting-priority-select"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-white"><SelectItem value="normale">Normale</SelectItem><SelectItem value="urgente">Urgente</SelectItem></SelectContent>
              </Select>
            </Field>
          </div>
        </div>
        <div className="mt-2 flex justify-end">
          <button onClick={save} className="rounded-full bg-night px-6 py-3 text-sm font-medium text-white transition-transform hover:-translate-y-0.5 active:scale-95" data-testid="waiting-save-btn">Salva</button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
