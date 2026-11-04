import { AlertTriangle, HeartPulse, Pill, Droplet } from "lucide-react";
import { Label, Meta, card } from "./ui";

const Items = ({ items, testId, empty }) => (items.length ? items.map((x, i) => (
  <div key={i} className="mt-2" data-testid={`${testId}-${i}`}>
    <div className="text-[15px] font-medium text-[var(--fg)]">{x.value}</div>
    <Meta by={x.by} at={x.at} />
  </div>
)) : <p className="mt-2 text-sm text-[var(--fg2)]" data-testid={`${testId}-empty`}>{empty}</p>);

export const Highlights = ({ s }) => (
  <div className="grid gap-3 md:grid-cols-2" data-testid="passport-highlights">
    <section className="rounded-3xl bg-[var(--alert-bg)] p-5 ring-1 ring-[var(--alert)] md:col-span-2" data-testid="passport-allergies-box">
      <Label icon={AlertTriangle} className="!text-[var(--alert)]">Allergie e intolleranze</Label>
      {s.allergies.length ? s.allergies.map((x, i) => (
        <div key={i} className="mt-2" data-testid={`passport-allergy-${i}`}>
          <div className="text-lg font-semibold text-[var(--alert)]">{x.value}</div>
          <Meta by={x.by} at={x.at} />
        </div>
      )) : <p className="mt-2 text-sm text-[var(--fg)]" data-testid="passport-allergy-empty">Nessuna allergia o intolleranza segnalata dai medici.</p>}
    </section>
    <section className={card}><Label icon={HeartPulse}>Patologie croniche</Label><Items items={s.chronic} testId="passport-chronic" empty="Nessuna patologia cronica registrata." /></section>
    <section className={card}><Label icon={Pill}>Terapie in corso</Label><Items items={s.therapies} testId="passport-therapy" empty="Nessuna terapia in corso." /></section>
    {s.blood_group && (
      <section className={`${card} md:col-span-2`} data-testid="passport-blood-group">
        <Label icon={Droplet}>Gruppo sanguigno</Label>
        <div className="mt-1 text-2xl font-semibold text-[var(--fg)]">{s.blood_group.value}</div>
        <Meta by={s.blood_group.by} at={s.blood_group.at} />
      </section>
    )}
  </div>
);
