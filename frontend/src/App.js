import { useEffect } from "react";
import Lenis from "lenis";
import "@/App.css";
import { Toaster } from "@/components/ui/sonner";
import { Loading } from "@/components/auth/BootScreens";
import Dashboard from "@/pages/Dashboard";
import Login from "@/pages/Login";
import Landing from "@/pages/Landing";
import Admin from "@/pages/Admin";
import Register from "@/pages/Register";
import DoctorShowcase from "@/pages/DoctorShowcase";
import Activate from "@/pages/Activate";
import ResetPassword from "@/pages/ResetPassword";
import Portal from "@/pages/Portal";
import Verify from "@/pages/Verify";
import Privacy from "@/pages/Privacy";
import LegalPlaceholder from "@/pages/LegalPlaceholder";
import SharedPassport from "@/pages/SharedPassport";
import { setClinics } from "@/lib/api";
import { setLenis, isScrollLocked, isScrollBox } from "@/lib/scrollLock";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { IdleWarning } from "@/components/dash/Security";


const Gate = () => {
  const { user } = useAuth();
  if (user === null) return <Loading />;
  if (!user) return <Login />;
  if (user.role === "admin") return <Navigate to="/admin" replace />;
  if (user.role === "parent") return <Navigate to="/portale" replace />;
  setClinics(user.clinics);
  return <><Dashboard /><IdleWarning /></>;
};

const PortalGate = () => {
  const { user } = useAuth();
  if (user === null) return <Loading />;
  if (!user) return <Login parent subtitle="Portale Paziente · pazienti e tutori" note="Referti, consensi e appuntamenti" />;
  return user.role === "parent" ? <><Portal /><IdleWarning /></> : <Navigate to={user.role === "admin" ? "/admin" : "/app"} replace />;
};

const AdminGate = () => {
  const { user } = useAuth();
  if (user === null) return <Loading />;
  if (!user) return <Login subtitle="Pannello Founder · accesso amministratore" note="Accesso riservato all'amministratore MantMed" signup={false} />;
  return user.role === "admin" ? <><Admin /><IdleWarning /></> : <Navigate to={user.role === "parent" ? "/portale" : "/app"} replace />;
};

const AccountGate = () => {
  const { user } = useAuth();
  if (user === null) return <Loading />;
  if (!user) return <Login subtitle="Area riservata · gestione account" note="Acceda per gestire profilo, sicurezza e notifiche" />;
  if (user.role === "admin") return <Navigate to="/admin" replace />;
  if (user.role === "doctor") return <Navigate to={`/app/area-personale${window.location.search}`} replace />;
  return <Navigate to={`/portale/impostazioni${window.location.search}`} replace />;
};

function App() {
  useEffect(() => {
    const lenis = new Lenis({ duration: 1.1, smoothWheel: true, prevent: (node) => isScrollLocked() || isScrollBox(node) });
    setLenis(lenis);
    let raf;
    const loop = (t) => { lenis.raf(t); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); setLenis(null); lenis.destroy(); };
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/app/:sezione?" element={<AuthProvider><Gate /></AuthProvider>} />
        <Route path="/admin" element={<AuthProvider><AdminGate /></AuthProvider>} />
        <Route path="/portale/:sezione?" element={<AuthProvider><PortalGate /></AuthProvider>} />
        <Route path="/registrati/medico" element={<Register key="doctor" role="doctor" />} />
        <Route path="/registrati/paziente" element={<Register key="parent" role="parent" />} />
        <Route path="/attiva" element={<Activate />} />
        <Route path="/medico/:slug" element={<DoctorShowcase />} />
        <Route path="/reimposta-password" element={<ResetPassword />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/privacy-policy" element={<LegalPlaceholder title="Privacy policy" />} />
        <Route path="/cookie-policy" element={<LegalPlaceholder title="Cookie policy" />} />
        <Route path="/verifica" element={<Verify />} />
        <Route path="/p/:token" element={<SharedPassport />} />
        <Route path="/area-riservata" element={<AuthProvider><AccountGate /></AuthProvider>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="top-center" offset={84} richColors />
    </BrowserRouter>
  );
}

export default App;
