import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";

export const useTour = () => {
  const { user, setUser } = useAuth();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (user && user.tour_done === false) { const t = setTimeout(() => setOpen(true), 900); return () => clearTimeout(t); }
    return undefined;
  }, [user?.tour_done]); // eslint-disable-line react-hooks/exhaustive-deps
  const end = useCallback(() => {
    setOpen(false);
    if (user?.tour_done === false) { setUser((u) => (u ? { ...u, tour_done: true } : u)); api.saveTour(true).catch(() => {}); }
  }, [user?.tour_done, setUser]);
  return { open, start: () => setOpen(true), end };
};
