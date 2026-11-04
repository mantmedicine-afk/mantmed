import { Syringe, LineChart, Stethoscope, HeartPulse } from "lucide-react";
import { Highlights } from "./Highlights";
import { Vaccines } from "./Vaccines";
import { PassportGrowth } from "./PassportGrowth";
import { VisitsTimeline, Bilanci } from "./Visits";
import { Label } from "./ui";

const H = ({ icon, children }) => <Label icon={icon} className="pt-4 !text-xs">{children}</Label>;

/** Contenuto del passaporto: uguale per il genitore e per il medico che apre la condivisione (sola lettura). */
export const PassportBody = ({ data, onPdf, onHide }) => (
  <div className="space-y-4" data-testid="passport-body">
    <Highlights s={data.summary} />
    <H icon={Syringe}>Vaccinazioni</H>
    <Vaccines v={data.vaccines} />
    {data.growth && <><H icon={LineChart}>Crescita</H><PassportGrowth g={data.growth} /></>}
    {data.visits && <><H icon={Stethoscope}>Cronologia delle visite</H><VisitsTimeline items={data.visits} onPdf={onPdf} onHide={onHide} /></>}
    {data.bilanci && <><H icon={HeartPulse}>Bilanci di salute</H><Bilanci b={data.bilanci} /></>}
  </div>
);
