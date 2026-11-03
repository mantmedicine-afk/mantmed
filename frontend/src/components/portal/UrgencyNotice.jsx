import { useEffect, useState } from "react";
import { PhoneCall } from "lucide-react";
import { api } from "@/lib/api";

const FALLBACK = "I messaggi non sono un canale per le urgenze e potrebbero essere letti dopo alcune ore. Per situazioni urgenti telefona allo studio. In caso di emergenza chiama il 112/118; fuori dagli orari dello studio rivolgiti alla Guardia Medica.";

export const UrgencyNotice = ({ ownerId, patientId, className = "" }) => {
  const [text, setText] = useState(FALLBACK);
  useEffect(() => {
    if (!ownerId) return;
    api.portalAiNotice(ownerId, patientId).then((r) => setText(r.text)).catch(() => setText(FALLBACK));
  }, [ownerId, patientId]);
  return (
    <div role="note" className={`flex items-start gap-2.5 rounded-2xl border border-[var(--hair)] bg-[var(--sel)] px-4 py-3 text-xs leading-relaxed text-[var(--fg)] sm:text-sm ${className}`} data-testid="portal-urgency-notice">
      <PhoneCall size={16} className="mt-0.5 shrink-0 text-[var(--fg)]" />
      <p>{text}</p>
    </div>
  );
};
