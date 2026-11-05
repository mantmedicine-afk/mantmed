import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Eye, EyeOff, Layers, Lock, RotateCcw, Sparkles } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { useModules } from "@/lib/modules";
import { Card, inp } from "./ui";

const GROUPS = { anamnesi: "Anamnesi", parametri: "Parametri", esame_obiettivo: "Esame obiettivo", esami: "Esami", piano: "Piano" };
const btn = "flex h-9 items-center gap-1.5 rounded-full border border-[var(--hair)] px-3 text-sm hover:border-[var(--accent)] disabled:opacity-40";

const FieldRow = ({ f, hidden, onToggle, onMove, first, last }) => (
  <li className="flex items-center gap-2 rounded-xl border border-[var(--hair)] px-3 py-2 text-sm" data-testid={`module-pref-${f.key}`}>
    <span className={`min-w-0 flex-1 ${hidden ? "text-[var(--fg2)] line-through" : ""}`}>{f.label}</span>
    <button onClick={() => onMove(-1)} disabled={first} className="grid h-8 w-8 place-items-center rounded-full hover:bg-[var(--raised)] disabled:opacity-30" aria-label="Sposta su" data-testid={`module-pref-up-${f.key}`}><ArrowUp size={14} /></button>
    <button onClick={() => onMove(1)} disabled={last} className="grid h-8 w-8 place-items-center rounded-full hover:bg-[var(--raised)] disabled:opacity-30" aria-label="Sposta giù" data-testid={`module-pref-down-${f.key}`}><ArrowDown size={14} /></button>
    <button onClick={onToggle} className="grid h-8 w-8 place-items-center rounded-full hover:bg-[var(--raised)]" aria-label={hidden ? "Mostra campo" : "Nascondi campo"} data-testid={`module-pref-toggle-${f.key}`}>{hidden ? <EyeOff size={14} /> : <Eye size={14} />}</button>
  </li>
);

const Suggestions = ({ items, act }) => (items?.length ? (
  <div className="mt-6 rounded-2xl bg-[var(--raised)] p-4" data-testid="module-suggestions">
    <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles size={14} /> Voci che ricorrono spesso nelle sue visite</div>
    {items.map((s) => (
      <div key={s.titolo} className="mt-3 flex flex-wrap items-center gap-2 text-sm" data-testid={`module-suggestion-${s.titolo}`}>
        <span className="flex-1">{s.titolo} <span className="text-[var(--fg2)]">· in {s.visite} visite</span></span>
        <button onClick={() => act(s.titolo, "add")} className={btn} data-testid={`module-suggestion-add-${s.titolo}`}>Aggiungi al modello</button>
        <button onClick={() => act(s.titolo, "ignore")} className={btn} data-testid={`module-suggestion-ignore-${s.titolo}`}>Ignora</button>
      </div>
    ))}
  </div>
) : null);

export const ModuleSettingsCard = () => {
  const cat = useModules();
  const [s, setS] = useState(null);
  const [hidden, setHidden] = useState([]);
  const [order, setOrder] = useState([]);
  const apply = (r) => { setS(r); setHidden(r.layout?.nascosti ?? []); setOrder(r.layout?.ordine ?? []); };
  useEffect(() => { api.moduleSettings().then(apply).catch(() => {}); }, []);
  const run = async (p, ok) => { try { apply(await p); if (ok) toast.success(ok); } catch (e) { toast.error(errMsg(e)); } };
  if (!s || !cat) return null;
  const mod = cat.moduli.find((m) => m.id === s.module_id);
  const keys = (mod?.campi ?? []).map((f) => f.key);
  const ordered = [...keys].sort((a, b) => (order.includes(a) ? order.indexOf(a) : 99 + keys.indexOf(a)) - (order.includes(b) ? order.indexOf(b) : 99 + keys.indexOf(b)));
  const move = (k, d) => { const o = [...ordered]; const i = o.indexOf(k); [o[i], o[i + d]] = [o[i + d], o[i]]; setOrder(o); };
  const autoName = cat.moduli.find((m) => m.id === s.auto)?.nome;
  return (
    <Card id="module-settings" icon={Layers} title="Cartella della specialità" text="Campi della cartella usati nelle nuove visite. Le visite già fatte restano con i loro campi.">
      <label className="block max-w-md">
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--fg2)]">Modulo in uso</span>
        <select value={s.choice} onChange={(e) => run(api.setModuleChoice(e.target.value), "Modulo aggiornato per le prossime visite")} className={inp} data-testid="module-choice-select">
          <option value="">Automatico dalla specialità ({autoName})</option>
          {s.available.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
      </label>
      <p className="mt-4 flex items-center gap-2 text-sm text-[var(--fg2)]"><Lock size={14} /> Campi base fissi: motivo, anamnesi, allergie, farmaci in uso, sintomi, esame obiettivo, diagnosi, terapia, follow-up.</p>
      {keys.length > 0 && (
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {Object.entries(GROUPS).map(([g, label]) => {
            const fs = ordered.map((k) => mod.campi.find((f) => f.key === k)).filter((f) => f.gruppo === g);
            if (!fs.length) return null;
            return (
              <div key={g}>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--fg2)]">{g === "esami" ? mod.gruppi?.esami ?? label : label}</div>
                <ul className="space-y-1.5">{fs.map((f, i) => <FieldRow key={f.key} f={f} hidden={hidden.includes(f.key)} first={i === 0} last={i === fs.length - 1}
                  onToggle={() => setHidden((h) => (h.includes(f.key) ? h.filter((x) => x !== f.key) : [...h, f.key]))}
                  onMove={(d) => move(f.key, ordered.indexOf(fs[i + d].key) - ordered.indexOf(f.key))} />)}</ul>
              </div>
            );
          })}
        </div>
      )}
      {keys.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          <button onClick={() => run(api.setModulePrefs(s.module_id, hidden, ordered), "Personalizzazione salvata")} className="flex h-10 items-center rounded-full bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--ink)]" data-testid="module-prefs-save">Salva personalizzazione</button>
          <button onClick={() => run(api.resetModule(s.module_id), "Modello predefinito ripristinato")} className={btn} data-testid="module-prefs-reset"><RotateCcw size={14} /> Ripristina modello predefinito</button>
        </div>
      )}
      <Suggestions items={s.suggestions} act={(t, a) => run(api.moduleSuggestion(t, a), a === "add" ? "Campo aggiunto al modello visita" : "Suggerimento ignorato")} />
    </Card>
  );
};
