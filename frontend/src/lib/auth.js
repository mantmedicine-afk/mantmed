import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { BootError } from "@/components/auth/BootScreens";

const AuthCtx = createContext(null);
const EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"];

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [bootError, setBootError] = useState(false);
  const [reason, setReason] = useState("");
  const [warnLeft, setWarnLeft] = useState(null);
  const last = useRef(Date.now());
  const lastPing = useRef(Date.now());

  const boot = useCallback(() => {
    setBootError(false);
    setUser(null);
    api.me()
      .catch((e) => { if (e.response?.status !== 401) throw e; return api.refresh(); })
      .then(setUser)
      .catch((e) => (e.response && e.response.status < 500 ? setUser(false) : setBootError(true)));
  }, []);

  useEffect(() => {
    boot();
    const onExpired = () => { setReason("La sessione è scaduta: accedi di nuovo."); setUser(false); };
    window.addEventListener("auth:expired", onExpired);
    return () => window.removeEventListener("auth:expired", onExpired);
  }, [boot]);

  const logout = useCallback(async (why = "") => {
    await api.logout().catch(() => {});
    setReason(why);
    setWarnLeft(null);
    setUser(false);
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    const idleMs = (user.idle_minutes ?? 10) * 60000;
    const onActivity = () => {
      last.current = Date.now();
      if (Date.now() - lastPing.current > 120000) { lastPing.current = Date.now(); api.ping().catch(() => {}); }
    };
    EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    const t = setInterval(() => {
      const left = idleMs - (Date.now() - last.current);
      if (left <= 0) logout("Sessione chiusa automaticamente per inattività, a tutela dei dati dei pazienti.");
      else setWarnLeft(left <= 60000 ? Math.ceil(left / 1000) : null);
    }, 1000);
    return () => { EVENTS.forEach((e) => window.removeEventListener(e, onActivity)); clearInterval(t); };
  }, [user, logout]);

  const stayActive = useCallback(async () => {
    last.current = Date.now();
    lastPing.current = Date.now();
    setWarnLeft(null);
    await api.ping().catch(() => {});
  }, []);

  const login = useCallback(async (email, password) => {
    const r = await api.login(email, password);
    if (r?.mfa_required) return { mfaToken: r.mfa_token };
    last.current = Date.now();
    setReason("");
    setUser(r);
    return { user: r };
  }, []);
  const verify2fa = useCallback(async (token, code) => {
    const u = await api.verify2fa(token, code);
    last.current = Date.now();
    setReason("");
    setUser(u);
    return u;
  }, []);

  return (
    <AuthCtx.Provider value={{ user, setUser, login, verify2fa, logout, reason, warnLeft, stayActive }}>{bootError ? <BootError onRetry={boot} /> : children}</AuthCtx.Provider>
  );
};

export const useAuth = () => useContext(AuthCtx);
