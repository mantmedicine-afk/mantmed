import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Home, Landmark, Briefcase, Settings2 } from "lucide-react";
import { api } from "@/lib/api";
import { CashHome } from "./CashHome";
import { StsPanel } from "./StsPanel";
import { AccountantPanel } from "./AccountantPanel";
import { FiscalSettings } from "./FiscalSettings";
import { InvoiceDialog } from "./InvoiceDialog";
import { Seg } from "./ui";

const TABS = [
  { id: "home", label: "Home", icon: Home },
  { id: "sts", label: "Sistema TS", icon: Landmark },
  { id: "commercialista", label: "Per il commercialista", icon: Briefcase },
  { id: "impostazioni", label: "Impostazioni", icon: Settings2 },
];

export const CashSection = ({ refreshKey, onChange }) => {
  const { hash } = useLocation();
  const navigate = useNavigate();
  const tab = TABS.find((t) => `#cassa-${t.id}` === hash)?.id ?? "home";
  const [settings, setSettings] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [key, setKey] = useState(0);
  const loadSettings = useCallback(() => api.cashSettings().then(setSettings).catch(() => {}), []);
  useEffect(() => { loadSettings(); }, [loadSettings, refreshKey]);
  const changed = () => { setKey((k) => k + 1); loadSettings(); onChange?.(); };

  return (
    <section className="mx-auto max-w-[1440px] space-y-6 px-5 pb-12 lg:px-8" data-testid="cash-section">
      <div className="overflow-x-auto pb-1"><div className="min-w-[560px] max-w-3xl"><Seg value={tab} onChange={(id) => navigate(`/app/cassa#cassa-${id}`)} testid="cash-tab" layoutId="cash-tab-pill" options={TABS} /></div></div>
      {tab === "home" && <CashHome refreshKey={refreshKey + key} onNew={() => setDialog({})} onChange={changed} />}
      {tab === "sts" && <StsPanel refreshKey={refreshKey + key} />}
      {tab === "commercialista" && <AccountantPanel clinics={settings?.clinics ?? []} refreshKey={refreshKey + key} />}
      {tab === "impostazioni" && <FiscalSettings settings={settings} onSaved={(s) => { setSettings(s); onChange?.(); }} />}
      <InvoiceDialog open={!!dialog} source={dialog} settings={settings} onClose={() => setDialog(null)} onSaved={changed} />
    </section>
  );
};
