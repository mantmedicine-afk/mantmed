import { useState } from "react";
import { Loader2, PersonStanding } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api, errMsg } from "@/lib/api";
import { CAT, VIEWS } from "@/lib/bodychart";

export const PortalBodychart = ({ cid }) => {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const show = async () => {
    setOpen(true);
    if (d) return;
    try { setD(await api.portalBodychart(cid)); } catch (e) { setErr(errMsg(e)); }
  };
  const markers = Array.isArray(d?.markers) ? d.markers : [];
  return (
    <>
      <button onClick={show} className="flex h-10 items-center gap-2 rounded-full border border-slate-200 px-4 text-sm font-medium text-night transition-colors hover:border-night" data-testid={`portal-report-bodychart-${cid}`}><PersonStanding size={14} /> Bodychart</button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl bg-white sm:max-w-3xl" data-testid="portal-bodychart-dialog">
          <DialogHeader>
            <DialogTitle className="font-display text-3xl font-normal text-night">Bodychart della visita</DialogTitle>
            <DialogDescription className="text-sm text-slate-600">La mappa corporea compilata dal medico. Per chiarimenti scriva allo studio dalla sezione Messaggi.</DialogDescription>
          </DialogHeader>
          {err && <p className="text-sm text-rose-700">{err}</p>}
          {!d && !err && <Loader2 className="animate-spin text-night" />}
          {d?.snapshot && <img src={d.snapshot} alt="Bodychart della visita" className="w-full rounded-2xl ring-1 ring-slate-200" data-testid="portal-bodychart-image" />}
          {markers.length > 0 && (
            <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="portal-bodychart-legend">
              {markers.map((m, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-night">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: CAT[m.cat]?.color }}>{i + 1}</span>
                  <span><span className="font-medium">{CAT[m.cat]?.label}</span> · {VIEWS.find((v) => v.id === m.view)?.label}{m.note ? <span className="block text-slate-600">{m.note}</span> : null}</span>
                </li>
              ))}
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
