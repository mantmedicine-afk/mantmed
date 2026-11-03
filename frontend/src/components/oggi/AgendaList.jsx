import { useRef } from "react";
import { Dot, STATUS } from "./Panels";
import { isDone } from "./data";

const NowLine = ({ now }) => (
  <li className="flex items-center gap-3 px-3 py-1.5" aria-label={`Ora ${now}`} data-testid="oggi-now-line">
    <span className="text-xs font-semibold text-[var(--accent)]">Ora {now}</span><span className="h-px flex-1 bg-[var(--accent)]" /><Dot color="var(--accent)" />
  </li>
);

const Visit = ({ a, patient, selected, onSelect, onKey, refFn }) => {
  const [color, label] = STATUS[isDone(a) ? "done" : "planned"];
  return (
    <li>
      <button ref={refFn} onClick={() => onSelect(a.id)} onKeyDown={onKey} aria-pressed={selected}
        className={`grid w-full grid-cols-[52px_1fr_auto] items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${selected ? "bg-[var(--raised)]" : "hover:bg-[var(--sel)]"}`} data-testid={`oggi-visit-${a.id}`}>
        <span className="font-mono text-sm tabular-nums text-[var(--fg2)]">{a.time}</span>
        <span className="min-w-0">
          <span className="flex min-w-0 flex-wrap items-center gap-2 text-[15px] font-semibold text-[var(--fg)]">{a.patient_name}{patient?.allergies && <span className="truncate rounded-full bg-[var(--alert-bg)] px-2 py-0.5 text-xs font-semibold text-[var(--alert)]" data-testid={`oggi-visit-allergy-${a.id}`}>Allergia: {patient.allergies}</span>}</span>
          <span className="block truncate text-sm text-[var(--fg2)]">{patient?.age_label ? `${patient.age_label} · ` : ""}{a.visit_type}</span>
        </span>
        <Dot color={color} label={label} />
      </button>
    </li>
  );
};

export const AgendaList = ({ groups, patients, now, nowBefore, selected, onSelect }) => {
  const refs = useRef([]);
  const flat = groups.flatMap((g) => g.items);
  const key = (i) => (e) => {
    const to = e.key === "ArrowDown" ? i + 1 : e.key === "ArrowUp" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? flat.length - 1 : null;
    if (to == null || !refs.current[to]) return;
    e.preventDefault(); refs.current[to].focus(); onSelect(flat[to].id);
  };
  const byId = Object.fromEntries(patients.map((p) => [p.id, p]));
  return (
    <section className="rounded-[20px] border border-[var(--hair)] bg-[var(--surface)] p-3 sm:p-4" aria-label="Agenda di oggi" data-testid="oggi-agenda">
      <h2 className="px-3 pt-2 text-base font-semibold text-[var(--fg)]">Agenda</h2>
      {flat.length === 0 && <p className="px-3 py-6 text-sm text-[var(--fg2)]" data-testid="oggi-agenda-empty">Nessuna visita in agenda per oggi.</p>}
      {groups.map((g) => g.items.length > 0 && (
        <div key={g.clinic} className="mt-3" data-testid={`oggi-group-${g.clinic.replace(/\s+/g, "-").toLowerCase()}`}>
          <h3 className="px-3 pb-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--fg2)]">{g.clinic}</h3>
          <ul className="space-y-0.5">
            {g.items.map((a) => {
              const i = flat.indexOf(a);
              return [nowBefore === a.id && <NowLine key="now" now={now} />,
                <Visit key={a.id} a={a} patient={byId[a.patient_id]} selected={selected === a.id} onSelect={onSelect} onKey={key(i)} refFn={(el) => { refs.current[i] = el; }} />];
            })}
            {nowBefore === `end-${g.clinic}` && <NowLine now={now} />}
          </ul>
        </div>
      ))}
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-[var(--sel)] px-3 pb-1 pt-3 text-xs text-[var(--fg2)]" data-testid="oggi-legend">
        <span className="flex items-center gap-2"><Dot color="var(--ok)" /> Fatto</span>
        <span className="flex items-center gap-2"><Dot color="var(--wait)" /> In programma</span>
        <span className="rounded-full bg-[var(--alert-bg)] px-2 py-0.5 font-semibold text-[var(--alert)]">Allergia: …</span>
      </div>
    </section>
  );
};
