import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, RotateCw, WifiOff } from "lucide-react";
import { LogoMark } from "@/components/dash/Logo";

const Frame = ({ children, testid }) => (
  <div className="grain grid min-h-screen place-items-center bg-[#0A192F] px-5 text-center text-white" data-testid={testid}>
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="flex max-w-sm flex-col items-center">
      <div className="rounded-2xl border border-[#C9CCD3]/40 p-1.5"><LogoMark size={48} /></div>
      <div className="mt-4 font-display text-3xl">MantMed</div>
      {children}
    </motion.div>
  </div>
);

export const Loading = () => {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSlow(true), 4000); return () => clearTimeout(t); }, []);
  return (
    <Frame testid="auth-loading">
      <p className="mt-5 flex items-center gap-2 text-sm text-[#C9CCD3]"><Loader2 size={15} className="animate-spin" /> Verifica della sessione…</p>
      {slow && <p className="mt-2 text-xs text-slate-400" data-testid="auth-loading-slow">La connessione è più lenta del solito, ancora un istante.</p>}
    </Frame>
  );
};

export const BootError = ({ onRetry }) => (
  <Frame testid="auth-boot-error">
    <WifiOff className="mt-6 text-[#C9CCD3]" size={26} />
    <h1 className="mt-3 font-display text-2xl">Connessione non riuscita</h1>
    <p className="mt-2 text-sm text-slate-300">Non riusciamo a raggiungere il server MantMed. Verifichi la connessione e riprovi.</p>
    <button onClick={onRetry} className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-[#0A192F] transition-transform hover:-translate-y-0.5" data-testid="auth-boot-retry">
      <RotateCw size={15} /> Riprova
    </button>
  </Frame>
);
