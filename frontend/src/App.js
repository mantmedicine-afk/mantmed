import { useEffect } from "react";
import Lenis from "lenis";
import "@/App.css";
import { Toaster } from "@/components/ui/sonner";
import { Loader2 } from "lucide-react";
import Dashboard from "@/pages/Dashboard";
import Login from "@/pages/Login";
import Landing from "@/pages/Landing";
import Admin from "@/pages/Admin";
import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { IdleWarning } from "@/components/dash/Security";

const Loading = () => <div className="grid min-h-screen place-items-center bg-night" data-testid="auth-loading"><Loader2 className="animate-spin text-white" /></div>;

const WrongArea = ({ to, label }) => {
  const { logout } = useAuth();
  return (
    <div className="grid min-h-screen place-items-center bg-[#0A192F] px-5 text-center text-white" data-testid="wrong-area">
      <div className="max-w-sm">
        <h1 className="font-display text-4xl">Area non disponibile</h1>
        <p className="mt-3 text-sm text-[#C9CCD3]">Questo account non ha accesso a quest'area.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link to={to} className="h-11 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#0A192F]" data-testid="wrong-area-go">{label}</Link>
          <button onClick={() => logout()} className="h-11 rounded-full border border-[#C9CCD3]/40 px-5 text-sm" data-testid="wrong-area-logout">Esci</button>
        </div>
      </div>
    </div>
  );
};

const Gate = () => {
  const { user } = useAuth();
  if (user === null) return <Loading />;
  if (!user) return <Login />;
  return user.role === "admin" ? <WrongArea to="/admin" label="Vai al Pannello Founder" /> : <><Dashboard /><IdleWarning /></>;
};

const AdminGate = () => {
  const { user } = useAuth();
  if (user === null) return <Loading />;
  if (!user) return <Login subtitle="Pannello Founder · accesso amministratore" />;
  return user.role === "admin" ? <><Admin /><IdleWarning /></> : <WrongArea to="/app" label="Vai alla dashboard" />;
};

function App() {
  useEffect(() => {
    const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    let raf;
    const loop = (t) => { lenis.raf(t); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); lenis.destroy(); };
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/app" element={<AuthProvider><Gate /></AuthProvider>} />
        <Route path="/admin" element={<AuthProvider><AdminGate /></AuthProvider>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="top-center" richColors />
    </BrowserRouter>
  );
}

export default App;
