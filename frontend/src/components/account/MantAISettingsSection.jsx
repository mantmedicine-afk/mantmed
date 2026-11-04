import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { api, errMsg } from "@/lib/api";

const Row = ({ id, title, text, checked, onChange }) => (
  <label className="flex items-start justify-between gap-6 rounded-2xl border border-[var(--hair)] bg-[var(--surface)] p-5" htmlFor={id}>
    <span><span className="block font-semibold text-[var(--fg)]">{title}</span><span className="mt-1 block text-sm text-[var(--fg2)]">{text}</span></span>
    <Switch id={id} checked={checked} onCheckedChange={onChange} data-testid={`${id}-switch`} />
  </label>
);

export const MantAISettingsSection = () => {
  const [s, setS] = useState(null);
  useEffect(() => { api.mantaiSettings().then(setS).catch((e) => toast.error(errMsg(e))); }, []);
  const save = async (patch) => {
    const prev = s;
    setS({ ...s, ...patch });
    try { setS(await api.saveMantaiSettings(patch)); toast.success("Impostazioni MantAI salvate"); } catch (e) { setS(prev); toast.error(errMsg(e)); }
  };
  if (!s) return null;
  return (
    <div className="space-y-4" data-testid="mantai-settings">
      <Row id="mantai-realtime" title="Checklist in tempo reale" checked={s.realtime} onChange={(v) => save({ realtime: v })}
        text="Durante la registrazione MantAI trascrive l'audio a blocchi di 30 secondi e spunta i campi del modello man mano. Se è spenta, i campi si compilano solo al termine." />
      {s.demo_available && <Row id="mantai-demo" title="Modalità dimostrativa" checked={s.demo} onChange={(v) => save({ demo: v })}
        text="Solo per presentazioni: i campi si spuntano con dati finti e la nota è di esempio. Nessun costo AI, nessun audio inviato." />}
    </div>
  );
};
