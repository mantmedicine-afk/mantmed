import { useState } from "react";
import { Plus, X } from "lucide-react";
import { box, pill, num, out, Verify, Plausible } from "./moduleUi";

const EYES = [["od", "OD · occhio destro"], ["os", "OS · occhio sinistro"]];
const empty = (f) => ({ od: {}, os: {}, nota: "", incerti: [] });

const Sub = ({ f, x, eye, val, set, unsure }) => {
  const [ask, setAsk] = useState(false);
  const id = `${f.key}-${eye}-${x.k}`;
  const bad = () => x.min != null && out(num(val), x.min, x.max);
  return (
    <div className="min-w-0">
      {x.label && <span className="mb-1 block text-[11px] text-[var(--fg2)]">{x.label}</span>}
      <input value={val} onChange={(e) => set(e.target.value)} onBlur={() => setAsk(bad())} inputMode={x.min != null ? "decimal" : undefined}
        className={`h-11 w-full px-3 text-[15px] outline-none ${box} ${unsure ? "border-[var(--late)]" : ""}`} aria-label={`${f.label} ${eye.toUpperCase()} ${x.label}`} data-testid={`module-eye-${id}`} />
      {unsure && <Verify id={id} />}
      {ask && <Plausible id={id} value={val} unit={x.k === "mmhg" ? "mmHg" : ""} onKeep={() => setAsk(false)} onFix={() => { setAsk(false); set(""); }} />}
    </div>
  );
};

// Colonne OD / OS affiancate (su telefono una sotto l'altra); valori come dettati
export const EyesField = ({ f, v, set }) => {
  const val = { ...empty(f), ...(v ?? {}) };
  const single = f.sub?.length === 1 && f.sub[0].k === "v";
  const upd = (eye, k, s) => set({ ...val, [eye]: { ...val[eye], [k]: s }, incerti: (val.incerti ?? []).filter((u) => u !== `${eye}.${k}`) });
  const cols = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4", 5: "grid-cols-2 sm:grid-cols-5", 6: "grid-cols-3" }[f.sub.length] ?? "grid-cols-1";
  return (
    <div className="mt-1.5">
      <div className="grid gap-3 md:grid-cols-2">
        {EYES.map(([eye, name]) => (
          <div key={eye} className="rounded-2xl border border-[var(--hair)] p-3" data-testid={`module-eye-col-${f.key}-${eye}`}>
            <div className="mb-2 text-xs font-semibold text-[var(--fg)]">{name}</div>
            {single ? (
              <textarea value={val[eye]?.v ?? ""} onChange={(e) => upd(eye, "v", e.target.value)} rows={1} className={`w-full resize-y px-3 py-2.5 text-[15px] outline-none ${box}`} aria-label={`${f.label} ${eye.toUpperCase()}`} data-testid={`module-eye-${f.key}-${eye}-v`} />
            ) : (
              <div className={`grid gap-2 ${cols}`}>
                {f.sub.map((x) => <Sub key={x.k} f={f} x={x} eye={eye} val={val[eye]?.[x.k] ?? ""} set={(s) => upd(eye, x.k, s)} unsure={(val.incerti ?? []).includes(`${eye}.${x.k}`)} />)}
              </div>
            )}
          </div>
        ))}
      </div>
      {val.nota?.trim() && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--late)] bg-[var(--late-bg)] px-3 py-2 text-sm text-[var(--fg)]" data-testid={`module-eye-nota-${f.key}`}>
          <Verify id={`${f.key}-nota`} text="Occhio non specificato – da verificare" />
          <input value={val.nota} onChange={(e) => set({ ...val, nota: e.target.value })} className="min-w-0 flex-1 bg-transparent outline-none" aria-label={`${f.label}: occhio non specificato`} data-testid={`module-eye-nota-input-${f.key}`} />
          <button type="button" onClick={() => set({ ...val, nota: "" })} className="rounded-full border border-[var(--hair)] px-3 py-1 text-xs font-semibold" data-testid={`module-eye-nota-clear-${f.key}`}>Rimuovi nota</button>
        </div>
      )}
    </div>
  );
};

const EYE_OPTS = ["OD", "OS", "OO"];
export const EyeTherapy = ({ f, v, set }) => {
  const rows = v ?? [];
  const upd = (i, patch) => set(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="mt-1.5 space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2" data-testid={`module-eye-drug-${i}`}>
          <input value={r.farmaco ?? ""} onChange={(e) => upd(i, { farmaco: e.target.value })} placeholder="Collirio o farmaco" className={`h-11 min-w-[10rem] flex-1 px-3 text-[15px] outline-none ${box}`} data-testid={`module-eye-drug-name-${i}`} />
          <div className="flex gap-1" role="radiogroup" aria-label="Occhio">
            {EYE_OPTS.map((o) => <button key={o} type="button" role="radio" aria-checked={r.occhio === o} onClick={() => upd(i, { occhio: r.occhio === o ? "" : o })} className={pill(r.occhio === o)} data-testid={`module-eye-drug-${i}-${o}`}>{o}</button>)}
          </div>
          <input value={r.posologia ?? ""} onChange={(e) => upd(i, { posologia: e.target.value })} placeholder="Posologia come prescritta" className={`h-11 min-w-[10rem] flex-1 px-3 text-sm outline-none ${box}`} data-testid={`module-eye-drug-dose-${i}`} />
          {!r.occhio && <Verify id={`eye-drug-${i}`} text="Occhio non indicato" />}
          <button type="button" onClick={() => set(rows.filter((_, j) => j !== i))} className="grid h-8 w-8 place-items-center rounded-full text-[var(--fg2)] hover:text-[var(--alert)]" aria-label="Rimuovi" data-testid={`module-eye-drug-del-${i}`}><X size={14} /></button>
        </div>
      ))}
      <button type="button" onClick={() => set([...rows, { farmaco: "", occhio: "", posologia: "" }])} className="flex items-center gap-1.5 rounded-full border border-dashed border-[var(--hair)] px-4 py-2 text-sm text-[var(--fg2)] hover:border-[var(--accent)] hover:text-[var(--fg)]" data-testid={`module-eye-drug-add-${f.key}`}><Plus size={14} /> Aggiungi collirio o farmaco</button>
    </div>
  );
};
