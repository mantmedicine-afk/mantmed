import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { it } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

// Campi data e ora sempre in formato italiano (gg/mm/aaaa, 24 ore), qualunque sia la lingua del browser.
// onChange riceve { target: { value } } con il valore ISO (AAAA-MM-GG / HH:MM), come un input nativo.
const toIt = (iso) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const toIso = (s) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T12:00:00`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
};
const maskDate = (s) => {
  const d = s.replace(/\D/g, "").slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join("/");
};
const maskTime = (s) => {
  const d = s.replace(/\D/g, "").slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
};
const fire = (onChange, value) => onChange?.({ target: { value } });

export const DateInput = ({ value, onChange, min, max, className = "", required, id, "aria-label": aria, ...rest }) => {
  const [text, setText] = useState(toIt(value));
  const [open, setOpen] = useState(false);
  useEffect(() => { setText(toIt(value)); }, [value]);
  const out = (iso) => (min && iso < min) || (max && iso > max);
  const type = (e) => {
    const t = maskDate(e.target.value);
    setText(t);
    if (!t) return fire(onChange, "");
    const iso = toIso(t);
    if (iso && !out(iso)) fire(onChange, iso);
  };
  const bad = text.length === 10 && (!toIso(text) || out(toIso(text)));
  return (
    <div className="relative">
      <input id={id} value={text} onChange={type} onBlur={() => bad && setText(toIt(value))} inputMode="numeric" placeholder="gg/mm/aaaa" required={required} aria-label={aria}
        aria-invalid={bad || undefined} className={`${className} w-full pr-10 ${bad ? "border-[var(--alert)]" : ""}`} {...rest} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-[var(--fg2)] hover:text-[var(--fg)]" aria-label="Apri calendario" data-testid={rest["data-testid"] ? `${rest["data-testid"]}-calendar` : undefined}><CalendarDays size={16} /></button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar mode="single" locale={it} weekStartsOn={1} captionLayout="dropdown-buttons" fromYear={1900} toYear={new Date().getFullYear() + 5}
            selected={value ? new Date(`${value}T12:00:00`) : undefined} defaultMonth={value ? new Date(`${value}T12:00:00`) : undefined}
            disabled={(d) => out(d.toLocaleDateString("sv-SE"))}
            onSelect={(d) => { if (d) { fire(onChange, d.toLocaleDateString("sv-SE")); setOpen(false); } }} />
        </PopoverContent>
      </Popover>
    </div>
  );
};

export const TimeInput = ({ value, onChange, className = "", required, "aria-label": aria, ...rest }) => {
  const [text, setText] = useState(value ?? "");
  useEffect(() => { setText(value ?? ""); }, [value]);
  const ok = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  const type = (e) => {
    const t = maskTime(e.target.value);
    setText(t);
    if (ok(t)) fire(onChange, t);
    else if (!t) fire(onChange, "");
  };
  const bad = text.length === 5 && !ok(text);
  return <input value={text} onChange={type} onBlur={() => !ok(text) && text && setText(value ?? "")} inputMode="numeric" placeholder="hh:mm" maxLength={5} required={required} aria-label={aria}
    aria-invalid={bad || undefined} className={`${className} w-[5.5rem] tabular-nums ${bad ? "border-[var(--alert)]" : ""}`} {...rest} />;
};
