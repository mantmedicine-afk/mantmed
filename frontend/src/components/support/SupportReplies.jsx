import { useEffect, useState } from "react";
import { MailCheck, X } from "lucide-react";
import { api } from "@/lib/api";

/** Avviso in app quando il team MantMed risponde a un feedback o a una richiesta di supporto. */
export const SupportReplies = () => {
  const [items, setItems] = useState([]);
  useEffect(() => { api.supportReplies().then(setItems).catch(() => setItems([])); }, []);
  const dismiss = (id) => { setItems((xs) => xs.filter((x) => x.id !== id)); api.readSupportReply(id).catch(() => {}); };
  if (!items.length) return null;
  return (
    <div className="space-y-2" data-testid="support-replies">
      {items.map((x) => (
        <div key={x.id} className="flex items-start gap-3 rounded-2xl border border-[#C9D6FF] bg-[#F3F6FF] p-4 text-sm text-night" data-testid={`support-reply-${x.id}`}>
          <MailCheck size={18} className="mt-0.5 shrink-0 text-[#3B6CF6]" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">Il team MantMed ha risposto alla sua {x.kind_label.toLowerCase()}</div>
            <p className="mt-1 whitespace-pre-wrap text-slate-700">{x.reply?.text}</p>
            <p className="mt-1 truncate text-xs text-slate-500">Il suo messaggio: «{x.text}» · risposta inviata anche via email</p>
          </div>
          <button onClick={() => dismiss(x.id)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-white" aria-label="Segna come letto" data-testid={`support-reply-dismiss-${x.id}`}><X size={15} /></button>
        </div>
      ))}
    </div>
  );
};
