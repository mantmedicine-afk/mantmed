import { Dot, STATUS, card } from "./Panels";
import { isDone } from "./data";

const NowLine = ({ now }) => (
  <li className="flex items-center gap-3 px-4 py-1" aria-label={`Ora ${now}`} data-testid="oggi-now-line">
    <span className="text-xs font-semibold tabular-nums text-[var(--fg)]">Ora {now}</span><span className="h-px flex-1 bg-[var(--fg)] opacity-60" /><Dot color="var(--fg)" />
  </li>
);

const Visit = ({ a, patient, onSelect, onKey, refFn }) => {
  const [color, label] = STATUS[isDone(a) ? "done" : "planned"];
  return (
    <li>
      <button ref={refFn} onClick={() => onSelect(a.id)} onKeyDown={onKey}
        className="grid w-full grid-cols-[60px_1fr_auto] items-center gap-4 rounded-2xl px-4 py-4 text-left transition-colors duration-200 hover:bg-[var(--sel)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" data-testid={`oggi-visit-${a.id}`}>
        <span className="font-mono text-sm tabular-nums text-[var(--fg2)]">{a.time}</span>
        <span className="min-w-0">
          <span className="flex min-w-0 flex-wrap items-center gap-2 text-base font-semibold text-[var(--fg)]">{a.patient_name}{patient?.allergies && <span className="truncate rounded-full bg-[var(--alert-bg)] px-2 py-0.5 text-xs font-semibold text-[var(--alert)]" data-testid={`oggi-visit-allergy-${a.id}`}>Allergia: {patient.allergies}</span>}</span>
          <span className="mt-0.5 block truncate text-sm text-[var(--fg2)]">{patient?.age_label ? `${patient.age_label} · ` : ""}{a.visit_type}</span>
        </span>
        <Dot color={color} label={label} />
      </button>
    </li>
  );
};

// Una sola linea "Ora": prima della prossima visita in assoluto, oppure dopo l'ultima riga se sono tutte passate
const nowAnchor = (flat, now) => {
  const next = flat.filter((a) => a.time > now).sort((x, y) => x.time.localeCompare(y.time))[0];
  return next ? { before: next.id } : { after: flat[flat.length - 1]?.id };
};

export const AgendaList = ({ groups, patients, now, onSelect }) => {
  const flat = groups.flatMap((g) => g.items);
  const refs = [];
  const key = (i) => (e) => {
    const to = e.key === "ArrowDown" ? i + 1 : e.key === "ArrowUp" ? i - 1 : null;
    if (to == null || !refs[to]) return;
    e.preventDefault(); refs[to].focus();
  };
  const byId = Object.fromEntries(patients.map((p) => [p.id, p]));
  const anchor = nowAnchor(flat, now);
  return (
    <section className={`${card} scroll-mt-28 p-3 sm:p-5`} aria-label="Agenda di oggi" id="oggi-agenda" data-testid="oggi-agenda">
      <h2 className="px-4 pt-2 text-lg font-semibold text-[var(--fg)]">Agenda</h2>
      {flat.length === 0 && <p className="px-4 py-8 text-sm text-[var(--fg2)]" data-testid="oggi-agenda-empty">Nessuna visita in agenda per oggi.</p>}
      {groups.map((g) => g.items.length > 0 && (
        <div key={g.clinic} className="mt-5" data-testid={`oggi-group-${g.clinic.replace(/\s+/g, "-").toLowerCase()}`}>
          <h3 className="px-4 pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fg2)]">{g.clinic}</h3>
          <ul className="space-y-1">
            {g.items.map((a) => {
              const i = flat.indexOf(a);
              return [anchor.before === a.id && <NowLine key="now-b" now={now} />,
                <Visit key={a.id} a={a} patient={byId[a.patient_id]} onSelect={onSelect} onKey={key(i)} refFn={(el) => { refs[i] = el; }} />,
                anchor.after === a.id && <NowLine key="now-a" now={now} />];
            })}
          </ul>
        </div>
      ))}
      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-[var(--sel)] px-4 pb-1 pt-4 text-xs text-[var(--fg2)]" data-testid="oggi-legend">
        <span className="flex items-center gap-2"><Dot color="var(--ok)" /> Fatto</span>
        <span className="flex items-center gap-2"><Dot color="var(--wait)" /> In programma</span>
        <span className="flex items-center gap-2"><Dot color="var(--alert)" /> Allergie</span>
      </div>
    </section>
  );
};
