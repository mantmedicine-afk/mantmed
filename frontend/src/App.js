import { useEffect } from "react";
import Lenis from "lenis";
import "@/App.css";
import { Toaster } from "@/components/ui/sonner";
import { Loader2 } from "lucide-react";
import Dashboard from "@/pages/Dashboard";
import Login from "@/pages/Login";
import { AuthProvider, useAuth } from "@/lib/auth";

const Gate = () => {
  const { user } = useAuth();
  if (user === null) return <div className="grid min-h-screen place-items-center bg-night" data-testid="auth-loading"><Loader2 className="animate-spin text-white" /></div>;
  return user ? <Dashboard /> : <Login />;
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
    <AuthProvider>
      <Gate />
      <Toaster position="top-center" richColors />
    </AuthProvider>
  );
}

export default App;
