import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const KEY = "mantmed.theme";
const current = () => document.documentElement.dataset.theme === "dark" ? "dark" : "light";

const useTheme = () => {
  const [theme, setTheme] = useState(current);
  useEffect(() => {
    const sync = () => setTheme(current());
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const sys = (e) => { if (!localStorage.getItem(KEY)) document.documentElement.dataset.theme = e.matches ? "dark" : "light"; };
    mq.addEventListener("change", sys);
    return () => { mo.disconnect(); mq.removeEventListener("change", sys); };
  }, []);
  const toggle = () => { const t = theme === "dark" ? "light" : "dark"; localStorage.setItem(KEY, t); document.documentElement.dataset.theme = t; };
  return [theme, toggle];
};

export const ThemeToggle = ({ floating = false }) => {
  const [theme, toggle] = useTheme();
  const dark = theme === "dark";
  return (
    <button onClick={toggle} aria-label={dark ? "Passa alla modalità giorno" : "Passa alla modalità notte"} title={dark ? "Modalità giorno" : "Modalità notte"} aria-pressed={dark}
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--hair)] bg-[var(--raised)] text-[var(--fg)] transition-colors hover:border-[var(--accent)] ${floating ? "fixed right-4 top-4 z-[60]" : ""}`} data-testid="theme-toggle-btn">
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
};
