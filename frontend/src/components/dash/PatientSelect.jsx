import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const PatientSelect = ({ patients, value, onChange, testId }) => (
  <Select value={value || undefined} onValueChange={(id) => onChange(patients.find((p) => p.id === id))}>
    <SelectTrigger data-testid={testId}><SelectValue placeholder="Seleziona dal passaporto sanitario" /></SelectTrigger>
    <SelectContent className="max-h-72 bg-white">
      {patients.map((p) => (
        <SelectItem key={p.id} value={p.id}>{p.name} · {p.age_label}</SelectItem>
      ))}
    </SelectContent>
  </Select>
);

export const byId = (patients) => Object.fromEntries((patients ?? []).map((p) => [p.id, p]));
