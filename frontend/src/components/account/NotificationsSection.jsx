import { useState } from "react";
import { toast } from "sonner";
import { BellRing } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { api, errMsg } from "@/lib/api";
import { Card } from "./ui";

const LABELS = {
  appointments: ["Appuntamenti", "Conferme, promemoria e annullamenti delle visite"],
  reports: ["Nuovi referti e bilanci", "Quando il medico pubblica un referto o un bilancio di salute"],
  messages: ["Messaggi dello studio", "Risposte dei medici nel Centro messaggi"],
  bookings: ["Nuove prenotazioni", "Richieste di appuntamento e visite pagate online dal portale"],
  cancellations: ["Disdette dei pazienti", "Visite annullate dai genitori dal portale"],
};

const Chan = ({ label, children }) => (
  <div className="flex min-w-[72px] flex-col items-center gap-1.5"><span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">{label}</span>{children}</div>
);

export const NotificationsSection = ({ data, onSaved }) => {
  const doctor = data.role === "doctor";
  const [busy, setBusy] = useState("");
  const toggle = async (cat, ch, v) => {
    setBusy(`${cat}-${ch}`);
    const next = { ...data.prefs[cat], [ch]: v };
    try { const prefs = await api.saveNotifyPrefs({ [cat]: next }); onSaved({ ...data, prefs }); toast.success("Preferenza salvata"); } catch (e) { toast.error(errMsg(e)); }
    setBusy("");
  };
  return (
    <Card id="account-notifications" icon={BellRing} title={doctor ? "Notifiche e avvisi" : "Preferenze di notifica"}
      text={doctor ? "Gli avvisi nella dashboard sono sempre attivi. Scelga per cosa ricevere anche un'email." : "Scelga come essere avvisato. Le email non contengono mai dati clinici."}>
      <ul className="divide-y divide-slate-100">
        {Object.entries(data.prefs).map(([cat, p]) => (
          <li key={cat} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between" data-testid={`notify-row-${cat}`}>
            <div className="min-w-0"><div className="font-medium text-night">{LABELS[cat]?.[0] ?? cat}</div><div className="text-xs text-slate-600">{LABELS[cat]?.[1]}</div></div>
            <div className="grid shrink-0 grid-cols-3 gap-2 sm:gap-5">
              <Chan label="Email"><Switch checked={p.email} disabled={busy === `${cat}-email`} onCheckedChange={(v) => toggle(cat, "email", v)} aria-label={`Email ${LABELS[cat]?.[0]}`} data-testid={`notify-${cat}-email`} /></Chan>
              <Chan label="In-App"><Switch checked={doctor ? true : p.inapp} disabled={doctor || busy === `${cat}-inapp`} onCheckedChange={(v) => toggle(cat, "inapp", v)} aria-label={`In-App ${LABELS[cat]?.[0]}`} data-testid={`notify-${cat}-inapp`} /></Chan>
              <Chan label="SMS"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600" data-testid={`notify-${cat}-sms`}>In arrivo</span></Chan>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
};
